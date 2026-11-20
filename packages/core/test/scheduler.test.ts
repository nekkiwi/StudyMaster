import { describe, expect, it } from "vitest";
import { checkInDay, itemsForDate } from "../src/checkin.js";
import { addDays } from "../src/dates.js";
import { diffPlans } from "../src/diff.js";
import { planOnce, planWithEscalation } from "../src/scheduler.js";
import { buildSlotGrid } from "../src/slots.js";
import type { Settings } from "../src/types.js";
import { validateState } from "../src/validate.js";
import { chunks, state, subject } from "./helpers.js";

// 2026-11-23 is a Monday.
const MON = "2026-11-23";
const normal = { examBufferDays: 2, useWeeklyBuffer: false, useExtraSessions: false };

describe("slot grid", () => {
  it("skips blocked days and the exam's half of exam day", () => {
    const st = state(
      [subject("bio", "2026-11-27")],
      [],
      { preferredSessionsPerDay: 2, maxSessionsPerDay: 2, weeklyBuffer: { enabled: false, when: "auto" } },
      [{ id: "sick", start: "2026-11-24", end: "2026-11-25", reason: "sick" }],
    );
    const grid = buildSlotGrid(st, MON, "2026-11-27");
    expect(grid.some((x) => x.date === "2026-11-24" || x.date === "2026-11-25")).toBe(false);
    // Morning exam on Friday: only the afternoon slot is left that day.
    expect(grid.filter((x) => x.date === "2026-11-27").map((x) => x.slot)).toEqual(["pm1"]);
  });

  it("marks slots above the preferred count as extra", () => {
    const st = state([subject("bio", "2026-11-27")], [], {
      preferredSessionsPerDay: 2,
      maxSessionsPerDay: 4,
      weeklyBuffer: { enabled: false, when: "auto" },
    });
    const monday = buildSlotGrid(st, MON, MON);
    expect(monday.map((x) => `${x.slot}:${x.kind}`)).toEqual([
      "am1:normal",
      "am2:extra",
      "pm1:normal",
      "pm2:extra",
    ]);
  });

  it("puts the weekly buffer on a fixed half-day", () => {
    const st = state([subject("bio", "2026-12-20")], [], {
      preferredSessionsPerDay: 4,
      maxSessionsPerDay: 4,
      weeklyBuffer: { enabled: true, when: { weekday: 0, half: "pm" } },
    });
    const grid = buildSlotGrid(st, MON, "2026-12-06");
    const buffer = grid.filter((x) => x.kind === "buffer");
    expect(buffer.map((x) => `${x.date} ${x.slot}`)).toEqual([
      "2026-11-29 pm1",
      "2026-11-29 pm2",
      "2026-12-06 pm1",
      "2026-12-06 pm2",
    ]);
  });
});

