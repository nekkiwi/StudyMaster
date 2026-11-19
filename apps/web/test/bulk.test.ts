import { describe, expect, it } from "vitest";
import { parseBulk } from "../src/lib/bulk.js";

describe("bulk chunk entry", () => {
  it("reads single chunks with pages, slides or both", () => {
    expect(parseBulk("Ch 1: 22\nLecture 3: 45 slides\nCh 2: 18p 30s").chunks).toEqual([
      { title: "Ch 1", pages: 22, slides: 0 },
      { title: "Lecture 3", pages: 0, slides: 45 },
      { title: "Ch 2", pages: 18, slides: 30 },
    ]);
  });

  it("expands ranges", () => {
    expect(parseBulk("Chapter 1-3: 22, 18, 30").chunks).toEqual([
      { title: "Chapter 1", pages: 22, slides: 0 },
      { title: "Chapter 2", pages: 18, slides: 0 },
      { title: "Chapter 3", pages: 30, slides: 0 },
    ]);
  });

  it("uses slides as the default when asked", () => {
    expect(parseBulk("Deck 1–2: 40, 52", "slides").chunks).toEqual([
      { title: "Deck 1", pages: 0, slides: 40 },
      { title: "Deck 2", pages: 0, slides: 52 },
    ]);
  });

  it("explains mistakes", () => {
    const { errors } = parseBulk("Ch 1 22\nCh 1-3: 1, 2\nCh 9: lots");
    expect(errors).toHaveLength(3);
    expect(errors[1]).toMatch(/3 chunks but 2 values/);
  });
});
