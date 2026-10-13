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

// Daily (long-running servers only; on Vercel the cron in vercel.json does this):
// confirm installed agencies still have the app, catching missed UNINSTALL webhooks.
setInterval(() => { app.locals.verifyBatch(500).catch((e) => console.error('verify sweep failed', e)); }, 24 * 3600e3).unref();

function shutdown() {
  server.close(() => Promise.resolve(app.locals.store.close()).finally(() => process.exit(0)));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
