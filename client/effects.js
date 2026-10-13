/* =====================================================================
   EFFECTS  (bundled into customizer.js; reads live config from UC.active)
   Ported from the IRVEX master JS. Colors come from the customer config,
   so the canvases always match the generated CSS.
   ===================================================================== */
/* global UC */
(function UCEffects() {
  'use strict';

  function rgba(hex, a) {
    const c = UC.engine.hexToRgb(hex);
    return 'rgba(' + c[0] + ', ' + c[1] + ', ' + c[2] + ', ' + a + ')';
  }
  function mix(h1, h2) {
    const a = UC.engine.hexToRgb(h1), b = UC.engine.hexToRgb(h2);
    return UC.engine.rgbToHex((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  }
  const fx = () => UC.active.fx;
  const colors = () => UC.active.colors;

  /* ------------------------------------------------------------------
     Generic particle network on a canvas inside `container`.
     opts: { id, baseCount, density(), enabled(), linkDist, linkFade,
             mouseDist, mouseFade, linkWidth, mouseWidth, accentChance,
             nodeColor(p), linkColor(p, p2), mouseColor(p) }
  ------------------------------------------------------------------ */
  function createNetwork(container, opts) {
    const canvas = document.createElement('canvas');
    canvas.id = opts.id;
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.zIndex = '0';
    canvas.style.pointerEvents = 'none';
    container.insertBefore(canvas, container.firstChild);

    const ctx = canvas.getContext('2d');
    let width = 0, height = 0;
    const ro = new ResizeObserver(() => {
      width = canvas.width = container.offsetWidth;
      height = canvas.height = container.offsetHeight;
    });
    ro.observe(container);

    const particles = [];
    const spawn = () => ({
      x: Math.random() * (width || 300),
      y: Math.random() * (height || 1000),
      vx: (Math.random() - 0.5) * 0.8,
      vy: (Math.random() - 0.5) * 0.8,
      radius: Math.random() * 1.5 + 0.5,
      accent: Math.random() < opts.accentChance
    });

    const mouse = { x: null, y: null };
    const onMove = (e) => {
      const r = container.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
    };
    const onLeave = () => { mouse.x = null; mouse.y = null; };
    container.addEventListener('mousemove', onMove);
    container.addEventListener('mouseleave', onLeave);

    let raf = 0;
    function stop() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      container.removeEventListener('mousemove', onMove);
      container.removeEventListener('mouseleave', onLeave);
      canvas.remove();
    }

    function frame() {
      // GHL re-rendered the container or the license was killed: clean up.
      if (UC.killed || !canvas.isConnected || !container.isConnected) { stop(); return; }
      raf = requestAnimationFrame(frame);
      ctx.clearRect(0, 0, width, height);
      if (!opts.enabled()) return;

      const want = Math.max(10, Math.round(opts.baseCount * opts.density()));
      while (particles.length < want) particles.push(spawn());
      if (particles.length > want) particles.length = want;

      const n = particles.length;
      for (let i = 0; i < n; i++) {
        const p = particles[i];
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > width) p.vx *= -1;
        if (p.y < 0 || p.y > height) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = opts.nodeColor(p);
        ctx.fill();

        for (let j = i + 1; j < n; j++) {
          const p2 = particles[j];
          const dx = p.x - p2.x, dy = p.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < opts.linkDist) {
            ctx.beginPath();
            ctx.strokeStyle = opts.linkColor(p, p2, 0.7 - dist / opts.linkFade);
            ctx.lineWidth = opts.linkWidth;
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
        }

        if (mouse.x !== null) {
          const dx = p.x - mouse.x, dy = p.y - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < opts.mouseDist) {
            ctx.beginPath();
            ctx.strokeStyle = opts.mouseColor(p, 0.95 - dist / opts.mouseFade);
            ctx.lineWidth = opts.mouseWidth;
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(mouse.x, mouse.y);
            ctx.stroke();
          }
        }
      }
    }
    frame();
    return { stop };
  }

  /* ------------------------------------------------------------------
     1. SIDEBAR NETWORK (cyan/teal + gold)
  ------------------------------------------------------------------ */
  function initSidebarNetwork() {
    const sidebar = document.querySelector('aside, .sidebar-v2, #sidebar-v2, .hl_sidebar');
    if (!sidebar || document.getElementById('irvex-network-canvas')) return;
    createNetwork(sidebar, {
      id: 'irvex-network-canvas',
      baseCount: 150,
      density: () => fx().networkDensity,
      enabled: () => fx().network,
      accentChance: 0.15,
      linkDist: 90, linkFade: 130, linkWidth: 1.2,
      mouseDist: 160, mouseFade: 170, mouseWidth: 1.8,
      nodeColor: (p) => rgba(p.accent ? colors().gold : colors().cyan, 0.9),
      linkColor: (p, p2, a) => rgba(p.accent || p2.accent ? colors().gold : colors().teal, a),
      mouseColor: (p, a) => rgba(p.accent ? colors().gold : colors().cyan, a)
    });
  }

  /* ------------------------------------------------------------------
     2. LOGIN PAGE NETWORK (login accent + gold)
  ------------------------------------------------------------------ */
  function initLoginNetwork() {
    const header = document.querySelector('.hl_login--header');
    if (!header || document.getElementById('irvex-login-network-canvas')) return;
    createNetwork(header, {
      id: 'irvex-login-network-canvas',
      baseCount: 120,
      density: () => fx().networkDensity,
      enabled: () => fx().loginNetwork,
      accentChance: 0.5,
      linkDist: 100, linkFade: 140, linkWidth: 1.2,
      mouseDist: 180, mouseFade: 200, mouseWidth: 2.0,
      nodeColor: (p) => rgba(p.accent ? colors().gold : colors().red, 0.9),
      linkColor: (p, p2, a) => {
        if (p.accent && p2.accent) return rgba(colors().gold, a);
        if (!p.accent && !p2.accent) return rgba(colors().red, a);
        return rgba(mix(colors().red, colors().gold), a);
      },
      mouseColor: (p, a) => rgba(p.accent ? colors().gold : colors().red, a)
    });
  }

  /* ------------------------------------------------------------------
     3. CLICK RIPPLE (styled by .irvex-ripple-dynamic in the theme CSS)
  ------------------------------------------------------------------ */
  document.addEventListener('click', function (e) {
    if (UC.killed || !fx().ripple) return;
    const ripple = document.createElement('span');
    ripple.className = 'irvex-ripple-dynamic';
    const d = 80;
    ripple.style.width = d + 'px';
    ripple.style.height = d + 'px';
    ripple.style.left = (e.clientX - d / 2) + 'px';
    ripple.style.top = (e.clientY - d / 2) + 'px';
    document.body.appendChild(ripple);
    setTimeout(() => ripple.remove(), 1200);
  });

  /* ------------------------------------------------------------------
     4. SUB-ACCOUNT LOGO SWAP
  ------------------------------------------------------------------ */
  const logo = { master: null, loc: null };
  const LOGO_LS = (id) => 'irvex_logo_' + id;
  const validLogo = (u) => typeof u === 'string' && u && u.indexOf('default') === -1 && u.indexOf('placeholder') === -1;

  function restoreMasterLogo() {
    const img = document.querySelector('img.agency-logo');
    if (img && logo.master && img.src !== logo.master) img.src = logo.master;
    if (img) img.classList.remove('irvex-subaccount-logo');
  }
  function applySubaccountLogo(url) {
    if (!fx().subaccountLogo || !validLogo(url)) { restoreMasterLogo(); return; }
    const img = document.querySelector('img.agency-logo');
    if (!img) return;
    if (!logo.master && !img.classList.contains('irvex-subaccount-logo')) logo.master = img.src;
    if (img.src !== url) img.src = url;
    img.classList.add('irvex-subaccount-logo');
  }
  function cachedLogo(id) { try { return localStorage.getItem(LOGO_LS(id)); } catch (e) { return null; } }

  function syncLogo() {
    const img = document.querySelector('img.agency-logo');
    if (img && !logo.master && !img.classList.contains('irvex-subaccount-logo')) logo.master = img.src;
    if (!fx().subaccountLogo) { if (img && img.classList.contains('irvex-subaccount-logo')) restoreMasterLogo(); return; }
    const m = location.pathname.match(/\/location\/([^/]+)/);
    if (m) {
      const id = m[1];
      const cached = cachedLogo(id);
      if (id !== logo.loc || (img && cached && !img.classList.contains('irvex-subaccount-logo'))) {
        logo.loc = id;
        if (cached) applySubaccountLogo(cached); else restoreMasterLogo();
      }
    } else if (logo.loc !== null) {
      logo.loc = null;
      restoreMasterLogo();
    }
  }

  UC.onResponse(function (url, text) {
    if (!url || (url.indexOf('location') === -1 && url.indexOf('business_profile') === -1)) return;
    if (!text || text.charAt(0) !== '{') return;
    let data;
    try { data = JSON.parse(text); } catch (e) { return; }
    const loc = data.location || data.data || data;
    if (!loc || !loc.id || typeof loc.id !== 'string') return;
    try {
      if (validLogo(loc.logoUrl)) localStorage.setItem(LOGO_LS(loc.id), loc.logoUrl);
      else localStorage.removeItem(LOGO_LS(loc.id));
    } catch (e) { /* storage blocked */ }
    if (location.pathname.indexOf(loc.id) !== -1) {
      if (validLogo(loc.logoUrl)) applySubaccountLogo(loc.logoUrl); else restoreMasterLogo();
    }
  });

  /* ------------------------------------------------------------------
     WATCHDOG  (GHL is an SPA that keeps re-rendering the DOM)
  ------------------------------------------------------------------ */
  let pending = 0;
  function tick() {
    pending = 0;
    if (UC.killed) return;
    try { initSidebarNetwork(); initLoginNetwork(); syncLogo(); } catch (e) { /* never break GHL */ }
  }
  const mo = new MutationObserver(() => { if (!pending) pending = requestAnimationFrame(tick); });
  function start() {
    mo.observe(document.documentElement, { childList: true, subtree: true });
    tick();
  }
  const iv = setInterval(() => { if (UC.killed) { clearInterval(iv); mo.disconnect(); return; } tick(); }, 700);
  UC.onKill(() => { mo.disconnect(); clearInterval(iv); restoreMasterLogo(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
