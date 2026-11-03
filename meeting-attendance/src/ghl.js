'use strict';
/* HighLevel (GHL) API v2: OAuth tokens per sub-account, webhook verification,
   and the handful of endpoints this app uses. Everything the user sees is
   written to GHL; only the tokens are stored by the app. */
const nodeCrypto = require('crypto');
const { HttpError } = require('./http');

const EARLY_REFRESH_MS = 5 * 60 * 1000;

function createGhl({ cfg, store, crypto, http }) {
  const g = cfg.ghl;

  /* ---------- OAuth ---------- */
  function tokenRequest(params) {
    return http.request(g.apiBase + '/oauth/token', {
      method: 'POST', retries: 1,
      form: Object.assign({ client_id: g.clientId, client_secret: g.clientSecret }, params)
    });
  }

  const tokenFields = (t) => ({
    access: crypto.encrypt(t.access_token),
    refresh: t.refresh_token ? crypto.encrypt(t.refresh_token) : null,
    expiresAt: new Date(Date.now() + (Number(t.expires_in) || 3600) * 1000)
  });

  async function newLocationDoc(locationId, companyId, tok) {
    const existing = await store.getLocation(locationId);
    return Object.assign(existing || { _id: locationId, installedAt: new Date(), connections: {}, fieldIds: {} }, {
      companyId: companyId || (existing && existing.companyId) || null,
      ghl: tok,
      installed: true
    });
  }

  /* Authorization code from the install redirect. Location tokens are stored
     directly; an agency (Company) token is kept to mint location tokens. */
  async function exchangeCode(code) {
    const t = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: cfg.baseUrl + '/oauth/callback' });
    if (t.userType === 'Location' && t.locationId) {
      const doc = await newLocationDoc(t.locationId, t.companyId, tokenFields(t));
      await store.saveLocation(doc);
      return { type: 'location', locationIds: [t.locationId] };
    }
    if (t.userType === 'Company' && t.companyId) {
      await store.saveCompany({ _id: t.companyId, ghl: tokenFields(t), appId: t.appId || g.appId || null });
      const ids = await provisionCompanyLocations(t.companyId);
      return { type: 'company', companyId: t.companyId, locationIds: ids };
    }
    throw new HttpError('Unexpected token type from HighLevel: ' + (t.userType || 'unknown'), 400, null);
  }

  async function companyToken(companyId) {
    const c = await store.getCompany(companyId);
    if (!c) return null;
    if (c.ghl.expiresAt && new Date(c.ghl.expiresAt).getTime() - EARLY_REFRESH_MS > Date.now()) return crypto.decrypt(c.ghl.access);
    const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: crypto.decrypt(c.ghl.refresh), user_type: 'Company' });
    c.ghl = tokenFields(t);
    await store.saveCompany(c);
    return t.access_token;
  }

  async function mintLocationToken(companyId, locationId) {
    const ctoken = await companyToken(companyId);
    if (!ctoken) throw new HttpError('No agency token for company ' + companyId, 401, null);
    const t = await http.request(g.apiBase + '/oauth/locationToken', {
      method: 'POST', retries: 1,
      headers: { Authorization: 'Bearer ' + ctoken, Version: g.apiVersion },
      form: { companyId, locationId }
    });
    const doc = await newLocationDoc(locationId, companyId, Object.assign(tokenFields(t), { viaCompany: true }));
    await store.saveLocation(doc);
    return t.access_token;
  }

  async function provisionCompanyLocations(companyId) {
    const c = await store.getCompany(companyId);
    const appId = (c && c.appId) || g.appId;
    if (!appId) return [];
    const ctoken = await companyToken(companyId);
    const q = new URLSearchParams({ companyId, appId, isInstalled: 'true', limit: '500' });
    const r = await http.request(g.apiBase + '/oauth/installedLocations?' + q, {
      headers: { Authorization: 'Bearer ' + ctoken, Version: g.apiVersion }
    });
    const ids = [];
    for (const l of (r && r.locations) || []) {
      try { await mintLocationToken(companyId, l._id); ids.push(l._id); } catch (e) { await store.log(l._id, 'token_mint_failed', e.message); }
    }
    return ids;
  }

  async function locationToken(locationId, force) {
    const loc = await store.getLocation(locationId);
    if (!loc || !loc.ghl) throw new HttpError('Location ' + locationId + ' is not installed', 401, null);
    const exp = new Date(loc.ghl.expiresAt).getTime();
    if (!force && exp - EARLY_REFRESH_MS > Date.now()) return crypto.decrypt(loc.ghl.access);
    if (loc.ghl.refresh) {
      try {
        const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: crypto.decrypt(loc.ghl.refresh), user_type: 'Location' });
        loc.ghl = tokenFields(t);
        await store.saveLocation(loc);
        return t.access_token;
      } catch (e) {
        // Refresh tokens are single use: another worker may have just refreshed it.
        const again = await store.getLocation(locationId);
        if (again && again.ghl && new Date(again.ghl.expiresAt).getTime() - EARLY_REFRESH_MS > Date.now()) return crypto.decrypt(again.ghl.access);
        if (!loc.companyId) throw e;
      }
    }
    if (loc.companyId) return mintLocationToken(loc.companyId, locationId);
    throw new HttpError('Cannot refresh token for ' + locationId, 401, null);
  }

  /* ---------- API calls ---------- */
  async function api(locationId, method, path, json) {
    const call = async (force) => http.request(g.apiBase + path, {
      method, json,
      headers: { Authorization: 'Bearer ' + (await locationToken(locationId, force)), Version: g.apiVersion }
    });
    try { return await call(false); } catch (e) {
      if (e.status === 401) return call(true);
      throw e;
    }
  }
  const enc = encodeURIComponent;

  const getAppointment = async (loc, id) => {
    const r = await api(loc, 'GET', '/calendars/events/appointments/' + enc(id));
    return (r && (r.event || r.appointment)) || r;
  };
  const updateAppointmentStatus = (loc, id, appointmentStatus) =>
    // toNotify is left out on purpose so GHL's own workflows still fire.
    api(loc, 'PUT', '/calendars/events/appointments/' + enc(id), { appointmentStatus });
  const getContact = async (loc, id) => {
    const r = await api(loc, 'GET', '/contacts/' + enc(id));
    return (r && r.contact) || r;
  };
  const updateContactFields = (loc, id, customFields) => api(loc, 'PUT', '/contacts/' + enc(id), { customFields });
  const addTags = (loc, id, tags) => api(loc, 'POST', '/contacts/' + enc(id) + '/tags', { tags });
  const addNote = (loc, id, body, userId) => api(loc, 'POST', '/contacts/' + enc(id) + '/notes', userId ? { body, userId } : { body });
  const createTask = (loc, id, task) => api(loc, 'POST', '/contacts/' + enc(id) + '/tasks', Object.assign({ completed: false }, task));
  const getLocationInfo = async (loc) => { const r = await api(loc, 'GET', '/locations/' + enc(loc)); return (r && r.location) || r; };
  const getUser = async (loc, id) => { const r = await api(loc, 'GET', '/users/' + enc(id)); return (r && r.user) || r; };
  const listCustomFields = async (loc) => ((await api(loc, 'GET', '/locations/' + enc(loc) + '/customFields?model=contact')) || {}).customFields || [];
  const createCustomField = async (loc, def) => ((await api(loc, 'POST', '/locations/' + enc(loc) + '/customFields', def)) || {}).customField;
  const listCustomValues = async (loc) => ((await api(loc, 'GET', '/locations/' + enc(loc) + '/customValues')) || {}).customValues || [];
  const createCustomValue = async (loc, name, value) => ((await api(loc, 'POST', '/locations/' + enc(loc) + '/customValues', { name, value })) || {}).customValue;
  const updateCustomValue = async (loc, id, name, value) => ((await api(loc, 'PUT', '/locations/' + enc(loc) + '/customValues/' + enc(id), { name, value })) || {}).customValue;

  /* ---------- Webhooks ---------- */
  function verifyWebhook(rawBody, headers) {
    if (g.skipWebhookVerify) return true;
    const ed = headers['x-ghl-signature'];
    if (ed && process.env.GHL_WEBHOOK_ED25519_KEY) {
      try { return nodeCrypto.verify(null, rawBody, process.env.GHL_WEBHOOK_ED25519_KEY.replace(/\\n/g, '\n'), Buffer.from(ed, 'base64')); } catch (e) { return false; }
    }
    const sig = headers['x-wh-signature'];
    if (!sig) return false;
    try { return nodeCrypto.verify('sha256', rawBody, g.webhookPublicKey, Buffer.from(sig, 'base64')); } catch (e) { return false; }
  }

  return {
    exchangeCode, mintLocationToken, provisionCompanyLocations, locationToken, api,
    getAppointment, updateAppointmentStatus, getContact, updateContactFields, addTags, addNote, createTask, getUser, getLocationInfo,
    listCustomFields, createCustomField, listCustomValues, createCustomValue, updateCustomValue,
    verifyWebhook
  };
}

module.exports = { createGhl };