describe("planOnce", () => {
  it("never plans on blocked days", () => {
    const st = state(
      [subject("bio", "2026-12-10")],
      chunks("bio", 12),
      {},
      [{ id: "v", start: "2026-11-25", end: "2026-11-28", reason: "vacation" }],
    );
    const plan = planOnce(st, MON, normal);
    expect(plan.sessions.some((x) => x.date >= "2026-11-25" && x.date <= "2026-11-28")).toBe(false);
    expect(plan.feasible).toBe(true);
  });

  it("starts every session with an Anki block", () => {
    const st = state([subject("bio", "2026-12-10")], chunks("bio", 5));
    const plan = planOnce(st, MON, normal);
    for (const session of plan.sessions) expect(session.ankiMinutes).toBeGreaterThanOrEqual(10);
    for (const session of plan.sessions.filter((x) => x.type === "study")) {
      const used = session.ankiMinutes + session.items.reduce((a, i) => a + i.minutes, 0);
      expect(used).toBeLessThanOrEqual(st.settings.sessionMinutes + 1);
      expect(session.items.length).toBeLessThanOrEqual(st.settings.maxChunksPerSession);
    }
  });

  it("puts a short review session in the last slot before the exam", () => {
    const st = state([subject("bio", "2026-11-27")], chunks("bio", 3));
    const plan = planOnce(st, MON, normal);
    const review = plan.sessions.find((x) => x.type === "review")!;
    expect(review).toMatchObject({ date: "2026-11-26", slot: "pm1", reviewSubjectId: "bio" });
    expect(review.reviewMinutes).toBeGreaterThanOrEqual(20);
  });

  it("gives back-to-back exams a review each and finishes main study early", () => {
    const st = state(
      [subject("a", "2026-12-07"), subject("b", "2026-12-08")],
      [...chunks("a", 6), ...chunks("b", 6)],
    );
    const plan = planOnce(st, MON, normal);
    const reviews = plan.sessions.filter((x) => x.type === "review");
    expect(reviews.map((x) => x.reviewSubjectId).sort()).toEqual(["a", "b"]);
    expect(reviews.find((x) => x.reviewSubjectId === "a")!.date < "2026-12-07").toBe(true);
    // B's review is on A's exam day afternoon, B's main study ends 2 days before.
    expect(reviews.find((x) => x.reviewSubjectId === "b")).toMatchObject({ date: "2026-12-07", slot: "pm1" });
    for (const session of plan.sessions) {
      for (const item of session.items) {
        const exam = item.subjectId === "a" ? "2026-12-07" : "2026-12-08";
        expect(session.date < addDays(exam, -2)).toBe(true);
      }
    }
    expect(plan.feasible).toBe(true);
  });

  it("studies the subject with the closest deadline first", () => {
    const st = state(
      [subject("late", "2026-12-20"), subject("soon", "2026-11-30")],
      [...chunks("late", 6), ...chunks("soon", 6)],
    );
    const plan = planOnce(st, MON, normal);
    expect(plan.sessions[0]!.items[0]!.subjectId).toBe("soon");
  });

  it("keeps the weekly buffer empty when not needed", () => {
    const st = state([subject("bio", "2026-12-20")], chunks("bio", 6));
    const plan = planOnce(st, MON, { ...normal, useWeeklyBuffer: true });
    expect(plan.sessions.some((x) => x.kind === "buffer")).toBe(false);
    expect(plan.bufferSlots.length).toBeGreaterThan(0);
  });

  it("keeps chunk order within a subject", () => {
    const st = state([subject("bio", "2026-12-20")], chunks("bio", 8));
    const plan = planOnce(st, MON, normal);
    const order = [...new Set(plan.sessions.flatMap((x) => x.items).map((i) => i.chunkId))];
    expect(order).toEqual(chunks("bio", 8).map((c) => c.id));
  });

  it("fills sessions instead of leaving half of them empty", () => {
    // 26 pages ≈ 163 min, more than the 140 min left next to the Anki block,
    // so chapters get cut and continue in the next session.
    const st = state([subject("bio", "2026-12-20")], chunks("bio", 6, 26), { pacing: "early" });
    const plan = planOnce(st, MON, normal);
    const study = plan.sessions.filter((x) => x.type === "study");
    const full = study.slice(0, -1); // all but the last session
    for (const session of full) {
      const used = session.items.reduce((a, i) => a + i.minutes, 0) + session.ankiMinutes;
      expect(used).toBeGreaterThanOrEqual(st.settings.sessionMinutes - 30);
    }
    // Chunks that span several sessions are numbered in order; others have no suffix.
    const all = study.flatMap((x) => x.items);
    for (const id of new Set(all.map((i) => i.chunkId))) {
      const parts = all.filter((i) => i.chunkId === id);
      const base = parts[0]!.baseTitle;
      expect(parts.map((p) => p.title)).toEqual(
        parts.map((_, i) => (parts.length > 1 ? `${base} (${i + 1}/${parts.length})` : base)),
      );
    }
    expect(all.some((i) => i.parts > 1)).toBe(true);
  });

  it("keeps review sessions short", () => {
    const st = state([subject("bio", "2026-12-20")], chunks("bio", 20));
    const review = planOnce(st, MON, normal).sessions.find((x) => x.type === "review")!;
    expect(review.reviewMinutes).toBeLessThanOrEqual(st.settings.sessionMinutes * 0.6);
  });
});

