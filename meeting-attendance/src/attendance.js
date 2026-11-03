'use strict';
/* Attendance engine (pure, no I/O).
   Input: platform participants, the booked attendees (GHL contacts), the
   meeting window and the rules. Output: a decision per attendee. It only
   decides "showed"/"noshow" when it is confident; otherwise "review". */

const BOT_RE = /\b(notetaker|note taker|otter|fireflies|fathom|read\.?ai|tl;?dv|grain|meetgeek|avoma|gong|chorus|airgram|krisp|bot)\b/i;
const EARLY_MS = 15 * 60 * 1000;   // count time from 15 min before start
const LATE_TAIL_MS = 60 * 60 * 1000; // ...until 60 min after the scheduled end

function normName(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')            // "Jane (Guest)", "iPhone (2)"
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function bigrams(s) {
  const t = s.replace(/\s/g, '');
  const out = new Map();
  for (let i = 0; i < t.length - 1; i++) { const b = t.slice(i, i + 2); out.set(b, (out.get(b) || 0) + 1); }
  return out;
}
function dice(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = bigrams(a), B = bigrams(b);
  let inter = 0, na = 0, nb = 0;
  for (const v of A.values()) na += v;
  for (const v of B.values()) nb += v;
  for (const [k, v] of A) inter += Math.min(v, B.get(k) || 0);
  return na + nb ? (2 * inter) / (na + nb) : 0;
}

/* Union length of [start,end] intervals, clipped to [lo,hi]. */
function unionMs(sessions, lo, hi) {
  const iv = sessions.map((s) => [Math.max(s.start, lo), Math.min(s.end || s.start, hi)]).filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  let total = 0, cs = null, ce = null;
  for (const [a, b] of iv) {
    if (cs === null) { cs = a; ce = b; } else if (a <= ce) { ce = Math.max(ce, b); } else { total += ce - cs; cs = a; ce = b; }
  }
  if (cs !== null) total += ce - cs;
  return total;
}

function contactNames(c) {
  const first = normName(c.firstName), last = normName(c.lastName);
  const full = normName(c.name || c.contactName || [c.firstName, c.lastName].filter(Boolean).join(' '));
  return { first, last, full: full || [first, last].filter(Boolean).join(' ') };
}
function contactEmails(c) {
  return [c.email, ...(c.additionalEmails || []).map((e) => (typeof e === 'string' ? e : e && e.email))]
    .filter(Boolean).map((e) => String(e).toLowerCase().trim());
}

/* Score how likely a participant group is a given contact (0-100). */
function matchScore(group, contact, attendees) {
  const emails = contactEmails(contact);
  if (group.email && emails.includes(group.email)) return 95;
  const p = normName(group.name);
  if (!p) return 0;
  const n = contactNames(contact);
  const tokens = p.split(' ');
  if (n.full && p === n.full) return 85;
  if (n.first && n.last && tokens.includes(n.first) && tokens.includes(n.last)) return 85;
  // Email local part used as display name, e.g. "jane.doe".
  if (emails.some((e) => normName(e.split('@')[0]) === p && p.length >= 4)) return 80;
  const d = n.full ? dice(p, n.full) : 0;
  if (d >= 0.85) return 75;
  if (n.first && tokens.includes(n.first)) {
    const sameFirst = attendees.filter((a) => contactNames(a.contact).first === n.first).length;
    if (sameFirst === 1 && (!n.last || tokens.length === 1 || tokens.some((t) => n.last.startsWith(t)))) return 65;
  }
  if (d >= 0.7) return 60;
  return 0;
}

/**
 * @param {object} input
 *   participants: [{ name, email, isHost, sessions: [{start, end}] }]  (ms timestamps)
 *   attendees:    [{ eventId, contact: {id, firstName, lastName, name, email, additionalEmails} }]
 *   hosts:        { emails: [], names: [] }   GHL staff / connected account to exclude
 *   window:       { start, end }              scheduled appointment (ms)
 *   rules:        { minMinutes, minPercent, lateMinutes, confidence, shortAttendance }
 */
function decideAttendance({ participants, attendees, hosts, window, rules }) {
  const lo = window.start - EARLY_MS, hi = window.end + LATE_TAIL_MS;
  const scheduledMin = Math.max(1, (window.end - window.start) / 60000);
  const hostEmails = new Set((hosts.emails || []).map((e) => String(e).toLowerCase()));
  const hostNames = new Set((hosts.names || []).map(normName).filter(Boolean));

  // Group rejoins of the same person (same email, else same normalised name).
  const groups = new Map();
  let anyoneJoined = false;
  for (const p of participants) {
    const sessions = (p.sessions || []).filter((s) => (s.end || s.start) > lo && s.start < hi);
    if (!sessions.length) continue;
    anyoneJoined = true;
    const email = (p.email || '').toLowerCase();
    const name = normName(p.name);
    const isHost = p.isHost || (email && hostEmails.has(email)) || (name && hostNames.has(name));
    const isBot = BOT_RE.test(p.name || '');
    if (isHost || isBot) continue;
    const key = email || 'n:' + name;
    const g = groups.get(key) || { key, name: p.name || '', email, sessions: [] };
    g.sessions.push(...sessions);
    if (!g.email && email) g.email = email;
    groups.set(key, g);
  }
  const list = [...groups.values()].map((g) => {
    const firstJoin = Math.min(...g.sessions.map((s) => s.start));
    return Object.assign(g, { ms: unionMs(g.sessions, lo, hi), firstJoin });
  });

  // Greedy best-first assignment of participants to attendees.
  const pairs = [];
  for (const g of list) for (const a of attendees) {
    const s = matchScore(g, a.contact, attendees);
    if (s >= 50) pairs.push({ g, a, s });
  }
  pairs.sort((x, y) => y.s - x.s || y.g.ms - x.g.ms);
  const byAttendee = new Map(), takenGroups = new Set();
  for (const { g, a, s } of pairs) {
    if (takenGroups.has(g.key) || byAttendee.has(a.eventId)) continue;
    byAttendee.set(a.eventId, { g, s, how: s >= 95 ? 'email' : 'name' });
    takenGroups.add(g.key);
  }
  // 1:1 process of elimination: one unknown guest + one unmatched contact.
  const freeGroups = list.filter((g) => !takenGroups.has(g.key));
  const freeAttendees = attendees.filter((a) => !byAttendee.has(a.eventId));
  if (attendees.length === 1 && freeAttendees.length === 1 && freeGroups.length === 1) {
    byAttendee.set(freeAttendees[0].eventId, { g: freeGroups[0], s: 70, how: 'only guest' });
    takenGroups.add(freeGroups[0].key);
  }
  const unmatched = list.filter((g) => !takenGroups.has(g.key));

  const needMin = Math.min(rules.minMinutes, (rules.minPercent / 100) * scheduledMin);
  const results = attendees.map((a) => {
    const m = byAttendee.get(a.eventId);
    const base = { eventId: a.eventId, contactId: a.contact.id, contactName: a.contact.name || [a.contact.firstName, a.contact.lastName].filter(Boolean).join(' ') };
    if (!anyoneJoined) return Object.assign(base, { decision: 'review', reason: 'Nobody joined the meeting, not even the host' });
    if (!m) {
      if (unmatched.length) return Object.assign(base, { decision: 'review', reason: 'Not matched; ' + unmatched.length + ' unidentified participant(s) joined' });
      return Object.assign(base, { decision: 'noshow', reason: 'Did not join', minutes: 0 });
    }
    const minutes = Math.round(m.g.ms / 60000);
    const pct = Math.min(100, Math.round((m.g.ms / 60000 / scheduledMin) * 100));
    const late = m.g.firstJoin > window.start + rules.lateMinutes * 60000;
    const info = Object.assign(base, { minutes, pct, joinedAt: m.g.firstJoin, late, confidence: m.s, matchedAs: m.g.name || m.g.email, matchedBy: m.how });
    if (m.s < rules.confidence) return Object.assign(info, { decision: 'review', reason: 'Low-confidence match with "' + (m.g.name || m.g.email) + '" (' + m.s + ')' });
    if (minutes >= needMin) return Object.assign(info, { decision: 'showed', reason: 'Attended ' + minutes + ' min' });
    return Object.assign(info, {
      decision: rules.shortAttendance === 'noshow' ? 'noshow' : rules.shortAttendance === 'showed' ? 'showed' : 'review',
      reason: 'Only attended ' + minutes + ' min (needs ' + Math.ceil(needMin) + ')'
    });
  });

  return {
    happened: anyoneJoined,
    results,
    unmatched: unmatched.map((g) => ({ name: g.name, email: g.email, minutes: Math.round(g.ms / 60000) }))
  };
}

module.exports = { decideAttendance, normName, dice, unionMs, matchScore };
