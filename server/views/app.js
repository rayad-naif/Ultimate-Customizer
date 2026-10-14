'use strict';
/* The app page (after HighLevel sign-in) and the domain-connect approval page. */
const { esc } = require('./layout');

function createAppViews(L, brand) {
  function snippets(baseUrl, inst) {
    const cssUrl = baseUrl + '/c/' + inst.key + '/theme.css';
    const jsUrl = baseUrl + '/c/' + inst.key + '/customizer.js';
    return '<label>1. Custom CSS</label>' +
      '<div class="code"><span id="snip-css">@import url("' + esc(cssUrl) + '");</span><button class="btn sm copy" type="button" data-copy="snip-css">Copy</button></div>' +
      '<label>2. Custom JS</label>' +
      '<div class="code"><span id="snip-js">&lt;script src="' + esc(jsUrl) + '"&gt;&lt;/script&gt;</span><button class="btn sm copy" type="button" data-copy="snip-js">Copy</button></div>';
  }

  function appPage(o) {
    const inst = o.inst, status = o.status;
    // Inside HighLevel's iframe the session travels as a token in every form.
    const T = o.embedToken ? '<input type="hidden" name="t" value="' + esc(o.embedToken) + '">' : '';
    let body = '<h1>' + esc(inst.name || 'Your agency') + ' ' + L.pill(status) + '</h1><p class="sub">Company ID <code>' + esc(inst.companyId) + '</code></p>';
    if (status !== 'active') {
      body += '<div class="flash err">' + (status === 'pending'
        ? 'Thanks for installing! Your license is being activated. Your theme starts working as soon as it is approved. Questions: ' + esc(brand.supportEmail) + '.'
        : status === 'suspended'
        ? 'This license is suspended, so your theme is switched off. Contact ' + esc(brand.supportEmail) + '.'
        : 'The app is not installed on this agency, so your theme is switched off. Reinstall it from the HighLevel Marketplace.') + '</div>';
    }
    body += '<div class="card"><h2>Your code</h2><p class="note">Paste these in HighLevel under <b>Agency Settings &rarr; Company</b>: the first in <b>Custom CSS</b> (at the top), the second in <b>Custom JS</b>. Then reload your CRM.</p>' +
      (status === 'active' ? snippets(o.baseUrl, inst) : '<p class="note"><b>Your code appears here once your license is active.</b></p>') + '</div>';

    const hosts = inst.boundHosts.map((h) => '<tr><td><b>' + esc(h) + '</b></td><td><small>' + (inst.seenHosts[h] ? 'last used ' + L.fmt(inst.seenHosts[h]) : 'not used yet') + '</small></td><td style="text-align:right">' +
      L.postBtn('/app/domains/remove', 'Remove', o.csrf, 'danger', 'Remove ' + h + '? The theme stops loading there.', '<input type="hidden" name="host" value="' + esc(h) + '">' + T) + '</td></tr>').join('');
    body += '<div class="card"><h2>Connected domains</h2><p class="note">Your theme only loads on these domains. The easiest way to add one: open your CRM there, then use <b>Profile menu &rarr; Connect Ultimate Customizer</b>. You can also add it here.</p>' +
      '<div class="scroll"><table>' + (hosts || '<tr><td class="note">No domains connected yet.</td></tr>') + '</table></div>' +
      '<form method="post" action="/app/domains/add" class="row" style="margin-top:12px">' + L.csrfField(o.csrf) + T +
      '<input type="text" name="host" placeholder="app.youragency.com" style="max-width:320px" required><button class="btn sm">Add domain</button></form></div>';

    body += '<div class="grid"><div class="card"><h2>Design your CRM</h2><ol class="steps"><li>Open your CRM on a connected domain.</li><li>Profile menu &rarr; <b>Ultimate Customizer</b>.</li><li>Pick a theme and fine-tune. Changes save automatically.</li></ol><a href="/docs#customizer" target="_blank" rel="noopener">Customizer guide &rarr;</a></div>' +
      '<div class="card"><h2>Editor access</h2><p class="note">Browsers that connected the customizer can edit your theme for 30 days. If an admin leaves, sign them all out here.</p>' +
      L.postBtn('/app/revoke-editors', 'Sign out all editors', o.csrf, '', 'Every browser will need to reconnect before editing. Continue?', T) + '</div></div>';
    return L.layout('My app', body, { customer: true, embed: !!o.embedToken, csrf: o.csrf, flash: o.flash, active: '/app' });
  }

  function connectPage(o) {
    let body;
    if (o.error) {
      body = '<div class="card" style="max-width:560px;margin:30px auto;text-align:center"><h1>Can’t connect</h1><p class="sub">' + esc(o.error) + '</p>' +
        '<p class="note">Signed in as agency <code>' + esc(o.inst ? o.inst.companyId : '') + '</code>. <a href="/app">Go to my app</a></p></div>';
    } else if (o.done) {
      body = '<div class="card" style="max-width:560px;margin:30px auto;text-align:center"><h1>Approved ✓</h1><p class="sub">Go back to your CRM tab. It will connect in a few seconds.</p>' +
        '<button class="btn" onclick="window.close()">Close this window</button></div>';
    } else {
      body = '<div class="card" style="max-width:560px;margin:30px auto;text-align:center"><h1>Connect your CRM</h1>' +
        '<p class="sub">Allow the CRM tab that opened this window to use the <b>' + esc(brand.name) + '</b> license of <b>' + esc(o.inst.name || o.inst.companyId) + '</b>?</p>' +
        '<p class="note">This connects the domain you opened it from and lets that browser edit your theme for 30 days. Only approve if you just clicked <b>Connect</b> in your own CRM.</p>' +
        '<form method="post" action="/connect" style="margin-top:18px">' + L.csrfField(o.csrf) +
        '<input type="hidden" name="key" value="' + esc(o.key) + '"><input type="hidden" name="pair" value="' + esc(o.pair) + '">' +
        '<button class="btn pri">Approve</button> <a class="btn" href="/app">Cancel</a></form></div>';
    }
    return L.layout('Connect', body, { customer: true, csrf: o.csrf });
  }

  // Custom page HighLevel loads in the sidebar. Gets the signed-in user via SSO.
  function embedPage(o) {
    const open = '<a class="btn pri" href="/app" target="_blank" rel="noopener">Open Ultimate Customizer</a>';
    const body = '<div class="card" style="max-width:560px;margin:30px auto;text-align:center"><h1>' + esc(brand.name) + '</h1>' +
      '<p class="sub" id="msg">' + (o.ssoEnabled ? 'Signing you in\u2026' : 'Open your app page in a new tab to get your code and manage domains.') + '</p>' +
      '<div id="fallback"' + (o.ssoEnabled ? ' style="display:none"' : '') + '>' + open + '<p class="note" style="margin-top:14px">You may be asked to sign in with HighLevel.</p></div></div>';
    const script = o.ssoEnabled ? `
(function(){var done=false,msg=document.getElementById('msg'),fb=document.getElementById('fallback');
function fail(t){done=true;msg.textContent=t;fb.style.display='';}
if(window.top===window.self){location.replace('/app');return;}
window.addEventListener('message',function(e){var d=e.data;if(done||!d||d.message!=='REQUEST_USER_DATA_RESPONSE')return;done=true;
fetch('/api/sso',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({payload:d.payload})})
.then(function(r){return r.json()}).then(function(j){if(j.token)location.replace('/app?t='+encodeURIComponent(j.token));else fail(j.error||'Could not sign you in.')})
.catch(function(){fail('Could not reach the server.')})});
window.parent.postMessage({message:'REQUEST_USER_DATA'},'*');
setTimeout(function(){if(!done)fail('HighLevel did not answer the sign-in request. Open the app in a new tab instead.')},8000);})();` : '';
    return L.layout('Ultimate Customizer', body, { customer: true, embed: true, script });
  }

  return { appPage, connectPage, snippets, embedPage };
}

module.exports = { createAppViews };
