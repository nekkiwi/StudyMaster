# StudyMaster – Product & Design

> The full picture of what we're building and why. Related docs:
> [AI.md](AI.md) (assistant, Claude connector) · [HOSTING.md](HOSTING.md)
> (hosting, Android, onboarding) · [DECISIONS.md](DECISIONS.md) (why we chose
> what) · [ROADMAP.md](ROADMAP.md) (what's next).

## 1. Vision

A web app that turns "I have these exams and this much material" into a
realistic day-by-day study plan, shown in a calm, elegant dashboard, and that
keeps the plan honest as real life happens.

**Principles**

1. **Free and simple.** No cost for users, minimal running cost for us, no
   account needed to start.
2. **Works everywhere.** Browser on desktop and phone, installable as an app on
   Android (and iPhone), usable from any device once sync exists.
3. **Plans the real work.** Studying is not just reading: it's reading,
   summarizing, making Anki cards and reviewing Anki every day.
4. **Plans well in advance.** Main study ends before exams; a short review
   sits right before each exam, even when exams are back to back.
5. **Adapts, but never silently overbooks.** Missed days are re-planned
   automatically. Anything beyond the user's normal rhythm (buffer time,
   extra sessions, a shorter gap before an exam) needs the user's OK.
6. **AI is optional and invisible.** The app works fully without AI. AI help
   makes setup and changes faster, without users needing an AI account.

## 2. Main flows

**First time (onboarding)** – a 5-step wizard, about 5 minutes:
1. *Exams:* subjects with exam date, morning/afternoon, difficulty weight.
2. *Material:* chapters and slide decks with page/slide counts. Quick entry
   like `Ch 1-8: 22, 18, 30, …` or `Lecture 3: 45 slides`.
3. *Your week:* sessions per day (preferred and max), session length, pace,
   chunk limits, weekly buffer.
4. *Days off:* vacation, breaks, other blocked days.
5. *Your plan:* summary – total hours, sessions, whether everything fits.
"Try with example data" skips all of this for a quick look.

**Every day** – open *Today*: the day's sessions, each a list of items
(Anki review, chapter pieces, slide decks). In the evening: *Did you finish
today's plan?* **Yes / No**.

**When life happens** – a "No", a sick day added, a new chapter: the plan
re-plans from the next day. If it no longer fits the normal rhythm, a banner
proposes the smallest change (see §6) and waits for approval.

## 3. Concepts & data model

All types live in `packages/core/src/types.ts`.

| Concept | What it is |
|---|---|
| **Subject** | Name, color, exam date, exam half (`am`/`pm`), **weight** |
| **Weight** | Preset difficulty: `0.5` very easy · `0.8` easy · `1.0` normal · `1.2` hard · `1.5` very hard. Multiplies all effort. |
| **Chunk** | One unit of material: a chapter (`pages`), a slide deck (`slides`) or both. Has an order within its subject, optional real card count, and progress per step (`done.read/summary/cards`, 0–1). |
| **Steps** | Every chunk is worked through as 📖 read → 📝 summarize → 🃏 make Anki cards. |
| **Blocked range** | Days with no studying at all: vacation, sick, study break, other (+ note). |
| **Session** | One 2–3 h block (default 150 min). Up to 4 per day: `am1, am2` (morning) and `pm1, pm2` (afternoon). 1 session = `am1`; 2 = `am1, pm1`; 3 = `am1, am2, pm1`; 4 = all. |
| **Plan item** | One thing to do in a session. Category (`kind`): **chapter**, **slides**, **mixed** (both) or **anki** (Anki review). |
| **Session type** | **study** (Anki + chunk work) · **review** (Anki + short exam review right before an exam) · **anki** (Anki only, on days without study) |
| **Slot kind** | **normal** (within preferred sessions/day) · **buffer** (the weekly catch-up half-day) · **extra** (above preferred, up to max) |

### Anki is a category of work, like chapters and slide decks
- Each study and review session **starts with an Anki review item**. It's a
  normal item: listed with its minutes, ticked in the check-in.
- Its length grows with the number of cards made so far: at least 10 min per
  session, at most 30 % of a session.
- It suggests which decks to review (subjects in that session first, then
  exams in the next 14 days) and offers a copyable Anki search like
  `(deck:"Biology*" OR deck:"Chemistry*") is:due` for a Filtered Deck.
  Suggested deck naming in Anki: `Subject::Chunk title`.
- **Days without study** (before the last exam, not blocked, not an exam day,
  not the buffer) get a short **Anki-only session** (≥ 15 min), so reviews
  never pause. Only once cards exist.

## 4. Effort model

Per chunk, before weight (all values are settings with these defaults):

| Step | Pages | Slides |
|---|---|---|
| Read | 3 min / page | 1 min / slide |
| Summary | 1 min / page | 0.5 min / slide |
| Anki cards | 1.5 cards / page | 0.7 cards / slide |
| Card creation | 1.5 min / card | |

`effort = (read + summary + cards) × weight` → a 20-page chapter at weight 1.0
≈ 125 min. Once the user enters the real card count it replaces the estimate.

