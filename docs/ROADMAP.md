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
- ✅ **Material import**: folders / PDFs (bookmarks → chapters) / slides /
  PowerPoint / videos / pasted table of contents → detected subjects and
  lectures → review list (untick, edit, merge, move) → add.
- ✅ **Anki app**: ▶ Anki button per Anki task (desktop: exact deck via
  AnkiConnect; iPhone: AnkiMobile study link; Android: opens AnkiDroid),
  connect desktop Anki, create decks, **link subjects to Anki collections and
  lectures to sub-decks** (set up from Anki, auto-match by name, fix by hand);
  ▶ Anki opens exactly the linked deck.
- ✅ ▶ Anki on every device: connect-and-open dialog on computers, Safari
  note, AnkiMobile study link, AnkiDroid deck link.
- ✅ Anki structure + numbers: deck ids (renames), real card counts, due
  counts in the plan, sub-decks for new lectures, new sub-decks suggested.
- ✅ Import inside the subject editor.
- ✅ Study style (steps + order), onboarding "How you study" + Anki setup
  step, exam review scaled with material, four-sessions preset.
- ✅ Calendar integration: university calendars (ICS links, .ics files,
  timetable PDFs/photos via AI) block study sessions; week view shows classes.
- ✅ Google Calendar sign-in: pick calendars directly (needs Calendar API +
  scope + test users in Google Cloud, see HOSTING.md).
- ⏳ Microsoft/Outlook sign-in; Google app verification for all users.
- ⏳ Android: start *studying* the exact deck. Options: propose a
  `anki://x-callback-url/study?deck=` deep link to AnkiDroid (like AnkiMobile),
  or ship StudyMaster as an Android app that sends AnkiDroid's review intent
  (needs deck IDs via AnkiConnect `deckNamesAndIds`; IDs are the same on all
  synced devices).
- ✅ Week grid with Mon–Sun columns and big presets; splitting limits only in
  Settings, explained.
- ✅ **Accounts + sync** (Firebase): Google and email/password sign-in,
  forgot-password emails, plan synced live across devices, "which plan to
  keep?" on first sign-in, sign-out removes data from the device. **Live**
  (Firebase project `studymaster-caa36`); tested on the live site (sign-up,
  second device, sync) and the security rules against the real project.
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
- ✅ "Let AI read the contents" in the import review: the Worker (`apps/api`,
  `POST /api/toc`) sends the table-of-contents text to Claude Haiku 5.5
  (structured output), signed-in users only, 20 reads/user/hour.
  Needs the Worker secret `ANTHROPIC_API_KEY`.
- Later: photos of a contents page / syllabus, copy-paste prompt for any chatbot.

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
