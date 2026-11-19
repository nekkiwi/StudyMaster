# StudyMaster

Turn your chapters, slide decks and exam dates into a realistic study plan –
with Anki reviews built in, a weekly catch-up buffer, and a plan that adjusts
itself when a day doesn't go as planned.

See [docs/DESIGN.md](docs/DESIGN.md) for how it works.

## Status

- `packages/core` – the planning engine (done, tested)
- `apps/web` – the web app: setup wizard, Today with check-in, calendar,
  subjects, settings. Works offline and can be installed on phone and desktop.
  Data is stored on the device.
- Backend (sync + push notifications), assistant and MCP connector – next

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
result.plan.sessions;  // day-by-day sessions with Anki block + chunks
```
