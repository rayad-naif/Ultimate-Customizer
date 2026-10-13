/* =====================================================================
   CUSTOMIZER  (agency admins only)
   Adds "Ultimate Customizer" above Sign out in the profile dropdown.
   - setup mode (domain not connected): the item connects the domain
   - otherwise: a full editor; every change previews instantly and is
     saved to the server automatically, which updates every user.
   ===================================================================== */
/* global UC */
(function UCCustomizer() {
  'use strict';
  const E = UC.E;
  const R = E.R;
  const NAV = E.NAV;
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

  /* ------------------------------------------------------------------
     1. ADMIN DETECTION
  ------------------------------------------------------------------ */
  function isAdmin() {
    if (UC.killed || UC.company === 'mismatch') return false;
    const u = UC.users[UC.currentEmail()];
    const r = u && u.roles;
    return !!(r && String(r.type).toLowerCase() === 'agency' && String(r.role).toLowerCase() === 'admin');
  }

  /* ------------------------------------------------------------------
     2. SIDEBAR RENAMES
  ------------------------------------------------------------------ */
  function currentView() {
    if (document.querySelector('.sidebar-v2-agency')) return 'agency';
    if (document.querySelector('.sidebar-v2-location')) return 'location';
    return /\/v2\/location\//.test(location.pathname) ? 'location' : 'agency';
  }
  function keyOf(a) {
    const id = a.id || a.getAttribute('meta') || '';
    const m = id.match(/^sb_[^.]+\.(.+)$/);
    return m ? '*.' + m[1] : id;
  }
  function applyNames() {
    const names = (UC.live && !UC.killed ? (UC.active.sidebar[currentView()] || {}).names : null) || {};
    document.querySelectorAll(NAV + ' > a').forEach((a) => {
      const t = a.querySelector('.nav-title');
      if (!t) return;
      if (!t.dataset.irvexOrig) t.dataset.irvexOrig = t.textContent.trim();
      const want = names[keyOf(a)];
      const target = want && want.trim() ? want.trim() : t.dataset.irvexOrig;
      if (t.textContent !== target) t.textContent = target;
    });
  }
  let nameRaf = 0;
  const nameObs = new MutationObserver(() => { if (!nameRaf) nameRaf = requestAnimationFrame(() => { nameRaf = 0; applyNames(); }); });
  if (UC.mode !== 'setup') {
    nameObs.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    UC.onChange(applyNames);
  }
  UC.onKill(() => { applyNames(); nameObs.disconnect(); closeUI(); removeMenuItem(); });

  /* ------------------------------------------------------------------
     3. MENU ITEM
  ------------------------------------------------------------------ */
  function removeMenuItem() {
    const existing = document.getElementById('irvex-uc-menu-item');
    if (!existing) return;
    const n = existing.nextElementSibling;
    if (n && n.classList.contains('irvex-uc-hr')) n.remove();
    existing.remove();
  }
  function ensureMenuItem() {
    const menu = document.querySelector('.hl_header--dropdown .dropdown-menu');
    if (!menu || !isAdmin()) { removeMenuItem(); return; }
    const label = UC.mode === 'setup' ? 'Connect Ultimate Customizer' : 'Ultimate Customizer';
    const existing = document.getElementById('irvex-uc-menu-item');
    if (existing && menu.contains(existing)) return;
    const signout = Array.from(menu.querySelectorAll('a.dropdown-item')).find((a) => /sign\s*out/i.test(a.textContent));
    if (!signout) return;
    const item = document.createElement('a');
    item.id = 'irvex-uc-menu-item';
    item.className = 'py-2 dropdown-item';
    item.href = 'javascript:void(0);';
    item.innerHTML = '<i class="fas fa-palette" style="margin-right:8px"></i>' + label;
    const hr = document.createElement('hr');
    hr.className = 'dropdown-divider irvex-uc-hr';
    signout.before(item, hr);
  }
  document.addEventListener('click', (e) => {
    const t = e.target.closest && e.target.closest('#irvex-uc-menu-item');
    if (!t) return;
    e.preventDefault();
    if (UC.mode === 'setup' || !UC.editorToken()) openUI('connect'); else openUI('editor');
  }, true);

  /* ------------------------------------------------------------------
     4. PANEL SHELL
  ------------------------------------------------------------------ */
  const TABS = [['themes', 'Themes']].concat(R.GROUPS.map((g) => [g.id, g.label])).concat([['menu', 'Menu'], ['advanced', 'Advanced']]);

  const UI_CSS = `
:host{all:initial}
*{box-sizing:border-box;font-family:Inter,'Segoe UI',system-ui,sans-serif}
.wrap{position:fixed;inset:0;pointer-events:none;z-index:2147483000}
.panel{--navy:#000414;--accent:#00e5ff;--gold:#ffd700;pointer-events:auto;position:absolute;top:12px;right:12px;bottom:12px;width:min(470px,calc(100vw - 24px));display:flex;flex-direction:column;
 background:rgba(4,10,24,.97);color:#e6f7ff;border:1px solid color-mix(in srgb,var(--accent) 45%,transparent);border-radius:18px;
 box-shadow:0 30px 80px rgba(0,0,0,.65),0 0 30px color-mix(in srgb,var(--accent) 18%,transparent);overflow:hidden;font-size:13px}
header{padding:14px 16px 10px;display:flex;align-items:center;gap:10px;border-bottom:1px solid color-mix(in srgb,var(--accent) 20%,transparent);cursor:move}
header h3{margin:0;font-size:14px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;background:linear-gradient(135deg,var(--accent),var(--gold));-webkit-background-clip:text;background-clip:text;color:transparent;flex:1}
.status{font-size:11px;color:#8fb7c9;white-space:nowrap}
.status.err{color:#ff6b7a}.status.ok{color:#2ee6a6}
.x{background:none;border:1px solid color-mix(in srgb,var(--accent) 40%,transparent);color:var(--accent);width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:16px;line-height:1;flex:none}
.x:hover{background:var(--gold);color:var(--navy);border-color:var(--gold)}
.tabs{display:flex;flex-wrap:wrap;gap:4px;padding:10px 12px;border-bottom:1px solid color-mix(in srgb,var(--accent) 15%,transparent)}
.tab{background:rgba(255,255,255,.04);border:1px solid transparent;color:#9cc3d5;padding:6px 10px;border-radius:99px;font-weight:600;font-size:12px;cursor:pointer}
.tab:hover{color:var(--accent);border-color:color-mix(in srgb,var(--accent) 30%,transparent)}
.tab.on{color:var(--navy);background:var(--accent)}
.search{padding:8px 12px 0}
.body{flex:1;overflow:auto;padding:10px 16px 18px}
details{border:1px solid rgba(255,255,255,.07);border-radius:12px;margin:0 0 10px;background:rgba(255,255,255,.02)}
summary{cursor:pointer;padding:10px 12px;font-size:11px;letter-spacing:1.1px;text-transform:uppercase;color:var(--accent);font-weight:700;list-style:none;display:flex;justify-content:space-between}
summary::after{content:'+';color:#6f93a4}details[open] summary::after{content:'\\2212'}
.sec{padding:0 12px 8px}
h4{margin:14px 0 8px;font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:var(--accent)}
h4:first-child{margin-top:0}
.note{font-size:11.5px;color:#8fb7c9;line-height:1.5;margin:8px 0}
.note a{color:var(--accent)}
.ctl{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.05)}
.ctl:last-child{border-bottom:0}
.lbl{min-width:0;flex:1}
.lbl b{display:block;font-weight:600;font-size:12.5px}
.lbl small{display:block;color:#7fa3b5;font-size:10.5px;margin-top:1px}
.lbl .grp{color:#56788a}
.ctl.set .lbl b::after{content:' \\2022';color:var(--gold)}
.in{display:flex;align-items:center;gap:6px;flex:none}
.rs{background:none;border:0;color:#6f93a4;cursor:pointer;font-size:14px;width:20px;padding:0;visibility:hidden}
.ctl.set .rs{visibility:visible}.rs:hover{color:var(--gold)}
input[type=color]{width:34px;height:28px;border:1px solid color-mix(in srgb,var(--accent) 40%,transparent);background:none;border-radius:7px;padding:2px;cursor:pointer}
input[type=text],input[type=number],select,textarea{background:rgba(0,26,51,.85);border:1px solid color-mix(in srgb,var(--accent) 30%,transparent);color:#e6f7ff;border-radius:8px;padding:6px 8px;font-size:12px;outline:none}
input:focus,select:focus,textarea:focus{border-color:var(--accent);box-shadow:0 0 0 2px color-mix(in srgb,var(--accent) 25%,transparent)}
.hex{width:76px;font-family:ui-monospace,monospace}
.txt{width:190px}
.num{width:58px}
input[type=range]{width:120px;accent-color:var(--accent)}
input[type=checkbox]{accent-color:var(--accent);width:17px;height:17px}
select{max-width:190px}
.full{width:100%}
.themes{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.theme{display:flex;flex-direction:column;gap:7px;text-align:left;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:#e6f7ff;border-radius:12px;padding:9px;cursor:pointer;font-size:12px;font-weight:600}
.theme:hover{border-color:var(--gold)}
.theme.on{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}
.theme i{display:flex;height:34px;border-radius:8px;overflow:hidden}
.theme i span{flex:1}
.row{display:flex;align-items:center;gap:8px;padding:7px 8px;margin-bottom:6px;background:rgba(255,255,255,.04);border:1px solid color-mix(in srgb,var(--accent) 18%,transparent);border-radius:10px}
.row.drag{opacity:.4}.row.hid .name{opacity:.45}
.grip{cursor:grab;color:var(--accent);font-size:15px;user-select:none;padding:0 3px}
.names{flex:1;min-width:0}.names input{width:100%}
.names small{display:block;color:#6f93a4;font-size:10.5px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mv{background:none;border:1px solid color-mix(in srgb,var(--accent) 30%,transparent);color:var(--accent);border-radius:6px;width:24px;height:24px;cursor:pointer;font-size:10px}
.mv:hover{background:var(--accent);color:var(--navy)}
footer{display:flex;gap:8px;align-items:center;padding:10px 16px;border-top:1px solid color-mix(in srgb,var(--accent) 20%,transparent);background:rgba(0,4,20,.6)}
footer .note{margin:0;flex:1}
.btn{border-radius:9px;border:1px solid color-mix(in srgb,var(--accent) 50%,transparent);background:transparent;color:var(--accent);padding:8px 12px;font-weight:700;font-size:12px;cursor:pointer}
.btn:hover{background:color-mix(in srgb,var(--accent) 12%,transparent)}
.btn.pri{background:var(--accent);color:var(--navy);border-color:var(--accent)}
.btn.pri:hover{background:var(--gold);border-color:var(--gold)}
.btn.sm{padding:5px 9px;font-size:11.5px}
textarea{width:100%;min-height:120px;font-family:ui-monospace,monospace;font-size:11px;resize:vertical}
.btns{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}
.connect{padding:26px 22px;text-align:center}
.connect h2{margin:6px 0 10px;font-size:18px}
.connect p{color:#9cc3d5;line-height:1.55;font-size:13px}
.spin{width:34px;height:34px;border-radius:50%;border:3px solid rgba(255,255,255,.1);border-top-color:var(--accent);animation:sp 1s linear infinite;margin:18px auto}
@keyframes sp{to{transform:rotate(360deg)}}
.toast{position:absolute;left:50%;bottom:64px;transform:translateX(-50%);background:var(--gold);color:var(--navy);font-weight:700;font-size:12px;padding:8px 14px;border-radius:99px;opacity:0;transition:opacity .25s;pointer-events:none;white-space:nowrap;max-width:90%;overflow:hidden;text-overflow:ellipsis}
.toast.show{opacity:1}
.empty{color:#7fa3b5;text-align:center;padding:30px 0}
`;

  let host = null, shadow = null, draft = null, opened = null, tab = 'themes', query = '', dragKey = null, view = 'editor';
  let saveTimer = 0, saving = false, pendingSave = false, connectTimer = 0;

  function openUI(which) {
    if (host || !isAdmin()) return;
    view = which;
    host = document.createElement('div');
    host.id = 'irvex-uc-host';
    shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<style>' + UI_CSS + '</style><div class="wrap"><div class="panel" role="dialog" aria-label="Ultimate Customizer">' +
      '<header><h3>Ultimate Customizer</h3><span class="status" id="st"></span><button class="x" data-act="close" title="Close">&times;</button></header>' +
      '<div id="main" style="display:flex;flex-direction:column;flex:1;min-height:0"></div><div class="toast" id="toast"></div></div></div>';
    document.body.appendChild(host);
    const panel = shadow.querySelector('.panel');
    ['keydown', 'keyup', 'keypress'].forEach((ev) => panel.addEventListener(ev, (e) => e.stopPropagation()));
    shadow.addEventListener('click', onClick);
    shadow.addEventListener('input', onInput);
    shadow.addEventListener('change', onChange);
    shadow.addEventListener('focusout', onBlur);
    makeDraggable(panel, shadow.querySelector('header'));
    if (view === 'connect') renderConnect('start');
    else startEditor();
  }

  function startEditor() {
    view = 'editor';
    UC.editing = true;
    draft = E.clone(UC.baked);
    opened = E.clone(UC.baked);
    renderShell();
    // Pull the latest saved version in case another admin changed it.
    fetch(UC.api('/c/' + UC.license.key + '/v.json?have=0'), { credentials: 'omit' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j || !j.config || !host || j.v <= UC.version) return;
        UC.version = j.v; UC.baked = E.sanitize(j.config);
        draft = E.clone(UC.baked); opened = E.clone(UC.baked);
        UC.render(draft); render();
      }).catch(() => {});
  }

  function closeUI() {
    if (!host) return;
    clearInterval(connectTimer);
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0; save(); }
    hideLoginMock();
    host.remove(); host = shadow = null;
    UC.editing = false;
  }

  function makeDraggable(panel, handle) {
    let sx, sy, ox, oy, on = false;
    handle.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;
      const r = panel.getBoundingClientRect();
      on = true; sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
      panel.style.right = 'auto'; panel.style.bottom = 'auto';
      panel.style.left = ox + 'px'; panel.style.top = oy + 'px'; panel.style.height = r.height + 'px';
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!on) return;
      panel.style.left = Math.max(0, ox + e.clientX - sx) + 'px';
      panel.style.top = Math.max(0, oy + e.clientY - sy) + 'px';
    });
    window.addEventListener('mouseup', () => { on = false; });
  }

  function toast(msg) {
    const t = shadow && shadow.getElementById('toast');
    if (!t) return;
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => t.classList.remove('show'), 2600);
  }
  function status(text, cls) {
    const s = shadow && shadow.getElementById('st');
    if (s) { s.textContent = text; s.className = 'status ' + (cls || ''); }
  }

  /* ------------------------------------------------------------------
     5. CONNECT FLOW
     The script makes a random pairing id and opens our app in a popup.
     An admin of THIS agency approves it after signing in with HighLevel;
     the script then claims it, which connects this domain and returns an
     editor token for this browser.
  ------------------------------------------------------------------ */
  function randomId() {
    const a = new Uint8Array(24);
    crypto.getRandomValues(a);
    return btoa(String.fromCharCode.apply(null, a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function renderConnect(stage, url) {
    const main = shadow.getElementById('main');
    const domain = esc(location.hostname);
    if (stage === 'start') {
      main.innerHTML = '<div class="connect"><h2>Connect this CRM</h2><p>To unlock Ultimate Customizer on <b>' + domain + '</b>, confirm it with the HighLevel agency account that purchased the app.' +
        (UC.mode !== 'setup' ? ' This also lets this browser save theme changes.' : '') + '</p>' +
        '<div class="btns" style="justify-content:center;margin-top:18px"><button class="btn pri" data-act="connect">Connect with HighLevel</button></div>' +
        '<p class="note">A small window opens. Sign in if asked, then click <b>Approve</b>.</p></div>';
    } else if (stage === 'wait') {
      main.innerHTML = '<div class="connect"><h2>Waiting for approval…</h2><div class="spin"></div><p>Approve the connection in the window that opened.</p>' +
        '<p class="note">Popup blocked? <a href="' + esc(url) + '" target="_blank" rel="noopener">Open it here</a>.</p>' +
        '<div class="btns" style="justify-content:center"><button class="btn sm" data-act="cancelConnect">Cancel</button></div></div>';
    } else if (stage === 'done') {
      main.innerHTML = '<div class="connect"><h2>Connected ✓</h2><p>' + domain + ' is now connected to your license.</p>' +
        (UC.mode === 'setup' ? '<p>Reloading to load your theme…</p>' : '') + '</div>';
    }
  }
  function startConnect() {
    const pair = randomId();
    const url = UC.api('/connect?key=' + encodeURIComponent(UC.license.key) + '&pair=' + encodeURIComponent(pair));
    window.open(url, 'uc-connect', 'width=540,height=760');
    renderConnect('wait', url);
    const started = Date.now();
    clearInterval(connectTimer);
    connectTimer = setInterval(() => {
      if (!host || Date.now() - started > 10 * 60e3) { clearInterval(connectTimer); if (host) renderConnect('start'); return; }
      fetch(UC.api('/api/connect/claim'), {
        method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: UC.license.key, pair })
      }).then((r) => (r.status === 200 ? r.json() : null)).then((j) => {
        if (!j || !j.token || !host) return;
        clearInterval(connectTimer);
        UC.editorToken(j.token);
        renderConnect('done');
        if (UC.mode === 'setup') setTimeout(() => location.reload(), 1200);
        else setTimeout(() => { if (host) startEditor(); }, 900);
      }).catch(() => {});
    }, 2000);
  }

  /* ------------------------------------------------------------------
     6. EDITOR
  ------------------------------------------------------------------ */
  function renderShell() {
    const main = shadow.getElementById('main');
    main.innerHTML = '<div class="tabs">' + TABS.map((t) => '<button class="tab" data-tab="' + t[0] + '">' + t[1] + '</button>').join('') + '</div>' +
      '<div class="search"><input type="text" class="full" id="q" placeholder="Search all ' + R.ORDER.length + ' settings…" value="' + esc(query) + '"></div>' +
      '<div class="body" id="body"></div>' +
      '<footer><span class="note">Changes save automatically and go live for every user.</span><button class="btn sm" data-act="undoSession">Undo session</button><button class="btn sm pri" data-act="close">Done</button></footer>';
    status(UC.editorToken() ? 'All changes saved' : '', 'ok');
    render();
  }

  function render() {
    if (!shadow || view !== 'editor') return;
    const body = shadow.getElementById('body');
    const st = body.scrollTop;
    shadow.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', !query && t.dataset.tab === tab));
    if (query) body.innerHTML = renderSearch();
    else if (tab === 'themes') body.innerHTML = renderThemes();
    else if (tab === 'menu') body.innerHTML = renderMenu();
    else if (tab === 'advanced') body.innerHTML = renderAdvanced();
    else body.innerHTML = renderGroup(tab);
    body.scrollTop = st;
    syncAccent();
    if (!query && tab === 'menu') bindDnD(body);
  }

  function syncAccent() {
    const p = shadow && shadow.querySelector('.panel');
    if (!p) return;
    const r = E.resolve(draft);
    p.style.setProperty('--accent', r.primary);
    p.style.setProperty('--gold', r.highlight);
  }

  /* ---------- controls ---------- */
  function control(id, showGroup) {
    const t = R.TOKENS[id];
    const r = E.resolve(draft);
    const val = r[id];
    const set = Object.prototype.hasOwnProperty.call(draft.values, id);
    let input = '';
    switch (t.type) {
      case 'color':
        input = '<input type="color" data-k="' + id + '" value="' + esc(val) + '"><input type="text" class="hex" data-hex="' + id + '" value="' + esc(val) + '" maxlength="7">';
        break;
      case 'num':
        input = '<input type="range" data-k="' + id + '" min="' + t.min + '" max="' + t.max + '" step="' + t.step + '" value="' + val + '">' +
          '<input type="number" class="num" data-k="' + id + '" min="' + t.min + '" max="' + t.max + '" step="' + t.step + '" value="' + val + '">';
        break;
      case 'select':
        input = '<select data-k="' + id + '">' + t.options.map((o) => '<option value="' + esc(o[0]) + '"' + (o[0] === val ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select>';
        break;
      case 'bool':
        input = '<input type="checkbox" data-k="' + id + '"' + (val ? ' checked' : '') + '>';
        break;
      case 'font':
        input = '<input type="text" class="txt" list="uc-fonts" data-k="' + id + '" value="' + esc(set ? draft.values[id] : (t.def || '')) + '" placeholder="' + esc(t.def || 'Same as body font') + '">';
        break;
      default:
        input = '<input type="text" class="txt" data-k="' + id + '" maxlength="' + (t.type === 'url' ? 500 : (t.max || 100)) + '" value="' + esc(val || '') + '" placeholder="' + (t.type === 'url' ? 'https://…' : '') + '">';
    }
    const grp = showGroup ? '<span class="grp">' + esc(R.GROUPS.find((g) => g.id === t.group).label + ' › ' + t.sub) + '</span>' : '';
    return '<div class="ctl' + (set ? ' set' : '') + '" data-ctl="' + id + '"><div class="lbl"><b>' + esc(t.label) + '</b>' +
      (t.hint || grp ? '<small>' + grp + (t.hint && grp ? ' · ' : '') + esc(t.hint || '') + '</small>' : '') + '</div>' +
      '<div class="in">' + input + '<button class="rs" data-reset="' + id + '" title="Reset to theme default">↺</button></div></div>';
  }
  const fontList = () => '<datalist id="uc-fonts">' + R.FONTS.map((f) => '<option value="' + esc(f) + '">').join('') + '</datalist>';

  function renderGroup(gid) {
    const g = R.GROUPS.find((x) => x.id === gid);
    let html = gid === 'login' ? '<div class="btns"><button class="btn" data-act="loginPreview">' + (mockOpen() ? 'Hide' : 'Show') + ' login page preview</button></div>' : '';
    html += g.subs.map((sub, i) => {
      const ids = R.ORDER.filter((id) => R.TOKENS[id].group === gid && R.TOKENS[id].sub === sub);
      return '<details' + (i < 2 || g.subs.length <= 2 ? ' open' : '') + '><summary>' + esc(sub) + '</summary><div class="sec">' + ids.map((id) => control(id)).join('') + '</div></details>';
    }).join('');
    return html + fontList();
  }

  function renderSearch() {
    const q = query.toLowerCase();
    const ids = R.ORDER.filter((id) => {
      const t = R.TOKENS[id];
      return (t.label + ' ' + t.sub + ' ' + (t.hint || '') + ' ' + id).toLowerCase().indexOf(q) !== -1;
    });
    return ids.length ? ids.slice(0, 60).map((id) => control(id, true)).join('') + fontList() : '<div class="empty">No settings match “' + esc(query) + '”.</div>';
  }

  function renderThemes() {
    return '<h4>Prebuilt themes</h4><div class="themes">' + R.THEMES.map((th) => {
      const p = E.resolve({ values: th.p });
      return '<button class="theme' + (draft.theme === th.id ? ' on' : '') + '" data-theme="' + th.id + '"><i>' +
        [p.base, p.surfaceAlt, p.secondary, p.primary, p.highlight].map((c) => '<span style="background:' + c + '"></span>').join('') +
        '</i>' + esc(th.name) + '</button>';
    }).join('') + '</div><p class="note">Picking a theme sets the whole palette and every section color. Your layout, effects, login text and menu settings are kept. Fine-tune anything afterwards in the other tabs.</p>';
  }

  function sidebarItems() {
    const sb = draft.sidebar[currentView()];
    const items = Array.from(document.querySelectorAll(NAV + ' > a')).filter((a) => keyOf(a)).map((a, i) => {
      const t = a.querySelector('.nav-title');
      return { key: keyOf(a), orig: (t && (t.dataset.irvexOrig || t.textContent.trim())) || keyOf(a), idx: i };
    });
    const pos = (k) => { const i = sb.order.indexOf(k); return i < 0 ? 1000 : i; };
    items.sort((a, b) => pos(a.key) - pos(b.key) || a.idx - b.idx);
    return items;
  }

  function renderMenu() {
    const v = currentView(), sb = draft.sidebar[v];
    const items = sidebarItems();
    let html = '<h4>' + (v === 'agency' ? 'Agency view menu' : 'Sub-account view menu') + '</h4>';
    if (!items.length) html += '<p class="note">The sidebar was not found on this screen. Close this window, wait for the page to load and open it again.</p>';
    else {
      html += items.map((it) => {
        const hidden = sb.hidden.indexOf(it.key) !== -1;
        return '<div class="row' + (hidden ? ' hid' : '') + '" data-key="' + esc(it.key) + '"><span class="grip" title="Drag to reorder">&#8942;&#8942;</span>' +
          '<input type="checkbox" data-vis="' + esc(it.key) + '" title="Show / hide"' + (hidden ? '' : ' checked') + '>' +
          '<div class="names"><input type="text" class="name" data-nm="' + esc(it.key) + '" value="' + esc(sb.names[it.key] || '') + '" placeholder="' + esc(it.orig) + '"><small>Original: ' + esc(it.orig) + '</small></div>' +
          '<button class="mv" data-up="' + esc(it.key) + '">&#9650;</button><button class="mv" data-down="' + esc(it.key) + '">&#9660;</button></div>';
      }).join('') + '<div class="btns"><button class="btn sm" data-act="resetSidebar">Reset this menu</button></div>';
    }
    return html + '<h4>Always hide (CSS selectors)</h4><textarea id="hidesel" spellcheck="false" placeholder="#sb_app-media&#10;#sb_memberships">' + esc(draft.hideSelectors.join('\n')) + '</textarea>' +
      '<p class="note">One selector per line; applied when you click outside the box. You are editing the <b>' + (v === 'agency' ? 'Agency' : 'Sub-account') + '</b> menu — switch views and reopen to edit the other. Empty name = original name.</p>';
  }

  function renderAdvanced() {
    return '<h4>Theme sections</h4><p class="note">Switch off any part of the theme to keep HighLevel’s original look there.</p>' +
      R.SECTIONS.map((s) => '<div class="ctl"><div class="lbl"><b>' + esc(s[1]) + '</b></div><div class="in"><input type="checkbox" data-sec="' + s[0] + '"' + (draft.sections[s[0]] === false ? '' : ' checked') + '></div></div>').join('') +
      '<h4>Custom CSS</h4><textarea id="customcss" spellcheck="false" placeholder="/* added after the theme */">' + esc(draft.customCss) + '</textarea>' +
      '<p class="note">Applied when you click outside the box.</p>' +
      '<h4>Backup / restore</h4><div class="btns"><button class="btn sm" data-act="copyJson">Copy settings JSON</button><button class="btn sm" data-act="pasteJson">Restore from JSON…</button>' +
      '<button class="btn sm" data-act="resetAll">Reset everything</button></div>' +
      '<h4>This browser</h4><div class="btns"><button class="btn sm" data-act="forget">Disconnect this browser</button></div>' +
      '<p class="note">Licensed to ' + esc(UC.license.name || UC.license.companyId) + '. <a href="' + esc(UC.api('/docs')) + '" target="_blank" rel="noopener">Documentation</a> · <a href="' + esc(UC.api('/')) + '" target="_blank" rel="noopener">Support</a></p>';
  }

  /* ---------- applying changes ---------- */
  let paintRaf = 0;
  function changed(rerender) {
    draft.theme = draft.theme || 'custom';
    if (!paintRaf) paintRaf = requestAnimationFrame(() => { paintRaf = 0; UC.render(draft).catch(() => status('Preview failed', 'err')); });
    if (rerender) render(); else syncAccent();
    scheduleSave();
  }
  function setValue(id, value) {
    const t = R.TOKENS[id];
    if (value === '' && t.def === '') delete draft.values[id];
    else draft.values[id] = value;
    draft = E.sanitize(draft);
    const ctl = shadow.querySelector('[data-ctl="' + id + '"]');
    if (ctl) ctl.classList.add('set');
  }

  function scheduleSave() {
    status('Unsaved…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { saveTimer = 0; save(); }, 700);
  }
  function save() {
    if (saving) { pendingSave = true; return; }
    if (!UC.editorToken()) { status('Not connected', 'err'); return; }
    saving = true; status('Saving…');
    UC.save(draft).then(() => { status('All changes saved', 'ok'); })
      .catch((e) => {
        status('Not saved', 'err');
        if (e.status === 401) {
          UC.editorToken('');
          if (host) { view = 'connect'; renderConnect('start'); toast('This browser needs to reconnect'); }
        }
        else toast(e.message);
      })
      .then(() => { saving = false; if (pendingSave) { pendingSave = false; save(); } });
  }

  /* ---------- login page preview ---------- */
  const MOCK_ID = 'uc-login-mock';
  const mockOpen = () => !!document.getElementById(MOCK_ID);
  function showLoginMock() {
    if (mockOpen()) return;
    const logoEl = document.querySelector('img.agency-logo');
    const logo = logoEl && logoEl.src ? logoEl.src : 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="220" height="80"><text x="50%" y="55%" text-anchor="middle" font-family="sans-serif" font-size="28" font-weight="700" fill="#ffffff">YOUR LOGO</text></svg>');
    const f = 'display:block;width:100%;box-sizing:border-box;margin:0 0 16px;font-size:14px';
    const m = document.createElement('div');
    m.id = MOCK_ID;
    m.style.cssText = 'position:fixed;inset:0;z-index:2147482000;overflow:hidden';
    m.innerHTML = '<div class="hl_login"><div class="hl_login--header"><div class="container-fluid"><img alt="Logo" src="' + esc(logo) + '"></div></div>' +
      '<div class="hl_login--body"><div class="container-fluid"><div class="card"><div class="card-body">' +
      '<div class="login-card-heading"><h2>Sign into your account</h2></div>' +
      '<label class="hl-text-input-label" style="display:block;margin-bottom:6px">Email</label><input class="hl-text-input" style="' + f + '" placeholder="Your email address">' +
      '<label class="hl-text-input-label" style="display:block;margin-bottom:6px">Password</label><input class="hl-text-input" type="password" style="' + f + '" value="password">' +
      '<a class="forgot-password" style="display:block;text-align:right;margin-bottom:8px;cursor:pointer">Forgot password?</a>' +
      '<button type="submit" class="hl-btn" style="display:block;width:100%;cursor:pointer">Sign in</button>' +
      '<button id="wl_google_login_button" style="display:block;width:100%;margin-top:12px;padding:12px;cursor:pointer">Sign in with Google</button>' +
      '</div></div></div></div></div>';
    m.addEventListener('submit', (e) => e.preventDefault());
    m.addEventListener('click', (e) => e.preventDefault());
    document.body.appendChild(m);
    if (UC.refreshEffects) UC.refreshEffects();
  }
  function hideLoginMock() {
    const m = document.getElementById(MOCK_ID);
    if (m) m.remove();
  }

  /* ---------- sidebar editing ---------- */
  function commitOrder(keys) { draft.sidebar[currentView()].order = keys; changed(true); }
  function moveBefore(from, to) {
    if (!from || from === to) return;
    const keys = sidebarItems().map((i) => i.key).filter((k) => k !== from);
    const at = keys.indexOf(to);
    keys.splice(at < 0 ? keys.length : at, 0, from);
    commitOrder(keys);
  }
  function step(key, dir) {
    const keys = sidebarItems().map((i) => i.key);
    const i = keys.indexOf(key), j = i + dir;
    if (i < 0 || j < 0 || j >= keys.length) return;
    keys.splice(j, 0, keys.splice(i, 1)[0]);
    commitOrder(keys);
  }
  function bindDnD(body) {
    body.querySelectorAll('.row').forEach((r) => {
      r.querySelector('.grip').addEventListener('mousedown', () => { r.draggable = true; });
      r.addEventListener('dragstart', (e) => { dragKey = r.dataset.key; r.classList.add('drag'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', dragKey); } catch (x) { /* ignore */ } });
      r.addEventListener('dragend', () => { r.draggable = false; r.classList.remove('drag'); });
      r.addEventListener('dragover', (e) => e.preventDefault());
      r.addEventListener('drop', (e) => { e.preventDefault(); moveBefore(dragKey, r.dataset.key); });
    });
  }

  /* ---------- events ---------- */
  function copyText(txt, ok) {
    const done = () => toast(ok);
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, () => fallbackCopy(txt, done));
    else fallbackCopy(txt, done);
  }
  function fallbackCopy(txt, done) {
    const ta = document.createElement('textarea');
    ta.value = txt; ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { /* ignore */ }
    ta.remove();
  }

  function onClick(e) {
    const t = e.target;
    const tabBtn = t.closest('[data-tab]');
    if (tabBtn) {
      tab = tabBtn.dataset.tab; query = '';
      const q = shadow.getElementById('q'); if (q) q.value = '';
      if (tab !== 'login') hideLoginMock();
      render(); return;
    }
    const th = t.closest('[data-theme]');
    if (th) { draft = E.applyTheme(draft, th.dataset.theme); changed(true); toast('Theme applied'); return; }
    const rs = t.closest('[data-reset]');
    if (rs) { delete draft.values[rs.dataset.reset]; changed(true); return; }
    const up = t.closest('[data-up]'); if (up) { step(up.dataset.up, -1); return; }
    const dn = t.closest('[data-down]'); if (dn) { step(dn.dataset.down, 1); return; }
    const a = t.closest('[data-act]');
    if (!a) return;
    switch (a.dataset.act) {
      case 'close': closeUI(); break;
      case 'connect': startConnect(); break;
      case 'cancelConnect': clearInterval(connectTimer); renderConnect('start'); break;
      case 'loginPreview': if (mockOpen()) hideLoginMock(); else showLoginMock(); render(); break;
      case 'undoSession':
        if (!confirm('Undo every change made since you opened the customizer?')) return;
        draft = E.clone(opened); changed(true); break;
      case 'resetAll':
        if (!confirm('Reset all settings to the default IRVEX theme?')) return;
        draft = E.clone(E.DEFAULTS); changed(true); break;
      case 'resetSidebar': draft.sidebar[currentView()] = { order: [], names: {}, hidden: [] }; changed(true); break;
      case 'copyJson': copyText(JSON.stringify(draft, null, 2), 'Settings copied'); break;
      case 'pasteJson': {
        const txt = prompt('Paste settings JSON');
        if (!txt) return;
        try { draft = E.sanitize(JSON.parse(txt)); changed(true); toast('Settings restored'); } catch (x) { toast('That is not valid JSON'); }
        break;
      }
      case 'forget':
        if (!confirm('Disconnect this browser? You will need to approve it again to edit.')) return;
        UC.editorToken(''); closeUI(); break;
    }
  }

  function onInput(e) {
    const t = e.target;
    if (t.id === 'q') { query = t.value.trim(); render(); const q = shadow.getElementById('q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); return; }
    const id = t.dataset.k;
    if (id) {
      const tok = R.TOKENS[id];
      if (tok.type === 'color') {
        setValue(id, t.value);
        const hx = shadow.querySelector('[data-hex="' + id + '"]'); if (hx) hx.value = t.value;
        changed(false);
      } else if (tok.type === 'num') {
        if (t.value === '') return;
        setValue(id, Number(t.value));
        t.closest('.in').querySelectorAll('[data-k]').forEach((x) => { if (x !== t) x.value = t.value; });
        changed(false);
      } else if (tok.type === 'text') {
        setValue(id, t.value); changed(false);
      }
      return;
    }
    if (t.dataset.nm) {
      const sb = draft.sidebar[currentView()], v = t.value.trim();
      if (v) sb.names[t.dataset.nm] = v.slice(0, 60); else delete sb.names[t.dataset.nm];
      changed(false);
    }
  }

  function onChange(e) {
    const t = e.target;
    if (t.dataset.hex) {
      let v = t.value.trim(); if (v[0] !== '#') v = '#' + v;
      if (!E.isHex(v)) { t.value = E.resolve(draft)[t.dataset.hex]; return; }
      setValue(t.dataset.hex, v.toLowerCase()); changed(true); return;
    }
    const id = t.dataset.k;
    if (id) {
      const tok = R.TOKENS[id];
      if (tok.type === 'select') { setValue(id, t.value); changed(true); }
      else if (tok.type === 'bool') { setValue(id, t.checked); changed(true); }
      else if (tok.type === 'url' || tok.type === 'font') {
        const before = JSON.stringify(draft.values[id]);
        setValue(id, t.value.trim());
        if (JSON.stringify(draft.values[id]) === before && t.value.trim()) toast(tok.type === 'url' ? 'Use a full https:// link' : 'Letters, numbers and spaces only');
        changed(true);
      }
      return;
    }
    if (t.dataset.sec) {
      if (t.checked) delete draft.sections[t.dataset.sec]; else draft.sections[t.dataset.sec] = false;
      changed(false); return;
    }
    if (t.dataset.vis) {
      const sb = draft.sidebar[currentView()], i = sb.hidden.indexOf(t.dataset.vis);
      if (t.checked && i >= 0) sb.hidden.splice(i, 1);
      if (!t.checked && i < 0) sb.hidden.push(t.dataset.vis);
      changed(true);
    }
  }

  function onBlur(e) {
    const t = e.target;
    if (t.id === 'hidesel') {
      draft.hideSelectors = t.value.split('\n').map((s) => s.trim()).filter(Boolean);
      draft = E.sanitize(draft); changed(false);
    } else if (t.id === 'customcss') {
      if (t.value === draft.customCss) return;
      draft.customCss = t.value; draft = E.sanitize(draft); changed(false);
    }
  }

  /* ------------------------------------------------------------------
     7. BOOT
  ------------------------------------------------------------------ */
  if (UC.mode !== 'setup') applyNames();
  const iv = setInterval(() => {
    if (UC.killed) { clearInterval(iv); return; }
    try { ensureMenuItem(); } catch (e) { /* never break GHL */ }
  }, 600);

  window.IRVEX_UC = {
    open: () => openUI(UC.mode === 'setup' || !UC.editorToken() ? 'connect' : 'editor'),
    debug: function () {
      const email = UC.currentEmail();
      console.table({
        mode: UC.mode, live: UC.live, company: UC.company, licensedCompany: UC.license.companyId,
        email, user: JSON.stringify(UC.users[email] || null), isAdmin: isAdmin(),
        editorConnected: !!UC.editorToken(), version: UC.version, view: currentView(), killed: UC.killed
      });
    }
  };
})();
