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
  const customizerEngine = UC.E;
  const registry = customizerEngine.R;
  const navigationSelector = customizerEngine.NAV;
  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  /* ------------------------------------------------------------------
     1. ADMIN DETECTION
  ------------------------------------------------------------------ */
  function isAdmin(menu) {
    if (UC.killed || UC.company === 'mismatch') {
      return false;
    }

    const user = UC.users[UC.currentEmail(menu)];
    const roles = user && user.roles;
    return Boolean(
      roles &&
      String(roles.type).toLowerCase() === 'agency' &&
      String(roles.role).toLowerCase() === 'admin'
    );
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
  /* Sidebar links in whichever chrome is on screen:
     { el, key, label (the element holding the visible name), top (a top-level entry) }.
       classic     #sidebar-v2 nav[aria-label="header"] > a  .nav-title
       switchyard  #sidebar-v2 [id^="sb_"]  .switchyard-nav-label (links, groups, flyout links)
       other       any [id^="sb_"] link in the sidebar, label = its text-only child */
  function labelOf(el) {
    if (el.tagName === 'SECTION') {
      // A group: its name is on the toggle button, not on the section.
      const toggle = el.querySelector(':scope > button, :scope > [role="button"]');
      return toggle && toggle.querySelector('.switchyard-nav-label, [class*="nav-label"], [class*="title"]');
    }
    const known = el.querySelector('.nav-title, .switchyard-nav-label, [class*="nav-label"], [class*="nav-title"]');
    if (known) return known;
    // Unknown design: the deepest element whose only content is the visible text.
    const leaves = Array.from(el.querySelectorAll('span, p, div')).filter((n) => !n.children.length && n.textContent.trim());
    return leaves[leaves.length - 1] || null;
  }
  function navItems() {
    const classic = document.querySelectorAll(navigationSelector + ' > a');
    if (classic.length) {
      return Array.from(classic).map((a) => ({ el: a, key: keyOf(a), label: a.querySelector('.nav-title'), top: true })).filter((x) => x.label);
    }
    const root = document.getElementById('sidebar-v2') || document.querySelector('.switchyard-sidebar, aside, .hl_sidebar');
    const scopes = [root].concat(Array.from(document.querySelectorAll('.switchyard-flyout'))).filter(Boolean);
    const seen = new Set();
    const out = [];
    scopes.forEach((scope) => {
      scope.querySelectorAll('a[id^="sb_"], section[id^="sb_"]').forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);
        const label = labelOf(el);
        if (!label) return;
        const row = el.parentElement;
        const top = !!(row && row.classList.contains('switchyard-managed-row') && scope === root);
        out.push({ el, key: keyOf(el), label, top });
      });
    });
    return out;
  }
  function applyNames() {
    const names = (UC.live && !UC.killed ? (UC.active.sidebar[currentView()] || {}).names : null) || {};
    navItems().forEach((it) => {
      const t = it.label;
      if (!t.dataset.irvexOrig) t.dataset.irvexOrig = t.textContent.trim();
      const want = names[it.key];
      const target = want && want.trim() ? want.trim() : t.dataset.irvexOrig;
      if (t.textContent !== target) t.textContent = target;
    });
  }
  let nameRaf = 0;
  function scheduleSidebarRenameSync() {
    if (nameRaf) {
      return;
    }

    nameRaf = requestAnimationFrame(function runSidebarRenameSync() {
      nameRaf = 0;
      applyNames();
    });
  }
  const nameObs = new MutationObserver(scheduleSidebarRenameSync);
  if (UC.mode !== 'setup') {
    nameObs.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    UC.onChange(applyNames);
  }
  UC.onKill(() => {
    applyNames();
    nameObs.disconnect();
    closeUI();
    removeMenuItem();
  });

  /* ------------------------------------------------------------------
     3. MENU ITEM
  ------------------------------------------------------------------ */
  /* The profile menu is found by what it does, not by its class names:
     the open menu that holds a "Sign out" / "Log out" action. Our item is
     built from that action (same element type, classes and Vue scope
     attributes), so it looks native in the classic dropdown, in the new
     account menu and in any future design. */
  const SIGN_OUT = /^\s*(sign|log)\s*-?\s*(out|off)\s*$/i;
  // Most specific first. Index 0 is the classic dropdown, which stays in the DOM while closed;
  // every other menu only counts while it is shown (popovers are teleported to <body>).
  const MENU_SELECTORS = [
    '.hl_header--dropdown .dropdown-menu',
    '.switchyard-account-menu',
    '[role="menu"]',
    '.hr-dropdown-menu, .n-dropdown-menu, .hr-dropdown, .n-dropdown',
    '.hr-popover, .n-popover, .v-binder-follower-content',
    '.dropdown-menu.show',
    '[class*="account-menu"], [class*="user-menu"], [class*="profile-menu"], [class*="dropdown-menu"], [class*="popover"]'
  ];
  // What a clickable menu row looks like in the designs we know (and most UI kits).
  const OPTION = 'a, button, li, [role="menuitem"], [role="option"], [data-dropdown-option], [class*="option"], [class*="dropdown-item"], [class*="menu-item"], [class*="menu__item"], [class*="action"]';
  const ICONISH = 'svg, i, img, [class*="icon"], [aria-hidden="true"]';
  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
  }
  // Visible text of an element, ignoring icon glyphs (e.g. a material "logout" ligature).
  function textOf(el) {
    let t = '';
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const ic = n.parentElement && n.parentElement.closest(ICONISH);
      if (ic && ic !== el && el.contains(ic)) continue;
      t += n.nodeValue;
    }
    return t;
  }
  // The Sign out row: the text node that says "Sign out", climbed up to the outermost
  // option-like element that still holds nothing but that text.
  function findSignOut(menu) {
    const w = document.createTreeWalker(menu, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (!SIGN_OUT.test(n.nodeValue || '')) continue;
      const leaf = n.parentElement;
      if (!leaf || leaf.closest('#irvex-uc-menu-item')) continue;
      let opt = null;
      let row = leaf;
      for (let el = leaf; el && el !== menu; el = el.parentElement) {
        if (!SIGN_OUT.test(textOf(el))) break;
        row = el;
        if (el.matches(OPTION)) opt = el;
      }
      return opt || row;
    }
    return null;
  }
  let menuHintUntil = 0;
  function findAccountMenu() {
    const seen = new Set();
    for (let i = 0; i < MENU_SELECTORS.length; i++) {
      const menus = document.querySelectorAll(MENU_SELECTORS[i]);
      for (let j = 0; j < menus.length; j++) {
        const menu = menus[j];
        if (seen.has(menu) || menu.closest('#irvex-uc-host')) continue;
        seen.add(menu);
        const classic = i === 0;
        if (!classic && !isVisible(menu)) continue;
        const signout = findSignOut(menu);
        if (!signout) continue;
        return { menu, signout, kind: classic ? 'classic' : (menu.classList.contains('switchyard-account-menu') ? 'switchyard' : 'generic') };
      }
    }
    // Unknown design: any overlay teleported to <body> that holds a Sign out action.
    // Only right after a profile/avatar click, so the whole page is not scanned all the time.
    if (Date.now() > menuHintUntil) return null;
    const roots = document.body ? Array.from(document.body.children) : [];
    for (let k = 0; k < roots.length; k++) {
      const root = roots[k];
      if (root.id === 'irvex-uc-host' || root.id === 'app' || !isVisible(root)) continue;
      const signout = findSignOut(root);
      if (signout && isVisible(signout)) {
        const menu = signout.closest('[role="menu"], [class*="menu"], [class*="dropdown"], [class*="popover"]') || root;
        return { menu, signout, kind: 'generic' };
      }
    }
    return null;
  }
  function isSeparator(el) {
    return !!el && (el.getAttribute('role') === 'separator' || el.tagName === 'HR' || /divider|separator/i.test(el.className || ''));
  }
  function removeMenuItem() {
    const existing = document.getElementById('irvex-uc-menu-item');
    if (!existing) return;
    const n = existing.nextElementSibling;
    if (n && n.classList.contains('irvex-uc-hr')) n.remove();
    existing.remove();
  }
  function buildClassicItem(label) {
    const item = document.createElement('a');
    item.className = 'py-2 dropdown-item';
    item.href = '#';
    const icon = document.createElement('i');
    icon.className = 'fas fa-palette';
    icon.style.marginRight = '8px';
    item.appendChild(icon);
    item.appendChild(document.createTextNode(label));
    return item;
  }
  const PALETTE_SVG = '<path d="M12 22a10 10 0 1 1 10-10c0 2.2-1.8 3.5-3.6 3.5H16a2 2 0 0 0-1.5 3.3A2 2 0 0 1 13 22z"/>' +
    '<circle cx="7.5" cy="10.5" r="1"/><circle cx="10.5" cy="6.5" r="1"/><circle cx="15.5" cy="6.5" r="1"/><circle cx="17.5" cy="10.5" r="1"/>';
  const STATE_CLASS = /(^|[-_])(sign-?out|log-?out|danger|destructive|critical|error|pending|active|selected|hover|focus(ed)?)([-_]|$)/i;
  /* Our item is a deep copy of the Sign out row (same tags, classes, Vue scope
     attributes and inner wrappers), so it looks native in any menu. A copy has
     no event handlers; ids, links, test ids and state classes are stripped,
     the label is swapped and the icon becomes a palette. */
  function buildNativeItem(signout, label) {
    const item = signout.cloneNode(true);
    [item].concat(Array.from(item.querySelectorAll('*'))).forEach((el) => {
      ['id', 'href', 'data-testid', 'aria-label', 'aria-selected', 'data-dropdown-option', 'for', 'name', 'value'].forEach((a) => el.removeAttribute(a));
      Array.from(el.attributes).forEach((a) => { if (/^on/i.test(a.name)) el.removeAttribute(a.name); });
      if (el.classList && el.classList.length) {
        Array.from(el.classList).forEach((c) => { if (STATE_CLASS.test(c)) el.classList.remove(c); });
      }
    });
    // Label: replace the "Sign out" text node.
    let replaced = false;
    const w = document.createTreeWalker(item, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (!replaced && SIGN_OUT.test(n.nodeValue || '')) { n.nodeValue = n.nodeValue.replace(/\S.*\S|\S/, label); replaced = true; }
    }
    if (!replaced) item.textContent = label;
    // Icon: same size and classes, palette drawing.
    const svg = item.querySelector('svg');
    if (svg) {
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', svg.getAttribute('stroke-width') || '2');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      svg.innerHTML = PALETTE_SVG;
    } else {
      const i = item.querySelector('i');
      if (i && /\bfa[srlb]?\b|fa-/.test(i.className)) i.className = 'fas fa-palette';
      else if (i && i.textContent.trim()) i.textContent = 'palette'; // icon-font ligature
    }
    if (item.tagName === 'A') item.setAttribute('href', '#');
    if (item.tagName === 'BUTTON') item.type = 'button';
    if (!item.getAttribute('role') && signout.closest('[role="menu"]')) item.setAttribute('role', 'menuitem');
    item.style.cursor = 'pointer';
    return item;
  }
  // Hover feedback for menus whose hover state is set by script (zero specificity: native styles win).
  function ensureItemCss() {
    if (document.getElementById('uc-menu-item-css')) return;
    const st = document.createElement('style');
    st.id = 'uc-menu-item-css';
    st.textContent = ':where(#irvex-uc-menu-item):hover{background-color:rgba(127,127,127,.12)}';
    (document.head || document.documentElement).appendChild(st);
  }
  function ensureMenuItem() {
    const found = findAccountMenu();
    if (!found || !isAdmin(found.menu)) {
      removeMenuItem();
      return;
    }
    const label = UC.mode === 'setup' ? 'Connect Ultimate Customizer' : 'Ultimate Customizer';
    const existing = document.getElementById('irvex-uc-menu-item');
    if (existing && found.menu.contains(existing)) {
      if (existing.dataset.ucLabel !== label) { removeMenuItem(); } else return;
    } else if (existing) {
      removeMenuItem();
    }
    let item;
    if (found.kind === 'classic') {
      item = buildClassicItem(label);
      const hr = document.createElement('hr');
      hr.className = 'dropdown-divider irvex-uc-hr';
      item.id = 'irvex-uc-menu-item';
      item.dataset.ucLabel = label;
      found.signout.before(item, hr);
      return;
    }
    ensureItemCss();
    item = buildNativeItem(found.signout, label);
    item.id = 'irvex-uc-menu-item';
    item.dataset.ucLabel = label;
    item.setAttribute('aria-label', label);
    // Above the divider that precedes Sign out, so Sign out stays last on its own.
    let anchor = found.signout;
    if (isSeparator(anchor.previousElementSibling)) anchor = anchor.previousElementSibling;
    anchor.before(item);
  }
  function closeAccountMenu(menu) {
    // Ask the CRM to close its menu the way a user would (Escape), then fall back to an outside click.
    const esc = { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true };
    try { (menu || document.body).dispatchEvent(new KeyboardEvent('keydown', esc)); } catch (e) { /* ignore */ }
    try { document.dispatchEvent(new KeyboardEvent('keydown', esc)); } catch (e) { /* ignore */ }
    setTimeout(() => {
      if (menu && isVisible(menu)) {
        try { document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); document.body.dispatchEvent(new MouseEvent('click', { bubbles: true })); } catch (e) { /* ignore */ }
      }
    }, 60);
  }
  document.addEventListener('click', (e) => {
    const t = e.target.closest && e.target.closest('#irvex-uc-menu-item');
    if (!t) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const menu = t.closest('[role="menu"], .dropdown-menu, .switchyard-account-menu, .hr-dropdown-menu, .n-dropdown-menu, .hr-popover, .n-popover, [class*="dropdown"], [class*="popover"]');
    if (!(menu && menu.classList.contains('dropdown-menu'))) closeAccountMenu(menu);
    if (UC.mode === 'setup' || !UC.editorToken()) {
      openUI('connect');
      return;
    }
    openUI('editor');
  }, true);

  /* ------------------------------------------------------------------
     4. PANEL SHELL
  ------------------------------------------------------------------ */
  const TABS = [['themes', 'Themes']].concat(registry.GROUPS.map((g) => [g.id, g.label])).concat([['panels', 'Panels'], ['menu', 'Menu'], ['advanced', 'Advanced']]);

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
.plist{display:flex;flex-direction:column;gap:6px;margin:6px 0 4px}
.pdet{display:flex;align-items:center;gap:8px;padding:7px 9px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:10px}
.pdet .names b{display:block;font-size:12.5px}.pdet.none{opacity:.55}
.sw{width:16px;height:16px;border-radius:5px;border:1px solid rgba(255,255,255,.25);flex:none}
.now{font-size:10px;color:#6f93a4;font-family:ui-monospace,monospace}
.pcount{font-size:10.5px;color:#7fa3b5;margin:4px 0 8px}
.pcount.zero{color:#ffb86b}
`;

  let host = null;
  let shadow = null;
  let draft = null;
  let opened = null;
  let tab = 'themes';
  let query = '';
  let dragKey = null;
  let view = 'editor';
  let saveTimer = 0;
  let saving = false;
  let pendingSave = false;
  let connectTimer = 0;

  function openUI(which) {
    if (host || !isAdmin()) {
      return;
    }
    view = which;
    host = document.createElement('div');
    host.id = 'irvex-uc-host';
    shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<style>' + UI_CSS + '</style><div class="wrap"><div class="panel" role="dialog" aria-label="Ultimate Customizer">' +
      '<header><h3>Ultimate Customizer</h3><span class="status" id="st"></span><button class="x" data-act="close" title="Close">&times;</button></header>' +
      '<div id="main" style="display:flex;flex-direction:column;flex:1;min-height:0"></div><div class="toast" id="toast"></div></div></div>';
    document.body.appendChild(host);
    const panel = shadow.querySelector('.panel');
    ['keydown', 'keyup', 'keypress'].forEach((eventName) => {
      panel.addEventListener(eventName, (event) => event.stopPropagation());
    });
    shadow.addEventListener('click', onClick);
    shadow.addEventListener('input', onInput);
    shadow.addEventListener('change', onChange);
    shadow.addEventListener('focusout', onBlur);
    makeDraggable(panel, shadow.querySelector('header'));
    if (view === 'connect') {
      renderConnect('start');
      return;
    }

    startEditor();
  }

  function startEditor() {
    view = 'editor';
    UC.editing = true;
    draft = customizerEngine.clone(UC.baked);
    opened = customizerEngine.clone(UC.baked);
    renderShell();
    // Pull the latest saved version in case another admin changed it.
    fetch(UC.api('/c/' + UC.license.key + '/v.json?have=0'), { credentials: 'omit' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j || !j.config || !host || j.v <= UC.version) {
          return;
        }

        UC.version = j.v;
        UC.baked = customizerEngine.sanitize(j.config);
        draft = customizerEngine.clone(UC.baked);
        opened = customizerEngine.clone(UC.baked);
        UC.render(draft);
        render();
      }).catch(() => {});
  }

  function closeUI() {
    if (!host) {
      return;
    }
    clearInterval(connectTimer);
    if (picking) picking.stop(null);
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = 0;
      save();
    }
    hideLoginMock();
    host.remove();
    host = null;
    shadow = null;
    UC.editing = false;
  }

  function makeDraggable(panel, handle) {
    let sx, sy, ox, oy, on = false;
    handle.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) {
        return;
      }
      const r = panel.getBoundingClientRect();
      on = true;
      sx = e.clientX;
      sy = e.clientY;
      ox = r.left;
      oy = r.top;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
      panel.style.left = ox + 'px';
      panel.style.top = oy + 'px';
      panel.style.height = r.height + 'px';
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!on) {
        return;
      }
      panel.style.left = Math.max(0, ox + e.clientX - sx) + 'px';
      panel.style.top = Math.max(0, oy + e.clientY - sy) + 'px';
    });
    window.addEventListener('mouseup', () => {
      on = false;
    });
  }

  function toast(msg) {
    const t = shadow && shadow.getElementById('toast');
    if (!t) {
      return;
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => t.classList.remove('show'), 2600);
  }
  function status(text, cls) {
    const s = shadow && shadow.getElementById('st');
    if (s) {
      s.textContent = text;
      s.className = 'status ' + (cls || '');
    }
  }

  /* ------------------------------------------------------------------
     5. CONNECT FLOW
     The script makes a random pairing id and opens our app in a popup.
     An admin of THIS agency approves it after signing in with your CRM;
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
    const domain = escapeHtml(location.hostname);
    if (stage === 'start') {
      main.innerHTML = '<div class="connect"><h2>Connect this CRM</h2><p>To unlock Ultimate Customizer on <b>' + domain + '</b>, confirm it with the CRM agency account that purchased the app.' +
        (UC.mode !== 'setup' ? ' This also lets this browser save theme changes.' : '') + '</p>' +
        '<div class="btns" style="justify-content:center;margin-top:18px"><button class="btn pri" data-act="connect">Connect with your CRM</button></div>' +
        '<p class="note">A small window opens. Sign in if asked, then click <b>Approve</b>.</p></div>';
    } else if (stage === 'wait') {
      main.innerHTML = '<div class="connect"><h2>Waiting for approval…</h2><div class="spin"></div><p>Approve the connection in the window that opened.</p>' +
        '<p class="note">Popup blocked? <a href="' + escapeHtml(url) + '" target="_blank" rel="noopener">Open it here</a>.</p>' +
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
      '<div class="search"><input type="text" class="full" id="q" placeholder="Search all ' + registry.ORDER.length + ' settings…" value="' + escapeHtml(query) + '"></div>' +
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
    else if (tab === 'panels') body.innerHTML = renderPanels();
    else if (tab === 'advanced') body.innerHTML = renderAdvanced();
    else body.innerHTML = renderGroup(tab);
    body.scrollTop = st;
    syncAccent();
    if (!query && tab === 'menu') bindDnD(body);
  }

  function syncAccent() {
    const p = shadow && shadow.querySelector('.panel');
    if (!p) return;
    const r = customizerEngine.resolve(draft);
    p.style.setProperty('--accent', r.primary);
    p.style.setProperty('--gold', r.highlight);
  }

  /* ---------- controls ---------- */
  function control(id, showGroup) {
    const t = registry.TOKENS[id];
    const r = customizerEngine.resolve(draft);
    const val = r[id];
    const set = Object.prototype.hasOwnProperty.call(draft.values, id);
    let input = '';
    switch (t.type) {
      case 'color':
        input = '<input type="color" data-k="' + id + '" value="' + escapeHtml(val) + '"><input type="text" class="hex" data-hex="' + id + '" value="' + escapeHtml(val) + '" maxlength="7">';
        break;
      case 'num':
        input = '<input type="range" data-k="' + id + '" min="' + t.min + '" max="' + t.max + '" step="' + t.step + '" value="' + val + '">' +
          '<input type="number" class="num" data-k="' + id + '" min="' + t.min + '" max="' + t.max + '" step="' + t.step + '" value="' + val + '">';
        break;
      case 'select':
        input = '<select data-k="' + id + '">' + t.options.map((o) => '<option value="' + escapeHtml(o[0]) + '"' + (o[0] === val ? ' selected' : '') + '>' + escapeHtml(o[1]) + '</option>').join('') + '</select>';
        break;
      case 'bool':
        input = '<input type="checkbox" data-k="' + id + '"' + (val ? ' checked' : '') + '>';
        break;
      case 'font':
        input = '<input type="text" class="txt" list="uc-fonts" data-k="' + id + '" value="' + escapeHtml(set ? draft.values[id] : (t.def || '')) + '" placeholder="' + escapeHtml(t.def || 'Same as body font') + '">';
        break;
      default:
        input = '<input type="text" class="txt" data-k="' + id + '" maxlength="' + (t.type === 'url' ? 500 : (t.max || 100)) + '" value="' + escapeHtml(val || '') + '" placeholder="' + (t.type === 'url' ? 'https://…' : '') + '">';
    }
    const grp = showGroup ? '<span class="grp">' + escapeHtml(registry.GROUPS.find((g) => g.id === t.group).label + ' › ' + t.sub) + '</span>' : '';
    return '<div class="ctl' + (set ? ' set' : '') + '" data-ctl="' + id + '"><div class="lbl"><b>' + escapeHtml(t.label) + '</b>' +
      (t.hint || grp ? '<small>' + grp + (t.hint && grp ? ' · ' : '') + escapeHtml(t.hint || '') + '</small>' : '') + '</div>' +
      '<div class="in">' + input + '<button class="rs" data-reset="' + id + '" title="Reset to theme default">↺</button></div></div>';
  }
  const fontList = () => '<datalist id="uc-fonts">' + registry.FONTS.map((f) => '<option value="' + escapeHtml(f) + '">').join('') + '</datalist>';

  function renderGroup(gid) {
    const g = registry.GROUPS.find((x) => x.id === gid);
    let html = gid === 'login' ? '<div class="btns"><button class="btn" data-act="loginPreview">' + (mockOpen() ? 'Hide' : 'Show') + ' login page preview</button></div>' : '';
    html += g.subs.map((sub, i) => {
      const ids = registry.ORDER.filter((id) => registry.TOKENS[id].group === gid && registry.TOKENS[id].sub === sub);
      return '<details' + (i < 2 || g.subs.length <= 2 ? ' open' : '') + '><summary>' + escapeHtml(sub) + '</summary><div class="sec">' + ids.map((id) => control(id)).join('') + '</div></details>';
    }).join('');
    return html + fontList();
  }

  function renderSearch() {
    const q = query.toLowerCase();
    const ids = registry.ORDER.filter((id) => {
      const t = registry.TOKENS[id];
      return (t.label + ' ' + t.sub + ' ' + (t.hint || '') + ' ' + id).toLowerCase().indexOf(q) !== -1;
    });
    return ids.length ? ids.slice(0, 60).map((id) => control(id, true)).join('') + fontList() : '<div class="empty">No settings match “' + escapeHtml(query) + '”.</div>';
  }

  function renderThemes() {
    return '<h4>Prebuilt themes</h4><div class="themes">' + registry.THEMES.map((th) => {
      const p = customizerEngine.resolve({ values: th.p });
      return '<button class="theme' + (draft.theme === th.id ? ' on' : '') + '" data-theme="' + th.id + '"><i>' +
        [p.base, p.surfaceAlt, p.secondary, p.primary, p.highlight].map((c) => '<span style="background:' + c + '"></span>').join('') +
        '</i>' + escapeHtml(th.name) + '</button>';
    }).join('') + '</div><p class="note">Each theme sets the palette, every section color and its own look: sidebar style, fonts, glow, roundness, animations and login touches. Your login layout, background image, texts, menu and custom CSS are kept. Fine-tune anything afterwards in the other tabs.</p>';
  }

  function sidebarItems() {
    const sb = draft.sidebar[currentView()];
    // Top-level entries only: those are the ones that can be reordered or hidden as a row.
    const items = navItems().filter((it) => it.top && it.key).map((it, i) => {
      const t = it.label;
      return { key: it.key, orig: (t && (t.dataset.irvexOrig || t.textContent.trim())) || it.key, idx: i };
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
        return '<div class="row' + (hidden ? ' hid' : '') + '" data-key="' + escapeHtml(it.key) + '"><span class="grip" title="Drag to reorder">&#8942;&#8942;</span>' +
          '<input type="checkbox" data-vis="' + escapeHtml(it.key) + '" title="Show / hide"' + (hidden ? '' : ' checked') + '>' +
          '<div class="names"><input type="text" class="name" data-nm="' + escapeHtml(it.key) + '" value="' + escapeHtml(sb.names[it.key] || '') + '" placeholder="' + escapeHtml(it.orig) + '"><small>Original: ' + escapeHtml(it.orig) + '</small></div>' +
          '<button class="mv" data-up="' + escapeHtml(it.key) + '">&#9650;</button><button class="mv" data-down="' + escapeHtml(it.key) + '">&#9660;</button></div>';
      }).join('') + '<div class="btns"><button class="btn sm" data-act="resetSidebar">Reset this menu</button></div>';
    }
    return html + '<h4>Always hide (CSS selectors)</h4><textarea id="hidesel" spellcheck="false" placeholder="#sb_app-media&#10;#sb_memberships">' + escapeHtml(draft.hideSelectors.join('\n')) + '</textarea>' +
      '<p class="note">One selector per line; applied when you click outside the box. You are editing the <b>' + (v === 'agency' ? 'Agency' : 'Sub-account') + '</b> menu — switch views and reopen to edit the other. Empty name = original name.</p>';
  }

  function renderAdvanced() {
    return '<h4>Theme sections</h4><p class="note">Switch off any part of the theme to keep the CRM’s original look there.</p>' +
      registry.SECTIONS.map((s) => '<div class="ctl"><div class="lbl"><b>' + escapeHtml(s[1]) + '</b></div><div class="in"><input type="checkbox" data-sec="' + s[0] + '"' + (draft.sections[s[0]] === false ? '' : ' checked') + '></div></div>').join('') +
      '<h4>Custom CSS</h4><textarea id="customcss" spellcheck="false" placeholder="/* added after the theme */">' + escapeHtml(draft.customCss) + '</textarea>' +
      '<p class="note">Applied when you click outside the box.</p>' +
      '<h4>Backup / restore</h4><div class="btns"><button class="btn sm" data-act="copyJson">Copy settings JSON</button><button class="btn sm" data-act="pasteJson">Restore from JSON…</button>' +
      '<button class="btn sm" data-act="resetAll">Reset everything</button></div>' +
      '<h4>This browser</h4><div class="btns"><button class="btn sm" data-act="forget">Disconnect this browser</button></div>' +
      '<p class="note">Licensed to ' + escapeHtml(UC.license.name || UC.license.companyId) + '. <a href="' + escapeHtml(UC.api('/docs')) + '" target="_blank" rel="noopener">Documentation</a> · <a href="' + escapeHtml(UC.api('/')) + '" target="_blank" rel="noopener">Support</a></p>';
  }

  /* ---------- panels: read, pick and style any part of the page ---------- */
  const PF = customizerEngine.PANEL_FIELDS;
  // Panels HighLevel shows in its classic and new designs (only those on screen are listed first).
  const KNOWN_PANELS = [
    ['Sidebar', '#sidebar-v2'],
    ['Top bar', '.switchyard-topbar'],
    ['Header (classic)', '.hl_header'],
    ['Account menu', '.switchyard-account-menu'],
    ['Group flyouts (e.g. Settings)', '.switchyard-flyout'],
    ['Accounts directory', '.switchyard-accounts-directory'],
    ['Account rail', '.switchyard-account-rail'],
    ['Page area', '.hl_wrapper'],
    ['Cards', '.hl-card, .card'],
    ['Dropdown menus', '.hr-dropdown-menu, .n-dropdown-menu, .dropdown-menu'],
    ['Pop-ups & modals', '.hr-modal, .n-modal, .n-dialog, .modal-content'],
    ['Tables', '.hr-data-table, .n-data-table'],
    ['Text inputs', '.hr-input, .n-input, .hl-text-input, .form-control'],
    ['Primary buttons', '.hr-button--primary-type, .n-button--primary-type, .btn-primary, .hl-btn']
  ];
  const ours = (el) => !!(el && el.closest && el.closest('#irvex-uc-host, #uc-pick-box, #uc-pick-tip, #uc-locate'));
  function matches(sel) {
    try { return Array.from(document.querySelectorAll(sel)).filter((el) => !ours(el)); } catch (e) { return null; }
  }
  // Computed color -> { hex, a }   (rgb(), rgba() and the space syntax)
  function parseColor(c) {
    const m = String(c || '').match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?/i);
    if (!m) return null;
    let a = m[4] === undefined ? 1 : parseFloat(m[4]) / (/%$/.test(m[4]) ? 100 : 1);
    return { hex: customizerEngine.rgbToHex(+m[1], +m[2], +m[3]), a: Math.round(a * 100) / 100 };
  }
  // What the panel looks like right now (first match on the page).
  function readPanel(sel) {
    const els = matches(sel);
    if (!els || !els.length) return null;
    const cs = getComputedStyle(els[0]);
    const bg = parseColor(cs.backgroundColor);
    const blur = (cs.backdropFilter || cs.webkitBackdropFilter || '').match(/blur\(([\d.]+)px\)/);
    return {
      count: els.length,
      bg: bg && bg.a > 0 ? bg.hex : '', bgA: bg ? bg.a : 1,
      text: (parseColor(cs.color) || {}).hex || '',
      border: parseFloat(cs.borderTopWidth) > 0 ? (parseColor(cs.borderTopColor) || {}).hex || '' : '',
      bw: Math.round(parseFloat(cs.borderTopWidth) || 0),
      radius: Math.round(parseFloat(cs.borderTopLeftRadius) || 0),
      blur: blur ? Math.round(parseFloat(blur[1])) : 0,
      font: (cs.fontFamily || '').split(',')[0].replace(/["']/g, '').trim()
    };
  }

  /* Stable selector for a picked element: ids, test ids and design-system
     classes; never generated ids (hr-button-v-122), state classes or Vue hashes. */
  const SAFE = /^[A-Za-z_][\w-]*$/;
  const STATEY = /(^|[-_])(active|show|open|opened|hover|focus|focused|selected|pending|disabled|visible|hidden|collapsed|expanded|enter|leave|from|to|transition|is|has)([-_]|$)|^(v-|router-link)|\d{2,}/i;
  const stableId = (id) => !!id && SAFE.test(id) && !/\d{2,}|-v-\d|^(hr|n|el|v)-/.test(id);
  function partOf(el) {
    if (stableId(el.id)) return '#' + el.id;
    const tag = el.tagName.toLowerCase();
    for (const a of ['data-testid', 'data-switchyard-top-slot', 'aria-label']) {
      const v = el.getAttribute(a);
      if (v && /^[\w .:-]{1,60}$/.test(v) && !/\d{2,}/.test(v)) return tag + '[' + a + '="' + v + '"]';
    }
    const cls = Array.from(el.classList).filter((c) => SAFE.test(c) && !STATEY.test(c) && c.length <= 48);
    const pick = cls.filter((c) => /switchyard|hl_|hl-/.test(c)).concat(cls.filter((c) => !/switchyard|hl_|hl-/.test(c))).slice(0, 2);
    return tag + pick.map((c) => '.' + c).join('');
  }
  function selectorFor(el) {
    const parts = [];
    let sel = '';
    for (let n = el, depth = 0; n && n !== document.body && n !== document.documentElement && depth < 5; n = n.parentElement, depth++) {
      const p = partOf(n);
      if (depth > 0 && /^(div|span|section)$/.test(p)) continue; // plain wrappers add nothing
      parts.unshift(p);
      sel = parts.join(' ');
      const m = matches(sel);
      if (m && m.length === 1) return sel;
      if (p.charAt(0) === '#') break;
    }
    return sel || partOf(el);
  }
  function nameFor(el, sel) {
    const known = KNOWN_PANELS.find((k) => { try { return el.matches(k[1]); } catch (e) { return false; } });
    if (known) return known[0];
    const label = el.getAttribute('aria-label') || el.getAttribute('title');
    if (label && label.length <= 40) return label;
    const c = Array.from(el.classList).find((x) => SAFE.test(x) && !STATEY.test(x));
    const base = c ? c.replace(/^(switchyard|hl|hr|n)[-_]+/, '').replace(/[-_]+/g, ' ') : el.tagName.toLowerCase();
    return (base.charAt(0).toUpperCase() + base.slice(1)).slice(0, 40) || sel.slice(0, 40);
  }
  let openPanel = -1;
  const simpler = {}; // panel index -> a broader selector suggested at pick time (not saved)
  function addPanel(sel, name, alt) {
    const at = draft.panels.findIndex((p) => p.sel === sel);
    if (at !== -1) { openPanel = at; tab = 'panels'; render(); return; }
    if (draft.panels.length >= customizerEngine.MAX_PANELS) { toast('Up to ' + customizerEngine.MAX_PANELS + ' panels'); return; }
    draft.panels.push({ sel, name: name || '' });
    openPanel = draft.panels.length - 1;
    if (alt && alt !== sel) simpler[openPanel] = alt;
    tab = 'panels';
    query = '';
    changed(true);
  }

  function panelField(i, k, read) {
    const f = PF[k];
    const p = draft.panels[i];
    const has = Object.prototype.hasOwnProperty.call(p, k) && p[k] !== '';
    const val = has ? p[k] : f.def;
    const attrs = ' data-p="' + i + '" data-f="' + k + '"';
    let input;
    if (f.type === 'color') {
      const shown = has ? val : ((read && read[k]) || '#000000');
      input = '<input type="color"' + attrs + ' value="' + escapeHtml(shown) + '"><input type="text" class="hex" data-phex="' + i + ':' + k + '" value="' + escapeHtml(has ? val : '') + '" placeholder="' + escapeHtml((read && read[k]) || 'none') + '" maxlength="7">';
    } else if (f.type === 'num') {
      input = '<input type="range"' + attrs + ' min="' + f.min + '" max="' + f.max + '" step="' + f.step + '" value="' + val + '"><input type="number" class="num"' + attrs + ' min="' + f.min + '" max="' + f.max + '" step="' + f.step + '" value="' + val + '">';
    } else if (f.type === 'bool') {
      input = '<input type="checkbox"' + attrs + (val ? ' checked' : '') + '>';
    } else if (f.type === 'select') {
      input = '<select' + attrs + '>' + f.options.map((o) => '<option value="' + o + '"' + (o === val ? ' selected' : '') + '>' + (o ? o.charAt(0).toUpperCase() + o.slice(1) : 'None') + '</option>').join('') + '</select>';
    } else {
      input = '<input type="text" class="txt"' + attrs + (f.type === 'font' ? ' list="uc-fonts"' : '') + ' value="' + escapeHtml(val) + '" placeholder="' + escapeHtml(f.type === 'font' ? ((read && read.font) || 'Theme font') : '') + '">';
    }
    return input;
  }
  const PANEL_ROWS = [
    ['Colors', [['bg', 'Background'], ['bgA', 'Background opacity'], ['bg2', 'Gradient to', 'Leave empty for a solid color'], ['angle', 'Gradient angle'],
      ['text', 'Text & icons'], ['inner', 'Also color everything inside'], ['hoverBg', 'Hover background']]],
    ['Border & shape', [['border', 'Border color'], ['bw', 'Border width (px)'], ['radius', 'Corner radius (px)', '-1 keeps the original']]],
    ['Effects', [['glow', 'Glow color'], ['glowSize', 'Glow size'], ['shadow', 'Shadow'], ['blur', 'Glass blur (px)', 'Works on see-through backgrounds']]],
    ['Font', [['font', 'Font family']]]
  ];
  function renderPanelEditor(i) {
    const p = draft.panels[i];
    const read = readPanel(p.sel);
    const count = read ? read.count : 0;
    const now = (k) => (read && read[k] !== undefined && read[k] !== '' ? '<span class="now">now ' + escapeHtml(String(read[k])) + '</span>' : '');
    let html = '<div class="ctl"><div class="lbl"><b>Name</b></div><div class="in">' + panelField(i, 'name') + '</div></div>' +
      '<div class="ctl"><div class="lbl"><b>Selector</b><small>Which elements this styles (CSS selector)</small></div><div class="in"><input type="text" class="txt" data-psel="' + i + '" value="' + escapeHtml(p.sel) + '" spellcheck="false"></div></div>' +
      '<div class="pcount' + (count ? '' : ' zero') + '">' + (count ? 'Matches ' + count + ' element' + (count > 1 ? 's' : '') + ' on this screen.' : 'Not on this screen right now (it may only show when opened). Saved styles still apply when it appears.') + '</div>' +
      '<div class="btns"><button class="btn sm" data-plocate="' + i + '">Show on page</button>' +
      (simpler[i] ? '<button class="btn sm" data-psimple="' + i + '">Apply to all similar</button>' : '') +
      '<button class="btn sm" data-pclear="' + i + '">Clear styles</button><button class="btn sm" data-pdel="' + i + '">Remove</button>' +
      '<label class="note" style="margin:0;display:flex;align-items:center;gap:6px">' + panelField(i, 'off') + ' Paused</label></div>';
    PANEL_ROWS.forEach((g) => {
      html += '<h4>' + g[0] + '</h4>' + g[1].map((row) => {
        const k = row[0];
        const set = Object.prototype.hasOwnProperty.call(p, k);
        return '<div class="ctl' + (set ? ' set' : '') + '"><div class="lbl"><b>' + escapeHtml(row[1]) + '</b>' +
          '<small>' + (row[2] ? escapeHtml(row[2]) + ' ' : '') + now(k) + '</small></div><div class="in">' + panelField(i, k, read) +
          '<button class="rs" data-preset="' + i + ':' + k + '" title="Back to the original">↺</button></div></div>';
      }).join('');
    });
    return html;
  }
  function renderPanels() {
    let html = '<h4>Pick any part of the page</h4><p class="note">Click <b>Pick on page</b>, then click any panel, card, bar, menu or button. Its current colors are read so you can change them, add glow, glass blur, borders and rounded corners. Use ↑ / ↓ while picking to select the parent or child.</p>' +
      '<div class="btns"><button class="btn pri" data-act="pickPanel">Pick on page</button></div>';
    if (draft.panels.length) {
      html += '<h4>Your panels</h4>' + draft.panels.map((p, i) => '<details' + (i === openPanel ? ' open' : '') + ' data-pdet="' + i + '"><summary>' +
        escapeHtml((p.off ? '⏸ ' : '') + (p.name || p.sel).slice(0, 48)) + '</summary><div class="sec">' + (i === openPanel ? renderPanelEditor(i) : '') + '</div></details>').join('');
    }
    const known = KNOWN_PANELS.map((k) => ({ name: k[0], sel: k[1], read: readPanel(k[1]) }))
      .filter((k) => !draft.panels.some((p) => p.sel === k.sel))
      .sort((a, b) => (b.read ? 1 : 0) - (a.read ? 1 : 0));
    html += '<h4>Detected panels (' + (UC.layout === 'switchyard' ? 'new navigation' : UC.layout === 'classic' ? 'classic design' : 'this design') + ')</h4><div class="plist">' +
      known.map((k) => '<div class="pdet' + (k.read ? '' : ' none') + '"><span class="sw" style="background:' + escapeHtml((k.read && k.read.bg) || 'transparent') + '"></span>' +
        '<div class="names"><b>' + escapeHtml(k.name) + '</b><small>' + (k.read ? k.read.count + ' on screen · ' + escapeHtml(k.read.bg || 'transparent') + ' / ' + escapeHtml(k.read.text) : 'not open right now') + '</small></div>' +
        '<button class="btn sm" data-pknown="' + escapeHtml(k.sel) + '" data-pname="' + escapeHtml(k.name) + '">Customize</button></div>').join('') + '</div>';
    return html + fontList();
  }

  /* Picker: hover highlights, click picks, ↑/↓ walk parent/child, Esc cancels. */
  let picking = null;
  function startPicker() {
    if (picking || !host) return;
    const accent = customizerEngine.resolve(draft).primary;
    const box = document.createElement('div');
    box.id = 'uc-pick-box';
    box.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483646;border:2px solid ' + accent + ';background:' + customizerEngine.rgba(accent, 0.12) + ';border-radius:4px;transition:all .06s;display:none';
    const tip = document.createElement('div');
    tip.id = 'uc-pick-tip';
    tip.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#04101f;color:#e6f7ff;border:1px solid ' + accent +
      ';border-radius:99px;padding:8px 16px;font:600 12px Inter,system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.5);max-width:92vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none';
    document.documentElement.appendChild(box);
    document.documentElement.appendChild(tip);
    host.style.display = 'none';
    let cur = null;
    const down = [];
    const show = (el) => {
      cur = el;
      const r = el.getBoundingClientRect();
      Object.assign(box.style, { display: 'block', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
      tip.textContent = nameFor(el, '') + ' — ' + partOf(el) + '   ·   click to pick · ↑ parent · ↓ child · Esc cancel';
    };
    tip.textContent = 'Hover a panel and click to pick it · Esc cancels';
    const move = (e) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || ours(el) || el === cur) return;
      down.length = 0;
      show(el);
    };
    const block = (e) => { if (ours(e.target)) return; e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); };
    const click = (e) => { block(e); if (cur) stop(cur); };
    const key = (e) => {
      if (e.key === 'Escape') { block(e); stop(null); return; }
      if (!cur) return;
      if (e.key === 'ArrowUp' && cur.parentElement && cur.parentElement !== document.documentElement && cur.parentElement !== document.body) { block(e); down.push(cur); show(cur.parentElement); }
      else if (e.key === 'ArrowDown' && down.length) { block(e); show(down.pop()); }
      else if (e.key === 'Enter') { block(e); stop(cur); }
    };
    const scroll = () => { if (cur) show(cur); };
    const evs = [['mousemove', move], ['pointerdown', block], ['mousedown', block], ['pointerup', block], ['mouseup', block], ['click', click], ['dblclick', block], ['contextmenu', block], ['keydown', key], ['scroll', scroll]];
    evs.forEach((x) => window.addEventListener(x[0], x[1], true));
    function stop(el) {
      evs.forEach((x) => window.removeEventListener(x[0], x[1], true));
      box.remove();
      tip.remove();
      picking = null;
      if (!host) return;
      host.style.display = '';
      if (!el) return;
      const sel = selectorFor(el);
      addPanel(sel, nameFor(el, sel), partOf(el));
      toast('Picked: ' + nameFor(el, sel));
    }
    picking = { stop };
  }
  function locate(sel) {
    const old = document.getElementById('uc-locate');
    if (old) old.remove();
    const els = (matches(sel) || []).slice(0, 30);
    if (!els.length) { toast('Not on this screen right now'); return; }
    const wrap = document.createElement('div');
    wrap.id = 'uc-locate';
    wrap.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483646';
    els.forEach((el) => {
      const r = el.getBoundingClientRect();
      const b = document.createElement('div');
      b.style.cssText = 'position:fixed;border:2px dashed #ffd700;border-radius:4px;box-shadow:0 0 0 9999px rgba(0,0,0,.25);left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px';
      wrap.appendChild(b);
    });
    document.documentElement.appendChild(wrap);
    setTimeout(() => wrap.remove(), 1600);
  }
  // Writes one panel field; '' or the default removes it (back to the original look).
  function setPanel(i, k, v) {
    const p = draft.panels[i];
    if (!p) return;
    if (v === '' || v === PF[k].def) delete p[k]; else p[k] = v;
    draft = customizerEngine.sanitize(draft);
  }

  /* ---------- applying changes ---------- */
  let paintRaf = 0;
  function changed(rerender) {
    draft.theme = draft.theme || 'custom';
    if (!paintRaf) {
      paintRaf = requestAnimationFrame(() => {
        paintRaf = 0;
        UC.render(draft).catch(() => status('Preview failed', 'err'));
      });
    }

    if (rerender) {
      render();
    } else {
      syncAccent();
    }

    scheduleSave();
  }
  function setValue(id, value) {
    const t = registry.TOKENS[id];
    if (value === '' && t.def === '') {
      delete draft.values[id];
    } else {
      draft.values[id] = value;
    }
    draft = customizerEngine.sanitize(draft);
    const ctl = shadow.querySelector('[data-ctl="' + id + '"]');
    if (ctl) {
      ctl.classList.add('set');
    }
  }

  function scheduleSave() {
    status('Unsaved…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = 0;
      save();
    }, 700);
  }
  function save() {
    if (saving) {
      pendingSave = true;
      return;
    }
    if (!UC.editorToken()) {
      status('Not connected', 'err');
      return;
    }

    saving = true;
    status('Saving…');
    UC.save(draft).then(() => {
      status('All changes saved', 'ok');
    })
      .catch((e) => {
        status('Not saved', 'err');
        if (e.status === 401) {
          UC.editorToken('');
          if (host) {
            view = 'connect';
            renderConnect('start');
            toast('This browser needs to reconnect');
          }
        } else {
          toast(e.message);
        }
      })
      .then(() => {
        saving = false;
        if (pendingSave) {
          pendingSave = false;
          save();
        }
      });
  }

  /* ---------- login page preview ---------- */
  const MOCK_ID = 'uc-login-mock';
  function mockOpen() {
    return Boolean(document.getElementById(MOCK_ID));
  }
  function showLoginMock() {
    if (mockOpen()) {
      return;
    }
    const logoEl = document.querySelector('img.agency-logo');
    const logo = logoEl && logoEl.src ? logoEl.src : 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="220" height="80"><text x="50%" y="55%" text-anchor="middle" font-family="sans-serif" font-size="28" font-weight="700" fill="#ffffff">YOUR LOGO</text></svg>');
    const f = 'display:block;width:100%;box-sizing:border-box;margin:0 0 16px;font-size:14px';
    const m = document.createElement('div');
    m.id = MOCK_ID;
    m.style.cssText = 'position:fixed;inset:0;z-index:2147482000;overflow:hidden';
    m.innerHTML = '<div class="hl_login"><div class="hl_login--header"><div class="container-fluid"><img alt="Logo" src="' + escapeHtml(logo) + '"></div></div>' +
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
    if (UC.refreshEffects) {
      UC.refreshEffects();
    }
  }
  function hideLoginMock() {
    const m = document.getElementById(MOCK_ID);
    if (m) {
      m.remove();
    }
  }

  /* ---------- sidebar editing ---------- */
  function commitOrder(keys) {
    draft.sidebar[currentView()].order = keys;
    changed(true);
  }
  function moveBefore(from, to) {
    if (!from || from === to) {
      return;
    }
    const keys = sidebarItems().map((i) => i.key).filter((k) => k !== from);
    const at = keys.indexOf(to);
    keys.splice(at < 0 ? keys.length : at, 0, from);
    commitOrder(keys);
  }
  function step(key, dir) {
    const keys = sidebarItems().map((i) => i.key);
    const i = keys.indexOf(key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= keys.length) {
      return;
    }
    keys.splice(j, 0, keys.splice(i, 1)[0]);
    commitOrder(keys);
  }
  function bindDnD(body) {
    body.querySelectorAll('.row').forEach((r) => {
      r.querySelector('.grip').addEventListener('mousedown', () => {
        r.draggable = true;
      });
      r.addEventListener('dragstart', (e) => {
        dragKey = r.dataset.key;
        r.classList.add('drag');
        e.dataTransfer.effectAllowed = 'move';
        try {
          e.dataTransfer.setData('text/plain', dragKey);
        } catch (x) {
          /* ignore */
        }
      });
      r.addEventListener('dragend', () => {
        r.draggable = false;
        r.classList.remove('drag');
      });
      r.addEventListener('dragover', (e) => e.preventDefault());
      r.addEventListener('drop', (e) => {
        e.preventDefault();
        moveBefore(dragKey, r.dataset.key);
      });
    });
  }

  /* ---------- events ---------- */
  function copyText(txt, ok) {
    const done = () => toast(ok);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(done, () => fallbackCopy(txt, done));
    } else {
      fallbackCopy(txt, done);
    }
  }
  function fallbackCopy(txt, done) {
    const ta = document.createElement('textarea');
    ta.value = txt;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      done();
    } catch (e) {
      /* ignore */
    }
    ta.remove();
  }

  function onClick(e) {
    const t = e.target;
    const tabBtn = t.closest('[data-tab]');
    if (tabBtn) {
      tab = tabBtn.dataset.tab;
      query = '';
      const q = shadow.getElementById('q');
      if (q) {
        q.value = '';
      }
      if (tab !== 'login') {
        hideLoginMock();
      }
      render();
      return;
    }
    const th = t.closest('[data-theme]');
    if (th) {
      draft = customizerEngine.applyTheme(draft, th.dataset.theme);
      changed(true);
      toast('Theme applied');
      return;
    }
    const rs = t.closest('[data-reset]');
    if (rs) {
      delete draft.values[rs.dataset.reset];
      changed(true);
      return;
    }
    const up = t.closest('[data-up]');
    if (up) {
      step(up.dataset.up, -1);
      return;
    }
    const dn = t.closest('[data-down]');
    if (dn) {
      step(dn.dataset.down, 1);
      return;
    }
    const pk = t.closest('[data-pknown]');
    if (pk) { addPanel(pk.dataset.pknown, pk.dataset.pname); return; }
    const pd = t.closest('summary') && t.closest('[data-pdet]');
    if (pd) { e.preventDefault(); const i = +pd.dataset.pdet; openPanel = openPanel === i ? -1 : i; render(); return; }
    const pr = t.closest('[data-preset]');
    if (pr) { const x = pr.dataset.preset.split(':'); setPanel(+x[0], x[1], ''); changed(true); return; }
    if (t.closest('[data-plocate]')) { locate(draft.panels[+t.closest('[data-plocate]').dataset.plocate].sel); return; }
    const ps = t.closest('[data-psimple]');
    if (ps) {
      const i = +ps.dataset.psimple;
      draft.panels[i].sel = simpler[i];
      delete simpler[i];
      draft = customizerEngine.sanitize(draft);
      changed(true);
      return;
    }
    const pc = t.closest('[data-pclear]');
    if (pc) { const i = +pc.dataset.pclear; const q = draft.panels[i]; draft.panels[i] = { sel: q.sel, name: q.name }; draft = customizerEngine.sanitize(draft); changed(true); return; }
    const pdl = t.closest('[data-pdel]');
    if (pdl) {
      const i = +pdl.dataset.pdel;
      if (!confirm('Remove "' + (draft.panels[i].name || draft.panels[i].sel) + '" and its styles?')) return;
      draft.panels.splice(i, 1);
      Object.keys(simpler).forEach((k) => delete simpler[k]);
      openPanel = -1;
      changed(true);
      return;
    }
    const a = t.closest('[data-act]');
    if (!a) {
      return;
    }
    switch (a.dataset.act) {
      case 'close':
        closeUI();
        break;
      case 'connect':
        startConnect();
        break;
      case 'pickPanel':
        startPicker();
        break;
      case 'cancelConnect':
        clearInterval(connectTimer);
        renderConnect('start');
        break;
      case 'loginPreview':
        if (mockOpen()) {
          hideLoginMock();
        } else {
          showLoginMock();
        }
        render();
        break;
      case 'undoSession':
        if (!confirm('Undo every change made since you opened the customizer?')) {
          return;
        }
        draft = customizerEngine.clone(opened);
        changed(true);
        break;
      case 'resetAll':
        if (!confirm('Reset all settings to the default IRVEX theme?')) {
          return;
        }
        draft = customizerEngine.clone(customizerEngine.DEFAULTS);
        changed(true);
        break;
      case 'resetSidebar':
        draft.sidebar[currentView()] = { order: [], names: {}, hidden: [] };
        changed(true);
        break;
      case 'copyJson':
        copyText(JSON.stringify(draft, null, 2), 'Settings copied');
        break;
      case 'pasteJson': {
        const txt = prompt('Paste settings JSON');
        if (!txt) {
          return;
        }
        try {
          draft = customizerEngine.sanitize(JSON.parse(txt));
          changed(true);
          toast('Settings restored');
        } catch (x) {
          toast('That is not valid JSON');
        }
        break;
      }
      case 'forget':
        if (!confirm('Disconnect this browser? You will need to approve it again to edit.')) {
          return;
        }
        UC.editorToken('');
        closeUI();
        break;
    }
  }

  function onInput(e) {
    const t = e.target;
    if (t.id === 'q') {
      query = t.value.trim();
      render();
      const q = shadow.getElementById('q');
      q.focus();
      q.setSelectionRange(q.value.length, q.value.length);
      return;
    }
    const id = t.dataset.k;
    if (id) {
      const tok = registry.TOKENS[id];
      if (tok.type === 'color') {
        setValue(id, t.value);
        const hx = shadow.querySelector('[data-hex="' + id + '"]');
        if (hx) {
          hx.value = t.value;
        }
        changed(false);
      } else if (tok.type === 'num') {
        if (t.value === '') {
          return;
        }
        setValue(id, Number(t.value));
        t.closest('.in').querySelectorAll('[data-k]').forEach((x) => {
          if (x !== t) {
            x.value = t.value;
          }
        });
        changed(false);
      } else if (tok.type === 'text') {
        setValue(id, t.value);
        changed(false);
      }
      return;
    }
    if (t.dataset.f) {
      const i = +t.dataset.p, k = t.dataset.f, f = PF[k];
      if (f.type === 'color') {
        setPanel(i, k, t.value);
        const hx = shadow.querySelector('[data-phex="' + i + ':' + k + '"]');
        if (hx) hx.value = t.value;
      } else if (f.type === 'num') {
        if (t.value === '') return;
        setPanel(i, k, Number(t.value));
        t.closest('.in').querySelectorAll('[data-f]').forEach((x) => { if (x !== t) x.value = t.value; });
      } else if (k === 'name') {
        setPanel(i, k, t.value.trim());
      } else {
        return;
      }
      const ctl = t.closest('.ctl');
      if (ctl) ctl.classList.add('set');
      changed(false);
      return;
    }
    if (t.dataset.nm) {
      const sb = draft.sidebar[currentView()];
      const v = t.value.trim();
      if (v) {
        sb.names[t.dataset.nm] = v.slice(0, 60);
      } else {
        delete sb.names[t.dataset.nm];
      }
      changed(false);
    }
  }

  function onChange(e) {
    const t = e.target;
    if (t.dataset.phex) {
      const x = t.dataset.phex.split(':');
      let v = t.value.trim();
      if (v && v[0] !== '#') v = '#' + v;
      if (v && !customizerEngine.isHex(v)) { toast('Use a color like #1a2b3c'); render(); return; }
      setPanel(+x[0], x[1], v.toLowerCase());
      changed(true);
      return;
    }
    if (t.dataset.psel) {
      const i = +t.dataset.psel, v = t.value.trim();
      if (!v || matches(v) === null || !customizerEngine.cleanPanel({ sel: v })) { toast('That selector is not valid'); render(); return; }
      draft.panels[i].sel = v;
      delete simpler[i];
      draft = customizerEngine.sanitize(draft);
      changed(true);
      return;
    }
    if (t.dataset.f) {
      const i = +t.dataset.p, k = t.dataset.f, f = PF[k];
      if (f.type === 'bool') setPanel(i, k, t.checked);
      else if (f.type === 'select') setPanel(i, k, t.value);
      else if (f.type === 'font') {
        const before = JSON.stringify(draft.panels[i][k]);
        setPanel(i, k, t.value.trim());
        if (t.value.trim() && JSON.stringify(draft.panels[i][k]) === before) toast('Letters, numbers and spaces only');
      } else return;
      changed(true);
      return;
    }
    if (t.dataset.hex) {
      let v = t.value.trim();
      if (v[0] !== '#') {
        v = '#' + v;
      }
      if (!customizerEngine.isHex(v)) {
        t.value = customizerEngine.resolve(draft)[t.dataset.hex];
        return;
      }
      setValue(t.dataset.hex, v.toLowerCase());
      changed(true);
      return;
    }
    const id = t.dataset.k;
    if (id) {
      const tok = registry.TOKENS[id];
      if (tok.type === 'select') {
        setValue(id, t.value);
        changed(true);
      } else if (tok.type === 'bool') {
        setValue(id, t.checked);
        changed(true);
      } else if (tok.type === 'url' || tok.type === 'font') {
        const before = JSON.stringify(draft.values[id]);
        setValue(id, t.value.trim());
        if (JSON.stringify(draft.values[id]) === before && t.value.trim()) {
          toast(tok.type === 'url' ? 'Use a full https:// link' : 'Letters, numbers and spaces only');
        }
        changed(true);
      }
      return;
    }
    if (t.dataset.sec) {
      if (t.checked) {
        delete draft.sections[t.dataset.sec];
      } else {
        draft.sections[t.dataset.sec] = false;
      }
      changed(false);
      return;
    }
    if (t.dataset.vis) {
      const sb = draft.sidebar[currentView()];
      const i = sb.hidden.indexOf(t.dataset.vis);
      if (t.checked && i >= 0) {
        sb.hidden.splice(i, 1);
      }
      if (!t.checked && i < 0) {
        sb.hidden.push(t.dataset.vis);
      }
      changed(true);
    }
  }

  function onBlur(e) {
    const t = e.target;
    if (t.id === 'hidesel') {
      draft.hideSelectors = t.value.split('\n').map((s) => s.trim()).filter(Boolean);
      draft = customizerEngine.sanitize(draft);
      changed(false);
    } else if (t.id === 'customcss') {
      if (t.value === draft.customCss) {
        return;
      }
      draft.customCss = t.value;
      draft = customizerEngine.sanitize(draft);
      changed(false);
    }
  }

  /* ------------------------------------------------------------------
     7. BOOT
  ------------------------------------------------------------------ */
  if (UC.mode !== 'setup') {
    applyNames();
  }
  // The profile menu is rendered on demand (and re-rendered by the CRM),
  // so add the item as soon as a menu appears, with a slow timer as a backstop.
  let menuTimer = 0;
  function syncMenu() {
    menuTimer = 0;
    if (UC.killed) return;
    try { ensureMenuItem(); } catch (e) { /* never break the CRM */ }
  }
  // Throttled: the CRM mutates the DOM constantly; one check per ~100ms is plenty.
  const menuObs = new MutationObserver(() => { if (!menuTimer) menuTimer = setTimeout(syncMenu, 100); });
  // Opening the profile menu (any design): check right away and while its popover animates in.
  document.addEventListener('click', (e) => {
    if (UC.killed || !e.target.closest) return;
    if (e.target.closest('.switchyard-user-avatar, [data-switchyard-top-slot="topnav.user"], [aria-label="Account"], .hl_header--avatar, .hl_header--dropdown, [class*="avatar"]')) {
      menuHintUntil = Date.now() + 15000;
      [30, 150, 400, 900].forEach((ms) => setTimeout(syncMenu, ms));
    }
  }, true);
  const startMenuObs = () => menuObs.observe(document.body || document.documentElement, { childList: true, subtree: true });
  if (document.body) startMenuObs(); else document.addEventListener('DOMContentLoaded', startMenuObs);
  UC.onKill(() => menuObs.disconnect());
  if (UC.onLayout) UC.onLayout(() => { removeMenuItem(); syncMenu(); if (UC.mode !== 'setup') applyNames(); });
  const iv = setInterval(() => {
    if (UC.killed) {
      clearInterval(iv);
      return;
    }
    syncMenu();
  }, 600);

  window.IRVEX_UC = {
    open: function openCustomizer() {
      const initialView = UC.mode === 'setup' || !UC.editorToken() ? 'connect' : 'editor';
      openUI(initialView);
    },
    // Troubleshooting: open the profile menu, then run IRVEX_UC.debug() in the console.
    debug: function debugCustomizer() {
      const f = findAccountMenu();
      const email = UC.currentEmail(f && f.menu);
      const user = UC.users[email];
      return {
        mode: UC.mode, layout: UC.layout, company: UC.company, killed: UC.killed,
        menuFound: !!f, menuKind: f ? f.kind : null,
        menu: f ? f.menu.tagName.toLowerCase() + '.' + Array.from(f.menu.classList).join('.') : null,
        signOut: f ? f.signout.outerHTML.slice(0, 400) : null,
        email: email || null, usersSeen: Object.keys(UC.users).length,
        roles: user ? user.roles : null, admin: isAdmin(f && f.menu),
        itemInDom: !!document.getElementById('irvex-uc-menu-item')
      };
    }
  };
})();