describe("planWithEscalation", () => {
  // One 110-min session a day = 10 min Anki + 100 min study = one chunk.
  // Exam Monday Nov 30 (morning). Sunday = review, Saturday = weekly buffer,
  // so Mon–Fri give 5 normal slots, plus 1 buffer slot and 6 extra afternoons.
  const tight: Partial<Settings> = {
    sessionMinutes: 110,
    preferredSessionsPerDay: 1,
    maxSessionsPerDay: 2,
    examBufferDays: 0,
    weeklyBuffer: { enabled: true, when: "auto" },
  };
  const run = (n: number) =>
    planWithEscalation(state([subject("bio", "2026-11-30")], chunks("bio", n), tight), MON);

  it("fits without asking when there is room", () => {
    const result = run(5);
    expect(result.level).toBe("normal");
    expect(result.needsApproval).toBe(false);
    expect(result.plan.sessions.some((x) => x.kind !== "normal")).toBe(false);
  });

  it("asks before using the weekly buffer", () => {
    const result = run(6);
    expect(result.level).toBe("useWeeklyBuffer");
    expect(result.needsApproval).toBe(true);
    expect(result.usedBufferSlots).toEqual([{ date: "2026-11-28", slot: "am1", kind: "buffer" }]);
    expect(result.usedExtraSlots).toEqual([]);
  });

  it("warns before booking extra sessions", () => {
    const result = run(7);
    expect(result.level).toBe("extraSessions");
    expect(result.usedExtraSlots).toHaveLength(1);
    expect(result.warnings.join(" ")).toMatch(/1 extra session/);
  });

  it("reports the deficit when nothing fits", () => {
    const result = run(20);
    expect(result.level).toBe("infeasible");
    expect(result.plan.subjects[0]!.deficitMinutes).toBe(800);
    expect(result.warnings.join(" ")).toMatch(/BIO is 13.3 h short/);
  });

  it("shortens the exam buffer before touching the weekly buffer", () => {
    // Exam Friday morning, 1 session a day, review Thursday.
    // 2 buffer days → study Mon–Tue only. 1 buffer day → Mon–Wed.
    const st = state([subject("bio", "2026-11-27")], chunks("bio", 3), {
      preferredSessionsPerDay: 1,
      maxSessionsPerDay: 1,
      examBufferDays: 2,
      // Sunday afternoon buffer = after the exam, so it can't help here.
      weeklyBuffer: { enabled: true, when: { weekday: 0, half: "pm" } },
    });
    const result = planWithEscalation(st, MON);
    expect(result.level).toBe("shortenExamBuffer");
    expect(result.examBufferDays).toBe(1);
    expect(result.usedBufferSlots).toEqual([]);
    expect(result.warnings[0]).toMatch(/ends 1 day before exams instead of 2/);
  });
});

describe("check-in and replanning", () => {
  const st = state([subject("bio", "2026-12-10")], chunks("bio", 10));

  it("'yes' marks the day's work as done", () => {
    const plan = planOnce(st, MON, normal);
    const today = itemsForDate(plan, MON);
    const updated = checkInDay(st.chunks, plan, MON, "yes");
    for (const item of today) {
      expect(updated.find((c) => c.id === item.chunkId)!.done?.read).toBeGreaterThan(0);
    }
    const next = planOnce({ ...st, chunks: updated }, addDays(MON, 1), normal);
    const planned = next.sessions.flatMap((x) => x.items).map((x) => x.chunkId);
    for (const item of today.filter((x) => x.parts === 1)) expect(planned).not.toContain(item.chunkId);
  });

  it("'no' moves the work to later days", () => {
    const plan = planOnce(st, MON, normal);
    const today = itemsForDate(plan, MON);
    const updated = checkInDay(st.chunks, plan, MON, "no");
    const next = planOnce({ ...st, chunks: updated }, addDays(MON, 1), normal);
    const planned = next.sessions.flatMap((x) => x.items).map((x) => x.chunkId);
    for (const item of today) expect(planned).toContain(item.chunkId);
    expect(diffPlans(plan, next).length).toBeGreaterThan(0);
  });

  it("'no' with partial progress only counts what was done", () => {
    const plan = planOnce(st, MON, normal);
    const first = itemsForDate(plan, MON)[0]!;
    const updated = checkInDay(st.chunks, plan, MON, "no", [
      { chunkId: first.chunkId, part: first.part, steps: ["read"] },
    ]);
    const chunk = updated.find((c) => c.id === first.chunkId)!;
    expect(chunk.done).toMatchObject({ read: first.deltas.read });
    expect(chunk.done?.cards ?? 0).toBe(0);
  });
});

