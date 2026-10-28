'use strict';
/* MongoDB Atlas store.
   Collections:
     installs  one document per agency (_id = companyId). The full record,
               including the agency's theme config, is kept in `data` as JSON
               so sidebar keys with dots ("*.custom") never clash with Mongo
               field-name rules. key / name / status are top-level for lookups.
     events    activity log, auto-deleted after 180 days (TTL index).
     pairings  10-minute "connect this domain" approvals (TTL index).
   The connection is cached on `global` so warm serverless invocations reuse it. */
const { MongoClient } = require('mongodb');

const EVENT_TTL_DAYS = 180;
// in the index list:
d.collection('installs').createIndex({ loginEmail: 1 }, { unique: true, partialFilterExpression: { loginEmail: { $type: 'string' } } }),

// next to byKey:
async byLoginEmail(email) { return parse(await (await installs()).findOne({ loginEmail: email })); },

// in put(): build `const doc = { ...same fields as before... };` then
if (inst.login && inst.login.email) doc.loginEmail = inst.login.email;
await (await installs()).replaceOne({ _id: inst.companyId }, doc, { upsert: true });
function createMongoStore(uri, dbName) {
  const cacheKey = '__ucMongo:' + uri + ':' + dbName;

  function db() {
    if (!global[cacheKey]) {
      global[cacheKey] = (async () => {
        const client = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 8000 });
        await client.connect();
        const d = client.db(dbName);
        // Best effort: a missing index only costs speed (or log cleanup), never availability.
        await Promise.all([
          d.collection('installs').createIndex({ key: 1 }, { unique: true }),
          d.collection('installs').createIndex({ installedAt: -1 }),
          d.collection('events').createIndex({ companyId: 1, at: -1 }),
          d.collection('events').createIndex({ at: 1 }, { expireAfterSeconds: EVENT_TTL_DAYS * 86400 }),
          d.collection('pairings').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
        ].map((p) => p.catch((e) => console.warn('[store] index not created: ' + e.message))));
        return { client, d };
      })().catch((e) => { global[cacheKey] = null; throw e; });
    }
    return global[cacheKey].then((x) => x.d);
  }

  const installs = async () => (await db()).collection('installs');
  const events = async () => (await db()).collection('events');
  const parse = (doc) => (doc ? JSON.parse(doc.data) : null);

  return {
    kind: 'mongo',
    async get(companyId) { return parse(await (await installs()).findOne({ _id: companyId })); },
    async byKey(key) { return parse(await (await installs()).findOne({ key })); },
    async list() {
      const docs = await (await installs()).find({}, { projection: { data: 1 } }).sort({ installedAt: -1 }).toArray();
      return docs.map(parse);
    },
    async put(inst) {
      inst.updatedAt = new Date().toISOString();
      await (await installs()).replaceOne({ _id: inst.companyId }, {
        _id: inst.companyId,
        key: inst.key,
        name: inst.name || '',
        installed: !!inst.installed,
        suspended: !!inst.suspended,
        installedAt: inst.installedAt,
        updatedAt: inst.updatedAt,
        data: JSON.stringify(inst)
      }, { upsert: true });
      return inst;
    },
    async remove(companyId) { await (await installs()).deleteOne({ _id: companyId }); },
    async log(companyId, type, detail) {
      await (await events()).insertOne({ at: new Date(), companyId: companyId || null, type, detail: detail || '' });
    },
    async events(companyId, limit) {
      const docs = await (await events()).find(companyId ? { companyId } : {}).sort({ at: -1 }).limit(limit || 50).toArray();
      return docs.map((e) => ({ at: e.at.toISOString(), companyId: e.companyId, type: e.type, detail: e.detail }));
    },
    async putPairing(p) {
      await (await db()).collection('pairings').replaceOne({ _id: p.id }, Object.assign({ _id: p.id }, p, { expiresAt: new Date(p.expiresAt) }), { upsert: true });
    },
    async getPairing(id) {
      const p = await (await db()).collection('pairings').findOne({ _id: id });
      if (!p || p.expiresAt < new Date()) return null; // TTL cleanup can lag a minute
      return { id: p.id, companyId: p.companyId, key: p.key, approved: p.approved, expiresAt: p.expiresAt.toISOString() };
    },
    async deletePairing(id) { await (await db()).collection('pairings').deleteOne({ _id: id }); },
    async ping() { await (await db()).command({ ping: 1 }); return 'ok'; },
    async close() {
      const c = global[cacheKey];
      global[cacheKey] = null;
      if (c) await (await c).client.close();
    }
  };
}

module.exports = { createMongoStore };
