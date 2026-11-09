'use strict';
const fs = require('fs');
const path = require('path');

// Minimal .env loader (no dependency). Real env vars win over the file.
(function loadDotEnv() {
  const file = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(file)) return;
  fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach((line) => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] !== undefined) return;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[m[1]] = v.replace(/\\n/g, '\n');
  });
})();

/* Every app has its own HighLevel Marketplace listing, so its own
   client id / secret / SSO shared secret, read from env vars named after
   the app's env prefix, e.g. LEAD_SCORER_CLIENT_ID. */
function appCreds(env, prefix) {
  return {
    clientId: env[prefix + '_CLIENT_ID'] || '',
    clientSecret: env[prefix + '_CLIENT_SECRET'] || '',
    ssoKey: env[prefix + '_SSO_KEY'] || ''
  };
}

function load(envIn) {
  const env = envIn || process.env;
  const vercelUrl = env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + env.VERCEL_PROJECT_PRODUCTION_URL : '';
  const baseUrl = (env.BASE_URL || vercelUrl || 'http://localhost:' + (env.PORT || 3000)).replace(/\/+$/, '');
  return {
    port: Number(env.PORT || 3000),
    baseUrl,
    serverless: !!env.VERCEL,
    mongoUri: env.MONGODB_URI || '',
    mongoDb: env.MONGODB_DB || 'GhlAppSuite',
    sessionSecret: env.SESSION_SECRET || '',
    adminPassword: env.ADMIN_PASSWORD || '',
    cronSecret: env.CRON_SECRET || '',
    creds: (prefix) => appCreds(env, prefix),
    ghl: {
      authUrl: env.GHL_AUTH_URL || 'https://marketplace.gohighlevel.com/oauth/chooselocation',
      apiBase: (env.GHL_API_BASE || 'https://services.leadconnectorhq.com').replace(/\/+$/, ''),
      apiVersion: env.GHL_API_VERSION || '2021-07-28',
      // HighLevel signs every app's webhooks with the same marketplace keys.
      webhookEd25519Key: env.GHL_WEBHOOK_ED25519_KEY || '',
      webhookRsaKey: env.GHL_WEBHOOK_RSA_KEY || ''
    },
    brand: {
      name: env.BRAND_NAME || 'Growth Apps',
      supportEmail: env.SUPPORT_EMAIL || 'support@example.com',
      legalName: env.LEGAL_NAME || env.BRAND_NAME || 'Growth Apps',
      legalUpdated: env.LEGAL_UPDATED || 'November 9, 2026',
      price: env.PRICE_LABEL || '$97 / month'
    }
  };
}

function validate(cfg) {
  const problems = [];
  if (!cfg.sessionSecret || cfg.sessionSecret.length < 32) problems.push('SESSION_SECRET must be at least 32 characters');
  if (!cfg.adminPassword || cfg.adminPassword.length < 10) problems.push('ADMIN_PASSWORD must be at least 10 characters');
  if (cfg.serverless && !cfg.mongoUri) problems.push('MONGODB_URI is required on Vercel (its filesystem is not persistent)');
  return problems;
}

module.exports = { load, validate };
