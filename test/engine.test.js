'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const E = require('../shared/theme-engine');

const base = fs.readFileSync(path.join(__dirname, '..', 'server', 'assets', 'base.css'), 'utf8');

test('default config leaves the master CSS colors untouched', () => {
  const out = E.compile(base, {});
  assert.ok(out.includes('#000414'));
  assert.ok(out.includes('rgba(0, 229, 255, 0.5)'));
});

test('colors remap hex, rgba and derived shades', () => {
  const out = E.compile(base, { colors: { navy: '#101010', cyan: '#ff0000' } });
  assert.ok(!/#000414/i.test(out));
  assert.ok(!/#00e5ff/i.test(out));
  assert.ok(!out.includes('rgba(0, 229, 255'));
  assert.ok(out.includes('rgba(255, 0, 0, 0.5)'));
  // derived navy shade (0,10,26) shifts by the same delta (+16,+12,-4)
  assert.ok(out.includes('rgba(16, 22, 22'));
});

test('sanitize rejects injection attempts', () => {
  const c = E.sanitize({
    colors: { navy: 'red;}body{display:none' },
    fx: { font: "x');}*{display:none}", blur: 'NaN', radius: 99 },
    hideSelectors: ['#ok', 'a{}', '</style>', 'div;x', '@import x'],
    sidebar: { agency: { order: ['sb_ok', 'bad"]{}'], names: { sb_ok: '  New name  ', 'x{': 'y' }, hidden: [42] } },
    __proto__: { polluted: true }
  });
  assert.strictEqual(c.colors.navy, '#000414');
  assert.strictEqual(c.fx.font, 'Inter');
  assert.strictEqual(c.fx.blur, 1);
  assert.strictEqual(c.fx.radius, 2);
  assert.deepStrictEqual(c.hideSelectors, ['#ok']);
  assert.deepStrictEqual(c.sidebar.agency.order, ['sb_ok']);
  assert.deepStrictEqual(c.sidebar.agency.names, { sb_ok: 'New name' });
  assert.deepStrictEqual(c.sidebar.agency.hidden, []);
  assert.strictEqual({}.polluted, undefined);
});

test('effects, sidebar and font rules are emitted', () => {
  const out = E.compile(base, {
    fx: { network: false, ripple: false, noGlow: true, font: 'Poppins' },
    hideSelectors: ['#sb_app-media'],
    sidebar: { location: { order: ['sb_dashboard', '*.custom'], hidden: ['sb_reporting'] } }
  });
  assert.ok(out.startsWith('@import url("https://fonts.googleapis.com/css2?family=Poppins'));
  assert.ok(out.includes("'Poppins'"));
  assert.ok(out.includes('#irvex-network-canvas{display:none!important}'));
  assert.ok(out.includes('.irvex-ripple-dynamic{display:none!important}'));
  assert.ok(out.includes('#sb_app-media{display:none!important}'));
  assert.ok(out.includes('.sidebar-v2-location #sidebar-v2 nav[aria-label="header"] > a[id="sb_dashboard"]{order:10!important}'));
  assert.ok(out.includes('[id^="sb_"][id$=".custom"]{order:20!important}'));
  assert.ok(out.includes('a[id="sb_reporting"]{display:none!important}'));
});
