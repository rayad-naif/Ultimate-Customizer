'use strict';
/* Settings schemas. Each app declares its fields once; the server validates
   with sanitize() and the settings page renders the same list. */

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function validTimezone(tz) {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch (e) { return false; }
}
const clampInt = (v, min, max, d) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
};
const cleanText = (v, max) => String(v == null ? '' : v).replace(/\r\n/g, '\n').slice(0, max || 200);
const cleanTag = (t) => String(t).trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 60);

function defaultHours() {
  const h = {};
  DAYS.forEach((d, i) => { h[d] = { on: i < 5, from: '09:00', to: '17:00' }; });
  return h;
}

function cleanField(f, v) {
  switch (f.type) {
    case 'bool': return v === undefined ? f.default : v === true || v === 'true' || v === 'on' || v === 1;
    case 'int': return v === undefined || v === '' ? f.default : clampInt(v, f.min, f.max, f.default);
    case 'text': return v === undefined ? f.default : cleanText(v, f.max).replace(/\n/g, ' ').trim();
    case 'textarea': return v === undefined ? f.default : cleanText(v, f.max).trim();
    case 'select': return f.options.some((o) => o.value === v) ? v : f.default;
    case 'multiselect': {
      if (!Array.isArray(v)) return f.default.slice();
      return f.options.map((o) => o.value).filter((x) => v.includes(x));
    }
    case 'tag': return v === undefined ? f.default : cleanTag(v);
    case 'tags': {
      const arr = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : f.default;
      return [...new Set(arr.map(cleanTag).filter(Boolean))].slice(0, 20);
    }
    case 'timezone': return validTimezone(v) ? v : f.default;
    case 'dates': {
      const arr = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[\s,]+/) : f.default;
      return [...new Set(arr.map((x) => String(x).trim()).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x) && !isNaN(Date.parse(x))))].sort().slice(0, 100);
    }
    case 'hours': {
      const out = defaultHours();
      if (!v || typeof v !== 'object') return f.default ? JSON.parse(JSON.stringify(f.default)) : out;
      DAYS.forEach((d) => {
        const x = v[d] || {};
        out[d] = { on: !!x.on, from: TIME_RE.test(x.from) ? x.from : out[d].from, to: TIME_RE.test(x.to) ? x.to : out[d].to };
      });
      return out;
    }
    case 'weights': {
      const out = {};
      if (v && typeof v === 'object') {
        for (const [id, w] of Object.entries(v).slice(0, 100)) {
          const n = clampInt(w, 0, 10, 0);
          if (ID_RE.test(id) && n > 0) out[id] = n;
        }
      }
      return out;
    }
    default: throw new Error('unknown field type ' + f.type);
  }
}

function makeSanitizer(fields) {
  return function sanitize(input) {
    const src = input && typeof input === 'object' ? input : {};
    const out = {};
    for (const f of fields) out[f.key] = cleanField(f, src[f.key]);
    return out;
  };
}

/* Is `date` inside the weekly hours, in time zone `tz`? */
function localParts(date, tz) {
  const p = {};
  new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(date).forEach((x) => { p[x.type] = x.value; });
  return { day: p.weekday.toLowerCase().slice(0, 3), hm: p.hour + ':' + p.minute, md: p.month + '-' + p.day, ymd: p.year + '-' + p.month + '-' + p.day };
}
function isOpen(hours, tz, date) {
  const { day, hm } = localParts(date || new Date(), tz);
  const h = hours[day];
  if (!h || !h.on) return false;
  // Overnight ranges such as 20:00 - 02:00 are supported.
  return h.from <= h.to ? hm >= h.from && hm < h.to : hm >= h.from || hm < h.to;
}

module.exports = { makeSanitizer, cleanField, validTimezone, localParts, isOpen, defaultHours, DAYS };
