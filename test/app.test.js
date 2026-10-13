'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { createApp } = require('../server/app');

const COMPANY = 'AgencyCo123456';

// Fake HighLevel API: token exchange, refresh and company lookup.
function fakeGhl() {
  const state = { revoked: false, calls: [] };
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  state.fetch = async (url, opts) => {
    const u = String(url);
    state.calls.push(u);
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
    if (u.includes('/companies/')) {
      assert.strictEqual(opts.headers.Authorization, 'Bearer acc1');
      return json(200, { company: { id: COMPANY, name: 'Irvex Agency' } });
    }
    return json(404, {});
  };
  return state;
}

async function boot() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uc-'));
  const gh = fakeGhl();
  const cfg = {
    port: 0, baseUrl: 'http://127.0.0.1', secureCookies: false, dataDir,
    // Set TEST_MONGODB_URI to run the same tests against MongoDB.
    mongoUri: process.env.TEST_MONGODB_URI || '', mongoDb: 'uc_test_' + Date.now() + '_' + Math.floor(Math.random() * 1e6),
    adminPassword: 'admin-password-123', sessionSecret: 'x'.repeat(40),
    ghl: { clientId: 'cid', clientSecret: 'sec', scopes: 'companies.readonly', authUrl: 'https://marketplace.example/oauth/chooselocation', apiBase: 'https://api.example', apiVersion: '2021-07-28', webhookEd25519Key: '', webhookRsaKey: '' },
    redirectUri: 'http://127.0.0.1/oauth/callback'
  };
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

test('full agency lifecycle', async (t) => {
  const s = await boot();
  t.after(s.close);

  // Not licensed yet
  let r = await fetch(s.url + '/api/check?companyId=' + COMPANY);
  assert.deepStrictEqual(await r.json(), { companyId: COMPANY, licensed: false, status: 'not_installed' });

  // OAuth start -> redirect to chooselocation with our params
  r = await fetch(s.url + '/oauth/start', { redirect: 'manual' });
  const loc = new URL(r.headers.get('location'));
  assert.strictEqual(loc.origin + loc.pathname, 'https://marketplace.example/oauth/chooselocation');
  assert.strictEqual(loc.searchParams.get('client_id'), 'cid');
  const stateCookie = cookiesOf(r);

  // Wrong state is rejected
  r = await fetch(s.url + '/oauth/callback?code=abc&state=nope', { headers: { cookie: stateCookie }, redirect: 'manual' });
  assert.strictEqual(r.status, 400);

  // Location-level tokens are refused (app must be agency level)
  r = await fetch(s.url + '/oauth/callback?code=location-code', { redirect: 'manual' });
  assert.strictEqual(r.status, 400);
  assert.match(await r.text(), /agency/);

  // Marketplace install (no state) succeeds
  r = await fetch(s.url + '/oauth/callback?code=abc', { redirect: 'manual' });
  assert.strictEqual(r.status, 302);
  assert.strictEqual(r.headers.get('location'), '/dashboard');
  const cust = cookiesOf(r);

  r = await fetch(s.url + '/api/check?companyId=' + COMPANY);
  assert.strictEqual((await r.json()).licensed, true);

  // Dashboard shows snippets + one-time publish key
  r = await fetch(s.url + '/dashboard', { headers: { cookie: cust } });
  const page = await r.text();
  assert.match(page, /Irvex Agency/);
  const assetKey = page.match(/\/c\/(k_[A-Za-z0-9_-]+)\/theme\.css/)[1];
  const publishKey = page.match(/uc_pub_[A-Za-z0-9_-]+/)[0];
  const csrf = page.match(/'X-CSRF-Token':"([^"]+)"/)[1];

  // Licensed assets
  r = await fetch(s.url + '/c/' + assetKey + '/theme.css', { headers: { referer: 'https://app.irvex.com/v2/location/x' } });
  let css = await r.text();
  assert.match(css, /licensed to Irvex Agency/);
  assert.match(css, /#000414/);
  r = await fetch(s.url + '/c/' + assetKey + '/customizer.js');
  const js = await r.text();
  assert.match(js, new RegExp('"companyId":"' + COMPANY + '"'));
  assert.doesNotThrow(() => new vm.Script(js), 'bundle must be valid JavaScript');

  // In-app publish: wrong key, then right key
  const pub = (key, config) => fetch(s.url + '/api/publish', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-UC-Publish-Key': key },
    body: JSON.stringify({ key: assetKey, config })
  });
  r = await pub('uc_pub_wrong', {});
  assert.strictEqual(r.status, 401);
  r = await pub(publishKey, { colors: { navy: '#112233' }, hideSelectors: ['#sb_app-media'] });
  assert.strictEqual(r.status, 200);
  css = await (await fetch(s.url + '/c/' + assetKey + '/theme.css')).text();
  assert.match(css, /#112233/);
  assert.match(css, /#sb_app-media\{display:none!important\}/);

  // Dashboard save needs CSRF
  r = await fetch(s.url + '/dashboard/config', { method: 'POST', headers: { cookie: cust, 'Content-Type': 'application/json' }, body: JSON.stringify({ config: {} }) });
  assert.strictEqual(r.status, 403);
  r = await fetch(s.url + '/dashboard/config', { method: 'POST', headers: { cookie: cust, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ config: { colors: { navy: '#112233' }, fx: { ripple: false } } }) });
  assert.strictEqual((await r.json()).config.fx.ripple, false);

  // Domain lock
  r = await fetch(s.url + '/dashboard/domains', { method: 'POST', headers: { cookie: cust, 'Content-Type': 'application/x-www-form-urlencoded' }, body: '_csrf=' + encodeURIComponent(csrf) + '&hosts=app.irvex.com', redirect: 'manual' });
  assert.strictEqual(r.status, 302);
  css = await (await fetch(s.url + '/c/' + assetKey + '/theme.css', { headers: { referer: 'https://pirate.example.com/' } })).text();
  assert.match(css, /no active license/);
  css = await (await fetch(s.url + '/c/' + assetKey + '/theme.css', { headers: { referer: 'https://app.irvex.com/' } })).text();
  assert.match(css, /#112233/);

  // Admin: login, suspend -> assets go dark, resume
  r = await fetch(s.url + '/admin', { redirect: 'manual' });
  assert.strictEqual(r.headers.get('location'), '/admin/login');
  r = await fetch(s.url + '/admin/login', { method: 'POST', body: new URLSearchParams({ password: 'wrong' }), redirect: 'manual' });
  assert.strictEqual(r.status, 401);
  r = await fetch(s.url + '/admin/login', { method: 'POST', body: new URLSearchParams({ password: 'admin-password-123' }), redirect: 'manual' });
  const adm = cookiesOf(r);
  const list = await (await fetch(s.url + '/admin', { headers: { cookie: adm } })).text();
  assert.match(list, /Irvex Agency/);
  assert.match(list, /app\.irvex\.com/); // seen-on host
  const acsrf = list.match(/name="_csrf" value="([^"]+)"/)[1];

  r = await fetch(s.url + '/admin/i/' + COMPANY + '/suspend', { method: 'POST', headers: { cookie: adm }, body: new URLSearchParams({ _csrf: 'bad' }), redirect: 'manual' });
  assert.strictEqual(r.status, 403);
  r = await fetch(s.url + '/admin/i/' + COMPANY + '/suspend', { method: 'POST', headers: { cookie: adm }, body: new URLSearchParams({ _csrf: acsrf }), redirect: 'manual' });
  assert.strictEqual(r.status, 302);
  assert.match(await (await fetch(s.url + '/c/' + assetKey + '/customizer.js')).text(), /License inactive/);
  assert.strictEqual((await (await fetch(s.url + '/api/check?companyId=' + COMPANY)).json()).status, 'suspended');
  await fetch(s.url + '/admin/i/' + COMPANY + '/resume', { method: 'POST', headers: { cookie: adm }, body: new URLSearchParams({ _csrf: acsrf }), redirect: 'manual' });
  assert.strictEqual((await (await fetch(s.url + '/api/check?companyId=' + COMPANY)).json()).licensed, true);

  // Unsigned UNINSTALL webhook while the token is still valid: ignored
  await fetch(s.url + '/webhooks/ghl', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'UNINSTALL', companyId: COMPANY }) });
  await new Promise((res) => setTimeout(res, 50));
  assert.strictEqual((await (await fetch(s.url + '/api/check?companyId=' + COMPANY)).json()).licensed, true);

  // Real uninstall: HighLevel revoked the token -> license off
  s.gh.revoked = true;
  await fetch(s.url + '/webhooks/ghl', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'UNINSTALL', companyId: COMPANY }) });
  await new Promise((res) => setTimeout(res, 50));
  assert.deepStrictEqual(await (await fetch(s.url + '/api/check?companyId=' + COMPANY)).json(), { companyId: COMPANY, licensed: false, status: 'not_installed' });
  assert.match(await (await fetch(s.url + '/c/' + assetKey + '/theme.css')).text(), /no active license/);
});

