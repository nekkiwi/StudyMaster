import { describe, expect, it } from "vitest";
import { collections, deckForChunk, matchDecks, similarity, subdecks } from "../src/lib/anki.js";

const DECKS = [
  "Default",
  "Biology",
  "Biology::VL01 Introduction",
  "Biology::VL02 – Cells and Membranes",
  "Biology::VL03 Genetics",
  "Biology::VL03 Genetics::Extra",
  "Biology::Exam questions",
  "Chemistry::Atoms",
];

describe("Anki decks", () => {
  it("lists collections and their direct sub-decks", () => {
    expect(collections(DECKS)).toEqual(["Biology", "Chemistry"]);
    expect(subdecks(DECKS, "Biology")).toEqual([
      "Biology::VL01 Introduction",
      "Biology::VL02 – Cells and Membranes",
      "Biology::VL03 Genetics",
      "Biology::Exam questions",
    ]);
  });

  it("scores names: same number, shared words, never different numbers", () => {
    expect(similarity("Lecture 3", "Biology::VL03 Genetics")).toBeGreaterThanOrEqual(0.7);
    expect(similarity("Cells & membranes", "Biology::VL02 – Cells and Membranes")).toBeGreaterThan(0.5);
    expect(similarity("Lecture 2", "Biology::VL03 Genetics")).toBe(0);
  });

  it("links chapters to sub-decks, each deck once", () => {
    const chunks = [
      { id: "a", title: "Lecture 1" },
      { id: "b", title: "Lecture 2 Cells" },
      { id: "c", title: "Genetics" },
      { id: "d", title: "Ecology" },
    ];
    const links = matchDecks(chunks, subdecks(DECKS, "Biology"));
    expect(Object.fromEntries(links)).toEqual({
      a: "Biology::VL01 Introduction",
      b: "Biology::VL02 – Cells and Membranes",
      c: "Biology::VL03 Genetics",
    });
  });

  it("opens the linked deck, else the linked subject deck, else Subject::Title", () => {
    expect(deckForChunk({ title: "Lecture 3", ankiDeck: "Biology::VL03 Genetics" }, { name: "Bio" })).toBe("Biology::VL03 Genetics");
    // Linked subject, item without its own deck ("whole subject deck"): never a deck that doesn't exist.
    expect(deckForChunk({ title: "Lecture 3" }, { name: "Bio", ankiDeck: "Biology" })).toBe("Biology");
    expect(deckForChunk({ title: "Lecture 3" }, { name: "Bio" })).toBe("Bio::Lecture 3");
  });
});

describe("phone links", () => {
  it("opens exactly the deck on iPhone and Android", async () => {
    const { phoneAnkiLink, deckSearch } = await import("../src/lib/anki.js");
    expect(phoneAnkiLink("ios", "Bio WS26::VL03 Genetics")).toBe("anki://x-callback-url/study?deck=Bio%20WS26%3A%3AVL03%20Genetics");
    expect(deckSearch("Bio::VL_03*")).toBe('deck:"Bio::VL\\_03\\*"');
    const android = phoneAnkiLink("android", "Bio::VL03");
    expect(android).toBe(`intent://x-callback-url/browser?search=${encodeURIComponent('deck:"Bio::VL03"')}#Intent;scheme=anki;package=com.ichi2.anki;end`);
  });
});

describe("desktop Safari", () => {
  it("is recognised, Chrome/Edge/Firefox on a Mac are not", async () => {
    const { isDesktopSafari } = await import("../src/lib/anki.js");
    const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)";
    expect(isDesktopSafari(`${mac} Version/19.0 Safari/605.1.15`)).toBe(true);
    expect(isDesktopSafari(`${mac} Chrome/142.0.0.0 Safari/537.36`)).toBe(false);
    expect(isDesktopSafari(`${mac} Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0`)).toBe(false);
    expect(isDesktopSafari("Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:144.0) Gecko/20100101 Firefox/144.0")).toBe(false);
    expect(isDesktopSafari("Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 Version/19.0 Mobile/15E148 Safari/604.1")).toBe(false);
  });
});

describe("reading Anki", () => {
  it("follows renamed decks by id and remembers ids of linked decks", async () => {
    const { reconcileDecks } = await import("../src/lib/ankiSync.js");
    const subjects = [{ id: "bio", name: "Biology", weight: 1 as const, examDate: "2026-12-20", ankiDeck: "Bio", ankiDeckId: 1 }];
    const chunks = [
      { id: "c1", subjectId: "bio", title: "L1", pages: 0, slides: 0, order: 1, ankiDeck: "Bio::VL01", ankiDeckId: 2 },
      { id: "c2", subjectId: "bio", title: "L2", pages: 0, slides: 0, order: 2, ankiDeck: "Bio WS26::VL02" },
      { id: "c3", subjectId: "bio", title: "L3", pages: 0, slides: 0, order: 3 },
    ];
    // In Anki "Bio" was renamed to "Bio WS26" (children follow).
    const ids = { "Bio WS26": 1, "Bio WS26::VL01": 2, "Bio WS26::VL02": 3 };
    const out = reconcileDecks(subjects, chunks, ids);
    expect(out.subjects[0]!.ankiDeck).toBe("Bio WS26");
    expect(out.chunks.map((c) => [c.ankiDeck, c.ankiDeckId])).toEqual([
      ["Bio WS26::VL01", 2],
      ["Bio WS26::VL02", 3],
      [undefined, undefined],
    ]);
    expect(out.chunks[2]).toBe(chunks[2]);
    // Nothing to change → same arrays.
    const again = reconcileDecks(out.subjects, out.chunks, ids);
    expect(again.subjects).toBe(out.subjects);
    expect(again.chunks).toBe(out.chunks);
  });

  it("asks Anki for today's due cards and each next day", async () => {
    const { dueQueries, FORECAST_DAYS } = await import("../src/lib/ankiSync.js");
    const q = dueQueries("Bio WS26");
    expect(q).toHaveLength(FORECAST_DAYS);
    expect(q[0]).toBe('deck:"Bio WS26" is:due');
    expect(q[2]).toBe('deck:"Bio WS26" prop:due=2');
  });

  it("forgets the old deck id when a link changes", async () => {
    const { useStore } = await import("../src/store.js");
    useStore.setState({ chunks: [{ id: "c", subjectId: "bio", title: "L", pages: 0, slides: 0, order: 1, ankiDeck: "A", ankiDeckId: 5, ankiCards: 9 }] });
    useStore.getState().upsertChunk({ ...useStore.getState().chunks[0]!, ankiDeck: "B" });
    expect(useStore.getState().chunks[0]).toMatchObject({ ankiDeck: "B", ankiDeckId: undefined, ankiCards: undefined });
  });
});

