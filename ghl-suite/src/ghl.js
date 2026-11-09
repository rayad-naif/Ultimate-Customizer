'use strict';
/* HighLevel OAuth 2.0 + API client with automatic token refresh.
   Target User: Sub-account (Location). Agency bulk installs are supported:
   the agency token is kept and location tokens are minted from it on demand. */
const crypto = require('crypto');

class GhlError extends Error {
  constructor(message, status, body) { super(message); this.name = 'GhlError'; this.status = status; this.body = body; }
}
const SKEW = 5 * 60e3; // refresh 5 minutes before expiry

function createGhl(cfg, store, sec, fetchImpl) {
  const doFetch = fetchImpl || ((...a) => fetch(...a));
  const g = cfg.ghl;

  async function call(method, url, opts) {
    opts = opts || {};
    const headers = Object.assign({ Accept: 'application/json', Version: g.apiVersion }, opts.headers || {});
    let body;
    if (opts.form) { headers['Content-Type'] = 'application/x-www-form-urlencoded'; body = new URLSearchParams(opts.form); }
    else if (opts.body !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(opts.body); }
    const res = await doFetch(url, { method, headers, body });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : {}; } catch (e) { /* not json */ }
    if (!res.ok) {
      const m = json && (json.message || json.error_description || json.error);
      throw new GhlError(method + ' ' + url.replace(g.apiBase, '').split('?')[0] + ' failed (' + res.status + ')' + (m ? ': ' + (Array.isArray(m) ? m.join(', ') : m) : ''), res.status, json || text);
    }
    return json || {};
  }

  function verifyWebhook(rawBody, headers) {
    // true = valid, false = invalid, null = no keys configured (caller double-checks)
    const ed = headers['x-ghl-signature'], rsa = headers['x-wh-signature'];
    if (!g.webhookEd25519Key && !g.webhookRsaKey) return null;
    try {
      if (ed && g.webhookEd25519Key) return crypto.verify(null, rawBody, g.webhookEd25519Key, Buffer.from(ed, 'base64'));
      if (rsa && g.webhookRsaKey) return crypto.verify('sha256', rawBody, g.webhookRsaKey, Buffer.from(rsa, 'base64'));
    } catch (e) { return false; }
    return false;
  }

  const sealTokens = (t) => sec.encrypt(JSON.stringify({ a: t.access_token, r: t.refresh_token || null }));
  const openTokens = (blob) => { try { return JSON.parse(sec.decrypt(blob) || 'null'); } catch (e) { return null; } };
  const expiresAt = (t) => new Date(Date.now() + (Number(t.expires_in) || 86399) * 1000).toISOString();

  function forApp(def) {
    const creds = def.creds;
    const redirectUri = cfg.baseUrl + '/' + def.slug + '/oauth/callback';
    const appId = String(creds.clientId).split('-')[0];

    function authorizeUrl(state) {
      const u = new URL(g.authUrl);
      u.searchParams.set('response_type', 'code');
      u.searchParams.set('redirect_uri', redirectUri);
      u.searchParams.set('client_id', creds.clientId);
      u.searchParams.set('scope', def.scopes.join(' '));
      if (state) u.searchParams.set('state', state);
      return u.toString();
    }

    const tokenRequest = (params) => call('POST', g.apiBase + '/oauth/token', {
      form: Object.assign({ client_id: creds.clientId, client_secret: creds.clientSecret }, params)
    });

    function blankInstall(locationId, companyId) {
      return {
        app: def.slug, locationId, companyId: companyId || null, name: '', timezone: '',
        installed: true, installedAt: new Date().toISOString(), uninstalledAt: null,
        tokens: null, expiresAt: null, viaCompany: false,
        settings: def.sanitize({}), lastEventAt: null, stats: { events: 0, actions: 0 }, needsReauth: false
      };
    }

    async function saveLocationToken(t, viaCompany) {
      const locationId = t.locationId;
      const inst = (await store.getInstall(def.slug, locationId)) || blankInstall(locationId, t.companyId);
      Object.assign(inst, {
        companyId: t.companyId || inst.companyId, installed: true, uninstalledAt: null, needsReauth: false,
        tokens: sealTokens(t), expiresAt: expiresAt(t), viaCompany: !!viaCompany
      });
      if (!inst.installedAt) inst.installedAt = new Date().toISOString();
      await enrich(inst, t.access_token);
      await store.putInstall(inst);
      return inst;
    }

    // Location name + timezone (best effort; needs locations.readonly).
    async function enrich(inst, access) {
      try {
        const j = await call('GET', g.apiBase + '/locations/' + encodeURIComponent(inst.locationId), { headers: { Authorization: 'Bearer ' + access } });
        const l = j.location || j;
        inst.name = String(l.name || inst.name || '').slice(0, 120);
        inst.timezone = String(l.timezone || inst.timezone || '');
      } catch (e) { /* keep going: name is cosmetic */ }
    }

    // Authorization code -> location install(s). Returns { installs, company }.
    async function exchangeCode(code) {
      const t = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, user_type: 'Location' });
      if (t.userType === 'Location' && t.locationId) return { installs: [await saveLocationToken(t, false)], company: null };
      if (t.userType === 'Company' && t.companyId) {
        const company = { app: def.slug, companyId: t.companyId, tokens: sealTokens(t), expiresAt: expiresAt(t), updatedAt: new Date().toISOString() };
        await store.putCompany(company);
        // Bulk install: mint a token for each sub-account that has the app.
        const installs = [];
        try {
          const j = await call('GET', g.apiBase + '/oauth/installedLocations?' + new URLSearchParams({ companyId: t.companyId, appId, isInstalled: 'true', limit: '100' }),
            { headers: { Authorization: 'Bearer ' + t.access_token } });
          for (const l of (j.locations || []).slice(0, 25)) {
            const id = l._id || l.id;
            if (id) installs.push(await installFromCompany(t.companyId, id).catch(() => null));
          }
        } catch (e) { /* locations will be picked up from INSTALL webhooks */ }
        return { installs: installs.filter(Boolean), company };
      }
      throw new GhlError('Unexpected token type: ' + (t.userType || 'unknown'), 400, t);
    }

    async function companyAccess(companyId) {
      const c = await store.getCompany(def.slug, companyId);
      const tk = c && openTokens(c.tokens);
      if (!tk) return null;
      if (Date.parse(c.expiresAt) - SKEW > Date.now()) return tk.a;
      const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: tk.r, user_type: 'Company' });
      c.tokens = sealTokens(t); c.expiresAt = expiresAt(t); c.updatedAt = new Date().toISOString();
      await store.putCompany(c);
      return t.access_token;
    }

    async function installFromCompany(companyId, locationId) {
      const access = await companyAccess(companyId);
      if (!access) return null;
      const t = await call('POST', g.apiBase + '/oauth/locationToken', { headers: { Authorization: 'Bearer ' + access }, form: { companyId, locationId } });
      t.locationId = t.locationId || locationId;
      t.companyId = t.companyId || companyId;
      return saveLocationToken(t, true);
    }

    async function accessToken(inst, force) {
      const tk = openTokens(inst.tokens);
      if (!tk) throw new GhlError('No token stored for this sub-account. Reinstall the app.', 401);
      if (!force && Date.parse(inst.expiresAt) - SKEW > Date.now()) return tk.a;
      try {
        if (!tk.r) throw new GhlError('no refresh token', 401);
        const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: tk.r, user_type: 'Location' });
        const upd = { tokens: sealTokens(t), expiresAt: expiresAt(t), needsReauth: false };
        Object.assign(inst, upd);
        await store.patchInstall(def.slug, inst.locationId, upd);
        return t.access_token;
      } catch (e) {
        // Another instance may have refreshed (refresh tokens rotate): use its token.
        const fresh = await store.getInstall(def.slug, inst.locationId);
        if (fresh && fresh.tokens !== inst.tokens && Date.parse(fresh.expiresAt) - SKEW > Date.now()) {
          Object.assign(inst, fresh);
          return openTokens(fresh.tokens).a;
        }
        if (inst.companyId && (inst.viaCompany || !tk.r)) {
          const again = await installFromCompany(inst.companyId, inst.locationId).catch(() => null);
          if (again) { Object.assign(inst, again); return openTokens(again.tokens).a; }
        }
        if (e.status === 400 || e.status === 401) { inst.needsReauth = true; await store.patchInstall(def.slug, inst.locationId, { needsReauth: true }); }
        throw e;
      }
    }

    // API client bound to one sub-account.
    function client(inst) {
      async function request(method, path, opts) {
        opts = opts || {};
        const url = g.apiBase + path + (opts.query ? (path.includes('?') ? '&' : '?') + new URLSearchParams(opts.query) : '');
        let access = await accessToken(inst, false);
        try {
          return await call(method, url, { headers: { Authorization: 'Bearer ' + access }, body: opts.body });
        } catch (e) {
          if (e.status !== 401) throw e;
          access = await accessToken(inst, true);
          return call(method, url, { headers: { Authorization: 'Bearer ' + access }, body: opts.body });
        }
      }
      return {
        request,
        get: (p, q) => request('GET', p, { query: q }),
        post: (p, b) => request('POST', p, { body: b }),
        put: (p, b) => request('PUT', p, { body: b }),
        del: (p, b) => request('DELETE', p, { body: b })
      };
    }

    // Is the app still installed? (Used for unsigned UNINSTALL webhooks.)
    async function stillInstalled(inst) {
      try { await accessToken(inst, true); return true; } catch (e) { return !(e.status === 400 || e.status === 401); }
    }

    return { redirectUri, authorizeUrl, exchangeCode, installFromCompany, client, stillInstalled, blankInstall };
  }

  return { forApp, verifyWebhook, GhlError };
}

module.exports = { createGhl, GhlError };