Anki review per day ≈ `cards made × 10 % due × 8 s`, split over the day's
sessions, clamped to [10 min, 30 % of a session] per session.

## 5. The planner

Code: `packages/core/src/scheduler.ts`. Pure function: data in, plan out.

1. **Slot grid** from the plan start to the last exam: skip blocked days, skip
   the exam's half on exam day, mark extra slots, mark one buffer half-day per
   week (fixed, or automatic = afternoon of the last day of the week, avoiding
   exam days and days before an exam).
2. **Reserve reviews first:** the last free slot before each exam (within 7
   days) becomes a review session: 10 % of the subject's effort, at least
   20 min, at most 60 % of a session. Done first so back-to-back exams each
   get one.
3. **Deadlines:** main study for a subject ends before its review session and
   before `exam − examBufferDays` (default 2 days).
4. **Fill slots in time order.** Each session gets its Anki item, then work.
   The subject with the **least slack** (free capacity before its deadline −
   remaining work) goes next, chunks in order. Within a session the planner
   prefers to stay on one subject unless another is at risk. Limits: max chunks
   per session; big chunks are split by max pages / max slides / what fits a
   session; a piece that doesn't fit is cut to fill the session (no pieces
   under 30 min; up to 10 min overrun allowed instead of a tiny leftover).
   Consecutive pieces of the same chunk merge. Pieces are numbered
   "Ch 4 (1/3)" in time order.
5. **Pacing** (setting):
   - `even` (default, "Steady"): a subject only takes a slot when it's behind
     its steady pace to its finish date – or when time gets tight, then it's
     as-soon-as-possible again. Study (and Anki) on most days.
   - `early` ("Finish early"): fill everything as soon as possible.
6. **Buffer and extra slots** are only used by subjects that wouldn't make it
   otherwise; buffer before extra.
7. **Anki-only sessions** on remaining free days (see §3).

### Escalation – when it doesn't fit
`planWithEscalation()` tries, in order, and stops at the first plan that fits:

| Level | What changes | User sees |
|---|---|---|
| `normal` | preferred sessions only | applied automatically |
| `shortenExamBuffer` | main study may end 1 day closer to exams | banner, asks |
| `useWeeklyBuffer` | catch-up in the weekly buffer half-day | banner, asks |
| `extraSessions` | sessions above preferred, up to max | red banner, asks |
| `infeasible` | nothing fits: hours missing per subject + ideas | red banner |

## 6. Approvals (never silently overbook)

Code: `apps/web/src/planner.ts`.
- The app always computes the full proposal, but **shows** the plan capped at
  what the user approved (`planWithEscalation(…, maxLevel)`).
- An approval stores the level, the exact buffer/extra slots and the exam
  buffer. Later plans that need **only those or fewer** are accepted silently;
  anything new asks again.
- "Not now" hides the banner and shows a small "plan at risk" chip instead.
- The same rules will apply to changes made by the AI assistant.

## 7. Check-in & re-planning

- **Yes** → everything planned that day counts as done (undo available).
- **No** → a sheet to tick what *was* done: read / summary / cards per chunk
  piece, "Done" for Anki items. Everything else goes back into the pool.
- **Ignored** → shown again the next morning; the plan starts at most 2 days
  back, so after 2 days unconfirmed work simply counts as not done.
- After a check-in the plan is rebuilt from the next day and a short note
  says what moved.
- **Evening reminder** (needs the backend): a push notification at a chosen
  time with **[Yes] [No]** buttons. Android and desktop Chrome/Edge show the
  buttons; on iPhone the app must be on the Home Screen and a tap opens the
  check-in. Ask for notification permission after the first day, not at setup.

## 8. Dashboard (web app)

- **Today:** greeting, today's sessions as cards, check-in card (prominent in
  the evening), pending check-ins from previous days, tomorrow preview, exam
  list with progress ring + days left + "on track / at risk", last 7 days.
- **Plan:** week view (desktop 7 columns, phone list), overview heat map from
  this week to the last exam with exam markers, exam list with "main study
  done by", legend. Buffer = striped amber, extra = rose border, day off = grey.
- **Subjects:** cards with progress, chunks, cards made / estimated; editor
  with category icon per chunk, step toggles, real card count, reorder,
  suggested Anki deck name.
- **Settings:** study rhythm, pace, weekly buffer, evening check-in time,
  days off, Anki, time estimates, data (export/import/start over).
- Design: light and dark mode, mobile bottom tab bar, desktop sidebar,
  rounded cards, subject colors, no clutter.

## 9. Tech & architecture

| Part | Choice |
|---|---|
| Planner | `packages/core` – TypeScript, no dependencies, Vitest |
| Web app | `apps/web` – React 19, Vite 6, Tailwind 4, zustand, vite-plugin-pwa; UI primitives in `components/ui.tsx` |
| Storage today | localStorage on the device (`studymaster-v1`), backup as JSON |
| Backend (planned) | Cloudflare Workers + D1 + Cron Triggers – see [HOSTING.md](HOSTING.md) |
| AI (planned) | Built-in assistant + MCP server sharing one set of tools – see [AI.md](AI.md) |
