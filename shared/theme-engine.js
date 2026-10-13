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
    customCss: ''
  };

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

  function sel(k) {
    return k.indexOf('*.') === 0 ? '[id^="sb_"][id$=".' + cssEsc(k.slice(2)) + '"]' : '[id="' + cssEsc(k) + '"]';
  }

  function sidebarCss(cfg) {
    let css = '';
    ['agency', 'location'].forEach((view) => {
      const sb = cfg.sidebar[view];
      if (!sb) return;
      const scope = '.sidebar-v2-' + view + ' ' + NAV;
      if (sb.order && sb.order.length) {
        css += scope + '{display:flex!important;flex-direction:column!important}\n';
        css += scope + ' > *{order:1000}\n';
        css += scope + ' > .divider{display:none!important}\n';
        sb.order.forEach((k, i) => { css += scope + ' > a' + sel(k) + '{order:' + ((i + 1) * 10) + '!important}\n'; });
      }
      (sb.hidden || []).forEach((k) => { css += scope + ' > a' + sel(k) + '{display:none!important}\n'; });
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
    const body = sections(template).filter((s) => off[s.id] !== false).map((s) => fill(s.css, r, unknown)).join('');
    if (opts && opts.unknown) opts.unknown.push.apply(opts.unknown, unknown);
    return fontImport(r) + body + '\n/* ---- settings ---- */\n' + extrasCss(r) + sidebarCss(cfg) +
      (cfg.customCss ? '\n/* ---- custom CSS ---- */\n' + cfg.customCss + '\n' : '');
  }

  // Switch theme: palette + theme extras; section color tweaks follow the new palette.
  function applyTheme(input, themeId) {
    const cfg = sanitize(input);
    const th = R.THEMES.find((t) => t.id === themeId);
    if (!th) return cfg;
    Object.keys(cfg.values).forEach((id) => { if (TOKENS[id].type === 'color' || id === 'fx.glow') delete cfg.values[id]; });
    Object.assign(cfg.values, th.p, th.s || {});
    cfg.theme = th.id;
    return sanitize(cfg);
  }

  return {
    R, TOKENS, DEFAULTS, NAV, FONTS: R.FONTS,
    clone, isHex, hexToRgb, rgbToHex, rgba,
    sanitize, resolve, compile, applyTheme, sections, sidebarCss
  };
});
