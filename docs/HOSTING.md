# Hosting, apps & onboarding

> Status: planned. The web app is ready to deploy as static files today;
> the backend doesn't exist yet. Limits and prices checked November 2026 –
> re-check before relying on them.

## Requirements
- Users reach the app in a **browser from anywhere**.
- On **Android** it's an **app** (icon, full screen, notifications).
- Same plan on phone and laptop → needs **login + sync**.
- **Free** for users, near-free for us.
- **Onboarding is easy**: start in seconds, no passwords.

## Architecture: everything on Cloudflare

```
GitHub repo ──push──► Cloudflare Worker  →  studymaster.app (web app, static assets)
                                        →  /api   login, sync, check-ins, assistant (planned)
                                           /mcp   Claude connector
                                           cron   evening push notifications
                     Cloudflare D1       →  database (one record of app data per user)
```

| Part | Service | Cost |
|---|---|---|
| Web app | Cloudflare Worker with static assets – auto-deploy on push from GitHub, free `*.workers.dev` address | free |
| Backend | Cloudflare Workers (free tier ~100k requests/day) + Cron Triggers | free |
| Database | Cloudflare D1 (free tier ~5 GB) | free |
| Login emails | Resend or similar (free tier ~3,000 emails/month) | free |
| Own domain (optional) | e.g. `studymaster.app` | ~€10–15 / year |
| Google Play (optional) | one-time developer fee | $25 once |

Why Cloudflare: one platform and account for static hosting, API, database
and scheduled jobs, all on free tiers, with auto-deploy from GitHub. (Vercel /
Netlify are fine for the static part, but cron + DB + API in one place tips it
to Cloudflare. Firebase needs the pay-as-you-go plan for scheduled functions.)

## Backend plan
- **Accounts:** "Sign in with Google" (one tap on Android) + email magic link.
  No passwords.
- **Sync:** keep the app local-first (works offline); sync the app data to D1
  when signed in. Last write wins is fine to start; later per-entity merges.
- **Evening check-in push:**
  - Store Web Push subscriptions per device.
  - Cron every 15 min: send to users whose check-in time has come in their
    timezone.
  - Notification actions **Yes / No** need a custom service worker:
    switch vite-plugin-pwa to `injectManifest`, handle `notificationclick`
    (Yes → POST check-in; No → open `/#today` with the check-in sheet).
- **Secrets** (LLM key, OAuth secrets, VAPID keys) only in Worker secrets,
  never in the web app.

## Getting it onto devices

| Platform | How |
|---|---|
| **Any browser** | open the URL |
| **Android – install from browser** (works today) | Chrome offers "Install app" → own icon, full screen, offline, notifications. No store. |
| **Android – Google Play** (later) | Wrap the same web app as a **Trusted Web Activity**, e.g. with **PWABuilder** (pwabuilder.com) or Bubblewrap. Needs the $25 developer account and a `/.well-known/assetlinks.json` on our domain. Updates come from the website automatically. New personal developer accounts must run a **closed test** (around 12 testers for 14 days at last check) before going public. |
| **iPhone / iPad** | Safari → Share → "Add to Home Screen". Push works only when added. |
| **Desktop** | Chrome/Edge "Install app", or just the browser. |

## Easy onboarding
1. **Start without an account.** Set up the plan immediately; data stays on
   the device. Only for sync/reminders: "Save your plan – sign in with
   Google". Local data moves into the account automatically.
2. **No passwords:** Google sign-in or email link.
3. **"Install app" button in the app:** Android/desktop → native install
   prompt (`beforeinstallprompt`); iPhone → 2-picture guide.
4. **Desktop → phone handoff:** a QR code "Continue on your phone" that opens
   the app already signed in.
5. **Ask for notifications at the right moment:** after the first day ("Want
   a reminder at 20:00 to check in?"), not during setup.
6. Keep the fast paths: example data, quick entry (`Ch 1-8: 22, 18, …`),
   later "Import with AI".

## Deployment

### Current setup: a Cloudflare Worker with static assets, built from GitHub
Cloudflare's current flow ("Workers & Pages → Create") makes a **Worker**
that serves the built web app as static files (Workers Builds). Every push
builds and deploys automatically.

- Config: `wrangler.jsonc` at the repo root – Worker name `studymaster`,
  assets from `apps/web/dist`, unknown paths fall back to `index.html`.
  **The `name` must match the Worker's name in the dashboard.**
- Dashboard build settings (Worker → Settings → Build):
  | Field | Value |
  |---|---|
  | Git repository | `nekkiwi/StudyMaster` |
  | Branch | the repo's default branch |
  | Build command | `npm run build` |
  | Deploy command | `npx wrangler deploy` |
  | Root directory | *(empty = repo root)* |
  Node 22 comes from `.nvmrc`.
- Address: `https://studymaster.<your-subdomain>.workers.dev` (Settings →
  Domains & Routes), later a custom domain.
- Cache rules: `apps/web/public/_headers` (service worker and `index.html`
  never cached, hashed assets cached for a year) – Workers static assets
  read this file.
- Nice side effect: the planned backend (API, MCP, cron) can be added to this
  same Worker with a `main` script, without moving the site.

Without `wrangler.jsonc`, `wrangler deploy` tries to auto-detect the app and
fails in our monorepo root ("application detection logic has been run in the
root of a workspace").

Why not deploy from a Claude Code cloud session: uploads use a short-lived
upload key in the `Authorization` header, which the cloud session's network
proxy replaces with the saved API token, so the upload fails
(`Authorization failed [code: 8000013]`). Git builds avoid this.

### Manual deploy (fallback, from your own computer)
```bash
npx wrangler@4 login
npm run deploy      # builds and runs `wrangler deploy` with wrangler.jsonc
```

### Next steps
1. Cloudflare Worker (static assets) built from GitHub – see above.
2. Add the **Install app** button + iPhone guide.
3. **Worker + D1**: login (guest-first), sync, push check-ins.
4. **Custom domain** (Worker → Settings → Domains & Routes).
5. **Google Play** via PWABuilder once real people use it.
