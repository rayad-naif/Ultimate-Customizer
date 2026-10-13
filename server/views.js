'use strict';
/* Server-rendered pages. Every dynamic value goes through esc(). */
const engine = require('../shared/theme-engine');
const { safeJson } = require('./bundle');

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const fmt = (iso) => (iso ? esc(String(iso).replace('T', ' ').slice(0, 16)) + ' UTC' : '&mdash;');

const STATUS_LABEL = { active: 'Active', suspended: 'Suspended', uninstalled: 'Uninstalled', not_installed: 'Not installed' };
const pill = (status) => '<span class="pill ' + esc(status) + '">' + esc(STATUS_LABEL[status] || status) + '</span>';

const CSS = `
:root{--bg:#000414;--panel:#000a1a;--line:rgba(0,206,209,.22);--text:#e6f7ff;--muted:#8fb7c9;--accent:#00e5ff;--teal:#00ced1;--gold:#ffd700;--bad:#ff4d5a;--ok:#2ee6a6}
*{box-sizing:border-box}
body{margin:0;background:var(--bg) radial-gradient(circle at 20% 0,rgba(0,206,209,.12),transparent 50%);color:var(--text);font:15px/1.55 Inter,'Segoe UI',system-ui,sans-serif;min-height:100vh}
a{color:var(--accent)}
.top{display:flex;align-items:center;gap:16px;padding:14px 24px;border-bottom:1px solid var(--line);background:rgba(0,10,26,.7);backdrop-filter:blur(10px);position:sticky;top:0;z-index:5}
.brand{font-weight:800;letter-spacing:1px;text-transform:uppercase;background:linear-gradient(135deg,var(--teal),var(--accent) 50%,var(--gold));-webkit-background-clip:text;background-clip:text;color:transparent;text-decoration:none}
.top nav{margin-left:auto;display:flex;gap:14px;align-items:center}
.top nav a{text-decoration:none;color:var(--muted);font-weight:600;font-size:14px}
.top nav a:hover{color:var(--accent)}
main{max-width:1060px;margin:0 auto;padding:28px 16px 60px}
h1{font-size:28px;margin:0 0 6px}
h2{font-size:17px;margin:0 0 12px;color:var(--accent);letter-spacing:.3px}
.sub{color:var(--muted);margin:0 0 24px}
.card{background:rgba(0,10,26,.75);border:1px solid var(--line);border-radius:16px;padding:20px;margin-bottom:18px;box-shadow:0 10px 30px rgba(0,0,0,.35)}
.grid{display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(300px,1fr))}
label{display:block;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--teal);margin:12px 0 6px}
input[type=text],input[type=password],textarea,select{width:100%;background:rgba(0,26,51,.7);border:1px solid rgba(0,206,209,.4);color:var(--text);border-radius:9px;padding:10px 12px;font:inherit;outline:none}
input:focus,textarea:focus,select:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(0,229,255,.18)}
textarea{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px;min-height:90px}
.btn{display:inline-flex;align-items:center;gap:6px;border:1px solid rgba(0,229,255,.5);background:transparent;color:var(--accent);border-radius:9px;padding:9px 15px;font:inherit;font-weight:700;font-size:14px;cursor:pointer;text-decoration:none}
.btn:hover{background:rgba(0,229,255,.1)}
.btn.pri{background:var(--accent);color:#000414;border-color:var(--accent)}
.btn.pri:hover{background:var(--gold);border-color:var(--gold)}
.btn.danger{color:var(--bad);border-color:rgba(255,77,90,.5)}
.btn.danger:hover{background:rgba(255,77,90,.12)}
.btn.sm{padding:6px 10px;font-size:12.5px}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.row > form{margin:0}
.code{position:relative;background:#00040f;border:1px solid var(--line);border-radius:10px;padding:12px 84px 12px 12px;font:12.5px/1.5 ui-monospace,Menlo,monospace;color:#bfefff;word-break:break-all;margin:6px 0 4px}
.code .copy{position:absolute;top:8px;right:8px}
.note{color:var(--muted);font-size:13px}
.flash{border-radius:12px;padding:12px 14px;margin-bottom:18px;border:1px solid}
.flash.ok{border-color:rgba(46,230,166,.5);background:rgba(46,230,166,.08)}
.flash.err{border-color:rgba(255,77,90,.5);background:rgba(255,77,90,.08)}
.flash.key{border-color:var(--gold);background:rgba(255,215,0,.07)}
.pill{display:inline-block;font-size:12px;font-weight:700;padding:3px 10px;border-radius:99px;border:1px solid}
.pill.active{color:var(--ok);border-color:rgba(46,230,166,.5)}
.pill.suspended{color:var(--gold);border-color:rgba(255,215,0,.5)}
.pill.uninstalled,.pill.not_installed{color:var(--bad);border-color:rgba(255,77,90,.5)}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{text-align:left;padding:10px 8px;border-bottom:1px solid rgba(0,206,209,.12);vertical-align:top}
th{font-size:11.5px;text-transform:uppercase;letter-spacing:.8px;color:var(--teal)}
td small{color:var(--muted)}
.scroll{overflow-x:auto}
dl{display:grid;grid-template-columns:max-content 1fr;gap:6px 16px;margin:0;font-size:14px}
dt{color:var(--muted)}dd{margin:0;word-break:break-all}
.colors{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.colors div{display:flex;align-items:center;gap:8px}
input[type=color]{width:40px;height:34px;border:1px solid var(--line);border-radius:8px;background:none;padding:2px;cursor:pointer}
.check{display:flex;align-items:center;gap:8px;font-size:14px;margin:6px 0;text-transform:none;letter-spacing:0;color:var(--text);font-weight:500}
.check input{accent-color:var(--accent);width:17px;height:17px}
.hero{text-align:center;padding:30px 0 10px}
.hero h1{font-size:36px}
.result{margin-top:14px;font-weight:600}
@media (max-width:600px){.top{padding:12px 16px}.code{padding-right:12px}.code .copy{position:static;margin-top:8px}}
`;

