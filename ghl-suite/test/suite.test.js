'use strict';
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const config = require('../src/config');
const { createSuite } = require('../src/suite');
const { createMemoryStore } = require('../src/store');
const { encryptGhlSso } = require('../src/security');
const { localParts, isOpen, makeSanitizer } = require('../src/schema');
const scorer = require('../src/apps/lead-scorer');
const rr = require('../src/apps/round-robin');
const cleaner = require('../src/apps/contact-cleaner');
const after = require('../src/apps/after-hours');
const bday = require('../src/apps/birthday');

const PREFIXES = ['LEAD_SCORER', 'ROUND_ROBIN', 'CONTACT_CLEANER', 'AFTER_HOURS', 'BIRTHDAY_GREETER'];
const LOC = 'loc_ABC123', COMPANY = 'comp_XYZ789';

/* A fake HighLevel API. Records every call; routes return JSON. */
function fakeGhl(over) {
  const calls = [];
  let tokenN = 0;
  const state = { contacts: {}, fields: [], refreshFails: false };
  const routes = Object.assign({
    'POST /oauth/token': (b) => {
      if (b.get('grant_type') === 'refresh_token' && state.refreshFails) return [401, { error: 'invalid_grant' }];
      tokenN++;
      return [200, { access_token: 'at' + tokenN, refresh_token: 'rt' + tokenN, expires_in: 86399, userType: 'Location', locationId: LOC, companyId: COMPANY }];
    },
    'GET /locations/:id': () => [200, { location: { name: 'Acme Dental', timezone: 'America/New_York' } }],
    'GET /locations/:id/customFields': () => [200, { customFields: state.fields }],
    'POST /locations/:id/customFields': (b) => { const f = { id: 'cf1', name: b.name }; state.fields.push(f); return [200, { customField: f }]; },
    'GET /contacts/:id': (b, id) => [200, { contact: state.contacts[id] || { id, firstName: 'Ann', tags: [] } }],
    'PUT /contacts/:id': () => [200, { succeded: true }],
    'POST /contacts/:id/tags': () => [200, {}],
    'DELETE /contacts/:id/tags': () => [200, {}],
    'POST /contacts/:id/notes': () => [200, {}],
    'GET /contacts/search/duplicate': () => [200, { contact: null }],
    'POST /contacts/search': () => [200, { contacts: [] }],
    'POST /conversations/messages': () => [200, { messageId: 'm1' }],
    'GET /users/': () => [200, { users: [{ id: 'u1', name: 'Uma' }, { id: 'u2', name: 'Vic' }] }],
    'PUT /opportunities/:id': () => [200, {}]
  }, over || {});
  async function fetch(url, opts) {
    const u = new URL(url);
    let body = opts.body;
    if (body instanceof URLSearchParams) { /* keep */ } else if (typeof body === 'string') body = JSON.parse(body);
    const method = opts.method || 'GET';
    calls.push({ method, path: u.pathname, query: Object.fromEntries(u.searchParams), body, auth: opts.headers.Authorization });
    for (const [k, fn] of Object.entries(routes)) {
      const [m, p] = k.split(' ');
      if (m !== method) continue;
      const re = new RegExp('^' + p.replace(/:id/g, '([^/]+)') + '$');
      const hit = u.pathname.match(re);
      if (hit) {
        const [status, json] = fn(body, hit[1] && decodeURIComponent(hit[1]), u);
        return { ok: status < 300, status, text: async () => JSON.stringify(json) };
      }
    }
    return { ok: false, status: 404, text: async () => '{"message":"no route ' + method + ' ' + u.pathname + '"}' };
  }
  return { fetch, calls, state, find: (m, re) => calls.filter((c) => c.method === m && re.test(c.path)) };
}

