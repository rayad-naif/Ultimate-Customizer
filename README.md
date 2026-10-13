# Ultimate Customizer

A licensed theme and effects package for HighLevel (GHL) agencies.

* **HighLevel Marketplace app (Target User: Agency)** with OAuth 2.0. An agency admin installs it and their Company ID is licensed.
* **Per-agency CSS and JS links.** Each agency gets its own `theme.css` (the IRVEX master CSS recolored with their settings) and `customizer.js` (network animations, click ripple, sub-account logo, sidebar renames and the in-app customizer).
* **License check everywhere.** The links return an empty, inert file when the agency is not installed, is suspended, or loads them on a domain that isn't allowed. The script also turns itself off if the logged-in user belongs to a different company than the license.
* **Public check page** (`/`): anyone can enter a Company ID and see whether it is licensed.
* **Customer dashboard** (`/dashboard`): sign in with HighLevel, copy the two snippets, change colors and effects, manage the publish key and allowed domains.
* **Super Admin panel** (`/admin/login`): every agency with its status, where its theme was seen, suspend/resume, manual licenses, a token check against HighLevel, key rotation and an activity log.

## How it fits together

```
Agency admin installs app ──► /oauth/callback ──► token (userType=Company, companyId)
                                                   │
                                                   ▼
                                     install record (companyId, asset key,
                                     publish key hash, config, encrypted tokens)
                                                   │
HighLevel Custom CSS:  @import url(".../c/<key>/theme.css");   ◄─ licensed? config → CSS
HighLevel Custom JS:   <script src=".../c/<key>/customizer.js"> ◄─ licensed? config → JS
                                                   │
In-app "Ultimate Customizer" (agency admins) ──► POST /api/publish (publish key) ──► new config
```

* `server/assets/base.css` is the master CSS. Each agency's CSS is generated from it by `shared/theme-engine.js`, the same engine the in-app live preview uses.
* `client/` holds the browser code that is bundled into each agency's `customizer.js`: `runtime.js` (license guard, network hooks, preview layer), `effects.js` and `customizer.js`.
* `UNINSTALL` webhooks are confirmed before a license is turned off. If no webhook signing key is configured, the server refreshes the agency token; HighLevel rejects the refresh once the app is uninstalled. A daily sweep does the same for every install, so a missed webhook is caught.

## URLs

| Page | URL |
| --- | --- |
| **Super Admin login** | `https://YOUR-DOMAIN/admin/login` (password = `ADMIN_PASSWORD`) |
| Super Admin panel | `https://YOUR-DOMAIN/admin` |
| Public license check | `https://YOUR-DOMAIN/` |
| Customer dashboard | `https://YOUR-DOMAIN/dashboard` (sign in with HighLevel) |
| OAuth redirect (put in the GHL app) | `https://YOUR-DOMAIN/oauth/callback` |
| Webhook (put in the GHL app) | `https://YOUR-DOMAIN/webhooks/ghl` |

## Deploy on Vercel + MongoDB Atlas

1. **MongoDB Atlas**
   * Create a cluster (the free M0 tier is enough to start) and a database user.
   * *Network Access*: allow `0.0.0.0/0`, because Vercel functions don't have fixed IPs. You can also use the official Vercel ↔ MongoDB Atlas integration, which sets this up and adds `MONGODB_URI` for you.
   * Copy the `mongodb+srv://...` connection string.
2. **Vercel**
   * Import this repository as a new project. No build settings are needed; `vercel.json` routes every request to `api/index.js`.
   * Add these environment variables (Production):

     | Variable | Value |
     | --- | --- |
     | `MONGODB_URI` | Atlas connection string |
     | `MONGODB_DB` | `ultimate_customizer` (optional) |
     | `BASE_URL` | `https://YOUR-DOMAIN` (your custom domain, or `https://<project>.vercel.app`) |
     | `GHL_CLIENT_ID` / `GHL_CLIENT_SECRET` | from the HighLevel app |
     | `GHL_SCOPES` | `companies.readonly` |
     | `ADMIN_PASSWORD` | Super Admin password, 10+ characters |
     | `SESSION_SECRET` | 32+ random characters, e.g. `openssl rand -base64 48` |
     | `CRON_SECRET` | random string; Vercel Cron sends it to `/api/cron/verify` |

   * Deploy. If a variable is missing, every page shows which one.
3. **HighLevel Marketplace app**
   * Target User: **Agency**
   * Redirect URL: `https://YOUR-DOMAIN/oauth/callback`
   * Scopes: `companies.readonly`
   * Webhook URL (recommended): `https://YOUR-DOMAIN/webhooks/ghl`, with the `INSTALL` and `UNINSTALL` events
4. **Install**: the agency installs the app (or clicks *Install / Connect with HighLevel* on `/`). They land on `/dashboard`, which shows a one-time publish key and the two snippets for *Agency Settings → Company → Custom CSS / Custom JS*.

`vercel.json` also schedules a daily cron (`/api/cron/verify`) that re-checks installs with HighLevel, oldest first, to catch missed uninstall webhooks.

### What is stored in MongoDB

* `installs`: one document per agency, with the Company ID, asset key, publish key hash, theme settings (colors, effects, sidebar, hidden selectors), allowed domains, the domains it was seen on, and encrypted HighLevel tokens.
* `events`: the activity log, deleted automatically after 180 days.

Each agency's CSS and JS files are generated from its stored settings when they are requested, then cached in memory. That keeps them always in sync with the settings: a publish or suspension applies on the next page load.

### Running elsewhere / locally

```bash
cp .env.example .env   # fill it in; leave MONGODB_URI empty to use a local JSON file
npm install
npm start              # http://localhost:3000
```

Moving your own IRVEX agency over: install the app on your agency, then replace your current Custom CSS and Custom JS with the two snippets. Your old CSS is now `server/assets/base.css`, and your old JS effects are in `client/effects.js`. To hide `#sb_app-media` and `#sb_memberships` as before, add them under *Always hide* in the dashboard.

## Editing a theme

* **In HighLevel**: agency admins see *Ultimate Customizer* in the profile menu, with a live preview of colors, presets, effects, sidebar reorder/rename/hide and hidden selectors. Paste the publish key once in the Publish tab, then *Publish to all users*.
* **Dashboard / admin panel**: quick color and effect settings, or the full JSON config.

Assets are served with `Cache-Control: no-cache` and ETags. Every page load does a cheap revalidation, so publishes and suspensions apply on the next load.

## Tests

```bash
npm test
```

The tests cover the theme engine and config sanitizing, plus the full OAuth → license → publish → domain lock → suspend → uninstall flow against a mocked HighLevel API. To run the same flow against MongoDB, set `TEST_MONGODB_URI=mongodb://...`.
