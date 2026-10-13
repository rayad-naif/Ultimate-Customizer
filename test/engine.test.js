'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const E = require('../shared/theme-engine');
const R = require('../shared/registry');

const tpl = fs.readFileSync(path.join(__dirname, '..', 'server', 'assets', 'theme.template.css'), 'utf8');
const compile = (cfg) => { const unknown = []; const css = E.compile(tpl, cfg, { unknown }); assert.deepStrictEqual(unknown, []); return css; };

test('defaults reproduce the IRVEX master design', () => {
  const css = compile({});
  assert.ok(css.startsWith('@import url("https://fonts.googleapis.com/css2?family=Inter'));
  assert.ok(css.includes('background-color: #000414 !important; /* Deep Space Navy */'));
  assert.ok(css.includes('rgba(0, 229, 255, 0.5) 0%, rgba(0, 206, 209, 0.15) 40%'));
  assert.ok(css.includes("font-family: 'Inter', 'Segoe UI', Roboto"));
  assert.ok(css.includes('backdrop-filter: blur(16px) !important;'));
  assert.ok(css.includes('rgba(255, 255, 255, 0.75)'));
  assert.ok(!css.includes('[['), 'no placeholders left');
});

test('registry is consistent', () => {
  const r = E.resolve({});
  R.ORDER.forEach((id) => {
    const t = R.TOKENS[id];
    assert.ok(t.group && t.sub, id + ' has a group');
    if (t.type === 'color') assert.ok(E.isHex(r[id]), id + ' resolves to a color');
    if (t.type === 'num') assert.ok(r[id] >= t.min && r[id] <= t.max, id + ' default in range');
  });
  R.THEMES.forEach((th) => {
    Object.keys(th.p).concat(Object.keys(th.s || {})).forEach((k) => assert.ok(R.TOKENS[k], th.id + ' uses known setting ' + k));
    const css = compile(E.applyTheme({}, th.id));
    assert.ok(css.length > 30000);
  });
  assert.ok(R.ORDER.length > 150);
});

test('palette changes flow into every section that follows it', () => {
  const css = compile({ values: { primary: '#ff0000', base: '#101010', textOnLight: '#202020' } });
  assert.ok(!/#00e5ff/i.test(css) && !css.includes('rgba(0, 229, 255'));
  assert.ok(!/#000414/i.test(css));
  assert.ok(css.includes('rgba(255, 0, 0, 0.5)'));
  // A section override wins over the palette.
  const css2 = compile({ values: { primary: '#ff0000', 'nav.hover': '#00ff00' } });
  assert.ok(css2.includes('color: #00ff00 !important;'));
});

test('sanitize rejects bad values and injection attempts', () => {
  const c = E.sanitize({
    values: {
      base: 'red;}body{display:none', 'nav.fontSize': 999, 'nav.transform': 'evil', 'type.font': "x');}*{",
      'login.bgImage': 'https://x.com/a.png") ;}*{display:none', 'login.headingText': '<script>hi</script>', 'fx.blur': 'NaN', nope: 1
    },
    hideSelectors: ['#ok', 'a{}', '</style>', 'div;x'],
    customCss: '</style><script>alert(1)</script> .x{color:red}',
    sections: { loader: false, bogus: false },
    sidebar: { agency: { order: ['sb_ok', 'bad"]{}'], names: { sb_ok: '  New  ' } } },
    __proto__: { polluted: true }
  });
  assert.deepStrictEqual(c.values, { 'nav.fontSize': 20, 'login.headingText': 'scripthi/script' });
  assert.deepStrictEqual(c.hideSelectors, ['#ok']);
  assert.ok(!c.customCss.includes('<'));
  assert.deepStrictEqual(c.sections, { loader: false });
  assert.deepStrictEqual(c.sidebar.agency.order, ['sb_ok']);
  assert.deepStrictEqual(c.sidebar.agency.names, { sb_ok: 'New' });
  assert.strictEqual({}.polluted, undefined);
});

test('themes replace colors but keep layout and text settings', () => {
  const start = E.sanitize({ values: { 'nav.hover': '#123456', 'login.layout': 'centered', 'login.tagline': 'Hi' } });
  const t = E.applyTheme(start, 'violet-nova');
  assert.strictEqual(t.theme, 'violet-nova');
  assert.strictEqual(t.values['nav.hover'], undefined);
  assert.strictEqual(t.values['login.layout'], 'centered');
  assert.strictEqual(t.values['login.tagline'], 'Hi');
  assert.strictEqual(E.resolve(t)['nav.hover'], '#b388ff');
});

test('switches, sections and extras', () => {
  const css = compile({
    values: {
      'content.mode': 'dark', 'login.layout': 'centered', 'login.bgImage': 'https://cdn.example.com/bg.jpg',
      'net.enabled': false, 'ripple.enabled': false, 'sidebar.bgStyle': 'gradient', 'type.font': 'Poppins', 'type.headingFont': 'Orbitron'
    },
    sections: { loader: false },
    hideSelectors: ['#sb_app-media'],
    customCss: '.mine{color:red}',
    sidebar: { location: { order: ['sb_dashboard', '*.custom'], hidden: ['sb_reporting'] } }
  });
  assert.ok(css.startsWith('@import url("https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800&family=Orbitron'));
  assert.ok(!css.includes('LIGHT THEME - BUSINESS SETTINGS'), 'dark mode drops light sections');
  assert.ok(!css.includes('lds-ring div:nth-child'), 'loader section off');
  assert.ok(css.includes('url("https://cdn.example.com/bg.jpg")'));
  assert.ok(css.includes('.hl_login--header{position:absolute!important'));
  assert.ok(css.includes('#irvex-network-canvas{display:none!important}'));
  assert.ok(css.includes('.irvex-ripple-dynamic{display:none!important}'));
  assert.ok(css.includes('background-image:linear-gradient(180deg,#000414,#001e3c)'));
  assert.ok(css.includes('#sb_app-media{display:none!important}'));
  assert.ok(css.includes('a[id="sb_dashboard"]{order:10!important}'));
  assert.ok(css.includes('[id^="sb_"][id$=".custom"]{order:20!important}'));
  assert.ok(css.trim().endsWith('.mine{color:red}'));
});
