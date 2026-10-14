/* =====================================================================
   RUNTIME  (bundled first; shared by effects.js and customizer.js)
   - license, mode and live config (UC.active / resolved values UC.r)
   - one XHR/fetch hook that fans responses out to listeners
   - runtime company guard: the logged-in user must belong to the
     licensed agency, otherwise everything shuts off
   - served stylesheet, live-preview layer, realtime updates
   Modes (decided by the server per domain):
     full   - theme CSS is linked, effects run immediately
     verify - shared CRM domain: theme loads after company check
     setup  - domain not connected yet: only the Connect button
   ===================================================================== */
/* global UC_BOOT */
var UC = (function () {
  'use strict';
  const E = window.UCThemeEngine;
  const B = UC_BOOT;
  const L = B.license;
  const on = { response: [], kill: [], change: [], live: [] };
  const emit = (k) => on[k].slice().forEach((fn) => { try { fn(); } catch (e) { /* never break the CRM */ } });

  const UC = {
    E: E,
    mode: B.mode,
    license: L,
    version: B.version,
    baked: E.sanitize(B.config),   // config currently saved on the server
    active: null,                  // config on screen (draft while editing)
    r: null,                       // resolved values of `active`
    killed: false,
    live: B.mode === 'full',       // theme + effects running
    editing: false,
    users: {},                     // email -> { roles, companyId }
    company: 'unknown',            // 'match' | 'mismatch' | 'unknown'
    onResponse: (fn) => on.response.push(fn),
    onKill: (fn) => on.kill.push(fn),
    onChange: (fn) => on.change.push(fn),
    onLive: (fn) => { if (UC.live) fn(); else on.live.push(fn); },
    api: (p) => L.base + p
  };
  UC.setActive = function (cfg) { UC.active = cfg; UC.r = E.resolve(cfg); emit('change'); };
  UC.setActive(UC.baked);

  const PREVIEW_ID = 'uc-preview-layer';
  const VERIFIED_ID = 'uc-verified-theme';
  const LINK_ID = 'uc-theme-link';
  const themePath = '/c/' + L.key + '/theme.css';
  const themeUrl = L.base + themePath;

  /* ---------------- network hook ---------------- */
  function dispatch(url, text) {
    if (UC.killed || typeof text !== 'string' || text.length > 2e6) return;
    if (text.indexOf('"roles"') !== -1) { try { ingest(JSON.parse(text), 0); } catch (e) { /* not json */ } }
    on.response.forEach((fn) => { try { fn(String(url || ''), text); } catch (e) { /* ignore */ } });
  }
  (function hookNetwork() {
    const open = XMLHttpRequest.prototype.open;
    const send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) { this.__ucUrl = url; return open.apply(this, arguments); };
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
            if ((res.headers.get('content-type') || '').indexOf('json') !== -1) res.clone().text().then((t) => dispatch(url, t)).catch(() => {});
          } catch (e) { /* ignore */ }
          return res;
        });
      };
    }
  })();

  /* ---------------- company guard ---------------- */
  function ingest(json, depth) {
    if (!json || typeof json !== 'object' || depth > 6) return;
    if (Array.isArray(json)) { json.slice(0, 300).forEach((x) => ingest(x, depth + 1)); return; }
    if (typeof json.email === 'string' && json.roles && typeof json.roles === 'object') {
      const cid = json.companyId || json.roles.companyId || null;
      UC.users[json.email.toLowerCase()] = { roles: json.roles, companyId: cid };
      if (cid) companySeen(cid === L.companyId);
    }
    for (const k in json) if (json[k] && typeof json[k] === 'object') ingest(json[k], depth + 1);
  }
  function companySeen(match) {
    if (match) {
      if (UC.company !== 'match') { UC.company = 'match'; if (UC.mode === 'verify') goLive(); }
      return;
    }
    if (UC.company === 'unknown') {
      UC.company = 'mismatch';
      // Give a matching user object a moment to show up before shutting down.
      setTimeout(() => { if (UC.company !== 'match') UC.kill('this license belongs to a different agency'); }, 1200);
    }
  }
  UC.currentEmail = function () {
    const el = document.querySelector('.hl_header--dropdown .user-info-card .text-xs');
    return el ? el.textContent.trim().toLowerCase() : '';
  };

  /* ---------------- served stylesheet (link / @import / verified) ---------------- */
  const detached = [];
  function servedLinks() {
    return Array.from(document.querySelectorAll('link[rel="stylesheet"]')).filter((l) => (l.href || '').indexOf(themePath) !== -1);
  }
  function eachImport(cb) {
    Array.from(document.styleSheets).forEach((sheet) => {
      let rules;
      try { rules = sheet.cssRules; } catch (e) { return; }
      for (let i = rules.length - 1; i >= 0; i--) {
        const r = rules[i];
        if (r.type === 3 && (r.href || '').indexOf(themePath) !== -1) cb(sheet, i, r);
      }
    });
  }
  function hasServed() {
    if (servedLinks().length || detached.length || document.getElementById(VERIFIED_ID)) return true;
    let found = false;
    eachImport(() => { found = true; });
    return found;
  }
  function detachServed() {
    servedLinks().forEach((l) => { l.disabled = true; });
    const v = document.getElementById(VERIFIED_ID);
    if (v) v.disabled = true;
    eachImport((sheet, i, r) => {
      detached.push({ sheet, cssText: r.cssText });
      try { sheet.deleteRule(i); } catch (e) { /* ignore */ }
    });
  }
  function ensureServed() {
    if (UC.killed || UC.mode !== 'full' || hasServed()) return;
    const l = document.createElement('link');
    l.id = LINK_ID; l.rel = 'stylesheet'; l.href = themeUrl;
    document.head.appendChild(l);
  }
  if (UC.mode === 'full') setTimeout(ensureServed, 1500);

  // Shared CRM domains: fetch the theme only after the company matched.
  function goLive() {
    if (UC.live || UC.killed) return;
    fetch(themeUrl, { credentials: 'omit', headers: { 'X-UC-Verified': '1' } })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error('theme ' + r.status))))
      .then((css) => {
        if (UC.killed) return;
        let el = document.getElementById(VERIFIED_ID);
        if (!el) { el = document.createElement('style'); el.id = VERIFIED_ID; document.head.appendChild(el); }
        el.textContent = css;
        UC.live = true;
        emit('live');
      })
      .catch(() => {});
  }

  /* ---------------- preview layer ---------------- */
  let tplPromise = null;
  UC.template = function () {
    if (!tplPromise) {
      tplPromise = fetch(UC.api('/c/' + L.key + '/template.css'), { credentials: 'omit' })
        .then((r) => (r.ok ? r.text() : Promise.reject(new Error('template ' + r.status))))
        .catch((e) => { tplPromise = null; throw e; });
    }
    return tplPromise;
  };
  // Paint `cfg` immediately (used while editing and for realtime updates).
  UC.render = function (cfg) {
    if (UC.killed) return Promise.resolve();
    UC.setActive(E.sanitize(cfg));
    const want = UC.active;
    return UC.template().then((tpl) => {
      if (UC.active !== want || UC.killed) return;
      let el = document.getElementById(PREVIEW_ID);
      if (!el) { el = document.createElement('style'); el.id = PREVIEW_ID; }
      el.textContent = E.compile(tpl, want);
      if (document.documentElement.lastElementChild !== el) document.documentElement.appendChild(el);
      detachServed();
    });
  };

  /* ---------------- saving + realtime updates ---------------- */
  const TOKEN_LS = 'uc_editor_' + L.key;
  UC.editorToken = (v) => {
    try {
      if (v === undefined) return localStorage.getItem(TOKEN_LS) || '';
      if (v) localStorage.setItem(TOKEN_LS, v); else localStorage.removeItem(TOKEN_LS);
    } catch (e) { return ''; }
    return v;
  };
  // Save to the server (MongoDB). Resolves to the new version.
  UC.save = function (cfg) {
    const clean = E.sanitize(cfg);
    return fetch(UC.api('/api/config'), {
      method: 'PUT',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + UC.editorToken() },
      body: JSON.stringify({ key: L.key, config: clean })
    }).then((r) => r.json().catch(() => ({})).then((j) => {
      if (!r.ok) { const err = new Error(j.error || ('Save failed (' + r.status + ')')); err.status = r.status; throw err; }
      UC.version = j.version; UC.baked = clean;
      return j.version;
    }));
  };

  function poll() {
    if (UC.killed || !UC.live || UC.editing || document.hidden) return;
    fetch(UC.api('/c/' + L.key + '/v.json?have=' + UC.version), { credentials: 'omit' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j || !(j.v > UC.version) || !j.config || UC.editing) return;
        UC.version = j.v;
        UC.baked = E.sanitize(j.config);
        UC.render(UC.baked).catch(() => {});
      })
      .catch(() => {});
  }
  setInterval(poll, 60000);
  document.addEventListener('visibilitychange', poll);

  /* ---------------- kill switch ---------------- */
  UC.kill = function (reason) {
    if (UC.killed) return;
    UC.killed = true;
    UC.live = false;
    try { console.warn('[Ultimate Customizer] disabled: ' + reason); } catch (e) { /* ignore */ }
    emit('kill');
    detachServed();
    [PREVIEW_ID, LINK_ID, VERIFIED_ID, 'irvex-network-canvas', 'irvex-login-network-canvas'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });
  };

  return UC;
})();
