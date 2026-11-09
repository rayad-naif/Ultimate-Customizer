'use strict';
/* CONTACT CLEANER - every new contact is tidied the moment it arrives:
   names in proper case, emails lower case, phones in +E.164, and possible
   duplicates and junk sign-ups are tagged for review. */
const { addTags, addNote } = require('./util');

const COUNTRIES = [
  ['US', '1', 10, 'United States / Canada (+1)'], ['GB', '44', 10, 'United Kingdom (+44)'], ['AU', '61', 9, 'Australia (+61)'],
  ['NZ', '64', 9, 'New Zealand (+64)'], ['IE', '353', 9, 'Ireland (+353)'], ['IN', '91', 10, 'India (+91)'],
  ['PK', '92', 10, 'Pakistan (+92)'], ['AE', '971', 9, 'United Arab Emirates (+971)'], ['ZA', '27', 9, 'South Africa (+27)'],
  ['DE', '49', 0, 'Germany (+49)'], ['FR', '33', 9, 'France (+33)'], ['ES', '34', 9, 'Spain (+34)'], ['IT', '39', 0, 'Italy (+39)'],
  ['NL', '31', 9, 'Netherlands (+31)'], ['MX', '52', 10, 'Mexico (+52)'], ['BR', '55', 0, 'Brazil (+55)'], ['PH', '63', 10, 'Philippines (+63)'],
  ['SG', '65', 8, 'Singapore (+65)'], ['NG', '234', 10, 'Nigeria (+234)'], ['SA', '966', 9, 'Saudi Arabia (+966)']
];
const DISPOSABLE = ['mailinator.com', 'guerrillamail.com', '10minutemail.com', 'tempmail.com', 'temp-mail.org', 'yopmail.com', 'trashmail.com',
  'getnada.com', 'sharklasers.com', 'dispostable.com', 'throwawaymail.com', 'maildrop.cc', 'fakeinbox.com', 'mintemail.com', 'example.com'];
const JUNK_NAMES = /^(test|testing|asdf+|qwerty|aaa+|xxx+|abc|na|n\/a|none|fake|no name|unknown|sdf+|jkl)$/i;

const fields = [
  { key: 'enabled', type: 'bool', label: 'Cleaning is on', default: true },
  { key: 'fix_names', type: 'bool', label: 'Proper-case names ("jOHN smith" → "John Smith")', default: true, group: 'Formatting', help: 'Names that already mix case on purpose (McDonald, DeShawn) are left alone.' },
  { key: 'fix_email', type: 'bool', label: 'Trim and lower-case emails', default: true, group: 'Formatting' },
  { key: 'fix_phone', type: 'bool', label: 'Format phones as +E.164', default: true, group: 'Formatting', help: 'Needed for SMS delivery and duplicate matching.' },
  { key: 'country', type: 'select', label: 'Default country for phones without a + code', default: 'US', options: COUNTRIES.map((c) => ({ value: c[0], label: c[3] })), group: 'Formatting' },
  { key: 'flag_duplicates', type: 'bool', label: 'Tag possible duplicates (same email or phone)', default: true, group: 'Review' },
  { key: 'duplicate_tag', type: 'tag', label: 'Duplicate tag', default: 'possible-duplicate', group: 'Review' },
  { key: 'flag_junk', type: 'bool', label: 'Tag junk sign-ups (test names, throwaway emails, bad phones)', default: true, group: 'Review' },
  { key: 'junk_tag', type: 'tag', label: 'Junk tag', default: 'junk-lead', group: 'Review' },
  { key: 'add_notes', type: 'bool', label: 'Add a note explaining each flag', default: true, group: 'Review' }
];

