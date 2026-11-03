'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { detectMeeting } = require('../src/meeting-url');
const { vttToText } = require('../src/vtt');
const { buildNote, splitNote, createNotes } = require('../src/notes');
const { sanitize, forCalendar } = require('../src/settings');
const { summaryText } = require('../src/providers/zoom');

test('detects meeting platforms from appointment addresses', () => {
  assert.deepEqual(detectMeeting('Join: https://us02web.zoom.us/j/81234567890?pwd=abc').meetingId, '81234567890');
  assert.equal(detectMeeting('https://zoom.us/my/coachcarter').vanity, 'coachcarter');
  assert.equal(detectMeeting('https://meet.google.com/abc-defg-hij?authuser=0').code, 'abc-defg-hij');
  const t = detectMeeting('https://teams.microsoft.com/l/meetup-join/19%3ameeting_x%40thread.v2/0?context=%7b%7d');
  assert.equal(t.provider, 'teams');
  assert.ok(t.joinUrl.includes('meetup-join'));
  assert.equal(detectMeeting('https://teams.microsoft.com/meet/2345678901234?p=Ab12').meetingCode, '2345678901234');
  assert.equal(detectMeeting('https://teams.live.com/meet/9311').unsupported, 'personal');
  assert.equal(detectMeeting('123 Main St'), null);
  assert.equal(detectMeeting(''), null);
});

test('VTT parsing handles Zoom and Teams speaker formats', () => {
  const zoom = 'WEBVTT\n\n1\n00:00:01.000 --> 00:00:03.000\nJane Doe: Hello there\n\n2\n00:00:03.000 --> 00:00:05.000\nJane Doe: how are you\n\n3\n00:00:05.000 --> 00:00:06.000\nCoach: Good';
  assert.equal(vttToText(zoom), 'Jane Doe: Hello there how are you\nCoach: Good');
  const teams = 'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\n<v Ana López>Hola</v>';
  assert.equal(vttToText(teams), 'Ana López: Hola');
});

test('settings are sanitised and per-calendar overrides apply', () => {
  const s = sanitize({ mode: 'weird', minMinutes: -5, tags: { showed: 'x' }, calendars: { cal_123: { minMinutes: 20 }, 'bad id!': { mode: 'off' } } });
  assert.equal(s.mode, 'auto');
  assert.equal(s.minMinutes, 0);
  assert.equal(s.tags.showed, 'x');
  assert.equal(s.tags.noshow, 'meeting-noshow');
  assert.deepEqual(Object.keys(s.calendars), ['cal_123']);
  assert.equal(forCalendar(s, 'cal_123').minMinutes, 20);
  assert.equal(forCalendar(s, 'other').minMinutes, 0);
});

test('note building and splitting', () => {
  const meta = { title: 'Strategy Call', platform: 'Zoom', start: Date.parse('2026-11-02T14:00:00Z'), end: 0, sourceKind: 'transcript' };
  const note = buildNote({
    meta, appName: 'MA', tz: 'UTC',
    result: { decision: 'showed', minutes: 42, pct: 93, joinedAt: Date.parse('2026-11-02T14:03:00Z') },
    notes: { summary: 'We agreed a plan.', key_points: ['Budget'], decisions: [], action_items: [{ owner: 'Jane', task: 'Send report', due: 'Fri' }], next_step: 'Follow-up call', attendees: [] }
  });
  assert.match(note, /Attendance: Showed - 42 min \(93%\)/);
  assert.match(note, /\[Jane\] Send report \(due Fri\)/);
  assert.doesNotMatch(note, /Decisions/);
  const parts = splitNote('a\n'.repeat(3000), 1000);
  assert.ok(parts.length > 1);
  assert.ok(parts.every((p) => p.length <= 1000));
  assert.match(parts[0], /^\(Part 1\/\d+\)/);
  assert.deepEqual(splitNote('short', 100), ['short']);
});

test('summarize sends structured-output request and parses JSON', async () => {
  let sent;
  const fake = { beta: { messages: { create: async (req) => { sent = req; return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ summary: 'S', key_points: [], decisions: [], action_items: [], next_step: '', attendees: [] }) }] }; } } } };
  const n = createNotes({ cfg: { claude: { apiKey: '', model: 'claude-opus-5-5', effort: 'medium' } }, client: fake });
  const out = await n.summarize({ kind: 'transcript', text: 'Jane: hi' }, { title: 'T', platform: 'Zoom', start: 0, end: 0 }, null);
  assert.equal(out.summary, 'S');
  assert.equal(sent.model, 'claude-opus-5-5');
  assert.equal(sent.output_config.format.type, 'json_schema');
  assert.equal(sent.fallbacks, 'default');
  assert.match(sent.messages[0].content, /<source>\nJane: hi\n<\/source>/);
});

test('summarize reports refusals as NotesUnavailable', async () => {
  const fake = { beta: { messages: { create: async () => ({ stop_reason: 'refusal', content: [] }) } } };
  const n = createNotes({ cfg: { claude: { model: 'm', effort: 'low' } }, client: fake });
  await assert.rejects(n.summarize({ kind: 'transcript', text: 'x' }, { start: 0, end: 0 }, null), { name: 'NotesUnavailable' });
});

test('zoom summary payload shapes', () => {
  assert.equal(summaryText({ summary_content: '## Hi' }), '## Hi');
  assert.match(summaryText({ summary_overview: 'O', summary_details: [{ label: 'L', summary: 'S' }], next_steps: ['N'] }), /O\n\nL: S\n\nNext steps:\n- N/);
});

test('GHL webhook signatures are verified with RSA-SHA256', () => {
  const nodeCrypto = require('crypto');
  const config = require('../src/config');
  const { createGhl } = require('../src/ghl');
  assert.ok(nodeCrypto.createPublicKey(config.GHL_WEBHOOK_PUBLIC_KEY), 'bundled HighLevel key parses');
  const { publicKey, privateKey } = nodeCrypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const cfg = config.load({ GHL_WEBHOOK_PUBLIC_KEY: publicKey.export({ type: 'spki', format: 'pem' }) });
  const ghl = createGhl({ cfg, store: null, crypto: null, http: null });
  const body = Buffer.from(JSON.stringify({ type: 'AppointmentCreate', webhookId: 'w' }));
  const sig = nodeCrypto.sign('sha256', body, privateKey).toString('base64');
  assert.equal(ghl.verifyWebhook(body, { 'x-wh-signature': sig }), true);
  assert.equal(ghl.verifyWebhook(Buffer.from(body.toString() + ' '), { 'x-wh-signature': sig }), false);
  assert.equal(ghl.verifyWebhook(body, {}), false);
});
