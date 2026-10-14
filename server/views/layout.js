'use strict';
/* Shared page chrome. Every dynamic value goes through esc(). */

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const fmt = (iso) => (iso ? esc(String(iso).replace('T', ' ').slice(0, 16)) + ' UTC' : '&mdash;');

const STATUS_LABEL = { active: 'Active', pending: 'Pending approval', suspended: 'Suspended', uninstalled: 'Uninstalled', not_installed: 'Not installed' };
const pill = (status) => '<span class="pill ' + esc(status) + '">' + esc(STATUS_LABEL[status] || status) + '</span>';

const CSS = `
:root{--bg:#000414;--panel:#000a1a;--line:rgba(0,206,209,.22);--text:#e6f7ff;--muted:#8fb7c9;--accent:#00e5ff;--teal:#00ced1;--gold:#ffd700;--bad:#ff4d5a;--ok:#2ee6a6}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background-color:var(--bg);background-image:radial-gradient(circle at 15% 0,rgba(0,206,209,.13),transparent 45%),radial-gradient(circle at 90% 10%,rgba(255,215,0,.06),transparent 40%);background-attachment:fixed;color:var(--text);font:15px/1.6 Inter,'Segoe UI',system-ui,sans-serif;min-height:100vh;display:flex;flex-direction:column}
a{color:var(--accent)}
code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.9em;background:rgba(0,229,255,.08);border:1px solid rgba(0,229,255,.15);padding:1px 6px;border-radius:6px}
.top{display:flex;align-items:center;gap:16px;padding:14px 24px;border-bottom:1px solid var(--line);background:rgba(0,10,26,.75);backdrop-filter:blur(10px);position:sticky;top:0;z-index:5;flex-wrap:wrap}
.brand{font-weight:800;letter-spacing:1px;text-transform:uppercase;background:linear-gradient(135deg,var(--teal),var(--accent) 50%,var(--gold));-webkit-background-clip:text;background-clip:text;color:transparent;text-decoration:none}
.top nav{margin-left:auto;display:flex;gap:16px;align-items:center;flex-wrap:wrap}
.top nav a{text-decoration:none;color:var(--muted);font-weight:600;font-size:14px}
.top nav a:hover,.top nav a.on{color:var(--accent)}
main{width:100%;max-width:1080px;margin:0 auto;padding:30px 16px 60px;flex:1}
h1{font-size:30px;margin:0 0 8px;line-height:1.25}
h2{font-size:19px;margin:0 0 12px;color:var(--accent);letter-spacing:.2px}
h3{font-size:16px;margin:22px 0 8px}
.sub{color:var(--muted);margin:0 0 24px}
.card{background:rgba(0,10,26,.78);border:1px solid var(--line);border-radius:16px;padding:22px;margin-bottom:18px;box-shadow:0 10px 30px rgba(0,0,0,.35)}
.grid{display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}
.grid3{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
label{display:block;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--teal);margin:12px 0 6px}
input[type=text],input[type=password],input[type=email],textarea,select{width:100%;background:rgba(0,26,51,.7);border:1px solid rgba(0,206,209,.4);color:var(--text);border-radius:9px;padding:10px 12px;font:inherit;outline:none}
input:focus,textarea:focus,select:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(0,229,255,.18)}
textarea{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px;min-height:90px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid rgba(0,229,255,.5);background:transparent;color:var(--accent);border-radius:10px;padding:10px 16px;font:inherit;font-weight:700;font-size:14px;cursor:pointer;text-decoration:none}
.btn:hover{background:rgba(0,229,255,.1)}
.btn.pri{background:var(--accent);color:#000414;border-color:var(--accent)}
.btn.pri:hover{background:var(--gold);border-color:var(--gold)}
.btn.danger{color:var(--bad);border-color:rgba(255,77,90,.5)}
.btn.danger:hover{background:rgba(255,77,90,.12)}
.btn.sm{padding:6px 11px;font-size:12.5px}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.row > form{margin:0}
.code{position:relative;background:#00040f;border:1px solid var(--line);border-radius:10px;padding:14px 92px 14px 14px;font:13px/1.5 ui-monospace,Menlo,monospace;color:#bfefff;word-break:break-all;margin:6px 0 4px}
.code .copy{position:absolute;top:9px;right:9px}
.note{color:var(--muted);font-size:13.5px}
.flash{border-radius:12px;padding:12px 14px;margin-bottom:18px;border:1px solid}
.flash.ok{border-color:rgba(46,230,166,.5);background:rgba(46,230,166,.08)}
.flash.err{border-color:rgba(255,77,90,.5);background:rgba(255,77,90,.08)}
.pill{display:inline-block;font-size:12px;font-weight:700;padding:3px 10px;border-radius:99px;border:1px solid;vertical-align:middle}
.pill.active{color:var(--ok);border-color:rgba(46,230,166,.5)}
.pill.suspended,.pill.pending{color:var(--gold);border-color:rgba(255,215,0,.5)}
.pill.uninstalled,.pill.not_installed{color:var(--bad);border-color:rgba(255,77,90,.5)}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{text-align:left;padding:10px 8px;border-bottom:1px solid rgba(0,206,209,.12);vertical-align:top}
th{font-size:11.5px;text-transform:uppercase;letter-spacing:.8px;color:var(--teal)}
td small{color:var(--muted)}
.scroll{overflow-x:auto}
dl{display:grid;grid-template-columns:max-content 1fr;gap:6px 16px;margin:0;font-size:14px}
dt{color:var(--muted)}dd{margin:0;word-break:break-all}
.hero{text-align:center;padding:40px 0 20px}
.hero h1{font-size:44px;letter-spacing:-.5px;background:linear-gradient(135deg,#fff,var(--accent) 55%,var(--gold));-webkit-background-clip:text;background-clip:text;color:transparent}
.hero p{font-size:18px;color:var(--muted);max-width:640px;margin:10px auto 26px}
.feat h3{margin:6px 0;color:var(--text)}
.feat p{margin:0;color:var(--muted);font-size:14px}
.ico{font-size:22px}
.swatches{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}
.sw{border:1px solid var(--line);border-radius:12px;overflow:hidden;background:rgba(0,10,26,.6);font-size:13px;font-weight:600}
.sw i{display:flex;height:46px}.sw i span{flex:1}.sw div{padding:8px 10px}
.prose{max-width:820px}
.prose h2{margin-top:30px}
.prose li{margin:4px 0}
.toc{columns:2;font-size:14px}
.toc a{text-decoration:none}
.steps{counter-reset:s;list-style:none;padding:0}
.steps li{counter-increment:s;position:relative;padding:0 0 14px 42px}
.steps li::before{content:counter(s);position:absolute;left:0;top:0;width:28px;height:28px;border-radius:50%;background:rgba(0,229,255,.12);border:1px solid rgba(0,229,255,.4);color:var(--accent);font-weight:800;display:grid;place-items:center;font-size:13px}
footer.site{border-top:1px solid var(--line);padding:24px 16px;color:var(--muted);font-size:13.5px;background:rgba(0,4,15,.6)}
footer.site .in{max-width:1080px;margin:0 auto;display:flex;gap:18px;flex-wrap:wrap;justify-content:space-between}
footer.site a{color:var(--muted);text-decoration:none;margin-right:16px}
footer.site a:hover{color:var(--accent)}
.result{margin-top:14px;font-weight:600}
@media (max-width:640px){.top{padding:12px 16px}.code{padding-right:14px}.code .copy{position:static;margin-top:10px}.hero h1{font-size:32px}.toc{columns:1}}
`;

