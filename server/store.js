'use strict';
/* JSON-file store with atomic writes. Plenty for hundreds of agencies;
   swap this module for a real database later without touching routes. */
const fs = require('fs');
const path = require('path');

const MAX_EVENTS = 1000;

function createStore(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, 'db.json');
  let db = { installs: {}, events: [] };
  if (fs.existsSync(file)) {
    db = JSON.parse(fs.readFileSync(file, 'utf8'));
    db.installs = db.installs || {};
    db.events = db.events || [];
  }

  let timer = null;
  function flush() {
    timer = null;
    const tmp = file + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, file);
  }
  function save() { if (!timer) timer = setTimeout(flush, 50); }

  const all = () => Object.values(db.installs);

  return {
    get: (companyId) => db.installs[companyId] || null,
    byKey: (key) => all().find((i) => i.key === key) || null,
    list: () => all().sort((a, b) => String(b.installedAt).localeCompare(String(a.installedAt))),
    put(inst) {
      inst.updatedAt = new Date().toISOString();
      db.installs[inst.companyId] = inst;
      save();
      return inst;
    },
    remove(companyId) { delete db.installs[companyId]; save(); },
    log(companyId, type, detail) {
      db.events.unshift({ at: new Date().toISOString(), companyId: companyId || null, type, detail: detail || '' });
      if (db.events.length > MAX_EVENTS) db.events.length = MAX_EVENTS;
      save();
    },
    events: (companyId, limit) => db.events.filter((e) => !companyId || e.companyId === companyId).slice(0, limit || 50),
    flushNow() { if (timer) { clearTimeout(timer); flush(); } }
  };
}

module.exports = { createStore };
