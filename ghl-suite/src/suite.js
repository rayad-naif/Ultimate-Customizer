'use strict';
/* One Express app serving all five Marketplace apps on one domain.

   Shared:    /  /privacy  /terms  /health  /admin  /api/cron/daily
   Per app:   /<slug>                  landing page (Marketplace "website")
              /<slug>/docs             setup guide + Marketplace values
              /<slug>/install          starts OAuth (optional; Marketplace does it too)
              /<slug>/oauth/callback   OAuth redirect URL
              /<slug>/webhook          webhook URL
              /<slug>/embed            custom page (Live URL) shown in the CRM sidebar
              /<slug>/api/...          settings API used by the embed page          */
const express = require('express');
const { createStore } = require('./store');
const { createGhl } = require('./ghl');
const { createSecurity, decryptGhlSso, randomToken, sha256, safeEqual, rateLimiter } = require('./security');
const { makeSanitizer } = require('./schema');
const { tz } = require('./apps/util');
const { createViews } = require('./views');
const APP_DEFS = require('./apps');

const EMBED_TTL = 4 * 3600e3;
const ADMIN_TTL = 12 * 3600e3;
const DAILY_BUDGET_MS = 50e3;
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function createSuite(cfg, deps) {
  deps = deps || {};
  const store = deps.store || createStore(cfg);
  const sec = createSecurity(cfg.sessionSecret);
  const ghl = createGhl(cfg, store, sec, deps.fetch);

  const apps = APP_DEFS.map((d) => {
    const def = Object.assign({}, d, { creds: cfg.creds(d.envPrefix), sanitize: makeSanitizer(d.fields) });
    def.ready = !!(def.creds.clientId && def.creds.clientSecret);
    def.oauth = ghl.forApp(def);
    return def;
  });
  const bySlug = Object.fromEntries(apps.map((a) => [a.slug, a]));
  const views = createViews(cfg, apps);

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);
  app.locals.store = store;
  app.locals.apps = apps;

  const limit = rateLimiter(60, 60e3);
  const limitLogin = rateLimiter(10, 15 * 60e3);
  const ip = (req) => req.ip || 'unknown';
  const html = (res, body, status) => res.status(status || 200).type('html').set('Cache-Control', 'no-store').send(body);

  /* ---------- context handed to an app's handlers ---------- */
  function makeCtx(def, inst) {
    const loc = inst.locationId;
    const prefix = def.slug + ':' + loc + ':';
    const settings = def.sanitize(inst.settings);
    const log = (type, detail) => store.log(def.slug, loc, type, detail);
    return {
      inst, settings, tz: tz(settings.timezone, inst), api: def.oauth.client(inst), log,
      kv: {
        get: (k) => store.kvGet(prefix + k),
        set: (k, v, ttl) => store.kvSet(prefix + k, v, ttl),
        del: (k) => store.kvDel(prefix + k),
        setNX: (k, v, ttl) => store.kvSetNX(prefix + k, v, ttl),
        incr: (k, by, ttl) => store.kvIncr(prefix + k, by, ttl),
        list: async (p, n) => (await store.kvList(prefix + p, n)).map((x) => ({ key: x.key.slice(prefix.length), value: x.value }))
      },
      async action(detail, contactId) {
        await log('action', (contactId ? '[' + contactId + '] ' : '') + detail);
        await store.patchInstall(def.slug, loc, null, { 'stats.actions': 1 });
      }
    };
  }

  // The install for an event; mints a token from the agency token for bulk installs.
  async function installFor(def, locationId, companyId) {
    let inst = await store.getInstall(def.slug, locationId);
    if (inst && inst.installed && inst.tokens) return inst;
    if (companyId && await store.getCompany(def.slug, companyId)) {
      inst = await def.oauth.installFromCompany(companyId, locationId).catch(() => null);
      if (inst) await store.log(def.slug, locationId, 'installed', 'via agency bulk install');
    }
    return inst && inst.installed ? inst : null;
  }

  /* ---------- webhooks (raw body: needed for signature checks) ---------- */
  app.post('/:slug/webhook', express.raw({ type: '*/*', limit: '512kb' }), ah(async (req, res) => {
    const def = bySlug[req.params.slug];
    if (!def) return res.status(404).json({ error: 'unknown app' });
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    const verified = ghl.verifyWebhook(raw, req.headers);
    if (verified === false) return res.status(401).json({ error: 'bad signature' });
    let evt;
    try { evt = JSON.parse(raw.toString('utf8')); } catch (e) { return res.status(400).json({ error: 'bad json' }); }
    if (!evt || typeof evt.type !== 'string') return res.status(400).json({ error: 'no event type' });
    // HighLevel retries deliveries: handle each one once.
    if (!(await store.kvSetNX('wh:' + def.slug + ':' + (evt.webhookId || sha256(raw)), 1, 2 * 86400))) return res.json({ ok: true, duplicate: true });

    const loc = typeof evt.locationId === 'string' ? evt.locationId : null;
    const company = typeof evt.companyId === 'string' ? evt.companyId : null;
    // Work happens before replying: serverless functions freeze after the response.
    try {
      if (evt.type === 'INSTALL') {
        if (loc) await installFor(def, loc, company);
        await store.log(def.slug, loc, 'webhook_install', (evt.installType || '') + (company ? ' company ' + company : ''));
      } else if (evt.type === 'UNINSTALL') {
        const targets = loc ? [await store.getInstall(def.slug, loc)] : (await store.listInstalls({ app: def.slug, installed: true })).filter((i) => company && i.companyId === company && verified === true);
        for (const inst of targets.filter(Boolean)) {
          // An unsigned webhook is only trusted once HighLevel refuses the token.
          if (verified === true || !(await def.oauth.stillInstalled(inst))) {
            await store.patchInstall(def.slug, inst.locationId, { installed: false, uninstalledAt: new Date().toISOString(), tokens: null });
            await store.log(def.slug, inst.locationId, 'uninstalled', 'webhook');
          }
        }
      } else if (loc) {
        const inst = await installFor(def, loc, company);
        if (inst) {
          await store.patchInstall(def.slug, loc, { lastEventAt: new Date().toISOString() }, { 'stats.events': 1 });
          await def.onEvent(evt, makeCtx(def, inst));
        }
      }
    } catch (e) {
      console.error('[' + def.slug + '] ' + evt.type + ': ' + e.message);
      try { await store.log(def.slug, loc, 'error', evt.type + ': ' + e.message); } catch (x) { /* ignore */ }
    }
    res.json({ ok: true });
  }));

  app.use(express.json({ limit: '200kb' }));
  app.use(express.urlencoded({ extended: false, limit: '50kb' }));
  app.use((req, res, next) => { res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' }); next(); });

  /* ---------- shared pages ---------- */
  app.get('/', (req, res) => html(res, views.home()));
  app.get('/privacy', (req, res) => html(res, views.privacy()));
  app.get('/terms', (req, res) => html(res, views.terms()));
  app.get('/health', ah(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      res.json({ ok: true, database: await store.ping(), apps: Object.fromEntries(apps.map((a) => [a.slug, { configured: a.ready, sso: !!a.creds.ssoKey }])) });
    } catch (e) { res.status(503).json({ ok: false, database: 'error: ' + e.message }); }
  }));

  /* ---------- daily job (Vercel Cron, once a day on the free plan) ---------- */
  async function runDaily() {
    const deadline = Date.now() + DAILY_BUDGET_MS;
    const report = {};
    for (const def of apps.filter((a) => a.daily)) {
      const list = (await store.listInstalls({ app: def.slug, installed: true }))
        .sort((a, b) => String(a.lastDailyAt || '').localeCompare(String(b.lastDailyAt || '')));
      let done = 0;
      for (let i = 0; i < list.length && Date.now() < deadline; i += 5) {
        await Promise.all(list.slice(i, i + 5).map(async (inst) => {
          try { await def.daily(makeCtx(def, inst), deadline); done++; } catch (e) { await store.log(def.slug, inst.locationId, 'daily_error', e.message); }
          await store.patchInstall(def.slug, inst.locationId, { lastDailyAt: new Date().toISOString() });
        }));
      }
      report[def.slug] = done + '/' + list.length;
    }
    return report;
  }
  app.locals.runDaily = runDaily;
  app.get('/api/cron/daily', ah(async (req, res) => {
    if (!cfg.cronSecret || !safeEqual(req.get('Authorization') || '', 'Bearer ' + cfg.cronSecret)) return res.status(401).json({ error: 'unauthorized' });
    res.json({ ok: true, report: await runDaily() });
  }));

  /* ---------- super admin ---------- */
  const cookies = (req) => Object.fromEntries((req.get('Cookie') || '').split(';').map((c) => c.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
  const secure = cfg.baseUrl.startsWith('https://');
  const adminSession = (req) => { const s = sec.unsign(cookies(req).suite_admin); return s && s.t === 'adm' ? s : null; };
  const adminOnly = (req, res, next) => {
    res.set('X-Frame-Options', 'DENY');
    req.admin = adminSession(req);
    if (!req.admin) return res.redirect('/admin/login');
    next();
  };
  app.get('/admin/login', (req, res) => { res.set('X-Frame-Options', 'DENY'); html(res, views.adminLogin()); });
  app.post('/admin/login', ah(async (req, res) => {
    res.set('X-Frame-Options', 'DENY');
    if (!limitLogin('admin:' + ip(req))) return html(res, views.adminLogin('Too many attempts. Wait 15 minutes.'), 429);
    if (!cfg.adminPassword || !safeEqual(String((req.body || {}).password || ''), cfg.adminPassword)) return html(res, views.adminLogin('Wrong password.'), 401);
    const tok = sec.sign({ t: 'adm', csrf: randomToken(16), exp: Date.now() + ADMIN_TTL });
    res.cookie('suite_admin', tok, { httpOnly: true, sameSite: 'lax', secure, maxAge: ADMIN_TTL, path: '/' });
    res.redirect('/admin');
  }));
  app.post('/admin/logout', adminOnly, (req, res) => {
    if (safeEqual(String((req.body || {})._csrf || ''), req.admin.csrf)) res.clearCookie('suite_admin', { path: '/' });
    res.redirect('/admin/login');
  });
  app.get('/admin', adminOnly, ah(async (req, res) => {
    const filter = bySlug[req.query.app] ? req.query.app : '';
    const [installs, events] = await Promise.all([store.listInstalls(filter ? { app: filter } : {}), store.events({ app: filter || undefined, limit: 100 })]);
    html(res, views.admin({ installs, events, filter, csrf: req.admin.csrf }));
  }));

  /* ---------- per-app public pages + OAuth ---------- */
  const appParam = (req, res, next) => {
    req.def = bySlug[req.params.slug];
    if (!req.def) return next('route');
    next();
  };
  app.get('/:slug', appParam, (req, res) => html(res, views.landing(req.def)));
  app.get('/:slug/docs', appParam, (req, res) => html(res, views.docs(req.def)));
  app.get('/:slug/install', appParam, (req, res) => {
    if (!req.def.ready) return html(res, views.message(req.def, 'Not available yet', 'This app is not connected to HighLevel yet. Please try again later.'), 503);
    const state = randomToken(16);
    res.cookie('suite_state', sec.sign({ state, app: req.def.slug, exp: Date.now() + 15 * 60e3 }), { httpOnly: true, sameSite: 'lax', secure, maxAge: 15 * 60e3, path: '/' });
    res.redirect(req.def.oauth.authorizeUrl(state));
  });
  app.get('/:slug/oauth/callback', appParam, ah(async (req, res) => {
    const def = req.def;
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    if (!code) return html(res, views.message(def, 'Install failed', String(req.query.error_description || req.query.error || 'HighLevel did not return an authorization code.')), 400);
    // Marketplace-initiated installs carry no state; ones started at /install must match.
    if (req.query.state) {
      const st = sec.unsign(cookies(req).suite_state);
      if (!st || st.app !== def.slug || !safeEqual(String(req.query.state), st.state)) return html(res, views.message(def, 'Install failed', 'The install link expired. Please start again.'), 400);
      res.clearCookie('suite_state', { path: '/' });
    }
    try {
      const r = await def.oauth.exchangeCode(code);
      for (const i of r.installs) await store.log(def.slug, i.locationId, 'installed', i.name || '');
      if (r.company) await store.log(def.slug, null, 'installed_agency', 'company ' + r.company.companyId + ', ' + r.installs.length + ' sub-accounts');
      html(res, views.installed(def, r));
    } catch (e) {
      console.error('[' + def.slug + '] oauth: ' + e.message);
      await store.log(def.slug, null, 'oauth_error', e.message).catch(() => null);
      html(res, views.message(def, 'Install failed', 'HighLevel refused the install (' + (e.status || 'error') + '). Please try again, or contact support.'), 502);
    }
  }));

  /* ---------- the custom page inside the CRM ---------- */
  app.get('/:slug/embed', appParam, (req, res) => html(res, views.embed(req.def)));

  app.post('/:slug/api/sso', appParam, ah(async (req, res) => {
    const def = req.def;
    res.set('Cache-Control', 'no-store');
    if (!limit('sso:' + ip(req))) return res.status(429).json({ error: 'Too many requests. Wait a minute.' });
    if (!def.creds.ssoKey) return res.status(501).json({ error: 'Sign-in is not configured for this app yet (' + def.envPrefix + '_SSO_KEY).' });
    const u = decryptGhlSso(req.body && req.body.payload, def.creds.ssoKey);
    if (!u) return res.status(401).json({ error: 'HighLevel did not send a valid sign-in. Reload the page.' });
    const loc = typeof u.activeLocation === 'string' ? u.activeLocation : '';
    if (!loc) return res.status(400).json({ error: 'Open this app from inside a sub-account.' });
    const inst = await installFor(def, loc, typeof u.companyId === 'string' ? u.companyId : null);
    if (!inst) return res.status(404).json({ error: def.name + ' is not installed in this sub-account yet.', install: cfg.baseUrl + '/' + def.slug + '/install' });
    const edit = String(u.role || '').toLowerCase() === 'admin';
    res.json({ token: sec.sign({ t: 'emb', app: def.slug, loc, uid: String(u.userId || ''), edit, exp: Date.now() + EMBED_TTL }), edit });
  }));

  const embedAuth = ah(async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const s = sec.unsign((req.get('Authorization') || '').replace(/^Bearer\s+/i, ''));
    if (!s || s.t !== 'emb' || s.app !== req.def.slug) return res.status(401).json({ error: 'Your session expired. Reload the page.' });
    const inst = await store.getInstall(req.def.slug, s.loc);
    if (!inst || !inst.installed) return res.status(404).json({ error: 'The app is not installed in this sub-account.' });
    if (!limit('api:' + s.loc)) return res.status(429).json({ error: 'Too many requests. Wait a minute.' });
    req.sess = s; req.inst = inst;
    next();
  });

  app.get('/:slug/api/settings', appParam, embedAuth, ah(async (req, res) => {
    const def = req.def, inst = req.inst;
    let options = {}, optionsError = null;
    if (def.options) {
      try { options = await def.options(makeCtx(def, inst)); } catch (e) { optionsError = e.message; }
    }
    res.json({
      app: { slug: def.slug, name: def.name, actions: Object.entries(def.actions || {}).map(([id, a]) => ({ id, label: a.label })) },
      install: { name: inst.name, timezone: inst.timezone, installedAt: inst.installedAt, lastEventAt: inst.lastEventAt, stats: inst.stats || {}, needsReauth: !!inst.needsReauth },
      fields: def.fields, settings: def.sanitize(inst.settings), options, optionsError, edit: !!req.sess.edit,
      events: await store.events({ app: def.slug, locationId: inst.locationId, limit: 25 })
    });
  }));

  app.put('/:slug/api/settings', appParam, embedAuth, ah(async (req, res) => {
    if (!req.sess.edit) return res.status(403).json({ error: 'Only admins can change settings.' });
    const settings = req.def.sanitize(req.body && req.body.settings);
    await store.patchInstall(req.def.slug, req.inst.locationId, { settings });
    await store.log(req.def.slug, req.inst.locationId, 'settings_saved', req.sess.uid);
    res.json({ ok: true, settings });
  }));

  app.post('/:slug/api/action/:action', appParam, embedAuth, ah(async (req, res) => {
    const a = req.def.actions && Object.prototype.hasOwnProperty.call(req.def.actions, req.params.action) ? req.def.actions[req.params.action] : null;
    if (!a) return res.status(404).json({ error: 'Unknown action' });
    if (!req.sess.edit) return res.status(403).json({ error: 'Only admins can do this.' });
    try { res.json({ ok: true, result: await a.run(makeCtx(req.def, req.inst), Date.now() + 40e3) }); } catch (e) { res.status(502).json({ error: e.message }); }
  }));

  app.use((req, res) => html(res, views.notFound(), 404));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    if (res.headersSent) return;
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });
  return app;
}

module.exports = { createSuite };
