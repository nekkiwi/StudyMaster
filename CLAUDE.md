# StudyMaster – notes for Claude Code

A free, simple study planner (web app, desktop + mobile). Users enter subjects
with exam dates, their material (chapters with pages, slide decks with slides)
and a difficulty weight; the app plans every study session, including Anki
work, and re-plans after a daily Yes/No check-in.

Study style (`settings.workflow`, chosen in onboarding/Settings): any of
🎬 watch the lecture, 📖 read, 📝 write a summary, ✍️ make Anki cards,
🃏 study Anki, 🔁 study the summary – in the user's order. Default: read →
make cards → study Anki. Data saved before study styles existed keeps
watch → read → cards → Anki (`LEGACY_WORKFLOW`, `upgradeSettings`).

Docs – read before bigger changes:
- `docs/DESIGN.md` – product, data model, planner, check-in, dashboard
- `docs/DECISIONS.md` – every decision with its reason (add new ones there)
- `docs/ROADMAP.md` – what's done and what's next
- `docs/HOSTING.md` – Cloudflare hosting, Android/iPhone, onboarding
- `docs/AI.md` – built-in assistant, MCP connector, copy-paste import

## Commands

```bash
npm install          # Node 22+
npm run dev          # web app on http://localhost:5173
npm test             # all tests (Vitest): planner + web app
npm run typecheck
npm run build        # production build → apps/web/dist
npm run deploy       # manual deploy: build + wrangler deploy (normally not needed)
npm run emulators    # Firebase Auth + Firestore emulators (Java), uses firestore.rules
npm run dev:cloud    # dev server connected to the emulators
```

Accounts + sync: Firebase (login, Firestore `users/{uid}`); config in
`apps/web/src/lib/firebaseConfig.ts` (public values; empty = accounts hidden).
Rules in `/firestore.rules`. See docs/DESIGN.md → Accounts and sync.

Deployment: a Cloudflare Worker with static assets (`wrangler.jsonc` at the
root, Worker `app`) is built and deployed from GitHub on every push. Live at
https://app.studymaster.workers.dev. See `docs/HOSTING.md`.

Run `npm test && npm run typecheck` before every commit. CI runs the same
(`.github/workflows/ci.yml`).

## Layout

```
packages/core/   Planning engine. Pure TypeScript, no dependencies, no DOM.
  src/types.ts        Data model: Subject, Chunk, BlockedRange, Settings, Plan…
  src/effort.ts       Minutes per chunk (watch + read + write cards), splitting
                      into pieces in step order, item categories, Anki items
  src/slots.ts        Slot grid: sessions per day, blocked days, exam halves,
                      weekly buffer half-day, extra slots
  src/scheduler.ts    planOnce() and planWithEscalation() – the core algorithm
  src/checkin.ts      Applying the evening check-in to chunk progress
  src/diff.ts         What moved between two plans
  src/validate.ts     Input validation with readable messages
  test/               Vitest tests – add one for every planner change
apps/web/        React 19 + Vite 6 + Tailwind 4 PWA (zustand for state)
  src/store.ts        All user data, saved to localStorage ("studymaster-v1")
  src/account.ts      Sign-in state + silent sync engine (upload, live updates,
                      account plan wins, device backup)
  src/planner.ts      usePlanner(): computes the plan from the store, handles
                      plan start after check-ins and the approval logic
  src/views/          Today, PlanView (calendar), Subjects, SettingsView, Setup (wizard)
  src/components/     ui.tsx (design-system primitives), session, checkin,
                      proposal (approval banner), subjectForm, settingsForm, toast
  src/lib/            format (dates, durations), bulk (quick chunk entry
                      parser), stats, colors, demo data,
                      importer (pure: files/TOC → draft subjects + chunks),
                      fileReaders (browser: pdf.js, fflate, video length),
                      anki (AnkiConnect client, deck names, phone links,
                      deck linking: collections/subdecks/matchDecks),
                      ankiSync (deck ids/renames, card + due counts from Anki),
                      calendar (ICS parsing with ical.js, weekly timetable
                      classes → events, busy times), calendarApi (Worker calls),
                      device (per-device settings, never synced),
                      cloud + firebaseConfig (Firebase, loaded on demand)
  src/components/importer.tsx  Import dialog: choose → read → review → add
  src/components/ankiConnect.tsx  ▶ Anki button logic, Settings "Anki app",
                      "From Anki" import picker, subject editor deck links
  src/components/account.tsx  Sign-in form (landing page + dialog), account chip/section
  src/components/calendars.tsx  Calendars & timetable: add (link/.ics/AI), list,
                      session times, auto refresh
apps/api/        Cloudflare Worker code (same Worker as the site, only /api/*)
  src/index.ts        Router – only a default export allowed (see HOSTING.md)
  src/firebase.ts     Firebase ID token check (no library)
  src/toc.ts          POST /api/toc: table of contents → chapters with Claude
                      Haiku 5.5 (structured output). Secret ANTHROPIC_API_KEY.
  src/calendar.ts     POST /api/ics (fetch calendar links, no CORS in browsers),
                      POST /api/timetable (PDF/photo → weekly classes, Claude)
```

