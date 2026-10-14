'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { createApp } = require('../server/app');

const COMPANY = 'AgencyCo123456';
const DOMAIN = 'https://app.irvex.com';

// Fake HighLevel API: token exchange, refresh and company lookup.
function fakeGhl() {
  const state = { revoked: false };
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  state.fetch = async (url, opts) => {
    const u = String(url);
    if (u.endsWith('/oauth/token')) {
      const p = new URLSearchParams(String(opts.body));
      assert.strictEqual(p.get('user_type'), 'Company');
      if (p.get('grant_type') === 'authorization_code') {
        if (p.get('code') === 'location-code') return json(200, { access_token: 'a', refresh_token: 'r', userType: 'Location', locationId: 'L1' });
        return json(200, { access_token: 'acc1', refresh_token: 'ref1', expires_in: 86399, userType: 'Company', companyId: COMPANY, userId: 'U1', scope: 'companies.readonly' });
      }
      if (state.revoked) return json(400, { error: 'invalid_grant', error_description: 'Invalid grant: refresh token is invalid' });
      return json(200, { access_token: 'acc2', refresh_token: 'ref2', expires_in: 86399, userType: 'Company', companyId: COMPANY });
    }
    if (u.includes('/companies/')) return json(200, { company: { id: COMPANY, name: 'Irvex Agency' } });
    return json(404, {});
  };
  return state;
}

async function boot(extra) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uc-'));
  const gh = fakeGhl();
  const cfg = {
    port: 0, baseUrl: 'http://127.0.0.1', secureCookies: false, dataDir,
    // Set TEST_MONGODB_URI to run the same tests against MongoDB.
    mongoUri: process.env.TEST_MONGODB_URI || '', mongoDb: 'uc_test_' + Date.now() + '_' + Math.floor(Math.random() * 1e6),
    adminPassword: 'admin-password-123', sessionSecret: 'x'.repeat(40), cronSecret: 'cron-secret',
    ghl: { clientId: 'cid', clientSecret: 'sec', scopes: 'companies.readonly', authUrl: 'https://marketplace.example/oauth/chooselocation', apiBase: 'https://api.example', apiVersion: '2021-07-28', webhookEd25519Key: '', webhookRsaKey: '' },
    redirectUri: 'http://127.0.0.1/oauth/callback',
    brand: { name: 'Ultimate Customizer', supportEmail: 'help@example.com', legalName: 'UC', legalUpdated: 'today', marketplaceUrl: '' }
  };
  Object.assign(cfg, extra || {});
  const app = createApp(cfg, { fetch: gh.fetch });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const url = 'http://127.0.0.1:' + server.address().port;
  const close = async () => {
    await new Promise((r) => server.close(r));
    const store = app.locals.store;
    if (store.kind === 'mongo') {
      const { MongoClient } = require('mongodb');
      const c = await MongoClient.connect(cfg.mongoUri);
      await c.db(cfg.mongoDb).dropDatabase();
      await c.close();
    }
    await store.close();
  };
  return { app, server, url, gh, close };
}

const cookiesOf = (res) => (res.headers.getSetCookie ? res.headers.getSetCookie() : []).map((c) => c.split(';')[0]).filter((c) => !c.endsWith('=')).join('; ');
const from = (origin) => ({ Referer: origin + '/v2/location/abc', Origin: origin });

async function installAndSignIn(s) {
  const r = await fetch(s.url + '/oauth/callback?code=abc', { redirect: 'manual' });
  assert.strictEqual(r.headers.get('location'), '/app');
  const cust = cookiesOf(r);
  const page = await (await fetch(s.url + '/app', { headers: { cookie: cust } })).text();
  return {
    cust, page,
    key: (await s.app.locals.store.get(COMPANY)).key,
    csrf: page.match(/name="_csrf" value="([^"]+)"/)[1]
  };
}