function setup(extraEnv, fakeOver) {
  const env = { SESSION_SECRET: 's'.repeat(40), ADMIN_PASSWORD: 'admin-password', CRON_SECRET: 'cron', BASE_URL: 'http://suite.test' };
  for (const p of PREFIXES) Object.assign(env, { [p + '_CLIENT_ID']: 'app' + p + '-x1', [p + '_CLIENT_SECRET']: 'sec', [p + '_SSO_KEY']: 'sso-' + p });
  Object.assign(env, extraEnv || {});
  const cfg = config.load(env);
  const g = fakeGhl(fakeOver);
  const store = createMemoryStore();
  const app = createSuite(cfg, { store, fetch: g.fetch });
  const server = app.listen(0);
  const base = 'http://127.0.0.1:' + server.address().port;
  const req = async (method, path, body, headers) => {
    const r = await fetch(base + path, { method, redirect: 'manual', headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}), body: body == null ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch (e) { /* html */ }
    return { status: r.status, text, json, headers: r.headers };
  };
  const install = (slug) => req('GET', '/' + slug + '/oauth/callback?code=abc');
  let n = 0;
  const hook = (slug, evt) => req('POST', '/' + slug + '/webhook', Object.assign({ locationId: LOC, webhookId: 'w' + (++n) }, evt));
  const sso = async (slug, role) => (await req('POST', '/' + slug + '/api/sso', { payload: encryptGhlSso({ userId: 'usr1', companyId: COMPANY, role: role || 'admin', type: 'account', activeLocation: LOC }, 'sso-' + PREFIXES[['lead-scorer', 'round-robin', 'contact-cleaner', 'after-hours', 'birthday-greeter'].indexOf(slug)]) })).json;
  return { cfg, g, store, app, req, install, hook, sso, close: () => server.close() };
}

test('public pages render for every app', async () => {
  const t = setup();
  try {
    for (const p of ['/', '/privacy', '/terms', '/admin/login']) assert.strictEqual((await t.req('GET', p)).status, 200, p);
    for (const a of t.app.locals.apps) {
      const l = await t.req('GET', '/' + a.slug);
      assert.strictEqual(l.status, 200);
      assert.match(l.text, /\$97/);
      const d = await t.req('GET', '/' + a.slug + '/docs');
      assert.match(d.text, new RegExp('http://suite.test/' + a.slug + '/oauth/callback'));
      assert.strictEqual((await t.req('GET', '/' + a.slug + '/embed')).status, 200);
      const i = await t.req('GET', '/' + a.slug + '/install');
      assert.strictEqual(i.status, 302);
      assert.match(i.headers.get('location'), /chooselocation.*client_id=app/);
    }
    assert.strictEqual((await t.req('GET', '/nope')).status, 404);
    const h = await t.req('GET', '/health');
    assert.strictEqual(h.json.apps['after-hours'].configured, true);
  } finally { t.close(); }
});

test('OAuth install stores an encrypted token and the location details', async () => {
  const t = setup();
  try {
    const r = await t.install('lead-scorer');
    assert.strictEqual(r.status, 200);
    assert.match(r.text, /Acme Dental/);
    const inst = await t.store.getInstall('lead-scorer', LOC);
    assert.strictEqual(inst.installed, true);
    assert.strictEqual(inst.timezone, 'America/New_York');
    assert.ok(!JSON.stringify(inst).includes('at1'), 'token must be encrypted');
    assert.strictEqual(t.g.find('POST', /oauth\/token/)[0].body.get('user_type'), 'Location');
  } finally { t.close(); }
});

test('SSO, settings read/write, and view-only users', async () => {
  const t = setup();
  try {
    await t.install('round-robin');
    const bad = await t.req('POST', '/round-robin/api/sso', { payload: encryptGhlSso({ activeLocation: LOC, role: 'admin' }, 'wrong') });
    assert.strictEqual(bad.status, 401);
    const s = await t.sso('round-robin');
    assert.ok(s.token && s.edit);
    const auth = { Authorization: 'Bearer ' + s.token };
    const g = await t.req('GET', '/round-robin/api/settings', null, auth);
    assert.strictEqual(g.status, 200);
    assert.deepStrictEqual(g.json.options.users.map((u) => u.id), ['u1', 'u2']);
    const p = await t.req('PUT', '/round-robin/api/settings', { settings: { weights: { u1: 2, u2: 1, 'bad id!': 3 }, only_tag: '  Facebook Lead ' } }, auth);
    assert.deepStrictEqual(p.json.settings.weights, { u1: 2, u2: 1 });
    assert.strictEqual(p.json.settings.only_tag, 'facebook lead');
    // A token for one app does not open another.
    assert.strictEqual((await t.req('GET', '/lead-scorer/api/settings', null, auth)).status, 401);
    const user = await t.sso('round-robin', 'user');
    assert.strictEqual(user.edit, false);
    assert.strictEqual((await t.req('PUT', '/round-robin/api/settings', { settings: {} }, { Authorization: 'Bearer ' + user.token })).status, 403);
    // Not installed in another app.
    assert.strictEqual((await t.req('POST', '/after-hours/api/sso', { payload: encryptGhlSso({ activeLocation: LOC, role: 'admin' }, 'sso-AFTER_HOURS') })).status, 404);
  } finally { t.close(); }
});

