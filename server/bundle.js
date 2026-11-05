'use strict';
/* Builds each agency's theme.css and customizer.js from the tokenized
   master CSS, the shared registry/engine, the client sources and the
   agency's config. Output is cached per (agency, config version, mode). */
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
  const template = read('server/assets/theme.template.css');
  const shared = ['shared/registry.js', 'shared/theme-engine.js', 'client/runtime.js'].map(read).join('\n');
  const full = ['client/effects.js', 'client/customizer.js'].map(read).join('\n');
  const setupOnly = read('client/customizer.js'); // setup mode: only the Connect button
  const cache = new Map();

  function cached(k, build) {
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

  // `brand` is the brand view the requesting domain uses (licensing.brandFor).
  function css(inst, brand) {
    return cached('css:' + inst.key + ':' + brand.id + ':' + brand.configVersion, () => {
      // @import (Google fonts) must stay the very first rule, so the banner goes after it.
      const compiled = engine.compile(template, brand.config);
      const m = compiled.match(/^@import[^\n]*\n/);
      return m ? m[0] + banner(inst) + compiled.slice(m[0].length) : banner(inst) + compiled;
    });
  }

  function js(inst, mode, brand) {
    return cached('js:' + inst.key + ':' + brand.id + ':' + brand.configVersion + ':' + mode + ':' + brand.name, () => {
      const boot = {
        mode,
        license: { key: inst.key, companyId: inst.companyId, base: cfg.baseUrl, name: inst.name || '' },
        brand: { id: brand.id, name: brand.name },
        version: brand.configVersion,
        config: mode === 'setup' ? engine.sanitize({}) : brand.config
      };
      return banner(inst) + '(function () {\n\'use strict\';\nif (window.__UC_LOADED) return;\nwindow.__UC_LOADED = true;\n' +
        'var UC_BOOT = ' + safeJson(boot) + ';\n' + shared + '\n' + (mode === 'setup' ? setupOnly : full) + '\n})();\n';
    });
  }

  // The brand's own JavaScript, as written in the editor (Advanced -> Custom JS).
  function customJs(inst, brand) {
    const code = brand.config.customJs || '';
    return banner(inst) + '/* brand: ' + String(brand.name).replace(/\*\//g, '') + ' */\n' + (code ? code + '\n' : '');
  }

  const inactiveCss = '/* Ultimate Customizer: no active license for this domain. */\n';
  const inactiveJs = '/* Ultimate Customizer: no active license for this agency. */\n' +
    'try{console.warn("[Ultimate Customizer] License inactive - effects disabled.")}catch(e){}\n';

  return { template, css, js, customJs, inactiveCss, inactiveJs };
}

module.exports = { createBundler, safeJson };