async function connectDomain(s, a, origin) {
  const pair = 'pair_' + Math.random().toString(36).slice(2) + 'abcdefghijklmnop';
  const claim = () => fetch(s.url + '/api/connect/claim', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, from(origin)), body: JSON.stringify({ key: a.key, pair }) });
  // Script polls before approval: pending
  let r = await claim();
  assert.strictEqual(r.status, 202);
  // Admin approves in the popup
  r = await fetch(s.url + '/connect?key=' + a.key + '&pair=' + pair, { headers: { cookie: a.cust } });
  assert.strictEqual(r.status, 200);
  assert.match(await r.text(), /Approve/);
  r = await fetch(s.url + '/connect', { method: 'POST', headers: { cookie: a.cust }, body: new URLSearchParams({ _csrf: a.csrf, key: a.key, pair }) });
  assert.match(await r.text(), /Approved/);
  r = await claim();
  assert.strictEqual(r.status, 200);
  const j = await r.json();
  assert.strictEqual(j.host, new URL(origin).hostname);
  // A pairing can only be claimed once
  assert.strictEqual((await claim()).status, 202);
  return j.token;
}

test('install, connect, edit live, lock to agency, suspend, uninstall', async (t) => {
  const s = await boot();
  t.after(s.close);

  // Location-level tokens are refused (app must be agency level)
  let r = await fetch(s.url + '/oauth/callback?code=location-code', { redirect: 'manual' });
  assert.strictEqual(r.status, 400);

  // App page is private
  r = await fetch(s.url + '/app');
  assert.match(await r.text(), /Sign in with HighLevel/);

  const a = await installAndSignIn(s);
  assert.match(a.page, /Irvex Agency/);
  assert.match(a.page, /@import url\(/);
  assert.match(a.page, /&lt;script src=/);
  assert.strictEqual((await (await fetch(s.url + '/api/check?companyId=' + COMPANY)).json()).licensed, true);

  // Before connecting: CSS inert, JS in setup mode (Connect button only)
  r = await fetch(s.url + '/c/' + a.key + '/theme.css', { headers: from(DOMAIN) });
  assert.match(await r.text(), /no active license for this domain/);
  let js = await (await fetch(s.url + '/c/' + a.key + '/customizer.js', { headers: from(DOMAIN) })).text();
  assert.match(js, /"mode":"setup"/);
  assert.doesNotThrow(() => new vm.Script(js));

  // Connect popup refuses a pairing for another agency's key
  r = await fetch(s.url + '/connect?key=k_someoneelse1234567&pair=abcdefghijklmnopqrstuvwxyz', { headers: { cookie: a.cust } });
  assert.strictEqual(r.status, 400);
  assert.match(await r.text(), /different agency/);

  const token = await connectDomain(s, a, DOMAIN);

  // Connected: full CSS + JS
  let css = await (await fetch(s.url + '/c/' + a.key + '/theme.css', { headers: { Referer: DOMAIN + '/' } })).text();
  assert.match(css, /licensed to Irvex Agency/);
  assert.match(css, /#000414/);
  js = await (await fetch(s.url + '/c/' + a.key + '/customizer.js', { headers: { Referer: DOMAIN + '/' } })).text();
  assert.match(js, /"mode":"full"/);
  assert.match(js, new RegExp('"companyId":"' + COMPANY + '"'));
  assert.doesNotThrow(() => new vm.Script(js));
  r = await fetch(s.url + '/c/' + a.key + '/template.css', { headers: { Referer: DOMAIN + '/' } });
  assert.match(await r.text(), /\[\[sidebar\.bg\]\]/);

  // Another agency pasting the snippets: inert, and logged as blocked
  css = await (await fetch(s.url + '/c/' + a.key + '/theme.css', { headers: { Referer: 'https://crm.pirate.com/' } })).text();
  assert.match(css, /no active license/);
  js = await (await fetch(s.url + '/c/' + a.key + '/customizer.js', { headers: { Referer: 'https://crm.pirate.com/' } })).text();
  assert.match(js, /"mode":"setup"/);
  assert.match(js, /"config":\{"v":2,"theme":"irvex","values":\{\}/, 'setup mode never ships the real config');
  assert.strictEqual((await fetch(s.url + '/c/' + a.key + '/template.css', { headers: { Referer: 'https://crm.pirate.com/' } })).status, 403);

  // Live editing: save with editor token, from the connected origin only
  const put = (tok, origin, config) => fetch(s.url + '/api/config', {
    method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, from(origin)),
    body: JSON.stringify({ key: a.key, config })
  });
  r = await put(token, 'https://crm.pirate.com', { values: { base: '#112233' } });
  assert.strictEqual(r.status, 401);
  r = await put('forged', DOMAIN, { values: { base: '#112233' } });
  assert.strictEqual(r.status, 401);
  r = await put(token, DOMAIN, { values: { base: '#112233', 'login.tagline': 'Welcome back' }, hideSelectors: ['#sb_app-media'] });
  assert.strictEqual(r.status, 200);
  const v = (await r.json()).version;
  css = await (await fetch(s.url + '/c/' + a.key + '/theme.css', { headers: { Referer: DOMAIN + '/' } })).text();
  assert.match(css, /#112233/);
  assert.match(css, /#sb_app-media\{display:none!important\}/);
  // Realtime endpoint for open tabs
  let vj = await (await fetch(s.url + '/c/' + a.key + '/v.json?have=1', { headers: from(DOMAIN) })).json();
  assert.strictEqual(vj.v, v);
  assert.strictEqual(vj.config.values['login.tagline'], 'Welcome back');
  vj = await (await fetch(s.url + '/c/' + a.key + '/v.json?have=' + v, { headers: from(DOMAIN) })).json();
  assert.strictEqual(vj.config, undefined);

  // Shared HighLevel domain: theme only via the verified fetch
  r = await fetch(s.url + '/app/domains/add', { method: 'POST', headers: { cookie: a.cust }, body: new URLSearchParams({ _csrf: a.csrf, host: 'https://app.gohighlevel.com/' }), redirect: 'manual' });
  assert.strictEqual(r.status, 302);
  const GHL = 'https://app.gohighlevel.com';
  assert.match(await (await fetch(s.url + '/c/' + a.key + '/theme.css', { headers: from(GHL) })).text(), /no active license/);
  assert.match(await (await fetch(s.url + '/c/' + a.key + '/theme.css', { headers: Object.assign({ 'X-UC-Verified': '1' }, from(GHL)) })).text(), /#112233/);
  assert.match(await (await fetch(s.url + '/c/' + a.key + '/customizer.js', { headers: from(GHL) })).text(), /"mode":"verify"/);

  // Super Admin
  r = await fetch(s.url + '/admin', { redirect: 'manual' });
  assert.strictEqual(r.headers.get('location'), '/admin/login');
  r = await fetch(s.url + '/admin/login', { method: 'POST', body: new URLSearchParams({ password: 'wrong' }), redirect: 'manual' });
  assert.strictEqual(r.status, 401);
  r = await fetch(s.url + '/admin/login', { method: 'POST', body: new URLSearchParams({ password: 'admin-password-123' }), redirect: 'manual' });
  const adm = cookiesOf(r);
  const list = await (await fetch(s.url + '/admin', { headers: { cookie: adm } })).text();
  assert.match(list, /Irvex Agency/);
  assert.match(list, /app\.irvex\.com/);
  const acsrf = list.match(/name="_csrf" value="([^"]+)"/)[1];
  const detail = await (await fetch(s.url + '/admin/i/' + COMPANY, { headers: { cookie: adm } })).text();
  assert.match(detail, /crm\.pirate\.com/, 'blocked attempt listed');

  r = await fetch(s.url + '/admin/i/' + COMPANY + '/suspend', { method: 'POST', headers: { cookie: adm }, body: new URLSearchParams({ _csrf: 'bad' }), redirect: 'manual' });
  assert.strictEqual(r.status, 403);
  await fetch(s.url + '/admin/i/' + COMPANY + '/suspend', { method: 'POST', headers: { cookie: adm }, body: new URLSearchParams({ _csrf: acsrf }), redirect: 'manual' });
  assert.match(await (await fetch(s.url + '/c/' + a.key + '/customizer.js', { headers: { Referer: DOMAIN + '/' } })).text(), /License inactive/);
  assert.strictEqual((await put(token, DOMAIN, {})).status, 403);
  await fetch(s.url + '/admin/i/' + COMPANY + '/resume', { method: 'POST', headers: { cookie: adm }, body: new URLSearchParams({ _csrf: acsrf }), redirect: 'manual' });

  // Agency signs out all editors: old token stops working
  await fetch(s.url + '/app/revoke-editors', { method: 'POST', headers: { cookie: a.cust }, body: new URLSearchParams({ _csrf: a.csrf }), redirect: 'manual' });
  assert.strictEqual((await put(token, DOMAIN, {})).status, 401);

  // Unsigned UNINSTALL webhook while the token is still valid: ignored
  await fetch(s.url + '/webhooks/ghl', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'UNINSTALL', companyId: COMPANY }) });
  assert.strictEqual((await (await fetch(s.url + '/api/check?companyId=' + COMPANY)).json()).licensed, true);
  // Real uninstall: HighLevel revoked the token
  s.gh.revoked = true;
  await fetch(s.url + '/webhooks/ghl', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'UNINSTALL', companyId: COMPANY }) });
  assert.deepStrictEqual(await (await fetch(s.url + '/api/check?companyId=' + COMPANY)).json(), { companyId: COMPANY, licensed: false, status: 'not_installed' });
  assert.match(await (await fetch(s.url + '/c/' + a.key + '/theme.css', { headers: { Referer: DOMAIN + '/' } })).text(), /no active license/);

  // Cron endpoint is protected
  assert.strictEqual((await fetch(s.url + '/api/cron/verify')).status, 401);
  assert.strictEqual((await fetch(s.url + '/api/cron/verify', { headers: { Authorization: 'Bearer cron-secret' } })).status, 200);
});

