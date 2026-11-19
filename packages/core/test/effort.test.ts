import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/defaults.js";
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

const s = DEFAULT_SETTINGS;
const chapter: Chunk = { id: "c", subjectId: "bio", title: "Ch 1", pages: 20, slides: 0, order: 1 };

describe("effort model", () => {
  it("adds reading, summary and card creation", () => {
    // 20 pages: 60 read + 20 summary + 30 cards × 1.5 min = 125
    expect(stepMinutes(chapter, subject("bio", "2026-12-01"), s)).toEqual({
      read: 60,
      summary: 20,
      cards: 45,
    });
    expect(totalMinutes(chapter, subject("bio", "2026-12-01"), s)).toBe(125);
  });

  it("applies the subject weight", () => {
    expect(totalMinutes(chapter, subject("bio", "2026-12-01", { weight: 1.5 }), s)).toBe(187.5);
    expect(totalMinutes(chapter, subject("bio", "2026-12-01", { weight: 0.5 }), s)).toBe(62.5);
  });

  it("uses the real card count once entered", () => {
    const withCards = { ...chapter, cards: 10 };
    expect(stepMinutes(withCards, subject("bio", "2026-12-01"), s).cards).toBe(15);
  });

  it("only counts steps that are not done yet", () => {
    const halfRead = { ...chapter, done: { read: 1, summary: 0.5 } };
    expect(remainingMinutes(halfRead, subject("bio", "2026-12-01"), s)).toBe(10 + 45);
  });
});

describe("splitting", () => {
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
    const done = { ...chapter, done: { read: 1, summary: 1, cards: 1 } };
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