function properCase(name) {
  // Word by word: "McDonald" / "DeShawn" (capital first, mixed case) look intentional.
  return String(name || '').trim().replace(/\s+/g, ' ').split(' ').map((w) => {
    const mixed = w !== w.toLowerCase() && w !== w.toUpperCase();
    if (mixed && w[0] === w[0].toUpperCase()) return w;
    return w.toLowerCase().replace(/(^|[\-'’])([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase());
  }).join(' ');
}

/* Returns +E.164 or null when the number can't be valid. */
function e164(phone, countryCode) {
  const raw = String(phone || '').trim();
  if (!raw) return null;
  let d = raw.replace(/[^\d+]/g, '');
  if (d.startsWith('00')) d = '+' + d.slice(2);
  if (d.startsWith('+')) d = '+' + d.slice(1).replace(/\D/g, '');
  else {
    const c = COUNTRIES.find((x) => x[0] === countryCode) || COUNTRIES[0];
    const [, cc, len] = c;
    d = d.replace(/\D/g, '');
    if (d.startsWith(cc) && (!len || d.length === cc.length + len)) d = '+' + d;
    else { if (d.startsWith('0') && cc !== '1') d = d.slice(1); d = '+' + cc + d; }
  }
  const digits = d.length - 1;
  return digits >= 8 && digits <= 15 ? d : null;
}

function junkReasons(c) {
  const why = [];
  const email = String(c.email || '').toLowerCase().trim();
  const domain = email.split('@')[1] || '';
  if (domain && DISPOSABLE.includes(domain)) why.push('throwaway email domain ' + domain);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) why.push('email is not valid');
  if (JUNK_NAMES.test(String(c.firstName || '').trim()) || JUNK_NAMES.test(String(c.lastName || '').trim())) why.push('test or placeholder name');
  if (c.phone && /^\+?(\d)\1{6,}$/.test(String(c.phone).replace(/[^\d+]/g, ''))) why.push('phone is a repeated digit');
  return why;
}

async function findDuplicate(ctx, contact) {
  const found = [];
  for (const [k, v] of [['email', contact.email], ['number', contact.phone]]) {
    if (!v) continue;
    try {
      const j = await ctx.api.get('/contacts/search/duplicate', { locationId: ctx.inst.locationId, [k]: v });
      const d = j.contact;
      if (d && d.id && d.id !== contact.id) found.push({ by: k === 'number' ? 'phone' : 'email', id: d.id, name: ((d.firstName || '') + ' ' + (d.lastName || '')).trim() || d.email || d.phone || d.id });
    } catch (e) { /* missing scope or API hiccup: skip */ }
    if (found.length) break;
  }
  return found[0] || null;
}

async function onEvent(evt, ctx) {
  const s = ctx.settings;
  if (!s.enabled || evt.type !== 'ContactCreate' || !evt.id) return;
  const c = evt;
  const update = {};
  if (s.fix_names) {
    for (const k of ['firstName', 'lastName']) { const v = properCase(c[k]); if (c[k] && v !== c[k]) update[k] = v; }
  }
  if (s.fix_email && c.email) { const v = String(c.email).trim().toLowerCase(); if (v !== c.email) update.email = v; }
  let badPhone = false;
  if (s.fix_phone && c.phone) {
    const v = e164(c.phone, s.country);
    if (!v) badPhone = true; else if (v !== c.phone) update.phone = v;
  }
  const cleaned = Object.assign({}, c, update);
  if (Object.keys(update).length) {
    try {
      await ctx.api.put('/contacts/' + encodeURIComponent(c.id), update);
      await ctx.action('cleaned ' + Object.keys(update).join(', '), c.id);
    } catch (e) {
      await ctx.log('update_failed', c.id + ': ' + e.message);
    }
  }
  const tags = [], notes = [];
  if (s.flag_duplicates && s.duplicate_tag) {
    const d = await findDuplicate(ctx, cleaned);
    if (d) { tags.push(s.duplicate_tag); notes.push('Possible duplicate of ' + d.name + ' (same ' + d.by + ', contact ' + d.id + ').'); }
  }
  if (s.flag_junk && s.junk_tag) {
    const why = junkReasons(cleaned);
    if (badPhone) why.push('phone number is not valid');
    if (why.length) { tags.push(s.junk_tag); notes.push('Looks like a junk sign-up: ' + why.join('; ') + '.'); }
  }
  if (tags.length) {
    await addTags(ctx.api, c.id, tags);
    if (s.add_notes) await addNote(ctx.api, c.id, 'Contact Cleaner: ' + notes.join(' '));
    await ctx.action('flagged ' + tags.join(', '), c.id);
  }
}

module.exports = {
  slug: 'contact-cleaner',
  envPrefix: 'CONTACT_CLEANER',
  name: 'Contact Cleaner',
  icon: '🧹',
  color: '#73d13d',
  tagline: 'Clean data in, every single time.',
  description: 'Fixes every new contact the moment it is created: proper-case names, lower-case emails and +E.164 phone numbers, then tags possible duplicates and junk sign-ups so your list, your SMS deliverability and your reports stay clean.',
  features: [
    ['Proper names', '"jOHN SMITH" becomes "John Smith" so merge fields look professional.'],
    ['Phones that text', 'Local numbers become +E.164 using your default country, so SMS sends and duplicates match.'],
    ['Duplicate alerts', 'New contacts sharing an email or phone with an existing one are tagged with a note linking the original.'],
    ['Junk filter', 'Test names, throwaway email domains and fake phone numbers are tagged for review.']
  ],
  scopes: ['contacts.readonly', 'contacts.write', 'locations.readonly'],
  webhookEvents: ['ContactCreate'],
  fields,
  onEvent,
  _test: { properCase, e164, junkReasons }
};
