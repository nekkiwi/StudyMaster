import { describe, expect, it } from "vitest";
import { consensus } from "../src/toc";

const ch = (title: string, startPage: number | null, include = true) => ({ title, startPage, include });

describe("majority of several AI reads", () => {
  it("takes the most common chapter count, titles, pages and last page", () => {
    const a = { chapters: [ch("Lektion 1: Ankommen", 10), ch("Lektion 2: Zu Hause", 23)], lastPage: 95 };
    const b = { chapters: [ch("Lektion 1: Ankommen", 10), ch("Lektion 2: Zuhause", 23)], lastPage: 94 };
    const c = { chapters: [ch("Lektion 1: Ankommen", 10), ch("Lektion 2: Zu Hause", 23)], lastPage: 95 };
    const d = { chapters: [ch("Ankommen", 10)], lastPage: 95 };
    expect(consensus([a, b, d, c])).toEqual({ chapters: [ch("Lektion 1: Ankommen", 10), ch("Lektion 2: Zu Hause", 23)], lastPage: 95 });
  });

  it("works with a single read", () => {
    const a = { chapters: [ch("A", 1)], lastPage: null };
    expect(consensus([a])).toBe(a);
  });
});
