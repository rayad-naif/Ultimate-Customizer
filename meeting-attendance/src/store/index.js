'use strict';
function createStore(cfg) {
  if (cfg.mongoUri) return require('./mongo').createMongoStore(cfg.mongoUri, cfg.mongoDb);
  return require('./memory').createMemoryStore();
}
module.exports = { createStore };
