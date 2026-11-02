'use strict';
/* End to end: GHL webhooks -> jobs -> Zoom attendance -> GHL status/tags/fields/tasks -> notes.
   GHL and Zoom are mocked at the fetch layer; time is controlled. */
const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../src/config');
const { createApp } = require('../src/app');
const { createMemoryStore } = require('../src/store/memory');
const { createCrypto } = require('../src/crypto');

const SECRET = 'x'.repeat(40);
const GHL = 'https://services.leadconnectorhq.com';
const ZOOM = 'https://api.zoom.us/v2';
const iso = (s) => new Date(Date.parse(s)).toISOString();

function json(body, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }); }

function world() {
  const calls = [];
  const appts = {
    a1: { id: 'a1', calendarId: 'cal1', contactId: 'c1', title: 'Strategy Call', appointmentStatus: 'confirmed', assignedUserId: 'u1', startTime: '2026-11-02T14:00:00Z', endTime: '2026-11-02T14:30:00Z', address: 'https://us02web.zoom.us/j/12345678901?pwd=x' },
    b1: { id: 'b1', calendarId: 'cal2', contactId: 'c2', title: 'Yoga Class', appointmentStatus: 'confirmed', assignedUserId: 'u1', startTime: '2026-11-02T16:00:00Z', endTime: '2026-11-02T17:00:00Z', address: 'https://zoom.us/j/99999999999' },
    b2: { id: 'b2', calendarId: 'cal2', contactId: 'c3', title: 'Yoga Class', appointmentStatus: 'confirmed', assignedUserId: 'u1', startTime: '2026-11-02T16:00:00Z', endTime: '2026-11-02T17:00:00Z', address: 'https://zoom.us/j/99999999999' },
    b3: { id: 'b3', calendarId: 'cal2', contactId: 'c4', title: 'Yoga Class', appointmentStatus: 'confirmed', assignedUserId: 'u1', startTime: '2026-11-02T16:00:00Z', endTime: '2026-11-02T17:00:00Z', address: 'https://zoom.us/j/99999999999' }
  };
  const contacts = {
    c1: { id: 'c1', firstName: 'Jane', lastName: 'Doe', email: 'jane@x.com', customFields: [] },
    c2: { id: 'c2', firstName: 'Bob', lastName: 'Stone', customFields: [] },
    c3: { id: 'c3', firstName: 'Ana', lastName: 'López', email: 'ana@x.com', customFields: [] },
    c4: { id: 'c4', firstName: 'Will', lastName: 'Smith', customFields: [] }
  };
  let fieldN = 0;
  const unexpected = [];

  async function fetchMock(url, opts = {}) {
    const u = new URL(url);
    const method = opts.method || 'GET';
    const body = opts.body && String(opts.headers && opts.headers['Content-Type']).includes('json') ? JSON.parse(opts.body) : opts.body;
    calls.push({ method, url: u.origin + u.pathname, body, auth: opts.headers && opts.headers.Authorization });
    const p = u.pathname;
    let m;
    if (u.origin === GHL) {
      if ((m = p.match(/^\/calendars\/events\/appointments\/(\w+)$/))) {
        if (method === 'GET') return appts[m[1]] ? json({ event: appts[m[1]] }) : json({}, 404);
        appts[m[1]].appointmentStatus = body.appointmentStatus;
        return json({ id: m[1] });
      }
      if ((m = p.match(/^\/contacts\/(\w+)$/))) return method === 'GET' ? json({ contact: contacts[m[1]] }) : json({ succeded: true });
      if (p.match(/^\/contacts\/\w+\/(tags|notes|tasks)$/)) return json({ ok: true });
      if (p === '/users/u1') return json({ id: 'u1', name: 'Coach Carter', email: 'coach@biz.com' });
      if (p === '/locations/loc1/customFields') return method === 'GET' ? json({ customFields: [] }) : json({ customField: { id: 'f' + (++fieldN), name: body.name } });
      if (p === '/locations/loc1/customValues') return json({ customValues: [] });
      if (p === '/locations/loc1') return json({ location: { id: 'loc1', timezone: 'UTC' } });
    }
    if (u.origin === 'https://api.zoom.us') {
      if (p === '/v2/past_meetings/12345678901/instances') return json({ meetings: [{ uuid: 'uuid-a1', start_time: '2026-11-02T14:01:00Z' }] });
      if (p === '/v2/past_meetings/99999999999/instances') return json({ meetings: [{ uuid: 'old', start_time: '2026-10-26T16:00:00Z' }, { uuid: 'uuid-c', start_time: '2026-11-02T16:00:00Z' }] });
      if (p === '/v2/past_meetings/uuid-a1' || p === '/v2/past_meetings/uuid-c') return json({ host_id: 'host1' });
      if (p === '/v2/report/meetings/uuid-a1/participants') return json({ participants: [
        { id: 'host1', name: 'Coach Carter', user_email: 'coach@biz.com', join_time: '2026-11-02T14:00:00Z', leave_time: '2026-11-02T14:30:00Z' },
        { id: '', name: 'Jane Doe', user_email: '', join_time: '2026-11-02T14:03:00Z', leave_time: '2026-11-02T14:29:00Z' }
      ] });
      if (p === '/v2/report/meetings/uuid-c/participants') return json({ participants: [
        { id: 'host1', name: 'Coach', join_time: '2026-11-02T16:00:00Z', leave_time: '2026-11-02T17:00:00Z' },
        { name: 'Bob Stone', join_time: '2026-11-02T16:00:00Z', leave_time: '2026-11-02T16:30:00Z' },
        { name: 'Bob Stone', join_time: '2026-11-02T16:32:00Z', leave_time: '2026-11-02T17:00:00Z' },
        { name: 'Ana', user_email: 'ANA@x.com', join_time: '2026-11-02T16:15:00Z', leave_time: '2026-11-02T16:55:00Z' },
        { name: 'Fireflies.ai Notetaker', join_time: '2026-11-02T16:00:00Z', leave_time: '2026-11-02T17:00:00Z' }
      ] });
      if (p === '/v2/meetings/uuid-a1/meeting_summary') return json({ code: 3001 }, 404);
      if (p === '/v2/meetings/uuid-a1/recordings') return json({ recording_files: [{ file_type: 'MP4', status: 'completed' }, { file_type: 'TRANSCRIPT', status: 'completed', download_url: 'https://zoom.us/rec/download/t1' }] });
    }
    if (url === 'https://zoom.us/rec/download/t1') return new Response('WEBVTT\n\n1\n00:00:01.000 --> 00:00:04.000\nJane Doe: I will send the report by Friday.', { status: 200 });
    unexpected.push(method + ' ' + url);
    return json({ message: 'not mocked' }, 404);
  }
  return { calls, appts, contacts, unexpected, fetchMock };
}

