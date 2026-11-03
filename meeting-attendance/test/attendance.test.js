'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { decideAttendance, unionMs, normName } = require('../src/attendance');
const { sanitize } = require('../src/settings');

const rules = sanitize({});
const T0 = Date.parse('2026-11-02T14:00:00Z');
const min = (n) => T0 + n * 60000;
const window = { start: T0, end: min(30) };
const hosts = { emails: ['coach@biz.com'], names: ['Coach Carter'] };
const jane = { eventId: 'a1', contact: { id: 'c1', firstName: 'Jane', lastName: 'Doe', email: 'jane@x.com' } };

test('normalises names', () => {
  assert.equal(normName('José  Núñez (Guest)'), 'jose nunez');
});

test('unionMs merges overlapping rejoins', () => {
  assert.equal(unionMs([{ start: 0, end: 10 }, { start: 5, end: 20 }, { start: 30, end: 40 }], 0, 100), 30);
});

test('email match that attended long enough is Showed', () => {
  const r = decideAttendance({
    participants: [
      { name: 'Coach Carter', email: 'coach@biz.com', sessions: [{ start: min(0), end: min(30) }] },
      { name: 'iPhone', email: 'jane@x.com', sessions: [{ start: min(2), end: min(10) }, { start: min(12), end: min(28) }] }
    ],
    attendees: [jane], hosts, window, rules
  });
  assert.equal(r.results[0].decision, 'showed');
  assert.equal(r.results[0].minutes, 24);
  assert.equal(r.results[0].matchedBy, 'email');
});

test('name match works without email, and late join is flagged', () => {
  const r = decideAttendance({
    participants: [{ name: 'jane doe', sessions: [{ start: min(15), end: min(30) }] }],
    attendees: [jane], hosts, window, rules
  });
  assert.equal(r.results[0].decision, 'showed');
  assert.equal(r.results[0].late, true);
});

test('host only = No-show', () => {
  const r = decideAttendance({
    participants: [{ name: 'Coach Carter', sessions: [{ start: min(0), end: min(30) }] }],
    attendees: [jane], hosts, window, rules
  });
  assert.equal(r.results[0].decision, 'noshow');
});

test('nobody joined at all = review, never No-show', () => {
  const r = decideAttendance({ participants: [], attendees: [jane], hosts, window, rules });
  assert.equal(r.results[0].decision, 'review');
  assert.equal(r.happened, false);
});

test('unknown guest on a 1:1 is a low-confidence match and goes to review', () => {
  const r = decideAttendance({
    participants: [{ name: 'iPad (2)', sessions: [{ start: min(0), end: min(30) }] }],
    attendees: [jane], hosts, window, rules
  });
  assert.equal(r.results[0].decision, 'review');
  assert.equal(r.results[0].confidence, 70);
});

test('short attendance follows the shortAttendance rule', () => {
  const p = [{ name: 'Jane Doe', sessions: [{ start: min(0), end: min(2) }] }];
  assert.equal(decideAttendance({ participants: p, attendees: [jane], hosts, window, rules }).results[0].decision, 'review');
  assert.equal(decideAttendance({ participants: p, attendees: [jane], hosts, window, rules: Object.assign({}, rules, { shortAttendance: 'noshow' }) }).results[0].decision, 'noshow');
});

test('class booking: each attendee judged separately; bots ignored', () => {
  const att = [
    { eventId: 'b1', contact: { id: 'c2', firstName: 'Bob', lastName: 'Stone' } },
    { eventId: 'b2', contact: { id: 'c3', firstName: 'Ana', lastName: 'López', email: 'ana@x.com' } },
    { eventId: 'b3', contact: { id: 'c4', firstName: 'Will', lastName: 'Smith' } }
  ];
  const r = decideAttendance({
    participants: [
      { name: 'Coach Carter', isHost: true, sessions: [{ start: min(0), end: min(30) }] },
      { name: 'Bob Stone', sessions: [{ start: min(0), end: min(30) }] },
      { name: 'Ana', email: 'ana@x.com', sessions: [{ start: min(1), end: min(20) }] },
      { name: 'Fireflies.ai Notetaker', sessions: [{ start: min(0), end: min(30) }] }
    ],
    attendees: att, hosts, window, rules
  });
  assert.deepEqual(r.results.map((x) => x.decision), ['showed', 'showed', 'noshow']);
  assert.equal(r.unmatched.length, 0);
});

test('class booking: an unidentified participant blocks No-show for unmatched attendees', () => {
  const att = [
    { eventId: 'b1', contact: { id: 'c2', firstName: 'Bob', lastName: 'Stone' } },
    { eventId: 'b3', contact: { id: 'c4', firstName: 'Will', lastName: 'Smith' } }
  ];
  const r = decideAttendance({
    participants: [
      { name: 'Bob Stone', sessions: [{ start: min(0), end: min(30) }] },
      { name: 'Galaxy S23', sessions: [{ start: min(0), end: min(30) }] }
    ],
    attendees: att, hosts, window, rules
  });
  assert.equal(r.results[0].decision, 'showed');
  assert.equal(r.results[1].decision, 'review');
  assert.equal(r.unmatched[0].name, 'Galaxy S23');
});

test('sessions far outside the appointment window are ignored (reused meeting room)', () => {
  const r = decideAttendance({
    participants: [
      { name: 'Coach Carter', sessions: [{ start: min(0), end: min(30) }] },
      { name: 'Jane Doe', sessions: [{ start: min(-300), end: min(-260) }] }
    ],
    attendees: [jane], hosts, window, rules
  });
  assert.equal(r.results[0].decision, 'noshow');
});
