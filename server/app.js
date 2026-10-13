'use strict';
const express = require('express');
const { createSecurity, randomToken, safeEqual, rateLimiter } = require('./security');
const { createStore } = require('./store');
const { createGhl } = require('./ghl');
const { createLicensing } = require('./licensing');
const { createBundler } = require('./bundle');
const views = require('./views');

const ADMIN_COOKIE = 'uc_admin';
const CUST_COOKIE = 'uc_cust';
const FLASH_COOKIE = 'uc_flash';
const STATE_COOKIE = 'uc_oauth_state';
const ADMIN_TTL = 12 * 3600e3;
const CUST_TTL = 7 * 24 * 3600e3;

function createApp(cfg, deps) {
  deps = deps || {};
  const sec = createSecurity(cfg.sessionSecret);
  const store = deps.store || createStore(cfg.dataDir);
  const ghl = deps.ghl || createGhl(cfg, deps.fetch);
  const lic = createLicensing(store, ghl, sec);
  const bundler = createBundler(cfg);

  const limitCheck = rateLimiter(30, 60e3);
  const limitLogin = rateLimiter(8, 15 * 60e3);
  const limitPublish = rateLimiter(30, 60e3);

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  /* ---------------- helpers ---------------- */
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
  function flash(res, f) { setCookie(res, FLASH_COOKIE, sec.encrypt(JSON.stringify(f)), { maxAge: 120e3 }); }
  function takeFlash(req, res) {
    const raw = parseCookies(req)[FLASH_COOKIE];
    if (!raw) return null;
    clearCookie(res, FLASH_COOKIE);
    try { return JSON.parse(sec.decrypt(raw)); } catch (e) { return null; }
  }

  const html = (res, body, status) => {
    res.status(status || 200).set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'same-origin' }).send(body);
  };
  const noFrame = (res) => res.set({ 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "frame-ancestors 'none'" });

  function csrfOk(req, s) {
    const t = req.get('X-CSRF-Token') || (req.body && req.body._csrf);
    return !!(s && t && safeEqual(t, s.csrf));
  }
  const clientIp = (req) => req.ip || 'unknown';

  function refererHost(req) {
    const r = req.get('Referer') || req.get('Origin');
    if (!r) return '';
    try { return new URL(r).hostname.toLowerCase(); } catch (e) { return ''; }
  }

  /* ---------------- webhooks (raw body, before parsers) ---------------- */
  app.post('/webhooks/ghl', express.raw({ type: '*/*', limit: '256kb' }), async (req, res) => {
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    const verified = ghl.verifyWebhook(raw, req.headers);
    if (verified === false) return res.status(401).json({ error: 'bad signature' });
    let evt;
    try { evt = JSON.parse(raw.toString('utf8')); } catch (e) { return res.status(400).json({ error: 'bad json' }); }
    res.json({ ok: true }); // ack fast; work continues below

    const companyId = evt && typeof evt.companyId === 'string' ? evt.companyId : null;
    const inst = companyId && store.get(companyId);
    if (!inst) return;
    try {
      if (evt.type === 'UNINSTALL' && !evt.locationId) {
        // Only trust an unsigned webhook after HighLevel itself confirms the token is gone.
        if (verified === true) lic.markUninstalled(inst, 'webhook');
        else await lic.verify(inst);
      } else if (evt.type === 'INSTALL') {
        store.log(companyId, 'webhook_install', evt.locationId ? 'location ' + evt.locationId : '');
      }
    } catch (e) {
      store.log(companyId, 'webhook_error', e.message);
    }
  });

  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(express.json({ limit: '100kb' }));

  /* ---------------- licensed assets (loaded inside HighLevel) ---------------- */
  function assetHeaders(res, type) {
    res.set({
      'Content-Type': type,
      // Revalidate every load (cheap 304 via ETag) so publishes and suspensions apply immediately.
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
      'X-Content-Type-Options': 'nosniff',
      'Vary': 'Referer'
    });
  }
  function assetInstall(req) {
    const inst = /^k_[A-Za-z0-9_-]{10,64}$/.test(req.params.key) ? store.byKey(req.params.key) : null;
    if (!lic.isLicensed(inst)) return null;
    const host = refererHost(req);
    if (!lic.hostAllowed(inst, host)) return null;
    if (host && host !== new URL(cfg.baseUrl).hostname) lic.noteHost(inst, host);
    return inst;
  }

  app.get('/c/:key/theme.css', (req, res) => {
    const inst = assetInstall(req);
    assetHeaders(res, 'text/css; charset=utf-8');
    res.send(inst ? bundler.css(inst) : bundler.inactiveCss);
  });
  app.get('/c/:key/customizer.js', (req, res) => {
    const inst = assetInstall(req);
    assetHeaders(res, 'application/javascript; charset=utf-8');
    res.send(inst ? bundler.js(inst) : bundler.inactiveJs);
  });
  app.get('/c/:key/base.css', (req, res) => {
    const inst = assetInstall(req);
    assetHeaders(res, 'text/css; charset=utf-8');
    if (!inst) return res.status(403).send(bundler.inactiveCss);
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(bundler.baseCss);
  });

  /* ---------------- public API ---------------- */
  app.get('/api/check', (req, res) => {
    res.set({ 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
    if (!limitCheck('check:' + clientIp(req))) return res.status(429).json({ error: 'Too many checks. Try again in a minute.' });
    const id = String(req.query.companyId || '').trim();
    if (!lic.COMPANY_RE.test(id)) return res.status(400).json({ error: 'That does not look like a Company ID.' });
    const inst = store.get(id);
    const status = lic.statusOf(inst);
    res.json({ companyId: id, licensed: status === 'active', status: status === 'uninstalled' ? 'not_installed' : status });
  });

  app.options('/api/publish', (req, res) => {
    res.set({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-UC-Publish-Key',
      'Access-Control-Max-Age': '600'
    }).sendStatus(204);
  });
  app.post('/api/publish', (req, res) => {
    res.set({ 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
    if (!limitPublish('pub:' + clientIp(req))) return res.status(429).json({ error: 'Too many requests' });
    const body = req.body || {};
    const inst = typeof body.key === 'string' ? store.byKey(body.key) : null;
    if (!inst || !lic.checkPublishKey(inst, req.get('X-UC-Publish-Key'))) return res.status(401).json({ error: 'Invalid publish key' });
    if (!lic.isLicensed(inst)) return res.status(403).json({ error: 'License is not active' });
    if (!body.config || typeof body.config !== 'object') return res.status(400).json({ error: 'Missing config' });
    const saved = lic.saveConfig(inst, body.config, 'in-app publish');
    res.json({ ok: true, config: saved, version: inst.configVersion });
  });

  /* ---------------- OAuth (Target User: Agency) ---------------- */
  app.get('/oauth/start', (req, res) => {
    const state = randomToken(18);
    setCookie(res, STATE_COOKIE, sec.sign({ state, exp: Date.now() + 15 * 60e3 }), { maxAge: 15 * 60e3 });
    res.redirect(ghl.authorizeUrl(state));
  });

  app.get('/oauth/callback', async (req, res) => {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    if (!code) return html(res, views.message('Install failed', req.query.error_description || req.query.error || 'No authorization code was returned by HighLevel.'), 400);
    // Marketplace-initiated installs carry no state; ones we started must match.
    if (req.query.state) {
      const st = sec.unsign(parseCookies(req)[STATE_COOKIE]);
      if (!st || !safeEqual(String(req.query.state), st.state)) return html(res, views.message('Install failed', 'The sign-in link expired. Please try again.'), 400);
    }
    clearCookie(res, STATE_COOKIE);
    try {
      const { inst, publishKey } = await lic.installFromOAuth(code);
      setCookie(res, CUST_COOKIE, sec.sign({ companyId: inst.companyId, csrf: randomToken(18), exp: Date.now() + CUST_TTL }), { maxAge: CUST_TTL });
      flash(res, publishKey ? { publishKey } : { type: 'ok', msg: 'Connected to HighLevel. Your license is active.' });
      res.redirect('/dashboard');
    } catch (e) {
      store.log(null, 'oauth_error', e.message);
      html(res, views.message('Install failed', e.status === 400 && /agency/i.test(e.message) ? e.message : 'HighLevel did not accept the authorization. Please try installing again.'), 400);
    }
  });

  /* ---------------- public pages ---------------- */
  app.get('/', (req, res) => html(res, views.home({ companyId: typeof req.query.companyId === 'string' ? req.query.companyId : '' })));
  app.get('/health', (req, res) => res.json({ ok: true }));

  /* ---------------- customer dashboard ---------------- */
  function customer(req, res, next) {
    const s = session(req, CUST_COOKIE);
    const inst = s && store.get(s.companyId);
    if (!inst) {
      if (req.method === 'GET') return html(res, views.signIn());
      return res.status(401).json({ error: 'Signed out' });
    }
    if (req.method !== 'GET' && !csrfOk(req, s)) return res.status(403).send('Invalid CSRF token');
    req.s = s; req.inst = inst;
    next();
  }

  app.get('/dashboard', customer, (req, res) => {
    html(res, views.dashboard({ inst: req.inst, status: lic.statusOf(req.inst), baseUrl: cfg.baseUrl, csrf: req.s.csrf, flash: takeFlash(req, res) }));
  });
  app.post('/dashboard/config', customer, (req, res) => {
    if (!lic.isLicensed(req.inst)) return res.status(403).json({ error: 'License is not active' });
    if (!req.body || typeof req.body.config !== 'object') return res.status(400).json({ error: 'Missing config' });
    res.json({ ok: true, config: lic.saveConfig(req.inst, req.body.config, 'dashboard') });
  });
  app.post('/dashboard/publish-key', customer, (req, res) => {
    flash(res, { publishKey: lic.rotatePublishKey(req.inst) });
    res.redirect('/dashboard');
  });
  app.post('/dashboard/domains', customer, (req, res) => {
    req.inst.allowedHosts = lic.parseHosts(req.body.hosts);
    store.put(req.inst);
    store.log(req.inst.companyId, 'domains_saved', req.inst.allowedHosts.join(', '));
    flash(res, { type: 'ok', msg: 'Allowed domains saved.' });
    res.redirect('/dashboard');
  });
  app.post('/logout', (req, res) => { clearCookie(res, CUST_COOKIE); res.redirect('/'); });

  /* ---------------- admin panel ---------------- */
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
  const adminInst = (req, res, next) => {
    const inst = store.get(req.params.companyId);
    if (!inst) return html(res, views.message('Not found', 'No agency with that Company ID.', { back: '/admin' }), 404);
    req.inst = inst;
    next();
  };
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

  app.get('/admin', admin, (req, res) => {
    const rows = store.list().map((inst) => ({ inst, status: lic.statusOf(inst) }));
    html(res, views.adminList({ rows, csrf: req.s.csrf, flash: takeFlash(req, res) }));
  });
  app.get('/admin/events', admin, (req, res) => html(res, views.adminEvents({ events: store.events(null, 300), csrf: req.s.csrf })));

  app.post('/admin/add', admin, (req, res) => {
    try {
      const { inst, publishKey } = lic.addManual(String(req.body.companyId || '').trim(), String(req.body.name || '').trim());
      flash(res, publishKey ? { publishKey } : { type: 'ok', msg: 'License re-activated.' });
      res.redirect('/admin/i/' + encodeURIComponent(inst.companyId));
    } catch (e) {
      flash(res, { type: 'err', msg: e.message });
      res.redirect('/admin');
    }
  });
  app.post('/admin/verify-all', admin, async (req, res) => {
    const list = store.list().filter((i) => i.installed && i.tokens);
    let revoked = 0;
    for (const inst of list) { if ((await lic.verify(inst)).startsWith('revoked')) revoked++; }
    flash(res, { type: 'ok', msg: 'Checked ' + list.length + ' installs. ' + revoked + ' were uninstalled.' });
    res.redirect('/admin');
  });

  app.get('/admin/i/:companyId', admin, adminInst, (req, res) => {
    html(res, views.adminDetail({ inst: req.inst, status: lic.statusOf(req.inst), events: store.events(req.inst.companyId, 100), baseUrl: cfg.baseUrl, csrf: req.s.csrf, flash: takeFlash(req, res) }));
  });
  app.post('/admin/i/:companyId/suspend', admin, adminInst, (req, res) => {
    req.inst.suspended = true; store.put(req.inst); store.log(req.inst.companyId, 'suspended', 'by admin');
    back(req, res, 'License suspended.');
  });
  app.post('/admin/i/:companyId/resume', admin, adminInst, (req, res) => {
    req.inst.suspended = false; store.put(req.inst); store.log(req.inst.companyId, 'resumed', 'by admin');
    back(req, res, 'License resumed.');
  });
  app.post('/admin/i/:companyId/mark-installed', admin, adminInst, (req, res) => {
    req.inst.installed = true; req.inst.uninstalledAt = null; store.put(req.inst); store.log(req.inst.companyId, 'marked_installed', 'by admin');
    back(req, res, 'Marked as installed.');
  });
  app.post('/admin/i/:companyId/verify', admin, adminInst, async (req, res) => {
    const r = await lic.verify(req.inst);
    back(req, res, 'HighLevel check: ' + r, r.startsWith('error') ? 'err' : 'ok');
  });
  app.post('/admin/i/:companyId/config', admin, adminInst, (req, res) => {
    if (!req.body || typeof req.body.config !== 'object') return res.status(400).json({ error: 'Missing config' });
    res.json({ ok: true, config: lic.saveConfig(req.inst, req.body.config, 'admin') });
  });
  app.post('/admin/i/:companyId/meta', admin, adminInst, (req, res) => {
    req.inst.name = String(req.body.name || '').trim().slice(0, 120);
    req.inst.notes = String(req.body.notes || '').slice(0, 5000);
    req.inst.allowedHosts = lic.parseHosts(req.body.hosts);
    store.put(req.inst);
    back(req, res, 'Saved.');
  });
  app.post('/admin/i/:companyId/publish-key', admin, adminInst, (req, res) => {
    flash(res, { publishKey: lic.rotatePublishKey(req.inst) });
    res.redirect('/admin/i/' + encodeURIComponent(req.inst.companyId));
  });
  app.post('/admin/i/:companyId/asset-key', admin, adminInst, (req, res) => {
    lic.rotateAssetKey(req.inst);
    back(req, res, 'New CSS/JS URLs generated. Send the new snippets to the customer.');
  });
  app.post('/admin/i/:companyId/delete', admin, adminInst, (req, res) => {
    store.remove(req.inst.companyId); store.log(req.inst.companyId, 'deleted', 'by admin');
    flash(res, { type: 'ok', msg: 'Agency deleted.' });
    res.redirect('/admin');
  });

  app.use((req, res) => html(res, views.message('Not found', 'That page does not exist.'), 404));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Too large' });
    console.error(err);
    html(res, views.message('Error', 'Something went wrong.'), 500);
  });

  app.locals.store = store;
  app.locals.lic = lic;
  return app;
}

module.exports = { createApp };
