# Decision log

Decisions made while designing StudyMaster, with the reason and what else was
considered. Newest topics at the bottom. Change a decision by adding a new
entry, not by editing history.

| # | Decision | Why | Alternatives considered |
|---|---|---|---|
| 1 | Material is entered as **chunks** (chapter / slide deck / both) with page and slide counts | Simple to enter, enough to estimate effort | Hours per chunk (people don't know), page ranges (more typing) |
| 2 | Difficulty is a **preset weight** 0.5 / 0.8 / 1.0 / 1.2 / 1.5 | Easy choice, multiplies effort | Free number (confusing), per-chunk difficulty (too much input) |
| 3 | Everything is converted to **effort minutes**: read + summary + Anki card creation, × weight | Studying includes summaries and making cards, not just reading | Pages only; separate per-step planning |
| 4 | **Anki review is its own item category** (like chapter / slide deck), first item of every session; Anki-only sessions on free days | Daily Anki is part of the work and should be visible and checkable; reviews must never pause | A fixed block hidden inside each session (first version); no Anki planning |
| 5 | Sessions are **2–3 h blocks, 1–4 per day** (2 morning + 2 afternoon) | Matches how students plan their day | Free-form time blocks (more complex UI) |
| 6 | **Preferred vs. max sessions per day** | The plan uses the normal rhythm; more only with approval | Single number (no way to express "only if needed") |
| 7 | Main study ends **N days before each exam** (default 2) + a **short review session** right before, **reserved first** | Well in advance; back-to-back exams still get a review | Plan right up to the exam (cramming) |
| 8 | **Weekly buffer half-day = catch-up reserve**: empty by default, used only after falling behind, and only with approval | Free time in good weeks, a safety net in bad weeks | Always-protected free time (pushes catch-up straight to extra sessions) |
| 9 | **Escalation ladder**: normal → shorter exam buffer → weekly buffer → extra sessions → infeasible; everything beyond normal needs approval | Never silently overbook; smallest change first | Auto-apply everything; just show "doesn't fit" |
| 10 | **Approvals remember exact slots**; needing fewer is fine, anything new asks again | One approval shouldn't be a blank cheque | Approving a level once for good |
| 11 | **Least-slack** filling, sessions **packed** (cut pieces to fill), prefer one subject per session | Earliest/most at-risk work first; no half-empty sessions; less task switching | Earliest-deadline-first only; whole chunks only (left ~1 h unused per session) |
| 12 | **Pacing setting, default "Steady" (even)**, "Finish early" optional | Even pace = study and Anki on most days, less early cramming; falls back to ASAP when tight so it never fits less | Finish early only (left weeks empty before exams) |
| 13 | **Evening Yes/No check-in**, "No" → tick read/summary/cards per piece; ignored → asked next morning; after 2 days counts as missed | Two taps on a good day, honest data on a bad day | Only manual editing; daily time tracking (too much effort) |
| 14 | Planner is a **pure TypeScript package** with tests, shared by app, backend and AI | One source of truth, easy to test, runs anywhere | Planning logic inside the UI |
| 15 | **Local-first** web app now (localStorage + JSON backup), backend later | Ship and test the product before building accounts | Backend first |
| 16 | **React + Vite + Tailwind PWA** | Fast, one codebase for desktop and phone, installable | Native apps (two codebases), Next.js (not needed) |
| 17 | **Cloudflare** (Pages + Workers + D1 + Cron) for hosting | Free tiers, one platform, auto-deploy, cron for reminders | Vercel/Netlify (static only), Firebase (scheduled functions need paid plan), Supabase |
| 18 | Android app via **installable PWA**, later **Google Play as a Trusted Web Activity** | One codebase, updates come from the website | Native Android app; React Native |
| 19 | **Guest-first onboarding**, Google sign-in or email link, no passwords | Start in seconds; sign in only for sync/reminders | Account required up front |
| 20 | AI in three layers: **built-in assistant** (our server key) + **MCP connector** for Claude users + **copy-paste prompts** | Free and invisible for normal users; power users can use their own Claude | Requiring a Claude account; one shared Claude account (against terms, no API, privacy); asking users for API keys |
| 21 | Assistant and MCP server **share one tool set**; AI changes follow the approval rules | No drift between the two; AI can't overbook | Separate implementations |
| 22 | Host the web app as a **Cloudflare Worker with static assets** (Workers Builds from GitHub, `wrangler.jsonc`) instead of classic Pages | Cloudflare's current default flow; the planned backend can live in the same Worker | Classic Cloudflare Pages project; GitHub Actions deploy; manual deploys |
| 23 | **A chunk is a lecture: watch the recording → read → write cards** (recording minutes per chunk, default 60; video time not scaled by weight, optional speed factor). Replaces the summary step (supersedes #3) | That's how the material is actually studied; a 1-hour video takes an hour regardless of difficulty | Keep summaries; recordings as separate chunks |
| 24 | **Anki at the end of each study session**: learn the new cards written in it + review earlier cards of the same subjects; learning time is reserved with the lecture piece (supersedes the "first item" part of #4) | Matches A (lecture work) then B (study cards); new cards are learned while fresh | Anki first in every session; one daily Anki block |
| 25 | **Pieces follow the step order** (watch → read → cards), and the check-in only offers the steps planned in each piece | A piece should say concretely what to do ("🎬 60 min · 📖 12 pages"); no cards before watching | Proportional slices of every step |
| 26 | **Weekly plan instead of "sessions per day"**: per weekday, 0/1/2 sessions in the morning and afternoon. **Default: weekday afternoons + one half-day (morning) on Sat and Sun.** Free days stay free (no Anki-only, no extras). Max sessions per day still caps extras, only on study days (supersedes #5 and #6) | Students don't study every day; mornings are often lectures | Same sessions every day; days-off list only |
