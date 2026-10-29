# Ultimate Customizer

A HighLevel Marketplace app (Target User: **Agency**) that lets an agency restyle its whole white-label CRM and login page from inside the CRM. It has 212 settings, 16 prebuilt themes and live preview, and every change saves automatically to MongoDB Atlas and reaches every user.

## Pages

| Page | URL |
| --- | --- |
| Home / support | `https://cuztomizer.ironix.dev/` |
| Documentation | `/docs` |
| Privacy Policy | `/privacy` |
| Terms of Service | `/terms` |
| **Sidebar page** (HighLevel app's Custom Page / Live URL) | `/embed`: signs the agency admin in via HighLevel SSO (`GHL_SSO_KEY`) and shows the app page inside HighLevel |
| **App page** (after HighLevel OAuth only) | `/app`: the two snippets and the connected domains |
| **Super Admin login** | `/admin/login` (password = `ADMIN_PASSWORD`) |
| OAuth redirect URL (put in the GHL app) | `/oauth/callback` |
| Webhook URL (put in the GHL app) | `/webhooks/ghl` |

## Signing in to the app page (/app)

The CRM OAuth popup is **only used to install**. Opening the app page afterwards uses an email and password, so it never goes back through the CRM authorize screen (which refuses paid apps that are already installed).

- **First open after install:** the OAuth callback sends the agency admin to `/app/setup` to choose an email and password (10+ characters, stored as a salted scrypt hash). Nothing else is reachable until that is saved.
- **Every new session:** `/app` shows the email + password form. "Keep me signed in for 7 days" sets a 7-day cookie; without it the cookie ends when the browser closes (and the session expires after 12 hours).
- **Sign out:** returns to the login form.
- **Change or reset the password:** open the app in the CRM sidebar (SSO signs the admin in) and use **Set / Change email & password** on the app page. Changing the password signs out every other browser.
- Login attempts are rate limited per IP and per email. Existing MongoDB deployments: run `npm run db:init` once to add the unique `loginEmail` index.

## How it works

1. An agency admin installs the app. OAuth only accepts **Company** (agency) tokens, and lands them on `/app`.
2. `/app` shows two snippets for *Agency Settings → Company*:
   * Custom CSS: `@import url("…/c/<key>/theme.css");`
   * Custom JS: `<script src="…/c/<key>/customizer.js"></script>`
3. In the CRM, the profile menu shows **Connect Ultimate Customizer** above Sign out. Connecting opens a popup on this app where an admin of *that* agency approves after HighLevel sign-in. The domain is then bound to the license, and that browser gets a 30-day editor token.
4. **Ultimate Customizer** opens the editor:
   * **Themes**: 16 one-click designs
   * **Colors**: the brand palette that every section follows
   * **Sidebar**: background, menu text, network animation
   * **Header**: buttons, avatar, dropdown, badges
   * **Navigation**: top tabs, location switcher, banner
   * **Content**: light/dark cards, inputs, buttons, alerts, headings
   * **Login page**: layout, background image, logo, card, fields, heading/tagline, network, with a live preview overlay
   * **Effects**: fonts, glow, blur, roundness, motion, ripple, loader, sub-account logo
   * **Menu**: reorder, rename and hide sidebar items
   * **Advanced**: section switches, custom CSS, backup/restore
5. Edits preview instantly and autosave (`PUT /api/config`, about 0.7 s later). Open CRM tabs poll `/c/<key>/v.json` and repaint within a minute; other users get the change on their next load.

### Locking a purchase to one agency

| Layer | What it stops |
| --- | --- |
| **License gate**: files are inert unless the app is installed (OAuth/webhooks/daily cron) and not suspended | uninstalled or unpaid agencies |
| **Domain binding**: the full CSS/JS is only served to domains approved by an admin of the licensed agency. The domain comes from the browser's `Origin`/`Referer`, never from request data | pasting the snippets into another agency's CRM |
| **Runtime company check**: the script reads the signed-in user's `companyId` from HighLevel's own API responses and shuts everything off if it's another agency | the script running anywhere else |
| **Shared HighLevel domains** (`app.gohighlevel.com`): the theme is fetched only after the company check passes | agencies sharing the same host |
| **Monitoring**: unknown domains requesting the files appear as *Blocked attempts* in Super Admin, where you can suspend, rotate asset URLs or sign out editors | finding and stopping leaks |

Anything delivered to a browser can be copied by hand, so no web app can make CSS impossible to copy. These layers stop casual reuse and make deliberate copying visible.

### Code map

* `server/assets/theme.template.css`: the IRVEX master CSS with every value tokenized (`[[id]]`, `[[id/0.3]]`, `[[id*12px]]`). With default settings it reproduces the original CSS rule for rule.
* `shared/registry.js`: every setting, the tabs and the themes. The UI is generated from it.
* `shared/theme-engine.js`: validation and compilation, shared by the server and the browser.
* `client/`: `runtime.js` (license guard, preview, saving, realtime), `effects.js` (networks, ripple, logo, login text), `customizer.js` (menu item, connect flow, editor).
* `server/`: Express app, licensing, OAuth, bundler, views, and the MongoDB/file stores.

## Deploy (Vercel + MongoDB Atlas)

* **Atlas**: project *UltimateThemeCustomizer*, cluster *UltimateAtelier*, database `UltimateThemeCustomizer`.
  * Network Access must allow Vercel: `0.0.0.0/0`, or use the Vercel ↔ Atlas integration.
  * Collections and indexes are created automatically on first use, or run `npm run db:init` once with `MONGODB_URI` set.
* **Vercel**: import the repo and set the environment variables from `.env.example` (`BASE_URL`, `MONGODB_URI`, `MONGODB_DB`, `GHL_CLIENT_ID`, `GHL_CLIENT_SECRET`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `CRON_SECRET`). Add the custom domain `cuztomizer.ironix.dev`. `vercel.json` routes everything to `api/index.js` and schedules the daily install check.
* **HighLevel app**: Target User Agency, redirect `…/oauth/callback`, scope `companies.readonly`, webhook `…/webhooks/ghl` with INSTALL/UNINSTALL. Use `https://cuztomizer.ironix.dev/` as the support URL, `/privacy` and `/terms` for the legal links, and `/docs` for documentation.

Secrets belong in Vercel's environment settings only. `.env` is gitignored.

## Development

```bash
npm install
cp .env.example .env     # leave MONGODB_URI empty to use a local JSON file
npm start                # http://localhost:3000
npm test                 # set TEST_MONGODB_URI=mongodb://... to test against MongoDB
```
