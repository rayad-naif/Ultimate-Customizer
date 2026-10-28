'use strict';
/* =====================================================================
   LICENSING - one record per agency (companyId)

   How a purchase stays locked to one agency:
   1. License gate     assets are only served while the app is installed
                       (OAuth / webhooks) and not suspended by you.
   2. Domain binding   full CSS/JS is only served to domains the agency has
                       connected. Connecting a domain needs an admin of THAT
                       agency to approve it after signing in with your CRM,
                       and the domain is taken from the browser's Origin header.
   3. Runtime check    the script reads the logged-in user's companyId from
                       the CRM's own API responses and shuts itself off if it
                       belongs to another agency.
   4. Monitoring       every unknown domain that requests the files is logged
                       ("blocked attempts") in the Super Admin panel.
   ===================================================================== */
const engine = require('../shared/theme-engine');
const { randomToken } = require('./security');

const COMPANY_RE = /^[A-Za-z0-9_-]{6,64}$/;
const HOST_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const PAIR_RE = /^[A-Za-z0-9_-]{20,64}$/;
// Hosts every CRM agency shares: binding them cannot tell agencies apart,
// so there the theme only loads after the runtime company check passes.
const SHARED_HOSTS = ['app.gohighlevel.com', 'app.leadconnectorhq.com', 'app.msgsndr.com'];
const MAX_SEEN = 25;
const EDITOR_TTL = 30 * 24 * 3600e3;
const PAIR_TTL = 10 * 60e3;
const { randomToken, hashPassword, verifyPassword } = require('./security');
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/;