async function setup() {
  const w = world();
  const cfg = config.load({
    SESSION_SECRET: SECRET, GHL_CLIENT_ID: 'cid', GHL_CLIENT_SECRET: 'cs', GHL_SKIP_WEBHOOK_VERIFY: '1',
    ZOOM_CLIENT_ID: 'z', ZOOM_CLIENT_SECRET: 'zs', CRON_SECRET: 'cron-secret', BASE_URL: 'https://app.test'
  });
  const store = createMemoryStore();
  const c = createCrypto(SECRET);
  const future = new Date(Date.now() + 3600e3);
  await store.saveLocation({
    _id: 'loc1', installed: true, companyId: 'co1', fieldIds: {},
    ghl: { access: c.encrypt('ghl-token'), refresh: c.encrypt('ghl-refresh'), expiresAt: future },
    connections: { zoom: { access: c.encrypt('zoom-token'), refresh: c.encrypt('zoom-refresh'), expiresAt: future, account: { id: 'host1', email: 'coach@biz.com', name: 'Coach Carter' } } }
  });
  const summarized = [];
  const notes = {
    enabled: true,
    async summarize(src, meta, personal) {
      summarized.push({ src, meta, personal });
      return { summary: 'Jane agreed to send the report.', key_points: ['Report timing'], decisions: [], action_items: [{ owner: 'Jane', task: 'Send the report', due: 'Friday' }], next_step: 'Review report', attendees: [] };
    }
  };
  let T = Date.parse('2026-11-02T13:00:00Z');
  const app = createApp(cfg, { fetch: w.fetchMock, store, notes, now: () => T });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const hook = (type, appt, id) => fetch(base + '/webhooks/ghl', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, locationId: 'loc1', webhookId: id, timestamp: new Date().toISOString(), appointment: appt })
  }).then((r) => r.json());
  const cron = () => fetch(base + '/api/cron/run', { headers: { Authorization: 'Bearer cron-secret' } }).then((r) => r.json());
  return { w, store, server, base, hook, cron, summarized, setTime: (s) => { T = Date.parse(s); } };
}