const COPY_JS = `document.addEventListener('click',function(e){var b=e.target.closest('[data-copy]');if(!b)return;var t=document.getElementById(b.dataset.copy).textContent;
(navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(function(){b.textContent='Copied';setTimeout(function(){b.textContent='Copy'},1500)},function(){prompt('Copy:',t)})});`;

function layout(title, body, opts) {
  opts = opts || {};
  const nav = opts.admin
    ? '<a href="/admin">Agencies</a><a href="/admin/events">Activity</a><form method="post" action="/admin/logout" style="margin:0"><input type="hidden" name="_csrf" value="' + esc(opts.csrf || '') + '"><button class="btn sm">Sign out</button></form>'
    : (opts.customer
      ? '<a href="/dashboard">Dashboard</a><form method="post" action="/logout" style="margin:0"><input type="hidden" name="_csrf" value="' + esc(opts.csrf || '') + '"><button class="btn sm">Sign out</button></form>'
      : '<a href="/">Check license</a><a href="/dashboard">My dashboard</a>');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + esc(title) + ' | Ultimate Customizer</title><style>' + CSS + '</style></head><body>' +
    '<header class="top"><a class="brand" href="' + (opts.admin ? '/admin' : '/') + '">Ultimate Customizer' + (opts.admin ? ' Admin' : '') + '</a><nav>' + nav + '</nav></header>' +
    '<main>' + (opts.flash ? flashHtml(opts.flash) : '') + body + '</main><script>' + COPY_JS + (opts.script || '') + '</script></body></html>';
}

function flashHtml(f) {
  if (f.publishKey) {
    return '<div class="flash key"><b>Your publish key (shown only once):</b>' +
      '<div class="code"><span id="pk-once">' + esc(f.publishKey) + '</span><button class="btn sm copy" data-copy="pk-once" type="button">Copy</button></div>' +
      '<span class="note">Paste it into the Publish tab of the Ultimate Customizer inside HighLevel. If you lose it, generate a new one.</span></div>';
  }
  return '<div class="flash ' + (f.type === 'err' ? 'err' : 'ok') + '">' + esc(f.msg) + '</div>';
}

const csrfField = (t) => '<input type="hidden" name="_csrf" value="' + esc(t) + '">';
const postBtn = (action, label, csrf, cls, confirmMsg, extra) =>
  '<form method="post" action="' + esc(action) + '"' + (confirmMsg ? ' onsubmit="return confirm(\'' + esc(confirmMsg) + '\')"' : '') + '>' +
  csrfField(csrf) + (extra || '') + '<button class="btn sm ' + (cls || '') + '">' + esc(label) + '</button></form>';

