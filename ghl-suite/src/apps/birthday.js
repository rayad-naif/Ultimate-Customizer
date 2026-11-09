'use strict';
/* BIRTHDAY GREETER - every day, contacts whose birthday it is get a personal
   SMS and/or email, plus a "birthday-today" tag for one day so workflows can
   send a coupon or alert the team. Birthdays are indexed from contact
   webhooks, and existing contacts are imported with one click. */
const { getContact, addTags, removeTags, hasTag, render, sendMessage, tz } = require('./util');
const { localParts } = require('../schema');

const fields = [
  { key: 'enabled', type: 'bool', label: 'Birthday messages are on', default: true },
  { key: 'channel', type: 'select', label: 'Send by', default: 'SMS', options: [{ value: 'SMS', label: 'SMS' }, { value: 'Email', label: 'Email' }, { value: 'both', label: 'SMS and email' }, { value: 'none', label: 'Don’t send, only tag' }] },
  { key: 'message', type: 'textarea', max: 1000, label: 'Message', default: 'Happy birthday, {{first_name}}! 🎉 Everyone at {{business}} wishes you an amazing year ahead.', help: 'Merge fields: {{first_name}} {{full_name}} {{business}} {{age}}' },
  { key: 'email_subject', type: 'text', max: 150, label: 'Email subject', default: 'Happy birthday, {{first_name}}! 🎂' },
  { key: 'tag', type: 'tag', label: 'Tag for the day', default: 'birthday-today', help: 'Added on the birthday and removed the next day. Trigger a coupon workflow from it.' },
  { key: 'skip_tags', type: 'tags', label: 'Skip contacts with any of these tags', default: ['no-birthday', 'customer-lost'] },
  { key: 'timezone', type: 'timezone', label: 'Time zone', default: '', help: 'Empty = the sub-account’s time zone. Messages go out once a day around 15:00 UTC.' }
];

/* "1990-05-17", "1990-05-17T00:00:00.000Z", "05/17/1990", epoch ms -> "05-17" */
function monthDay(dob) {
  if (dob == null || dob === '') return null;
  let m, d;
  if (typeof dob === 'number' || /^\d{9,}$/.test(String(dob))) {
    const x = new Date(Number(dob));
    if (isNaN(x)) return null;
    m = x.getUTCMonth() + 1; d = x.getUTCDate();
  } else {
    const s = String(dob);
    let r = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (r) { m = +r[2]; d = +r[3]; } else if ((r = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/))) { m = +r[1]; d = +r[2]; } else return null;
  }
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}
const birthYear = (dob) => { const r = String(dob || '').match(/^(\d{4})-/); return r ? +r[1] : null; };

async function index(ctx, contactId, dob) {
  const md = monthDay(dob);
  const old = await ctx.kv.get('bdc:' + contactId);
  if (old && old !== md) await ctx.kv.del('bd:' + old + ':' + contactId);
  if (md) {
    await ctx.kv.set('bd:' + md + ':' + contactId, 1);
    await ctx.kv.set('bdc:' + contactId, md);
  } else if (old) await ctx.kv.del('bdc:' + contactId);
  return !!md;
}

async function onEvent(evt, ctx) {
  if (evt.type === 'ContactCreate' || evt.type === 'ContactUpdate') {
    if (evt.id && 'dateOfBirth' in evt) await index(ctx, evt.id, evt.dateOfBirth);
  } else if (evt.type === 'ContactDelete' && evt.id) {
    await index(ctx, evt.id, null);
  }
}

const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

