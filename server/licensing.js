'use strict';
/* Install lifecycle + license decisions. One record per agency (companyId). */
const engine = require('../shared/theme-engine');
const { randomToken, sha256, safeEqual } = require('./security');

const COMPANY_RE = /^[A-Za-z0-9_-]{6,64}$/;
const HOST_RE = /^(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const MAX_SEEN_HOSTS = 25;

function createLicensing(store, ghl, sec) {
  const newAssetKey = () => 'k_' + randomToken(18);
  const newPublishKey = () => 'uc_pub_' + randomToken(24);

  function blank(companyId) {
    const now = new Date().toISOString();
    return {
      companyId,
      name: '',
      key: newAssetKey(),          // appears in the CSS/JS URLs
      publishKeyHash: null,        // sha256 of the publish key (shown once)
      installed: false,            // app installed in GHL (OAuth / webhook)
      suspended: false,            // switched off by you in the admin panel
      source: 'oauth',
      config: engine.sanitize({}),
      configVersion: 1,
      allowedHosts: [],
      seenHosts: {},
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

  const isLicensed = (inst) => !!(inst && inst.installed && !inst.suspended);

  function statusOf(inst) {
    if (!inst) return 'not_installed';
    if (inst.suspended) return 'suspended';
    return inst.installed ? 'active' : 'uninstalled';
  }

  function storeTokens(inst, t) {
    inst.tokens = sec.encrypt(JSON.stringify({ access: t.access_token, refresh: t.refresh_token }));
    inst.tokenExpiresAt = t.expires_in ? new Date(Date.now() + t.expires_in * 1000).toISOString() : null;
    if (t.scope) inst.scope = t.scope;
  }
  function readTokens(inst) {
    const raw = inst.tokens && sec.decrypt(inst.tokens);
    return raw ? JSON.parse(raw) : null;
  }

  // OAuth callback: create or re-activate the agency.
  async function installFromOAuth(code) {
    const t = await ghl.exchangeCode(code);
    let inst = await store.get(t.companyId);
    const isNew = !inst;
    if (!inst) inst = blank(t.companyId);
    storeTokens(inst, t);
    inst.installed = true;
    inst.uninstalledAt = null;
    inst.installedBy = t.userId || inst.installedBy;
    if (isNew) inst.installedAt = new Date().toISOString();
    try {
      const c = await ghl.getCompany(t.access_token, t.companyId);
      if (c && c.name) inst.name = String(c.name).slice(0, 120);
    } catch (e) { /* scope missing or API down: name stays empty */ }
    let publishKey = null;
    if (!inst.publishKeyHash) { publishKey = newPublishKey(); inst.publishKeyHash = sha256(publishKey); }
    await store.put(inst);
    await store.log(inst.companyId, isNew ? 'install' : 'reauthorize', 'via OAuth');
    return { inst, publishKey };
  }

  async function addManual(companyId, name) {
    if (!COMPANY_RE.test(companyId)) throw new Error('Invalid company ID');
    let inst = await store.get(companyId);
    let publishKey = null;
    if (!inst) {
      inst = blank(companyId);
      inst.source = 'manual';
      publishKey = newPublishKey();
      inst.publishKeyHash = sha256(publishKey);
    }
    inst.installed = true;
    if (name) inst.name = String(name).slice(0, 120);
    await store.put(inst);
    await store.log(companyId, 'manual_add', name || '');
    return { inst, publishKey };
  }

  /* Confirm the app is still installed by refreshing the agency token.
     invalid_grant / 401 => GHL revoked it => uninstalled. */
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
      if (revoked) {
        await markUninstalled(inst, 'token revoked');
        result = 'revoked: uninstalled';
      } else {
        result = 'error: ' + e.message;
      }
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

  async function rotatePublishKey(inst) {
    const key = newPublishKey();
    inst.publishKeyHash = sha256(key);
    await store.put(inst);
    await store.log(inst.companyId, 'publish_key_rotated');
    return key;
  }
  async function rotateAssetKey(inst) {
    inst.key = newAssetKey();
    await store.put(inst);
    await store.log(inst.companyId, 'asset_key_rotated');
    return inst.key;
  }
  const checkPublishKey = (inst, key) => !!(inst && inst.publishKeyHash && typeof key === 'string' && safeEqual(sha256(key), inst.publishKeyHash));

  async function saveConfig(inst, cfg, who) {
    inst.config = engine.sanitize(cfg);
    inst.configVersion = (inst.configVersion || 1) + 1;
    await store.put(inst);
    await store.log(inst.companyId, 'config_saved', who || '');
    return inst.config;
  }

  function parseHosts(text) {
    return String(text || '').split(/[\s,]+/).map((h) => h.trim().toLowerCase()
      .replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, ''))
      .filter((h) => HOST_RE.test(h)).slice(0, 20);
  }

  function hostAllowed(inst, host) {
    if (!inst.allowedHosts || !inst.allowedHosts.length || !host) return true;
    return inst.allowedHosts.some((h) => h === host || (h.startsWith('*.') && (host === h.slice(2) || host.endsWith(h.slice(1)))));
  }

  // Record where the assets are used (visible in the admin panel).
  async function noteHost(inst, host) {
    if (!host || !/^[a-z0-9.-]{3,253}$/.test(host)) return;
    const now = new Date().toISOString();
    const prev = inst.seenHosts[host];
    if (prev && Date.now() - Date.parse(prev) < 3600e3) return; // write at most hourly per host
    inst.seenHosts[host] = now;
    const hosts = Object.keys(inst.seenHosts);
    if (hosts.length > MAX_SEEN_HOSTS) {
      hosts.sort((a, b) => inst.seenHosts[a].localeCompare(inst.seenHosts[b]));
      delete inst.seenHosts[hosts[0]];
    }
    await store.put(inst);
  }

  return {
    COMPANY_RE, isLicensed, statusOf, installFromOAuth, addManual, verify, markUninstalled,
    rotatePublishKey, rotateAssetKey, checkPublishKey, saveConfig, parseHosts, hostAllowed, noteHost
  };
}

module.exports = { createLicensing };
