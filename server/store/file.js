'use strict';
/* JSON-file store for local development and tests.
   Same async interface as the MongoDB store. Not for serverless hosts
   (their filesystem is temporary). */
const fs = require('fs');
const path = require('path');

const MAX_EVENTS = 1000;
const copy = (o) => (o ? JSON.parse(JSON.stringify(o)) : null);

function createFileStore(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, 'db.json');
  let db = { installs: {}, events: [], pairings: {} };
  if (fs.existsSync(file)) {
    db = JSON.parse(fs.readFileSync(file, 'utf8'));
    db.installs = db.installs || {};
    db.events = db.events || [];
    db.pairings = db.pairings || {};
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
    kind: 'file',
    async get(companyId) { return copy(db.installs[companyId]); },
    async byKey(key) { return copy(all().find((i) => i.key === key)); },
    async byLoginEmail(email) { return copy(all().find((i) => i.login && i.login.email === email)); },
    async list() { return copy(all()).sort((a, b) => String(b.installedAt).localeCompare(String(a.installedAt))); },
    async put(inst) {
      inst.updatedAt = new Date().toISOString();
      db.installs[inst.companyId] = copy(inst);
      save();
      return inst;
    },
    async remove(companyId) { delete db.installs[companyId]; save(); },
    async log(companyId, type, detail) {
      db.events.unshift({ at: new Date().toISOString(), companyId: companyId || null, type, detail: detail || '' });
      if (db.events.length > MAX_EVENTS) db.events.length = MAX_EVENTS;
      save();
    },
    async events(companyId, limit) { return db.events.filter((e) => !companyId || e.companyId === companyId).slice(0, limit || 50); },
    // Short-lived "connect this domain" approvals.
    async putPairing(p) { db.pairings[p.id] = copy(p); save(); },
    async getPairing(id) {
      const p = db.pairings[id];
      if (p && Date.parse(p.expiresAt) < Date.now()) { delete db.pairings[id]; save(); return null; }
      return copy(p);
    },
    async deletePairing(id) { delete db.pairings[id]; save(); },
    async ping() { return 'ok (local file)'; },
    async close() { if (timer) { clearTimeout(timer); flush(); } }
  };
}

module.exports = { createFileStore };