test('admin manual license + validation', async (t) => {
  const s = await boot();
  t.after(s.close);
  let r = await fetch(s.url + '/admin/login', { method: 'POST', body: new URLSearchParams({ password: 'admin-password-123' }), redirect: 'manual' });
  const adm = cookiesOf(r);
  const acsrf = (await (await fetch(s.url + '/admin', { headers: { cookie: adm } })).text()).match(/name="_csrf" value="([^"]+)"/)[1];
  r = await fetch(s.url + '/admin/add', { method: 'POST', headers: { cookie: adm }, body: new URLSearchParams({ _csrf: acsrf, companyId: 'bad id!', name: 'x' }), redirect: 'manual' });
  assert.strictEqual(r.headers.get('location'), '/admin');
  r = await fetch(s.url + '/admin/add', { method: 'POST', headers: { cookie: adm }, body: new URLSearchParams({ _csrf: acsrf, companyId: 'CompTest999', name: '<b>Comp</b>' }), redirect: 'manual' });
  assert.strictEqual(r.headers.get('location'), '/admin/i/CompTest999');
  const detail = await (await fetch(s.url + '/admin/i/CompTest999', { headers: { cookie: adm } })).text();
  assert.match(detail, /&lt;b&gt;Comp&lt;\/b&gt;/);
  assert.ok(!detail.includes('<b>Comp</b>'));
  assert.strictEqual((await (await fetch(s.url + '/api/check?companyId=CompTest999')).json()).licensed, true);
  r = await fetch(s.url + '/api/check?companyId=../../etc');
  assert.strictEqual(r.status, 400);
});