test('public pages, sign-in redirect and manual licenses', async (t) => {
  const s = await boot();
  t.after(s.close);
  for (const p of ['/', '/docs', '/privacy', '/terms']) {
    const body = await (await fetch(s.url + p)).text();
    assert.match(body, /help@example\.com/, p + ' shows the support email');
    assert.match(body, /href="\/privacy"/);
  }
  // Connect link without a session -> sign in, then come back to the connect page
  let r = await fetch(s.url + '/connect?key=k_abcdefghijkl&pair=abcdefghijklmnopqrstuvwxyz');
  const signIn = await r.text();
  const start = signIn.match(/href="(\/oauth\/start\?next=[^"]+)"/)[1].replace(/&amp;/g, '&');
  r = await fetch(s.url + start, { redirect: 'manual' });
  const state = new URL(r.headers.get('location')).searchParams.get('state');
  r = await fetch(s.url + '/oauth/callback?code=abc&state=' + state, { headers: { cookie: cookiesOf(r) }, redirect: 'manual' });
  assert.strictEqual(r.headers.get('location'), '/connect?key=k_abcdefghijkl&pair=abcdefghijklmnopqrstuvwxyz');

  r = await fetch(s.url + '/admin/login', { method: 'POST', body: new URLSearchParams({ password: 'admin-password-123' }), redirect: 'manual' });
  const adm = cookiesOf(r);
  const acsrf = (await (await fetch(s.url + '/admin', { headers: { cookie: adm } })).text()).match(/name="_csrf" value="([^"]+)"/)[1];
  r = await fetch(s.url + '/admin/add', { method: 'POST', headers: { cookie: adm }, body: new URLSearchParams({ _csrf: acsrf, companyId: 'CompTest999', name: '<b>Comp</b>' }), redirect: 'manual' });
  assert.strictEqual(r.headers.get('location'), '/admin/i/CompTest999');
  const detail = await (await fetch(s.url + '/admin/i/CompTest999', { headers: { cookie: adm } })).text();
  assert.match(detail, /&lt;b&gt;Comp&lt;\/b&gt;/);
  assert.ok(!detail.includes('<b>Comp</b>'));
  assert.strictEqual((await (await fetch(s.url + '/api/check?companyId=CompTest999')).json()).licensed, true);
  assert.strictEqual((await fetch(s.url + '/api/check?companyId=../../etc')).status, 400);
});

