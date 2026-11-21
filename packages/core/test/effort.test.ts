import { describe, expect, it } from "vitest";
import { withDefaults } from "../src/defaults.js";
import { LEGACY_WORKFLOW } from "../src/types.js";
import {
  ankiMinutesPerSession,
  maxPieceMinutes,
  remainingMinutes,
  splitChunk,
  stepMinutes,
  totalMinutes,
} from "../src/effort.js";
import type { Chunk } from "../src/types.js";
import { subject } from "./helpers.js";

// These tests use the classic style: watch → read → make cards → study Anki.
const s = withDefaults({ workflow: [...LEGACY_WORKFLOW] });
const chapter: Chunk = { id: "c", subjectId: "bio", title: "Ch 1", pages: 20, slides: 0, order: 1 };

describe("effort model", () => {
  it("adds watching, reading and writing cards", () => {
    // 60 min recording + 20 pages × 3 min + 30 cards × 1.5 min = 165
    const lecture = { ...chapter, recordingMinutes: 60 };
    expect(stepMinutes(lecture, subject("bio", "2026-12-01"), s)).toEqual({ watch: 60, read: 60, summary: 0, cards: 45, revise: 0 });
    expect(totalMinutes(lecture, subject("bio", "2026-12-01"), s)).toBe(165);
  });

  it("applies the subject weight to reading and cards, not to the recording", () => {
    const lecture = { ...chapter, recordingMinutes: 60 };
    expect(totalMinutes(lecture, subject("bio", "2026-12-01", { weight: 1.5 }), s)).toBe(60 + 157.5);
    expect(totalMinutes(lecture, subject("bio", "2026-12-01", { weight: 0.5 }), s)).toBe(60 + 52.5);
  });

  it("uses the recording factor for watching", () => {
    const fast = { ...s, rates: { ...s.rates, recordingFactor: 0.8 } };
    expect(stepMinutes({ ...chapter, recordingMinutes: 60 }, subject("bio", "2026-12-01"), fast).watch).toBe(48);
  });

  it("uses the real card count once entered", () => {
    const withCards = { ...chapter, cards: 10 };
    expect(stepMinutes(withCards, subject("bio", "2026-12-01"), s).cards).toBe(15);
  });

  it("only counts steps that are not done yet", () => {
    const halfDone = { ...chapter, recordingMinutes: 60, done: { watch: 1, read: 0.5 } };
    expect(remainingMinutes(halfDone, subject("bio", "2026-12-01"), s)).toBe(30 + 45);
  });
});

describe("splitting", () => {
  it("splits in step order: watch first, cards last", () => {
    const lecture: Chunk = { ...chapter, pages: 40, recordingMinutes: 60 };
    const parts = splitChunk(lecture, subject("bio", "2026-12-01"), s);
    expect(parts.length).toBeGreaterThan(1);
    const first = parts[0]!;
    const last = parts[parts.length - 1]!;
    expect(first.steps.watch).toBeCloseTo(60);
    expect(first.steps.cards).toBe(0);
    expect(last.steps.watch).toBe(0);
    expect(last.steps.cards).toBeGreaterThan(0);
    expect(parts.reduce((a, p) => a + p.deltas.watch, 0)).toBeCloseTo(1);
    expect(parts.reduce((a, p) => a + p.pages, 0)).toBeCloseTo(40);
    // Learning the new cards takes room, counted with the cards step.
    expect(parts.reduce((a, p) => a + p.learnMinutes, 0)).toBeCloseTo((60 * 30) / 60);
  });

  it("splits big chunks into session-sized pieces", () => {
    const big: Chunk = { ...chapter, pages: 60 };
    const parts = splitChunk(big, subject("bio", "2026-12-01"), s);
    const total = totalMinutes(big, subject("bio", "2026-12-01"), s);

    expect(parts.length).toBeGreaterThan(1);
    expect(parts.map((p) => p.title)).toContain(`Ch 1 (1/${parts.length})`);
    for (const p of parts) {
      expect(p.minutes).toBeLessThanOrEqual(maxPieceMinutes(s));
      expect((60 / parts.length)).toBeLessThanOrEqual(s.maxPagesPerChunk);
    }
    expect(parts.reduce((a, p) => a + p.minutes, 0)).toBeCloseTo(total);
    expect(parts.reduce((a, p) => a + p.deltas.read, 0)).toBeCloseTo(1);
  });

  it("returns nothing for a finished chunk", () => {
    const done = { ...chapter, done: { watch: 1, read: 1, cards: 1 } };
    expect(splitChunk(done, subject("bio", "2026-12-01"), s)).toEqual([]);
  });
});

describe("anki block", () => {
  it("never goes below the minimum", () => {
    expect(ankiMinutesPerSession(0, 2, s)).toBe(10);
  });

  it("grows with the number of cards", () => {
    // 3000 cards × 10% due × 8 s = 40 min per day → 20 min per session
    expect(ankiMinutesPerSession(3000, 2, s)).toBe(20);
  });

  it("never takes more than the max share of a session", () => {
    expect(ankiMinutesPerSession(100_000, 1, s)).toBe(45);
  });
});
