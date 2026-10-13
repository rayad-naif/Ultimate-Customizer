'use strict';
const config = require('./config');
const { createApp } = require('./app');

const cfg = config.load();
const problems = config.validate(cfg);
if (problems.length) {
  console.error('Configuration problems:\n - ' + problems.join('\n - ') + '\nSee .env.example');
  process.exit(1);
}

const app = createApp(cfg);
const server = app.listen(cfg.port, () => {
  console.log('Ultimate Customizer listening on :' + cfg.port);
  console.log('OAuth redirect URL for your HighLevel app: ' + cfg.redirectUri);
  console.log('Webhook URL: ' + cfg.baseUrl + '/webhooks/ghl');
});

// Daily: confirm every installed agency still has the app (catches missed UNINSTALL webhooks).
const DAY = 24 * 3600e3;
setInterval(async () => {
  const { store, lic } = app.locals;
  for (const inst of store.list()) {
    if (inst.installed && inst.tokens) { try { await lic.verify(inst); } catch (e) { /* logged on the record */ } }
  }
}, DAY).unref();

function shutdown() {
  app.locals.store.flushNow();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
