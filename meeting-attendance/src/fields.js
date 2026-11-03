'use strict';
/* Contact custom fields the app writes to, created in GHL at first use. */
const FIELD_DEFS = [
  { key: 'lastStatus', name: 'Last Meeting Status', dataType: 'TEXT' },
  { key: 'lastMinutes', name: 'Last Meeting Minutes Attended', dataType: 'NUMERICAL' },
  { key: 'lastPercent', name: 'Last Meeting Attendance %', dataType: 'NUMERICAL' },
  { key: 'lastJoined', name: 'Last Meeting Joined At', dataType: 'TEXT' },
  { key: 'lastPlatform', name: 'Last Meeting Platform', dataType: 'TEXT' },
  { key: 'attended', name: 'Meetings Attended', dataType: 'NUMERICAL' },
  { key: 'missed', name: 'Meetings Missed', dataType: 'NUMERICAL' },
  { key: 'lastSummary', name: 'Last Meeting Summary', dataType: 'LARGE_TEXT' }
];

function createFields({ ghl, store }) {
  async function ensure(locationId) {
    const loc = await store.getLocation(locationId);
    const ids = Object.assign({}, (loc && loc.fieldIds) || {});
    const missing = FIELD_DEFS.filter((f) => !ids[f.key]);
    if (!missing.length) return ids;
    const existing = await ghl.listCustomFields(locationId);
    for (const f of missing) {
      const found = existing.find((e) => e.name === f.name);
      if (found) { ids[f.key] = found.id; continue; }
      try {
        const created = await ghl.createCustomField(locationId, { name: f.name, dataType: f.dataType, model: 'contact' });
        if (created && created.id) ids[f.key] = created.id;
      } catch (e) { await store.log(locationId, 'field_create_failed', f.name + ': ' + e.message); }
    }
    const fresh = await store.getLocation(locationId);
    if (fresh) { fresh.fieldIds = ids; await store.saveLocation(fresh); }
    return ids;
  }
  return { ensure };
}

const fieldValue = (contact, id) => {
  const f = (contact.customFields || contact.customField || []).find((x) => x.id === id);
  return f ? (f.value !== undefined ? f.value : f.field_value) : undefined;
};

module.exports = { createFields, FIELD_DEFS, fieldValue };