async function daily(ctx, deadline, now) {
  const s = ctx.settings;
  now = now || new Date();
  const zone = tz(s.timezone, ctx.inst);
  const today = localParts(now, zone);

  // Yesterday's tags come off first.
  if (s.tag) {
    for (const { key, value } of await ctx.kv.list('tagged:', 500)) {
      if (value === today.ymd) continue;
      const id = key.slice('tagged:'.length);
      await removeTags(ctx.api, id, [s.tag]).catch(() => null);
      await ctx.kv.del(key);
    }
  }
  if (!s.enabled) return;

  const days = [today.md];
  if (today.md === '02-28' && !isLeap(+today.ymd.slice(0, 4))) days.push('02-29');
  let sent = 0;
  for (const md of days) {
    for (const { key } of await ctx.kv.list('bd:' + md + ':', 1000)) {
      if (Date.now() > deadline) return ctx.log('daily_partial', 'stopped at the time limit after ' + sent + ' birthdays');
      const id = key.split(':').pop();
      if (!(await ctx.kv.setNX('sent:' + today.ymd + ':' + id, 1, 3 * 86400))) continue;
      let c;
      try { c = await getContact(ctx.api, id); } catch (e) {
        if (e.status === 404 || e.status === 400) { await index(ctx, id, null); continue; }
        throw e;
      }
      if (monthDay(c.dateOfBirth) !== md) { await index(ctx, id, c.dateOfBirth); continue; } // DOB changed
      if (s.skip_tags.some((t) => hasTag(c, t))) continue;
      const year = birthYear(c.dateOfBirth);
      const vars = { age: year ? String(+today.ymd.slice(0, 4) - year) : '' };
      const text = render(s.message, c, ctx.inst, vars);
      const subject = render(s.email_subject, c, ctx.inst, vars);
      const chans = s.channel === 'both' ? ['SMS', 'Email'] : s.channel === 'none' ? [] : [s.channel];
      for (const ch of chans) {
        if (ch === 'SMS' && !c.phone) continue;
        if (ch === 'Email' && !c.email) continue;
        try { await sendMessage(ctx.api, id, ch, text, subject); } catch (e) { await ctx.log('send_failed', id + ' ' + ch + ': ' + e.message); }
      }
      if (s.tag) {
        await addTags(ctx.api, id, [s.tag]);
        await ctx.kv.set('tagged:' + id, today.ymd, 3 * 86400);
      }
      sent++;
      await ctx.action('birthday ' + (chans.join('+') || 'tag only'), id);
    }
  }
}

/* Import birthdays of existing contacts, 100 per page, resumable. */
async function importContacts(ctx, deadline) {
  const st = (await ctx.kv.get('import')) || { page: 1, scanned: 0, found: 0, done: false };
  if (st.done) Object.assign(st, { page: 1, scanned: 0, found: 0, done: false });
  while (Date.now() < deadline) {
    const j = await ctx.api.post('/contacts/search', { locationId: ctx.inst.locationId, pageLimit: 100, page: st.page });
    const list = j.contacts || [];
    for (const c of list) { st.scanned++; if (await index(ctx, c.id, c.dateOfBirth)) st.found++; }
    st.page++;
    if (list.length < 100 || st.page > 100) { st.done = true; break; }
  }
  await ctx.kv.set('import', st);
  await ctx.log('import', st.scanned + ' contacts scanned, ' + st.found + ' birthdays' + (st.done ? '' : ' (continue to import more)'));
  return { scanned: st.scanned, found: st.found, done: st.done };
}

module.exports = {
  slug: 'birthday-greeter',
  envPrefix: 'BIRTHDAY_GREETER',
  name: 'Birthday Greeter',
  icon: '🎂',
  color: '#f759ab',
  tagline: 'A personal birthday message for every contact, every year.',
  description: 'Sends each contact a personal birthday SMS and/or email on the day, in your sub-account’s time zone, and tags them for 24 hours so your workflows can add a coupon or a call task. Set it once, delight customers forever.',
  features: [
    ['Automatic every day', 'Runs daily in your time zone. Leap-day birthdays are greeted on Feb 28.'],
    ['SMS, email or both', 'Personal merge fields: first name, business name, even their new age.'],
    ['Workflow-ready tag', '"birthday-today" is added on the day and removed the next, so any workflow can react.'],
    ['One-click import', 'Index the birthdays of the contacts you already have; new and edited contacts are tracked live.']
  ],
  scopes: ['contacts.readonly', 'contacts.write', 'conversations.readonly', 'conversations.write', 'conversations/message.readonly', 'conversations/message.write', 'locations.readonly'],
  webhookEvents: ['ContactCreate', 'ContactUpdate', 'ContactDelete'],
  fields,
  onEvent,
  daily,
  actions: { import: { label: 'Import birthdays of existing contacts', run: importContacts } },
  _test: { monthDay }
};
