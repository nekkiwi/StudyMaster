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
3. **Plans the real work.** Studying a lecture means watching the recording,
   reading the slides or chapter and writing Anki cards – and then studying
   those cards plus the earlier ones every day.
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
2. *Material:* lectures with recording length plus slide deck and/or
   chapter (pages, slides). Quick entry like `Lecture 1-8: 40, 35, …` (with a
   "recording per lecture" default) or `Lecture 3: 45 slides 90min`.
3. *Your week:* a Mon–Sun grid – which mornings / afternoons you study
   (0, 1 or 2 sessions each). **Preset: weekday afternoons + one half-day
   (the morning) on Saturday and Sunday**, 2 sessions each. Plus max
   sessions on a busy day, session length, pace, chunk limits, weekly buffer.
4. *Days off:* vacation, breaks, other blocked days.
5. *Your plan:* summary – total hours, sessions, whether everything fits.
"Try with example data" skips all of this for a quick look.

**Material import** (wizard step 2 and Subjects → Import) – detect, then a
human checks:
1. Drop files or a whole folder, or paste a table of contents. Everything is
   read on the device (pdf.js, fflate, the browser's video metadata) –
   nothing is uploaded.
2. Detection:
   - **Subjects** from folders (`Biology/Lecture 3.pdf` → Biology), else from
     the file name before the lecture number (`Bio_VL03.pdf` → Bio); matched to
     existing subjects by name.
   - **Book PDFs** (≥ 30 pages) with bookmarks → one chunk per chapter with
     page counts (top level, or the level below when the top level is just
     "Part I/II"). Contents, index, references etc. are found but unticked.
   - **Slide PDFs** (landscape, or no bookmarks) and **PowerPoints** → one
     lecture each with the slide count; portrait PDFs without bookmarks → pages.
   - **Videos** → recording minutes; paired with slides that share the
     lecture number (`Lecture 3.mp4` + `Lecture 3.pdf` → one lecture).
   - **Pasted table of contents** → top-level chapters, page count from the
     next chapter's start page (last one from "last page", else estimated
     and flagged).
3. **Review** (nothing is saved before this): per subject rename, "new
   subject" or "add to <existing>", exam date for new subjects; per item
   tick/untick, edit title, video minutes, pages, slides, "merge with above",
   "move to" another subject. Skipped files are listed with the reason.

**Every day** – open *Today*: the day's sessions, each a list of items:
lecture pieces (🎬 watch · 📖 read · ✍️ write cards) and, at the end, 🃏 Anki. In the evening: *Did you finish
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
| **Chunk** | One unit of material, usually **a lecture**: a recording (`recordingMinutes`, default 60) plus a chapter (`pages`) and/or slide deck (`slides`). Has an order within its subject, optional real card count, and progress per step (`done.watch/read/cards`, 0–1). |
| **Steps** | Every chunk is worked through in order: 🎬 **watch** the recording → 📖 **read** the chapter / slides → ✍️ **write** Anki cards. |
| **Blocked range** | Days with no studying at all: vacation, sick, study break, other (+ note). |
| **Session** | One 2–3 h block (default 150 min). Up to 4 per day: `am1, am2` (morning) and `pm1, pm2` (afternoon). A half-day = up to 2 sessions. |
| **Weekly plan** (`week`) | Per weekday: sessions in the morning and afternoon (0, 1 or 2). We **don't assume studying every day**. Default: Mon–Fri afternoon (2), Sat + Sun morning (2) = 14 sessions / week. Free days and half-days get nothing – no study, no Anki-only session, no extra sessions. |
| **Plan item** | One thing to do in a session. Category (`kind`): **chapter**, **slides**, **mixed** (both), **recording** (video only) or **anki** (studying cards). Lecture pieces carry minutes per step, pages/slides and cards for that piece. |
| **Session type** | **study** (lecture work, then Anki) · **review** (Anki for the subject + short exam review right before an exam) · **anki** (Anki only, on days without study) |
| **Slot kind** | **normal** (from the weekly plan) · **buffer** (the weekly catch-up half-day) · **extra** (on days you already study, up to max sessions per day, closest to your normal sessions; only with approval) |

### Studying Anki is its own item, at the end of each session
The real workflow: A) watch → read → write cards, then B) study Anki.
- Each study session **ends with an Anki item**: **learn the new cards**
  written in that session (≈ 30 s per card) **+ review earlier cards of the
  same subjects** (the decks of the subjects worked on in that session).
- Review time grows with the number of cards made so far: at least 10 min per
  session, at most 30 % of a session. Learning time comes on top and is
  reserved when the lecture piece is planned, so sessions don't overflow.
- It's a normal item: listed with its minutes, ticked in the check-in
  ("Done"). A copyable Anki search for a Filtered Deck, e.g.
  `(deck:"Chemistry*" OR deck:"Biology*") (is:due OR is:new)`.
  Suggested deck naming in Anki: `Subject::Chunk title`.
- **Study days without study work** (e.g. with steady pacing; not blocked,
  not an exam day, not the buffer) get a short **Anki-only session**
  (≥ 15 min), so reviews never pause. Only once cards exist. Free days in the
  weekly plan stay free.

### Connecting to the Anki app
Each Anki task has an **▶ Anki** button. It opens the **lecture's deck**
(`Subject::Lecture`) when that session wrote cards for exactly one lecture,
otherwise the **subject deck** (`Subject`, which includes all its lectures):

