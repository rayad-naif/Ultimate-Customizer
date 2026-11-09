'use strict';
/* AFTER-HOURS RESPONDER - when a message arrives outside business hours (or
   on a holiday), the contact gets an instant reply on the same channel that
   says when you'll be back. One reply per contact per cooldown. */
const { getContact, addTags, hasTag, render, sendMessage, tz } = require('./util');
const { isOpen, localParts, defaultHours, DAYS } = require('../schema');

const CHANNELS = [
  { value: 'SMS', label: 'SMS' }, { value: 'WhatsApp', label: 'WhatsApp' }, { value: 'Email', label: 'Email' },
  { value: 'FB', label: 'Facebook Messenger' }, { value: 'IG', label: 'Instagram DM' }, { value: 'GMB', label: 'Google Business chat' },
  { value: 'Live_Chat', label: 'Website chat widget' }
];
const ALIASES = { SMS: 'SMS', WHATSAPP: 'WhatsApp', EMAIL: 'Email', FB: 'FB', FACEBOOK: 'FB', IG: 'IG', INSTAGRAM: 'IG', GMB: 'GMB', LIVE_CHAT: 'Live_Chat', WEBCHAT: 'Live_Chat', LIVECHAT: 'Live_Chat' };

const fields = [
  { key: 'enabled', type: 'bool', label: 'Auto-reply is on', default: true },
  { key: 'timezone', type: 'timezone', label: 'Time zone', default: '', help: 'Empty = the sub-account’s time zone. Example: America/New_York' },
  { key: 'hours', type: 'hours', label: 'Business hours', default: defaultHours(), help: 'Messages outside these hours get the reply. A day that is off is closed all day.' },
  { key: 'holidays', type: 'dates', label: 'Closed dates (YYYY-MM-DD, one per line)', default: [] },
  { key: 'channels', type: 'multiselect', label: 'Reply on', default: ['SMS', 'WhatsApp', 'FB', 'IG', 'GMB', 'Live_Chat'], options: CHANNELS },
  { key: 'message', type: 'textarea', max: 1000, label: 'Reply', default: 'Hi {{first_name}}, thanks for your message! Our team is away right now and will get back to you {{next_open}}. - {{business}}', help: 'Merge fields: {{first_name}} {{full_name}} {{business}} {{next_open}}' },
  { key: 'email_subject', type: 'text', max: 150, label: 'Email subject', default: 'We got your message' },
  { key: 'cooldown_hours', type: 'int', label: 'Reply to the same contact at most once every (hours)', default: 12, min: 1, max: 168 },
  { key: 'add_tag', type: 'tag', label: 'Tag contacts who got the reply', default: 'after-hours-lead', help: 'Empty = no tag. Use it to build a "call back first thing" list.' },
  { key: 'skip_tag', type: 'tag', label: 'Never reply to contacts with this tag', default: 'no-autoreply' }
];

const fmtTime = (hm) => {
  let [h, m] = hm.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return h + (m ? ':' + String(m).padStart(2, '0') : '') + ' ' + ap;
};
const DAY_NAMES = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

function closedNow(s, zone, now) {
  if (s.holidays.includes(localParts(now, zone).ymd)) return true;
  return !isOpen(s.hours, zone, now);
}

/* "today at 9 AM", "tomorrow at 9 AM", "on Monday at 9 AM", or "as soon as we can". */
function nextOpen(s, zone, now) {
  const today = localParts(now, zone);
  for (let k = 0; k <= 14; k++) {
    const p = localParts(new Date(now.getTime() + k * 86400e3), zone);
    const h = s.hours[p.day];
    if (!h || !h.on || s.holidays.includes(p.ymd)) continue;
    if (k === 0 && today.hm >= h.from) continue;
    const when = k === 0 ? 'today' : k === 1 ? 'tomorrow' : 'on ' + DAY_NAMES[p.day];
    return when + ' at ' + fmtTime(h.from);
  }
  return 'as soon as we can';
}

async function onEvent(evt, ctx, now) {
  const s = ctx.settings;
  if (!s.enabled || evt.type !== 'InboundMessage' || !evt.contactId) return;
  if (evt.direction && evt.direction !== 'inbound') return;
  const channel = ALIASES[String(evt.messageType || '').toUpperCase().replace(/^TYPE_/, '')];
  if (!channel || !s.channels.includes(channel)) return;
  now = now || new Date();
  const zone = tz(s.timezone, ctx.inst);
  if (!closedNow(s, zone, now)) return;
  if (!(await ctx.kv.setNX('cool:' + evt.contactId, 1, s.cooldown_hours * 3600))) return;

  const contact = await getContact(ctx.api, evt.contactId);
  if (hasTag(contact, s.skip_tag) || contact.dnd) return;
  const text = render(s.message, contact, ctx.inst, { next_open: nextOpen(s, zone, now) });
  try {
    await sendMessage(ctx.api, evt.contactId, channel, text, render(s.email_subject, contact, ctx.inst));
  } catch (e) {
    await ctx.kv.del('cool:' + evt.contactId); // let the next message try again
    throw e;
  }
  if (s.add_tag) await addTags(ctx.api, evt.contactId, [s.add_tag]);
  await ctx.action('replied on ' + channel, evt.contactId);
}

module.exports = {
  slug: 'after-hours',
  envPrefix: 'AFTER_HOURS',
  name: 'After-Hours Responder',
  icon: '🌙',
  color: '#9254de',
  tagline: 'Never leave a lead on read after closing time.',
  description: 'Replies instantly to SMS, WhatsApp, email, Facebook, Instagram, Google and web-chat messages that arrive outside business hours or on holidays, on the same channel, telling the lead exactly when you will be back.',
  features: [
    ['Every channel', 'SMS, WhatsApp, email, Facebook, Instagram, Google Business and the chat widget, each switchable.'],
    ['Knows when you open', '{{next_open}} becomes "tomorrow at 9 AM" or "on Monday at 10 AM" from your hours and holidays.'],
    ['Polite by design', 'One reply per contact per cooldown, skips DND and contacts with your opt-out tag.'],
    ['Call-back list', 'Tags everyone who wrote after hours so your team starts the day with them.']
  ],
  scopes: ['contacts.readonly', 'contacts.write', 'conversations.readonly', 'conversations.write', 'conversations/message.readonly', 'conversations/message.write', 'locations.readonly'],
  webhookEvents: ['InboundMessage'],
  fields,
  onEvent,
  _test: { nextOpen, closedNow, DAYS }
};
