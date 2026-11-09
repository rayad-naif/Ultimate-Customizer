'use strict';
/* ROUND ROBIN - new contacts and opportunities are shared out between the
   team by weight (a weight of 3 gets three leads for every one at weight 1). */
const { getContact, addNote, hasTag } = require('./util');

const fields = [
  { key: 'enabled', type: 'bool', label: 'Assigning is on', default: true },
  { key: 'weights', type: 'weights', label: 'Team members in the rotation', default: {}, help: '0 = not in the rotation. Higher numbers get more leads (3 gets three for every one at 1).', optionsFrom: 'users' },
  { key: 'assign_contacts', type: 'bool', label: 'Assign new contacts', default: true, group: 'What to assign' },
  { key: 'assign_opportunities', type: 'bool', label: 'Assign new opportunities', default: false, group: 'What to assign', help: 'An opportunity goes to the contact’s owner when it has one, so a lead keeps one rep.' },
  { key: 'only_unassigned', type: 'bool', label: 'Skip records that already have an owner', default: true, group: 'Rules' },
  { key: 'only_tag', type: 'tag', label: 'Only contacts with this tag', default: '', group: 'Rules', help: 'Empty = every new contact.' },
  { key: 'add_note', type: 'bool', label: 'Add a note saying who was assigned', default: false, group: 'Rules' }
];

/* Smooth weighted order: A:3 B:1 -> A A B A, not A A A B. */
function rotation(weights) {
  const ids = Object.keys(weights).filter((id) => weights[id] > 0).sort();
  const total = ids.reduce((n, id) => n + weights[id], 0);
  const cur = Object.fromEntries(ids.map((id) => [id, 0]));
  const seq = [];
  for (let i = 0; i < total; i++) {
    let best = null;
    for (const id of ids) { cur[id] += weights[id]; if (best === null || cur[id] > cur[best]) best = id; }
    cur[best] -= total;
    seq.push(best);
  }
  return seq;
}

async function nextUser(ctx) {
  const seq = rotation(ctx.settings.weights);
  if (!seq.length) return null;
  const n = await ctx.kv.incr('counter', 1);
  return seq[(n - 1) % seq.length];
}

async function users(ctx) {
  const j = await ctx.api.get('/users/', { locationId: ctx.inst.locationId });
  return (j.users || []).filter((u) => !u.deleted).map((u) => ({
    id: u.id, name: (u.name || ((u.firstName || '') + ' ' + (u.lastName || '')).trim() || u.email || u.id), email: u.email || ''
  }));
}

async function assignContact(ctx, contactId, userId, why) {
  await ctx.api.put('/contacts/' + encodeURIComponent(contactId), { assignedTo: userId });
  if (ctx.settings.add_note) await addNote(ctx.api, contactId, 'Assigned by Round Robin (' + why + ').');
  await ctx.action('contact → ' + userId, contactId);
}

async function onEvent(evt, ctx) {
  const s = ctx.settings;
  if (!s.enabled) return;
  if (evt.type === 'ContactCreate' && s.assign_contacts) {
    if (s.only_unassigned && evt.assignedTo) return;
    if (s.only_tag && !hasTag(evt, s.only_tag)) return;
    const u = await nextUser(ctx);
    if (u) await assignContact(ctx, evt.id, u, 'new contact');
  }
  if (evt.type === 'OpportunityCreate' && s.assign_opportunities) {
    if (s.only_unassigned && evt.assignedTo) return;
    let contact = null;
    if (evt.contactId) contact = await getContact(ctx.api, evt.contactId).catch(() => null);
    if (s.only_tag && !(contact && hasTag(contact, s.only_tag))) return;
    let u = contact && contact.assignedTo;
    const fromRotation = !u;
    if (!u) u = await nextUser(ctx);
    if (!u) return;
    await ctx.api.put('/opportunities/' + encodeURIComponent(evt.id), { assignedTo: u });
    await ctx.action('opportunity → ' + u + (fromRotation ? '' : ' (contact owner)'), evt.contactId);
    if (fromRotation && contact && !contact.assignedTo) await assignContact(ctx, contact.id || evt.contactId, u, 'with its opportunity');
  }
}

module.exports = {
  slug: 'round-robin',
  envPrefix: 'ROUND_ROBIN',
  name: 'Round Robin Pro',
  icon: '🔄',
  color: '#36cfc9',
  tagline: 'Share every new lead fairly across your team.',
  description: 'Assigns new contacts and opportunities to your team in a weighted rotation, the moment they arrive. Give your closers more, pause someone on holiday with one click, and keep each lead with one rep.',
  features: [
    ['Weighted rotation', 'Weight 3 gets three leads for every one at weight 1, spread evenly, never in clumps.'],
    ['Contacts and opportunities', 'Assign either or both. Opportunities follow the contact’s owner so a lead keeps one rep.'],
    ['Tag filter', 'Only rotate leads with a tag (e.g. from one funnel) and leave the rest alone.'],
    ['Pause in one click', 'Set someone to 0 while they are away. No workflow edits.']
  ],
  scopes: ['contacts.readonly', 'contacts.write', 'opportunities.readonly', 'opportunities.write', 'users.readonly', 'locations.readonly'],
  webhookEvents: ['ContactCreate', 'OpportunityCreate'],
  fields,
  onEvent,
  options: async (ctx) => ({ users: await users(ctx) }),
  _test: { rotation }
};