// Opened inside HighLevel's sidebar frame: sign in through HighLevel SSO instead.
const FRAME_JS = "if(window.top!==window.self)location.replace('/embed');";
const COPY_JS = `document.addEventListener('click',function(e){var b=e.target.closest('[data-copy]');if(!b)return;var t=document.getElementById(b.dataset.copy).textContent;
(navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(function(){b.textContent='Copied';setTimeout(function(){b.textContent='Copy'},1500)},function(){prompt('Copy:',t)})});`;

function createLayout(brand) {
  const csrfField = (t) => '<input type="hidden" name="_csrf" value="' + esc(t) + '">';
  const postBtn = (action, label, csrf, cls, confirmMsg, extra) =>
    '<form method="post" action="' + esc(action) + '"' + (confirmMsg ? ' onsubmit="return confirm(\'' + esc(confirmMsg) + '\')"' : '') + '>' +
    csrfField(csrf) + (extra || '') + '<button class="btn sm ' + (cls || '') + '">' + esc(label) + '</button></form>';

  function layout(title, body, opts) {
    opts = opts || {};
    const navLink = (href, label) => '<a href="' + href + '"' + (opts.active === href ? ' class="on"' : '') + '>' + label + '</a>';
    let nav;
    if (opts.admin) {
      nav = navLink('/admin', 'Agencies') + navLink('/admin/events', 'Activity') +
        '<form method="post" action="/admin/logout" style="margin:0">' + csrfField(opts.csrf || '') + '<button class="btn sm">Sign out</button></form>';
    } else if (opts.embed) {
      // Inside HighLevel: no sign-out; other pages open in a new tab.
      nav = '<a href="/docs" target="_blank" rel="noopener">Docs</a><a href="/#support" target="_blank" rel="noopener">Support</a>';
    } else if (opts.customer) {
      nav = navLink('/app', 'My app') + navLink('/docs', 'Docs') + navLink('/', 'Support') +
        '<form method="post" action="/logout" style="margin:0">' + csrfField(opts.csrf || '') + '<button class="btn sm">Sign out</button></form>';
    } else {
      nav = navLink('/', 'Home') + navLink('/docs', 'Documentation') + navLink('/#support', 'Support') + navLink('/app', 'My app');
    }
    const footer = opts.admin || opts.embed ? '' : '<footer class="site"><div class="in"><div><b>' + esc(brand.name) + '</b> &middot; Premium themes for HighLevel agencies<br>' +
      'Support: <a href="mailto:' + esc(brand.supportEmail) + '" style="color:var(--accent)">' + esc(brand.supportEmail) + '</a></div>' +
      '<div><a href="/docs">Documentation</a><a href="/privacy">Privacy Policy</a><a href="/terms">Terms of Service</a><a href="/#check">License check</a></div></div></footer>';
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>' + esc(title) + ' | ' + esc(brand.name) + '</title><meta name="description" content="' + esc(opts.description || brand.name + ' - premium themes, effects and login page design for HighLevel agencies.') + '">' +
      '<style>' + CSS + '</style></head><body>' +
      '<header class="top"><a class="brand" href="' + (opts.admin ? '/admin' : '/') + '">' + esc(brand.name) + (opts.admin ? ' &middot; Super Admin' : '') + '</a><nav>' + nav + '</nav></header>' +
      '<main>' + (opts.flash ? flashHtml(opts.flash) : '') + body + '</main>' + footer +
      '<script>' + COPY_JS + (opts.framedToEmbed ? FRAME_JS : '') + (opts.script || '') + '</script></body></html>';
  }

  const flashHtml = (f) => '<div class="flash ' + (f.type === 'err' ? 'err' : 'ok') + '">' + esc(f.msg) + '</div>';

  function message(title, msg, opts) {
    return layout(title, '<div class="card" style="max-width:620px;margin:40px auto"><h1>' + esc(title) + '</h1><p class="sub">' + esc(msg) + '</p>' +
      '<a class="btn" href="' + esc((opts && opts.back) || '/') + '">Back</a></div>', opts);
  }

  return { layout, message, csrfField, postBtn, esc, fmt, pill };
}

module.exports = { createLayout, esc, fmt, pill };
