'use strict';
/* Builds each agency's theme.css and customizer.js from the master CSS,
   the shared engine, the client sources and the agency's config. */
const fs = require('fs');
const path = require('path');
const engine = require('../shared/theme-engine');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// Safe to drop inside a <script>: no "</script>", no line separators.
const safeJson = (v) => JSON.stringify(v)
  .replace(/</g, '\\u003c').replace(/>/g, '\\u003e')
  .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

function createBundler(cfg) {
  const baseCss = read('server/assets/base.css');
  const sources = ['shared/theme-engine.js', 'client/runtime.js', 'client/effects.js', 'client/customizer.js'].map(read).join('\n');
  const cache = new Map();

  function cached(kind, inst, build) {
    const k = kind + ':' + inst.key + ':' + inst.configVersion;
    let v = cache.get(k);
    if (v === undefined) {
      v = build();
      if (cache.size > 500) cache.clear();
      cache.set(k, v);
    }
    return v;
  }

  const banner = (inst) => '/*! Ultimate Customizer | licensed to ' +
    String(inst.name || inst.companyId).replace(/\*\//g, '') + ' (' + inst.companyId + ') */\n';

  function css(inst) {
    return cached('css', inst, () => {
      // @import (Google font) must stay the very first rule, so the banner goes after it.
      const compiled = engine.compile(baseCss, inst.config);
      const m = compiled.match(/^@import[^\n]*\n/);
      return m ? m[0] + banner(inst) + compiled.slice(m[0].length) : banner(inst) + compiled;
    });
  }

  function js(inst) {
    return cached('js', inst, () => {
      const boot = { license: { key: inst.key, companyId: inst.companyId, base: cfg.baseUrl }, config: inst.config };
      return banner(inst) + '(function () {\n\'use strict\';\nif (window.__UC_LOADED) return;\nwindow.__UC_LOADED = true;\n' +
        'var UC_BOOT = ' + safeJson(boot) + ';\n' + sources + '\n})();\n';
    });
  }

  const inactiveCss = '/* Ultimate Customizer: no active license for this agency. */\n';
  const inactiveJs = '/* Ultimate Customizer: no active license for this agency. */\n' +
    'try{console.warn("[Ultimate Customizer] License inactive - effects disabled.")}catch(e){}\n';

  return { baseCss, css, js, inactiveCss, inactiveJs };
}

module.exports = { createBundler, safeJson };