test('Lead Scorer: points, custom field, tiers, de-duplicated webhooks', async () => {
  const t = setup();
  try {
    await t.install('lead-scorer');
    await t.hook('lead-scorer', { type: 'ContactCreate', id: 'c1' });
    assert.strictEqual(await t.store.kvGet('lead-scorer:' + LOC + ':score:c1'), 5);
    assert.strictEqual(t.g.find('POST', /customFields$/).length, 1);
    assert.deepStrictEqual(t.g.find('PUT', /contacts\/c1$/)[0].body, { customFields: [{ id: 'cf1', field_value: 5 }] });
    assert.deepStrictEqual(t.g.find('POST', /c1\/tags/)[0].body, { tags: ['lead-cold'] });

    const appt = { type: 'AppointmentCreate', webhookId: 'same', appointment: { contactId: 'c1' } };
    await t.req('POST', '/lead-scorer/webhook', Object.assign({ locationId: LOC }, appt));
    await t.req('POST', '/lead-scorer/webhook', Object.assign({ locationId: LOC }, appt)); // retry
    assert.strictEqual(await t.store.kvGet('lead-scorer:' + LOC + ':score:c1'), 30);
    assert.deepStrictEqual(t.g.find('POST', /c1\/tags/)[1].body, { tags: ['lead-warm'] });
    assert.deepStrictEqual(t.g.find('DELETE', /c1\/tags/)[1].body, { tags: ['lead-cold', 'lead-hot'] });

    // Message points are capped per day (default 30).
    for (let i = 0; i < 5; i++) await t.hook('lead-scorer', { type: 'InboundMessage', contactId: 'c1', messageType: 'SMS', direction: 'inbound' });
    assert.strictEqual(await t.store.kvGet('lead-scorer:' + LOC + ':score:c1'), 60);
    assert.strictEqual(await t.store.kvGet('lead-scorer:' + LOC + ':tier:c1'), 'hot');
    assert.strictEqual(t.g.find('POST', /customFields$/).length, 1, 'field id is cached');
    const inst = await t.store.getInstall('lead-scorer', LOC);
    assert.strictEqual(inst.stats.events, 7);
  } finally { t.close(); }
});

