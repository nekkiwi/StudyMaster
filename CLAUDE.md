# StudyMaster – notes for Claude Code

A free, simple study planner (web app, desktop + mobile). Users enter subjects
with exam dates, their material (chapters with pages, slide decks with slides)
and a difficulty weight; the app plans every study session, including Anki
work, and re-plans after a daily Yes/No check-in.

Read `docs/DESIGN.md` for the full design and the decisions behind it.

## Commands

```bash
npm install          # Node 22+
npm run dev          # web app on http://localhost:5173
npm test             # all tests (Vitest): planner + web app
npm run typecheck
npm run build        # production build → apps/web/dist
```

Run `npm test && npm run typecheck` before every commit. CI runs the same
(`.github/workflows/ci.yml`).

## Layout

```
packages/core/   Planning engine. Pure TypeScript, no dependencies, no DOM.
  src/types.ts        Data model: Subject, Chunk, BlockedRange, Settings, Plan…
  src/effort.ts       Minutes per chunk (read + summary + Anki cards) × weight,
                      splitting into pieces, Anki block size per session
  src/slots.ts        Slot grid: sessions per day, blocked days, exam halves,
                      weekly buffer half-day, extra slots
  src/scheduler.ts    planOnce() and planWithEscalation() – the core algorithm
  src/checkin.ts      Applying the evening check-in to chunk progress
  src/diff.ts         What moved between two plans
  src/validate.ts     Input validation with readable messages
  test/               Vitest tests – add one for every planner change
apps/web/        React 19 + Vite 6 + Tailwind 4 PWA (zustand for state)
  src/store.ts        All user data, saved to localStorage ("studymaster-v1")
  src/planner.ts      usePlanner(): computes the plan from the store, handles
                      plan start after check-ins and the approval logic
  src/views/          Today, PlanView (calendar), Subjects, SettingsView, Setup (wizard)
  src/components/     ui.tsx (design-system primitives), session, checkin,
                      proposal (approval banner), subjectForm, settingsForm, toast
  src/lib/            format (dates, durations), bulk (quick chunk entry
                      parser), stats, colors, demo data
```

## How the planner works (short)

1. Build slots from `from` to the last exam. Up to 4 per day: `am1, am2, pm1, pm2`.
   Preferred count = `normal`, above that up to max = `extra`; one half-day per
   week = `buffer` (catch-up reserve, empty unless needed).
2. Reserve a short review session in the last free slot before every exam
   (first, so back-to-back exams each get one).
3. Walk slots in time order; each session = Anki block + work. The subject with
   the least slack (capacity before its deadline − remaining work) goes first.
   `pacing: "even"` (default) only takes a slot when the subject is behind its
   steady pace or time is tight; `"early"` fills everything ASAP.
4. `planWithEscalation` tries: normal → shorter exam buffer → weekly buffer →
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

## Status

Done: planner (with Anki, reviews, buffer, escalation, pacing), web app
(wizard, Today with check-in, calendar, subjects, settings, approval banner,
backup export/import, offline PWA, dark mode).

Next steps, in order – details in `docs/DESIGN.md` → Roadmap:
1. Short Anki-only sessions on free days (so reviews never pause)
2. Backend on Cloudflare Workers + D1: login, sync, cron + Web Push evening
   check-in with Yes/No buttons (needs vite-plugin-pwa `injectManifest` mode
   for a custom service worker)
3. Built-in assistant via the backend (server-side key, per-user limit, spend cap)
4. MCP server (same tools as the assistant) + "Connect to Claude" page
5. "Import with AI": copy-paste prompt → JSON → import
