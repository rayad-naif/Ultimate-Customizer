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
  console.log(cfg.appName + ' listening on :' + cfg.port);
  console.log('OAuth redirect URL (HighLevel app): ' + cfg.baseUrl + '/oauth/callback');
  console.log('Webhook URL (HighLevel app):        ' + cfg.baseUrl + '/webhooks/ghl');
  console.log('Custom page URL (HighLevel app):    ' + cfg.baseUrl + '/app');
});

// Long-running servers process due jobs every minute (on Vercel, the cron in vercel.json does this).
let running = false;
setInterval(async () => {
  if (running) return;
  running = true;
  try { await app.locals.jobs.runDue(50 * 1000); } catch (e) { console.error('job run failed', e); } finally { running = false; }
}, 60 * 1000).unref();

function shutdown() {
  server.close(() => Promise.resolve(app.locals.store.close()).finally(() => process.exit(0)));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
