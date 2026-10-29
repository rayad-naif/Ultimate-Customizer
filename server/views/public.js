'use strict';
/* Public pages: home / support, documentation, privacy policy, terms. */
const R = require('../../shared/registry');
const E = require('../../shared/theme-engine');
const { esc } = require('./layout');

function createPublicViews(L, brand) {
  const mail = '<a href="mailto:' + esc(brand.supportEmail) + '">' + esc(brand.supportEmail) + '</a>';
  const installHref = brand.marketplaceUrl || '/oauth/start';

  /* ---------------------------------------------------------------- home */
  function home(opts) {
    const themes = R.THEMES.map((t) => {
      const p = E.resolve({ values: t.p });
      return '<div class="sw"><i>' + [p.base, p.surfaceAlt, p.secondary, p.primary, p.highlight].map((c) => '<span style="background:' + c + '"></span>').join('') +
        '</i><div>' + esc(t.name) + '</div></div>';
    }).join('');
    const feats = [
      ['\u{1F3A8}', R.THEMES.length + ' prebuilt themes', 'One click restyles the whole CRM \u2014 colors, sidebar, fonts, animations and login page \u2014 from neon dark to clean light.'],
      ['\u{1F39B}️', R.ORDER.length + '+ settings', 'Every color, glow, blur, radius, font, speed and size, section by section.'],
      ['\u{1F510}', 'Login page designer', 'Split or centered layouts, background image, logo frame, animated network, custom heading and tagline.'],
      ['✨', 'Live animations', 'Interactive particle networks, click ripples, glowing tabs, animated banner and loader.'],
      ['\u{1F4CB}', 'Sidebar menu editor', 'Reorder, rename and hide menu items for agency and sub-account views.'],
      ['⚡', 'Instant, live saving', 'Edit inside your CRM with live preview. Changes save automatically and reach every user.']
    ].map((f) => '<div class="card feat"><div class="ico">' + f[0] + '</div><h3>' + esc(f[1]) + '</h3><p>' + esc(f[2]) + '</p></div>').join('');

    const body =
      '<section class="hero"><h1>' + esc(brand.name) + '</h1><p>The most complete theme builder for CRM agencies. Restyle your whole white-label CRM and login page from inside the CRM, with live preview.</p>' +
      '<div class="row" style="justify-content:center"><a class="btn pri" href="' + esc(installHref) + '">Install on your CRM</a><a class="btn" href="/docs">Read the docs</a><a class="btn" href="/app">Open my app</a></div></section>' +
      '<div class="grid3" style="margin-top:20px">' + feats + '</div>' +
      '<div class="card"><h2>Prebuilt themes</h2><p class="note">Every theme can be fine-tuned afterwards.</p><div class="swatches">' + themes + '</div></div>' +
      '<div class="grid"><div class="card"><h2>How it works</h2><ol class="steps">' +
      '<li><b>Install</b> the app from the CRM App Marketplace as an agency admin.</li>' +
      '<li><b>Paste two snippets</b> into Agency Settings &rarr; Company &rarr; Custom CSS and Custom JS.</li>' +
      '<li><b>Connect</b> your CRM domain from the profile menu, then open <b>Ultimate Customizer</b> and design.</li></ol>' +
      '<a href="/docs#install">Step-by-step guide &rarr;</a></div>' +
      '<div class="card" id="check"><h2>Check a license</h2><p class="note">Enter an agency Company ID (Agency Settings &rarr; Company) to see if it is licensed.</p>' +
      '<form id="chk"><label for="cid">Company ID</label><div class="row" style="flex-wrap:nowrap"><input type="text" id="cid" name="companyId" autocomplete="off" required pattern="[A-Za-z0-9_-]{6,64}" value="' + esc(opts.companyId || '') + '"><button class="btn pri">Check</button></div></form>' +
      '<div id="res" class="result" role="status" aria-live="polite"></div></div></div>' +
      '<div class="card" id="support"><h2>Support</h2><div class="grid"><div>' +
      '<p>We’re here to help with installation, design questions, billing and anything else.</p>' +
      '<p style="font-size:18px"><b>Email:</b> ' + mail + '</p>' +
      '<p class="note">We usually reply within one business day. Please include your <b>Company ID</b>, your <b>CRM domain</b>, and a screenshot or short description of the issue.</p>' +
      '<a class="btn pri" href="mailto:' + esc(brand.supportEmail) + '?subject=' + encodeURIComponent(brand.name + ' support') + '">Email support</a></div>' +
      '<div><h3 style="margin-top:0">Quick answers</h3>' +
      '<p><b>The menu item doesn’t appear.</b> Only agency admins see it. Open your profile menu once the page has loaded. Make sure both snippets are saved.</p>' +
      '<p><b>The theme isn’t showing.</b> Open the profile menu and click <b>Connect Ultimate Customizer</b> to connect this domain. See <a href="/docs#troubleshooting">troubleshooting</a>.</p>' +
      '<p><b>Can I use it on another agency?</b> No. Each purchase is licensed to one CRM Company ID. See the <a href="/terms">Terms</a>.</p></div></div></div>';

    const script = `
var f=document.getElementById('chk'),r=document.getElementById('res');
function run(){var id=document.getElementById('cid').value.trim();if(!id)return;r.textContent='Checking...';
fetch('/api/check?companyId='+encodeURIComponent(id)).then(function(x){return x.json()}).then(function(j){
if(j.error){r.textContent=j.error;return;}
r.innerHTML=j.licensed?'<span class="pill active">Active</span> This agency has an active license.'
:'<span class="pill uninstalled">'+(j.status==='suspended'?'Suspended':j.status==='pending'?'Pending approval':'Not active')+'</span> No active license for this Company ID.';
}).catch(function(){r.textContent='Could not reach the server.'})}
f.addEventListener('submit',function(e){e.preventDefault();run()});if(document.getElementById('cid').value)run();`;
    return L.layout('Premium themes for your CRM', body, { script, active: '/', framedToEmbed: true });
  }

  /* ---------------------------------------------------------------- docs */
  function docs() {
    const groups = R.GROUPS.map((g) => '<li><b>' + esc(g.label) + '</b>: ' + esc(g.subs.join(', ')) + '</li>').join('');
    const sections = [
      ['install', 'Install the app'], ['snippets', 'Add the two snippets'], ['connect', 'Connect your CRM domain'],
      ['customizer', 'Using the customizer'], ['themes', 'Themes'], ['login', 'Login page designer'], ['menu', 'Sidebar menu'],
      ['advanced', 'Advanced settings'], ['live', 'How saving works'], ['license', 'Licensing & domains'],
      ['troubleshooting', 'Troubleshooting'], ['uninstall', 'Uninstalling'], ['help', 'Getting help']
    ];
    const body = '<div class="prose"><h1>Documentation</h1><p class="sub">Everything you need to install, design and manage ' + esc(brand.name) + '.</p>' +
      '<div class="card"><ul class="toc">' + sections.map((s) => '<li><a href="#' + s[0] + '">' + esc(s[1]) + '</a></li>').join('') + '</ul></div>' +

      '<h2 id="install">1. Install the app</h2><ol><li>Sign in to your CRM as an <b>agency admin</b> (agency owners and admins can install agency apps).</li>' +
      '<li>Open the CRM App Marketplace, find <b>' + esc(brand.name) + '</b> and click <b>Install</b>.</li>' +
      '<li>Approve the requested access. You are taken to your <b>app page</b>, which shows your two snippets.</li></ol>' +
      '<p>You can always return to the app page at <a href="/app">' + esc(brand.baseUrl) + '/app</a>. It asks for the email and password you chose right after installing.</p>' +

      '<h2 id="snippets">2. Add the two snippets</h2><p>In your CRM go to <b>Agency Settings &rarr; Company</b> and scroll to the white-label section:</p>' +
      '<ul><li><b>Custom CSS</b>: paste the <code>@import url("&hellip;/theme.css");</code> line. If you already have custom CSS, put this line at the very top.</li>' +
      '<li><b>Custom JS</b>: paste the <code>&lt;script src="&hellip;/customizer.js"&gt;&lt;/script&gt;</code> line.</li></ul>' +
      '<p>Click <b>Save</b>, then reload the CRM. The two snippets are unique to your agency, so don’t share them.</p>' +

      '<h2 id="connect">3. Connect your CRM domain</h2><p>For security, the theme only loads on domains you have connected:</p>' +
      '<ol><li>Open the CRM on your white-label domain (for example <code>app.youragency.com</code>).</li>' +
      '<li>Open your profile menu (top right). Above <b>Sign out</b> you’ll see <b>Connect Ultimate Customizer</b>.</li>' +
      '<li>Click it, then <b>Connect with your CRM</b>. In the window that opens, sign in if asked and click <b>Approve</b>.</li>' +
      '<li>The page reloads with your theme. The menu item is now called <b>Ultimate Customizer</b>.</li></ol>' +
      '<p>Repeat for every domain your team uses. You can also add or remove domains on your <a href="/app">app page</a>. Each browser that edits the theme is connected the same way, and stays connected for 30 days.</p>' +

      '<h2 id="customizer">4. Using the customizer</h2><p>Open your profile menu &rarr; <b>Ultimate Customizer</b>. Only agency admins see it. A panel opens on the right; drag its header to move it. Every change shows instantly on the page you’re looking at.</p>' +
      '<p>Tabs:</p><ul><li><b>Themes</b>: ' + R.THEMES.length + ' one-click designs.</li>' + groups +
      '<li><b>Menu</b>: reorder, rename and hide sidebar items, and hide anything by CSS selector.</li><li><b>Advanced</b>: switch theme sections off, add custom CSS, back up or restore settings.</li></ul>' +
      '<p>Use the search box to find any of the ' + R.ORDER.length + ' settings by name. A gold dot means you changed a setting; the &#8634; button resets it to the theme value. <b>Undo session</b> reverts everything you changed since opening the panel.</p>' +

      '<h2 id="themes">5. Themes</h2><p>Picking a theme sets the brand palette, resets section colors to follow it, and applies the theme\u2019s own look (sidebar fill and edge glow, active-item highlight, fonts, glow strength, roundness, network animation and login card). Your login layout, background image, texts, menu, section switches and custom CSS are kept. Most section colors follow the palette until you change them, so adjusting <b>Colors &rarr; Brand palette</b> restyles everything at once.</p>' +

      '<h2 id="login">6. Login page designer</h2><p>Open the <b>Login page</b> tab and click <b>Show login page preview</b> to design it without signing out. You can change:</p>' +
      '<ul><li>Layout: form left, form right, or a centered form over the background</li><li>Background color, glow orbs, grid, animation speed, or your own background image</li>' +
      '<li>Logo size, glass frame, hover lift, floating animation</li><li>Form card color, opacity, blur, radius, width</li><li>Field, button and link colors</li>' +
      '<li>A replacement heading text and a tagline under the logo</li><li>The animated network: colors, particles, speed, reach</li></ul>' +
      '<p>The login page uses the same snippets. Make sure the login domain is connected (it is usually the same as your CRM domain).</p>' +

      '<h2 id="menu">7. Sidebar menu</h2><p>The <b>Menu</b> tab edits the menu of the view you’re in (Agency or Sub-account). Drag items or use the arrows to reorder, untick to hide, and type a new name to rename. Changes to the sub-account menu apply to all sub-accounts.</p>' +

      '<h2 id="advanced">8. Advanced settings</h2><ul><li><b>Theme sections</b>: switch off parts of the theme (for example the loader) to keep the CRM’s design there.</li>' +
      '<li><b>Custom CSS</b>: added after the theme for your own tweaks.</li><li><b>Backup / restore</b>: copy your settings as JSON, or restore them later or on another domain.</li></ul>' +

      '<h2 id="live">9. How saving works</h2><p>There is no publish button: changes save automatically about a second after you stop editing. Users who already have the CRM open receive the new design within a minute, and everyone else gets it on their next page load.</p>' +

      '<h2 id="license">10. Licensing &amp; domains</h2><p>Each purchase is licensed to <b>one CRM agency (Company ID)</b>. The license is protected in several ways:</p>' +
      '<ul><li>The theme files are only served while the app is installed on that agency.</li>' +
      '<li>They only load on domains that an admin of that agency connected through CRM sign-in.</li>' +
      '<li>The script checks that the signed-in user belongs to the licensed agency and switches itself off otherwise.</li>' +
      '<li>Attempts to load the files from other domains are logged.</li></ul>' +
      '<p>If you use the CRM’s shared default domain instead of a white-label domain, the theme loads only after the user check passes, so you may see the CRM’s default look for a moment.</p>' +

      '<h2 id="troubleshooting">11. Troubleshooting</h2><ul>' +
      '<li><b>No menu item:</b> you must be an agency admin. Open the profile menu after the page finishes loading. Check that the Custom JS snippet is saved exactly as given.</li>' +
      '<li><b>The theme doesn’t show:</b> the domain isn’t connected yet (use <b>Connect Ultimate Customizer</b>), or the license is inactive. Check it on the <a href="/#check">home page</a>.</li>' +
      '<li><b>&ldquo;This browser needs to reconnect&rdquo;:</b> your editor access expired or was revoked. Connect again from the panel.</li>' +
      '<li><b>The popup doesn’t open:</b> allow popups for your CRM domain, or use the &ldquo;Open it here&rdquo; link.</li>' +
      '<li><b>Something looks wrong after a CRM update:</b> turn off the affected section in <b>Advanced</b> and email us.</li>' +
      '<li><b>Console check:</b> run <code>IRVEX_UC.debug()</code> in the browser console and include the output when you contact support.</li></ul>' +

      '<h2 id="uninstall">12. Uninstalling</h2><p>Uninstall the app from the CRM App Marketplace. The theme switches off automatically. Remove the two snippets from Agency Settings to clean up. To have your data deleted, email ' + mail + '.</p>' +

      '<h2 id="help">13. Getting help</h2><p>Email ' + mail + ' with your Company ID, domain and a screenshot. We usually reply within one business day.</p></div>';
    return L.layout('Documentation', body, { active: '/docs' });
  }

  /* ---------------------------------------------------------------- legal */
  function privacy() {
    const n = esc(brand.name), who = esc(brand.legalName);
    const body = '<div class="prose"><h1>Privacy Policy</h1><p class="sub">Last updated: ' + esc(brand.legalUpdated) + '</p>' +
      '<p>This policy explains how ' + who + ' (&ldquo;we&rdquo;, &ldquo;us&rdquo;) handles information when CRM agencies use ' + n + ' (the &ldquo;App&rdquo;), its website and its CRM App Marketplace integration.</p>' +
      '<h2>Information we collect</h2><ul>' +
      '<li><b>Agency account data from the CRM:</b> when you install the App we receive your agency’s Company ID, the installing user’s CRM user ID, your agency name, and OAuth access and refresh tokens for the permissions you approve (by default only read access to company details).</li>' +
      '<li><b>Theme settings:</b> the colors, effects, menu names and other settings you save in the customizer, including any custom CSS, image links and text you enter.</li>' +
      '<li><b>Domains:</b> the CRM domains you connect, the domains our files are loaded from, and domains that request your files without permission (for license protection).</li>' +
      '<li><b>Technical data:</b> IP addresses are used briefly to prevent abuse (rate limiting) and appear in our hosting provider’s logs. We do not use them to build profiles.</li>' +
      '<li><b>Cookies:</b> we use strictly necessary cookies only, to keep you signed in to your app page and to protect sign-in. The customizer stores an editor key and cached logos in your browser’s local storage. We use no advertising or analytics cookies.</li></ul>' +
      '<h2>Information we do not collect</h2><p>The App does not read, store or transmit your contacts, conversations, opportunities, payments or other CRM records. The script runs in your users’ browsers to apply the design. It only inspects the signed-in user’s role and company to enforce the license and to show the customizer to admins, and this information is not sent to us.</p>' +
      '<h2>How we use information</h2><ul><li>To provide the App: generate your theme files and serve them to your connected domains.</li><li>To verify and enforce your license, including detecting use on unauthorized domains.</li>' +
      '<li>To confirm the App is still installed with the CRM.</li><li>To provide support and respond to you.</li><li>To keep the service secure and comply with legal obligations.</li></ul>' +
      '<h2>Sharing</h2><p>We do not sell or rent personal information. We share data only with service providers that run the App on our behalf: <b>Vercel</b> (hosting) and <b>MongoDB Atlas</b> (database), with the CRM as needed to operate the integration, or when required by law.</p>' +
      '<h2>Security</h2><p>Data is sent over HTTPS. OAuth tokens are encrypted at rest (AES-256-GCM), sessions are signed, and access to the Super Admin panel is restricted. No method of transmission or storage is completely secure, but we work to protect your information.</p>' +
      '<h2>Retention</h2><p>We keep agency data while the App is installed and for as long as needed to provide support and keep license records. Activity logs are deleted automatically after 180 days. You can ask us to delete your agency’s data at any time.</p>' +
      '<h2>Your rights</h2><p>Depending on where you live, you may have the right to access, correct, delete or export your information, or to object to some processing. To make a request, email ' + mail + ' from an address associated with your agency and include your Company ID.</p>' +
      '<h2>International transfers</h2><p>Our providers may process data in countries other than yours. Where required, we rely on appropriate safeguards for these transfers.</p>' +
      '<h2>Children</h2><p>The App is a business tool and is not directed to children.</p>' +
      '<h2>Changes</h2><p>We may update this policy. We will change the date above, and for material changes we will notify you by email or in the App.</p>' +
      '<h2>Contact</h2><p>' + who + ' &middot; ' + mail + '</p></div>';
    return L.layout('Privacy Policy', body, { active: '/privacy' });
  }

  function terms() {
    const n = esc(brand.name), who = esc(brand.legalName);
    const body = '<div class="prose"><h1>Terms of Service</h1><p class="sub">Last updated: ' + esc(brand.legalUpdated) + '</p>' +
      '<p>These terms govern your use of ' + n + ' (the &ldquo;App&rdquo;), provided by ' + who + ' (&ldquo;we&rdquo;, &ldquo;us&rdquo;). By installing or using the App you agree to these terms on behalf of your agency (&ldquo;you&rdquo;).</p>' +
      '<h2>1. The App</h2><p>The App lets CRM agencies customize the look of their white-label CRM and login page using CSS and JavaScript that we host and that you add to your CRM agency settings.</p>' +
      '<h2>2. License</h2><p>While your subscription or purchase is active and the App is installed, we grant you a non-exclusive, non-transferable license to use the App for <b>one CRM agency, identified by its Company ID</b>, on the domains you connect, for your agency and its sub-accounts.</p>' +
      '<h2>3. Restrictions</h2><p>You may not:</p><ul><li>use the App, its snippets or generated files for any other agency or Company ID;</li><li>share, resell, sublicense or publish the snippets, generated CSS or JavaScript;</li>' +
      '<li>copy, self-host, modify or reverse engineer the App’s code to get around license checks;</li><li>use the App for anything unlawful or harmful, or in breach of the CRM platform’s terms.</li></ul>' +
      '<p>We may monitor where the App’s files are loaded in order to enforce these restrictions.</p>' +
      '<h2>4. Payment</h2><p>Fees, billing and trials are handled through the CRM App Marketplace on the terms shown there. Unless the Marketplace or the law requires otherwise, fees are non-refundable.</p>' +
      '<h2>5. Your content</h2><p>You keep all rights to the logos, images, text and CSS you add. You are responsible for having the rights to use them, and you allow us to store and serve them only to provide the App.</p>' +
      '<h2>6. Third-party platform</h2><p>The App depends on the CRM platform, which may change at any time, which can affect how the App works. We will make reasonable efforts to adapt, but we are not responsible for the CRM platform’s services.</p>' +
      '<h2>7. Suspension and termination</h2><p>You may stop using the App at any time by uninstalling it. We may suspend or end your license if you breach these terms (especially Section 3), if payment fails, or if needed to protect the service. When the license ends, the App stops working on your CRM.</p>' +
      '<h2>8. Availability and support</h2><p>We aim to keep the App available and to answer support requests at ' + mail + ' within one business day, but we do not guarantee uninterrupted service.</p>' +
      '<h2>9. Disclaimer</h2><p>The App is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;. To the extent permitted by law, we disclaim all warranties, including merchantability, fitness for a particular purpose and non-infringement.</p>' +
      '<h2>10. Limitation of liability</h2><p>To the extent permitted by law, we are not liable for indirect, incidental, special, consequential or punitive damages, or for lost profits, revenue or data. Our total liability for any claim is limited to the amount you paid for the App in the 12 months before the claim.</p>' +
      '<h2>11. Changes</h2><p>We may update these terms. If changes are material we will notify you, and continuing to use the App after they take effect means you accept them.</p>' +
      '<h2>12. Contact</h2><p>' + who + ' &middot; ' + mail + '</p></div>';
    return L.layout('Terms of Service', body, { active: '/terms' });
  }

  function signIn(o) {
  o = o || {};
  const err = o.error ? '<div class="flash err">' + esc(o.error) + '</div>' : '';
  return L.layout('Sign in', '<div class="card" style="max-width:460px;margin:40px auto"><h1 style="text-align:center">Sign in</h1>' +
    '<p class="sub" style="text-align:center">Use the email and password you chose when you installed ' + esc(brand.name) + '.</p>' + err +
    '<form method="post" action="/app/login" autocomplete="on">' + (o.next ? '<input type="hidden" name="next" value="' + esc(o.next) + '">' : '') +
    '<label for="email">Email</label><input type="email" id="email" name="email" value="' + esc(o.email || '') + '" autocomplete="username" required>' +
    '<label for="password" style="margin-top:12px;display:block">Password</label><input type="password" id="password" name="password" autocomplete="current-password" required>' +
    '<label style="display:flex;gap:8px;align-items:center;margin:14px 0"><input type="checkbox" name="remember" value="1" style="width:auto"> Keep me signed in for 7 days</label>' +
    '<button class="btn pri" style="width:100%">Sign in</button></form>' +
    '<p class="note" style="margin-top:18px">Forgot it, or never set one? Open ' + esc(brand.name) + ' from your CRM sidebar and choose <b>Set email &amp; password</b>. ' +
    'Don’t have the app yet? <a href="' + esc(installHref) + '">Install it</a>.</p></div>', { framedToEmbed: true });
}

  return { home, docs, privacy, terms, signIn };
}

module.exports = { createPublicViews };
