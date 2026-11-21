import { withDefaults, type Chunk, type Subject } from "@studymaster/core";
import { describe, expect, it } from "vitest";
import { applyChanges, buildContext, checkInDates, reviewActions } from "../src/lib/assistant.js";
import { computePlanner } from "../src/planner.js";
import type { AppData } from "../src/store.js";

const TODAY = "2026-11-25"; // Wednesday

function data(patch: Partial<AppData> = {}): AppData {
  const subjects: Subject[] = [
    { id: "bio-uuid", name: "Biology", weight: 1, examDate: "2026-12-14" },
    { id: "chem-uuid", name: "Chemistry", weight: 1, examDate: "2026-12-18" },
  ];
  const chunks: Chunk[] = Array.from({ length: 6 }, (_, i) => ({
    id: `c${i}-uuid`, subjectId: i < 3 ? "bio-uuid" : "chem-uuid", title: `Ch ${i + 1}`, pages: 16, slides: 0, order: i,
  }));
  return {
    setupDone: true,
    startDate: "2026-11-20",
    subjects,
    chunks,
    blocked: [],
    settings: withDefaults(),
    checkIns: {},
    checkInTime: "20:00",
    ...patch,
  };
}

function setup(patch: Partial<AppData> = {}) {
  const d = data(patch);
  const plan = computePlanner(d, TODAY).shown.plan;
  const ctx = buildContext(d, plan, TODAY);
  return { d, plan, ctx, review: (actions: unknown[]) => reviewActions(actions, d, plan, TODAY, ctx.ids) };
}

describe("plan summary for the helper", () => {
  it("uses short ids and lists subjects, items, the week and open check-ins", () => {
    const { ctx, plan, d } = setup();
    const summary = JSON.parse(ctx.text);
    expect(summary.today).toBe("2026-11-25 Wed");
    expect(summary.subjects.map((s: { id: string; name: string }) => `${s.id}:${s.name}`)).toEqual(["s1:Biology", "s2:Chemistry"]);
    expect(ctx.ids.get("s1")).toBe("bio-uuid");
    expect(summary.items[0]).toMatchObject({ id: "i1", subject: "s1", title: "Ch 1", pages: 16 });
    expect(ctx.text).not.toContain("uuid");
    const open = checkInDates(d, plan, TODAY);
    expect(summary.sessions.filter((s: { checkInOpen?: boolean }) => s.checkInOpen).map((s: { date: string }) => s.date)).toEqual(
      plan.sessions.filter((s) => open.includes(s.date)).map((s) => s.date),
    );
  });
});

describe("reviewing the helper's actions", () => {
  it("maps ids back, describes changes and drops what doesn't fit", () => {
    const { review } = setup();
    const changes = review([
      { type: "block_days", start: "2026-11-27", end: "2026-11-25", reason: "sick", note: null },
      { type: "set_exam", subjectId: "s1", examDate: "2026-12-20", examHalf: null },
      { type: "set_exam", subjectId: "s9", examDate: "2026-12-20", examHalf: null },
      { type: "set_week_day", weekday: 6, morning: 0, afternoon: 0 },
      { type: "set_week_day", weekday: 9, morning: 1, afternoon: 1 },
      { type: "set_checkin_time", time: "25:00" },
      { type: "nonsense" },
    ]);
    expect(changes.map((c) => c.label)).toEqual(["Days off: 25 Nov – 27 Nov (sick)", "Biology exam: 20 Dec", "Saturdays: free"]);
    expect(changes[0]!.action).toMatchObject({ start: "2026-11-25", end: "2026-11-27" });
    expect(changes[1]!.action).toMatchObject({ subjectId: "bio-uuid" });
  });

  it("only allows check-ins for open days", () => {
    const { review } = setup();
    expect(review([{ type: "check_in", date: "2026-12-01", allDone: true, finished: [] }])).toEqual([]);
  });
});

describe("applying changes", () => {
  it("blocks days, moves exams, frees a weekday and adds material", () => {
    const { d, plan, review } = setup();
    const changes = review([
      { type: "block_days", start: "2026-11-25", end: "2026-11-26", reason: "sick", note: null },
      { type: "set_exam", subjectId: "s2", examDate: "2027-01-10", examHalf: "pm" },
      { type: "set_week_day", weekday: 6, morning: 0, afternoon: 0 },
      { type: "add_items", subjectId: "s1", items: [{ title: "Lecture 9", pages: 0, slides: 40, recordingMinutes: 0 }] },
      { type: "set_difficulty", subjectId: "s1", difficulty: "hard" },
      { type: "set_checkin_time", time: "21:30" },
    ]);
    const next = applyChanges(d, changes, plan);
    expect(next.blocked).toHaveLength(1);
    expect(next.blocked[0]).toMatchObject({ start: "2026-11-25", end: "2026-11-26", reason: "sick" });
    expect(next.subjects[1]).toMatchObject({ examDate: "2027-01-10", examHalf: "pm" });
    expect(next.subjects[0]!.weight).toBe(1.2);
    expect(next.settings.week[6]).toEqual({ am: 0, pm: 0 });
    const added = next.chunks.find((c) => c.title === "Lecture 9")!;
    expect(added).toMatchObject({ subjectId: "bio-uuid", slides: 40, order: 3 });
    expect(next.checkInTime).toBe("21:30");
    // The input is not changed.
    expect(d.blocked).toHaveLength(0);
  });

  it("removes only the asked part of days off", () => {
    const { d, plan, review } = setup({ blocked: [{ id: "b", start: "2026-12-01", end: "2026-12-10", reason: "vacation" }] });
    const next = applyChanges(d, review([{ type: "unblock_days", start: "2026-12-04", end: "2026-12-05" }]), plan);
    expect(next.blocked.map((b) => `${b.start}..${b.end}`)).toEqual(["2026-12-01..2026-12-03", "2026-12-06..2026-12-10"]);
  });

  it("checks in a day by text: partly done pieces count, the rest moves", () => {
    const { d, plan, ctx, review } = setup();
    const date = checkInDates(d, plan, TODAY)[0]!;
    const piece = plan.sessions.find((s) => s.date === date)!.items.find((i) => i.kind !== "anki")!;
    const short = [...ctx.ids].find(([, id]) => id === piece.chunkId)![0];
    const changes = review([{ type: "check_in", date, allDone: false, finished: [{ itemId: short, part: piece.part, fraction: 0.5 }] }]);
    expect(changes).toHaveLength(1);
    const next = applyChanges(d, changes, plan);
    expect(next.checkIns[date]!.answer).toBe("no");
    const chunk = next.chunks.find((c) => c.id === piece.chunkId)!;
    expect(chunk.done?.read).toBeGreaterThan(0);
  });

  it("sets progress outside a check-in and adds a subject", () => {
    const { d, plan, review } = setup();
    const next = applyChanges(
      d,
      review([
        { type: "set_progress", itemId: "i1", steps: ["read"], done: 1 },
        { type: "add_subject", name: "Physics", examDate: "2027-02-03", difficulty: "very hard" },
      ]),
      plan,
    );
    expect(next.chunks[0]!.done).toEqual({ read: 1 });
    expect(next.subjects[2]).toMatchObject({ name: "Physics", examDate: "2027-02-03", weight: 1.5 });
  });
});
