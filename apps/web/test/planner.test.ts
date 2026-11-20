import { withDefaults, type Chunk, type Subject } from "@studymaster/core";
import { describe, expect, it } from "vitest";
import { computePlanner, planStart, proposalKey, usedSlotKeys } from "../src/planner.js";
import type { AppData } from "../src/store.js";

const TODAY = "2026-11-25"; // Wednesday

function data(patch: Partial<AppData> = {}): AppData {
  const subjects: Subject[] = [{ id: "bio", name: "Biology", weight: 1, examDate: "2026-12-14" }];
  const chunks: Chunk[] = Array.from({ length: 6 }, (_, i) => ({
    id: `c${i}`, subjectId: "bio", title: `Ch ${i + 1}`, pages: 16, slides: 0, order: i,
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

const record = { answer: "yes" as const, at: "", items: [] };

describe("planStart", () => {
  it("goes back at most 2 days for open check-ins", () => {
    expect(planStart(data(), TODAY)).toBe("2026-11-23");
  });

  it("starts the day after the last check-in", () => {
    expect(planStart(data({ checkIns: { "2026-11-24": record } }), TODAY)).toBe(TODAY);
    expect(planStart(data({ checkIns: { [TODAY]: record } }), TODAY)).toBe("2026-11-26");
  });

  it("never starts before the setup date", () => {
    expect(planStart(data({ startDate: TODAY }), TODAY)).toBe(TODAY);
  });
});

describe("computePlanner", () => {
  it("lists past days without a check-in as pending", () => {
    const planner = computePlanner(data({ settings: withDefaults({ pacing: "early" }) }), TODAY);
    expect(planner.pendingDays).toEqual(["2026-11-23", "2026-11-24"]);
  });

  it("shows a proposal and keeps the plan within approved limits", () => {
    // 1 session a day, 30 chunks: needs buffer and extra sessions.
    const tight = data({
      settings: withDefaults({ preferredSessionsPerDay: 1, maxSessionsPerDay: 2 }),
      chunks: Array.from({ length: 30 }, (_, i) => ({
        id: `c${i}`, subjectId: "bio", title: `Ch ${i + 1}`, pages: 16, slides: 0, order: i,
      })),
      checkIns: { "2026-11-24": record },
    });
    const before = computePlanner(tight, TODAY);
    expect(before.proposal).toBeDefined();
    expect(before.shown.usedExtraSlots).toEqual([]);
    expect(before.shown.usedBufferSlots).toEqual([]);

    const proposal = before.proposal!;
    const after = computePlanner(
      {
        ...tight,
        approval: {
          key: proposalKey(proposal),
          level: proposal.level,
          slots: usedSlotKeys(proposal),
          examBufferDays: proposal.examBufferDays,
        },
      },
      TODAY,
    );
    expect(after.proposal).toBeUndefined();
    expect(after.shown.level).toBe(proposal.level);
  });

  it("asks again when the plan needs slots that were not approved", () => {
    const settings = withDefaults({ preferredSessionsPerDay: 1, maxSessionsPerDay: 2 });
    const many = (n: number) =>
      Array.from({ length: n }, (_, i): Chunk => ({ id: `c${i}`, subjectId: "bio", title: `Ch ${i}`, pages: 16, slides: 0, order: i }));
    const small = computePlanner(data({ settings, chunks: many(26), checkIns: { "2026-11-24": record } }), TODAY);
    const approval = {
      key: proposalKey(small.proposal!),
      level: small.proposal!.level,
      slots: usedSlotKeys(small.proposal!),
      examBufferDays: small.proposal!.examBufferDays,
    };
    const bigger = computePlanner(data({ settings, chunks: many(30), approval, checkIns: { "2026-11-24": record } }), TODAY);
    expect(bigger.proposal).toBeDefined();
  });
});