test('one-to-one and class bookings are marked and get notes', async (t) => {
  const env = await setup();
  t.after(() => env.server.close());
  const { w, store, hook, cron } = env;

  // Webhooks schedule one job for the 1:1 and one shared job for the class.
  assert.equal((await hook('AppointmentCreate', w.appts.a1, 'w1')).result, 'scheduled');
  for (const id of ['b1', 'b2', 'b3']) assert.equal((await hook('AppointmentCreate', w.appts[id], 'w-' + id)).result, 'scheduled');
  assert.equal((await hook('AppointmentCreate', w.appts.a1, 'w1')).duplicate, true);
  let jobs = await store.allJobs();
  assert.equal(jobs.length, 2);
  assert.deepEqual(jobs.find((j) => j.calendarId === 'cal2').eventIds.sort(), ['b1', 'b2', 'b3']);

  // Nothing is due before the meeting ends + 10 minutes.
  assert.equal((await cron()).processed, 0);
  assert.equal((await fetch(env.base + '/api/cron/run')).status, 401);

  // 1:1 attendance.
  env.setTime('2026-11-02T14:41:00Z');
  assert.equal((await cron()).processed, 1);
  assert.equal(w.appts.a1.appointmentStatus, 'showed');
  const tagCall = w.calls.find((c) => c.url === GHL + '/contacts/c1/tags');
  assert.deepEqual(tagCall.body.tags, ['meeting-showed']);
  const fieldCall = w.calls.find((c) => c.method === 'PUT' && c.url === GHL + '/contacts/c1');
  assert.ok(fieldCall.body.customFields.some((f) => f.field_value === 'Showed'));
  assert.ok(fieldCall.body.customFields.some((f) => f.field_value === '26'));
  assert.equal(w.calls.filter((c) => c.method === 'POST' && c.url.endsWith('/customFields')).length, 8);

  // 1:1 notes from the Zoom transcript.
  env.setTime('2026-11-02T14:47:00Z');
  assert.equal((await cron()).processed, 1);
  assert.equal(env.summarized.length, 1);
  assert.equal(env.summarized[0].src.kind, 'transcript');
  assert.match(env.summarized[0].src.text, /Jane Doe: I will send the report by Friday/);
  const note = w.calls.find((c) => c.url === GHL + '/contacts/c1/notes');
  assert.match(note.body.body, /Attendance: Showed - 26 min \(87%\)/);
  assert.match(note.body.body, /\[Jane\] Send the report \(due Friday\)/);
  assert.equal(note.body.userId, 'u1');

  // Class attendance: Bob (rejoined) showed, Ana (email, late) showed, Will no-show.
  env.setTime('2026-11-02T17:11:00Z');
  assert.equal((await cron()).processed, 1);
  assert.equal(w.appts.b1.appointmentStatus, 'showed');
  assert.equal(w.appts.b2.appointmentStatus, 'showed');
  assert.equal(w.appts.b3.appointmentStatus, 'noshow');
  assert.deepEqual(w.calls.find((c) => c.url === GHL + '/contacts/c3/tags').body.tags, ['meeting-showed', 'meeting-late']);
  assert.deepEqual(w.calls.find((c) => c.url === GHL + '/contacts/c4/tags').body.tags, ['meeting-noshow']);
  assert.equal(w.calls.filter((c) => c.url.endsWith('/tasks')).length, 0);

  // Class notes default to attendance-only, for attendees who showed.
  env.setTime('2026-11-02T17:17:00Z');
  assert.equal((await cron()).processed, 1);
  assert.equal(env.summarized.length, 1, 'no AI summary for attendance-only class notes');
  const classNotes = w.calls.filter((c) => /\/contacts\/c[234]\/notes$/.test(c.url));
  assert.deepEqual(classNotes.map((c) => c.url.split('/')[4]).sort(), ['c2', 'c3']);
  assert.match(classNotes[0].body.body, /Yoga Class/);

  jobs = await store.allJobs();
  assert.equal(jobs.length, 0);
  assert.deepEqual(w.unexpected.filter((u) => !u.includes('/customValues')), []);
});

