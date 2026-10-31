/* =====================================================================
   ULTIMATE CUSTOMIZER - THEME ENGINE (shared by server + browser)
   ---------------------------------------------------------------------
   template (tokenized master CSS) + config  ->  final CSS

   Placeholders in the template:
     [[id]]            resolved value (color hex, number+unit, select css, font)
     [[id/0.3]]        color with alpha            -> rgba(r, g, b, 0.3)
     [[id/otherId]]    color with alpha from a numeric setting
     [[id*12px]]       numeric setting x 12, unit px  (scales)
   Sections are delimited by  /*@section id*\/  markers and can be switched off.
   ===================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./registry'));
  else root.UCThemeEngine = factory(root.UCRegistry);
})(typeof self !== 'undefined' ? self : this, function (R) {
  'use strict';

  const TOKENS = R.TOKENS;
  const NAV = '#sidebar-v2 nav[aria-label="header"]';

  /* ---------------- layouts ----------------
     HighLevel ships two app chromes:
       classic     .hl_header + #sidebar-v2 nav[aria-label="header"]
       switchyard  the new navigation (body.switchyard-owns-chrome, .switchyard-*)
     The master CSS was written for the classic chrome. Its generic rules
     (e.g. .hr-wrapper-container, which also wraps the whole new navigation)
     must never reach the switchyard chrome, so every master rule gets a
     zero-specificity guard that excludes it. The switchyard chrome is themed
     by its own section, which only paints (colors, fonts, glows). */
  const CHROME = '[class*="switchyard-"]:not(body,html)';
  const GUARD = ':where(:not(' + CHROME + ',' + CHROME + ' *))';
  const SY = '.switchyard-shell #sidebar-v2,.switchyard-sidebar';

  const DEFAULTS = {
    v: 2,
    theme: 'irvex',
    values: {},          // overrides only: { tokenId: value }
    sections: {},        // { sectionId: false } to switch a master-CSS section off
    sidebar: {
      agency: { order: [], names: {}, hidden: [] },
      location: { order: [], names: {}, hidden: [] }
    },
    hideSelectors: [],
    panels: [],          // point-and-click styles: [{ sel, name, bg, text, ... }] (see PANEL_FIELDS)
    customCss: ''
  };

  /* Panels: any element on the CRM page (picked in the editor, or a detected
     panel such as the sidebar or the account menu) with its own colors and
     effects. Empty color = leave as is. */
  const PANEL_FIELDS = {
    name: { type: 'text', max: 60, def: '' },
    sel: { type: 'sel', def: '' },
    off: { type: 'bool', def: false },
    bg: { type: 'color', def: '' },
    bgA: { type: 'num', min: 0, max: 1, step: 0.05, def: 1 },
    bg2: { type: 'color', def: '' },
    angle: { type: 'num', min: 0, max: 360, step: 5, def: 135 },
    text: { type: 'color', def: '' },
    inner: { type: 'bool', def: true },
    font: { type: 'font', def: '' },
    border: { type: 'color', def: '' },
    bw: { type: 'num', min: 0, max: 8, step: 1, def: 1 },
    radius: { type: 'num', min: -1, max: 48, step: 1, def: -1 },
    shadow: { type: 'select', options: ['', 'soft', 'medium', 'strong'], def: '' },
    glow: { type: 'color', def: '' },
    glowSize: { type: 'num', min: 0, max: 60, step: 1, def: 18 },
    blur: { type: 'num', min: 0, max: 40, step: 1, def: 0 },
    hoverBg: { type: 'color', def: '' }
  };
  const PANEL_SHADOWS = { soft: '0 4px 14px rgba(0, 0, 0, 0.25)', medium: '0 12px 32px rgba(0, 0, 0, 0.4)', strong: '0 24px 60px rgba(0, 0, 0, 0.6)' };
  const MAX_PANELS = 40;

  /* ---------------- helpers ---------------- */
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
  const isHex = (s) => typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s);
  const clamp255 = (n) => Math.max(0, Math.min(255, Math.round(n)));
  const cssEsc = (s) => String(s).replace(/["\\]/g, '\\$&');
  const fmtNum = (n) => String(Math.round(n * 1000) / 1000);

  function hexToRgb(h) {
    h = String(h).replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const rgbToHex = (r, g, b) => '#' + [r, g, b].map((v) => clamp255(v).toString(16).padStart(2, '0')).join('');
  const rgba = (hex, a) => { const c = hexToRgb(hex); return 'rgba(' + c[0] + ', ' + c[1] + ', ' + c[2] + ', ' + a + ')'; };

  /* ---------------- validation ---------------- */
  const KEY_RE = /^[\w*.:-]{1,160}$/;
  const SELECTOR_BAD = /[{}<>;@\\]|\/\*/;
  const URL_RE = /^https:\/\/[^\s"'()<>\\]{3,500}$/;
  const FONT_RE = /^[A-Za-z0-9 ]{1,40}$/;

  function cleanValue(t, v) {
    switch (t.type) {
      case 'color': return isHex(v) ? v.toLowerCase() : undefined;
      case 'num': {
        const n = Number(v);
        return isFinite(n) && v !== '' && v !== null ? Math.max(t.min, Math.min(t.max, n)) : undefined;
      }
      case 'select': return t.options.some((o) => o[0] === v) ? v : undefined;
      case 'bool': return typeof v === 'boolean' ? v : undefined;
      case 'text': return typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, t.max || 100) : undefined;
      case 'url': return typeof v === 'string' && (v === '' || URL_RE.test(v.trim())) ? v.trim() : undefined;
      case 'font': return typeof v === 'string' && (FONT_RE.test(v.trim()) || (v === '' && t.def === '')) ? v.trim() : undefined;
      default: return undefined;
    }
  }

  function cleanKeys(arr) {
    if (!Array.isArray(arr)) return [];
    const out = [];
    arr.forEach((k) => { if (typeof k === 'string' && KEY_RE.test(k) && out.indexOf(k) === -1 && out.length < 150) out.push(k); });
    return out;
  }

  function cleanSelector(v) {
    if (typeof v !== 'string') return '';
    const s = v.replace(/[\u0000-\u001f]/g, ' ').trim();
    return s && s.length <= 400 && !SELECTOR_BAD.test(s) ? s : '';
  }
  // Only fields that differ from their default are kept, so a panel stays small.
  function cleanPanel(p) {
    if (!isObj(p)) return null;
    const sel = cleanSelector(p.sel);
    if (!sel) return null;
    const out = { sel };
    Object.keys(PANEL_FIELDS).forEach((k) => {
      if (k === 'sel' || !Object.prototype.hasOwnProperty.call(p, k)) return;
      const f = PANEL_FIELDS[k];
      let v;
      if (f.type === 'color') v = p[k] === '' ? '' : (isHex(p[k]) ? p[k].toLowerCase() : undefined);
      else if (f.type === 'select') v = f.options.indexOf(p[k]) !== -1 ? p[k] : undefined;
      else if (f.type === 'font') v = typeof p[k] === 'string' && (p[k] === '' || FONT_RE.test(p[k].trim())) ? p[k].trim() : undefined;
      else v = cleanValue(f, p[k]);
      if (v !== undefined && v !== f.def) out[k] = v;
    });
    return out;
  }

  // Never trust a config: it ends up inside CSS and inside a <script>.
  function sanitize(input) {
    const src = isObj(input) ? input : {};
    const out = clone(DEFAULTS);

    if (typeof src.theme === 'string' && R.THEMES.some((t) => t.id === src.theme)) out.theme = src.theme;
    else if (src.theme === 'custom') out.theme = 'custom';

    const vals = isObj(src.values) ? src.values : {};
    Object.keys(vals).forEach((id) => {
      const t = Object.prototype.hasOwnProperty.call(TOKENS, id) ? TOKENS[id] : null;
      if (!t) return;
      const v = cleanValue(t, vals[id]);
      if (v !== undefined) out.values[id] = v;
    });

    const secs = isObj(src.sections) ? src.sections : {};
    R.SECTIONS.forEach((s) => { if (secs[s[0]] === false) out.sections[s[0]] = false; });

    if (Array.isArray(src.hideSelectors)) {
      out.hideSelectors = src.hideSelectors
        .filter((s) => typeof s === 'string' && s.trim() && s.length <= 200 && !SELECTOR_BAD.test(s))
        .map((s) => s.trim()).slice(0, 40);
    }
    if (Array.isArray(src.panels)) out.panels = src.panels.map(cleanPanel).filter(Boolean).slice(0, MAX_PANELS);
    if (typeof src.customCss === 'string') out.customCss = src.customCss.replace(/</g, '').slice(0, 30000);

    const sb = isObj(src.sidebar) ? src.sidebar : {};
    ['agency', 'location'].forEach((view) => {
      const v = isObj(sb[view]) ? sb[view] : {};
      const names = {};
      if (isObj(v.names)) {
        Object.keys(v.names).slice(0, 150).forEach((k) => {
          const n = v.names[k];
          if (KEY_RE.test(k) && typeof n === 'string' && n.trim()) names[k] = n.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 60);
        });
      }
      out.sidebar[view] = { order: cleanKeys(v.order), names, hidden: cleanKeys(v.hidden) };
    });
    return out;
  }

  /* ---------------- resolving ---------------- */
  // Returns { id: value } for every setting, following '@ref' defaults.
  function resolve(cfg) {
    const vals = (cfg && cfg.values) || {};
    const out = {};
    function get(id, depth) {
      if (Object.prototype.hasOwnProperty.call(out, id)) return out[id];
      const t = TOKENS[id];
      if (!t || depth > 12) return undefined;
      let v = Object.prototype.hasOwnProperty.call(vals, id) ? vals[id] : t.def;
      if (typeof v === 'string' && v.charAt(0) === '@') v = get(v.slice(1), depth + 1);
      out[id] = v;
      return v;
    }
    R.ORDER.forEach((id) => get(id, 0));
    if (!out['type.headingFont']) out['type.headingFont'] = out['type.font'];
    return out;
  }

  // Values computed from other settings (used only in the template).
  const DERIVED = {
    'login.formWidth': (r) => fmtNum(r['login.layout'] === 'centered' ? 100 : 100 - r['login.split']) + 'vw',
    'login.cardPaddingX': (r) => fmtNum(Math.round(r['login.cardPadding'] * 0.875)) + 'px'
  };

  function format(id, r) {
    if (DERIVED[id]) return DERIVED[id](r);
    const t = TOKENS[id];
    const v = r[id];
    if (!t) return null;
    if (t.type === 'num') return fmtNum(v) + (t.unit || '');
    if (t.type === 'select') { const o = t.options.find((x) => x[0] === v); return o && o[2] ? o[2] : v; }
    if (t.type === 'font') return "'" + v + "'";
    return v;
  }

  /* ---------------- sections ---------------- */
  const sectionCache = {};
  function sections(template) {
    if (sectionCache.src === template) return sectionCache.list;
    const list = [];
    const re = /\/\*@section ([\w]+)\*\//g;
    let m, last = null;
    while ((m = re.exec(template))) {
      if (last) last.css = template.slice(last.start, m.index);
      last = { id: m[1], start: m.index + m[0].length };
      list.push(last);
    }
    if (last) last.css = template.slice(last.start);
    sectionCache.src = template; sectionCache.list = list;
    return list;
  }

  /* ---------------- CSS generation ---------------- */
  function fill(css, r, unknown) {
    return css.replace(/\[\[([\w.]+)(?:\/([\w.]+)|\*([\d.]+)([a-z%]*))?\]\]/g, (m, id, alpha, factor, unit) => {
      if (factor !== undefined) {
        const v = Number(r[id]);
        if (!isFinite(v)) { unknown.push(id); return m; }
        return fmtNum(v * Number(factor)) + unit;
      }
      if (alpha !== undefined) {
        const hex = r[id];
        const a = /^[\d.]+$/.test(alpha) ? alpha : (isFinite(Number(r[alpha])) ? fmtNum(Number(r[alpha])) : null);
        if (!isHex(hex) || a === null) { unknown.push(id); return m; }
        return rgba(hex, a);
      }
      const out = format(id, r);
      if (out === null || out === undefined) { unknown.push(id); return m; }
      return out;
    });
  }

  /* ---------------- chrome guard ----------------
     Rewrites every rule's selectors so they cannot match the switchyard
     chrome. Handles comments, strings, nested @media/@supports/@container/
     @layer blocks; leaves @keyframes, @font-face, @import as they are.
     Selectors that target our own elements or name the switchyard on
     purpose are left alone. */
  function scanTo(css, i, stops) {
    // Index of the first char in `stops` at depth 0 outside strings/comments, or css.length.
    let depth = 0;
    while (i < css.length) {
      const c = css[i];
      if (c === '/' && css[i + 1] === '*') { const e = css.indexOf('*/', i + 2); i = e < 0 ? css.length : e + 2; continue; }
      if (c === '"' || c === "'") { i++; while (i < css.length && css[i] !== c) { if (css[i] === '\\') i++; i++; } i++; continue; }
      if (depth === 0 && stops.indexOf(c) !== -1) return i;
      if (c === '(' || c === '[') depth++;
      else if ((c === ')' || c === ']') && depth > 0) depth--;
      i++;
    }
    return i;
  }
  function blockEnd(css, open) {
    // css[open] === '{'  ->  index of its matching '}'
    let depth = 0, i = open;
    while (i < css.length) {
      const c = css[i];
      if (c === '/' && css[i + 1] === '*') { const e = css.indexOf('*/', i + 2); i = e < 0 ? css.length : e + 2; continue; }
      if (c === '"' || c === "'") { i++; while (i < css.length && css[i] !== c) { if (css[i] === '\\') i++; i++; } i++; continue; }
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) return i; }
      i++;
    }
    return css.length;
  }
  const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
  const OWN = /irvex|\buc-|switchyard/i;
  function guardSelector(s) {
    s = s.trim();
    if (!s || OWN.test(s)) return s;
    // Insert before a trailing pseudo-element (::before, ::-webkit-x, legacy :before / :after).
    const m = s.match(/(::?(?:before|after|first-line|first-letter|placeholder|selection|marker|backdrop|-webkit-[\w-]+|-moz-[\w-]+)(?:\([^)]*\))?)$/i);
    if (m) return s.slice(0, s.length - m[1].length) + GUARD + m[1];
    return s + GUARD;
  }
  function guardList(prelude) {
    const parts = [];
    let i = 0;
    while (i <= prelude.length) {
      const j = scanTo(prelude, i, ',');
      parts.push(guardSelector(prelude.slice(i, j)));
      i = j + 1;
    }
    return parts.filter(Boolean).join(',');
  }
  function guardCss(css) {
    let out = '', i = 0;
    while (i < css.length) {
      const j = scanTo(css, i, '{;}');
      if (j >= css.length) { out += css.slice(i); break; }
      const prelude = stripComments(css.slice(i, j)).trim();
      if (css[j] === ';' || css[j] === '}') { out += css.slice(i, j + 1); i = j + 1; continue; }
      const end = blockEnd(css, j);
      const inner = css.slice(j + 1, end);
      if (prelude.charAt(0) === '@') {
        out += /^@(media|supports|container|layer|document|scope)\b/i.test(prelude)
          ? prelude + '{' + guardCss(inner) + '}'
          : prelude + '{' + inner + '}';
      } else if (/^(from|to|\d[\d.]*%)(\s*,\s*(from|to|\d[\d.]*%))*$/i.test(prelude)) {
        out += prelude + '{' + inner + '}';
      } else {
        out += guardList(prelude) + '{' + inner + '}';
      }
      out += '\n';
      i = end + 1;
    }
    return out;
  }

  function sel(k) {
    return k.indexOf('*.') === 0 ? '[id^="sb_"][id$=".' + cssEsc(k.slice(2)) + '"]' : '[id="' + cssEsc(k) + '"]';
  }

  function sidebarCss(cfg) {
    let css = '';
    ['agency', 'location'].forEach((view) => {
      const sb = cfg.sidebar[view];
      if (!sb) return;
      // Classic chrome: the links are direct children of the nav.
      const scope = '.sidebar-v2-' + view + ' ' + NAV;
      // New chrome: each top-level link or group sits in its own row.
      const sy = 'body:has(.sidebar-v2-' + view + ') #sidebar-v2 .switchyard-customizable-section';
      const row = (k) => sy + ' > .switchyard-managed-row:has(> ' + sel(k) + ')';
      if (sb.order && sb.order.length) {
        css += scope + '{display:flex!important;flex-direction:column!important}\n';
        css += scope + ' > *{order:1000}\n';
        css += scope + ' > .divider{display:none!important}\n';
        sb.order.forEach((k, i) => { css += scope + ' > a' + sel(k) + '{order:' + ((i + 1) * 10) + '!important}\n'; });
        css += sy + '{display:flex!important;flex-direction:column!important}\n';
        css += sy + ' > *{order:1000}\n';
        sb.order.forEach((k, i) => { css += row(k) + '{order:' + ((i + 1) * 10) + '!important}\n'; });
      }
      (sb.hidden || []).forEach((k) => {
        css += scope + ' > a' + sel(k) + '{display:none!important}\n';
        css += row(k) + '{display:none!important}\n';
        css += 'body:has(.sidebar-v2-' + view + ') .switchyard-flyout ' + sel(k) + '{display:none!important}\n';
      });
    });
    (cfg.hideSelectors || []).forEach((s) => { css += s + '{display:none!important}\n'; });
    return css;
  }

  // Rules for settings that switch behaviour on/off rather than fill a value.
  function extrasCss(r) {
    const c = [];
    const SB = 'aside,.sidebar-v2,#sidebar-v2,.hl_sidebar';
    if (r['sidebar.bgStyle'] === 'gradient') c.push(SB + '{background-image:linear-gradient(' + r['sidebar.angle'] + 'deg,' + r['sidebar.bg'] + ',' + r['sidebar.bg2'] + ')!important}');
    if (r['sidebar.edge']) c.push(SB + '{box-shadow:inset -1px 0 0 ' + rgba(r['sidebar.edgeColor'], 0.6) + ',4px 0 24px ' + rgba(r['sidebar.edgeColor'], 0.18) + '!important}');
    if (r['nav.activeBg']) {
      c.push(NAV + ' > a.active,' + NAV + ' > a.router-link-exact-active{background:' + rgba(r['nav.active'], 0.12) +
        '!important;border-radius:' + fmtNum(8 * r['fx.radius']) + 'px!important;box-shadow:inset 3px 0 0 ' + r['nav.active'] + '!important}');
    }
    if (r['header.btnRadius'] > 0) {
      c.push('.hl_header--controls a.btn,.hl_header--controls button,#hl_header--copilot-icon,#hl_header--help-icon,a.hl_header--recent-activities,a.btn-changelog,#template-power-dialer button{border-radius:' + r['header.btnRadius'] + 'px!important}');
    }
    if (!r['banner.animate']) c.push('#notification_banner-top_bar{animation:none!important}');
    if (!r['login.meshAnimate']) c.push('.hl_login--header{animation:none!important}');
    if (r['login.layout'] === 'centered') {
      c.push('@media (min-width: 993px){.hl_login{position:relative!important}' +
        '.hl_login--header{position:absolute!important;inset:0!important;width:100vw!important;box-shadow:none!important}' +
        '.hl_login--header .container-fluid{justify-content:flex-start!important;padding-top:5vh!important}' +
        '.hl_login--header img{max-height:min(' + r['login.logoMax'] + 'px,18vh)!important}' +
        '.hl_login--body{width:100vw!important;background-color:transparent!important;z-index:5!important;padding-top:18vh!important}}');
    }
    if (r['login.bgImage']) {
      const ov = rgba(r['login.bg'], r['login.bgOverlay']);
      c.push('.hl_login{background:linear-gradient(' + ov + ',' + ov + '),url("' + cssEsc(r['login.bgImage']) + '") center/cover no-repeat!important}' +
        '.hl_login--header,.hl_login--body{background-color:transparent!important}');
    }
    if (!r['login.logoGlass']) c.push('.hl_login--header img,.hl_login--header img:hover{background:transparent!important;border-color:transparent!important;box-shadow:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}');
    if (r['login.logoFloat']) c.push('.hl_login--header img{animation:floatLogo 6s ease-in-out infinite!important}');
    c.push('.uc-login-tagline{position:relative;z-index:10;margin-top:24px;text-align:center;font-family:' + format('type.headingFont', r) +
      ',sans-serif;font-weight:600;letter-spacing:.5px;color:' + r['login.taglineColor'] + ';font-size:' + r['login.taglineSize'] +
      'px;text-shadow:0 0 ' + fmtNum(12 * r['fx.glow']) + 'px ' + rgba(r['login.taglineColor'], 0.45) + ';max-width:80%}');
    if (!r['net.enabled']) c.push('#irvex-network-canvas{display:none!important}');
    else if (r['net.opacity'] < 1) c.push('#irvex-network-canvas{opacity:' + fmtNum(r['net.opacity']) + '}');
    if (!r['lnet.enabled']) c.push('#irvex-login-network-canvas{display:none!important}');
    if (!r['ripple.enabled']) c.push('.irvex-ripple-dynamic{display:none!important}');
    if (r['fx.reduceMotion']) c.push('*:not(.lds-ring):not(.lds-ring *),*::before,*::after{animation:none!important;transition:none!important}');
    return c.join('\n') + '\n';
  }

  /* Panel rules. `:is(sel)` keeps a selector list together; the two :not(#id)
     add (2,0,0) specificity so a picked panel beats the theme's own rules. */
  const BOOST = ':not(#uc-p1):not(#uc-p2)';
  function panelsCss(cfg) {
    let css = '';
    (cfg.panels || []).forEach((p) => {
      if (p.off) return;
      const v = (k) => (Object.prototype.hasOwnProperty.call(p, k) ? p[k] : PANEL_FIELDS[k].def);
      const S = ':is(' + p.sel + ')' + BOOST;
      const d = [];
      const a = v('bgA');
      if (v('bg')) d.push('background-color:' + (a < 1 ? rgba(v('bg'), fmtNum(a)) : v('bg')) + '!important');
      if (v('bg') && v('bg2')) {
        d.push('background-image:linear-gradient(' + fmtNum(v('angle')) + 'deg,' + rgba(v('bg'), fmtNum(a)) + ',' + rgba(v('bg2'), fmtNum(a)) + ')!important');
      }
      if (v('text')) d.push('color:' + v('text') + '!important');
      if (v('font')) d.push("font-family:'" + v('font') + "',sans-serif!important");
      if (v('border')) {
        d.push('border-color:' + v('border') + '!important');
        if (v('bw') > 0) d.push('border-width:' + fmtNum(v('bw')) + 'px!important;border-style:solid!important');
      }
      if (v('radius') >= 0) d.push('border-radius:' + fmtNum(v('radius')) + 'px!important');
      const sh = [];
      if (v('shadow')) sh.push(PANEL_SHADOWS[v('shadow')]);
      if (v('glow') && v('glowSize') > 0) sh.push('0 0 ' + fmtNum(v('glowSize')) + 'px ' + rgba(v('glow'), 0.55));
      if (sh.length) d.push('box-shadow:' + sh.join(',') + '!important');
      if (v('blur') > 0) d.push('backdrop-filter:blur(' + fmtNum(v('blur')) + 'px)!important;-webkit-backdrop-filter:blur(' + fmtNum(v('blur')) + 'px)!important');
      if (d.length) css += S + '{' + d.join(';') + '}\n';
      if (v('text') && v('inner')) {
        css += S + ' :where(*):not(input,textarea,select,option,[class*="badge"]){color:' + v('text') + '!important}\n';
        if (v('glow') && v('glowSize') > 0) css += S + ' :where(*){text-shadow:0 0 ' + fmtNum(v('glowSize') / 3) + 'px ' + rgba(v('glow'), 0.35) + '!important}\n';
      }
      if (v('hoverBg')) css += S + ':hover{background-color:' + rgba(v('hoverBg'), fmtNum(Math.max(a, 0.6))) + '!important}\n';
    });
    return css ? '\n/* ---- panels ---- */\n' + css : '';
  }

  // Behaviour switches for the new (switchyard) chrome. Paint only, never layout.
  function switchyardExtras(r) {
    const c = [];
    if (r['sidebar.bgStyle'] === 'gradient') c.push(SY + '{background-image:linear-gradient(' + r['sidebar.angle'] + 'deg,' + r['sidebar.bg'] + ',' + r['sidebar.bg2'] + ')!important}');
    if (r['sidebar.edge']) c.push(SY + '{box-shadow:inset -1px 0 0 ' + rgba(r['sidebar.edgeColor'], 0.6) + ',4px 0 24px ' + rgba(r['sidebar.edgeColor'], 0.18) + '!important}');
    if (r['nav.activeBg']) {
      c.push('#sidebar-v2 .switchyard-nav-item[aria-current="page"],#sidebar-v2 .switchyard-nav-item.router-link-exact-active,.switchyard-flyout .switchyard-nav-item[aria-current="page"]{background:' +
        rgba(r['nav.active'], 0.12) + '!important;border-radius:' + fmtNum(8 * r['fx.radius']) + 'px!important;box-shadow:inset 3px 0 0 ' + r['nav.active'] + '!important}');
    }
    if (r['header.btnRadius'] > 0) {
      c.push('.switchyard-topbar .switchyard-top-action,.switchyard-topbar .switchyard-top-ask-ai,.switchyard-topbar .switchyard-user-avatar{border-radius:' + r['header.btnRadius'] + 'px!important}');
    }
    return c.length ? c.join('\n') + '\n' : '';
  }

  function fontImport(r) {
    const fams = [r['type.font'], r['type.headingFont']]
      .filter((f, i, a) => f && a.indexOf(f) === i && R.SYSTEM_FONTS.indexOf(f) === -1);
    if (!fams.length) return '';
    return '@import url("https://fonts.googleapis.com/css2?' +
      fams.map((f) => 'family=' + encodeURIComponent(f).replace(/%20/g, '+') + ':wght@300;400;500;600;700;800').join('&') +
      '&display=swap");\n';
  }

  // Full stylesheet for a customer. @import must come first in a stylesheet.
  function compile(template, input, opts) {
    const cfg = sanitize(input);
    const r = resolve(cfg);
    const off = Object.assign({}, cfg.sections);
    if (r['content.mode'] === 'dark') { off.contentLight = false; off.contentLightText = false; }
    const unknown = [];
    // Master sections target the classic chrome: guard them away from the new one.
    // The 'switchyard' section is written for the new chrome and is used as is.
    const body = sections(template).filter((s) => off[s.id] !== false).map((s) => {
      const css = fill(s.css, r, unknown);
      return s.id === 'switchyard' ? css : guardCss(css);
    }).join('');
    if (opts && opts.unknown) opts.unknown.push.apply(opts.unknown, unknown);
    return fontImport(r) + body + '\n/* ---- settings ---- */\n' + guardCss(extrasCss(r)) +
      (off.switchyard !== false ? switchyardExtras(r) : '') + sidebarCss(cfg) + panelsCss(cfg) +
      (cfg.customCss ? '\n/* ---- custom CSS ---- */\n' + cfg.customCss + '\n' : '');
  }

  // Switch theme: palette + theme extras; section color tweaks follow the new palette.
  function applyTheme(input, themeId) {
    const cfg = sanitize(input);
    const th = R.THEMES.find((t) => t.id === themeId);
    if (!th) return cfg;
    // Colors and the theme's look settings are replaced; layout, text, menu and custom CSS stay.
    Object.keys(cfg.values).forEach((id) => { if (TOKENS[id].type === 'color' || R.THEME_KEYS.indexOf(id) !== -1) delete cfg.values[id]; });
    Object.assign(cfg.values, th.p, th.s || {});
    cfg.theme = th.id;
    return sanitize(cfg);
  }

  return {
    R, TOKENS, DEFAULTS, NAV, GUARD, guardCss, FONTS: R.FONTS, PANEL_FIELDS, MAX_PANELS, cleanPanel, panelsCss,
    clone, isHex, hexToRgb, rgbToHex, rgba,
    sanitize, resolve, compile, applyTheme, sections, sidebarCss
  };
});
