'use strict';
/* Helpers shared by the apps. `api` is the sub-account client from ghl.js. */

const enc = encodeURIComponent;

async function getContact(api, id) {
  const j = await api.get('/contacts/' + enc(id));
  return j.contact || j;
}
const addTags = (api, id, tags) => (tags.filter(Boolean).length ? api.post('/contacts/' + enc(id) + '/tags', { tags: tags.filter(Boolean) }) : null);
const removeTags = (api, id, tags) => (tags.filter(Boolean).length ? api.del('/contacts/' + enc(id) + '/tags', { tags: tags.filter(Boolean) }) : null);
const addNote = (api, id, body) => api.post('/contacts/' + enc(id) + '/notes', { body: String(body).slice(0, 5000) });
const hasTag = (contact, tag) => !!tag && (contact.tags || []).some((t) => String(t).toLowerCase() === tag.toLowerCase());

/* {{first_name}}, {{last_name}}, {{full_name}}, {{business}} and any extra vars. */
function render(template, contact, inst, extra) {
  const first = (contact && (contact.firstName || contact.firstNameRaw)) || '';
  const last = (contact && (contact.lastName || contact.lastNameRaw)) || '';
  const vars = Object.assign({
    first_name: first || 'there',
    last_name: last,
    full_name: (first + ' ' + last).trim() || 'there',
    business: (inst && inst.name) || 'our team'
  }, extra || {});
  return String(template || '').replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (m, k) => (vars[k.toLowerCase()] != null ? String(vars[k.toLowerCase()]) : ''));
}

const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const textToHtml = (s) => '<div>' + escHtml(s).replace(/\n/g, '<br>') + '</div>';

/* Send a message on a channel. type: SMS, Email, WhatsApp, FB, IG, GMB, Live_Chat */
function sendMessage(api, contactId, type, text, subject) {
  const body = { type, contactId, message: text };
  if (type === 'Email') { body.subject = subject || 'A message for you'; body.html = textToHtml(text); }
  return api.post('/conversations/messages', body);
}

const tz = (settingsTz, inst) => settingsTz || (inst && inst.timezone) || 'UTC';

module.exports = { getContact, addTags, removeTags, addNote, hasTag, render, sendMessage, tz, textToHtml };