| Device | What happens | How |
|---|---|---|
| Desktop with Anki + **AnkiConnect** add-on (2055492159) | Anki opens review of exactly that deck | `guiDeckReview` via AnkiConnect on 127.0.0.1:8765 |
| Desktop without AnkiConnect | AnkiWeb opens in a new tab + tip to connect | link |
| iPhone (AnkiMobile) | AnkiMobile opens at that deck | `anki://x-callback-url/study?deck=…` – reported for AnkiMobile 25.07+, **not verified against the official docs; test on a device** |
| Android (AnkiDroid) | AnkiDroid opens (not the exact deck) | `intent://…;package=com.ichi2.anki` – AnkiDroid only opens a specific deck for *installed apps* (explicit intent with a long `EXTRA_DECK_ID` to `com.ichi2.anki.IntentHandler`), which a web page can't send. A native wrapper (e.g. Capacitor) could, later. |

**Connecting (desktop, Settings → Anki app):** install AnkiConnect, keep Anki
open, press Connect → Anki shows an "allow this website?" popup
(`requestPermission`). After that:
- **Create my decks in Anki** – creates missing `Subject` and
  `Subject::Lecture` decks (they reach the phone via AnkiWeb sync).
- **Import subjects from Anki** – `Subject::Lecture` decks become subjects and
  lectures in the same review list as file imports; lectures that already
  exist are left out.
- The connection is stored per device (`lib/device.ts`), never synced.

AnkiWeb has no public API or "sign in with AnkiWeb", so an Anki account can't
be used for login or for reading decks on phones.

### Accounts and sync
- **The landing page is the login**: "Continue with Google" or email +
  password (create account, "forgot password" emails). Apple later (needs a
  $99/year Apple developer account). "Continue without an account" and "Try
  with example data" are small links below – then everything stays on the
  device, and sign-in is possible later (sidebar, Settings → Account).
- After signing in: the account has a plan → straight to Today ("Loading
  your plan…" meanwhile); new account → the setup wizard.
- Each user's plan is one Firestore document `users/{uid}` (the app data as a
  JSON string + `updatedAt` + `device`). Rules (`/firestore.rules`): only the
  owner can read or write it; no other fields; < 900 kB.
- **Sync:** changes upload ~1.5 s after the last edit; other devices get them
  live. Last write wins.
- **On sign-in it's silent – no questions:** account empty → this device's
  plan is uploaded. Same account as before → whichever changed last wins.
  Account has a plan → it's loaded; if this device had its own plan (used
  without an account), that one is kept as a **backup** – Settings → Account
  offers "Use that plan instead" or "Delete it".
- **Sign out** removes the plan from the device (shared devices stay private);
  it stays in the account.
- Per-device settings (e.g. the Anki connection) are never synced.
- Firebase loads only when someone signs in (or signed in before on this device).

## 4. Effort model

Per chunk (all values are settings with these defaults):

| Step | Time |
|---|---|
| 🎬 Watch | recording minutes × `recordingFactor` (1 = real time, 0.8 = 1.25× speed, 1.2 = with pauses) – **not** scaled by weight |
| 📖 Read | (3 min / page + 1 min / slide) × weight |
| ✍️ Write cards | cards × 1.5 min × weight; cards ≈ 1.5 / page + 0.7 / slide (or the real count) |
| 🃏 Learn new cards | cards × 30 s – planned in the session's Anki item |

Example: a lecture with a 60-min recording and 40 slides at weight 1.0 ≈
60 + 40 + 28 cards × 1.5 = 142 min, plus 14 min learning the new cards.

Anki reviews per day ≈ `cards made × 10 % due × 8 s`, split over the day's
sessions, clamped to [10 min, 30 % of a session] per session.

## 5. The planner

Code: `packages/core/src/scheduler.ts`. Pure function: data in, plan out.

1. **Slot grid** from the plan start to the last exam: normal slots from the
   weekly plan, skip blocked days, skip the exam's half on exam day, mark
   extra slots (study days only), mark one buffer half-day per week (fixed, or
   automatic = last study half-day of the week, avoiding exam days and days
   before an exam – with the default week that's Sunday morning).
2. **Reserve reviews first:** the last free slot before each exam (within 7
   days) becomes a review session: 10 % of the subject's effort, at least
   20 min, at most 60 % of a session. Done first so back-to-back exams each
   get one.
3. **Deadlines:** main study for a subject ends before its review session and
   before `exam − examBufferDays` (default 2 days).
4. **Fill slots in time order.** Each session gets lecture work, then its
   Anki item (learn new + review).
   The subject with the **least slack** (free capacity before its deadline −
   remaining work) goes next, chunks in order. Within a session the planner
   prefers to stay on one subject unless another is at risk. Limits: max chunks
   per session; big chunks are split by max pages / max slides / what fits a
   session; a piece that doesn't fit is cut to fill the session (no pieces
   under 30 min; up to 10 min overrun allowed instead of a tiny leftover).
   **Pieces follow the step order**: e.g. piece 1 = watch + start reading,
   piece 2 = finish reading + write cards – cards are never planned before
   the recording is watched.
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
- **No** → a sheet to tick what *was* done: watched / read / cards written
  per lecture piece (only the steps planned in that piece), "Done" for Anki. Everything else goes back into the pool.
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