test('agencies that have not bought get nothing', async (t) => {
  const s = await boot();
  t.after(s.close);
  const H = { Referer: 'https://app.someagency.com/', Origin: 'https://app.someagency.com' };
  // Made-up asset key (no install record): inert CSS + JS, no template, no config
  for (const f of ['theme.css', 'customizer.js']) assert.match(await (await fetch(s.url + '/c/k_neverpurchased1234/' + f, { headers: H })).text(), /no active license/);
  assert.strictEqual((await fetch(s.url + '/c/k_neverpurchased1234/template.css', { headers: H })).status, 403);
  assert.strictEqual((await fetch(s.url + '/c/k_neverpurchased1234/v.json', { headers: H })).status, 403);
  assert.strictEqual((await fetch(s.url + '/c/k_neverpurchased1234/theme.css', { headers: Object.assign({ 'X-UC-Verified': '1' }, H) })).status, 200);
  assert.match(await (await fetch(s.url + '/c/k_neverpurchased1234/theme.css', { headers: Object.assign({ 'X-UC-Verified': '1' }, H) })).text(), /no active license/);
  assert.strictEqual((await (await fetch(s.url + '/api/check?companyId=NeverBought123')).json()).licensed, false);
  // Saving or connecting with a made-up key is refused
  let r = await fetch(s.url + '/api/connect/claim', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, H), body: JSON.stringify({ key: 'k_neverpurchased1234', pair: 'abcdefghijklmnopqrstuvwxyz' }) });
  assert.strictEqual(r.status, 403);
  r = await fetch(s.url + '/api/config', { method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/json', Authorization: 'Bearer x' }, H), body: JSON.stringify({ key: 'k_neverpurchased1234', config: {} }) });
  assert.strictEqual(r.status, 401);
  // Forged session cookies are rejected
  r = await fetch(s.url + '/app', { headers: { cookie: 'uc_cust=eyJjb21wYW55SWQiOiJBZ2VuY3lDbzEyMzQ1NiJ9.forged' } });
  assert.match(await r.text(), /Sign in with HighLevel/);
});

