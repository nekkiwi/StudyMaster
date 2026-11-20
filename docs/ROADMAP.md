# Roadmap

## Done
- ✅ **Planner** (`packages/core`): weekly plan (default weekday afternoons +
  weekend mornings, free days stay free), lecture workflow (watch → read → write
  cards) with pieces in step order, Anki at the end of each session (learn new
  + review same subject) + Anki-only sessions, review sessions before exams, weekly
  buffer, escalation with approval levels, pacing (steady / finish early),
  check-in, plan diff, validation, tests.
- ✅ **Web app** (`apps/web`, local-only): setup wizard with quick entry and
  example data, Today with check-in (Yes / No with partial progress, undo),
  calendar with overview heat map, subjects editor, settings, approval
  banner, backup export/import, offline PWA, dark mode.
- ✅ Docs, `CLAUDE.md`, GitHub Actions CI (typecheck, tests, build).

## Next, in order

### 1. Deploy as it is
- Cloudflare Worker with static assets, built from GitHub on every push
  (`wrangler.jsonc`, setup in [HOSTING.md](HOSTING.md#deployment)).
- "Install app" button (Android/desktop install prompt) + iPhone
  "Add to Home Screen" guide. See [HOSTING.md](HOSTING.md).

### 2. Backend (Cloudflare Workers + D1)
- Guest-first: local data stays; "Save your plan – sign in" moves it to an
  account. Google sign-in + email magic link.
- Sync app data per user (last write wins to start).
- Web Push evening check-in: subscriptions in D1, Cron every 15 min,
  notification actions Yes/No via a custom service worker (vite-plugin-pwa
  `injectManifest`). Ask for permission after the first day.
- QR "Continue on your phone".

### 3. Built-in assistant
- `/api/assistant` on the Worker, server-side LLM key, shared tools (see
  [AI.md](AI.md)), per-user daily limit, monthly spend cap, proposals for
  anything that needs approval.

### 4. MCP server + "Connect to Claude" page
- `/mcp` with OAuth, same tools.

### 5. Import with AI
- Copy-paste prompt → JSON → import screen with preview.

### 6. Google Play
- PWABuilder → Trusted Web Activity, `assetlinks.json`, closed test, release.

## Ideas / known limitations
- Re-planning starts from scratch each time; keep the plan more stable
  (pin today and tomorrow, only move what must move).
- Drag a chunk to another day, with automatic rebalance.
- "Realistic pace": learn from check-ins (e.g. 80 % done on average) and keep
  that much slack.
- Learn real minutes per page from a session timer.
- `.ics` calendar export.
- Weekday vs. weekend rhythms.
- AnkiConnect (desktop only) to read real due counts.
- German translation.
- Playwright end-to-end tests in CI.
