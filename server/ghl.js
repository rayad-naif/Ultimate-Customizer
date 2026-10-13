'use strict';
/* HighLevel OAuth 2.0 (Target User: Agency) + webhook verification. */
const crypto = require('crypto');

class GhlError extends Error {
  constructor(message, status, body) { super(message); this.status = status; this.body = body; }
}

function createGhl(cfg, fetchImpl) {
  const doFetch = fetchImpl || fetch;
  const g = cfg.ghl;

  function authorizeUrl(state) {
    const u = new URL(g.authUrl);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('redirect_uri', cfg.redirectUri);
    u.searchParams.set('client_id', g.clientId);
    u.searchParams.set('scope', g.scopes);
    if (state) u.searchParams.set('state', state);
    return u.toString();
  }

  async function tokenRequest(params) {
    const body = new URLSearchParams(Object.assign({
      client_id: g.clientId,
      client_secret: g.clientSecret,
      user_type: 'Company'
    }, params));
    const res = await doFetch(g.apiBase + '/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) { /* non-json */ }
    if (!res.ok) throw new GhlError('Token request failed (' + res.status + ')', res.status, json || text);
    return json || {};
  }

  // Authorization code -> agency (Company) token.
  async function exchangeCode(code) {
    const t = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: cfg.redirectUri });
    if (t.userType !== 'Company' || !t.companyId) {
      throw new GhlError('This app must be installed by an agency (got a ' + (t.userType || 'unknown') + ' level token).', 400, t);
    }
    return t;
  }

  const refresh = (refreshToken) => tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });

  async function getCompany(accessToken, companyId) {
    const res = await doFetch(g.apiBase + '/companies/' + encodeURIComponent(companyId), {
      headers: { Authorization: 'Bearer ' + accessToken, Version: g.apiVersion, Accept: 'application/json' }
    });
    if (!res.ok) throw new GhlError('Company lookup failed (' + res.status + ')', res.status, await res.text());
    const j = await res.json();
    return j.company || j;
  }

  /* Webhook signatures. Returns true (valid), false (invalid) or null
     (no keys configured, so the caller must double-check another way). */
  function verifyWebhook(rawBody, headers) {
    const ed = headers['x-ghl-signature'];
    const rsa = headers['x-wh-signature'];
    if (!g.webhookEd25519Key && !g.webhookRsaKey) return null;
    try {
      if (ed && g.webhookEd25519Key) {
        return crypto.verify(null, rawBody, g.webhookEd25519Key, Buffer.from(ed, 'base64'));
      }
      if (rsa && g.webhookRsaKey) {
        return crypto.verify('sha256', rawBody, g.webhookRsaKey, Buffer.from(rsa, 'base64'));
      }
    } catch (e) { return false; }
    return false;
  }

  return { authorizeUrl, exchangeCode, refresh, getCompany, verifyWebhook };
}

module.exports = { createGhl, GhlError };
