'use strict';
/* Per-location settings, stored in GHL as one Custom Value (JSON), not in our DB. */
const SETTINGS_NAME = 'Meeting Attendance Settings';

const DEFAULTS = Object.freeze({
  mode: 'auto',              // auto | review | off
  delayMinutes: 10,          // first check this long after the scheduled end
  minMinutes: 5,             // showed if attended >= min(minMinutes, minPercent% of length)
  minPercent: 50,
  lateMinutes: 10,           // tag late if first join is later than this after start
  confidence: 80,            // auto-mark only matches at or above this score
  shortAttendance: 'review', // joined but below the minimum: review | noshow | showed
  noMeeting: 'review',       // meeting never found / nobody joined: review | ignore
  updateFields: true,
  tags: { showed: 'meeting-showed', noshow: 'meeting-noshow', late: 'meeting-late', review: 'attendance-review' },
  notes: {
    enabled: true,
    oneToOne: 'full',        // full | attendance | off
    classMode: 'attendance', // attendance | shared | personal | off
    attendanceOnlyNote: true // when no transcript/summary exists
  },
  calendars: {}              // { [calendarId]: partial overrides }
});

function merge(base, over) {
  if (!over || typeof over !== 'object' || Array.isArray(over)) return base;
  const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
  for (const [k, v] of Object.entries(over)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object') out[k] = merge(base[k], v);
    else if (v !== undefined) out[k] = v;
  }
  return out;
}

const clampNum = (v, lo, hi, d) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d);
const oneOf = (v, list, d) => (list.includes(v) ? v : d);

/* Accepts untrusted input (settings page) and returns a clean settings object. */
function sanitize(raw) {
  const s = merge(DEFAULTS, raw || {});
  const clean = {
    mode: oneOf(s.mode, ['auto', 'review', 'off'], DEFAULTS.mode),
    delayMinutes: clampNum(s.delayMinutes, 0, 240, DEFAULTS.delayMinutes),
    minMinutes: clampNum(s.minMinutes, 0, 600, DEFAULTS.minMinutes),
    minPercent: clampNum(s.minPercent, 0, 100, DEFAULTS.minPercent),
    lateMinutes: clampNum(s.lateMinutes, 0, 240, DEFAULTS.lateMinutes),
    confidence: clampNum(s.confidence, 50, 100, DEFAULTS.confidence),
    shortAttendance: oneOf(s.shortAttendance, ['review', 'noshow', 'showed'], DEFAULTS.shortAttendance),
    noMeeting: oneOf(s.noMeeting, ['review', 'ignore'], DEFAULTS.noMeeting),
    updateFields: s.updateFields !== false,
    tags: {},
    notes: {
      enabled: s.notes.enabled !== false,
      oneToOne: oneOf(s.notes.oneToOne, ['full', 'attendance', 'off'], DEFAULTS.notes.oneToOne),
      classMode: oneOf(s.notes.classMode, ['attendance', 'shared', 'personal', 'off'], DEFAULTS.notes.classMode),
      attendanceOnlyNote: s.notes.attendanceOnlyNote !== false
    },
    calendars: {}
  };
  for (const k of Object.keys(DEFAULTS.tags)) {
    const t = String(s.tags[k] == null ? '' : s.tags[k]).trim().slice(0, 60);
    clean.tags[k] = t; // empty string = do not tag
  }
  for (const [id, over] of Object.entries((raw && raw.calendars) || {}).slice(0, 200)) {
    if (/^[A-Za-z0-9_-]{4,40}$/.test(id) && over && typeof over === 'object') {
      const c = sanitize(Object.assign({}, over, { calendars: {} }));
      // Store only the keys the user actually overrode.
      const kept = {};
      for (const k of Object.keys(over)) if (k in c && k !== 'calendars') kept[k] = c[k];
      clean.calendars[id] = kept;
    }
  }
  return clean;
}

function forCalendar(settings, calendarId) {
  const over = settings.calendars && settings.calendars[calendarId];
  return over ? merge(settings, over) : settings;
}

function createSettings({ ghl }) {
  const cache = new Map();
  const TTL = 10 * 60 * 1000;

  async function find(locationId) {
    const values = await ghl.listCustomValues(locationId);
    return values.find((v) => v.name === SETTINGS_NAME) || null;
  }
  async function get(locationId) {
    const c = cache.get(locationId);
    if (c && c.at > Date.now() - TTL) return c.value;
    let value = sanitize({});
    try {
      const cv = await find(locationId);
      if (cv && cv.value) value = sanitize(JSON.parse(cv.value));
    } catch (e) { if (!(e instanceof SyntaxError)) throw e; }
    cache.set(locationId, { at: Date.now(), value });
    return value;
  }
  async function save(locationId, raw) {
    const value = sanitize(raw);
    const json = JSON.stringify(value);
    const cv = await find(locationId);
    if (cv) await ghl.updateCustomValue(locationId, cv.id, SETTINGS_NAME, json);
    else await ghl.createCustomValue(locationId, SETTINGS_NAME, json);
    cache.set(locationId, { at: Date.now(), value });
    return value;
  }
  return { get, save, forget: (id) => cache.delete(id) };
}

module.exports = { createSettings, sanitize, forCalendar, DEFAULTS, SETTINGS_NAME };