function snippets(baseUrl, inst) {
  const cssUrl = baseUrl + '/c/' + inst.key + '/theme.css';
  const jsUrl = baseUrl + '/c/' + inst.key + '/customizer.js';
  return '<label>1. Custom CSS (Agency Settings &rarr; Company &rarr; Custom CSS)</label>' +
    '<div class="code"><span id="snip-css">@import url("' + esc(cssUrl) + '");</span><button class="btn sm copy" type="button" data-copy="snip-css">Copy</button></div>' +
    '<label>2. Custom JS (Agency Settings &rarr; Company &rarr; Custom JS)</label>' +
    '<div class="code"><span id="snip-js">&lt;script src="' + esc(jsUrl) + '"&gt;&lt;/script&gt;</span><button class="btn sm copy" type="button" data-copy="snip-js">Copy</button></div>' +
    '<p class="note">The CSS gives you the theme and the JS adds the effects and the in-app customizer. Both stop working automatically if the license is not active.</p>';
}

/* ------------------------------------------------------------------ public */
function home(opts) {
  const body = '<section class="hero"><h1>Ultimate Customizer</h1><p class="sub">Premium themes and effects for your HighLevel agency.</p>' +
    '<div class="row" style="justify-content:center"><a class="btn pri" href="/oauth/start">Install / Connect with HighLevel</a><a class="btn" href="/dashboard">Manage my theme</a></div></section>' +
    '<div class="card" style="max-width:560px;margin:30px auto 0"><h2>Check a license</h2>' +
    '<p class="note">Enter your agency Company ID (Agency Settings &rarr; Company &rarr; Company ID) to see whether Ultimate Customizer is active for it.</p>' +
    '<form id="chk"><label for="cid">Company ID</label><div class="row" style="flex-wrap:nowrap"><input type="text" id="cid" name="companyId" autocomplete="off" required pattern="[A-Za-z0-9_-]{6,64}" value="' + esc(opts.companyId || '') + '"><button class="btn pri">Check</button></div></form>' +
    '<div id="res" class="result" role="status" aria-live="polite"></div></div>';
  const script = `
var f=document.getElementById('chk'),r=document.getElementById('res');
function run(){var id=document.getElementById('cid').value.trim();if(!id)return;r.textContent='Checking...';
fetch('/api/check?companyId='+encodeURIComponent(id)).then(function(x){return x.json()}).then(function(j){
if(j.error){r.innerHTML='';r.textContent=j.error;return;}
r.innerHTML=j.licensed?'<span class="pill active">Active</span> The customizer is licensed for this agency. Your theme and effects will load.'
:'<span class="pill uninstalled">'+(j.status==='suspended'?'Suspended':'Not active')+'</span> No active license for this Company ID. <a href="/oauth/start">Install the app</a> to activate it.';
}).catch(function(){r.textContent='Could not reach the server.'})}
f.addEventListener('submit',function(e){e.preventDefault();run()});if(document.getElementById('cid').value)run();`;
  return layout('Check license', body, { script });
}

function message(title, msg, opts) {
  return layout(title, '<div class="card" style="max-width:620px;margin:40px auto"><h1>' + esc(title) + '</h1><p class="sub">' + esc(msg) + '</p>' +
    '<a class="btn" href="' + esc((opts && opts.back) || '/') + '">Back</a></div>', opts);
}

/* ---------------------------------------------------------------- customer */
function signIn() {
  return layout('Sign in', '<div class="card" style="max-width:520px;margin:40px auto;text-align:center"><h1>Manage your theme</h1>' +
    '<p class="sub">Sign in with the HighLevel agency account that installed Ultimate Customizer. Only agency admins can do this.</p>' +
    '<a class="btn pri" href="/oauth/start?next=dashboard">Sign in with HighLevel</a></div>');
}

