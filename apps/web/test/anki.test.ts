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

  it("opens the linked deck, else Subject::Title", () => {
    expect(deckForChunk({ title: "Lecture 3", ankiDeck: "Biology::VL03 Genetics" }, { name: "Bio" })).toBe("Biology::VL03 Genetics");
    expect(deckForChunk({ title: "Lecture 3" }, { name: "Bio", ankiDeck: "Biology" })).toBe("Biology::Lecture 3");
    expect(deckForChunk({ title: "Lecture 3" }, { name: "Bio" })).toBe("Bio::Lecture 3");
  });
});