test('approval mode: new installs stay off until approved', async (t) => {
  const s = await boot({ newInstallStatus: 'pending' });
  t.after(s.close);
  const a = await installAndSignIn(s);
  assert.match(a.page, /Pending approval/);
  assert.deepStrictEqual(await (await fetch(s.url + '/api/check?companyId=' + COMPANY)).json(), { companyId: COMPANY, licensed: false, status: 'pending' });
  assert.match(await (await fetch(s.url + '/c/' + a.key + '/customizer.js', { headers: from(DOMAIN) })).text(), /License inactive/);
  // Connecting a domain is refused while pending
  const r = await fetch(s.url + '/connect?key=' + a.key + '&pair=abcdefghijklmnopqrstuvwxyz', { headers: { cookie: a.cust } });
  assert.strictEqual(r.status, 400);
  // Super Admin approves
  let res = await fetch(s.url + '/admin/login', { method: 'POST', body: new URLSearchParams({ password: 'admin-password-123' }), redirect: 'manual' });
  const adm = cookiesOf(res);
  const list = await (await fetch(s.url + '/admin', { headers: { cookie: adm } })).text();
  assert.match(list, /1 pending approval/);
  const acsrf = list.match(/name="_csrf" value="([^"]+)"/)[1];
  await fetch(s.url + '/admin/i/' + COMPANY + '/approve', { method: 'POST', headers: { cookie: adm }, body: new URLSearchParams({ _csrf: acsrf }), redirect: 'manual' });
  assert.strictEqual((await (await fetch(s.url + '/api/check?companyId=' + COMPANY)).json()).licensed, true);
  await connectDomain(s, a, DOMAIN);
  assert.match(await (await fetch(s.url + '/c/' + a.key + '/customizer.js', { headers: { Referer: DOMAIN + '/' } })).text(), /"mode":"full"/);
  // Uninstalling and signing in again does not reactivate on its own
  s.gh.revoked = true;
  await fetch(s.url + '/webhooks/ghl', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'UNINSTALL', companyId: COMPANY }) });
  s.gh.revoked = false;
  await fetch(s.url + '/oauth/callback?code=abc', { redirect: 'manual' });
  assert.strictEqual((await (await fetch(s.url + '/api/check?companyId=' + COMPANY)).json()).status, 'pending');
});

