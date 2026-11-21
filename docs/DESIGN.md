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
3. *Your week:* big preset buttons on top (weekday afternoons + weekend
   mornings · weekday afternoons only · every day), below a grid with
   **Mon–Sun as columns and Morning / Afternoon as rows**; each cell has
   – / 1 / 2 side by side (scrolls sideways on phones, row labels stay).
   **Preset: weekday afternoons + one half-day (the morning) on Saturday and
   Sunday**, 2 sessions each. Plus max sessions on a busy day, session
   length, pace, weekly buffer. The splitting limits (items per session, max
   pages / slides before a chapter or deck is split) are **not** in the
   wizard – only in Settings → "Splitting long material", with an
   explanation. The UI says "item" / "lecture or chapter", never "chunk".
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
     "Part I/II"). Contents, index, references etc. are found but unticked;
     when the book has ≥ 3 numbered chapters ("Chapter 3 …", "3 Cells"),
     every other bookmark (cover, dedication, preface …) starts unticked.
   - Subjects also match by a shared word ("Campbell Biology" → Biology). If
     an import finds one new subject and exactly one existing subject has no
     material yet (e.g. just created in the wizard), it's added to that one.
   - **Slide PDFs** (landscape, or no bookmarks) and **PowerPoints** → one
     lecture each with the slide count; portrait PDFs without bookmarks → pages.
   - **Videos** → recording minutes; paired with slides that share the
     lecture number (`Lecture 3.mp4` + `Lecture 3.pdf` → one lecture).
   - **Pasted table of contents** → top-level chapters, page count from the
     next chapter's start page (last one from "last page", else estimated
     and flagged).
3. **Review** (nothing is saved before this): per subject rename (big
   "Subject name ✏️" field), "new
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
  ("Done"). (The copyable Filtered-Deck search was removed – it confused
  people; ▶ Anki opens the linked deck instead.)
- **Study days without study work** (e.g. with steady pacing; not blocked,
  not an exam day, not the buffer) get a short **Anki-only session**
  (≥ 15 min), so reviews never pause. Only once cards exist. Free days in the
  weekly plan stay free.

### Subjects per session
`settings.mixSubjects` (Settings → Study rhythm): **"Second if needed"**
(default) – a session sticks to one subject and fills itself with it; a
second subject joins only when it would miss its exam otherwise, or when at
least an hour would stay empty (max two). "Only one" never mixes (sessions
may end early); "Mix freely" is the old behaviour. With steady pacing,
subjects alternate between sessions instead of mixing inside one.

### Today on the phone + evening reminder
Today is the home screen: the session happening now (or next) is
highlighted with its clock time; in the evening or after the last session
the check-in comes first; the "doesn't fit" banner moves below today on
phones. **Evening reminder** (Settings → Evening check-in, or the one-time
"Get a nudge at 20:00?" card on Today): Web Push per device, sent at the
check-in time only on days with sessions and only if nobody checked in yet
(any device). iPhone: works after "Add to Home Screen". Needs sign-in.

