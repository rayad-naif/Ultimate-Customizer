/* =====================================================================
   RUNTIME  (bundled first; shared by effects.js and customizer.js)
   - holds the license + live config
   - one XHR/fetch hook that fans responses out to listeners
   - runtime license guard: disables everything if the logged-in user
     belongs to a different agency (company) than the one licensed
   - manages the served theme stylesheet + the live-preview layer
   ===================================================================== */
/* global UC_BOOT */
var UC = (function () {
  'use strict';
  const engine = window.UCThemeEngine;
  const responseListeners = [];
  const killListeners = [];

  const UC = {
    engine: engine,
    license: UC_BOOT.license,          // { key, companyId, base }
    baked: engine.sanitize(UC_BOOT.config), // config the served CSS was built from
    active: null,                      // config currently on screen
    killed: false,
    users: {},                         // email -> { roles, companyId }
    onResponse: (fn) => responseListeners.push(fn),
    onKill: (fn) => killListeners.push(fn)
  };
  UC.active = UC.baked;

  const PREVIEW_ID = 'uc-preview-layer';
  const LINK_ID = 'uc-theme-link';
  const themePath = '/c/' + UC.license.key + '/theme.css';
  const themeUrl = UC.license.base + themePath;

  /* ---------------- network hook ---------------- */
  function dispatch(url, text) {
    if (UC.killed || typeof text !== 'string' || text.length > 2e6) return;
    if (text.indexOf('"roles"') !== -1) { try { ingest(JSON.parse(text), 0); } catch (e) { /* not json */ } }
    responseListeners.forEach((fn) => { try { fn(String(url || ''), text); } catch (e) { /* ignore */ } });
  }

  (function hookNetwork() {
    const open = XMLHttpRequest.prototype.open;
    const send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
      this.__ucUrl = url;
      return open.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function () {
      this.addEventListener('load', function () {
        try { if (this.responseType === '' || this.responseType === 'text') dispatch(this.__ucUrl, this.responseText); } catch (e) { /* ignore */ }
      });
      return send.apply(this, arguments);
    };
    if (window.fetch) {
      const f = window.fetch;
      window.fetch = function (input) {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        return f.apply(this, arguments).then((res) => {
          try {
            const ct = res.headers.get('content-type') || '';
            if (ct.indexOf('json') !== -1) res.clone().text().then((t) => dispatch(url, t)).catch(() => {});
          } catch (e) { /* ignore */ }
          return res;
        });
      };
    }
  })();

  /* ---------------- user / company detection ---------------- */
  function ingest(json, depth) {
    if (!json || typeof json !== 'object' || depth > 6) return;
    if (Array.isArray(json)) { json.slice(0, 300).forEach((x) => ingest(x, depth + 1)); return; }
    if (typeof json.email === 'string' && json.roles && typeof json.roles === 'object') {
      UC.users[json.email.toLowerCase()] = {
        roles: json.roles,
        companyId: json.companyId || json.roles.companyId || null
      };
      checkCompany();
    }
    for (const k in json) if (json[k] && typeof json[k] === 'object') ingest(json[k], depth + 1);
  }

  UC.currentEmail = function () {
    const el = document.querySelector('.hl_header--dropdown .user-info-card .text-xs');
    return el ? el.textContent.trim().toLowerCase() : '';
  };

  function checkCompany() {
    const email = UC.currentEmail();
    const u = email && UC.users[email];
    if (u && u.companyId && UC.license.companyId && u.companyId !== UC.license.companyId) {
      UC.kill('this license belongs to a different agency');
    }
  }

  /* ---------------- served stylesheet (link or @import) ---------------- */
  const detached = []; // { sheet, cssText }

  function servedLinks() {
    return Array.from(document.querySelectorAll('link[rel="stylesheet"]')).filter((l) => (l.href || '').indexOf(themePath) !== -1);
  }
  function eachImport(cb) {
    Array.from(document.styleSheets).forEach((sheet) => {
      let rules;
      try { rules = sheet.cssRules; } catch (e) { return; } // cross-origin
      for (let i = rules.length - 1; i >= 0; i--) {
        const r = rules[i];
        if (r.type === 3 /* IMPORT_RULE */ && (r.href || '').indexOf(themePath) !== -1) cb(sheet, i, r);
      }
    });
  }
  function hasServed() {
    if (servedLinks().length || detached.length) return true;
    let found = false;
    eachImport(() => { found = true; });
    return found;
  }
  function detachServed() {
    servedLinks().forEach((l) => { l.disabled = true; });
    eachImport((sheet, i, r) => {
      detached.push({ sheet: sheet, cssText: r.cssText });
      try { sheet.deleteRule(i); } catch (e) { /* ignore */ }
    });
  }
  function attachServed(bust) {
    const v = bust ? '?v=' + Date.now() : '';
    servedLinks().forEach((l) => {
      if (bust) l.href = themeUrl + v;
      l.disabled = false;
    });
    detached.splice(0).forEach((d) => {
      const css = bust ? '@import url("' + themeUrl + v + '");' : d.cssText;
      try { d.sheet.insertRule(css, 0); } catch (e) { /* ignore */ }
    });
  }
  // If the customer only pasted the JS snippet, load the CSS ourselves.
  function ensureServed() {
    if (UC.killed || hasServed()) return;
    const l = document.createElement('link');
    l.id = LINK_ID;
    l.rel = 'stylesheet';
    l.href = themeUrl;
    document.head.appendChild(l);
  }
  setTimeout(ensureServed, 1500);

  /* ---------------- live preview layer ---------------- */
  let basePromise = null;
  function baseCss() {
    if (!basePromise) {
      basePromise = fetch(UC.license.base + '/c/' + UC.license.key + '/base.css', { credentials: 'omit' })
        .then((r) => { if (!r.ok) throw new Error('base css ' + r.status); return r.text(); })
        .catch((e) => { basePromise = null; throw e; });
    }
    return basePromise;
  }
  function removePreview() {
    const el = document.getElementById(PREVIEW_ID);
    if (el) el.remove();
  }
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // Show `cfg` on screen. Returns a promise that settles once it is visible.
  UC.preview = function (cfg) {
    if (UC.killed) return Promise.resolve();
    UC.active = engine.sanitize(cfg);
    if (same(UC.active, UC.baked)) { attachServed(false); removePreview(); return Promise.resolve(); }
    const want = UC.active;
    return baseCss().then((css) => {
      if (UC.active !== want || UC.killed) return; // superseded
      let el = document.getElementById(PREVIEW_ID);
      if (!el) { el = document.createElement('style'); el.id = PREVIEW_ID; }
      el.textContent = engine.compile(css, want);
      // keep the preview layer last so it wins the cascade
      if (document.documentElement.lastElementChild !== el) document.documentElement.appendChild(el);
      detachServed();
    });
  };

  // After a publish: the server CSS now matches `cfg`; reload it fresh.
  UC.published = function (cfg) {
    UC.baked = engine.sanitize(cfg);
    UC.active = UC.baked;
    attachServed(true);
    setTimeout(() => { if (same(UC.active, UC.baked)) removePreview(); }, 2000);
  };

  UC.kill = function (reason) {
    if (UC.killed) return;
    UC.killed = true;
    try { console.warn('[Ultimate Customizer] disabled: ' + reason); } catch (e) { /* ignore */ }
    killListeners.forEach((fn) => { try { fn(); } catch (e) { /* ignore */ } });
    removePreview();
    detachServed();
    const l = document.getElementById(LINK_ID);
    if (l) l.remove();
    ['irvex-network-canvas', 'irvex-login-network-canvas'].forEach((id) => {
      const c = document.getElementById(id);
      if (c) c.remove();
    });
  };

  setInterval(() => { if (!UC.killed) checkCompany(); }, 2000);
  return UC;
})();