test('sidebar page inside HighLevel signs in with SSO', async (t) => {
  const crypto = require('crypto');
  const KEY = 'sso-shared-secret';
  const enc = (obj) => { // same format as CryptoJS.AES.encrypt(text, passphrase)
    const salt = crypto.randomBytes(8);
    let d = Buffer.alloc(0), p = Buffer.alloc(0);
    while (d.length < 48) { p = crypto.createHash('md5').update(Buffer.concat([p, Buffer.from(KEY), salt])).digest(); d = Buffer.concat([d, p]); }
    const c = crypto.createCipheriv('aes-256-cbc', d.subarray(0, 32), d.subarray(32, 48));
    return Buffer.concat([Buffer.from('Salted__'), salt, c.update(JSON.stringify(obj)), c.final()]).toString('base64');
  };
  const s = await boot();
  s.app.locals.cfg.ghl.ssoKey = KEY;
  t.after(s.close);
  await installAndSignIn(s);

  let r = await fetch(s.url + '/embed');
  assert.match(r.headers.get('content-security-policy'), /frame-ancestors https:/);
  assert.strictEqual(r.headers.get('x-frame-options'), null);
  assert.match(await r.text(), /REQUEST_USER_DATA/);

  const sso = (obj) => fetch(s.url + '/api/sso', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payload: obj === 'garbage' ? 'U2FsdGVkX1+garbage' : enc(obj) }) });
  assert.strictEqual((await sso('garbage')).status, 401);
  assert.strictEqual((await sso({ companyId: COMPANY, type: 'agency', role: 'user' })).status, 403);
  assert.strictEqual((await sso({ companyId: COMPANY, type: 'location', role: 'admin' })).status, 403);
  assert.strictEqual((await sso({ companyId: 'NeverInstalled1', type: 'agency', role: 'admin' })).status, 404);
  r = await sso({ companyId: COMPANY, type: 'agency', role: 'admin', email: 'boss@irvex.com' });
  const { token } = await r.json();
  assert.ok(token);

  // App page works with the token, framed, without cookies
  r = await fetch(s.url + '/app?t=' + encodeURIComponent(token));
  const page = await r.text();
  assert.match(page, /Your code/);
  assert.match(r.headers.get('content-security-policy'), /frame-ancestors https:/);
  const csrf = page.match(/name="_csrf" value="([^"]+)"/)[1];
  assert.match(page, /name="t" value=/, 'forms carry the token');
  r = await fetch(s.url + '/app/domains/add', { method: 'POST', body: new URLSearchParams({ _csrf: csrf, t: token, host: 'app.irvex.com' }), redirect: 'manual' });
  assert.strictEqual(r.status, 302);
  assert.match(r.headers.get('location'), /^\/app\?t=/);
  // Codes are only shown while the license is active
  s.gh.revoked = true;
  await fetch(s.url + '/webhooks/ghl', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'UNINSTALL', companyId: COMPANY }) });
  const after = await (await fetch(s.url + '/app?t=' + encodeURIComponent(token))).text();
  assert.ok(!/\/c\/k_[\w-]+\/theme\.css/.test(after), 'no snippets after uninstall');
  assert.match(after, /once your license is active/);
  // Tampered token is rejected; the normal cookie page still refuses framing
  assert.match(await (await fetch(s.url + '/app?t=' + encodeURIComponent(token) + 'x')).text(), /Session expired/);
  r = await fetch(s.url + '/app');
  assert.strictEqual(r.headers.get('x-frame-options'), 'DENY');
});
