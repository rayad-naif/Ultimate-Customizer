'use strict';
/* Storage. MONGODB_URI set -> MongoDB Atlas (free M0 is plenty).
   Otherwise an in-memory store (local development and tests only).

   Collections
     installs   one document per app + sub-account (_id "<app>:<locationId>")
     companies  agency tokens from bulk installs (_id "<app>:<companyId>")
     events     activity log, auto-deleted after 30 days
     kv         small app state: counters, cooldowns, birthday index, webhook
                de-duplication. Optional expiry (TTL index).            */
const EVENT_TTL_DAYS = 30;
const copy = (o) => (o == null ? null : JSON.parse(JSON.stringify(o)));
const expiry = (ttlSec) => (ttlSec ? new Date(Date.now() + ttlSec * 1000) : null);

function createMemoryStore() {
  const installs = new Map(), companies = new Map(), kv = new Map();
  let events = [];
  const live = (e) => e && (!e.expiresAt || e.expiresAt > new Date());
  return {
    kind: 'memory',
    async getInstall(app, loc) { return copy(installs.get(app + ':' + loc)); },
    async putInstall(i) { i.updatedAt = new Date().toISOString(); installs.set(i.app + ':' + i.locationId, copy(i)); return i; },
    // Partial update: set {path: value} and inc {path: n}. Paths may be "a.b".
    async patchInstall(app, loc, set, inc) {
      const i = installs.get(app + ':' + loc);
      if (!i) return;
      const at = (path) => { const ks = path.split('.'); let o = i; while (ks.length > 1) { const k = ks.shift(); o = o[k] = o[k] || {}; } return [o, ks[0]]; };
      for (const [k, v] of Object.entries(set || {})) { const [o, last] = at(k); o[last] = copy(v); }
      for (const [k, v] of Object.entries(inc || {})) { const [o, last] = at(k); o[last] = Number(o[last] || 0) + v; }
      i.updatedAt = new Date().toISOString();
    },
    async listInstalls(q) {
      q = q || {};
      return copy([...installs.values()].filter((i) => (!q.app || i.app === q.app) && (q.installed == null || i.installed === q.installed))
        .sort((a, b) => String(b.installedAt).localeCompare(String(a.installedAt))));
    },
    async getCompany(app, id) { return copy(companies.get(app + ':' + id)); },
    async putCompany(c) { companies.set(c.app + ':' + c.companyId, copy(c)); return c; },
    async log(app, loc, type, detail) {
      events.unshift({ at: new Date().toISOString(), app: app || null, locationId: loc || null, type, detail: String(detail || '').slice(0, 500) });
      if (events.length > 2000) events.length = 2000;
    },
    async events(q) {
      q = q || {};
      return copy(events.filter((e) => (!q.app || e.app === q.app) && (!q.locationId || e.locationId === q.locationId)).slice(0, q.limit || 50));
    },
    async kvGet(k) { const e = kv.get(k); return live(e) ? copy(e.v) : null; },
    async kvSet(k, v, ttl) { kv.set(k, { v: copy(v), expiresAt: expiry(ttl) }); },
    async kvDel(k) { kv.delete(k); },
    async kvSetNX(k, v, ttl) {
      if (live(kv.get(k))) return false;
      kv.set(k, { v: copy(v), expiresAt: expiry(ttl) });
      return true;
    },
    async kvIncr(k, by, ttl) {
      const e = live(kv.get(k)) ? kv.get(k) : { v: 0, expiresAt: expiry(ttl) };
      e.v = Number(e.v || 0) + by;
      kv.set(k, e);
      return e.v;
    },
    async kvList(prefix, limit) {
      const out = [];
      for (const [k, e] of kv) if (k.startsWith(prefix) && live(e)) { out.push({ key: k, value: copy(e.v) }); if (out.length >= (limit || 1000)) break; }
      return out;
    },
    async ping() { return 'ok (memory: data is lost on restart)'; },
    async close() {}
  };
}

