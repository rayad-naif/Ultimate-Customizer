'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const E = require('../shared/theme-engine');
const R = require('../shared/registry');
const GUARD = E.GUARD;

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
  // Themes carry their own sidebar/login/font look...
  assert.strictEqual(E.resolve(t)['sidebar.bgStyle'], 'gradient');
  assert.strictEqual(E.resolve(t)['login.logoFloat'], true);
  // ...which is cleared when switching to a theme without it.
  const back = E.applyTheme(t, 'irvex');
  assert.strictEqual(E.resolve(back)['sidebar.bgStyle'], 'solid');
  assert.strictEqual(E.resolve(back)['type.font'], 'Inter');
  assert.strictEqual(back.values['login.layout'], 'centered');
  assert.ok(R.THEMES.length >= 20);
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
  assert.ok(css.includes('.hl_login--header' + GUARD + '{position:absolute!important'), 'classic rules are guarded');
  assert.ok(css.includes('#irvex-network-canvas{display:none!important}'));
  assert.ok(css.includes('.irvex-ripple-dynamic{display:none!important}'));
  assert.ok(css.includes('background-image:linear-gradient(180deg,#000414,#001e3c)'));
  assert.ok(css.includes('#sb_app-media{display:none!important}'));
  assert.ok(css.includes('a[id="sb_dashboard"]{order:10!important}'));
  assert.ok(css.includes('[id^="sb_"][id$=".custom"]{order:20!important}'));
  assert.ok(css.trim().endsWith('.mine{color:red}'));
  // New navigation: same sidebar settings, written for the switchyard rows
  assert.ok(css.includes('body:has(.sidebar-v2-location) #sidebar-v2 .switchyard-customizable-section > .switchyard-managed-row:has(> [id="sb_dashboard"]){order:10!important}'));
  assert.ok(css.includes('.switchyard-managed-row:has(> [id="sb_reporting"]){display:none!important}'));
  assert.ok(css.includes('.switchyard-sidebar{background-image:linear-gradient(180deg,#000414,#001e3c)'));
});

test('classic rules never reach the new navigation; the new one is themed separately', () => {
  const { guardCss } = require('../shared/theme-engine');
  // Selector lists, pseudo-elements, @media nesting, keyframes, comments and strings
  const out = guardCss('/* note, with } brace */\n.a,.b>p::before{content:"x,{y}"}\n@media (min-width:1px){.c:hover{color:red}}\n@keyframes k{from{opacity:0}50%{opacity:.5}to{opacity:1}}\n#irvex-x,.uc-y{display:none}\n.switchyard-nav-label{color:red}');
  assert.ok(out.includes('.a' + GUARD + ',.b>p' + GUARD + '::before{content:"x,{y}"}'));
  assert.ok(out.includes('@media (min-width:1px){.c:hover' + GUARD + '{color:red}'));
  assert.ok(out.includes('@keyframes k{from{opacity:0}50%{opacity:.5}to{opacity:1}}'));
  assert.ok(out.includes('#irvex-x,.uc-y{display:none}'), 'own elements are not guarded');
  assert.ok(out.includes('.switchyard-nav-label{color:red}'), 'switchyard selectors are not guarded');

  const css = compile({});
  // Every master rule body is guarded: no bare .hr-wrapper-container rule left
  assert.ok(!/(^|[,}\s]).hr-wrapper-container(\s[a-z0-9]+)?[{,]/m.test(css));
  // The new navigation is themed, and that section can be switched off
  assert.ok(css.includes('.switchyard-account-menu [class*="account-menu__action"]'));
  assert.ok(css.includes('.switchyard-nav-item .switchyard-nav-label'));
  assert.ok(!compile({ sections: { switchyard: false } }).includes('.switchyard-account-menu'));
});
