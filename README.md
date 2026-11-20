# StudyMaster

Turn your chapters, slide decks and exam dates into a realistic study plan –
with Anki reviews built in, a weekly catch-up buffer, and a plan that adjusts
itself when a day doesn't go as planned.

**Live:** https://app.studymaster.workers.dev

Docs: [Design](docs/DESIGN.md) · [Decisions](docs/DECISIONS.md) ·
[Roadmap](docs/ROADMAP.md) · [Hosting & apps](docs/HOSTING.md) · [AI](docs/AI.md)

## Status

- `packages/core` – the planning engine (done, tested)
- `apps/web` – the web app: setup wizard, Today with check-in, calendar,
  subjects, settings. Works offline and can be installed on phone and desktop.
  Data is stored on the device.
- Next: deploy on Cloudflare, backend (login, sync, push check-ins),
  built-in assistant and MCP connector – see [docs/ROADMAP.md](docs/ROADMAP.md)

Working with Claude Code? `CLAUDE.md` has the commands, layout and conventions.

## Development

```bash
npm install
npm run dev       # web app at http://localhost:5173
npm test          # planner + app tests
npm run typecheck
npm run build     # production build in apps/web/dist
```

Tip: on the welcome screen, "Try with example data" fills in three subjects
so you can look around right away.

## Quick example

```ts
import { planWithEscalation, withDefaults } from "@studymaster/core";

const result = planWithEscalation(
  {
    subjects: [{ id: "bio", name: "Biology", weight: 1.2, examDate: "2026-12-14" }],
    chunks: [{ id: "b1", subjectId: "bio", title: "Ch 1", pages: 22, slides: 0, order: 1 }],
    blocked: [{ id: "v", start: "2026-12-04", end: "2026-12-06", reason: "vacation" }],
    settings: withDefaults({ preferredSessionsPerDay: 2 }),
  },
  "2026-11-23",
);

result.level;          // "normal" | "useWeeklyBuffer" | "extraSessions" | …
result.needsApproval;  // ask the user before applying?
result.plan.sessions;  // day-by-day sessions: Anki review item + chapters / slide decks
```
