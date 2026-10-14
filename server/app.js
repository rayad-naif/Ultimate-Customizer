'use strict';
const express = require('express');
const { createSecurity, randomToken, safeEqual, rateLimiter } = require('./security');
const { createStore } = require('./store');
const { createGhl } = require('./ghl');
const { createLicensing } = require('./licensing');
const { createBundler } = require('./bundle');
const { createViews } = require('./views');

const ADMIN_COOKIE = 'uc_admin';
const CUST_COOKIE = 'uc_cust';
const FLASH_COOKIE = 'uc_flash';
const STATE_COOKIE = 'uc_oauth_state';
const ADMIN_TTL = 12 * 3600e3;
const CUST_TTL = 7 * 24 * 3600e3;

function createApp(cfg, deps) {
  deps = deps || {};
  const sec = createSecurity(cfg.sessionSecret);
  const store = deps.store || createStore(cfg);
  const ghl = deps.ghl || createGhl(cfg, deps.fetch);
  const lic = createLicensing(store, ghl, sec, { newInstallStatus: cfg.newInstallStatus });
  const bundler = createBundler(cfg);
  const views = createViews(Object.assign({ baseUrl: cfg.baseUrl }, cfg.brand));
  const ownHost = new URL(cfg.baseUrl).hostname;

  const limitCheck = rateLimiter(30, 60e3);
  const limitLogin = rateLimiter(8, 15 * 60e3);
  const limitApi = rateLimiter(150, 60e3);

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  /* ---------------- helpers ---------------- */
  // Express 4 does not catch rejected promises; route them to the error handler.
  const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

  function parseCookies(req) {
    const out = {};
    (req.headers.cookie || '').split(';').forEach((p) => {
      const i = p.indexOf('=');
      if (i > 0) { try { out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); } catch (e) { /* bad cookie */ } }
    });
    return out;
  }
  function setCookie(res, name, value, o) {
    o = o || {};
    let c = name + '=' + encodeURIComponent(value) + '; Path=/; HttpOnly; SameSite=' + (o.sameSite || 'Lax');
    if (cfg.secureCookies) c += '; Secure';
    if (o.maxAge !== undefined) c += '; Max-Age=' + Math.floor(o.maxAge / 1000);
    const prev = res.getHeader('Set-Cookie');
    res.setHeader('Set-Cookie', (Array.isArray(prev) ? prev : prev ? [prev] : []).concat(c));
  }
  const clearCookie = (res, name) => setCookie(res, name, '', { maxAge: 0 });
  function session(req, name) {
    const s = sec.unsign(parseCookies(req)[name]);
    return s && s.csrf ? s : null;
  }
  const flash = (res, f) => setCookie(res, FLASH_COOKIE, sec.encrypt(JSON.stringify(f)), { maxAge: 120e3 });
  function takeFlash(req, res) {
    const raw = parseCookies(req)[FLASH_COOKIE];
    if (!raw) return null;
    clearCookie(res, FLASH_COOKIE);
    try { return JSON.parse(sec.decrypt(raw)); } catch (e) { return null; }
  }
  const html = (res, body, status) => {
    res.status(status || 200).set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'same-origin', 'X-Content-Type-Options': 'nosniff' }).send(body);
  };
  const noFrame = (res) => res.set({ 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "frame-ancestors 'none'" });
  function csrfOk(req, s) {
    const t = req.get('X-CSRF-Token') || (req.body && req.body._csrf);
    return !!(s && t && safeEqual(t, s.csrf));
  }
  const clientIp = (req) => req.ip || 'unknown';
  // Where a request comes from: Origin (CORS calls) or Referer (CSS/JS loads).
  function originHost(req) {
    const o = req.get('Origin');
    if (!o || o === 'null') return '';
    try { return new URL(o).hostname.toLowerCase(); } catch (e) { return ''; }
  }
  function requestHost(req) {
    const o = originHost(req);
    if (o) return o;
    const r = req.get('Referer');
    if (!r) return '';
    try { return new URL(r).hostname.toLowerCase(); } catch (e) { return ''; }
  }
  const safeNext = (n) => (typeof n === 'string' && /^\/(app|connect)(\?[\w=&%.~-]*)?$/.test(n) && n.length <= 400 ? n : null);
  const cors = (res) => res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-UC-Verified',
    'Access-Control-Max-Age': '600'
  });

  /* ---------------- webhooks (raw body, before parsers) ---------------- */
  app.post('/webhooks/ghl', express.raw({ type: '*/*', limit: '256kb' }), ah(async (req, res) => {
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    const verified = ghl.verifyWebhook(raw, req.headers);
    if (verified === false) return res.status(401).json({ error: 'bad signature' });
    let evt;
    try { evt = JSON.parse(raw.toString('utf8')); } catch (e) { return res.status(400).json({ error: 'bad json' }); }
    // Work happens before the response: serverless functions freeze once they reply.
    const companyId = evt && typeof evt.companyId === 'string' ? evt.companyId : null;
    const inst = companyId && await lic.get(companyId);
    try {
      if (inst && evt.type === 'UNINSTALL' && !evt.locationId) {
        // Only trust an unsigned webhook after HighLevel itself confirms the token is gone.
        if (verified === true) await lic.markUninstalled(inst, 'webhook');
        else await lic.verify(inst);
      } else if (inst && evt.type === 'INSTALL') {
        await store.log(companyId, 'webhook_install', evt.locationId ? 'location ' + evt.locationId : '');
      }
    } catch (e) {
      try { await store.log(companyId, 'webhook_error', e.message); } catch (x) { /* ignore */ }
    }
    res.json({ ok: true });
  }));

  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(express.json({ limit: '200kb' }));

  /* ---------------- licensed assets (loaded inside HighLevel) ---------------- */
  async function assetCtx(req) {
    const inst = /^k_[A-Za-z0-9_-]{10,64}$/.test(req.params.key) ? await lic.byKey(req.params.key) : null;
    const host = requestHost(req);
    const mode = lic.modeFor(inst, host);
    if (inst && mode !== 'off' && host && host !== ownHost) {
      try { await lic.noteRequest(inst, host, mode === 'full' || mode === 'verify'); } catch (e) { /* bookkeeping only */ }
    }
    return { inst, host, mode };
  }
  function assetHeaders(res, type) {
    cors(res).set({
      'Content-Type': type,
      // Revalidate every load (cheap 304 via ETag) so changes and suspensions apply at once.
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Vary': 'Origin, Referer, X-UC-Verified'
    });
  }
  app.options(['/c/:key/:file', '/api/*'], (req, res) => cors(res).sendStatus(204));

  app.get('/c/:key/theme.css', ah(async (req, res) => {
    const { inst, mode } = await assetCtx(req);
    assetHeaders(res, 'text/css; charset=utf-8');
    const ok = mode === 'full' || (mode === 'verify' && req.get('X-UC-Verified') === '1');
    res.send(ok ? bundler.css(inst) : bundler.inactiveCss);
  }));
  app.get('/c/:key/customizer.js', ah(async (req, res) => {
    const { inst, mode } = await assetCtx(req);
    assetHeaders(res, 'application/javascript; charset=utf-8');
    res.send(mode === 'off' ? bundler.inactiveJs : bundler.js(inst, mode));
  }));
  app.get('/c/:key/template.css', ah(async (req, res) => {
    const { mode } = await assetCtx(req);
    assetHeaders(res, 'text/css; charset=utf-8');
    if (mode !== 'full' && mode !== 'verify') return res.status(403).send(bundler.inactiveCss);
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(bundler.template);
  }));
  // Realtime: open CRM tabs poll this to pick up saved changes.
  app.get('/c/:key/v.json', ah(async (req, res) => {
    const { inst, mode } = await assetCtx(req);
    cors(res).set('Cache-Control', 'no-store');
    if (mode !== 'full' && mode !== 'verify') return res.status(403).json({ error: 'not available' });
    const have = Number(req.query.have);
    res.json(have >= inst.configVersion ? { v: inst.configVersion } : { v: inst.configVersion, config: inst.config });
  }));

  /* ---------------- browser API (called from the CRM) ---------------- */
  app.post('/api/connect/claim', ah(async (req, res) => {
    cors(res).set('Cache-Control', 'no-store');
    if (!limitApi('claim:' + clientIp(req))) return res.status(429).json({ error: 'Too many requests' });
    const host = originHost(req);
    const body = req.body || {};
    const inst = typeof body.key === 'string' ? await lic.byKey(body.key) : null;
    if (!inst || !lic.isLicensed(inst)) return res.status(403).json({ error: 'License is not active' });
    if (!host) return res.status(400).json({ error: 'Missing origin' });
    const token = await lic.claimPairing(inst, body.pair, host);
    if (!token) return res.status(202).json({ pending: true });
    res.json({ token, host });
  }));

  app.put('/api/config', ah(async (req, res) => {
    cors(res).set('Cache-Control', 'no-store');
    if (!limitApi('cfg:' + clientIp(req))) return res.status(429).json({ error: 'Too many saves, slow down' });
    const body = req.body || {};
    const inst = typeof body.key === 'string' ? await lic.byKey(body.key) : null;
    const auth = (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!inst || !lic.checkEditorToken(inst, auth, originHost(req))) return res.status(401).json({ error: 'This browser is not connected' });
    if (!lic.isLicensed(inst)) return res.status(403).json({ error: 'License is not active' });
    if (!body.config || typeof body.config !== 'object') return res.status(400).json({ error: 'Missing config' });
    await lic.saveConfig(inst, body.config, null);
    res.json({ ok: true, version: inst.configVersion });
  }));

  /* ---------------- public pages ---------------- */
  app.get('/', (req, res) => html(res, views.home({ companyId: typeof req.query.companyId === 'string' ? req.query.companyId : '' })));
  app.get('/docs', (req, res) => html(res, views.docs()));
  app.get('/privacy', (req, res) => html(res, views.privacy()));
  app.get('/terms', (req, res) => html(res, views.terms()));
  // Open /health in a browser to check the database connection (no secrets are shown).
  app.get('/health', ah(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const db = await store.ping();
      res.json({ ok: true, database: db, db_name: cfg.mongoUri ? cfg.mongoDb : null, base_url: cfg.baseUrl });
    } catch (e) {
      const d = dbProblem(e);
      res.status(503).json({ ok: false, database: 'error', problem: d.title, fix: d.fix, code: d.code });
    }
  }));
  app.get('/dashboard', (req, res) => res.redirect(301, '/app'));

  app.get('/api/check', ah(async (req, res) => {
    res.set({ 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
    if (!limitCheck('check:' + clientIp(req))) return res.status(429).json({ error: 'Too many checks. Try again in a minute.' });
    const id = String(req.query.companyId || '').trim();
    if (!lic.COMPANY_RE.test(id)) return res.status(400).json({ error: 'That does not look like a Company ID.' });
    const status = lic.statusOf(await lic.get(id));
    res.json({ companyId: id, licensed: status === 'active', status: status === 'uninstalled' ? 'not_installed' : status });
  }));

  /* ---------------- OAuth (Target User: Agency) ---------------- */
  app.get('/oauth/start', (req, res) => {
    const state = randomToken(18);
    setCookie(res, STATE_COOKIE, sec.sign({ state, next: safeNext(req.query.next), exp: Date.now() + 15 * 60e3 }), { maxAge: 15 * 60e3 });
    res.redirect(ghl.authorizeUrl(state));
  });

  app.get('/oauth/callback', ah(async (req, res) => {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    if (!code) return html(res, views.message('Install failed', req.query.error_description || req.query.error || 'No authorization code was returned by HighLevel.'), 400);
    let next = '/app';
    // Marketplace-initiated installs carry no state; ones we started must match.
    if (req.query.state) {
      const st = sec.unsign(parseCookies(req)[STATE_COOKIE]);
      if (!st || !safeEqual(String(req.query.state), st.state)) return html(res, views.message('Sign-in failed', 'The sign-in link expired. Please try again.'), 400);
      next = safeNext(st.next) || '/app';
    }
    clearCookie(res, STATE_COOKIE);
    try {
      const inst = await lic.installFromOAuth(code);
      setCookie(res, CUST_COOKIE, sec.sign({ companyId: inst.companyId, csrf: randomToken(18), exp: Date.now() + CUST_TTL }), { maxAge: CUST_TTL });
      res.redirect(next);
    } catch (e) {
      const why = oauthProblem(e);
      console.error('[oauth] ' + why.log);
      try { await store.log(null, 'oauth_error', why.log); } catch (x) { /* ignore */ }
      html(res, views.message('Install failed', why.text), why.status);
    }
  }));

  /* ---------------- customer app page ---------------- */
  const customer = ah(async (req, res, next) => {
    const s = session(req, CUST_COOKIE);
    const inst = s && await lic.get(s.companyId);
    if (!inst) {
      if (req.method === 'GET') return html(res, views.signIn(safeNext(req.originalUrl)));
      return res.status(401).send('Signed out');
    }
    if (req.method !== 'GET' && !csrfOk(req, s)) return res.status(403).send('Invalid CSRF token');
    noFrame(res);
    req.s = s; req.inst = inst;
    next();
  });

  app.get('/app', customer, (req, res) => {
    noFrame(res);
    html(res, views.appPage({ inst: req.inst, status: lic.statusOf(req.inst), baseUrl: cfg.baseUrl, csrf: req.s.csrf, flash: takeFlash(req, res) }));
  });
  app.post('/app/domains/add', customer, ah(async (req, res) => {
    const host = lic.cleanHost(req.body.host);
    try {
      if (!lic.validHost(host)) throw new Error('That does not look like a domain, e.g. app.youragency.com');
      await lic.bindHost(req.inst, host, 'added on app page');
      flash(res, { type: 'ok', msg: host + ' connected.' + (lic.isShared(host) ? ' This is a shared HighLevel domain, so the theme loads after a quick user check.' : '') });
    } catch (e) { flash(res, { type: 'err', msg: e.message }); }
    res.redirect('/app');
  }));
  app.post('/app/domains/remove', customer, ah(async (req, res) => {
    await lic.unbindHost(req.inst, lic.cleanHost(req.body.host), 'agency');
    flash(res, { type: 'ok', msg: 'Domain removed.' });
    res.redirect('/app');
  }));
  app.post('/app/revoke-editors', customer, ah(async (req, res) => {
    await lic.revokeEditors(req.inst, 'agency');
    flash(res, { type: 'ok', msg: 'All editors signed out. Browsers must reconnect to edit.' });
    res.redirect('/app');
  }));
  app.post('/logout', (req, res) => { clearCookie(res, CUST_COOKIE); res.redirect('/'); });

  /* ---------------- connect a CRM domain (popup) ---------------- */
  function connectCheck(req) {
    const key = String((req.method === 'GET' ? req.query.key : req.body.key) || '');
    const pair = String((req.method === 'GET' ? req.query.pair : req.body.pair) || '');
    if (!lic.validPair(pair)) return { key, pair, error: 'This connection link is invalid or incomplete. Start again from your CRM.' };
    if (key !== req.inst.key) return { key, pair, error: 'This CRM’s script belongs to a different agency than the one you signed in with. Sign in with the agency that purchased the app.' };
    if (!lic.isLicensed(req.inst)) return { key, pair, error: 'Your license is not active.' };
    return { key, pair };
  }
  app.get('/connect', customer, (req, res) => {
    noFrame(res);
    const c = connectCheck(req);
    html(res, views.connectPage(Object.assign({ inst: req.inst, csrf: req.s.csrf }, c)), c.error ? 400 : 200);
  });
  app.post('/connect', customer, ah(async (req, res) => {
    noFrame(res);
    const c = connectCheck(req);
    if (!c.error) await lic.approvePairing(req.inst, c.pair);
    html(res, views.connectPage(Object.assign({ inst: req.inst, csrf: req.s.csrf, done: !c.error }, c)), c.error ? 400 : 200);
  }));

  /* ---------------- Super Admin ---------------- */
  function admin(req, res, next) {
    noFrame(res);
    const s = session(req, ADMIN_COOKIE);
    if (!s || s.role !== 'admin') {
      if (req.method === 'GET') return res.redirect('/admin/login');
      return res.status(401).send('Signed out');
    }
    if (req.method !== 'GET' && !csrfOk(req, s)) return res.status(403).send('Invalid CSRF token');
    req.s = s;
    next();
  }
  const adminInst = ah(async (req, res, next) => {
    const inst = await lic.get(req.params.companyId);
    if (!inst) return html(res, views.message('Not found', 'No agency with that Company ID.', { back: '/admin' }), 404);
    req.inst = inst;
    next();
  });
  const back = (req, res, msg, type) => {
    flash(res, { type: type || 'ok', msg });
    res.redirect('/admin/i/' + encodeURIComponent(req.inst.companyId));
  };

  app.get('/admin/login', (req, res) => { noFrame(res); html(res, views.adminLogin()); });
  app.post('/admin/login', (req, res) => {
    noFrame(res);
    if (!limitLogin('login:' + clientIp(req))) return html(res, views.adminLogin('Too many attempts. Wait 15 minutes.'), 429);
    const pw = String((req.body && req.body.password) || '');
    if (!cfg.adminPassword || !safeEqual(pw, cfg.adminPassword)) return html(res, views.adminLogin('Wrong password.'), 401);
    setCookie(res, ADMIN_COOKIE, sec.sign({ role: 'admin', csrf: randomToken(18), exp: Date.now() + ADMIN_TTL }), { maxAge: ADMIN_TTL, sameSite: 'Strict' });
    res.redirect('/admin');
  });
  app.post('/admin/logout', admin, (req, res) => { clearCookie(res, ADMIN_COOKIE); res.redirect('/admin/login'); });

  app.get('/admin', admin, ah(async (req, res) => {
    const rows = (await lic.list()).map((inst) => ({ inst, status: lic.statusOf(inst) }));
    html(res, views.adminList({ rows, csrf: req.s.csrf, flash: takeFlash(req, res) }));
  }));
  app.get('/admin/events', admin, ah(async (req, res) => html(res, views.adminEvents({ events: await store.events(null, 300), csrf: req.s.csrf }))));
  app.post('/admin/add', admin, ah(async (req, res) => {
    try {
      const inst = await lic.addManual(String(req.body.companyId || '').trim(), String(req.body.name || '').trim());
      flash(res, { type: 'ok', msg: 'License active. Send the agency the snippets below.' });
      res.redirect('/admin/i/' + encodeURIComponent(inst.companyId));
    } catch (e) {
      flash(res, { type: 'err', msg: e.message });
      res.redirect('/admin');
    }
  }));
  app.post('/admin/verify-all', admin, ah(async (req, res) => {
    const r = await verifyBatch(25);
    flash(res, { type: 'ok', msg: 'Checked ' + r.checked + ' installs (oldest checks first). ' + r.revoked + ' were uninstalled.' + (r.remaining ? ' ' + r.remaining + ' left: run it again.' : '') });
    res.redirect('/admin');
  }));

  app.get('/admin/i/:companyId', admin, adminInst, ah(async (req, res) => {
    html(res, views.adminDetail({ inst: req.inst, status: lic.statusOf(req.inst), events: await store.events(req.inst.companyId, 100), baseUrl: cfg.baseUrl, csrf: req.s.csrf, flash: takeFlash(req, res) }));
  }));
  const adminAction = (path, fn) => app.post('/admin/i/:companyId/' + path, admin, adminInst, ah(fn));
  adminAction('suspend', async (req, res) => {
    req.inst.suspended = true; await store.put(req.inst); await store.log(req.inst.companyId, 'suspended', 'by super admin');
    back(req, res, 'License suspended.');
  });
  adminAction('approve', async (req, res) => {
    req.inst.pending = false; await store.put(req.inst); await store.log(req.inst.companyId, 'approved', 'by super admin');
    back(req, res, 'License approved. The agency\u2019s theme is live.');
  });
  adminAction('resume', async (req, res) => {
    req.inst.suspended = false; await store.put(req.inst); await store.log(req.inst.companyId, 'resumed', 'by super admin');
    back(req, res, 'License resumed.');
  });
  adminAction('mark-installed', async (req, res) => {
    req.inst.installed = true; req.inst.uninstalledAt = null; await store.put(req.inst); await store.log(req.inst.companyId, 'marked_installed', 'by super admin');
    back(req, res, 'Marked as installed.');
  });
  adminAction('verify', async (req, res) => {
    const r = await lic.verify(req.inst);
    back(req, res, 'HighLevel check: ' + r, r.startsWith('error') ? 'err' : 'ok');
  });
  adminAction('config', async (req, res) => {
    if (!req.body || typeof req.body.config !== 'object') return res.status(400).json({ error: 'Missing config' });
    res.json({ ok: true, config: await lic.saveConfig(req.inst, req.body.config, 'super admin') });
  });
  adminAction('meta', async (req, res) => {
    req.inst.name = String(req.body.name || '').trim().slice(0, 120);
    req.inst.notes = String(req.body.notes || '').slice(0, 5000);
    await store.put(req.inst);
    back(req, res, 'Saved.');
  });
  adminAction('bind', async (req, res) => {
    try { const h = await lic.bindHost(req.inst, req.body.host, 'super admin'); back(req, res, h + ' connected.'); }
    catch (e) { back(req, res, e.message, 'err'); }
  });
  adminAction('unbind', async (req, res) => {
    await lic.unbindHost(req.inst, lic.cleanHost(req.body.host), 'super admin');
    back(req, res, 'Domain disconnected.');
  });
  adminAction('revoke-editors', async (req, res) => {
    await lic.revokeEditors(req.inst, 'super admin');
    back(req, res, 'All editors signed out.');
  });
  adminAction('asset-key', async (req, res) => {
    await lic.rotateAssetKey(req.inst);
    back(req, res, 'New CSS/JS URLs generated. Send the new snippets to the agency.');
  });
  adminAction('delete', async (req, res) => {
    await store.remove(req.inst.companyId); await store.log(req.inst.companyId, 'deleted', 'by super admin');
    flash(res, { type: 'ok', msg: 'Agency deleted.' });
    res.redirect('/admin');
  });

  /* ---------------- scheduled install check ---------------- */
  async function verifyBatch(limit) {
    const due = (await lic.list())
      .filter((i) => i.installed && i.tokens)
      .sort((a, b) => String(a.lastVerifiedAt || '').localeCompare(String(b.lastVerifiedAt || '')));
    let revoked = 0;
    const batch = due.slice(0, limit);
    for (const inst of batch) { if ((await lic.verify(inst)).startsWith('revoked')) revoked++; }
    return { checked: batch.length, revoked, remaining: due.length - batch.length };
  }
  app.locals.verifyBatch = verifyBatch;

  // Vercel Cron calls this with "Authorization: Bearer $CRON_SECRET".
  app.get('/api/cron/verify', ah(async (req, res) => {
    const auth = req.get('Authorization') || '';
    if (!cfg.cronSecret || !safeEqual(auth, 'Bearer ' + cfg.cronSecret)) return res.status(401).json({ error: 'unauthorized' });
    res.json(await verifyBatch(40));
  }));

  // Explains database failures without exposing the connection string.
  function dbProblem(e) {
    const msg = String((e && e.message) || '');
    const code = (e && (e.code || e.codeName || e.name)) || '';
    if (/bad auth|authentication failed|auth.*fail/i.test(msg)) {
      return { title: 'MongoDB rejected the username or password.', fix: 'Check the database user and password in MONGODB_URI (Atlas \u2192 Database Access). Special characters in the password must be URL-encoded.', code };
    }
    if (/ENOTFOUND|querySrv|EAI_AGAIN/i.test(msg)) {
      return { title: 'The MongoDB cluster address could not be found.', fix: 'Check the cluster host in MONGODB_URI (it should end in .mongodb.net) and that it was copied completely.', code };
    }
    if (/Server selection timed out|ETIMEDOUT|ECONNREFUSED|timed out|whitelist|not allowed/i.test(msg) || /ServerSelection/i.test(code)) {
      return { title: 'MongoDB did not accept the connection (usually Network Access).', fix: 'In Atlas \u2192 Network Access, add 0.0.0.0/0 (Vercel has no fixed IP), wait a minute, then reload.', code };
    }
    if (/Invalid scheme|URI|connection string|mongodb\+srv/i.test(msg)) {
      return { title: 'MONGODB_URI is not a valid connection string.', fix: 'Paste the full mongodb+srv://... string from Atlas \u2192 Connect \u2192 Drivers into MONGODB_URI.', code };
    }
    return { title: 'The database is not reachable.', fix: 'Open /health for details and check MONGODB_URI and Atlas Network Access.', code };
  }
  // Turns an install failure into a message that says what to fix. HighLevel's
  // error text is safe to show (it never contains the client secret).
  function oauthProblem(e) {
    if (isDbError(e)) {
      const d = dbProblem(e);
      return { status: 503, text: 'The app could not save your install: ' + d.title + ' ' + d.fix, log: 'database: ' + d.code + ' ' + String(e.message).slice(0, 200) };
    }
    if (e && e.name === 'GhlError') {
      const b = e.body && typeof e.body === 'object' ? e.body : {};
      const detail = String(b.error_description || b.message || b.error || (typeof e.body === 'string' ? e.body : '') || '').slice(0, 300);
      if (e.status === 400 && /agency/i.test(e.message)) return { status: 400, text: e.message, log: e.message };
      let hint = '';
      if (/redirect/i.test(detail)) hint = ' The Redirect URL in your HighLevel app must be exactly ' + cfg.redirectUri + ' (it must also match BASE_URL).';
      else if (/client|credential|unauthori[sz]ed/i.test(detail) || e.status === 401) hint = ' Check GHL_CLIENT_ID and GHL_CLIENT_SECRET in Vercel (copy them again from the HighLevel app, then redeploy).';
      else if (/code|grant|expired|used/i.test(detail)) hint = ' Authorization codes work only once and expire quickly. Start the install again instead of reloading this page.';
      return { status: 400, text: 'HighLevel refused the token request (HTTP ' + e.status + '): ' + (detail || 'no details') + '.' + hint, log: 'token ' + e.status + ': ' + detail };
    }
    return { status: 500, text: 'Install failed: ' + String((e && e.message) || e).slice(0, 200), log: String((e && e.stack) || e).slice(0, 500) };
  }
  const isDbError = (e) => !!e && (/^Mongo/.test(e.name || '') || /querySrv|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|Server selection/i.test(String(e.message || '')));

  app.use((req, res) => html(res, views.message('Not found', 'That page does not exist.'), 404));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Too large' });
    console.error(err);
    const db = isDbError(err) ? dbProblem(err) : null;
    if (req.path.startsWith('/c/') || req.path.startsWith('/api/')) return res.status(db ? 503 : 500).json({ error: db ? 'Database unavailable' : 'Server error' });
    if (db) return html(res, views.message('Database connection problem', db.title + ' ' + db.fix + ' (Error code: ' + db.code + ')', { back: '/health' }), 503);
    html(res, views.message('Error', 'Something went wrong. Please try again.'), 500);
  });

  app.locals.store = store;
  app.locals.lic = lic;
  app.locals.cfg = cfg;
  return app;
}

module.exports = { createApp };