test('Round Robin: weighted rotation, skip owned, opportunity follows contact owner', async () => {
  assert.deepStrictEqual(rr._test.rotation({ a: 3, b: 1 }), ['a', 'a', 'b', 'a']);
  assert.deepStrictEqual(rr._test.rotation({}), []);
  const t = setup();
  try {
    await t.install('round-robin');
    await t.store.patchInstall('round-robin', LOC, { settings: { weights: { u1: 2, u2: 1 }, assign_opportunities: true } });
    for (const id of ['c1', 'c2', 'c3']) await t.hook('round-robin', { type: 'ContactCreate', id });
    await t.hook('round-robin', { type: 'ContactCreate', id: 'c4', assignedTo: 'u9' });
    const puts = t.g.find('PUT', /contacts\//).map((c) => c.path.split('/').pop() + '=' + c.body.assignedTo);
    assert.deepStrictEqual(puts, ['c1=u1', 'c2=u2', 'c3=u1']);
    t.g.state.contacts.c5 = { id: 'c5', assignedTo: 'u2', tags: [] };
    await t.hook('round-robin', { type: 'OpportunityCreate', id: 'o1', contactId: 'c5' });
    assert.strictEqual(t.g.find('PUT', /opportunities\/o1/)[0].body.assignedTo, 'u2');
  } finally { t.close(); }
});

test('Contact Cleaner: formatting helpers', () => {
  const { properCase, e164, junkReasons } = cleaner._test;
  assert.strictEqual(properCase('jOHN  SMITH'), 'John Smith');
  assert.strictEqual(properCase('anne McDonald'), 'Anne McDonald');
  assert.strictEqual(properCase('MARY-ANNE o\'neil'), "Mary-Anne O'Neil");
  assert.strictEqual(properCase('McDonald'), 'McDonald');
  assert.strictEqual(e164('(415) 555-0123', 'US'), '+14155550123');
  assert.strictEqual(e164('1 415 555 0123', 'US'), '+14155550123');
  assert.strictEqual(e164('07700 900123', 'GB'), '+447700900123');
  assert.strictEqual(e164('0044 7700 900123', 'US'), '+447700900123');
  assert.strictEqual(e164('123', 'US'), null);
  assert.deepStrictEqual(junkReasons({ firstName: 'Test', email: 'a@mailinator.com' }), ['throwaway email domain mailinator.com', 'test or placeholder name']);
  assert.deepStrictEqual(junkReasons({ firstName: 'Jane', email: 'jane@acme.com' }), []);
});

test('Contact Cleaner: fixes a new contact and flags a duplicate', async () => {
  const t = setup({}, { 'GET /contacts/search/duplicate': () => [200, { contact: { id: 'old1', firstName: 'Jane', lastName: 'Doe' } }] });
  try {
    await t.install('contact-cleaner');
    await t.hook('contact-cleaner', { type: 'ContactCreate', id: 'c1', firstName: 'JANE', lastName: 'doe', email: ' Jane@Acme.COM ', phone: '415-555-0123' });
    assert.deepStrictEqual(t.g.find('PUT', /contacts\/c1/)[0].body, { firstName: 'Jane', lastName: 'Doe', email: 'jane@acme.com', phone: '+14155550123' });
    assert.deepStrictEqual(t.g.find('POST', /c1\/tags/)[0].body, { tags: ['possible-duplicate'] });
    assert.match(t.g.find('POST', /c1\/notes/)[0].body.body, /Jane Doe \(same email, contact old1\)/);
  } finally { t.close(); }
});

test('After-Hours: hours, next opening, reply once per cooldown', async () => {
  const s = makeSanitizer(after.fields)({});
  // Monday 2026-11-09 20:00 New York = 2026-11-10 01:00 UTC
  const monEvening = new Date('2026-11-10T01:00:00Z');
  assert.strictEqual(isOpen(s.hours, 'America/New_York', monEvening), false);
  assert.strictEqual(isOpen(s.hours, 'America/New_York', new Date('2026-11-09T15:00:00Z')), true);
  assert.strictEqual(after._test.nextOpen(s, 'America/New_York', monEvening), 'tomorrow at 9 AM');
  const fri = new Date('2026-11-14T01:00:00Z'); // Friday 20:00 NY
  assert.strictEqual(after._test.nextOpen(s, 'America/New_York', fri), 'on Monday at 9 AM');
  assert.strictEqual(after._test.nextOpen(Object.assign({}, s, { holidays: ['2026-11-16'] }), 'America/New_York', fri), 'on Tuesday at 9 AM');
  assert.strictEqual(after._test.nextOpen(s, 'America/New_York', new Date('2026-11-09T12:00:00Z')), 'today at 9 AM');

  const t = setup();
  try {
    await t.install('after-hours');
    const closed = {};
    for (const d of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']) closed[d] = { on: false, from: '09:00', to: '17:00' };
    await t.store.patchInstall('after-hours', LOC, { settings: { hours: closed } });
    await t.hook('after-hours', { type: 'InboundMessage', contactId: 'c1', messageType: 'SMS', direction: 'inbound' });
    await t.hook('after-hours', { type: 'InboundMessage', contactId: 'c1', messageType: 'SMS', direction: 'inbound' });
    await t.hook('after-hours', { type: 'InboundMessage', contactId: 'c2', messageType: 'CALL', direction: 'inbound' });
    const sent = t.g.find('POST', /conversations\/messages/);
    assert.strictEqual(sent.length, 1);
    assert.strictEqual(sent[0].body.type, 'SMS');
    assert.match(sent[0].body.message, /^Hi Ann, .*as soon as we can\. - Acme Dental$/);
  } finally { t.close(); }
});

test('Birthday Greeter: indexes birthdays and greets once per day', async () => {
  assert.strictEqual(bday._test.monthDay('1990-05-17'), '05-17');
  assert.strictEqual(bday._test.monthDay('1990-05-17T00:00:00.000Z'), '05-17');
  assert.strictEqual(bday._test.monthDay('5/7/1990'), '05-07');
  assert.strictEqual(bday._test.monthDay(''), null);
  const t = setup();
  try {
    await t.install('birthday-greeter');
    const today = localParts(new Date(), 'America/New_York');
    const dob = '1990-' + today.md;
    t.g.state.contacts.c1 = { id: 'c1', firstName: 'Bo', phone: '+14155550123', dateOfBirth: dob, tags: [] };
    await t.hook('birthday-greeter', { type: 'ContactCreate', id: 'c1', dateOfBirth: dob });
    await t.hook('birthday-greeter', { type: 'ContactCreate', id: 'c2', dateOfBirth: null });
    const r1 = await t.req('GET', '/api/cron/daily', null, { Authorization: 'Bearer cron' });
    assert.deepStrictEqual(r1.json.report, { 'birthday-greeter': '1/1' });
    await t.app.locals.runDaily();
    const sent = t.g.find('POST', /conversations\/messages/);
    assert.strictEqual(sent.length, 1);
    assert.match(sent[0].body.message, /Happy birthday, Bo!/);
    assert.deepStrictEqual(t.g.find('POST', /c1\/tags/)[0].body, { tags: ['birthday-today'] });
    assert.strictEqual((await t.req('GET', '/api/cron/daily')).status, 401);
  } finally { t.close(); }
});

test('expired tokens are refreshed; unsigned UNINSTALL needs HighLevel to agree', async () => {
  const t = setup();
  try {
    await t.install('contact-cleaner');
    await t.store.patchInstall('contact-cleaner', LOC, { expiresAt: new Date(Date.now() - 1000).toISOString() });
    await t.hook('contact-cleaner', { type: 'ContactCreate', id: 'c1', firstName: 'ann' });
    assert.strictEqual(t.g.find('POST', /oauth\/token/).length, 2);
    assert.strictEqual(t.g.find('PUT', /contacts\/c1/)[0].auth, 'Bearer at2');

    // Unsigned UNINSTALL while the token still works: ignored.
    await t.hook('contact-cleaner', { type: 'UNINSTALL' });
    assert.strictEqual((await t.store.getInstall('contact-cleaner', LOC)).installed, true);
    t.g.state.refreshFails = true;
    await t.hook('contact-cleaner', { type: 'UNINSTALL' });
    const inst = await t.store.getInstall('contact-cleaner', LOC);
    assert.strictEqual(inst.installed, false);
    assert.strictEqual(inst.tokens, null);
    // Events for an uninstalled app do nothing.
    const before = t.g.calls.length;
    await t.hook('contact-cleaner', { type: 'ContactCreate', id: 'c9', firstName: 'zed' });
    assert.strictEqual(t.g.calls.length, before);
  } finally { t.close(); }
});

test('signed webhooks: valid accepted, forged rejected', async () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const t = setup({ GHL_WEBHOOK_ED25519_KEY: publicKey.export({ type: 'spki', format: 'pem' }) });
  try {
    await t.install('lead-scorer');
    const body = JSON.stringify({ type: 'ContactCreate', id: 'c1', locationId: LOC });
    const sig = crypto.sign(null, Buffer.from(body), privateKey).toString('base64');
    assert.strictEqual((await t.req('POST', '/lead-scorer/webhook', body, { 'x-ghl-signature': sig })).status, 200);
    assert.strictEqual((await t.req('POST', '/lead-scorer/webhook', body.replace('c1', 'c2'), { 'x-ghl-signature': sig })).status, 401);
    assert.strictEqual((await t.req('POST', '/lead-scorer/webhook', body)).status, 401);
    assert.strictEqual(await t.store.kvGet('lead-scorer:' + LOC + ':score:c1'), 5);
  } finally { t.close(); }
});

test('admin panel requires the password', async () => {
  const t = setup();
  try {
    await t.install('lead-scorer');
    assert.strictEqual((await t.req('GET', '/admin')).status, 302);
    const bad = await t.req('POST', '/admin/login', 'password=nope', { 'Content-Type': 'application/x-www-form-urlencoded' });
    assert.strictEqual(bad.status, 401);
    const ok = await t.req('POST', '/admin/login', 'password=admin-password', { 'Content-Type': 'application/x-www-form-urlencoded' });
    const cookie = ok.headers.get('set-cookie').split(';')[0];
    const page = await t.req('GET', '/admin', null, { Cookie: cookie });
    assert.strictEqual(page.status, 200);
    assert.match(page.text, /Acme Dental/);
  } finally { t.close(); }
});

test('lead tiers helper', () => {
  const s = makeSanitizer(scorer.fields)({});
  assert.strictEqual(scorer._test.tierOf(0, s), 'cold');
  assert.strictEqual(scorer._test.tierOf(25, s), 'warm');
  assert.strictEqual(scorer._test.tierOf(60, s), 'hot');
});