function configEditor(cfg, action, csrf) {
  const c = cfg.colors, f = cfg.fx;
  const labels = { navy: 'Base / Sidebar', cyan: 'Primary accent', teal: 'Secondary accent', gold: 'Highlight', light: 'Page surface', red: 'Login accent' };
  const colorInputs = Object.keys(c).map((k) => '<div><input type="color" data-color="' + k + '" value="' + esc(c[k]) + '"><span>' + esc(labels[k]) + '</span></div>').join('');
  const toggles = [['network', 'Sidebar network'], ['loginNetwork', 'Login page network'], ['ripple', 'Click ripple'], ['subaccountLogo', 'Sub-account logo in sidebar'], ['noGlow', 'Disable text glow'], ['noMotion', 'Reduce motion']]
    .map((t) => '<label class="check"><input type="checkbox" data-fx="' + t[0] + '"' + (f[t[0]] ? ' checked' : '') + '>' + t[1] + '</label>').join('');
  const fonts = engine.FONTS.map((n) => '<option' + (n === f.font ? ' selected' : '') + '>' + esc(n) + '</option>').join('');
  const body = '<div class="card"><h2>Theme</h2><p class="note">Quick settings. For live preview, sidebar ordering and renaming, use <b>Ultimate Customizer</b> in your HighLevel profile menu.</p>' +
    '<label>Brand colors</label><div class="colors">' + colorInputs + '</div>' +
    '<div class="grid" style="margin-top:6px"><div><label>Effects</label>' + toggles + '</div><div>' +
    '<label for="font">Font</label><select id="font">' + fonts + '</select>' +
    '<label for="hide">Always hide (one CSS selector per line)</label><textarea id="hide" placeholder="#sb_app-media">' + esc(cfg.hideSelectors.join('\n')) + '</textarea></div></div>' +
    '<details style="margin-top:12px"><summary class="note" style="cursor:pointer">Advanced: full JSON</summary><textarea id="json" style="min-height:220px">' + esc(JSON.stringify(cfg, null, 2)) + '</textarea>' +
    '<p class="note">Saving uses the JSON if you edited it, otherwise the fields above.</p></details>' +
    '<div class="row" style="margin-top:14px"><button class="btn pri" id="save" type="button">Save &amp; publish</button><span id="saveres" class="note" role="status"></span></div></div>';
  const script = `
(function(){var cfg=${safeJson(cfg)},orig=JSON.stringify(cfg,null,2),json=document.getElementById('json');
document.getElementById('save').addEventListener('click',function(){var out;
if(json.value.trim()!==orig){try{out=JSON.parse(json.value)}catch(e){document.getElementById('saveres').textContent='JSON is not valid';return}}
else{out=JSON.parse(JSON.stringify(cfg));
document.querySelectorAll('[data-color]').forEach(function(i){out.colors[i.dataset.color]=i.value});
document.querySelectorAll('[data-fx]').forEach(function(i){out.fx[i.dataset.fx]=i.checked});
out.fx.font=document.getElementById('font').value;
out.hideSelectors=document.getElementById('hide').value.split('\\n').map(function(s){return s.trim()}).filter(Boolean);}
var r=document.getElementById('saveres');r.textContent='Saving...';
fetch(${safeJson(action)},{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':${safeJson(csrf)}},body:JSON.stringify({config:out})})
.then(function(x){return x.json().then(function(j){if(!x.ok)throw new Error(j.error||x.status);return j})})
.then(function(j){cfg=j.config;orig=JSON.stringify(cfg,null,2);json.value=orig;r.textContent='Saved. Users get it on their next page load.'})
.catch(function(e){r.textContent='Save failed: '+e.message})});})();`;
  return { body, script };
}

function dashboard(o) {
  const inst = o.inst, status = o.status;
  let body = '<h1>' + esc(inst.name || 'Your agency') + '</h1><p class="sub">Company ID <code>' + esc(inst.companyId) + '</code> &nbsp; ' + pill(status) + '</p>';
  if (status !== 'active') {
    body += '<div class="flash err">' + (status === 'suspended'
      ? 'This license is suspended. Contact support to re-activate it.'
      : 'The app is not installed for this agency, so the theme is switched off. Reinstall it from the HighLevel marketplace or <a href="/oauth/start">reconnect</a>.') + '</div>';
  }
  body += '<div class="card"><h2>Install the theme in HighLevel</h2>' + snippets(o.baseUrl, inst) + '</div>';
  const ed = configEditor(inst.config, '/dashboard/config', o.csrf);
  body += ed.body;
  body += '<div class="grid"><div class="card"><h2>Publish key</h2><p class="note">Lets the in-app customizer publish changes. Generating a new one disables the old one.</p>' +
    postBtn('/dashboard/publish-key', 'Generate new publish key', o.csrf, '', 'Replace your current publish key?') + '</div>' +
    '<div class="card"><h2>Allowed domains</h2><p class="note">Optional. Only load the theme on these domains (for example <code>app.youragency.com</code>, <code>*.youragency.com</code>). Leave empty to allow any.</p>' +
    '<form method="post" action="/dashboard/domains">' + csrfField(o.csrf) + '<textarea name="hosts" placeholder="app.youragency.com">' + esc((inst.allowedHosts || []).join('\n')) + '</textarea>' +
    '<div class="row" style="margin-top:10px"><button class="btn sm">Save domains</button></div></form></div></div>';
  return layout('Dashboard', body, { customer: true, csrf: o.csrf, flash: o.flash, script: ed.script });
}

