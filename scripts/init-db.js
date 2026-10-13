'use strict';
/* Initializes the MongoDB Atlas database: collections, indexes and a meta
   record. Safe to run more than once. Usage:  npm run db:init
   (reads MONGODB_URI / MONGODB_DB from the environment or .env) */
const config = require('../server/config');
const { MongoClient } = require('mongodb');

(async () => {
  const cfg = config.load();
  if (!cfg.mongoUri) { console.error('MONGODB_URI is not set'); process.exit(1); }
  const client = new MongoClient(cfg.mongoUri, { serverSelectionTimeoutMS: 15000 });
  await client.connect();
  const db = client.db(cfg.mongoDb);
  await db.command({ ping: 1 });
  console.log('Connected to database "' + cfg.mongoDb + '"');

  const existing = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name);
  for (const name of ['installs', 'events', 'pairings', 'meta']) {
    if (existing.indexOf(name) === -1) { await db.createCollection(name); console.log('  created collection ' + name); }
    else console.log('  collection ' + name + ' exists');
  }

  const indexes = [
    ['installs', { key: 1 }, { unique: true, name: 'key_unique' }],
    ['installs', { installedAt: -1 }, { name: 'installedAt' }],
    ['events', { companyId: 1, at: -1 }, { name: 'company_at' }],
    ['events', { at: 1 }, { expireAfterSeconds: 180 * 86400, name: 'ttl_180d' }],
    ['pairings', { expiresAt: 1 }, { expireAfterSeconds: 0, name: 'ttl_expiry' }]
  ];
  for (const [coll, keys, opts] of indexes) {
    await db.collection(coll).createIndex(keys, opts);
    console.log('  index ' + coll + '.' + opts.name);
  }

  await db.collection('meta').updateOne({ _id: 'schema' },
    { $set: { version: 2, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } }, { upsert: true });
  console.log('Done. Agencies so far: ' + (await db.collection('installs').countDocuments()));
  await client.close();
})().catch((e) => { console.error('Init failed: ' + e.message); process.exit(1); });
