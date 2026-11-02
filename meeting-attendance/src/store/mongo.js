'use strict';
/* MongoDB store. Holds only what GHL cannot: encrypted OAuth tokens, the queue
   of meetings waiting to be checked, webhook de-duplication and a capped log.
   Collections:
     locations  one per installed sub-account (tokens, connector tokens, field ids)
     companies  agency tokens for bulk installs (used to mint location tokens)
     jobs       one per meeting waiting to be checked; deleted when done
     seen       webhook ids, auto-deleted after 48 h (TTL)
     log        capped at 20 MB, no personal data */
const { MongoClient } = require('mongodb');

function createMongoStore(uri, dbName) {
  const cacheKey = '__maMongo:' + uri + ':' + dbName;
  function db() {
    if (!global[cacheKey]) {
      global[cacheKey] = (async () => {
        const client = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 8000 });
        await client.connect();
        const d = client.db(dbName);
        try {
          await d.createCollection('log', { capped: true, size: 20 * 1024 * 1024 });
        } catch (e) { /* already exists */ }
        await Promise.all([
          d.collection('jobs').createIndex({ dueAt: 1 }),
          d.collection('jobs').createIndex({ locationId: 1, eventIds: 1 }),
          d.collection('seen').createIndex({ at: 1 }, { expireAfterSeconds: 48 * 3600 })
        ].map((p) => p.catch((e) => console.warn('[store] index: ' + e.message))));
        d.__client = client;
        return d;
      })().catch((e) => { global[cacheKey] = null; throw e; });
    }
    return global[cacheKey];
  }
  const col = async (n) => (await db()).collection(n);

  return {
    kind: 'mongo',
    async getLocation(id) { return (await col('locations')).findOne({ _id: id }); },
    async saveLocation(doc) {
      doc.updatedAt = new Date();
      await (await col('locations')).replaceOne({ _id: doc._id }, doc, { upsert: true });
      return doc;
    },
    async deleteLocation(id) { await (await col('locations')).deleteOne({ _id: id }); },
    async getCompany(id) { return (await col('companies')).findOne({ _id: id }); },
    async saveCompany(doc) {
      doc.updatedAt = new Date();
      await (await col('companies')).replaceOne({ _id: doc._id }, doc, { upsert: true });
      return doc;
    },
    async deleteCompany(id) { await (await col('companies')).deleteOne({ _id: id }); },

    async scheduleEvent(j) {
      await (await col('jobs')).updateOne(
        { _id: j.key },
        {
          $addToSet: { eventIds: j.eventId },
          $setOnInsert: {
            locationId: j.locationId, calendarId: j.calendarId, startTime: j.startTime, endTime: j.endTime,
            address: j.address, stage: 'attendance', attempts: 0, dueAt: j.dueAt, leaseUntil: new Date(0)
          }
        },
        { upsert: true }
      );
    },
    async unscheduleEvent(locationId, eventId, exceptKey) {
      const c = await col('jobs');
      const filter = { locationId, eventIds: eventId, stage: 'attendance' };
      if (exceptKey) filter._id = { $ne: exceptKey };
      await c.updateMany(filter, { $pull: { eventIds: eventId } });
      await c.deleteMany({ locationId, eventIds: { $size: 0 } });
    },
    async claimDue(now, limit, leaseMs) {
      const c = await col('jobs');
      const out = [];
      for (let i = 0; i < limit; i++) {
        const r = await c.findOneAndUpdate(
          { dueAt: { $lte: now }, leaseUntil: { $lte: now } },
          { $set: { leaseUntil: new Date(now.getTime() + leaseMs) } },
          { sort: { dueAt: 1 }, returnDocument: 'after' }
        );
        const doc = r && r.value !== undefined ? r.value : r;
        if (!doc) break;
        out.push(doc);
      }
      return out;
    },
    async getJob(key) { return (await col('jobs')).findOne({ _id: key }); },
    async saveJob(job) { await (await col('jobs')).replaceOne({ _id: job._id }, job, { upsert: true }); },
    async deleteJob(key) { await (await col('jobs')).deleteOne({ _id: key }); },
    async deleteJobsForLocation(locationId) { await (await col('jobs')).deleteMany({ locationId }); },

    async seen(id) {
      try {
        await (await col('seen')).insertOne({ _id: String(id), at: new Date() });
        return false;
      } catch (e) {
        if (e && e.code === 11000) return true;
        throw e;
      }
    },
    async log(locationId, code, detail) {
      try {
        await (await col('log')).insertOne({ at: new Date(), locationId: locationId || null, code, detail: String(detail || '').slice(0, 300) });
      } catch (e) { console.warn('[log] ' + e.message); }
    },
    async recentLogs(locationId, n) {
      const q = locationId ? { locationId } : {};
      return (await col('log')).find(q, { projection: { _id: 0 } }).sort({ $natural: -1 }).limit(n || 50).toArray();
    },
    async ping() { await (await db()).command({ ping: 1 }); return 'mongo'; },
    async close() {
      const p = global[cacheKey];
      global[cacheKey] = null;
      if (p) { try { const d = await p; await d.__client.close(); } catch (e) { /* ignore */ } }
    }
  };
}

module.exports = { createMongoStore };