/* ------------------------------------------------------------------- admin */
function adminLogin(error) {
  return layout('Admin sign in', '<div class="card" style="max-width:420px;margin:50px auto"><h1>Admin</h1>' +
    (error ? '<div class="flash err">' + esc(error) + '</div>' : '') +
    '<form method="post" action="/admin/login"><label for="pw">Password</label><input type="password" id="pw" name="password" autofocus required>' +
    '<div class="row" style="margin-top:14px"><button class="btn pri">Sign in</button></div></form></div>');
}

function adminList(o) {
  const counts = { active: 0, suspended: 0, uninstalled: 0 };
  const rows = o.rows.map((r) => {
    counts[r.status] = (counts[r.status] || 0) + 1;
    const hosts = Object.keys(r.inst.seenHosts || {}).slice(0, 3).map(esc).join('<br>') || '<small>none yet</small>';
    return '<tr><td><a href="/admin/i/' + encodeURIComponent(r.inst.companyId) + '"><b>' + esc(r.inst.name || '(no name)') + '</b></a><br><small>' + esc(r.inst.companyId) + '</small></td>' +
      '<td>' + pill(r.status) + '<br><small>' + esc(r.inst.source) + '</small></td><td><small>' + fmt(r.inst.installedAt) + '</small></td><td><small>' + hosts + '</small></td>' +
      '<td><small>' + fmt(r.inst.lastVerifiedAt) + '<br>' + esc(r.inst.lastVerifyResult || '') + '</small></td></tr>';
  }).join('');
  const body = '<h1>Agencies</h1><p class="sub">' + o.rows.length + ' total &middot; ' + counts.active + ' active &middot; ' + counts.suspended + ' suspended &middot; ' + counts.uninstalled + ' uninstalled</p>' +
    '<div class="card"><div class="row" style="justify-content:space-between"><input type="text" id="q" placeholder="Filter by name or company ID" style="max-width:340px">' +
    postBtn('/admin/verify-all', 'Verify all installs with HighLevel', o.csrf) + '</div>' +
    '<div class="scroll"><table id="t"><thead><tr><th>Agency</th><th>Status</th><th>Installed</th><th>Seen on</th><th>Last check</th></tr></thead><tbody>' +
    (rows || '<tr><td colspan="5" class="note">No agencies yet. Installs appear here after OAuth.</td></tr>') + '</tbody></table></div></div>' +
    '<div class="card" style="max-width:560px"><h2>Add a license manually</h2><p class="note">For agencies you want to license without the marketplace install (comps, testing).</p>' +
    '<form method="post" action="/admin/add">' + csrfField(o.csrf) + '<label for="ncid">Company ID</label><input type="text" id="ncid" name="companyId" required pattern="[A-Za-z0-9_-]{6,64}">' +
    '<label for="nname">Agency name</label><input type="text" id="nname" name="name"><div class="row" style="margin-top:12px"><button class="btn pri">Add license</button></div></form></div>';
  const script = `document.getElementById('q').addEventListener('input',function(){var v=this.value.toLowerCase();document.querySelectorAll('#t tbody tr').forEach(function(tr){tr.style.display=tr.textContent.toLowerCase().indexOf(v)>-1?'':'none'})});`;
  return layout('Agencies', body, { admin: true, csrf: o.csrf, flash: o.flash, script });
}

