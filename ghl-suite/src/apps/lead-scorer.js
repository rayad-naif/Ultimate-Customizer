'use strict';
/* LEAD SCORER - every contact gets a live 0-1000 score from what it does
   (new lead, replies, bookings, opportunities, wins). The score is written to
   a "Lead Score" number field and contacts get a cold / warm / hot tag. */
const { addTags, removeTags } = require('./util');
const { localParts } = require('../schema');

const pts = (key, label, def, help) => ({ key, type: 'int', label, default: def, min: 0, max: 200, help, group: 'Points' });

const fields = [
  { key: 'enabled', type: 'bool', label: 'Scoring is on', default: true },
  pts('pts_new', 'New contact', 5),
  pts('pts_sms', 'Inbound SMS / WhatsApp reply', 10),
  pts('pts_email', 'Inbound email reply', 8),
  pts('pts_social', 'Inbound Facebook / Instagram / chat / GMB message', 8),
  pts('pts_appointment', 'Appointment booked', 25),
  pts('pts_opportunity', 'Opportunity created', 15),
  pts('pts_won', 'Opportunity won', 40),
  { key: 'msg_daily_cap', type: 'int', label: 'Max points from messages per contact per day', default: 30, min: 0, max: 500, group: 'Points', help: 'Stops a long chat from inflating the score.' },
  { key: 'warm_at', type: 'int', label: 'Warm at score', default: 25, min: 1, max: 1000, group: 'Tiers' },
  { key: 'hot_at', type: 'int', label: 'Hot at score', default: 60, min: 1, max: 1000, group: 'Tiers' },
  { key: 'tag_cold', type: 'tag', label: 'Cold tag', default: 'lead-cold', group: 'Tiers', help: 'Leave empty to skip a tag.' },
  { key: 'tag_warm', type: 'tag', label: 'Warm tag', default: 'lead-warm', group: 'Tiers' },
  { key: 'tag_hot', type: 'tag', label: 'Hot tag', default: 'lead-hot', group: 'Tiers', help: 'Use "Contact Tag added = lead-hot" as a workflow trigger to alert your team.' },
  { key: 'write_field', type: 'bool', label: 'Write the score to a "Lead Score" custom field', default: true, group: 'Output' }
];

const MAX_SCORE = 1000;
const MSG_TYPES = { SMS: 'pts_sms', WHATSAPP: 'pts_sms', EMAIL: 'pts_email' };

function tierOf(score, s) {
  const hot = Math.max(s.hot_at, s.warm_at);
  return score >= hot ? 'hot' : score >= s.warm_at ? 'warm' : 'cold';
}

async function scoreField(ctx) {
  const cached = await ctx.kv.get('fieldId');
  if (cached) return cached;
  const loc = encodeURIComponent(ctx.inst.locationId);
  const j = await ctx.api.get('/locations/' + loc + '/customFields', { model: 'contact' });
  let f = (j.customFields || []).find((x) => x.fieldKey === 'contact.lead_score' || String(x.name).toLowerCase() === 'lead score');
  if (!f) {
    const c = await ctx.api.post('/locations/' + loc + '/customFields', { name: 'Lead Score', dataType: 'NUMERICAL', model: 'contact', placeholder: '0' });
    f = c.customField || c;
  }
  await ctx.kv.set('fieldId', f.id, 7 * 86400);
  return f.id;
}

async function award(ctx, contactId, points, reason, isMessage) {
  const s = ctx.settings;
  if (!s.enabled || !contactId || points <= 0) return;
  if (isMessage) {
    const day = localParts(new Date(), ctx.tz).ymd;
    const used = await ctx.kv.incr('msg:' + contactId + ':' + day, points, 2 * 86400);
    const allowed = Math.min(points, Math.max(0, s.msg_daily_cap - (used - points)));
    if (allowed <= 0) return;
    points = allowed;
  }
  let score = await ctx.kv.incr('score:' + contactId, points);
  if (score > MAX_SCORE) { await ctx.kv.set('score:' + contactId, MAX_SCORE); score = MAX_SCORE; }

  const api = ctx.api;
  if (s.write_field) {
    try {
      const id = await scoreField(ctx);
      await api.put('/contacts/' + encodeURIComponent(contactId), { customFields: [{ id, field_value: score }] });
    } catch (e) {
      await ctx.kv.del('fieldId');
      await ctx.log('field_error', e.message);
    }
  }
  const tier = tierOf(score, s);
  const prev = await ctx.kv.get('tier:' + contactId);
  if (tier !== prev) {
    const tags = { cold: s.tag_cold, warm: s.tag_warm, hot: s.tag_hot };
    await addTags(api, contactId, [tags[tier]]);
    await removeTags(api, contactId, Object.keys(tags).filter((t) => t !== tier).map((t) => tags[t]).filter((t) => t && t !== tags[tier]));
    await ctx.kv.set('tier:' + contactId, tier);
  }
  await ctx.action('+' + points + ' ' + reason + ' → ' + score + ' (' + tier + ')', contactId);
}

async function onEvent(evt, ctx) {
  const s = ctx.settings;
  switch (evt.type) {
    case 'ContactCreate': return award(ctx, evt.id, s.pts_new, 'new contact');
    case 'InboundMessage': {
      if (evt.direction && evt.direction !== 'inbound') return;
      const t = String(evt.messageType || '').toUpperCase().replace(/^TYPE_/, '');
      if (t === 'CALL' || t === 'ACTIVITY') return;
      const key = MSG_TYPES[t] || 'pts_social';
      return award(ctx, evt.contactId, s[key], t.toLowerCase() + ' reply', true);
    }
    case 'AppointmentCreate': {
      const a = evt.appointment || evt;
      return award(ctx, a.contactId, s.pts_appointment, 'appointment booked');
    }
    case 'OpportunityCreate': return award(ctx, evt.contactId, s.pts_opportunity, 'opportunity created');
    case 'OpportunityStatusUpdate':
      if (String(evt.status).toLowerCase() === 'won') return award(ctx, evt.contactId, s.pts_won, 'opportunity won');
      return;
    case 'ContactDelete':
      await ctx.kv.del('score:' + evt.id);
      await ctx.kv.del('tier:' + evt.id);
  }
}

module.exports = {
  slug: 'lead-scorer',
  envPrefix: 'LEAD_SCORER',
  name: 'Lead Scorer',
  icon: '🔥',
  color: '#ff7a45',
  tagline: 'Know which leads are hot, automatically.',
  description: 'Scores every contact from what they actually do (replies, bookings, opportunities and wins), writes the score to a "Lead Score" field and tags each contact cold, warm or hot so your workflows and team can act on it.',
  features: [
    ['Live score on every contact', 'A "Lead Score" number field is created for you and updated on every reply, booking and deal.'],
    ['Cold / warm / hot tags', 'Tags switch automatically as the score crosses your thresholds. Trigger any workflow from them.'],
    ['Your own point rules', 'Choose how many points each action is worth and cap message points per day.'],
    ['Zero setup', 'Install, open the app, and scoring starts with sensible defaults.']
  ],
  scopes: ['contacts.readonly', 'contacts.write', 'locations.readonly', 'locations/customFields.readonly', 'locations/customFields.write'],
  webhookEvents: ['ContactCreate', 'ContactDelete', 'InboundMessage', 'AppointmentCreate', 'OpportunityCreate', 'OpportunityStatusUpdate'],
  fields,
  onEvent,
  _test: { tierOf }
};
