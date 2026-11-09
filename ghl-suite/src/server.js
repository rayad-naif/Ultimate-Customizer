'use strict';
/* Local / long-running server. On Vercel, api/index.js is used instead. */
const config = require('./config');
const { createSuite } = require('./suite');

const cfg = config.load();
const problems = config.validate(cfg);
if (problems.length) {
  console.error('Configuration problems:\n - ' + problems.join('\n - ') + '\nSee .env.example');
  process.exit(1);
}
const app = createSuite(cfg);
const server = app.listen(cfg.port, () => {
  console.log('GHL app suite on ' + cfg.baseUrl);
  for (const a of app.locals.apps) {
    console.log(' - ' + a.name.padEnd(22) + cfg.baseUrl + '/' + a.slug + (a.ready ? '' : '   (no client id/secret yet)'));
  }
});
// The daily job (Vercel Cron does this in production).
setInterval(() => app.locals.runDaily().catch((e) => console.error('daily failed', e)), 24 * 3600e3).unref();
process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