function adminDetail(o) {
  const inst = o.inst, cid = encodeURIComponent(inst.companyId), base = '/admin/i/' + cid;
  const ev = o.events.map((e) => '<tr><td><small>' + fmt(e.at) + '</small></td><td>' + esc(e.type) + '</td><td><small>' + esc(e.detail) + '</small></td></tr>').join('');
  const seen = Object.keys(inst.seenHosts || {}).map((h) => '<tr><td>' + esc(h) + '</td><td><small>' + fmt(inst.seenHosts[h]) + '</small></td></tr>').join('');
  const ed = configEditor(inst.config, base + '/config', o.csrf);
  const body = '<p><a href="/admin">&larr; All agencies</a></p><h1>' + esc(inst.name || '(no name)') + '</h1>' +
    '<p class="sub"><code>' + esc(inst.companyId) + '</code> &nbsp; ' + pill(o.status) + '</p>' +
    '<div class="grid"><div class="card"><h2>License</h2><dl>' +
    '<dt>Installed in GHL</dt><dd>' + (inst.installed ? 'yes' : 'no') + '</dd><dt>Suspended by you</dt><dd>' + (inst.suspended ? 'yes' : 'no') + '</dd>' +
    '<dt>Source</dt><dd>' + esc(inst.source) + '</dd><dt>Installed</dt><dd>' + fmt(inst.installedAt) + '</dd><dt>Uninstalled</dt><dd>' + fmt(inst.uninstalledAt) + '</dd>' +
    '<dt>Installed by user</dt><dd>' + esc(inst.installedBy || '') + '</dd><dt>Token scope</dt><dd>' + esc(inst.scope || '') + '</dd>' +
    '<dt>Token expires</dt><dd>' + fmt(inst.tokenExpiresAt) + '</dd><dt>Last check</dt><dd>' + fmt(inst.lastVerifiedAt) + ' ' + esc(inst.lastVerifyResult || '') + '</dd>' +
    '<dt>Config version</dt><dd>' + esc(inst.configVersion) + '</dd></dl>' +
    '<div class="row" style="margin-top:14px">' +
    (inst.suspended ? postBtn(base + '/resume', 'Resume license', o.csrf, 'pri') : postBtn(base + '/suspend', 'Suspend license', o.csrf, 'danger', 'Suspend this agency? Their theme turns off within a minute.')) +
    postBtn(base + '/verify', 'Verify with HighLevel', o.csrf) +
    (!inst.installed ? postBtn(base + '/mark-installed', 'Mark as installed', o.csrf) : '') +
    '</div></div>' +
    '<div class="card"><h2>Seen on domains</h2><table>' + (seen || '<tr><td class="note">Not loaded anywhere yet.</td></tr>') + '</table></div></div>' +
    '<div class="card"><h2>Embed snippets</h2>' + snippets(o.baseUrl, inst) + '</div>' +
    ed.body +
    '<div class="grid"><div class="card"><h2>Allowed domains &amp; notes</h2><form method="post" action="' + base + '/meta">' + csrfField(o.csrf) +
    '<label>Agency name</label><input type="text" name="name" value="' + esc(inst.name) + '">' +
    '<label>Allowed domains (empty = any)</label><textarea name="hosts">' + esc((inst.allowedHosts || []).join('\n')) + '</textarea>' +
    '<label>Private notes</label><textarea name="notes">' + esc(inst.notes || '') + '</textarea>' +
    '<div class="row" style="margin-top:10px"><button class="btn sm">Save</button></div></form></div>' +
    '<div class="card"><h2>Keys</h2><p class="note">New publish key: the customer must paste it again. New asset key: the CSS/JS URLs change, so the customer must update both snippets.</p>' +
    '<div class="row">' + postBtn(base + '/publish-key', 'New publish key', o.csrf, '', 'Replace the publish key?') +
    postBtn(base + '/asset-key', 'New asset URLs', o.csrf, 'danger', 'Change the CSS/JS URLs? The current snippets stop working.') + '</div>' +
    '<h2 style="margin-top:20px">Danger zone</h2>' + postBtn(base + '/delete', 'Delete agency record', o.csrf, 'danger', 'Delete this agency and its theme permanently?') + '</div></div>' +
    '<div class="card"><h2>Activity</h2><div class="scroll"><table>' + (ev || '<tr><td class="note">No events.</td></tr>') + '</table></div></div>';
  return layout(inst.name || inst.companyId, body, { admin: true, csrf: o.csrf, flash: o.flash, script: ed.script });
}

function adminEvents(o) {
  const ev = o.events.map((e) => '<tr><td><small>' + fmt(e.at) + '</small></td><td>' + (e.companyId ? '<a href="/admin/i/' + encodeURIComponent(e.companyId) + '">' + esc(e.companyId) + '</a>' : '') +
    '</td><td>' + esc(e.type) + '</td><td><small>' + esc(e.detail) + '</small></td></tr>').join('');
  return layout('Activity', '<h1>Activity</h1><div class="card scroll"><table><thead><tr><th>When</th><th>Agency</th><th>Event</th><th>Detail</th></tr></thead><tbody>' +
    (ev || '<tr><td colspan="4" class="note">Nothing yet.</td></tr>') + '</tbody></table></div>', { admin: true, csrf: o.csrf });
}

module.exports = { home, message, signIn, dashboard, adminLogin, adminList, adminDetail, adminEvents, esc };
