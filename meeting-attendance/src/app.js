'use strict';
const fs = require('fs');
const path = require('path');
const nodeCrypto = require('crypto');
const express = require('express');
const { createCrypto, decryptGhlSso, safeEqual } = require('./crypto');
const { createHttp } = require('./http');
const { createStore } = require('./store');
const { createGhl } = require('./ghl');
const { createProviders } = require('./providers');
const { createSettings } = require('./settings');
const { createFields } = require('./fields');
const { createNotes } = require('./notes');
const { createJobs } = require('./jobs');

const APPOINTMENT_EVENTS = ['AppointmentCreate', 'AppointmentUpdate', 'AppointmentDelete'];

function createApp(cfg, deps = {}) {
  const crypto = createCrypto(cfg.sessionSecret);
  const http = deps.http || createHttp(deps.fetch);
  const store = deps.store || createStore(cfg);
  const ghl = createGhl({ cfg, store, crypto, http });
  const providers = createProviders({ cfg, http, store, crypto });
  const settings = createSettings({ ghl });
  const fields = createFields({ ghl, store });
  const notes = deps.notes || createNotes({ cfg, client: deps.anthropic });
  const jobs = createJobs({ cfg, store, ghl, providers, settings, fields, notes, now: deps.now });

  const app = express();
  app.disable('x-powered-by');
  app.locals = Object.assign(app.locals, { store, ghl, jobs, providers, settings, crypto });
  const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  const page = (title, body) => '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(title) +
    '</title><body style="font-family:system-ui,sans-serif;max-width:560px;margin:48px auto;padding:0 16px;line-height:1.5;color:#1f2937">' + body + '</body>';

  app.use((req, res, next) => { res.setHeader('X-Content-Type-Options', 'nosniff'); next(); });

  app.get('/', (req, res) => res.type('html').send(page(cfg.appName, '<h1>' + esc(cfg.appName) + '</h1><p>Marks HighLevel appointments held on Zoom, Microsoft Teams and Google Meet as Showed or No-show, and saves meeting notes to each contact.</p>')));
  app.get('/health', ah(async (req, res) => res.json({ ok: true, store: await store.ping() })));

  /* ---------- HighLevel install ---------- */
  app.get('/oauth/callback', ah(async (req, res) => {
    if (!req.query.code) return res.status(400).type('html').send(page('Install failed', '<p>Missing authorization code.</p>'));
    const r = await ghl.exchangeCode(String(req.query.code));
    for (const id of r.locationIds) {
      await store.log(id, 'installed', r.type);
      try { await fields.ensure(id); } catch (e) { await store.log(id, 'field_setup_failed', e.message); }
    }
    res.type('html').send(page('Installed', '<h1>' + esc(cfg.appName) + ' is installed</h1><p>Open <b>' + esc(cfg.appName) +
      '</b> from the sub-account sidebar to connect Zoom, Microsoft Teams or Google Meet and set your rules.</p>'));
  }));

  /* ---------- HighLevel webhooks ---------- */
  app.post('/webhooks/ghl', express.raw({ type: '*/*', limit: '512kb' }), ah(async (req, res) => {
    const raw = req.body instanceof Buffer ? req.body : Buffer.from('');
    if (!ghl.verifyWebhook(raw, req.headers)) return res.status(401).json({ error: 'bad signature' });
    let evt;
    try { evt = JSON.parse(raw.toString('utf8')); } catch (e) { return res.status(400).json({ error: 'bad json' }); }
    if (evt.timestamp && Math.abs(Date.now() - Date.parse(evt.timestamp)) > 15 * 60 * 1000) return res.status(400).json({ error: 'stale' });
    const id = evt.webhookId || nodeCrypto.createHash('sha256').update(raw).digest('hex');
    if (await store.seen(id)) return res.json({ ok: true, duplicate: true });

    const type = evt.type;
    if (type === 'INSTALL') {
      if (evt.locationId && evt.companyId && !(await store.getLocation(evt.locationId)) && (await store.getCompany(evt.companyId))) {
        try { await ghl.mintLocationToken(evt.companyId, evt.locationId); await fields.ensure(evt.locationId); } catch (e) { await store.log(evt.locationId, 'install_token_failed', e.message); }
      }
    } else if (type === 'UNINSTALL') {
      if (evt.locationId) {
        await store.deleteJobsForLocation(evt.locationId);
        await store.deleteLocation(evt.locationId);
        await store.log(evt.locationId, 'uninstalled', '');
      } else if (evt.companyId) {
        await store.deleteCompany(evt.companyId);
      }
    } else if (APPOINTMENT_EVENTS.includes(type) && evt.locationId) {
      const loc = await store.getLocation(evt.locationId);
      if (loc && loc.installed) {
        const result = await jobs.onAppointment(evt.locationId, evt.appointment, type);
        return res.json({ ok: true, result });
      }
    }
    res.json({ ok: true });
  }));

  /* ---------- Zoom webhook (URL validation + deauthorization) ---------- */
  app.post('/webhooks/zoom', express.raw({ type: '*/*', limit: '256kb' }), ah(async (req, res) => {
    const secret = cfg.zoom.webhookSecret;
    const raw = req.body instanceof Buffer ? req.body.toString('utf8') : '';
    let evt;
    try { evt = JSON.parse(raw); } catch (e) { return res.status(400).end(); }
    if (!secret) return res.status(503).json({ error: 'ZOOM_WEBHOOK_SECRET not set' });
    if (evt.event === 'endpoint.url_validation') {
      const plainToken = evt.payload && evt.payload.plainToken;
      return res.json({ plainToken, encryptedToken: nodeCrypto.createHmac('sha256', secret).update(String(plainToken)).digest('hex') });
    }
    const ts = req.headers['x-zm-request-timestamp'];
    const expected = 'v0=' + nodeCrypto.createHmac('sha256', secret).update('v0:' + ts + ':' + raw).digest('hex');
    if (!safeEqual(expected, req.headers['x-zm-signature'] || '')) return res.status(401).end();
    if (evt.event === 'app_deauthorized') await store.log(null, 'zoom_deauthorized', (evt.payload && evt.payload.user_id) || '');
    res.json({ ok: true });
  }));

  /* ---------- scheduler (Vercel Cron or any pinger) ---------- */
  app.get(['/cron/run', '/api/cron/run'], ah(async (req, res) => {
    const given = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '') || String(req.query.key || '');
    if (!cfg.cronSecret || !safeEqual(given, cfg.cronSecret)) return res.status(401).json({ error: 'unauthorized' });
    res.json(Object.assign({ ok: true }, await jobs.runDue()));
  }));

  /* ---------- settings page (custom page inside HighLevel) ---------- */
  const appHtml = fs.readFileSync(path.join(__dirname, 'views', 'app.html'), 'utf8');
  app.get('/app', (req, res) => res.type('html').send(appHtml.replace(/__APP_NAME__/g, esc(cfg.appName))));

  app.post('/app/sso', express.json({ limit: '32kb' }), ah(async (req, res) => {
    const data = decryptGhlSso(req.body && req.body.payload, cfg.ghl.ssoKey);
    const locationId = data && (data.activeLocation || data.locationId);
    if (!locationId) return res.status(401).json({ error: 'Open this page from inside a HighLevel sub-account.' });
    const loc = await store.getLocation(locationId);
    if (!loc || !loc.installed) return res.status(404).json({ error: 'The app is not installed on this sub-account yet.' });
    res.json({ token: crypto.sign({ loc: locationId, uid: data.userId || null, exp: Date.now() + 12 * 3600e3 }), user: data.userName || data.email || '' });
  }));

  const authed = (req, res, next) => {
    const s = crypto.unsign(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
    if (!s || !s.loc) return res.status(401).json({ error: 'Session expired. Reload the page.' });
    req.loc = s.loc; next();
  };
  const api = express.Router();
  api.use(express.json({ limit: '64kb' }), authed);

  api.get('/state', ah(async (req, res) => {
    const loc = await store.getLocation(req.loc);
    const connections = {};
    for (const p of providers.list()) {
      const c = loc.connections && loc.connections[p.name];
      connections[p.name] = { label: p.label, configured: p.configured(), connected: !!c, account: c ? { email: c.account.email, name: c.account.name } : null, broken: c ? c.broken || null : null };
    }
    res.json({ settings: await settings.get(req.loc), connections, logs: await store.recentLogs(req.loc, 30), notesAi: notes.enabled });
  }));
  api.post('/settings', ah(async (req, res) => res.json({ settings: await settings.save(req.loc, req.body || {}) })));
  api.post('/connect/:provider', ah(async (req, res) => {
    const p = providers.get(req.params.provider);
    if (!p || !p.configured()) return res.status(400).json({ error: 'This platform is not configured on the server.' });
    res.json({ url: p.authorizeUrl(crypto.sign({ loc: req.loc, p: p.name, exp: Date.now() + 15 * 60e3, n: nodeCrypto.randomBytes(6).toString('hex') })) });
  }));
  api.post('/disconnect/:provider', ah(async (req, res) => {
    if (!providers.get(req.params.provider)) return res.status(404).end();
    await providers.disconnect(req.loc, req.params.provider);
    res.json({ ok: true });
  }));
  app.use('/app/api', api);

  app.get('/connect/:provider/callback', ah(async (req, res) => {
    const st = crypto.unsign(String(req.query.state || ''));
    const p = providers.get(req.params.provider);
    const done = (ok, msg) => res.type('html').send(page(ok ? 'Connected' : 'Not connected', '<h2>' + esc(msg) + '</h2><p>You can close this window.</p>' +
      '<script>try{window.opener&&window.opener.postMessage({type:"ma-connected",ok:' + (ok ? 'true' : 'false') + '},"*")}catch(e){}setTimeout(function(){window.close()},1500)</script>'));
    if (!p || !st || st.p !== p.name) return done(false, 'This link has expired. Try connecting again.');
    if (req.query.error) return done(false, p.label + ' was not connected: ' + String(req.query.error_description || req.query.error));
    try {
      const account = await providers.connect(st.loc, p.name, String(req.query.code || ''));
      await store.log(st.loc, 'connected', p.label + ' (' + (account.email || account.name || 'account') + ')');
      done(true, p.label + ' connected');
    } catch (e) {
      await store.log(st.loc, 'connect_failed', p.label + ': ' + e.message);
      done(false, p.label + ' could not be connected: ' + e.message);
    }
  }));

  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    console.error('[error]', req.method, req.path, err && err.message);
    if (res.headersSent) return;
    res.status(err.status && err.status < 500 ? err.status : 500).json({ error: err.message || 'Server error' });
  });
  return app;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

module.exports = { createApp };
