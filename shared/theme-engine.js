/* =====================================================================
   ULTIMATE CUSTOMIZER - THEME ENGINE (shared by server + browser)
   ---------------------------------------------------------------------
   Takes the master CSS and a customer config and produces the customer's
   CSS: every brand color (hex + rgba shades) is remapped, blur/radius are
   scaled, the font is swapped, and effect/sidebar rules are appended.
   Works as a CommonJS module (server) and as a browser global
   (window.UCThemeEngine) when bundled into customizer.js.
   ===================================================================== */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.UCThemeEngine = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const FONTS = ['Inter', 'Poppins', 'Montserrat', 'Roboto', 'Space Grotesk', 'DM Sans', 'Segoe UI'];
  const SYSTEM_FONTS = ['Inter', 'Segoe UI'];

  const DEFAULTS = {
    v: 1,
    colors: { navy: '#000414', cyan: '#00e5ff', teal: '#00ced1', gold: '#ffd700', light: '#f4f7fa', red: '#ff1e28' },
    fx: {
      network: true,         // sidebar particle network
      networkOpacity: 1,
      networkDensity: 1,     // multiplier on particle count
      loginNetwork: true,    // red & gold network on the login page
      ripple: true,          // click water-drop
      subaccountLogo: true,  // swap sidebar logo to the sub-account logo
      noGlow: false,
      noMotion: false,
      blur: 1,
      radius: 1,
      font: 'Inter'
    },
    hideSelectors: [],       // e.g. ["#sb_app-media", "#sb_memberships"]
    sidebar: {
      agency: { order: [], names: {}, hidden: [] },
      location: { order: [], names: {}, hidden: [] }
    }
  };

  // Base colors of the master CSS and the shades derived from them.
  const FAMILIES = {
    navy:  { base: [0, 4, 20],    derived: [[0, 10, 26], [0, 26, 51], [0, 30, 60]] },
    cyan:  { base: [0, 229, 255], derived: [] },
    teal:  { base: [0, 206, 209], derived: [] },
    gold:  { base: [255, 215, 0], derived: [[212, 175, 55]] },
    light: { base: [244, 247, 250], derived: [] },
    red:   { base: [255, 30, 40], derived: [] }
  };

  const NAV = '#sidebar-v2 nav[aria-label="header"]';

  /* ---------------- helpers ---------------- */
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
  const isHex = (s) => typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s);
  const clamp255 = (n) => Math.max(0, Math.min(255, Math.round(n)));
  const cssEsc = (s) => String(s).replace(/["\\]/g, '\\$&');

  function merge(base, over) {
    const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
    if (!isObj(over)) return out;
    for (const k in over) {
      if (!Object.prototype.hasOwnProperty.call(over, k) || k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      const b = base ? base[k] : undefined;
      out[k] = isObj(over[k]) && isObj(b) ? merge(b, over[k]) : over[k];
    }
    return out;
  }

  function hexToRgb(h) {
    h = String(h).replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const rgbToHex = (r, g, b) => '#' + [r, g, b].map((v) => clamp255(v).toString(16).padStart(2, '0')).join('');

  function num(v, def, min, max) {
    const n = Number(v);
    if (!isFinite(n)) return def;
    return Math.max(min, Math.min(max, n));
  }

  /* ---------------- config validation ---------------- */
  const KEY_RE = /^[\w*.:-]{1,160}$/;
  const SELECTOR_BAD = /[{}<>;@\\]|\/\*/;

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

    const c = isObj(src.colors) ? src.colors : {};
    Object.keys(out.colors).forEach((k) => { if (isHex(c[k])) out.colors[k] = c[k].toLowerCase(); });

    const f = isObj(src.fx) ? src.fx : {};
    ['network', 'loginNetwork', 'ripple', 'subaccountLogo', 'noGlow', 'noMotion'].forEach((k) => {
      if (typeof f[k] === 'boolean') out.fx[k] = f[k];
    });
    out.fx.networkOpacity = num(f.networkOpacity, out.fx.networkOpacity, 0, 1);
    out.fx.networkDensity = num(f.networkDensity, out.fx.networkDensity, 0.2, 2);
    out.fx.blur = num(f.blur, out.fx.blur, 0, 2);
    out.fx.radius = num(f.radius, out.fx.radius, 0, 2);
    if (typeof f.font === 'string' && /^[A-Za-z0-9 ]{1,40}$/.test(f.font)) out.fx.font = f.font;

    if (Array.isArray(src.hideSelectors)) {
      out.hideSelectors = src.hideSelectors
        .filter((s) => typeof s === 'string' && s.trim() && s.length <= 200 && !SELECTOR_BAD.test(s))
        .map((s) => s.trim())
        .slice(0, 40);
    }

    const sb = isObj(src.sidebar) ? src.sidebar : {};
    ['agency', 'location'].forEach((view) => {
      const v = isObj(sb[view]) ? sb[view] : {};
      const names = {};
      if (isObj(v.names)) {
        Object.keys(v.names).slice(0, 150).forEach((k) => {
          const n = v.names[k];
          if (KEY_RE.test(k) && typeof n === 'string' && n.trim()) names[k] = n.trim().slice(0, 60);
        });
      }
      out.sidebar[view] = { order: cleanKeys(v.order), names: names, hidden: cleanKeys(v.hidden) };
    });
    return out;
  }

  /* ---------------- CSS generation ---------------- */
  function buildColorMap(colors) {
    const map = {};
    for (const k in FAMILIES) {
      const f = FAMILIES[k];
      const to = hexToRgb(colors[k] || DEFAULTS.colors[k]);
      const d = to.map((v, i) => v - f.base[i]);
      if (!d.some(Boolean)) continue;
      map[f.base.join(',')] = to;
      f.derived.forEach((c) => { map[c.join(',')] = c.map((v, i) => clamp255(v + d[i])); });
    }
    return map;
  }

  function transformCss(css, cfg) {
    const map = buildColorMap(cfg.colors);
    let out = css;
    if (Object.keys(map).length) {
      out = out.replace(/#([0-9a-f]{6})(?![0-9a-f])/gi, (m, h) => {
        const t = map[hexToRgb(h).join(',')];
        return t ? rgbToHex(t[0], t[1], t[2]) : m;
      });
      out = out.replace(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?=\s*[,)])/gi, (m, r, g, b) => {
        const t = map[[+r, +g, +b].join(',')];
        return t ? 'rgba(' + t.join(', ') : m;
      });
    }
    const fx = cfg.fx;
    if (fx.blur !== 1) {
      out = out.replace(/blur\(\s*([\d.]+)px\s*\)/gi, (m, n) => 'blur(' + (parseFloat(n) * fx.blur).toFixed(1) + 'px)');
    }
    if (fx.radius !== 1) {
      out = out.replace(/border-radius\s*:[^;}]*/gi, (decl) =>
        decl.replace(/([\d.]+)px/g, (m, n) => (parseFloat(n) * fx.radius).toFixed(1) + 'px'));
    }
    if (fx.font && fx.font !== 'Inter') out = out.replace(/'Inter'/g, "'" + fx.font + "'");
    return out;
  }

  function sel(k) {
    return k.indexOf('*.') === 0
      ? '[id^="sb_"][id$=".' + cssEsc(k.slice(2)) + '"]'
      : '[id="' + cssEsc(k) + '"]';
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
    // one rule per selector so a single bad selector can't drop the others
    (cfg.hideSelectors || []).forEach((s) => { css += s + '{display:none!important}\n'; });
    return css;
  }

  function fxCss(cfg) {
    const f = cfg.fx;
    let c = '';
    if (!f.network) c += '#irvex-network-canvas{display:none!important}\n';
    else if (f.networkOpacity < 1) c += '#irvex-network-canvas{opacity:' + f.networkOpacity + '}\n';
    if (!f.loginNetwork) c += '#irvex-login-network-canvas{display:none!important}\n';
    if (!f.ripple) c += '.irvex-ripple-dynamic{display:none!important}\n';
    if (f.noGlow) c += '*{text-shadow:none!important}\n';
    if (f.noMotion) c += '*:not(.lds-ring):not(.lds-ring *),*::before,*::after{animation:none!important;transition:none!important}\n';
    return c;
  }

  function fontImport(cfg) {
    const font = cfg.fx.font;
    if (!font || SYSTEM_FONTS.indexOf(font) !== -1) return '';
    return '@import url("https://fonts.googleapis.com/css2?family=' + encodeURIComponent(font).replace(/%20/g, '+') +
      ':wght@400;500;600;700;800&display=swap");\n';
  }

  // Full stylesheet for a customer. @import must come first in a stylesheet.
  function compile(baseCss, cfg) {
    cfg = sanitize(cfg);
    return fontImport(cfg) + transformCss(baseCss, cfg) + '\n/* ---- effects & sidebar ---- */\n' + fxCss(cfg) + sidebarCss(cfg);
  }

  return {
    FONTS, SYSTEM_FONTS, DEFAULTS, FAMILIES, NAV,
    clone, merge, isHex, hexToRgb, rgbToHex,
    sanitize, buildColorMap, transformCss, sidebarCss, fxCss, fontImport, compile
  };
});
