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

const env = process.env;

function load() {
  // On Vercel, fall back to the production domain if BASE_URL is not set.
  const vercelUrl = env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + env.VERCEL_PROJECT_PRODUCTION_URL : '';
  const baseUrl = (env.BASE_URL || vercelUrl || 'http://localhost:' + (env.PORT || 3000)).replace(/\/+$/, '');
  return {
    port: Number(env.PORT || 3000),
    baseUrl,
    secureCookies: baseUrl.startsWith('https://'),
    dataDir: path.resolve(env.DATA_DIR || path.join(__dirname, '..', 'data')),
    mongoUri: env.MONGODB_URI || '',
    mongoDb: env.MONGODB_DB || 'UltimateThemeCustomizer',
    cronSecret: env.CRON_SECRET || '',
    serverless: !!env.VERCEL,
    // 'active' (default): an agency is licensed as soon as it installs via HighLevel.
    // 'pending': new agencies wait until you click Approve in Super Admin.
    newInstallStatus: env.NEW_INSTALL_STATUS === 'pending' ? 'pending' : 'active',
    adminPassword: env.ADMIN_PASSWORD || '',
    sessionSecret: env.SESSION_SECRET || '',
    ghl: {
      clientId: env.GHL_CLIENT_ID || '',
      clientSecret: env.GHL_CLIENT_SECRET || '',
      scopes: env.GHL_SCOPES || 'companies.readonly',
      authUrl: env.GHL_AUTH_URL || 'https://marketplace.gohighlevel.com/oauth/chooselocation',
      apiBase: (env.GHL_API_BASE || 'https://services.leadconnectorhq.com').replace(/\/+$/, ''),
      apiVersion: env.GHL_API_VERSION || '2021-07-28',
      webhookEd25519Key: env.GHL_WEBHOOK_ED25519_KEY || '',
      webhookRsaKey: env.GHL_WEBHOOK_RSA_KEY || ''
    },
    redirectUri: baseUrl + '/oauth/callback',
    brand: {
      name: env.BRAND_NAME || 'Ultimate Customizer',
      supportEmail: env.SUPPORT_EMAIL || 'idylle_radieuse@outlook.com',
      legalName: env.LEGAL_NAME || env.BRAND_NAME || 'Ultimate Customizer',
      legalUpdated: env.LEGAL_UPDATED || 'October 13, 2026',
      marketplaceUrl: env.MARKETPLACE_URL || ''
    }
  };
}

function validate(cfg) {
  const problems = [];
  if (!cfg.sessionSecret || cfg.sessionSecret.length < 32) problems.push('SESSION_SECRET must be at least 32 characters');
  if (!cfg.adminPassword || cfg.adminPassword.length < 10) problems.push('ADMIN_PASSWORD must be at least 10 characters');
  if (cfg.serverless && !cfg.mongoUri) problems.push('MONGODB_URI is required on Vercel (its filesystem is not persistent)');
  if (!cfg.ghl.clientId || !cfg.ghl.clientSecret) problems.push('GHL_CLIENT_ID and GHL_CLIENT_SECRET are required');
  return problems;
}

module.exports = { load, validate };
