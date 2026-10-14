/* =====================================================================
   EFFECTS  (bundled into customizer.js; reads live settings from UC.r)
   Ported from the IRVEX master JS: sidebar + login networks, click
   ripple, sub-account logo, plus login heading/tagline text.
   ===================================================================== */
/* global UC */
(function UCEffects() {
  'use strict';
  const E = UC.E;
  const v = (id) => UC.r[id];
  const rgba = (hex, a) => E.rgba(hex, Math.max(0, Math.min(1, a)).toFixed(3));
  const mix = (h1, h2) => {
    const a = E.hexToRgb(h1), b = E.hexToRgb(h2);
    return E.rgbToHex((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  };

  /* ------------------------------------------------------------------
     Generic particle network on a canvas inside `container`.
     p(name) reads that network's settings ('net.*' or 'lnet.*').
  ------------------------------------------------------------------ */
  function createNetwork(container, id, opts) {
    const canvas = document.createElement('canvas');
    canvas.id = id;
    canvas.style.cssText = 'position:absolute;top:0;left:0;z-index:0;pointer-events:none';
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
      x: Math.random() * (width || 300), y: Math.random() * (height || 1000),
      dx: Math.random() - 0.5, dy: Math.random() - 0.5,
      size: Math.random() * 1.5 + 0.5, roll: Math.random()
    });

    const mouse = { x: null, y: null };
    const onMove = (e) => { const r = container.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; };
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
      if (UC.killed || !canvas.isConnected || !container.isConnected) { stop(); return; }
      raf = requestAnimationFrame(frame);
      ctx.clearRect(0, 0, width, height);
      if (!opts.enabled()) return;
      const s = opts.settings();

      while (particles.length < s.count) particles.push(spawn());
      if (particles.length > s.count) particles.length = s.count;

      const n = particles.length;
      for (let i = 0; i < n; i++) {
        const p = particles[i];
        const accent = p.roll < s.accentRatio;
        p.x += p.dx * s.speed; p.y += p.dy * s.speed;
        if (p.x < 0 || p.x > width) p.dx *= -1;
        if (p.y < 0 || p.y > height) p.dy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * s.nodeSize, 0, Math.PI * 2);
        ctx.fillStyle = rgba(accent ? s.accent : s.node, 0.9);
        ctx.fill();

        for (let j = i + 1; j < n; j++) {
          const p2 = particles[j];
          const dx = p.x - p2.x, dy = p.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < s.linkDist) {
            const accent2 = p2.roll < s.accentRatio;
            ctx.beginPath();
            ctx.strokeStyle = rgba(opts.linkColor(s, accent, accent2), 0.7 - dist / (s.linkDist * 1.4));
            ctx.lineWidth = s.lineWidth;
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
        }
        if (mouse.x !== null && s.mouse > 0) {
          const dx = p.x - mouse.x, dy = p.y - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < s.mouse) {
            ctx.beginPath();
            ctx.strokeStyle = rgba(accent ? s.accent : s.node, 0.95 - dist / (s.mouse * 1.07));
            ctx.lineWidth = s.lineWidth * 1.5;
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(mouse.x, mouse.y);
            ctx.stroke();
          }
        }
      }
    }
    frame();
  }

  function initSidebarNetwork() {
    const sidebar = document.querySelector('aside, .sidebar-v2, #sidebar-v2, .hl_sidebar');
    if (!sidebar || document.getElementById('irvex-network-canvas')) return;
    createNetwork(sidebar, 'irvex-network-canvas', {
      enabled: () => v('net.enabled') && !v('fx.reduceMotion'),
      settings: () => ({
        count: v('net.count'), speed: v('net.speed'), accentRatio: v('net.accentRatio'), nodeSize: v('net.nodeSize') / 1.5,
        linkDist: v('net.linkDist'), mouse: v('net.mouse'), lineWidth: v('net.lineWidth'),
        node: v('net.node'), accent: v('net.accent'), link: v('net.link')
      }),
      linkColor: (s, a1, a2) => (a1 || a2 ? s.accent : s.link)
    });
  }

  function initLoginNetwork() {
    const header = document.querySelector('.hl_login--header');
    if (!header || document.getElementById('irvex-login-network-canvas')) return;
    createNetwork(header, 'irvex-login-network-canvas', {
      enabled: () => v('lnet.enabled') && !v('fx.reduceMotion'),
      settings: () => ({
        count: v('lnet.count'), speed: v('lnet.speed'), accentRatio: v('lnet.accentRatio'), nodeSize: 1,
        linkDist: v('lnet.linkDist'), mouse: v('lnet.mouse'), lineWidth: 1.2,
        node: v('lnet.node'), accent: v('lnet.accent')
      }),
      linkColor: (s, a1, a2) => (a1 && a2 ? s.accent : !a1 && !a2 ? s.node : mix(s.node, s.accent))
    });
  }

  /* ------------------------------------------------------------------
     LOGIN TEXT  (heading replacement + tagline under the logo)
  ------------------------------------------------------------------ */
  function syncLoginText() {
    const h2 = document.querySelector('.login-card-heading h2');
    if (h2) {
      if (h2.dataset.ucOrig === undefined) h2.dataset.ucOrig = h2.textContent;
      const want = v('login.headingText') || h2.dataset.ucOrig;
      if (h2.textContent !== want) h2.textContent = want;
    }
    const wrap = document.querySelector('.hl_login--header .container-fluid') || document.querySelector('.hl_login--header');
    let tag = document.querySelector('.uc-login-tagline');
    const text = v('login.tagline');
    if (!wrap || !text) { if (tag) tag.remove(); return; }
    if (!tag) { tag = document.createElement('div'); tag.className = 'uc-login-tagline'; wrap.appendChild(tag); }
    if (tag.textContent !== text) tag.textContent = text;
  }

  /* ------------------------------------------------------------------
     CLICK RIPPLE
  ------------------------------------------------------------------ */
  document.addEventListener('click', function (e) {
    if (UC.killed || !UC.live || !v('ripple.enabled') || v('fx.reduceMotion')) return;
    if (e.target.closest && e.target.closest('#irvex-uc-host')) return;
    const d = v('ripple.size');
    const ripple = document.createElement('span');
    ripple.className = 'irvex-ripple-dynamic';
    ripple.style.width = d + 'px';
    ripple.style.height = d + 'px';
    ripple.style.left = (e.clientX - d / 2) + 'px';
    ripple.style.top = (e.clientY - d / 2) + 'px';
    document.body.appendChild(ripple);
    setTimeout(() => ripple.remove(), v('ripple.duration') * 1000);
  });

  /* ------------------------------------------------------------------
     SUB-ACCOUNT LOGO SWAP
  ------------------------------------------------------------------ */
  const logo = { master: null, loc: null };
  const LOGO_LS = (id) => 'irvex_logo_' + id;
  const validLogo = (u) => typeof u === 'string' && /^https?:\/\//.test(u) && u.indexOf('default') === -1 && u.indexOf('placeholder') === -1;

  function restoreMasterLogo() {
    const img = document.querySelector('img.agency-logo');
    if (img && logo.master && img.src !== logo.master) img.src = logo.master;
    if (img) img.classList.remove('irvex-subaccount-logo');
  }
  function applySubaccountLogo(url) {
    if (!v('sublogo.enabled') || !validLogo(url)) { restoreMasterLogo(); return; }
    const img = document.querySelector('img.agency-logo');
    if (!img) return;
    if (!logo.master && !img.classList.contains('irvex-subaccount-logo')) logo.master = img.src;
    if (img.src !== url) img.src = url;
    img.classList.add('irvex-subaccount-logo');
  }
  const cachedLogo = (id) => { try { return localStorage.getItem(LOGO_LS(id)); } catch (e) { return null; } };

  function syncLogo() {
    const img = document.querySelector('img.agency-logo');
    if (img && !logo.master && !img.classList.contains('irvex-subaccount-logo')) logo.master = img.src;
    if (!v('sublogo.enabled')) { if (img && img.classList.contains('irvex-subaccount-logo')) restoreMasterLogo(); logo.loc = undefined; return; }
    const m = location.pathname.match(/\/location\/([^/]+)/);
    if (m) {
      const id = m[1], cached = cachedLogo(id);
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
    if (UC.live && location.pathname.indexOf(loc.id) !== -1) {
      if (validLogo(loc.logoUrl)) applySubaccountLogo(loc.logoUrl); else restoreMasterLogo();
    }
  });

  /* ------------------------------------------------------------------
     WATCHDOG  (The CRM is an SPA that keeps re-rendering the DOM)
  ------------------------------------------------------------------ */
  let pending = 0;
  function tick() {
    pending = 0;
    if (UC.killed || !UC.live) return;
    try { initSidebarNetwork(); initLoginNetwork(); syncLoginText(); syncLogo(); } catch (e) { /* never break the CRM */ }
  }
  UC.refreshEffects = tick;
  UC.onChange(() => { if (UC.live) tick(); });
  const mo = new MutationObserver(() => { if (!pending) pending = requestAnimationFrame(tick); });
  UC.onLive(() => {
    const start = () => { mo.observe(document.documentElement, { childList: true, subtree: true }); tick(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  });
  const iv = setInterval(() => { if (UC.killed) { clearInterval(iv); mo.disconnect(); return; } tick(); }, 700);
  UC.onKill(() => { mo.disconnect(); clearInterval(iv); restoreMasterLogo(); const t = document.querySelector('.uc-login-tagline'); if (t) t.remove(); });
})();
