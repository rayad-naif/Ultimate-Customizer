'use strict';
/* Super Admin panel. */
const { safeJson } = require('../bundle');
const { esc } = require('./layout');

function createAdminViews(L, app) {
  function adminLogin(error) {
    return L.layout('Super Admin sign in', '<div class="card" style="max-width:420px;margin:50px auto"><h1>Super Admin</h1>' +
      (error ? '<div class="flash err">' + esc(error) + '</div>' : '') +
      '<form method="post" action="/admin/login"><label for="pw">Password</label><input type="password" id="pw" name="password" autofocus required>' +
      '<div class="row" style="margin-top:14px"><button class="btn pri">Sign in</button></div></form></div>', { admin: true });
  }

  function adminList(o) {
    const counts = { active: 0, pending: 0, suspended: 0, uninstalled: 0 };
    const rows = o.rows.map((r) => {
      counts[r.status] = (counts[r.status] || 0) + 1;
      const blocked = Object.keys(r.inst.blockedHosts || {}).length;
      return '<tr><td><a href="/admin/i/' + encodeURIComponent(r.inst.companyId) + '"><b>' + esc(r.inst.name || '(no name)') + '</b></a><br><small>' + esc(r.inst.companyId) + '</small></td>' +
        '<td>' + L.pill(r.status) + '<br><small>' + esc(r.inst.source) + '</small></td><td><small>' + L.fmt(r.inst.installedAt) + '</small></td>' +
        '<td><small>' + (r.inst.boundHosts.map(esc).join('<br>') || 'none') + '</small></td>' +
        '<td>' + (blocked ? '<b style="color:var(--bad)">' + blocked + '</b>' : '<small>0</small>') + '</td>' +
        '<td><small>' + L.fmt(r.inst.lastVerifiedAt) + '<br>' + esc(r.inst.lastVerifyResult || '') + '</small></td></tr>';
    }).join('');
    const body = '<h1>Agencies</h1><p class="sub">' + o.rows.length + ' total &middot; ' + counts.active + ' active &middot; ' + (counts.pending ? '<b style="color:var(--gold)">' + counts.pending + ' pending approval</b> &middot; ' : '') + counts.suspended + ' suspended &middot; ' + counts.uninstalled + ' uninstalled</p>' +
      '<div class="card"><div class="row" style="justify-content:space-between"><input type="text" id="q" placeholder="Filter by name, company ID or domain" style="max-width:340px">' +
      L.postBtn('/admin/verify-all', 'Verify installs with HighLevel', o.csrf) + '</div>' +
      '<div class="scroll"><table id="t"><thead><tr><th>Agency</th><th>Status</th><th>Installed</th><th>Connected domains</th><th>Blocked</th><th>Last check</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="6" class="note">No agencies yet. Installs appear here after OAuth.</td></tr>') + '</tbody></table></div></div>' +
      '<div class="card" style="max-width:560px"><h2>Add a license manually</h2><p class="note">For agencies you license outside the Marketplace (comps, testing).</p>' +
      '<form method="post" action="/admin/add">' + L.csrfField(o.csrf) + '<label for="ncid">Company ID</label><input type="text" id="ncid" name="companyId" required pattern="[A-Za-z0-9_-]{6,64}">' +
      '<label for="nname">Agency name</label><input type="text" id="nname" name="name"><div class="row" style="margin-top:12px"><button class="btn pri">Add license</button></div></form></div>';
    const script = `document.getElementById('q').addEventListener('input',function(){var v=this.value.toLowerCase();document.querySelectorAll('#t tbody tr').forEach(function(tr){tr.style.display=tr.textContent.toLowerCase().indexOf(v)>-1?'':'none'})});`;
    return L.layout('Agencies', body, { admin: true, csrf: o.csrf, flash: o.flash, script });
  }

  function adminDetail(o) {
    const inst = o.inst, base = '/admin/i/' + encodeURIComponent(inst.companyId);
    const ev = o.events.map((e) => '<tr><td><small>' + L.fmt(e.at) + '</small></td><td>' + esc(e.type) + '</td><td><small>' + esc(e.detail) + '</small></td></tr>').join('');
    const bound = inst.boundHosts.map((h) => '<tr><td><b>' + esc(h) + '</b></td><td><small>' + (inst.seenHosts[h] ? L.fmt(inst.seenHosts[h]) : 'not seen yet') + '</small></td><td style="text-align:right">' +
      L.postBtn(base + '/unbind', 'Remove', o.csrf, 'danger', 'Disconnect ' + h + '?', '<input type="hidden" name="host" value="' + esc(h) + '">') + '</td></tr>').join('');
    const blocked = Object.keys(inst.blockedHosts || {}).map((h) => { const b = inst.blockedHosts[h]; return '<tr><td>' + esc(h) + '</td><td>' + esc(b.n) + '</td><td><small>' + L.fmt(b.first) + '</small></td><td><small>' + L.fmt(b.last) + '</small></td><td style="text-align:right">' +
      L.postBtn(base + '/bind', 'Allow', o.csrf, '', 'Connect ' + h + ' to this license?', '<input type="hidden" name="host" value="' + esc(h) + '">') + '</td></tr>'; }).join('');

    const body = '<p><a href="/admin">&larr; All agencies</a></p><h1>' + esc(inst.name || '(no name)') + ' ' + L.pill(o.status) + '</h1>' +
      '<p class="sub"><code>' + esc(inst.companyId) + '</code></p>' +
      '<div class="grid"><div class="card"><h2>License</h2><dl>' +
      '<dt>Installed in GHL</dt><dd>' + (inst.installed ? 'yes' : 'no') + '</dd><dt>Approved</dt><dd>' + (inst.pending ? 'no (pending)' : 'yes') + '</dd><dt>Suspended</dt><dd>' + (inst.suspended ? 'yes' : 'no') + '</dd>' +
      '<dt>Source</dt><dd>' + esc(inst.source) + '</dd><dt>Installed</dt><dd>' + L.fmt(inst.installedAt) + '</dd><dt>Uninstalled</dt><dd>' + L.fmt(inst.uninstalledAt) + '</dd>' +
      '<dt>Installed by user</dt><dd>' + esc(inst.installedBy || '') + '</dd><dt>Token scope</dt><dd>' + esc(inst.scope || '') + '</dd>' +
      '<dt>Last check</dt><dd>' + L.fmt(inst.lastVerifiedAt) + ' ' + esc(inst.lastVerifyResult || '') + '</dd>' +
      '<dt>Theme</dt><dd>' + esc(inst.config.theme) + ' &middot; v' + esc(inst.configVersion) + ' &middot; ' + Object.keys(inst.config.values).length + ' custom settings</dd></dl>' +
      '<div class="row" style="margin-top:14px">' +
      (inst.pending ? L.postBtn(base + '/approve', 'Approve license', o.csrf, 'pri') : '') +
      (inst.suspended ? L.postBtn(base + '/resume', 'Resume license', o.csrf, 'pri') : L.postBtn(base + '/suspend', 'Suspend license', o.csrf, 'danger', 'Suspend this agency? Their theme turns off on the next page load.')) +
      L.postBtn(base + '/verify', 'Verify with HighLevel', o.csrf) +
      (!inst.installed ? L.postBtn(base + '/mark-installed', 'Mark as installed', o.csrf) : '') + '</div></div>' +
      '<div class="card"><h2>Snippets</h2>' + app.snippets(o.baseUrl, inst) + '</div></div>' +
      '<div class="grid"><div class="card"><h2>Connected domains</h2><table>' + (bound || '<tr><td class="note">None.</td></tr>') + '</table>' +
      '<form method="post" action="' + base + '/bind" class="row" style="margin-top:10px">' + L.csrfField(o.csrf) + '<input type="text" name="host" placeholder="app.agency.com" style="max-width:260px" required><button class="btn sm">Connect domain</button></form></div>' +
      '<div class="card"><h2>Blocked attempts</h2><p class="note">Unconnected domains that requested this agency’s files.</p><div class="scroll"><table>' +
      (blocked ? '<tr><th>Domain</th><th>Hits</th><th>First</th><th>Last</th><th></th></tr>' + blocked : '<tr><td class="note">None.</td></tr>') + '</table></div></div></div>' +
      '<div class="card"><h2>Theme settings (JSON)</h2><textarea id="cfgjson" style="min-height:260px">' + esc(JSON.stringify(inst.config, null, 2)) + '</textarea>' +
      '<div class="row" style="margin-top:10px"><button class="btn sm pri" id="savecfg" type="button">Save settings</button><span id="cfgres" class="note" role="status"></span></div></div>' +
      '<div class="grid"><div class="card"><h2>Name &amp; notes</h2><form method="post" action="' + base + '/meta">' + L.csrfField(o.csrf) +
      '<label>Agency name</label><input type="text" name="name" value="' + esc(inst.name) + '">' +
      '<label>Private notes</label><textarea name="notes">' + esc(inst.notes || '') + '</textarea>' +
      '<div class="row" style="margin-top:10px"><button class="btn sm">Save</button></div></form></div>' +
      '<div class="card"><h2>Keys &amp; access</h2><p class="note"><b>New asset URLs</b> changes both snippet URLs, so the agency must paste them again. Use it if the URLs leaked. <b>Sign out editors</b> forces every browser to reconnect.</p>' +
      '<div class="row">' + L.postBtn(base + '/revoke-editors', 'Sign out editors', o.csrf, '', 'Sign out every editor of this agency?') +
      L.postBtn(base + '/asset-key', 'New asset URLs', o.csrf, 'danger', 'Change the CSS/JS URLs? The current snippets stop working.') + '</div>' +
      '<h2 style="margin-top:20px">Danger zone</h2>' + L.postBtn(base + '/delete', 'Delete agency record', o.csrf, 'danger', 'Delete this agency and its theme permanently?') + '</div></div>' +
      '<div class="card"><h2>Activity</h2><div class="scroll"><table>' + (ev || '<tr><td class="note">No events.</td></tr>') + '</table></div></div>';
    const script = `document.getElementById('savecfg').addEventListener('click',function(){var r=document.getElementById('cfgres'),c;
try{c=JSON.parse(document.getElementById('cfgjson').value)}catch(e){r.textContent='Not valid JSON';return}
r.textContent='Saving...';fetch(${safeJson(base + '/config')},{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':${safeJson(o.csrf)}},body:JSON.stringify({config:c})})
.then(function(x){return x.json().then(function(j){if(!x.ok)throw new Error(j.error||x.status);return j})})
.then(function(j){document.getElementById('cfgjson').value=JSON.stringify(j.config,null,2);r.textContent='Saved (invalid values were dropped).'})
.catch(function(e){r.textContent='Save failed: '+e.message})});`;
    return L.layout(inst.name || inst.companyId, body, { admin: true, csrf: o.csrf, flash: o.flash, script });
  }

  function adminEvents(o) {
    const ev = o.events.map((e) => '<tr><td><small>' + L.fmt(e.at) + '</small></td><td>' + (e.companyId ? '<a href="/admin/i/' + encodeURIComponent(e.companyId) + '">' + esc(e.companyId) + '</a>' : '') +
      '</td><td>' + esc(e.type) + '</td><td><small>' + esc(e.detail) + '</small></td></tr>').join('');
    return L.layout('Activity', '<h1>Activity</h1><div class="card scroll"><table><thead><tr><th>When</th><th>Agency</th><th>Event</th><th>Detail</th></tr></thead><tbody>' +
      (ev || '<tr><td colspan="4" class="note">Nothing yet.</td></tr>') + '</tbody></table></div>', { admin: true, csrf: o.csrf });
  }

  return { adminLogin, adminList, adminDetail, adminEvents };
}

module.exports = { createAdminViews };