function createLicensing(store, ghl, sec, opts) {
  // 'pending' = new agencies wait for your approval in Super Admin before anything loads.
  const newInstallStatus = (opts && opts.newInstallStatus) === 'pending' ? 'pending' : 'active';
  const newAssetKey = () => 'k_' + randomToken(18);

  function blank(companyId) {
    const now = new Date().toISOString();
    return {
      companyId,
      name: '',
      key: newAssetKey(),          // appears in the CSS/JS URLs
      installed: false,            // app installed in CRM (OAuth / webhook)
      suspended: false,            // switched off in the Super Admin panel
      pending: false,              // waiting for approval (NEW_INSTALL_STATUS=pending)
      source: 'oauth',
      config: engine.sanitize({}),
      configVersion: 1,
      boundHosts: [],              // domains approved by the agency
      seenHosts: {},               // bound domains -> last seen
      blockedHosts: {},            // unknown domains -> { n, last }
      editorEpoch: 1,              // bump to revoke every editor token
      login: null,   // { email, hash, epoch, setAt }
      tokens: null,                // encrypted { access, refresh }
      tokenExpiresAt: null,
      scope: '',
      installedBy: null,
      installedAt: now,
      uninstalledAt: null,
      lastVerifiedAt: null,
      lastVerifyResult: '',
      notes: ''
    };
  }

  // Older records may miss newer fields.
  function normalize(inst) {
    inst.login = inst.login || null;
    if (!inst) return inst;
    inst.boundHosts = inst.boundHosts || inst.allowedHosts || [];
    inst.seenHosts = inst.seenHosts || {};
    inst.blockedHosts = inst.blockedHosts || {};
    inst.editorEpoch = inst.editorEpoch || 1;
    if (!inst.config || inst.config.v !== 2) inst.config = engine.sanitize(inst.config && inst.config.v === 2 ? inst.config : {});
    delete inst.allowedHosts; delete inst.publishKeyHash;
    return inst;
  }
  const get = async (companyId) => normalize(await store.get(companyId));
  const byKey = async (key) => normalize(await store.byKey(key));
  const list = async () => (await store.list()).map(normalize);

  const isLicensed = (inst) => !!(inst && inst.installed && !inst.suspended && !inst.pending);
  function statusOf(inst) {
    if (!inst) return 'not_installed';
    if (inst.suspended) return 'suspended';
    if (inst.pending) return 'pending';
    return inst.installed ? 'active' : 'uninstalled';
  }

  /* ---------------- tokens from the CRM ---------------- */
  function storeTokens(inst, t) {
    inst.tokens = sec.encrypt(JSON.stringify({ access: t.access_token, refresh: t.refresh_token }));
    inst.tokenExpiresAt = t.expires_in ? new Date(Date.now() + t.expires_in * 1000).toISOString() : null;
    if (t.scope) inst.scope = t.scope;
  }
  function readTokens(inst) {
    const raw = inst.tokens && sec.decrypt(inst.tokens);
    return raw ? JSON.parse(raw) : null;
  }

  async function installFromOAuth(code) {
    const t = await ghl.exchangeCode(code);
    let inst = await get(t.companyId);
    const isNew = !inst;
    if (!inst) inst = blank(t.companyId);
    storeTokens(inst, t);
    inst.installedBy = t.userId || inst.installedBy;
    if (isNew) inst.installedAt = new Date().toISOString();
    // In approval mode, new agencies and returning ones that had uninstalled wait for approval.
    if (newInstallStatus === 'pending' && (isNew || !inst.installed)) inst.pending = true;
    inst.installed = true;
    inst.uninstalledAt = null;
    try {
      const c = await ghl.getCompany(t.access_token, t.companyId);
      if (c && c.name) inst.name = String(c.name).slice(0, 120);
    } catch (e) { /* scope missing or API down: name stays empty */ }
    await store.put(inst);
    await store.log(inst.companyId, isNew ? 'install' : 'sign_in', 'via CRM OAuth' + (isNew && inst.pending ? ' (pending approval)' : ''));
    return inst;
  }

  async function addManual(companyId, name) {
    if (!COMPANY_RE.test(companyId)) throw new Error('Invalid company ID');
    let inst = await get(companyId);
    if (!inst) { inst = blank(companyId); inst.source = 'manual'; }
    inst.installed = true;
    inst.pending = false;
    if (name) inst.name = String(name).slice(0, 120);
    await store.put(inst);
    await store.log(companyId, 'manual_add', name || '');
    return inst;
  }

  /* Confirm the app is still installed by refreshing the agency token.
     invalid_grant / 401 => CRM revoked it => uninstalled. */
  async function verify(inst) {
    const tokens = readTokens(inst);
    if (!tokens || !tokens.refresh) {
      inst.lastVerifiedAt = new Date().toISOString();
      inst.lastVerifyResult = inst.source === 'manual' ? 'manual license (no token)' : 'no token stored';
      await store.put(inst);
      return inst.lastVerifyResult;
    }
    let result;
    try {
      const t = await ghl.refresh(tokens.refresh);
      storeTokens(inst, t);
      if (!inst.installed) await store.log(inst.companyId, 'reinstated', 'token valid again');
      inst.installed = true;
      result = 'ok';
    } catch (e) {
      const body = e.body && typeof e.body === 'object' ? e.body : {};
      const revoked = e.status === 401 || e.status === 403 ||
        (e.status === 400 && /invalid_grant|unauthorized|revoked/i.test(String(body.error || '') + String(body.error_description || '') + String(body.message || '')));
      if (revoked) { await markUninstalled(inst, 'token revoked'); result = 'revoked: uninstalled'; }
      else result = 'error: ' + e.message;
    }
    inst.lastVerifiedAt = new Date().toISOString();
    inst.lastVerifyResult = result;
    await store.put(inst);
    return result;
  }

  async function markUninstalled(inst, why) {
    if (!inst.installed) return;
    inst.installed = false;
    inst.uninstalledAt = new Date().toISOString();
    await store.put(inst);
    await store.log(inst.companyId, 'uninstall', why || '');
  }

  async function rotateAssetKey(inst) {
    inst.key = newAssetKey();
    await store.put(inst);
    await store.log(inst.companyId, 'asset_key_rotated');
    return inst.key;
  }

  async function saveConfig(inst, cfg, who) {
    inst.config = engine.sanitize(cfg);
    inst.configVersion = (inst.configVersion || 1) + 1;
    await store.put(inst);
    if (who) await store.log(inst.companyId, 'config_saved', who);
    return inst.config;
  }

  /* ---------------- domains ---------------- */
  const cleanHost = (h) => String(h || '').trim().toLowerCase()
    .replace(/^https?:\/\//, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '');
  const validHost = (h) => HOST_RE.test(h) && h.length <= 253;
  const isShared = (h) => SHARED_HOSTS.indexOf(h) !== -1;
  const isBound = (inst, host) => !!host && inst.boundHosts.indexOf(host) !== -1;

  async function bindHost(inst, host, how) {
    host = cleanHost(host);
    if (!validHost(host)) throw new Error('Invalid domain');
    if (inst.boundHosts.indexOf(host) === -1) {
      if (inst.boundHosts.length >= 20) throw new Error('Too many domains (20 max)');
      inst.boundHosts.push(host);
      delete inst.blockedHosts[host];
      await store.put(inst);
      await store.log(inst.companyId, 'domain_connected', host + (how ? ' (' + how + ')' : ''));
    }
    return host;
  }
  async function unbindHost(inst, host, who) {
    const i = inst.boundHosts.indexOf(host);
    if (i === -1) return;
    inst.boundHosts.splice(i, 1);
    await store.put(inst);
    await store.log(inst.companyId, 'domain_removed', host + (who ? ' by ' + who : ''));
  }

  // Bookkeeping for the Super Admin panel; writes at most hourly per host.
  async function noteRequest(inst, host, bound) {
    if (!host || !validHost(host)) return;
    const now = new Date().toISOString();
    if (bound) {
      const prev = inst.seenHosts[host];
      if (prev && Date.now() - Date.parse(prev) < 3600e3) return;
      inst.seenHosts[host] = now;
      trim(inst.seenHosts, (v) => v);
    } else {
      // Before any domain is connected the agency is still setting up: not an attempt.
      if (!inst.boundHosts.length) return;
      const b = inst.blockedHosts[host] || { n: 0, last: null, first: now };
      b.n += 1;
      const quiet = b.last && Date.now() - Date.parse(b.last) < 3600e3;
      b.last = now;
      inst.blockedHosts[host] = b;
      trim(inst.blockedHosts, (v) => v.last);
      if (quiet && b.n % 50 !== 0) return;
      if (b.n === 1) await store.log(inst.companyId, 'blocked_domain', host);
    }
    await store.put(inst);
  }
  function trim(map, when) {
    const keys = Object.keys(map);
    if (keys.length <= MAX_SEEN) return;
    keys.sort((a, b) => String(when(map[a])).localeCompare(String(when(map[b]))));
    keys.slice(0, keys.length - MAX_SEEN).forEach((k) => delete map[k]);
  }

  /* What a request from `host` gets:
       full    -> theme CSS + full script
       verify  -> shared CRM domain: script loads the theme only after
                  confirming the user belongs to this agency
       setup   -> licensed, but this domain is not connected yet: script only
                  offers agency admins the "Connect" button
       off     -> not licensed */
  function modeFor(inst, host) {
    if (!isLicensed(inst)) return 'off';
    if (isBound(inst, host)) return isShared(host) ? 'verify' : 'full';
    return 'setup';
  }

  /* ---------------- pairing (connect a domain) ---------------- */
  const validPair = (id) => typeof id === 'string' && PAIR_RE.test(id);

  async function approvePairing(inst, pairId) {
    if (!validPair(pairId)) throw new Error('Invalid connection request');
    await store.putPairing({ id: pairId, companyId: inst.companyId, key: inst.key, approved: true, expiresAt: new Date(Date.now() + PAIR_TTL).toISOString() });
    await store.log(inst.companyId, 'connect_approved');
  }

  // Called by the script running on the domain. The domain comes from the
  // browser-controlled Origin header, never from the request body.
  async function claimPairing(inst, pairId, originHost) {
    if (!validPair(pairId) || !validHost(originHost)) return null;
    const p = await store.getPairing(pairId);
    if (!p || !p.approved || p.companyId !== inst.companyId || p.key !== inst.key) return null;
    await store.deletePairing(pairId);
    await bindHost(inst, originHost, 'approved by agency admin');
    return issueEditorToken(inst, originHost);
  }

  function issueEditorToken(inst, host) {
    return sec.sign({ t: 'ed', c: inst.companyId, h: host, e: inst.editorEpoch, exp: Date.now() + EDITOR_TTL });
  }
  function checkEditorToken(inst, token, originHost) {
    const s = sec.unsign(token);
    return !!(s && s.t === 'ed' && s.c === inst.companyId && s.e === inst.editorEpoch && s.h === originHost && isBound(inst, originHost));
  }
  async function revokeEditors(inst, who) {
    inst.editorEpoch += 1;
    await store.put(inst);
    await store.log(inst.companyId, 'editors_revoked', who || '');
  }
   const cleanEmail = (e) => String(e || '').trim().toLowerCase().slice(0, 254);

async function setLogin(inst, email, password, who) {
  email = cleanEmail(email);
  if (!EMAIL_RE.test(email)) throw new Error('Enter a valid email address.');
  if (typeof password !== 'string' || password.length < 10) throw new Error('Use a password of at least 10 characters.');
  if (password.length > 200) throw new Error('That password is too long (200 characters max).');
  const other = await store.byLoginEmail(email);
  if (other && other.companyId !== inst.companyId) throw new Error('That email is already used by another agency. Use a different one.');
  inst.login = { email, hash: await hashPassword(password), epoch: ((inst.login && inst.login.epoch) || 0) + 1, setAt: new Date().toISOString() };
  await store.put(inst);
  await store.log(inst.companyId, 'login_set', who || '');
  return inst;
}

async function checkLogin(email, password) {
  const inst = normalize(await store.byLoginEmail(cleanEmail(email)));
  const ok = await verifyPassword(String(password || ''), inst && inst.login && inst.login.hash);
  return inst && ok ? inst : null;
}
  return {
    COMPANY_RE, SHARED_HOSTS, get, byKey, list, isLicensed, statusOf, installFromOAuth, addManual, verify, markUninstalled,
    rotateAssetKey, saveConfig, cleanHost, validHost, isShared, bindHost, unbindHost, noteRequest, modeFor,
    validPair, approvePairing, claimPairing, checkEditorToken, revokeEditors
  };
}

module.exports = { createLicensing };
