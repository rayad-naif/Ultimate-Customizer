# Ultimate Customizer

A licensed theme and effects package for HighLevel (GHL) agencies.

* **HighLevel Marketplace app (Target User: Agency)** with OAuth 2.0. An agency admin installs it and their Company ID is licensed.
* **Per-agency CSS and JS links.** Each agency gets its own `theme.css` (the IRVEX master CSS recolored with their settings) and `customizer.js` (network animations, click ripple, sub-account logo, sidebar renames and the in-app customizer).
* **License check everywhere.** The links return an empty, inert file when the agency is not installed, is suspended, or loads them on a domain that isn't allowed. The script also turns itself off if the logged-in user belongs to a different company than the license.
* **Public check page** (`/`): anyone can enter a Company ID and see whether it is licensed.
* **Customer dashboard** (`/dashboard`): sign in with HighLevel, copy the two snippets, change colors and effects, manage the publish key and allowed domains.
* **Admin panel** (`/admin`): every agency with its status, where its theme was seen, suspend/resume, manual licenses, a token check against HighLevel, key rotation and an activity log.

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

## Setup

1. **Create the app** in the HighLevel Marketplace developer portal:
   * Target User: **Agency**
   * Redirect URL: `https://YOUR-DOMAIN/oauth/callback`
   * Scopes: `companies.readonly` (used to read the agency name)
   * Webhook URL (optional but recommended): `https://YOUR-DOMAIN/webhooks/ghl`, with the `INSTALL` and `UNINSTALL` events
2. **Configure**: copy `.env.example` to `.env` and fill it in (`BASE_URL`, `GHL_CLIENT_ID`, `GHL_CLIENT_SECRET`, `ADMIN_PASSWORD`, and a long random `SESSION_SECRET`).
3. **Run** (Node 18.17+):
   ```bash
   npm install
   npm start
   ```
   Serve it over HTTPS. `DATA_DIR` holds `db.json`, so put it on a persistent disk.
4. **Install**: the agency installs the app from the marketplace, or clicks *Install / Connect with HighLevel* on `/`. They land on `/dashboard`, which shows a one-time publish key and the two snippets to paste into *Agency Settings → Company → Custom CSS / Custom JS*.

Moving your own IRVEX agency over: install the app on your agency, then replace your current Custom CSS and Custom JS with the two snippets. Your old CSS is now `server/assets/base.css`, and your old JS effects are in `client/effects.js`. To hide `#sb_app-media` and `#sb_memberships` as before, add them under *Always hide* in the dashboard.

## Editing a theme

* **In HighLevel**: agency admins see *Ultimate Customizer* in the profile menu, with a live preview of colors, presets, effects, sidebar reorder/rename/hide and hidden selectors. Paste the publish key once in the Publish tab, then *Publish to all users*.
* **Dashboard / admin panel**: quick color and effect settings, or the full JSON config.

Assets are served with `Cache-Control: no-cache` and ETags. Every page load does a cheap revalidation, so publishes and suspensions apply on the next load.

## Tests

```bash
npm test
```

The tests cover the theme engine and config sanitizing, plus the full OAuth → license → publish → domain lock → suspend → uninstall flow against a mocked HighLevel API.
