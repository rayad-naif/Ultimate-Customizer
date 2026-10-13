/* =====================================================================
   CUSTOMIZER POPUP  (agency admins only)
   Adds "Ultimate Customizer" to the profile dropdown. Changes preview live
   and "Publish" sends them to the server, which regenerates this agency's
   CSS/JS for every user.
   ===================================================================== */
/* global UC */
(function UCCustomizer() {
  'use strict';
  const E = UC.engine;
  const NAV = E.NAV;
  const PK_LS = 'uc_publish_key_' + UC.license.key;

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

  /* ------------------------------------------------------------------
     1. ADMIN DETECTION  (agency admin role from the user GHL loads)
  ------------------------------------------------------------------ */
  function isAdmin() {
    if (UC.killed) return false;
    const email = UC.currentEmail();
    const u = email && UC.users[email];
    const r = u && u.roles;
    return !!(r && String(r.type).toLowerCase() === 'agency' && String(r.role).toLowerCase() === 'admin');
  }

  /* ------------------------------------------------------------------
     2. SIDEBAR RENAMES  (the only thing CSS can't do)
  ------------------------------------------------------------------ */
  function currentView() {
    if (document.querySelector('.sidebar-v2-agency')) return 'agency';
    if (document.querySelector('.sidebar-v2-location')) return 'location';
    return /\/v2\/location\//.test(location.pathname) ? 'location' : 'agency';
  }
  function keyOf(a) {
    const id = a.id || a.getAttribute('meta') || '';
    const m = id.match(/^sb_[^.]+\.(.+)$/); // custom objects carry the location id; strip it
    return m ? '*.' + m[1] : id;
  }
  function applyNames() {
    const names = (UC.killed ? {} : (UC.active.sidebar[currentView()] || {}).names) || {};
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
  const nameObs = new MutationObserver(() => {
    if (nameRaf) return;
    nameRaf = requestAnimationFrame(() => { nameRaf = 0; applyNames(); });
  });
  nameObs.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  UC.onKill(() => { applyNames(); nameObs.disconnect(); closeUI(true); removeMenuItem(); });

  /* ------------------------------------------------------------------
     3. MENU ITEM IN THE PROFILE DROPDOWN
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
    const existing = document.getElementById('irvex-uc-menu-item');
    if (existing && menu.contains(existing)) return;
    const signout = Array.from(menu.querySelectorAll('a.dropdown-item')).find((a) => /sign\s*out/i.test(a.textContent));
    if (!signout) return;
    const item = document.createElement('a');
    item.id = 'irvex-uc-menu-item';
    item.className = 'py-2 dropdown-item';
    item.href = 'javascript:void(0);';
    item.innerHTML = '<i class="fas fa-palette" style="margin-right:8px"></i>Ultimate Customizer';
    const hr = document.createElement('hr');
    hr.className = 'dropdown-divider irvex-uc-hr';
    signout.before(item, hr);
  }
  document.addEventListener('click', (e) => {
    const t = e.target.closest && e.target.closest('#irvex-uc-menu-item');
    if (t) { e.preventDefault(); openUI(); }
  }, true);

  /* ------------------------------------------------------------------
     4. POPUP  (Shadow DOM so GHL CSS can't leak in)
  ------------------------------------------------------------------ */
  const PRESETS = {
    'IRVEX Cyan & Gold': { navy: '#000414', cyan: '#00e5ff', teal: '#00ced1', gold: '#ffd700', light: '#f4f7fa', red: '#ff1e28' },
    'Violet Nova': { navy: '#0b0420', cyan: '#b388ff', teal: '#7c4dff', gold: '#ff80ab', light: '#f6f3fb', red: '#ff4081' },
    'Emerald Executive': { navy: '#02140d', cyan: '#2ee6a6', teal: '#12b886', gold: '#e6c35c', light: '#f3f8f5', red: '#ff5a4d' },
    'Crimson Night': { navy: '#14040a', cyan: '#ff4d6d', teal: '#e11d48', gold: '#ffb703', light: '#faf4f5', red: '#ff1e28' },
    'Ocean Blue': { navy: '#020a1f', cyan: '#4cc9f0', teal: '#3a86ff', gold: '#ffd166', light: '#f2f6fc', red: '#ef476f' }
  };
  const COLOR_META = [
    { key: 'navy', label: 'Base / Sidebar', hint: 'Sidebar, glass header, login background' },
    { key: 'cyan', label: 'Primary accent', hint: 'Links, borders, glows, buttons' },
    { key: 'teal', label: 'Secondary accent', hint: 'Menu text, labels, form borders' },
    { key: 'gold', label: 'Highlight / Active', hint: 'Active tab, hover, alert badges' },
    { key: 'light', label: 'Page surface', hint: 'Light wrapper behind cards & tables' },
    { key: 'red', label: 'Login accent', hint: 'Red grid and network on the login page' }
  ];

  const UI_CSS = `
:host{all:initial}
*{box-sizing:border-box;font-family:Inter,'Segoe UI',system-ui,sans-serif}
.wrap{position:fixed;inset:0;pointer-events:none;z-index:2147483000}
.panel{--navy:#000414;--accent:#00e5ff;--gold:#ffd700;pointer-events:auto;position:absolute;top:14px;right:14px;bottom:14px;width:min(440px,calc(100vw - 28px));display:flex;flex-direction:column;
 background:rgba(0,10,26,.94);color:#e6f7ff;border:1px solid color-mix(in srgb,var(--accent) 45%,transparent);border-radius:18px;
 box-shadow:0 30px 80px rgba(0,0,0,.65),0 0 30px color-mix(in srgb,var(--accent) 18%,transparent);backdrop-filter:blur(18px);overflow:hidden}
header{padding:16px 18px 10px;display:flex;align-items:center;gap:10px;border-bottom:1px solid color-mix(in srgb,var(--accent) 20%,transparent);cursor:move}
header h3{margin:0;font-size:15px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;background:linear-gradient(135deg,var(--accent),var(--gold));-webkit-background-clip:text;background-clip:text;color:transparent;flex:1}
.badge{font-size:11px;padding:3px 9px;border-radius:99px;border:1px solid var(--gold);color:var(--gold)}
.x{background:none;border:1px solid color-mix(in srgb,var(--accent) 40%,transparent);color:var(--accent);width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:16px;line-height:1}
.x:hover{background:var(--gold);color:var(--navy);border-color:var(--gold)}
.tabs{display:flex;gap:2px;padding:8px 12px 0;border-bottom:1px solid color-mix(in srgb,var(--accent) 15%,transparent)}
.tab{flex:1;background:none;border:0;color:#8fb7c9;padding:9px 4px 11px;font-weight:600;font-size:12.5px;cursor:pointer;border-bottom:3px solid transparent}
.tab:hover{color:var(--accent)}
.tab.on{color:var(--gold);border-bottom-color:var(--gold)}
.body{flex:1;overflow:auto;padding:14px 18px 18px}
h4{margin:16px 0 8px;font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:var(--accent)}
h4:first-child{margin-top:0}
.note{font-size:11.5px;color:#8fb7c9;line-height:1.5;margin:10px 0}
.note a{color:var(--accent)}
.presets{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.preset{display:flex;flex-direction:column;gap:6px;text-align:left;background:rgba(255,255,255,.04);border:1px solid color-mix(in srgb,var(--accent) 25%,transparent);color:#e6f7ff;border-radius:10px;padding:8px;cursor:pointer;font-size:12px}
.preset:hover{border-color:var(--gold)}
.preset span{display:block;height:14px;border-radius:6px}
.crow{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.06)}
.crow b{display:block;font-size:13px}
.crow small{color:#8fb7c9;font-size:11px}
.cin{display:flex;gap:6px;align-items:center}
input[type=color]{width:38px;height:32px;border:1px solid color-mix(in srgb,var(--accent) 40%,transparent);background:none;border-radius:8px;padding:2px;cursor:pointer}
input[type=text],input[type=password],select,textarea{background:rgba(0,26,51,.8);border:1px solid color-mix(in srgb,var(--accent) 35%,transparent);color:#e6f7ff;border-radius:8px;padding:7px 9px;font-size:12.5px;outline:none}
input:focus,select:focus,textarea:focus{border-color:var(--accent);box-shadow:0 0 0 2px color-mix(in srgb,var(--accent) 25%,transparent)}
.cin input[type=text]{width:84px;font-family:ui-monospace,monospace}
.frow{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.06);font-size:13px}
.frow small{display:block;color:#8fb7c9;font-size:11px}
.frow input[type=range]{width:150px;accent-color:var(--accent)}
.frow input[type=checkbox],.row input[type=checkbox]{accent-color:var(--accent);width:17px;height:17px}
.rv{display:inline-block;min-width:34px;text-align:right;color:var(--gold);font-size:12px}
.row{display:flex;align-items:center;gap:8px;padding:7px 8px;margin-bottom:6px;background:rgba(255,255,255,.04);border:1px solid color-mix(in srgb,var(--accent) 18%,transparent);border-radius:10px}
.row.drag{opacity:.4}
.row.hid .name{opacity:.45}
.grip{cursor:grab;color:var(--accent);font-size:15px;user-select:none;padding:0 3px}
.names{flex:1;min-width:0}
.names input{width:100%}
.names small{display:block;color:#6f93a4;font-size:10.5px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mv{background:none;border:1px solid color-mix(in srgb,var(--accent) 30%,transparent);color:var(--accent);border-radius:6px;width:24px;height:24px;cursor:pointer;font-size:10px}
.mv:hover{background:var(--accent);color:var(--navy)}
footer{display:flex;gap:8px;padding:12px 18px;border-top:1px solid color-mix(in srgb,var(--accent) 20%,transparent);background:rgba(0,4,20,.6)}
.btn{border-radius:9px;border:1px solid color-mix(in srgb,var(--accent) 50%,transparent);background:transparent;color:var(--accent);padding:9px 13px;font-weight:700;font-size:12.5px;cursor:pointer}
.btn:hover{background:color-mix(in srgb,var(--accent) 12%,transparent)}
.btn:disabled{opacity:.5;cursor:wait}
.btn.pri{background:var(--accent);color:var(--navy);border-color:var(--accent);margin-left:auto}
.btn.pri:hover{background:var(--gold);border-color:var(--gold)}
.btn.sm{padding:6px 10px;font-size:12px}
textarea{width:100%;height:150px;font-family:ui-monospace,monospace;font-size:11px;resize:vertical}
.full{width:100%}
.btns{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}
.toast{position:absolute;left:50%;bottom:70px;transform:translateX(-50%);background:var(--gold);color:var(--navy);font-weight:700;font-size:12px;padding:8px 14px;border-radius:99px;opacity:0;transition:opacity .25s;pointer-events:none;white-space:nowrap;max-width:90%;overflow:hidden;text-overflow:ellipsis}
.toast.show{opacity:1}
`;

  let host = null, shadow = null, draft = null, tab = 'colors', dragKey = null, dirty = false, busy = false;

  function openUI() {
    if (host || !isAdmin()) return;
    draft = E.clone(UC.active);
    dirty = false;
    host = document.createElement('div');
    host.id = 'irvex-uc-host';
    shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML =
      '<style>' + UI_CSS + '</style><div class="wrap"><div class="panel" role="dialog" aria-label="Ultimate Customizer">' +
      '<header><h3>Ultimate Customizer</h3><span class="badge" id="vb"></span><button class="x" data-act="close" title="Close">&times;</button></header>' +
      '<div class="tabs">' +
      ['colors:Colors', 'fx:Effects', 'sidebar:Sidebar', 'publish:Publish'].map((t) => { const p = t.split(':'); return '<button class="tab" data-tab="' + p[0] + '">' + p[1] + '</button>'; }).join('') +
      '</div><div class="body" id="body"></div>' +
      '<footer><button class="btn" data-act="reset">Reset all</button><button class="btn" data-act="discard">Discard</button><button class="btn pri" data-act="publish">Publish to all users</button></footer>' +
      '<div class="toast" id="toast"></div></div></div>';
    document.body.appendChild(host);
    const panel = shadow.querySelector('.panel');
    panel.addEventListener('keydown', (e) => e.stopPropagation());
    panel.addEventListener('keyup', (e) => e.stopPropagation());
    shadow.addEventListener('click', onClick);
    shadow.addEventListener('input', onInput);
    shadow.addEventListener('change', onChange);
    makeDraggable(panel, shadow.querySelector('header'));
    render();
  }

  function makeDraggable(panel, handle) {
    let sx, sy, ox, oy, on = false;
    handle.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;
      const r = panel.getBoundingClientRect();
      on = true; sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
      panel.style.right = 'auto'; panel.style.bottom = 'auto';
      panel.style.left = ox + 'px'; panel.style.top = oy + 'px';
      panel.style.height = r.height + 'px';
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!on) return;
      panel.style.left = Math.max(0, ox + e.clientX - sx) + 'px';
      panel.style.top = Math.max(0, oy + e.clientY - sy) + 'px';
    });
    window.addEventListener('mouseup', () => { on = false; });
  }

  function closeUI(silent) {
    if (!host) return;
    host.remove(); host = shadow = null;
    if (!silent) UC.preview(UC.baked); // drop any unpublished preview
  }
  function toast(msg) {
    const t = shadow && shadow.getElementById('toast');
    if (!t) return;
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => t.classList.remove('show'), 2800);
  }
  function live() {
    dirty = true;
    UC.preview(draft).catch(() => toast('Could not load the theme for preview'));
    applyNames();
    syncAccent();
  }
  function syncAccent() {
    const p = shadow && shadow.querySelector('.panel');
    if (!p) return;
    p.style.setProperty('--navy', draft.colors.navy);
    p.style.setProperty('--accent', draft.colors.cyan);
    p.style.setProperty('--gold', draft.colors.gold);
  }

  /* ---------- tabs ---------- */
  function tabColors() {
    const c = draft.colors;
    const pre = Object.keys(PRESETS).map((n) => {
      const p = PRESETS[n];
      return '<button class="preset" data-preset="' + esc(n) + '"><span style="background:linear-gradient(90deg,' + p.navy + ' 0 34%,' + p.cyan + ' 34% 67%,' + p.gold + ' 67%)"></span>' + esc(n) + '</button>';
    }).join('');
    const rows = COLOR_META.map((m) =>
      '<div class="crow"><div><b>' + m.label + '</b><small>' + m.hint + '</small></div><div class="cin">' +
      '<input type="color" data-ck="' + m.key + '" value="' + c[m.key] + '">' +
      '<input type="text" data-ct="' + m.key + '" value="' + c[m.key] + '" maxlength="7"></div></div>').join('');
    return '<h4>Presets</h4><div class="presets">' + pre + '</div><h4>Brand colors</h4>' + rows +
      '<p class="note">Every color in the theme (including translucent shades and glows) and both network animations are re-derived from these six values.</p>';
  }

  function tabFx() {
    const f = draft.fx;
    const chk = (k, label, hint) => '<div class="frow"><div>' + label + (hint ? '<small>' + hint + '</small>' : '') + '</div><input type="checkbox" data-fx="' + k + '"' + (f[k] ? ' checked' : '') + '></div>';
    const rng = (k, label, min, max, st) => '<div class="frow"><div>' + label + '</div><div><input type="range" data-fxr="' + k + '" min="' + min + '" max="' + max + '" step="' + st + '" value="' + f[k] + '"> <span class="rv">' + f[k] + '</span></div></div>';
    return '<h4>Animations</h4>' +
      chk('network', 'Sidebar network', 'Particle web behind the menu') +
      rng('networkOpacity', 'Network intensity', 0, 1, 0.05) +
      rng('networkDensity', 'Network density', 0.2, 2, 0.1) +
      chk('loginNetwork', 'Login page network', 'Animated web behind the login logo') +
      chk('ripple', 'Click ripple', 'Water-drop effect on every click') +
      chk('subaccountLogo', 'Sub-account logo in sidebar', 'Shows each sub-account’s own logo') +
      chk('noMotion', 'Reduce motion', 'Turns off banner pan, mesh pan and hover transitions') +
      '<h4>Look & feel</h4>' +
      rng('blur', 'Glass blur', 0, 2, 0.1) +
      rng('radius', 'Corner roundness', 0, 2, 0.1) +
      chk('noGlow', 'Disable text glow', 'Removes neon text-shadow everywhere') +
      '<div class="frow"><div>Font family<small>Loaded from Google Fonts when needed</small></div><select data-fxs="font">' +
      E.FONTS.map((n) => '<option' + (f.font === n ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></div>';
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

  function tabSidebar() {
    const view = currentView(), sb = draft.sidebar[view];
    const items = sidebarItems();
    let html = '<h4>' + (view === 'agency' ? 'Agency view menu' : 'Sub-account view menu') + '</h4>';
    if (!items.length) {
      html += '<p class="note">The sidebar was not found on this screen. Close this window, wait for the page to load and open it again.</p>';
    } else {
      html += items.map((it) => {
        const hidden = sb.hidden.indexOf(it.key) !== -1;
        return '<div class="row' + (hidden ? ' hid' : '') + '" data-key="' + esc(it.key) + '">' +
          '<span class="grip" title="Drag to reorder">&#8942;&#8942;</span>' +
          '<input type="checkbox" data-vis="' + esc(it.key) + '" title="Show / hide"' + (hidden ? '' : ' checked') + '>' +
          '<div class="names"><input type="text" class="name" data-nm="' + esc(it.key) + '" value="' + esc(sb.names[it.key] || '') + '" placeholder="' + esc(it.orig) + '"><small>Original: ' + esc(it.orig) + '</small></div>' +
          '<button class="mv" data-up="' + esc(it.key) + '">&#9650;</button><button class="mv" data-down="' + esc(it.key) + '">&#9660;</button></div>';
      }).join('') +
      '<div class="btns"><button class="btn sm" data-act="resetSidebar">Reset this menu</button></div>';
    }
    html += '<h4>Always hide (CSS selectors)</h4>' +
      '<textarea id="hidesel" spellcheck="false" placeholder="#sb_app-media&#10;#sb_memberships">' + esc(draft.hideSelectors.join('\n')) + '</textarea>' +
      '<div class="btns"><button class="btn sm" data-act="applyHide">Apply selectors</button></div>' +
      '<p class="note">You are editing the <b>' + (view === 'agency' ? 'Agency' : 'Sub-account') + '</b> menu. Switch views and reopen this window to edit the other one. Divider lines are hidden once you reorder. Empty name = original name.</p>';
    return html;
  }

  function tabPublish() {
    const pk = getPk();
    return '<h4>Publish key</h4>' +
      '<p class="note">Publishing needs the publish key from your <a href="' + esc(UC.license.base) + '/dashboard" target="_blank" rel="noopener">Ultimate Customizer dashboard</a>. It is stored only in this browser.</p>' +
      '<input type="password" class="full" id="pk" placeholder="uc_pub_…" value="' + esc(pk) + '">' +
      '<div class="btns"><button class="btn sm" data-act="savePk">Save key</button>' + (pk ? '<button class="btn sm" data-act="forgetPk">Forget key</button>' : '') + '</div>' +
      '<h4>Backup / restore</h4>' +
      '<textarea id="json" spellcheck="false">' + esc(JSON.stringify(draft, null, 2)) + '</textarea>' +
      '<div class="btns"><button class="btn sm" data-act="copyJson">Copy JSON</button><button class="btn sm" data-act="applyJson">Apply pasted JSON</button></div>' +
      '<p class="note">Publish regenerates your agency’s theme CSS and script on the server. Every user picks it up on their next page load.</p>';
  }

  function render() {
    if (!shadow) return;
    const body = shadow.getElementById('body');
    const st = body.scrollTop;
    shadow.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === tab));
    shadow.getElementById('vb').textContent = currentView() === 'agency' ? 'Agency view' : 'Sub-account view';
    body.innerHTML = tab === 'colors' ? tabColors() : tab === 'fx' ? tabFx() : tab === 'sidebar' ? tabSidebar() : tabPublish();
    body.scrollTop = st;
    syncAccent();
    if (tab === 'sidebar') bindDnD(body);
  }

  /* ---------- sidebar editing ---------- */
  function commitOrder(keys) { draft.sidebar[currentView()].order = keys; live(); render(); }
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

  /* ---------- publish ---------- */
  function getPk() { try { return localStorage.getItem(PK_LS) || ''; } catch (e) { return ''; } }
  function setPk(v) { try { if (v) localStorage.setItem(PK_LS, v); else localStorage.removeItem(PK_LS); } catch (e) { /* ignore */ } }

  function publish(btn) {
    const pk = getPk();
    if (!pk) { tab = 'publish'; render(); toast('Paste your publish key first'); return; }
    if (busy) return;
    busy = true; btn.disabled = true;
    const cfg = E.sanitize(draft);
    fetch(UC.license.base + '/api/publish', {
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json', 'X-UC-Publish-Key': pk },
      body: JSON.stringify({ key: UC.license.key, config: cfg })
    }).then((r) => r.json().catch(() => ({})).then((j) => ({ ok: r.ok, status: r.status, j: j })))
      .then((res) => {
        if (!res.ok) {
          toast(res.status === 401 ? 'Publish key rejected' : (res.j.error || 'Publish failed (' + res.status + ')'));
          return;
        }
        draft = E.clone(cfg); dirty = false;
        UC.published(cfg);
        toast('Published. All users get it on their next page load.');
      })
      .catch(() => toast('Network error while publishing'))
      .then(() => { busy = false; if (btn.isConnected) btn.disabled = false; });
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
    if (tabBtn) { tab = tabBtn.dataset.tab; render(); return; }
    const pre = t.closest('[data-preset]');
    if (pre) { draft.colors = Object.assign({}, PRESETS[pre.dataset.preset]); live(); render(); return; }
    const up = t.closest('[data-up]'); if (up) { step(up.dataset.up, -1); return; }
    const dn = t.closest('[data-down]'); if (dn) { step(dn.dataset.down, 1); return; }
    const a = t.closest('[data-act]');
    if (!a) return;
    switch (a.dataset.act) {
      case 'close':
      case 'discard':
        if (dirty && !confirm('Discard unpublished changes?')) return;
        closeUI(); break;
      case 'publish': publish(a); break;
      case 'reset':
        if (!confirm('Reset colors, effects and sidebar to defaults? (Not live until you publish.)')) return;
        draft = E.clone(E.DEFAULTS); live(); render(); break;
      case 'resetSidebar':
        draft.sidebar[currentView()] = { order: [], names: {}, hidden: [] }; live(); render(); break;
      case 'applyHide':
        draft.hideSelectors = shadow.getElementById('hidesel').value.split('\n').map((s) => s.trim()).filter(Boolean);
        draft = E.sanitize(draft); live(); render(); toast('Selectors applied (preview)'); break;
      case 'savePk': {
        const v = shadow.getElementById('pk').value.trim();
        setPk(v); render(); toast(v ? 'Publish key saved in this browser' : 'Key cleared'); break;
      }
      case 'forgetPk': setPk(''); render(); toast('Key removed from this browser'); break;
      case 'copyJson': copyText(JSON.stringify(draft, null, 2), 'JSON copied'); break;
      case 'applyJson':
        try { draft = E.sanitize(JSON.parse(shadow.getElementById('json').value)); live(); render(); toast('JSON applied (preview)'); }
        catch (x) { toast('Invalid JSON'); }
        break;
    }
  }

  let inputRaf = 0;
  function onInput(e) {
    const t = e.target;
    if (t.dataset.ck) {
      draft.colors[t.dataset.ck] = t.value;
      const txt = shadow.querySelector('[data-ct="' + t.dataset.ck + '"]'); if (txt) txt.value = t.value;
      if (!inputRaf) inputRaf = requestAnimationFrame(() => { inputRaf = 0; live(); });
    } else if (t.dataset.fxr) {
      draft.fx[t.dataset.fxr] = parseFloat(t.value);
      t.parentElement.querySelector('.rv').textContent = t.value;
      if (!inputRaf) inputRaf = requestAnimationFrame(() => { inputRaf = 0; live(); });
    } else if (t.dataset.nm) {
      const sb = draft.sidebar[currentView()], v = t.value.trim();
      if (v) sb.names[t.dataset.nm] = v.slice(0, 60); else delete sb.names[t.dataset.nm];
      live();
    }
  }

  function onChange(e) {
    const t = e.target;
    if (t.dataset.ct) {
      let v = t.value.trim(); if (v[0] !== '#') v = '#' + v;
      if (!E.isHex(v)) { t.value = draft.colors[t.dataset.ct]; return; }
      v = v.toLowerCase();
      draft.colors[t.dataset.ct] = v;
      const c = shadow.querySelector('[data-ck="' + t.dataset.ct + '"]'); if (c) c.value = v;
      t.value = v; live();
    } else if (t.dataset.fx) {
      draft.fx[t.dataset.fx] = t.checked; live();
    } else if (t.dataset.fxs) {
      draft.fx[t.dataset.fxs] = t.value; live();
    } else if (t.dataset.vis) {
      const sb = draft.sidebar[currentView()], i = sb.hidden.indexOf(t.dataset.vis);
      if (t.checked && i >= 0) sb.hidden.splice(i, 1);
      if (!t.checked && i < 0) sb.hidden.push(t.dataset.vis);
      live(); render();
    }
  }

  /* ------------------------------------------------------------------
     5. BOOT
  ------------------------------------------------------------------ */
  applyNames();
  const iv = setInterval(() => {
    if (UC.killed) { clearInterval(iv); return; }
    try { ensureMenuItem(); } catch (e) { /* never break GHL */ }
  }, 600);

  window.IRVEX_UC = {
    open: openUI,
    debug: function () {
      const email = UC.currentEmail();
      console.table({
        email: email,
        user: JSON.stringify(UC.users[email] || null),
        isAdmin: isAdmin(),
        licensedCompany: UC.license.companyId,
        view: currentView(),
        killed: UC.killed
      });
    }
  };
})();
