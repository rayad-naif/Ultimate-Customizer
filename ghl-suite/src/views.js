'use strict';
/* Server-rendered pages. Every dynamic value goes through esc(). */

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const fmt = (iso) => (iso ? esc(String(iso).replace('T', ' ').slice(0, 16)) + ' UTC' : '&mdash;');

const CSS = `
:root{--bg:#f6f7fb;--card:#fff;--text:#101828;--muted:#667085;--line:#e4e7ec;--accent:#155eef;--ok:#12b76a;--bad:#f04438;--warn:#f79009;--soft:#eef4ff}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.6 Inter,'Segoe UI',system-ui,-apple-system,sans-serif}
a{color:var(--accent)}
code{font:13px ui-monospace,SFMono-Regular,Menlo,monospace;background:#f2f4f7;border:1px solid var(--line);padding:1px 6px;border-radius:6px;word-break:break-all}
.top{display:flex;align-items:center;gap:14px;padding:14px 20px;background:#fff;border-bottom:1px solid var(--line);flex-wrap:wrap}
.brand{font-weight:800;color:var(--text);text-decoration:none;letter-spacing:-.2px}
.top nav{margin-left:auto;display:flex;gap:16px;flex-wrap:wrap}
.top nav a{color:var(--muted);text-decoration:none;font-weight:600;font-size:14px}
.top nav a:hover{color:var(--accent)}
main{max-width:1040px;margin:0 auto;padding:28px 16px 60px}
h1{font-size:32px;line-height:1.2;margin:0 0 10px;letter-spacing:-.5px}
h2{font-size:20px;margin:0 0 12px}
h3{font-size:16px;margin:18px 0 6px}
.sub{color:var(--muted);margin:0 0 22px;font-size:17px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:22px;margin-bottom:16px;box-shadow:0 1px 2px rgba(16,24,40,.04)}
.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
.btn{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);background:#fff;color:var(--text);border-radius:10px;padding:10px 16px;font:inherit;font-weight:700;font-size:14px;cursor:pointer;text-decoration:none}
.btn:hover{border-color:var(--accent);color:var(--accent)}
.btn.pri{background:var(--accent);border-color:var(--accent);color:#fff}
.btn.pri:hover{filter:brightness(1.08);color:#fff}
.btn:disabled{opacity:.55;cursor:default}
.btn.sm{padding:6px 11px;font-size:13px}
.hero{padding:30px 0 10px}
.badge{display:inline-block;font-size:12px;font-weight:700;padding:3px 10px;border-radius:99px;background:var(--soft);color:var(--accent)}
.price{font-size:28px;font-weight:800}
.app-ico{font-size:30px;width:54px;height:54px;border-radius:14px;display:grid;place-items:center;margin-bottom:10px}
.feat p{margin:0;color:var(--muted);font-size:14px}
.note{color:var(--muted);font-size:13.5px}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{text-align:left;padding:9px 8px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:12px;text-transform:uppercase;letter-spacing:.6px;color:var(--muted)}
.scroll{overflow-x:auto}
.pill{display:inline-block;font-size:12px;font-weight:700;padding:2px 9px;border-radius:99px}
.pill.on{background:#ecfdf3;color:#027a48}.pill.off{background:#fef3f2;color:#b42318}.pill.warn{background:#fffaeb;color:#b54708}
label.f{display:block;font-weight:600;font-size:14px;margin:14px 0 6px}
.help{color:var(--muted);font-size:12.5px;margin-top:4px}
input[type=text],input[type=number],input[type=password],input[type=time],textarea,select{width:100%;border:1px solid #d0d5dd;border-radius:9px;padding:9px 11px;font:inherit;background:#fff;color:var(--text)}
input[type=number]{max-width:140px}
input[type=time]{width:auto}
textarea{min-height:90px}
input:focus,textarea:focus,select:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px rgba(21,94,239,.15)}
.switch{display:flex;align-items:center;gap:10px;margin:12px 0;font-weight:600;font-size:14px;cursor:pointer}
.switch input{width:18px;height:18px;accent-color:var(--accent)}
.hours{display:grid;grid-template-columns:90px 150px auto 150px;justify-content:start;gap:6px 12px;align-items:center}
.users{display:grid;grid-template-columns:1fr auto;gap:6px 14px;align-items:center}
.users input{max-width:90px}
.chips{display:flex;gap:8px;flex-wrap:wrap}
.chips input{accent-color:var(--accent)}
.chips label{display:flex;gap:6px;align-items:center;border:1px solid var(--line);border-radius:99px;padding:5px 12px;font-size:13.5px;cursor:pointer}
.bar{position:sticky;bottom:0;background:var(--bg);padding:12px 0;display:flex;gap:12px;align-items:center;border-top:1px solid var(--line);margin-top:10px}
.flash{border-radius:10px;padding:11px 14px;margin-bottom:14px;font-weight:600}
.flash.ok{background:#ecfdf3;color:#027a48}.flash.err{background:#fef3f2;color:#b42318}
.stats{display:flex;gap:26px;flex-wrap:wrap}.stats b{display:block;font-size:22px}
.steps li{margin:6px 0}
footer{border-top:1px solid var(--line);padding:22px 16px;color:var(--muted);font-size:13.5px;background:#fff}
footer .in{max-width:1040px;margin:0 auto;display:flex;gap:16px;justify-content:space-between;flex-wrap:wrap}
footer a{color:var(--muted);margin-right:14px}
.prose{max-width:780px}
@media(max-width:600px){h1{font-size:26px}.hours{grid-template-columns:80px 1fr auto 1fr}}
`;