function createMongoStore(uri, dbName) {
  const { MongoClient } = require('mongodb');
  const cacheKey = '__suiteMongo:' + uri + ':' + dbName;
  function db() {
    if (!global[cacheKey]) {
      global[cacheKey] = (async () => {
        const client = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 8000 });
        await client.connect();
        const d = client.db(dbName);
        await Promise.all([
          d.collection('installs').createIndex({ app: 1, installed: 1, installedAt: -1 }),
          d.collection('events').createIndex({ app: 1, locationId: 1, at: -1 }),
          d.collection('events').createIndex({ at: 1 }, { expireAfterSeconds: EVENT_TTL_DAYS * 86400 }),
          d.collection('kv').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
        ].map((p) => p.catch((e) => console.warn('[store] index not created: ' + e.message))));
        return { client, d };
      })().catch((e) => { global[cacheKey] = null; throw e; });
    }
    return global[cacheKey].then((x) => x.d);
  }
  const col = async (n) => (await db()).collection(n);
  const strip = (doc) => { if (!doc) return null; delete doc._id; return doc; };
  const notExpired = () => ({ $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] });
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  return {
    kind: 'mongo',
    async getInstall(app, loc) { return strip(await (await col('installs')).findOne({ _id: app + ':' + loc })); },
    async putInstall(i) {
      i.updatedAt = new Date().toISOString();
      await (await col('installs')).replaceOne({ _id: i.app + ':' + i.locationId }, Object.assign({}, i), { upsert: true });
      return i;
    },
    async patchInstall(app, loc, set, inc) {
      const u = { $set: Object.assign({ updatedAt: new Date().toISOString() }, set || {}) };
      if (inc && Object.keys(inc).length) u.$inc = inc;
      await (await col('installs')).updateOne({ _id: app + ':' + loc }, u);
    },
    async listInstalls(q) {
      q = q || {};
      const f = {};
      if (q.app) f.app = q.app;
      if (q.installed != null) f.installed = q.installed;
      return (await (await col('installs')).find(f).sort({ installedAt: -1 }).limit(q.limit || 5000).toArray()).map(strip);
    },
    async getCompany(app, id) { return strip(await (await col('companies')).findOne({ _id: app + ':' + id })); },
    async putCompany(c) { await (await col('companies')).replaceOne({ _id: c.app + ':' + c.companyId }, Object.assign({}, c), { upsert: true }); return c; },
    async log(app, loc, type, detail) {
      await (await col('events')).insertOne({ at: new Date(), app: app || null, locationId: loc || null, type, detail: String(detail || '').slice(0, 500) });
    },
    async events(q) {
      q = q || {};
      const f = {};
      if (q.app) f.app = q.app;
      if (q.locationId) f.locationId = q.locationId;
      const docs = await (await col('events')).find(f).sort({ at: -1 }).limit(q.limit || 50).toArray();
      return docs.map((e) => ({ at: e.at.toISOString(), app: e.app, locationId: e.locationId, type: e.type, detail: e.detail }));
    },
    async kvGet(k) {
      const d = await (await col('kv')).findOne(Object.assign({ _id: k }, notExpired()));
      return d ? d.v : null;
    },
    async kvSet(k, v, ttl) { await (await col('kv')).replaceOne({ _id: k }, { v, expiresAt: expiry(ttl) }, { upsert: true }); },
    async kvDel(k) { await (await col('kv')).deleteOne({ _id: k }); },
    async kvSetNX(k, v, ttl) {
      const c = await col('kv');
      try { await c.insertOne({ _id: k, v, expiresAt: expiry(ttl) }); return true; } catch (e) {
        if (e.code !== 11000) throw e;
        // The TTL monitor runs about once a minute: take over an expired key.
        const r = await c.updateOne({ _id: k, expiresAt: { $ne: null, $lte: new Date() } }, { $set: { v, expiresAt: expiry(ttl) } });
        return r.modifiedCount === 1;
      }
    },
    async kvIncr(k, by, ttl) {
      const c = await col('kv');
      await c.deleteOne({ _id: k, expiresAt: { $ne: null, $lte: new Date() } });
      const r = await c.findOneAndUpdate({ _id: k }, { $inc: { v: by }, $setOnInsert: { expiresAt: expiry(ttl) } }, { upsert: true, returnDocument: 'after' });
      const doc = r && r.value !== undefined && r.ok !== undefined ? r.value : r; // driver v5 vs v6 result shape
      return doc ? doc.v : by;
    },
    async kvList(prefix, limit) {
      const docs = await (await col('kv')).find(Object.assign({ _id: { $regex: '^' + escRe(prefix) } }, notExpired())).limit(limit || 1000).toArray();
      return docs.map((d) => ({ key: d._id, value: d.v }));
    },
    async ping() { await (await db()).command({ ping: 1 }); return 'ok'; },
    async close() {
      const c = global[cacheKey];
      global[cacheKey] = null;
      if (c) await (await c).client.close();
    }
  };
}

function createStore(cfg) {
  return cfg.mongoUri ? createMongoStore(cfg.mongoUri, cfg.mongoDb) : createMemoryStore();
}

module.exports = { createStore, createMemoryStore, createMongoStore };