test('rescheduling and cancelling move or remove the job', async (t) => {
  const env = await setup();
  t.after(() => env.server.close());
  const a = Object.assign({}, env.w.appts.a1);
  await env.hook('AppointmentCreate', a, 'r1');
  await env.hook('AppointmentUpdate', Object.assign({}, a, { startTime: '2026-11-03T14:00:00Z', endTime: '2026-11-03T14:30:00Z' }), 'r2');
  let jobs = await env.store.allJobs();
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].startTime, Date.parse('2026-11-03T14:00:00Z'));
  await env.hook('AppointmentUpdate', Object.assign({}, a, { appointmentStatus: 'cancelled' }), 'r3');
  jobs = await env.store.allJobs();
  assert.equal(jobs.length, 0);
  assert.equal((await env.hook('AppointmentCreate', Object.assign({}, a, { address: 'Office, 1 Main St' }), 'r4')).result, 'no-meeting-link');
});

test('manually set statuses are never overwritten', async (t) => {
  const env = await setup();
  t.after(() => env.server.close());
  await env.hook('AppointmentCreate', env.w.appts.a1, 'm1');
  env.w.appts.a1.appointmentStatus = 'noshow';
  env.setTime('2026-11-02T14:41:00Z');
  await env.cron();
  assert.equal(env.w.appts.a1.appointmentStatus, 'noshow');
  assert.equal(env.w.calls.filter((c) => c.method === 'PUT' && c.url.includes('/appointments/')).length, 0);
});

test('meeting not found retries, then creates one review task', async (t) => {
  const env = await setup();
  t.after(() => env.server.close());
  const a = Object.assign({}, env.w.appts.a1, { id: 'a1', address: 'https://zoom.us/j/55555555555' });
  env.w.appts.a1 = a;
  await env.hook('AppointmentCreate', a, 'n1');
  let clock = Date.parse('2026-11-02T14:41:00Z');
  for (let i = 0; i < 12; i++) {
    env.setTime(new Date(clock).toISOString());
    await env.cron();
    clock += 400 * 60000;
  }
  const tasks = env.w.calls.filter((c) => c.url === GHL + '/contacts/c1/tasks');
  assert.equal(tasks.length, 1);
  assert.match(tasks[0].body.title, /Check meeting attendance/);
  assert.equal(tasks[0].body.assignedTo, 'u1');
  assert.equal(env.w.appts.a1.appointmentStatus, 'confirmed');
  assert.equal((await env.store.allJobs()).length, 0);
});

test('settings API requires a signed session', async (t) => {
  const env = await setup();
  t.after(() => env.server.close());
  assert.equal((await fetch(env.base + '/app/api/state')).status, 401);
  const token = createCrypto(SECRET).sign({ loc: 'loc1', exp: Date.now() + 60000 });
  const r = await fetch(env.base + '/app/api/state', { headers: { Authorization: 'Bearer ' + token } });
  assert.equal(r.status, 200);
  const s = await r.json();
  assert.equal(s.connections.zoom.connected, true);
  assert.equal(s.connections.teams.configured, false);
  assert.equal(s.settings.mode, 'auto');
  const c = await fetch(env.base + '/app/api/connect/zoom', { method: 'POST', headers: { Authorization: 'Bearer ' + token } }).then((x) => x.json());
  assert.match(c.url, /^https:\/\/zoom\.us\/oauth\/authorize\?/);
});