function createViews(cfg, apps) {
  const brand = cfg.brand;
  const base = cfg.baseUrl;

  function page(title, body, o) {
    o = o || {};
    const accent = o.def ? '<style>:root{--accent:' + esc(o.def.color) + ';--soft:' + esc(o.def.color) + '1a}</style>' : '';
    const nav = o.bare ? '' : '<nav>' + (o.def
      ? '<a href="/' + o.def.slug + '">Overview</a><a href="/' + o.def.slug + '/docs">Docs</a><a href="/">All apps</a><a href="mailto:' + esc(brand.supportEmail) + '">Support</a>'
      : '<a href="/">Apps</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="mailto:' + esc(brand.supportEmail) + '">Support</a>') + '</nav>';
    const foot = o.bare ? '' : '<footer><div class="in"><div><b>' + esc(brand.name) + '</b> &middot; Apps for HighLevel<br>Support: <a href="mailto:' + esc(brand.supportEmail) + '">' + esc(brand.supportEmail) + '</a></div>' +
      '<div><a href="/">All apps</a><a href="/privacy">Privacy Policy</a><a href="/terms">Terms of Service</a></div></div></footer>';
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>' + esc(title) + ' | ' + esc(brand.name) + '</title><meta name="description" content="' + esc(o.description || brand.name + ' - apps for HighLevel') + '">' +
      '<style>' + CSS + '</style>' + accent + '</head><body>' +
      (o.bare ? '' : '<header class="top"><a class="brand" href="' + (o.def ? '/' + o.def.slug : '/') + '">' + (o.def ? esc(o.def.icon + ' ' + o.def.name) : esc(brand.name)) + '</a>' + nav + '</header>') +
      '<main' + (o.wide ? ' style="max-width:1200px"' : '') + '>' + body + '</main>' + foot + (o.script ? '<script>' + o.script + '</script>' : '') + '</body></html>';
  }

  const icon = (d) => '<div class="app-ico" style="background:' + esc(d.color) + '22">' + esc(d.icon) + '</div>';
  const installBtn = (d, label) => '<a class="btn pri" href="/' + d.slug + '/install">' + esc(label || 'Install in HighLevel') + '</a>';

  function home() {
    const cards = apps.map((d) => '<div class="card">' + icon(d) + '<h2 style="margin-bottom:4px">' + esc(d.name) + '</h2><p class="note" style="margin:0 0 10px">' + esc(d.tagline) + '</p>' +
      '<p style="font-size:14px">' + esc(d.description) + '</p><p><b>' + esc(brand.price) + '</b></p><a class="btn pri" href="/' + d.slug + '">Learn more</a></div>').join('');
    return page('Apps for HighLevel', '<div class="hero"><span class="badge">HighLevel Marketplace</span><h1>Five automations every sub-account needs</h1>' +
      '<p class="sub">Install from the HighLevel Marketplace, open the app in your sub-account, done. No Zapier, no workflow spaghetti.</p></div><div class="grid">' + cards + '</div>');
  }

  function landing(d) {
    const feats = d.features.map((f) => '<div class="card feat"><h3 style="margin-top:0">' + esc(f[0]) + '</h3><p>' + esc(f[1]) + '</p></div>').join('');
    return page(d.name, '<div class="hero">' + icon(d) + '<h1>' + esc(d.tagline) + '</h1><p class="sub">' + esc(d.description) + '</p>' +
      '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><span class="price">' + esc(brand.price) + '</span>' + installBtn(d) +
      '<a class="btn" href="/' + d.slug + '/docs">How it works</a></div></div><div class="grid" style="margin-top:26px">' + feats + '</div>' +
      '<div class="card"><h2>Getting started</h2><ol class="steps"><li>Install ' + esc(d.name) + ' from the HighLevel Marketplace into your sub-account.</li>' +
      '<li>Open <b>' + esc(d.name) + '</b> from the sub-account’s left menu.</li><li>Review the settings (the defaults work out of the box) and click Save.</li></ol></div>',
    { def: d, description: d.tagline + ' ' + d.description });
  }

  function docs(d) {
    const rows = [
      ['Target user', 'Sub-account'],
      ['Redirect URL', d.oauth.redirectUri],
      ['Webhook URL', base + '/' + d.slug + '/webhook'],
      ['Custom page (Live URL)', base + '/' + d.slug + '/embed'],
      ['Website / support URL', base + '/' + d.slug],
      ['Privacy policy', base + '/privacy'],
      ['Terms of service', base + '/terms'],
      ['Scopes', d.scopes.join(' ')],
      ['Webhook events', d.webhookEvents.join(', ')],
      ['Environment variables (Vercel)', d.envPrefix + '_CLIENT_ID, ' + d.envPrefix + '_CLIENT_SECRET, ' + d.envPrefix + '_SSO_KEY']
    ];
    const settings = d.fields.map((f) => '<li><b>' + esc(f.label) + '</b>' + (f.help ? ': ' + esc(f.help) : '') + '</li>').join('');
    return page(d.name + ' docs', '<div class="prose"><h1>' + esc(d.name) + '</h1><p class="sub">' + esc(d.description) + '</p>' +
      '<div class="card"><h2>Using the app</h2><ol class="steps"><li>Install it from the HighLevel Marketplace (' + esc(brand.price) + ').</li>' +
      '<li>In the sub-account, open <b>' + esc(d.name) + '</b> in the left menu. Admins can change settings; other users can view them.</li>' +
      '<li>Settings save instantly and apply to the next event. Recent activity is shown at the bottom of the page.</li></ol>' +
      '<h3>Settings</h3><ul>' + settings + '</ul></div>' +
      '<div class="card"><h2>Marketplace listing values</h2><p class="note">For the app owner: copy these into the HighLevel developer portal.</p><div class="scroll"><table>' +
      rows.map((r) => '<tr><th style="width:220px">' + esc(r[0]) + '</th><td><code>' + esc(r[1]) + '</code></td></tr>').join('') + '</table></div></div>' +
      '<div class="card"><h2>Support</h2><p>Email <a href="mailto:' + esc(brand.supportEmail) + '">' + esc(brand.supportEmail) + '</a>. Uninstalling the app stops it immediately; settings are kept for 30 days in case you reinstall.</p></div></div>', { def: d });
  }

  function installed(d, r) {
    const names = r.installs.map((i) => '<li>' + esc(i.name || i.locationId) + '</li>').join('');
    return page('Installed', '<div class="card" style="max-width:620px;margin:30px auto">' + icon(d) + '<h1>' + esc(d.name) + ' is installed</h1>' +
      (names ? '<p>Active in:</p><ul>' + names + '</ul>' : '<p>Installed for your agency. Each sub-account is activated as soon as the app is added to it.</p>') +
      '<p>Open <b>' + esc(d.name) + '</b> from the sub-account’s left menu to review the settings. The defaults are already running.</p>' +
      '<a class="btn" href="/' + d.slug + '/docs">Read the docs</a></div>', { def: d });
  }

  function message(d, title, msg) {
    return page(title, '<div class="card" style="max-width:620px;margin:30px auto"><h1>' + esc(title) + '</h1><p class="sub">' + esc(msg) + '</p>' +
      '<a class="btn" href="' + (d ? '/' + d.slug : '/') + '">Back</a></div>', { def: d });
  }

  /* The settings app shown inside the CRM. All rendering is client-side from
     the field list; text goes through textContent (never innerHTML). */
  function embed(d) {
    const script = `
var SLUG=${JSON.stringify(d.slug)},TOKEN=null,DATA=null,root=document.getElementById('root');
function el(tag,attrs,kids){var e=document.createElement(tag);if(attrs)for(var k in attrs){if(k==='text')e.textContent=attrs[k];else if(k==='cls')e.className=attrs[k];else e.setAttribute(k,attrs[k]);}(kids||[]).forEach(function(c){if(c)e.appendChild(typeof c==='string'?document.createTextNode(c):c)});return e}
function status(msg,bad){var s=document.getElementById('status');s.className='flash '+(bad?'err':'ok');s.textContent=msg;s.style.display=msg?'':'none'}
function api(method,path,body){return fetch('/'+SLUG+'/api/'+path,{method:method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+TOKEN},body:body?JSON.stringify(body):undefined}).then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error||('Error '+r.status));return j})})}
function fail(msg,link){root.innerHTML='';var c=el('div',{cls:'card'},[el('h2',{text:'Can\\u2019t open the app'}),el('p',{text:msg})]);if(link)c.appendChild(el('a',{cls:'btn pri',href:link,target:'_blank',rel:'noopener',text:'Install'}));root.appendChild(c)}
var done=false;
window.addEventListener('message',function(e){var d=e.data;if(done||!d||d.message!=='REQUEST_USER_DATA_RESPONSE')return;done=true;
fetch('/'+SLUG+'/api/sso',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({payload:d.payload})}).then(function(r){return r.json()}).then(function(j){if(!j.token)return fail(j.error||'Sign-in failed.',j.install);TOKEN=j.token;load()}).catch(function(){fail('Could not reach the server.')})});
if(window.top===window.self){fail('Open this page from the app\\u2019s menu item inside your HighLevel sub-account.')}else{window.parent.postMessage({message:'REQUEST_USER_DATA'},'*');setTimeout(function(){if(!done)fail('HighLevel did not answer the sign-in request. Reload the page.')},10000)}
function load(){api('GET','settings').then(function(j){DATA=j;render()}).catch(function(e){fail(e.message)})}
function input(f,v){var ro=!DATA.edit,i;
 if(f.type==='bool'){i=el('input',{type:'checkbox'});i.checked=!!v;i.disabled=ro;return el('label',{cls:'switch'},[i,f.label])}
 var w=el('div',null,[el('label',{cls:'f',text:f.label})]);
 if(f.type==='int'){i=el('input',{type:'number',min:f.min,max:f.max,step:1});i.value=v}
 else if(f.type==='textarea'){i=el('textarea',{maxlength:f.max||1000});i.value=v}
 else if(f.type==='select'){i=el('select');f.options.forEach(function(o){var op=el('option',{value:o.value,text:o.label});if(o.value===v)op.selected=true;i.appendChild(op)})}
 else if(f.type==='tags'){i=el('input',{type:'text',placeholder:'tag-one, tag-two'});i.value=(v||[]).join(', ')}
 else if(f.type==='dates'){i=el('textarea',{placeholder:'2026-12-25'});i.value=(v||[]).join('\\n')}
 else if(f.type==='multiselect'){i=el('div',{cls:'chips'});f.options.forEach(function(o){var c=el('input',{type:'checkbox',value:o.value});c.checked=v.indexOf(o.value)>=0;c.disabled=ro;i.appendChild(el('label',null,[c,o.label]))})}
 else if(f.type==='hours'){i=el('div',{cls:'hours'});['mon','tue','wed','thu','fri','sat','sun'].forEach(function(dy){var h=v[dy],c=el('input',{type:'checkbox','data-d':dy});c.checked=h.on;c.disabled=ro;var a=el('input',{type:'time','data-from':dy});a.value=h.from;a.disabled=ro;var b=el('input',{type:'time','data-to':dy});b.value=h.to;b.disabled=ro;i.appendChild(el('label',{cls:'switch',style:'margin:0'},[c,dy[0].toUpperCase()+dy.slice(1)]));i.appendChild(a);i.appendChild(el('span',{cls:'note',text:'to'}));i.appendChild(b)})}
 else if(f.type==='weights'){i=el('div',{cls:'users'});var us=(DATA.options&&DATA.options.users)||[];if(!us.length)i.appendChild(el('p',{cls:'note',text:DATA.optionsError?'Could not load your team: '+DATA.optionsError:'No users found in this sub-account.'}));us.forEach(function(u){var n=el('input',{type:'number',min:0,max:10,'data-u':u.id});n.value=v[u.id]||0;n.disabled=ro;i.appendChild(el('div',null,[el('b',{text:u.name}),el('div',{cls:'note',text:u.email})]));i.appendChild(n)})}
 else{i=el('input',{type:'text',maxlength:f.max||200,placeholder:f.type==='timezone'?(DATA.install.timezone||'America/New_York'):''});i.value=v||''}
 if(i.tagName==='INPUT'||i.tagName==='TEXTAREA'||i.tagName==='SELECT')i.disabled=ro;
 w.appendChild(i);if(f.help)w.appendChild(el('div',{cls:'help',text:f.help}));return w}
function read(f,node){
 if(f.type==='bool')return node.querySelector('input').checked;
 if(f.type==='multiselect')return [].slice.call(node.querySelectorAll('input:checked')).map(function(c){return c.value});
 if(f.type==='hours'){var o={};['mon','tue','wed','thu','fri','sat','sun'].forEach(function(dy){o[dy]={on:node.querySelector('[data-d='+dy+']').checked,from:node.querySelector('[data-from='+dy+']').value,to:node.querySelector('[data-to='+dy+']').value}});return o}
 if(f.type==='weights'){var w={};[].slice.call(node.querySelectorAll('[data-u]')).forEach(function(n){if(+n.value>0)w[n.getAttribute('data-u')]=+n.value});return w}
 var x=node.querySelector('input,textarea,select').value;return f.type==='int'?Number(x):x}
function render(){root.innerHTML='';var j=DATA,ins=j.install,st=ins.stats||{};
 root.appendChild(el('div',{cls:'card'},[el('h1',{text:j.app.name,style:'font-size:24px'}),el('div',{cls:'note',text:(ins.name||'')+(ins.timezone?' \\u00b7 '+ins.timezone:'')}),
  el('div',{cls:'stats',style:'margin-top:12px'},[el('div',null,[el('b',{text:String(st.events||0)}),'events received']),el('div',null,[el('b',{text:String(st.actions||0)}),'actions taken']),el('div',null,[el('b',{text:ins.lastEventAt?ins.lastEventAt.slice(0,16).replace('T',' '):'\\u2014'}),'last event (UTC)'])])]));
 if(ins.needsReauth)root.appendChild(el('div',{cls:'flash err',text:'HighLevel no longer accepts this app\\u2019s access. Reinstall the app from the Marketplace.'}));
 root.appendChild(el('div',{id:'status',cls:'flash ok',style:'display:none'}));
 var groups={},order=[],nodes=[];j.fields.forEach(function(f){var g=f.group||'Settings';if(!groups[g]){groups[g]=el('div',{cls:'card'},[el('h2',{text:g})]);order.push(g)}var n=input(f,j.settings[f.key]);nodes.push([f,n]);groups[g].appendChild(n)});
 order.forEach(function(g){root.appendChild(groups[g])});
 (j.app.actions||[]).forEach(function(a){var b=el('button',{cls:'btn',text:a.label});b.disabled=!j.edit;b.onclick=function(){b.disabled=true;status('Working\\u2026');api('POST','action/'+a.id).then(function(r){status('Done: '+JSON.stringify(r.result));b.disabled=false}).catch(function(e){status(e.message,true);b.disabled=false})};root.appendChild(el('div',{cls:'card'},[el('h2',{text:'Tools'}),b]))});
 var ev=el('table',null,[el('tr',null,[el('th',{text:'When (UTC)'}),el('th',{text:'What'}),el('th',{text:'Detail'})])]);
 j.events.forEach(function(e){ev.appendChild(el('tr',null,[el('td',{text:e.at.slice(0,16).replace('T',' ')}),el('td',{text:e.type}),el('td',{text:e.detail})]))});
 if(!j.events.length)ev.appendChild(el('tr',null,[el('td',{colspan:3,cls:'note',text:'Nothing yet. Activity shows up here as it happens.'})]));
 root.appendChild(el('div',{cls:'card'},[el('h2',{text:'Recent activity'}),el('div',{cls:'scroll'},[ev])]));
 if(j.edit){var save=el('button',{cls:'btn pri',text:'Save settings'});save.onclick=function(){var s={};nodes.forEach(function(p){s[p[0].key]=read(p[0],p[1])});save.disabled=true;
  api('PUT','settings',{settings:s}).then(function(r){DATA.settings=r.settings;status('Saved. Changes apply to the next event.');save.disabled=false}).catch(function(e){status(e.message,true);save.disabled=false})};
  root.appendChild(el('div',{cls:'bar'},[save,el('span',{cls:'note',text:'Only admins can change settings.'})]))}
 else root.appendChild(el('p',{cls:'note',text:'View only: ask an admin to change these settings.'}))}
`;
    return page(d.name, '<div id="root"><div class="card"><p class="note">Signing you in…</p></div></div>', { def: d, bare: true, script });
  }

  function legal(title, sections) {
    return page(title, '<div class="prose card"><h1>' + esc(title) + '</h1><p class="note">Last updated ' + esc(brand.legalUpdated) + '. Applies to: ' +
      esc(apps.map((a) => a.name).join(', ')) + ' (the &ldquo;Apps&rdquo;), provided by ' + esc(brand.legalName) + '.</p>' +
      sections.map((s) => '<h3>' + esc(s[0]) + '</h3><p>' + esc(s[1]) + '</p>').join('') + '</div>');
  }
  const privacy = () => legal('Privacy Policy', [
    ['What we receive', 'When you install an App, HighLevel gives us an access token for the sub-account and sends us events (for example new contacts, inbound messages, appointments and opportunities) for the scopes you approved. The App settings page receives your HighLevel user ID and role through HighLevel single sign-on.'],
    ['What we store', 'OAuth tokens (encrypted), the sub-account name and time zone, your App settings, small working data each App needs (lead scores, round-robin counters, reply cooldowns, birthday dates by contact ID) and a 30-day activity log. We do not store message contents or copies of your contact records.'],
    ['How we use it', 'Only to run the App you installed: reading and updating contacts, opportunities and conversations in your sub-account as described in the App’s documentation. We never sell or share your data and never use it for advertising.'],
    ['Where it lives', 'Our servers run on Vercel and data is stored in MongoDB Atlas, both with encryption in transit and at rest.'],
    ['Retention and deletion', 'Uninstalling an App revokes our access immediately. Activity logs expire after 30 days. Email us to delete all data for a sub-account at any time.'],
    ['Contact', 'Questions: ' + brand.supportEmail]
  ]);
  const terms = () => legal('Terms of Service', [
    ['The service', 'Each App automates tasks inside your HighLevel sub-account. Pricing (' + brand.price + ' per App) and billing are handled by the HighLevel Marketplace.'],
    ['Your responsibilities', 'You are responsible for the messages the Apps send on your behalf, including consent, opt-out and messaging laws (such as TCPA, CAN-SPAM and GDPR) and HighLevel’s own policies.'],
    ['Availability', 'We aim for high availability but provide the Apps "as is", without warranties. HighLevel outages or API changes may affect the Apps.'],
    ['Liability', 'To the extent the law allows, our total liability is limited to the fees you paid for the affected App in the previous three months.'],
    ['Cancellation', 'Uninstall an App in HighLevel at any time; billing stops according to the Marketplace’s rules.'],
    ['Contact', brand.supportEmail]
  ]);

  function adminLogin(err) {
    return page('Admin sign in', '<div class="card" style="max-width:420px;margin:40px auto"><h1>Admin</h1>' + (err ? '<div class="flash err">' + esc(err) + '</div>' : '') +
      '<form method="post" action="/admin/login"><label class="f">Password</label><input type="password" name="password" autofocus required>' +
      '<p><button class="btn pri">Sign in</button></p></form></div>', { bare: true });
  }

  function admin(o) {
    const name = Object.fromEntries(apps.map((a) => [a.slug, a.icon + ' ' + a.name]));
    const counts = apps.map((a) => {
      const n = o.installs.filter((i) => i.app === a.slug && i.installed).length;
      return '<a class="card" style="text-decoration:none;color:inherit;margin:0" href="/admin?app=' + a.slug + '"><div class="note">' + esc(name[a.slug]) + '</div><b style="font-size:24px">' + n + '</b> <span class="note">active' + (a.ready ? '' : ' &middot; <span class="pill off">not configured</span>') + '</span></a>';
    }).join('');
    const rows = o.installs.map((i) => '<tr><td>' + esc(name[i.app] || i.app) + '</td><td><b>' + esc(i.name || '(unnamed)') + '</b><br><small class="note">' + esc(i.locationId) + '</small></td>' +
      '<td>' + (i.installed ? (i.needsReauth ? '<span class="pill warn">needs reinstall</span>' : '<span class="pill on">active</span>') : '<span class="pill off">uninstalled</span>') + '</td>' +
      '<td>' + ((i.stats && i.stats.events) || 0) + ' / ' + ((i.stats && i.stats.actions) || 0) + '</td><td>' + fmt(i.lastEventAt) + '</td><td>' + fmt(i.installedAt) + '</td></tr>').join('');
    const ev = o.events.map((e) => '<tr><td>' + fmt(e.at) + '</td><td>' + esc(name[e.app] || '') + '</td><td><small>' + esc(e.locationId || '') + '</small></td><td>' + esc(e.type) + '</td><td>' + esc(e.detail) + '</td></tr>').join('');
    return page('Admin', '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px"><h1>Admin' + (o.filter ? ': ' + esc(name[o.filter]) : '') + '</h1>' +
      '<form method="post" action="/admin/logout"><input type="hidden" name="_csrf" value="' + esc(o.csrf) + '"><button class="btn sm">Sign out</button></form></div>' +
      (o.filter ? '<p><a href="/admin">&larr; All apps</a></p>' : '<div class="grid" style="margin-bottom:16px">' + counts + '</div>') +
      '<div class="card"><h2>Installs</h2><div class="scroll"><table><tr><th>App</th><th>Sub-account</th><th>Status</th><th>Events / actions</th><th>Last event</th><th>Installed</th></tr>' +
      (rows || '<tr><td colspan="6" class="note">No installs yet.</td></tr>') + '</table></div></div>' +
      '<div class="card"><h2>Activity</h2><div class="scroll"><table><tr><th>When</th><th>App</th><th>Location</th><th>Type</th><th>Detail</th></tr>' + (ev || '<tr><td colspan="5" class="note">Nothing yet.</td></tr>') + '</table></div></div>',
    { bare: true, wide: true });
  }

  const notFound = () => page('Not found', '<div class="card" style="max-width:520px;margin:40px auto"><h1>Page not found</h1><a class="btn" href="/">All apps</a></div>');

  return { home, landing, docs, installed, message, embed, privacy, terms, adminLogin, admin, notFound };
}

module.exports = { createViews, esc };
