'use strict';
/* All configuration comes from environment variables (see .env.example). */
const fs = require('fs');
const path = require('path');

(function loadDotEnv() {
  const file = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[m[1]] = v.replace(/\\n/g, '\n');
  }
})();

// HighLevel's published webhook public key (docs/oauth/WebhookAuthentication.md).
// Override with GHL_WEBHOOK_PUBLIC_KEY if HighLevel rotates it.
const GHL_WEBHOOK_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAokvo/r9tVgcfZ5DysOSC
Frm602qYV0MaAiNnX9O8KxMbiyRKWeL9JpCpVpt4XHIcBOK4u3cLSqJGOLaPuXw6
dO0t6Q/ZVdAV5Phz+ZtzPL16iCGeK9po6D6JHBpbi989mmzMryUnQJezlYJ3DVfB
csedpinheNnyYeFXolrJvcsjDtfAeRx5ByHQmTnSdFUzuAnC9/GepgLT9SM4nCpv
uxmZMxrJt5Rw+VUaQ9B8JSvbMPpez4peKaJPZHBbU3OdeCVx5klVXXZQGNHOs8gF
3kvoV5rTnXV0IknLBXlcKKAQLZcY/Q9rG6Ifi9c+5vqlvHPCUJFT5XUGG5RKgOKU
J062fRtN+rLYZUV+BjafxQauvC8wSWeYja63VSUruvmNj8xkx2zE/Juc+yjLjTXp
IocmaiFeAO6fUtNjDeFVkhf5LNb59vECyrHD2SQIrhgXpO4Q3dVNA5rw576PwTzN
h/AMfHKIjE4xQA1SZuYJmNnmVZLIZBlQAF9Ntd03rfadZ+yDiOXCCs9FkHibELhC
HULgCsnuDJHcrGNd5/Ddm5hxGQ0ASitgHeMZ0kcIOwKDOzOU53lDza6/Y09T7sYJ
PQe7z0cvj7aE4B+Ax1ZoZGPzpJlZtGXCsu9aTEGEnKzmsFqwcSsnw3JB31IGKAyk
T1hhTiaCeIY/OwwwNUY2yvcCAwEAAQ==
-----END PUBLIC KEY-----`;

function load(env = process.env) {
  const vercelUrl = env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + env.VERCEL_PROJECT_PRODUCTION_URL : '';
  const baseUrl = (env.BASE_URL || vercelUrl || 'http://localhost:' + (env.PORT || 3000)).replace(/\/+$/, '');
  return {
    port: Number(env.PORT || 3000),
    baseUrl,
    appName: env.APP_NAME || 'Meeting Attendance',
    sessionSecret: env.SESSION_SECRET || '',
    cronSecret: env.CRON_SECRET || '',
    mongoUri: env.MONGODB_URI || '',
    mongoDb: env.MONGODB_DB || 'MeetingAttendance',
    serverless: !!env.VERCEL,
    ghl: {
      clientId: env.GHL_CLIENT_ID || '',
      clientSecret: env.GHL_CLIENT_SECRET || '',
      appId: env.GHL_APP_ID || '',
      ssoKey: env.GHL_SSO_KEY || '',
      apiBase: (env.GHL_API_BASE || 'https://services.leadconnectorhq.com').replace(/\/+$/, ''),
      apiVersion: env.GHL_API_VERSION || '2021-07-28',
      webhookPublicKey: (env.GHL_WEBHOOK_PUBLIC_KEY || GHL_WEBHOOK_PUBLIC_KEY).replace(/\\n/g, '\n'),
      // Set GHL_SKIP_WEBHOOK_VERIFY=1 only for local testing.
      skipWebhookVerify: env.GHL_SKIP_WEBHOOK_VERIFY === '1'
    },
    zoom: {
      clientId: env.ZOOM_CLIENT_ID || '',
      clientSecret: env.ZOOM_CLIENT_SECRET || '',
      webhookSecret: env.ZOOM_WEBHOOK_SECRET || ''
    },
    microsoft: {
      clientId: env.MS_CLIENT_ID || '',
      clientSecret: env.MS_CLIENT_SECRET || '',
      tenant: env.MS_TENANT || 'common'
    },
    google: {
      clientId: env.GOOGLE_CLIENT_ID || '',
      clientSecret: env.GOOGLE_CLIENT_SECRET || ''
    },
    claude: {
      apiKey: env.ANTHROPIC_API_KEY || '',
      model: env.CLAUDE_MODEL || 'claude-opus-5-5',
      effort: env.CLAUDE_EFFORT || 'medium'
    },
    // GHL's API docs give no maximum note length, so long notes are split into parts.
    noteMaxChars: Number(env.NOTE_MAX_CHARS || 4000),
    // Seconds a cron run may spend processing jobs (keep below the function's maxDuration).
    cronBudgetSeconds: Number(env.CRON_BUDGET_SECONDS || 240)
  };
}

function validate(cfg) {
  const p = [];
  if (!cfg.sessionSecret || cfg.sessionSecret.length < 32) p.push('SESSION_SECRET must be at least 32 characters');
  if (!cfg.ghl.clientId || !cfg.ghl.clientSecret) p.push('GHL_CLIENT_ID and GHL_CLIENT_SECRET are required');
  if (cfg.serverless && !cfg.mongoUri) p.push('MONGODB_URI is required on Vercel');
  if (cfg.serverless && !cfg.cronSecret) p.push('CRON_SECRET is required on Vercel');
  return p;
}

module.exports = { load, validate, GHL_WEBHOOK_PUBLIC_KEY };
