# StudyMaster – Design

A free, simple web app (desktop + mobile) that turns a list of study material
and exam dates into a day-by-day study plan, and keeps that plan up to date as
real life happens.

## Core ideas

### Study material = chunks
A **chunk** is one study unit: a book chapter, a slide deck, or both (pages
*and* slides). Chunks belong to a **subject**, which has an **exam date** and a
**weight** (0.5 · 0.8 · 1.0 · 1.2 · 1.5) for easier or harder subjects.

### Everything becomes "effort minutes"
Each chunk has three steps: **📖 read · 📝 summarize · 🃏 make Anki cards**.

```
read    = pages × 3 min   + slides × 1 min
summary = pages × 1 min   + slides × 0.5 min
cards   = (pages × 1.5 + slides × 0.7) cards × 1.5 min
effort  = (read + summary + cards) × weight
```

All rates can be changed. Once the real number of cards is entered, it replaces
the estimate.

### Sessions
- A session is 2–3 h (default 150 min).
- 1–4 sessions per day: `am1, am2` in the morning, `pm1, pm2` in the afternoon.
- The user sets a **preferred** number (normal plan) and a **max** number
  (only used with approval).
- **Every session starts with an Anki review block**: at least 10 min, growing
  with the number of cards made, never more than 30 % of the session.
- At most N chunks per session; big chunks are split automatically
  (max pages / slides per chunk, and what fits in a session).

### Days you can't study
Blocked ranges (vacation, sick, break, other) never get any sessions.

### Exams
- **Main study ends early**: by default 2 days before the exam.
- **A short review session** goes in the last free slot before each exam
  (max 60 % of a session). Reviews are reserved *first*, so back-to-back
  exams each still get one.
- On exam day, the exam's half (morning/afternoon) has no sessions.

### Weekly buffer = catch-up reserve
One half-day per week is planned **empty** (a fixed half-day or automatic,
avoiding exam days and the day before an exam). It is only used to catch up
after falling behind, and only when the user agrees. If it isn't needed, it's
free time.

## The planner (`packages/core`)

`planOnce(state, from, options)`:
1. Build the slot grid (blocked days, exam halves, buffer and extra slots).
2. Reserve review sessions right before each exam.
3. Walk the slots in time order. Each session gets its Anki block, then the
   subject with the **least slack** (free capacity before its deadline minus
   remaining work) fills the rest, in chunk order. A session prefers to stay
   on one subject unless another is at risk. Pieces that don't fit are cut to
   fill the session (no leftovers under 30 min).
4. Buffer and extra slots are only used by subjects that would not make it
   otherwise, and buffer comes before extra sessions.
5. **Pacing** (setting): `even` (default) spreads each subject's work steadily
   until its finish date, so there's study (and Anki) on most days. A subject
   only takes a slot when it is behind its steady pace, or when time gets
   tight, in which case it falls back to as-soon-as-possible. `early` finishes
   material as soon as possible.

`planWithEscalation(state, from)` tries, in order, and stops at the first
plan that fits:

| Level | What changes | Approval |
|---|---|---|
| `normal` | preferred sessions only | applied automatically |
| `shortenExamBuffer` | main study may end 1 day closer to the exam | asks |
| `useWeeklyBuffer` | catch-up in the weekly buffer half-day | asks |
| `extraSessions` | sessions above preferred, up to max | asks + warning |
| `infeasible` | nothing fits: shows hours missing per subject | warning |

`checkInDay(chunks, plan, date, "yes" | "no", finished?)` applies the
end-of-day check-in. Then the plan is rebuilt from the next day, and
`diffPlans(old, new)` lists what moved ("Moved Ch. 3 to Wednesday").

## End-of-day check-in
- Web Push notification at a chosen time with **[Yes] [No]** buttons.
- Yes → the day's work is done (saved in the background).
- No → quick screen to tick what *was* done (e.g. read, but no cards yet).
- Ignored → asked again next morning; after 2 days it counts as missed.
- Buttons work on Android and desktop Chrome/Edge; on iPhone the app must be
  added to the Home Screen and tapping opens the check-in screen.

## AI: free, and invisible for normal users
- The app works fully without AI.
- **Built-in assistant** ("Ask StudyMaster"): runs through our own server with
  a server-side API key; no AI account needed. Provider is swappable (e.g.
  Claude Haiku for cents per month, or a free tier). Per-user daily limit and
  a monthly spend cap.
- **MCP server**: the same tools (`add_chunks`, `add_blocked_days`, `replan`,
  `log_progress`, `get_today`, …) for people who use their own Claude (works
  on the free plan as one custom connector).
- **Copy-paste prompts** for any other chatbot (import syllabus → JSON).
- AI changes go through the same approval flow: it can never silently
  overbook the user.

## Tech
| Part | Choice |
|---|---|
| Planner | TypeScript, no dependencies, Vitest tests |
| Web app | React 19 + Vite 6 + Tailwind 4 + zustand, installable PWA (hand-made UI components in `components/ui.tsx`) |
| Backend | Cloudflare Workers (API + MCP + cron for check-ins) + D1 |
| Login | Google or email magic link |

## Roadmap
1. ✅ `packages/core`: effort model with Anki, planner with reviews, buffers,
   escalation and pacing, check-in, plan diff, validation, tests
2. ✅ Web app (local-only): setup wizard, Today view with check-in card,
   calendar with buffer blocks, progress and exam countdowns, approval banner,
   backup export/import, offline PWA, dark mode
3. **Anki on free days**: add a short Anki-only session (e.g. 15–20 min) on
   days without study before the last exam, so reviews never pause. Probably a
   new `PlannedSession.type: "anki"` produced in `planOnce`, shown on Today and
   in the calendar, not part of the Yes/No check-in.
4. **Backend** (Cloudflare Workers + D1, free tier):
   - Login (email magic link or Google), one row of app data per user;
     keep the local-first store and sync it (last write wins is fine at first).
   - Web Push: store push subscriptions; a Cron Trigger every 15 min sends the
     check-in to users whose `checkInTime` has come (in their timezone).
   - Notification actions **Yes / No**: switch vite-plugin-pwa to
     `injectManifest` and handle `notificationclick` in a custom service worker
     (Yes → POST the check-in; No → open `/#today` with the check-in sheet).
   - iPhone: push only works after "Add to Home Screen" – show a hint.
5. **Built-in assistant** ("Ask StudyMaster"): Worker endpoint with a
   server-side LLM key. Tools: `add_subject`, `add_chunks`, `add_blocked_days`,
   `update_settings`, `get_today`, `get_schedule`, `log_progress`, `replan`,
   `what_if`. Writes go through the same approval rules. Per-user daily limit
   and a monthly spend cap.
6. **MCP server** on the same Worker (`/mcp`, OAuth) exposing the same tools,
   plus a "Connect to Claude" page with the 3 steps.
7. **Import with AI**: a copy-paste prompt for any chatbot that returns JSON
   for subjects and chunks, plus an import screen.

Smaller ideas: drag a chunk to another day; keep the plan more stable between
re-plans (today currently re-plans from scratch); `.ics` calendar export;
"realistic pace" factor learned from check-ins; German translation; Playwright
end-to-end tests.