describe("validateState", () => {
  it("accepts a valid state", () => {
    expect(validateState(state([subject("bio", "2026-12-10")], chunks("bio", 2)))).toEqual([]);
  });

  it("catches common mistakes", () => {
    const bad = state(
      [subject("bio", "2026-02-30", { weight: 2 as never })],
      [{ id: "x", subjectId: "nope", title: "X", pages: 0, slides: 0, order: 1 }],
      { preferredSessionsPerDay: 3, maxSessionsPerDay: 2 },
    );
    const errors = validateState(bad).join("\n");
    expect(errors).toMatch(/weight/);
    expect(errors).toMatch(/invalid exam date/);
    expect(errors).toMatch(/unknown subject/);
    expect(errors).toMatch(/needs pages or slides/);
    expect(errors).toMatch(/Max sessions/);
  });
});

describe("pacing", () => {
  const work = () => [...chunks("bio", 8), ...chunks("chem", 6, 0, 50)];
  const subjects = () => [subject("bio", "2026-12-21"), subject("chem", "2026-12-22")];

  it("early finishes material as soon as possible", () => {
    const plan = planOnce(state(subjects(), work(), { pacing: "early" }), MON, normal);
    const last = plan.subjects.map((s) => s.lastStudyDate!).sort().pop()!;
    expect(last < "2026-12-02").toBe(true);
  });

  it("even spreads work until the finish date, with Anki on most days", () => {
    const plan = planOnce(state(subjects(), work(), { pacing: "even" }), MON, normal);
    expect(plan.feasible).toBe(true);
    const bio = plan.subjects.find((s) => s.subjectId === "bio")!;
    expect(bio.lastStudyDate! >= "2026-12-14").toBe(true);
    const studyDays = new Set(plan.sessions.filter((s) => s.type === "study").map((s) => s.date));
    expect(studyDays.size).toBeGreaterThanOrEqual(15); // vs. 6 days with "early"
  });

  it("even fits as much work as early when time is tight", () => {
    const tight = (pacing: "even" | "early") =>
      planWithEscalation(
        state([subject("a", "2026-12-04"), subject("b", "2026-12-07")], [...chunks("a", 12), ...chunks("b", 10)], { pacing }),
        MON,
      );
    expect(tight("even").level).toBe(tight("early").level);
    expect(tight("even").plan.feasible).toBe(tight("early").plan.feasible);
  });
});

describe("approval limit", () => {
  it("stops at the level the user has approved", () => {
    const st = state([subject("bio", "2026-11-30")], chunks("bio", 6), {
      sessionMinutes: 110,
      preferredSessionsPerDay: 1,
      maxSessionsPerDay: 2,
      examBufferDays: 0,
    });
    const full = planWithEscalation(st, MON);
    const capped = planWithEscalation(st, MON, "normal");
    expect(full.level).toBe("useWeeklyBuffer");
    expect(capped.level).toBe("infeasible");
    expect(capped.usedBufferSlots).toEqual([]);
    expect(capped.plan.subjects[0]!.deficitMinutes).toBe(100);
  });
});
