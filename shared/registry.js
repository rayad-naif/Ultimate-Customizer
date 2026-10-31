/* =====================================================================
   ULTIMATE CUSTOMIZER - SETTINGS REGISTRY
   Every customizable value in the theme. The CSS template references
   these ids as [[id]], the engine validates config against them, and the
   in-app customizer builds its controls from them automatically.

   Entry: [id, type, default, label, options]
     color  default '#rrggbb' or '@otherId' (follows another setting)
     num    options { min, max, step, unit }
     select options { options: [[value, label, cssValue?], ...] }
     bool | text { max } | url | font
   ===================================================================== */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.UCRegistry = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const num = (min, max, step, unit) => ({ min, max, step, unit: unit || '' });
  const sel = (...options) => ({ options });
  const WEIGHTS = sel(['300', 'Light'], ['400', 'Regular'], ['500', 'Medium'], ['600', 'Semibold'], ['700', 'Bold'], ['800', 'Extra bold']);
  const CASES = sel(['none', 'As written'], ['capitalize', 'Capitalize'], ['uppercase', 'UPPERCASE'], ['lowercase', 'lowercase']);

  const FONTS = ['Inter', 'Poppins', 'Montserrat', 'Roboto', 'Open Sans', 'Lato', 'Nunito', 'Raleway', 'Space Grotesk',
    'DM Sans', 'Outfit', 'Sora', 'Manrope', 'Plus Jakarta Sans', 'Urbanist', 'Rajdhani', 'Orbitron', 'Exo 2', 'Segoe UI'];
  const SYSTEM_FONTS = ['Segoe UI'];

  /* Tabs and the sub-sections inside them (order = UI order). */
  const GROUPS = [
    { id: 'palette', label: 'Colors', subs: ['Brand palette'] },
    { id: 'sidebar', label: 'Sidebar', subs: ['Background', 'Menu text', 'Network animation'] },
    { id: 'header', label: 'Header', subs: ['Header buttons', 'Avatar', 'Profile dropdown', 'Badges & pills'] },
    { id: 'nav', label: 'Navigation', subs: ['Top tabs', 'Location switcher', 'Notification banner'] },
    { id: 'content', label: 'Content', subs: ['Mode', 'Cards', 'Text', 'Inputs', 'Buttons', 'Toggles & alerts', 'Page wrapper & headings'] },
    { id: 'login', label: 'Login page', subs: ['Layout', 'Background', 'Logo', 'Form card', 'Fields & buttons', 'Text', 'Network animation'] },
    { id: 'effects', label: 'Effects', subs: ['Typography', 'Glass & shape', 'Motion', 'Click ripple', 'Loader', 'Sub-account logo'] }
  ];

  const T = [
    /* ---------------- palette ---------------- */
    ['base', 'color', '#000414', 'Base background', { sub: 'Brand palette', hint: 'Sidebar, login, loader, dark text on light' }],
    ['surface', 'color', '#000a1a', 'Glass surface', { sub: 'Brand palette', hint: 'Header buttons, dropdowns, cards (dark)' }],
    ['surfaceAlt', 'color', '#001a33', 'Field surface', { sub: 'Brand palette', hint: 'Inputs and search boxes' }],
    ['surfaceDeep', 'color', '#001e3c', 'Deep tone', { sub: 'Brand palette', hint: 'Banner edges, focused fields' }],
    ['primary', 'color', '#00e5ff', 'Primary accent', { sub: 'Brand palette', hint: 'Links, borders, glows' }],
    ['secondary', 'color', '#00ced1', 'Secondary accent', { sub: 'Brand palette', hint: 'Labels, active menu, form borders' }],
    ['highlight', 'color', '#ffd700', 'Highlight', { sub: 'Brand palette', hint: 'Hover, active tab, badges' }],
    ['highlightDark', 'color', '#d4af37', 'Highlight (on light)', { sub: 'Brand palette' }],
    ['text', 'color', '#e6f7ff', 'Text on dark', { sub: 'Brand palette' }],
    ['textBright', 'color', '#ffffff', 'Bright text', { sub: 'Brand palette' }],
    ['textMuted', 'color', '#8ab4f8', 'Muted text', { sub: 'Brand palette' }],
    ['textOnLight', 'color', '#000414', 'Text on light', { sub: 'Brand palette' }],
    ['lightSurface', 'color', '#f4f7fa', 'Light surface', { sub: 'Brand palette' }],
    ['loginAccent', 'color', '#ff1e28', 'Login accent', { sub: 'Brand palette', hint: 'Login grid, orbs and network' }],

    /* ---------------- sidebar ---------------- */
    ['sidebar.bg', 'color', '@base', 'Background', { sub: 'Background' }],
    ['sidebar.bgStyle', 'select', 'solid', 'Fill style', { sub: 'Background', ...sel(['solid', 'Solid'], ['gradient', 'Gradient']) }],
    ['sidebar.bg2', 'color', '@surfaceDeep', 'Gradient end', { sub: 'Background' }],
    ['sidebar.angle', 'num', 180, 'Gradient angle', { sub: 'Background', ...num(0, 360, 5, 'deg') }],
    ['sidebar.edge', 'bool', false, 'Glowing right edge', { sub: 'Background' }],
    ['sidebar.edgeColor', 'color', '@secondary', 'Edge color', { sub: 'Background' }],
    ['nav.text', 'color', '@text', 'Menu text', { sub: 'Menu text' }],
    ['nav.hover', 'color', '@primary', 'Hover text', { sub: 'Menu text' }],
    ['nav.active', 'color', '@secondary', 'Active item text', { sub: 'Menu text' }],
    ['nav.glow', 'color', '@primary', 'Glow color', { sub: 'Menu text' }],
    ['nav.glow2', 'color', '@secondary', 'Hover glow (outer)', { sub: 'Menu text' }],
    ['nav.fontSize', 'num', 14, 'Font size', { sub: 'Menu text', ...num(11, 20, 0.5, 'px') }],
    ['nav.fontWeight', 'select', '500', 'Weight', { sub: 'Menu text', ...WEIGHTS }],
    ['nav.activeWeight', 'select', '700', 'Active weight', { sub: 'Menu text', ...WEIGHTS }],
    ['nav.letterSpacing', 'num', 0.5, 'Letter spacing', { sub: 'Menu text', ...num(0, 3, 0.1, 'px') }],
    ['nav.transform', 'select', 'capitalize', 'Letter case', { sub: 'Menu text', ...CASES }],
    ['nav.hoverShift', 'num', 5, 'Hover slide', { sub: 'Menu text', ...num(0, 20, 1, 'px') }],
    ['nav.activeBg', 'bool', false, 'Highlight active item background', { sub: 'Menu text' }],
    ['net.enabled', 'bool', true, 'Show network', { sub: 'Network animation' }],
    ['net.node', 'color', '@primary', 'Node color', { sub: 'Network animation' }],
    ['net.link', 'color', '@secondary', 'Line color', { sub: 'Network animation' }],
    ['net.accent', 'color', '@highlight', 'Accent nodes', { sub: 'Network animation' }],
    ['net.accentRatio', 'num', 0.15, 'Accent share', { sub: 'Network animation', ...num(0, 1, 0.05) }],
    ['net.count', 'num', 150, 'Particles', { sub: 'Network animation', ...num(10, 300, 5) }],
    ['net.speed', 'num', 0.8, 'Speed', { sub: 'Network animation', ...num(0, 4, 0.1) }],
    ['net.linkDist', 'num', 90, 'Link distance', { sub: 'Network animation', ...num(20, 200, 5, 'px') }],
    ['net.mouse', 'num', 160, 'Mouse reach', { sub: 'Network animation', ...num(0, 300, 10, 'px') }],
    ['net.lineWidth', 'num', 1.2, 'Line width', { sub: 'Network animation', ...num(0.2, 4, 0.1, 'px') }],
    ['net.nodeSize', 'num', 1.5, 'Node size', { sub: 'Network animation', ...num(0.5, 5, 0.1, 'px') }],
    ['net.opacity', 'num', 1, 'Opacity', { sub: 'Network animation', ...num(0, 1, 0.05) }],

    /* ---------------- header ---------------- */
    ['header.btnBg', 'color', '@surface', 'Button background', { sub: 'Header buttons' }],
    ['header.btnBorder', 'color', '@secondary', 'Button border', { sub: 'Header buttons' }],
    ['header.icon', 'color', '@primary', 'Icon color', { sub: 'Header buttons' }],
    ['header.hoverBg', 'color', '@primary', 'Hover tint', { sub: 'Header buttons' }],
    ['header.hoverBorder', 'color', '@primary', 'Hover border', { sub: 'Header buttons' }],
    ['header.hoverIcon', 'color', '@highlight', 'Hover icon', { sub: 'Header buttons' }],
    ['header.lift', 'num', 2, 'Hover lift', { sub: 'Header buttons', ...num(0, 10, 1, 'px') }],
    ['header.btnRadius', 'num', 0, 'Button roundness (0 = CRM default)', { sub: 'Header buttons', ...num(0, 30, 1, 'px') }],
    ['avatar.border', 'color', '@primary', 'Border', { sub: 'Avatar' }],
    ['avatar.text', 'color', '@primary', 'Initials', { sub: 'Avatar' }],
    ['avatar.bg1', 'color', '@surfaceAlt', 'Background top', { sub: 'Avatar' }],
    ['avatar.bg2', 'color', '@base', 'Background bottom', { sub: 'Avatar' }],
    ['avatar.hover', 'color', '@highlight', 'Hover color', { sub: 'Avatar' }],
    ['dropdown.bg', 'color', '@surface', 'Background', { sub: 'Profile dropdown' }],
    ['dropdown.opacity', 'num', 0.85, 'Background opacity', { sub: 'Profile dropdown', ...num(0.3, 1, 0.05) }],
    ['dropdown.border', 'color', '@secondary', 'Border', { sub: 'Profile dropdown' }],
    ['dropdown.name', 'color', '@text', 'Name', { sub: 'Profile dropdown' }],
    ['dropdown.email', 'color', '@secondary', 'Email', { sub: 'Profile dropdown' }],
    ['dropdown.item', 'color', '@primary', 'Menu items', { sub: 'Profile dropdown' }],
    ['dropdown.itemHover', 'color', '@highlight', 'Item hover', { sub: 'Profile dropdown' }],
    ['dropdown.itemHoverBg', 'color', '@primary', 'Item hover tint', { sub: 'Profile dropdown' }],
    ['dropdown.indent', 'num', 30, 'Hover indent', { sub: 'Profile dropdown', ...num(24, 50, 1, 'px') }],
    ['dropdown.radius', 'num', 16, 'Corner radius', { sub: 'Profile dropdown', ...num(0, 30, 1, 'px') }],
    ['badge.color', 'color', '@highlight', 'Notification badges', { sub: 'Badges & pills' }],
    ['badge.border', 'color', '@base', 'Badge outline', { sub: 'Badges & pills' }],
    ['pill.start', 'color', '@secondary', '"Get started" pill start', { sub: 'Badges & pills' }],
    ['pill.end', 'color', '@primary', '"Get started" pill end', { sub: 'Badges & pills' }],
    ['pill.text', 'color', '@base', '"Get started" pill text', { sub: 'Badges & pills' }],

    /* ---------------- navigation ---------------- */
    ['topnav.bg', 'color', '@surface', 'Bar background', { sub: 'Top tabs' }],
    ['topnav.opacity', 'num', 0.7, 'Bar opacity', { sub: 'Top tabs', ...num(0, 1, 0.05) }],
    ['topnav.border', 'color', '@secondary', 'Bottom border', { sub: 'Top tabs' }],
    ['topnav.title', 'color', '@textBright', 'Section title', { sub: 'Top tabs' }],
    ['topnav.titleGlow', 'color', '@primary', 'Title glow', { sub: 'Top tabs' }],
    ['topnav.titleCase', 'select', 'uppercase', 'Title case', { sub: 'Top tabs', ...CASES }],
    ['topnav.tab', 'color', '@secondary', 'Tab text', { sub: 'Top tabs' }],
    ['topnav.tabHover', 'color', '@primary', 'Tab hover', { sub: 'Top tabs' }],
    ['topnav.active', 'color', '@highlight', 'Active tab', { sub: 'Top tabs' }],
    ['topnav.underline', 'num', 3, 'Underline thickness', { sub: 'Top tabs', ...num(1, 8, 1, 'px') }],
    ['switcher.bg', 'color', '@base', 'Background', { sub: 'Location switcher' }],
    ['switcher.border', 'color', '@secondary', 'Border', { sub: 'Location switcher' }],
    ['switcher.title', 'color', '@primary', 'Account names', { sub: 'Location switcher' }],
    ['switcher.subtext', 'color', '@textMuted', 'Addresses', { sub: 'Location switcher' }],
    ['switcher.accent', 'color', '@primary', 'Hover accent', { sub: 'Location switcher' }],
    ['switcher.icon', 'color', '@secondary', 'Icons', { sub: 'Location switcher' }],
    ['switcher.searchBg', 'color', '@surfaceAlt', 'Search background', { sub: 'Location switcher' }],
    ['switcher.searchText', 'color', '@primary', 'Search text', { sub: 'Location switcher' }],
    ['banner.start', 'color', '@surfaceDeep', 'Gradient edges', { sub: 'Notification banner' }],
    ['banner.mid', 'color', '@secondary', 'Gradient center', { sub: 'Notification banner' }],
    ['banner.text', 'color', '@textBright', 'Text', { sub: 'Notification banner' }],
    ['banner.linkHover', 'color', '@highlight', 'Link hover', { sub: 'Notification banner' }],
    ['banner.border', 'color', '@primary', 'Border & icons', { sub: 'Notification banner' }],
    ['banner.closeBg', 'color', '@base', 'Close button', { sub: 'Notification banner' }],
    ['banner.animate', 'bool', true, 'Animated shimmer', { sub: 'Notification banner' }],
    ['banner.speed', 'num', 8, 'Shimmer duration', { sub: 'Notification banner', ...num(2, 30, 1, 's') }],

    /* ---------------- content ---------------- */
    ['content.mode', 'select', 'light', 'Content theme', { sub: 'Mode', ...sel(['light', 'Light cards'], ['dark', 'Dark cards']) }],
    ['content.cardBg', 'color', '#ffffff', 'Card background (light)', { sub: 'Cards' }],
    ['content.cardOpacity', 'num', 0.75, 'Card opacity', { sub: 'Cards', ...num(0.2, 1, 0.05) }],
    ['content.cardBorder', 'color', '@secondary', 'Card border', { sub: 'Cards' }],
    ['content.cardHover', 'color', '@secondary', 'Card hover border', { sub: 'Cards' }],
    ['content.headerBg', 'color', '@lightSurface', 'Card header / footer', { sub: 'Cards' }],
    ['content.headerText', 'color', '@secondary', 'Card header title', { sub: 'Cards' }],
    ['content.cardRadius', 'num', 12, 'Card radius', { sub: 'Cards', ...num(0, 32, 1, 'px') }],
    ['content.text', 'color', '@textOnLight', 'Text', { sub: 'Text' }],
    ['content.label', 'color', '@textOnLight', 'Form labels', { sub: 'Text' }],
    ['content.icon', 'color', '@secondary', 'Icons', { sub: 'Text' }],
    ['content.asterisk', 'color', '@highlight', 'Required asterisk', { sub: 'Text' }],
    ['content.inputBg', 'color', '#ffffff', 'Field background', { sub: 'Inputs' }],
    ['content.inputBorder', 'color', '@secondary', 'Field border', { sub: 'Inputs' }],
    ['content.inputText', 'color', '@textOnLight', 'Typed text', { sub: 'Inputs' }],
    ['content.caret', 'color', '@secondary', 'Cursor', { sub: 'Inputs' }],
    ['content.inputRadius', 'num', 6, 'Field radius', { sub: 'Inputs', ...num(0, 24, 1, 'px') }],
    ['content.btnBg', 'color', '@base', 'Primary button', { sub: 'Buttons' }],
    ['content.btnText', 'color', '@primary', 'Primary button text', { sub: 'Buttons' }],
    ['content.btnBorder', 'color', '@primary', 'Primary button border', { sub: 'Buttons' }],
    ['content.btnHoverBg', 'color', '@highlight', 'Primary hover', { sub: 'Buttons' }],
    ['content.btnHoverText', 'color', '@base', 'Primary hover text', { sub: 'Buttons' }],
    ['content.btn2', 'color', '@secondary', 'Secondary buttons', { sub: 'Buttons' }],
    ['content.btn2Hover', 'color', '@primary', 'Secondary hover (dark mode)', { sub: 'Buttons' }],
    ['content.btnRadius', 'num', 8, 'Button radius', { sub: 'Buttons', ...num(0, 30, 1, 'px') }],
    ['content.btnLift', 'num', 2, 'Hover lift', { sub: 'Buttons', ...num(0, 10, 1, 'px') }],
    ['content.check', 'color', '@secondary', 'Checkboxes & switches', { sub: 'Toggles & alerts' }],
    ['content.alert', 'color', '@highlight', 'Alert boxes', { sub: 'Toggles & alerts' }],
    ['content.alertIcon', 'color', '@highlightDark', 'Alert icon', { sub: 'Toggles & alerts' }],
    ['content.alertLink', 'color', '@secondary', 'Alert links', { sub: 'Toggles & alerts' }],
    ['wrapper.bg', 'color', '@lightSurface', 'Page wrapper', { sub: 'Page wrapper & headings' }],
    ['wrapper.border', 'color', '@secondary', 'Wrapper border', { sub: 'Page wrapper & headings' }],
    ['wrapper.text', 'color', '@textOnLight', 'Wrapper text', { sub: 'Page wrapper & headings' }],
    ['wrapper.padding', 'num', 24, 'Wrapper padding', { sub: 'Page wrapper & headings', ...num(0, 60, 2, 'px') }],
    ['heading.c1', 'color', '@secondary', 'Heading gradient start', { sub: 'Page wrapper & headings' }],
    ['heading.c2', 'color', '@primary', 'Heading gradient middle', { sub: 'Page wrapper & headings' }],
    ['heading.c3', 'color', '@highlight', 'Heading gradient end', { sub: 'Page wrapper & headings' }],
    ['heading.weight', 'select', '800', 'Heading weight', { sub: 'Page wrapper & headings', ...WEIGHTS }],

    /* ---------------- login ---------------- */
    ['login.layout', 'select', 'form-left', 'Layout', { sub: 'Layout', ...sel(['form-left', 'Form left, logo right', 'row-reverse'], ['form-right', 'Form right, logo left', 'row'], ['centered', 'Centered form over background', 'column']) }],
    ['login.split', 'num', 50, 'Logo panel width', { sub: 'Layout', ...num(30, 70, 1, 'vw') }],
    ['login.primary', 'color', '@primary', 'Login primary', { sub: 'Background', hint: 'Lets the login page use its own colors' }],
    ['login.secondary', 'color', '@secondary', 'Login secondary', { sub: 'Background' }],
    ['login.highlight', 'color', '@highlight', 'Login highlight', { sub: 'Background' }],
    ['login.bg', 'color', '@base', 'Page background', { sub: 'Background' }],
    ['login.orb1', 'color', '@loginAccent', 'Glow orb 1', { sub: 'Background' }],
    ['login.orb2', 'color', '@highlight', 'Glow orb 2', { sub: 'Background' }],
    ['login.grid1', 'color', '@loginAccent', 'Grid lines (horizontal)', { sub: 'Background' }],
    ['login.grid2', 'color', '@highlight', 'Grid lines (vertical)', { sub: 'Background' }],
    ['login.gridSize', 'num', 45, 'Grid size', { sub: 'Background', ...num(10, 120, 1) }],
    ['login.meshAnimate', 'bool', true, 'Animate background', { sub: 'Background' }],
    ['login.meshSpeed', 'num', 15, 'Background animation duration', { sub: 'Background', ...num(3, 60, 1, 's') }],
    ['login.bgImage', 'url', '', 'Background image URL (https)', { sub: 'Background' }],
    ['login.bgOverlay', 'num', 0.6, 'Image darkening', { sub: 'Background', ...num(0, 1, 0.05) }],
    ['login.logoMax', 'num', 220, 'Logo max height', { sub: 'Logo', ...num(60, 400, 5, 'px') }],
    ['login.logoPadding', 'num', 35, 'Logo padding', { sub: 'Logo', ...num(0, 80, 1, 'px') }],
    ['login.logoRadius', 'num', 20, 'Logo radius', { sub: 'Logo', ...num(0, 60, 1, 'px') }],
    ['login.logoGlass', 'bool', true, 'Glass frame behind logo', { sub: 'Logo' }],
    ['login.logoLift', 'num', 10, 'Hover lift', { sub: 'Logo', ...num(0, 30, 1, 'px') }],
    ['login.logoFloat', 'bool', false, 'Gentle floating animation', { sub: 'Logo' }],
    ['login.cardBg', 'color', '@surface', 'Card background', { sub: 'Form card' }],
    ['login.cardOpacity', 'num', 0.8, 'Card opacity', { sub: 'Form card', ...num(0, 1, 0.05) }],
    ['login.cardBorder', 'color', '@login.primary', 'Card border', { sub: 'Form card' }],
    ['login.cardRadius', 'num', 24, 'Card radius', { sub: 'Form card', ...num(0, 40, 1, 'px') }],
    ['login.cardBlur', 'num', 20, 'Card blur', { sub: 'Form card', ...num(0, 40, 1, 'px') }],
    ['login.cardWidth', 'num', 450, 'Card width', { sub: 'Form card', ...num(320, 640, 10, 'px') }],
    ['login.cardPadding', 'num', 40, 'Card padding', { sub: 'Form card', ...num(16, 70, 1, 'px') }],
    ['login.glow', 'color', '@login.secondary', 'Glow behind card', { sub: 'Form card' }],
    ['login.heading', 'color', '@login.primary', 'Heading color', { sub: 'Fields & buttons' }],
    ['login.label', 'color', '@login.secondary', 'Labels', { sub: 'Fields & buttons' }],
    ['login.inputBg', 'color', '@surfaceAlt', 'Field background', { sub: 'Fields & buttons' }],
    ['login.inputText', 'color', '@login.primary', 'Field text', { sub: 'Fields & buttons' }],
    ['login.inputRadius', 'num', 8, 'Field radius', { sub: 'Fields & buttons', ...num(0, 30, 1, 'px') }],
    ['login.btnStart', 'color', '@login.secondary', 'Button gradient start', { sub: 'Fields & buttons' }],
    ['login.btnEnd', 'color', '@login.primary', 'Button gradient end', { sub: 'Fields & buttons' }],
    ['login.btnText', 'color', '@base', 'Button text', { sub: 'Fields & buttons' }],
    ['login.btnCase', 'select', 'uppercase', 'Button text case', { sub: 'Fields & buttons', ...CASES }],
    ['login.btnRadius', 'num', 8, 'Button radius', { sub: 'Fields & buttons', ...num(0, 30, 1, 'px') }],
    ['login.link', 'color', '@login.highlight', 'Links', { sub: 'Fields & buttons' }],
    ['login.linkHover', 'color', '@login.primary', 'Link hover', { sub: 'Fields & buttons' }],
    ['login.headingText', 'text', '', 'Replace heading text', { sub: 'Text', max: 80, hint: 'Leave empty to keep the CRM’s text' }],
    ['login.tagline', 'text', '', 'Tagline under the logo', { sub: 'Text', max: 120 }],
    ['login.taglineColor', 'color', '@login.primary', 'Tagline color', { sub: 'Text' }],
    ['login.taglineSize', 'num', 18, 'Tagline size', { sub: 'Text', ...num(10, 40, 1, 'px') }],
    ['lnet.enabled', 'bool', true, 'Show network', { sub: 'Network animation' }],
    ['lnet.node', 'color', '@loginAccent', 'Node color', { sub: 'Network animation' }],
    ['lnet.accent', 'color', '@login.highlight', 'Accent nodes', { sub: 'Network animation' }],
    ['lnet.accentRatio', 'num', 0.5, 'Accent share', { sub: 'Network animation', ...num(0, 1, 0.05) }],
    ['lnet.count', 'num', 120, 'Particles', { sub: 'Network animation', ...num(10, 300, 5) }],
    ['lnet.speed', 'num', 0.8, 'Speed', { sub: 'Network animation', ...num(0, 4, 0.1) }],
    ['lnet.linkDist', 'num', 100, 'Link distance', { sub: 'Network animation', ...num(20, 200, 5, 'px') }],
    ['lnet.mouse', 'num', 180, 'Mouse reach', { sub: 'Network animation', ...num(0, 300, 10, 'px') }],

    /* ---------------- effects ---------------- */
    ['type.font', 'font', 'Inter', 'Font family', { sub: 'Typography', hint: 'Any Google Font name works' }],
    ['type.headingFont', 'font', '', 'Heading font (optional)', { sub: 'Typography' }],
    ['fx.glow', 'num', 1, 'Neon glow strength', { sub: 'Glass & shape', ...num(0, 3, 0.1) }],
    ['fx.blur', 'num', 1, 'Glass blur strength', { sub: 'Glass & shape', ...num(0, 3, 0.1) }],
    ['fx.radius', 'num', 1, 'Global roundness', { sub: 'Glass & shape', ...num(0, 3, 0.1) }],
    ['fx.speed', 'num', 1, 'Transition duration', { sub: 'Motion', ...num(0, 3, 0.1), hint: '1 = original, 0 = instant' }],
    ['fx.reduceMotion', 'bool', false, 'Reduce motion everywhere', { sub: 'Motion' }],
    ['ripple.enabled', 'bool', true, 'Click ripple', { sub: 'Click ripple' }],
    ['ripple.color', 'color', '@primary', 'Inner color', { sub: 'Click ripple' }],
    ['ripple.color2', 'color', '@secondary', 'Outer color', { sub: 'Click ripple' }],
    ['ripple.size', 'num', 80, 'Size', { sub: 'Click ripple', ...num(20, 200, 5, 'px') }],
    ['ripple.scale', 'num', 4, 'Spread', { sub: 'Click ripple', ...num(1, 10, 0.5) }],
    ['ripple.duration', 'num', 1.2, 'Duration', { sub: 'Click ripple', ...num(0.3, 4, 0.1, 's') }],
    ['loader.bg', 'color', '@base', 'Background', { sub: 'Loader' }],
    ['loader.bg2', 'color', '@surfaceAlt', 'Center glow', { sub: 'Loader' }],
    ['loader.ring1', 'color', '@primary', 'Ring 1', { sub: 'Loader' }],
    ['loader.ring2', 'color', '@secondary', 'Ring 2', { sub: 'Loader' }],
    ['loader.ring3', 'color', '@highlight', 'Ring 3', { sub: 'Loader' }],
    ['loader.speed', 'num', 1.2, 'Spin duration', { sub: 'Loader', ...num(0.4, 4, 0.1, 's') }],
    ['loader.thickness', 'num', 4, 'Ring thickness', { sub: 'Loader', ...num(1, 12, 1, 'px') }],
    ['sublogo.enabled', 'bool', true, 'Show each sub-account’s logo in the sidebar', { sub: 'Sub-account logo' }],
    ['sublogo.height', 'num', 45, 'Logo height', { sub: 'Sub-account logo', ...num(20, 120, 1, 'px') }],
    ['sublogo.glow', 'color', '@primary', 'Logo glow', { sub: 'Sub-account logo' }]
  ];

  // Tab of each setting, by id prefix (palette ids have no prefix).
  const PREFIX_GROUP = {
    sidebar: 'sidebar', nav: 'sidebar', net: 'sidebar',
    header: 'header', avatar: 'header', dropdown: 'header', badge: 'header', pill: 'header',
    topnav: 'nav', switcher: 'nav', banner: 'nav',
    content: 'content', wrapper: 'content', heading: 'content',
    login: 'login', lnet: 'login',
    type: 'effects', fx: 'effects', ripple: 'effects', loader: 'effects', sublogo: 'effects'
  };
  const TOKENS = {};
  const ORDER = [];
  T.forEach((t) => {
    const o = t[4] || {};
    const group = t[0].indexOf('.') === -1 ? 'palette' : PREFIX_GROUP[t[0].split('.')[0]];
    const g = GROUPS.find((x) => x.id === group);
    if (!g || g.subs.indexOf(o.sub) === -1) throw new Error('Registry: ' + t[0] + ' has no valid tab/section');
    TOKENS[t[0]] = Object.assign({}, o, { id: t[0], type: t[1], def: t[2], label: t[3], group });
    ORDER.push(t[0]);
  });

  /* Master CSS sections (ids match the /*@section id*\/ markers in the template). */
  const SECTIONS = [
    ['sidebar', 'Sidebar background'], ['ripple', 'Click ripple'], ['nav', 'Sidebar menu text'], ['switcher', 'Location switcher'],
    ['banner', 'Notification banner'], ['login', 'Login page'], ['header', 'Header buttons, avatar & dropdown'], ['topnav', 'Top navigation tabs'],
    ['loader', 'Loading screen'], ['sublogo', 'Sub-account logo'], ['wrapper', 'Page wrapper & headings'], ['patches', 'Structure patches'],
    ['contentDark', 'Content (dark base)'], ['contentLight', 'Content (light)'], ['contentLightText', 'Light text fixes'],
    ['switchyard', 'New HighLevel navigation']
  ];

  /* Prebuilt themes: palette + optional extra settings. */
  const THEMES = [
    { id: 'irvex', name: 'IRVEX Cyan & Gold', p: {} },
    { id: 'violet-nova', name: 'Violet Nova', p: { base: '#0b0420', surface: '#140a2e', surfaceAlt: '#1d1040', surfaceDeep: '#24124d', primary: '#b388ff', secondary: '#7c4dff', highlight: '#ff80ab', highlightDark: '#d81b60', text: '#efe7ff', textMuted: '#b9a6e8', textOnLight: '#1a0b33', lightSurface: '#f6f3fb', loginAccent: '#ff4081' } },
    { id: 'emerald', name: 'Emerald Executive', p: { base: '#02140d', surface: '#062119', surfaceAlt: '#0a2d22', surfaceDeep: '#0d3a2b', primary: '#2ee6a6', secondary: '#12b886', highlight: '#e6c35c', highlightDark: '#b8962e', text: '#e6fff5', textMuted: '#8fd1b5', textOnLight: '#02140d', lightSurface: '#f3f8f5', loginAccent: '#ff5a4d' } },
    { id: 'crimson', name: 'Crimson Night', p: { base: '#14040a', surface: '#1f0710', surfaceAlt: '#2b0a17', surfaceDeep: '#3a0d1f', primary: '#ff4d6d', secondary: '#e11d48', highlight: '#ffb703', highlightDark: '#d48c00', text: '#ffe8ec', textMuted: '#e7a1ae', textOnLight: '#14040a', lightSurface: '#faf4f5', loginAccent: '#ff1e28' } },
    { id: 'ocean', name: 'Ocean Blue', p: { base: '#020a1f', surface: '#06122e', surfaceAlt: '#0a1c42', surfaceDeep: '#0e2554', primary: '#4cc9f0', secondary: '#3a86ff', highlight: '#ffd166', highlightDark: '#d9a520', text: '#e7f3ff', textMuted: '#9db9e8', textOnLight: '#020a1f', lightSurface: '#f2f6fc', loginAccent: '#ef476f' } },
    { id: 'midnight-gold', name: 'Midnight Gold', p: { base: '#0a0a0a', surface: '#141414', surfaceAlt: '#1e1e1e', surfaceDeep: '#262626', primary: '#f5c451', secondary: '#c9a227', highlight: '#fff1c1', highlightDark: '#a8841f', text: '#f7f1e3', textMuted: '#c8b98e', textOnLight: '#111111', lightSurface: '#faf7ef', loginAccent: '#c9a227' } },
    { id: 'sunset', name: 'Sunset Coral', p: { base: '#1a0b12', surface: '#26101a', surfaceAlt: '#331623', surfaceDeep: '#451c2c', primary: '#ff8a65', secondary: '#ff5e7e', highlight: '#ffd36e', highlightDark: '#e0a72e', text: '#fff0ea', textMuted: '#f0b3a6', textOnLight: '#2a0f19', lightSurface: '#fff6f2', loginAccent: '#ff5e7e' } },
    { id: 'matrix', name: 'Matrix Green', p: { base: '#000a02', surface: '#021306', surfaceAlt: '#041d0a', surfaceDeep: '#06280e', primary: '#39ff14', secondary: '#00c853', highlight: '#ccff00', highlightDark: '#8fb300', text: '#e5ffe0', textMuted: '#8fd88a', textOnLight: '#001a05', lightSurface: '#f2faf2', loginAccent: '#00c853' } },
    { id: 'cyberpunk', name: 'Cyberpunk', p: { base: '#0d0221', surface: '#160536', surfaceAlt: '#1f074a', surfaceDeep: '#2a0a5e', primary: '#ff2a6d', secondary: '#05d9e8', highlight: '#f9f002', highlightDark: '#c2b800', text: '#f5e9ff', textMuted: '#b8a5e3', textOnLight: '#0d0221', lightSurface: '#f7f3ff', loginAccent: '#ff2a6d' } },
    { id: 'royal', name: 'Royal Purple & Gold', p: { base: '#120726', surface: '#1b0c38', surfaceAlt: '#25124a', surfaceDeep: '#30185e', primary: '#c39bff', secondary: '#9d4edd', highlight: '#ffc300', highlightDark: '#cc9c00', text: '#f3ebff', textMuted: '#bfa8e6', textOnLight: '#160a2e', lightSurface: '#f7f4fc', loginAccent: '#9d4edd' } },
    { id: 'rose', name: 'Rose Quartz', p: { base: '#1c0f14', surface: '#28161d', surfaceAlt: '#351e27', surfaceDeep: '#442632', primary: '#f7a8c4', secondary: '#e37fa4', highlight: '#ffe0b2', highlightDark: '#d9a86a', text: '#fff0f5', textMuted: '#e3b3c4', textOnLight: '#2a141d', lightSurface: '#fff7fa', loginAccent: '#e37fa4' } },
    { id: 'graphite', name: 'Graphite Mono', p: { base: '#0e0f11', surface: '#17191c', surfaceAlt: '#202328', surfaceDeep: '#2a2e34', primary: '#e8eaed', secondary: '#9aa0a6', highlight: '#ffffff', highlightDark: '#5f6368', text: '#f1f3f4', textMuted: '#9aa0a6', textOnLight: '#202124', lightSurface: '#f8f9fa', loginAccent: '#9aa0a6' }, s: { 'fx.glow': 0.3 } },
    { id: 'solar', name: 'Solar Orange', p: { base: '#140a00', surface: '#1f1102', surfaceAlt: '#2b1804', surfaceDeep: '#3a2006', primary: '#ffa630', secondary: '#ff7b00', highlight: '#ffe066', highlightDark: '#d9a400', text: '#fff4e5', textMuted: '#e6be8a', textOnLight: '#1f1100', lightSurface: '#fff9f0', loginAccent: '#ff7b00' } },
    { id: 'arctic', name: 'Arctic Light', p: { base: '#eef3f8', surface: '#ffffff', surfaceAlt: '#e3ebf3', surfaceDeep: '#d4e1ee', primary: '#0077ff', secondary: '#00a3c4', highlight: '#ff6b35', highlightDark: '#e0551f', text: '#0f2233', textBright: '#0f2233', textMuted: '#5a7184', textOnLight: '#0f2233', lightSurface: '#f7fafc', loginAccent: '#0077ff' }, s: { 'fx.glow': 0.2, 'login.btnText': '#ffffff', 'pill.text': '#ffffff', 'content.btnHoverText': '#ffffff' } },
    { id: 'blush', name: 'Blush Light', p: { base: '#fdf2f5', surface: '#ffffff', surfaceAlt: '#f9e4ea', surfaceDeep: '#f3d3dd', primary: '#d6336c', secondary: '#ae3ec9', highlight: '#f59f00', highlightDark: '#d9480f', text: '#3b1a26', textBright: '#3b1a26', textMuted: '#8c5b6c', textOnLight: '#3b1a26', lightSurface: '#fffafb', loginAccent: '#d6336c' }, s: { 'fx.glow': 0.2, 'login.btnText': '#ffffff', 'pill.text': '#ffffff', 'content.btnHoverText': '#ffffff' } },
    { id: 'forest', name: 'Forest Copper', p: { base: '#0b1410', surface: '#121f19', surfaceAlt: '#1a2b23', surfaceDeep: '#22382e', primary: '#7bd389', secondary: '#4f9d69', highlight: '#e08e45', highlightDark: '#b86a26', text: '#ecf7ef', textMuted: '#a3c4ad', textOnLight: '#0b1410', lightSurface: '#f4f8f5', loginAccent: '#e08e45' } }
  ];

  THEMES.push(
    { id: 'aurora', name: 'Aurora Borealis', p: { base: '#020d14', surface: '#06161f', surfaceAlt: '#0a2230', surfaceDeep: '#0d2c3d', primary: '#5ef2c9', secondary: '#7b61ff', highlight: '#c3f73a', highlightDark: '#8db51f', text: '#e8fff8', textMuted: '#93c9c0', textOnLight: '#04121a', lightSurface: '#f2fbf9', loginAccent: '#7b61ff' } },
    { id: 'carbon-red', name: 'Carbon Racing', p: { base: '#0b0b0d', surface: '#141417', surfaceAlt: '#1d1d22', surfaceDeep: '#26262d', primary: '#ff3b30', secondary: '#c7c7cc', highlight: '#ffcc00', highlightDark: '#cc9f00', text: '#f2f2f7', textMuted: '#a1a1aa', textOnLight: '#111113', lightSurface: '#f7f7f8', loginAccent: '#ff3b30' } },
    { id: 'sapphire-light', name: 'Sapphire Light', p: { base: '#f3f6fb', surface: '#ffffff', surfaceAlt: '#e6ecf5', surfaceDeep: '#d7e1ef', primary: '#2f5bea', secondary: '#4f7cff', highlight: '#00b894', highlightDark: '#00876c', text: '#14213d', textBright: '#14213d', textMuted: '#5b6b85', textOnLight: '#14213d', lightSurface: '#f8fafd', loginAccent: '#2f5bea' }, s: { 'login.btnText': '#ffffff', 'pill.text': '#ffffff', 'content.btnHoverText': '#ffffff' } },
    { id: 'lavender-light', name: 'Lavender Mist', p: { base: '#f6f3fc', surface: '#ffffff', surfaceAlt: '#ece6f8', surfaceDeep: '#ded4f2', primary: '#7c3aed', secondary: '#a78bfa', highlight: '#ec4899', highlightDark: '#be185d', text: '#2e1065', textBright: '#2e1065', textMuted: '#6b5b95', textOnLight: '#2e1065', lightSurface: '#fbf9ff', loginAccent: '#7c3aed' }, s: { 'login.btnText': '#ffffff', 'pill.text': '#ffffff', 'content.btnHoverText': '#ffffff' } }
  );

  /* Each theme's look beyond color: sidebar, menu, fonts, shape, motion, login. */
  const THEME_LOOK = {
    'violet-nova': { 'sidebar.bgStyle': 'gradient', 'sidebar.angle': 160, 'sidebar.edge': true, 'nav.activeBg': true, 'login.logoFloat': true, 'type.font': 'Space Grotesk', 'fx.radius': 1.2 },
    emerald: { 'type.font': 'Manrope', 'nav.activeBg': true, 'sidebar.edge': true, 'fx.glow': 0.6, 'login.cardRadius': 18 },
    crimson: { 'sidebar.bgStyle': 'gradient', 'sidebar.angle': 200, 'type.headingFont': 'Rajdhani', 'lnet.count': 160, 'login.gridSize': 36 },
    ocean: { 'sidebar.bgStyle': 'gradient', 'fx.radius': 1.3, 'type.font': 'Plus Jakarta Sans', 'login.logoFloat': true, 'net.speed': 0.6 },
    'midnight-gold': { 'type.font': 'Raleway', 'type.headingFont': 'Montserrat', 'nav.transform': 'uppercase', 'nav.letterSpacing': 1.5, 'nav.fontSize': 12.5, 'fx.glow': 0.5, 'sidebar.edge': true, 'net.count': 90, 'login.cardRadius': 14 },
    sunset: { 'sidebar.bgStyle': 'gradient', 'sidebar.angle': 135, 'type.font': 'Nunito', 'fx.radius': 1.5, 'login.logoFloat': true, 'login.cardRadius': 30 },
    matrix: { 'type.font': 'Exo 2', 'type.headingFont': 'Orbitron', 'fx.radius': 0.4, 'net.count': 220, 'net.speed': 1.4, 'lnet.speed': 1.4, 'nav.activeBg': true, 'login.gridSize': 30, 'login.meshSpeed': 8, 'login.cardRadius': 6 },
    cyberpunk: { 'type.headingFont': 'Orbitron', 'type.font': 'Rajdhani', 'fx.radius': 0.3, 'sidebar.edge': true, 'fx.glow': 1.6, 'nav.transform': 'uppercase', 'nav.letterSpacing': 1.2, 'login.meshSpeed': 9, 'login.cardRadius': 4 },
    royal: { 'type.headingFont': 'Montserrat', 'sidebar.bgStyle': 'gradient', 'nav.activeBg': true, 'login.logoFloat': true },
    rose: { 'type.font': 'DM Sans', 'fx.radius': 1.6, 'fx.glow': 0.5, 'login.cardRadius': 32, 'sidebar.bgStyle': 'gradient' },
    graphite: { 'fx.glow': 0.3, 'net.count': 80, 'net.speed': 0.4, 'lnet.count': 70, 'fx.radius': 0.8, 'nav.activeBg': true },
    solar: { 'type.font': 'Outfit', 'sidebar.bgStyle': 'gradient', 'sidebar.angle': 200, 'sidebar.edge': true },
    arctic: { 'fx.glow': 0.2, 'sidebar.edge': true, 'nav.activeBg': true, 'type.font': 'Plus Jakarta Sans', 'net.count': 90 },
    blush: { 'fx.glow': 0.2, 'type.font': 'Urbanist', 'fx.radius': 1.5, 'nav.activeBg': true },
    forest: { 'type.font': 'Sora', 'sidebar.bgStyle': 'gradient', 'sidebar.angle': 170, 'fx.glow': 0.6, 'login.logoFloat': true },
    aurora: { 'sidebar.bgStyle': 'gradient', 'sidebar.angle': 150, 'sidebar.edge': true, 'type.font': 'Outfit', 'login.logoFloat': true, 'fx.glow': 1.3 },
    'carbon-red': { 'type.font': 'Rajdhani', 'type.headingFont': 'Exo 2', 'fx.radius': 0.5, 'nav.transform': 'uppercase', 'nav.letterSpacing': 1, 'nav.activeBg': true, 'net.speed': 1.6, 'fx.glow': 0.7 },
    'sapphire-light': { 'fx.glow': 0.15, 'nav.activeBg': true, 'type.font': 'Manrope', 'net.count': 80, 'fx.radius': 1.2 },
    'lavender-light': { 'fx.glow': 0.2, 'nav.activeBg': true, 'type.font': 'Poppins', 'fx.radius': 1.4, 'login.logoFloat': true }
  };
  THEMES.forEach((th) => { th.s = Object.assign({}, THEME_LOOK[th.id] || {}, th.s || {}); });
  // Settings a theme controls; switching themes resets them before applying the new one.
  const THEME_KEYS = [];
  THEMES.forEach((th) => Object.keys(th.s).forEach((k) => { if (THEME_KEYS.indexOf(k) === -1) THEME_KEYS.push(k); }));

  return { GROUPS, TOKENS, ORDER, SECTIONS, THEMES, THEME_KEYS, FONTS, SYSTEM_FONTS };
});