### Study style
Each user picks the steps for a lecture/chapter and their order
(`settings.workflow`): watch the lecture, read, write a summary, make Anki
cards, study Anki, study the summary. Default **read → make cards → study
Anki**; presets: Read → Anki, Lecture → read → Anki, With summaries,
Everything. Chunk steps are split into pieces in that order; "Study Anki"
is a session item (first if it's first in the list, else last); without it
no Anki time is planned. Summary times have their own rates (Settings →
Time estimates). Video fields are hidden when watching isn't part of the
style. Data from before study styles keeps watch → read → cards → Anki.

### Onboarding
Exams → **How you study** (style editor) → **Anki** ("Do you use Anki?":
app on a computer → step-by-step install Anki, AnkiConnect, Connect; AnkiWeb
only; phone app; no → Anki removed from the style) → Material → Your week
(presets incl. "Every day, four sessions") → Days off → Your plan.

### Exam review
Review time = `reviewShare` (Settings: 5/10/15/20 %, default 10 %) of the
subject's study time – more material, more review – split into review
sessions (≤ 70 % of a session each, up to 6) in the last free slots before
the exam; main study must be done before the first one.

### Calendars & timetable
Classes block study time: Settings → Calendars & timetable (also in the
onboarding week step). Each calendar is a university calendar or not, and
"Plan around these events" (default on); any number can be added.
- **Google Calendar** (first tab): "Connect Google Calendar" → Google popup
  (read-only calendar access via the Firebase Google provider; email
  accounts get Google linked) → pick calendars, mark university ones (names
  like "Uni", "Vorlesung", "Timetable" are pre-ticked). Events come from the
  Calendar API (`singleEvents`, all-day / cancelled / "free" events skipped).
  The browser token lasts ~1 h, so updating later is one tap (↻).
- **Calendar link (ICS)** with step-by-step help for Google Calendar (secret
  iCal address), Outlook/Microsoft 365 (publish calendar), Apple iCloud
  (public calendar, webcal://) and university portals. Fetched by the
  Worker (`/api/ics`, signed-in only – browsers can't fetch them: no CORS),
  refreshed every 6 h while the app is open.
- **.ics file**: read on the device.
- **Timetable PDF or photo**: Claude Haiku reads weekly classes
  (`/api/timetable`, weekday, times, odd/even weeks, semester dates); the user
  checks/edits them before saving; they're repeated for the planning period.
- Recurring events are expanded with ical.js (RRULE, EXDATE, moved dates via
  RECURRENCE-ID, time zones); all-day events are ignored.
- Sessions have clock times (`settings.slotTimes`, default 8:00–10:30,
  10:30–13:00, 14:00–16:30, 16:30–19:00); a session covered more than 30 min
  by a blocking event is left out, so the plan goes around classes (and asks
  for extra sessions if it doesn't fit). Classes show in grey in the week view.
- Events of the planning period are stored with the plan and synced.
- Later: Microsoft/Outlook sign-in; Google app verification for everyone.

### Books without bookmarks
A PDF book without bookmarks is read through its printed table of contents
(pages near the start with an "Inhalt/Contents" heading, plus following
pages full of page numbers). `parseToc` reads "Title …… 12" lines; for
scanned books it also tries `parseBlockToc` (chapters marked by the sub-entry
line repeated in every chapter, page-number columns, OCR letter-spacing
undone, glued labels like "LektionLektion…" → "Lektion N:"). Page counts are
start-page differences; the last chapter ends at the highest number in its
column. For signed-in users the AI reads the contents first (docs/AI.md);
this quick reader is the fallback. Everything goes through the review list,
which hides unticked items (cover, preface, index …) behind "Show N
unticked items" (unticking hides with Undo), and has **Add section here**
between items for sections the reader missed.

### Linking subjects and lectures to Anki decks
- A subject can be **linked to an Anki deck** (`Subject.ankiDeck`, a
  top-level deck = "collection", e.g. `Bio WS26`), and each lecture/chapter
  to one of its **sub-decks** (`Chunk.ankiDeck`, e.g. `Bio WS26::VL03 Genetics`).
- **Matching by name** (`lib/anki.ts` → `similarity`, `matchDecks`): same
  name, same lecture number ("Lecture 3" ↔ "VL03 …"; different numbers never
  match), or shared words (overlap of the smaller set, without stop words
  like "lecture", "chapter", "and"). Best pairs first, each deck used once.
- **Set up a subject from Anki** (Import → "From Anki", or Settings → Anki →
  "Set up subjects from Anki"): pick collections; each becomes a subject (or
  goes into an existing one: already linked, or with a matching name); sub-
  decks similar to existing items are **linked**, the rest become **new
  items** (each linked). Everything goes through the usual review list;
  changing "Add to …" re-matches against that subject (`ankiTarget`).
- **Subject editor → Anki deck:** choose the collection; unlinked items are
  matched automatically, each can be changed in a dropdown ("Whole subject
  deck" = no own deck), "Match by name" again, "Add N sub-decks as new items".
  Needs desktop Anki with AnkiConnect; on phones the links are shown only.
- Without links, deck names default to `Subject::Lecture`
  (`deckForChunk`, `deckForSubject`). In a linked subject, an item without
  its own deck ("Whole subject deck", `ankiNoDeck`) opens the subject's deck.

### Reading Anki's structure and numbers (computer with AnkiConnect)
`lib/ankiSync.ts` + `syncAnki()` run when StudyMaster opens, on focus (at most
once a minute), every 5 minutes while visible, after linking changes, and on
"Refresh" (Settings → Anki). Two requests per run (`deckNamesAndIds`, then one
`multi` with `findCards` searches):
- **Links survive renaming:** links store Anki's deck id (`ankiDeckId`); a
  renamed deck (or parent) updates the stored name. Deck ids are the same on
  every synced device. Changing a link by hand drops the old id.
- **Real card counts:** cards in each item's own deck → `Chunk.ankiCards`.
  The planner counts them as existing cards (reviews), "write cards"
  progress moves to cards found / cards expected (all → watch + read done
  too; progress never goes back) – `applyAnkiCounts` in core. Items without
  pages/slides (e.g. just imported from Anki) only keep the count – no
  progress is guessed. The "From Anki" import reads the counts right away and
  shows them in the review ("50 cards in Anki").
- **Real Anki time:** review cards due per subject for today + 6 days
  (`is:due`, `prop:due=N`) → `ankiDue` (synced to the account). The planner
  uses them for those days (plus reviews of cards the plan adds) and keeps
  estimating other days and subjects without a deck. The Anki task shows
  "Biology (87 due)".
- **Both directions:** a lecture added to a linked subject gets
  `Collection::Title` in Anki right away (when Anki is reachable); the
  Subjects page shows "N new sub-decks in Anki → Add as lectures" and "N
  items without a sub-deck → Create in Anki".
- Phones can't read Anki; they use the numbers and links last read on a
  computer (synced with the account). Settings shows "Read from Anki … ago".

### Connecting to the Anki app
Each Anki task has an **▶ Anki** button that opens **exactly the linked deck
of the lecture/chapter** whose cards were written in that session. If a
session wrote cards for several items, there's one ▶ button per item. Review-
only Anki tasks open the **subject's deck**:

| Device | What happens | How |
|---|---|---|
| Windows / Mac / Linux – Chrome, Edge, Firefox – with Anki + **AnkiConnect** (2055492159) | Desktop Anki opens review of exactly that deck | `guiDeckReview` via AnkiConnect on 127.0.0.1:8765. Chrome/Edge 142+ ask once to allow "apps on this device" (Local Network Access). |
| Same, not connected yet | The first ▶ press opens a dialog: install the add-on, keep Anki open, **Connect and open** → browser prompt → Anki's popup → the deck opens | `requestPermission`, then `guiDeckReview` |
| Same, Anki closed | Dialog "Open Anki, then Try again" (+ AnkiWeb) | |
| **Mac Safari** | Explains that Safari can't talk to apps on the Mac: use Chrome/Edge/Firefox (or AnkiWeb) | WebKit blocks every request to 127.0.0.1 from https pages (WebKit bug 171934) |
| iPhone / iPad (AnkiMobile 25.07+) | AnkiMobile starts studying exactly that deck | `anki://x-callback-url/study?deck=<full deck name>` (AnkiMobile 25.07 release notes) |
| Android (AnkiDroid 2.25+) | AnkiDroid opens on **exactly that deck's cards** (card browser) – not the study screen | `intent://x-callback-url/browser?search=deck:"…"#Intent;scheme=anki;package=com.ichi2.anki;end`; older/missing AnkiDroid → Play Store. Chrome only opens BROWSABLE activities, and AnkiDroid's "review deck" intent (`EXTRA_DECK_ID`) isn't one. Exact study needs a `study` deep link in AnkiDroid (like AnkiMobile's) or our own Android app. |

**AnkiWeb only (no Anki app):** per device, Settings → Anki → "How do you
study Anki on this device?" → **AnkiWeb (browser)** (also offered as "I only
use AnkiWeb" in the dialog of the first ▶ press). ▶ Anki then opens AnkiWeb's
deck list in a new tab and says which deck to open ("In AnkiWeb, open “Bio
WS26” › “VL03 Genetics”"). AnkiWeb has no API (and its terms forbid automated
access) and no link to a single deck, so nothing more is possible there;
linking decks and real card numbers need the free Anki app on a computer
once (it syncs with AnkiWeb).

**Connecting (desktop, Settings → Anki):** install AnkiConnect, keep Anki
open, press Connect → Anki shows an "allow this website?" popup
(`requestPermission`). After that:
- **Set up subjects from Anki** – see "Linking" above.
- **Create missing decks in Anki** – creates the linked / default decks that
  don't exist yet (they reach the phone via AnkiWeb sync).
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
- **Plan:** the **week timetable is the main view** (7 columns on wide
  screens, a list below), the **overview is a timeline per subject** below:
  all subjects on one scale from this week to the last exam, study days as
  bars in the subject color (taller = more), exam reviews dark, a dashed line
  for "main study done", a cap at the exam, a today line, month labels, the
  shown week highlighted; tap a row to jump to that week; status on the
  right. Same height for 3 weeks or 7 months. exam list with "main study
  done by", legend. **Days take the colors of the subjects studied:** one
  subject = light tint of its color, two = split diagonally, more = diagonal
  stripes (overview: stronger on busier days). Buffer = striped amber, extra
  = rose border, day off = grey, exam = full subject color.
- **Subjects:** cards with progress, items done, cards made / estimated.
  Only one button: **+ Subject** → a short form (name, exam date/time,
  difficulty, color; nothing is saved until "Create and add material") → the
  subject editor opens on **Material** with four choices: Import files ·
  Paste a table of contents · From your Anki deck · Add by hand. Imports
  started there skip the subject/exam fields ("Adding to Biology"). The
  editor has tabs **Details · Material · Anki deck**; editor
  with category icon per item, step toggles, real card count, reorder, the
  linked (blue) or default Anki deck name, and an "Anki deck" section to link
  the subject and its items.
- **Settings:** "When do you study?" (full width: presets + week grid),
  study rhythm, pace, weekly buffer, evening check-in time, days off, Anki,
  splitting long material, time estimates, data (export/import/start over).
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
