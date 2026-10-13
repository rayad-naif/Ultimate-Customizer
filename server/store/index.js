'use strict';
/* MONGODB_URI set -> MongoDB Atlas. Otherwise a local JSON file (dev/tests). */
function createStore(cfg) {
  if (cfg.mongoUri) return require('./mongo').createMongoStore(cfg.mongoUri, cfg.mongoDb);
  return require('./file').createFileStore(cfg.dataDir);
}

module.exports = { createStore };