## How the planner works (short)

1. Build slots from `from` to the last exam. Up to 4 per day: `am1, am2, pm1, pm2`
   (clock times in `settings.slotTimes`; a slot covered > 30 min by a class
   from a blocking calendar – `StudyState.busy` – is left out).
   `normal` slots come from the weekly plan (`settings.week`: 0/1/2 sessions
   per morning/afternoon; default weekday afternoons + weekend mornings). On
   study days, more slots up to `maxSessionsPerDay` are `extra`; free days get
   none. One half-day per week = `buffer` (catch-up reserve, empty unless needed).
2. Reserve review sessions before every exam: `reviewShare` of the
   subject's study time, so more material = more review (several sessions;
   first one per subject so back-to-back exams each get one).
3. Walk slots in time order; each study session = lecture pieces plus an
   Anki item (first if "anki" comes first in the style, else last; none if
   the style has no Anki). Items have a category (`kind`): chapter, slides,
   mixed, recording, anki. Pieces follow the style's step order
   (`workSteps`); steps outside the style count 0 (`stepMinutes`). A piece's
   room in a session = its work + learning its new cards (`itemCost`). The subject
   with the least slack (capacity before its deadline − remaining work) goes first.
   `pacing: "even"` (default) only takes a slot when the subject is behind its
   steady pace or time is tight; `"early"` fills everything ASAP.
4. Days without study get a short Anki-only session (`type: "anki"`).
5. `planWithEscalation` tries: normal → shorter exam buffer → weekly buffer →
   extra sessions → infeasible. Everything after "normal" needs user approval.
   The web app shows the approved plan and a banner with the stronger proposal.

## Conventions

- Dates are plain `"YYYY-MM-DD"` strings. Do all date math with the helpers in
  `packages/core/src/dates.ts` (UTC day numbers) – never `new Date(iso)` math.
  The web app gets "today" in local time via `todayISO()`.
- Core imports use `.js` extensions (`./dates.js`) for ESM; Vite resolves them.
- New settings: add to `Settings` in `types.ts`, default in `defaults.ts`,
  check in `validate.ts`. Stored data is upgraded via `withDefaults()` in the
  store's `merge`, so old saved data keeps working.
- UI text is English, short and friendly; no jargon like "escalation" in the UI.
- Keep `vite` pinned at the repo root (`devDependencies`) so only one Vite
  version is installed – two copies break the plugin types.
- Never put API keys in the web app. Anything with a key goes in the backend.
  (Exception by design: the Firebase web config is public; access is
  protected by Firebase Auth + firestore.rules.)

## Status

Done: planner (Anki as item category + Anki-only days, reviews, buffer,
escalation, pacing), web app (wizard, Today with check-in, calendar,
subjects, settings, approval banner, backup, offline PWA, dark mode).

Next: see `docs/ROADMAP.md` – "Install app" button, then the backend (login, sync, push check-ins), the
built-in assistant, the MCP server and "Import with AI".

When you make a design decision, add it to `docs/DECISIONS.md` and keep
`docs/DESIGN.md` / `docs/ROADMAP.md` in sync.
