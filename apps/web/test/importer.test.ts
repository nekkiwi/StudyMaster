import { describe, expect, it } from "vitest";
import {
  buildDraft,
  chaptersFromOutline,
  cleanTitle,
  draftFromToc,
  lectureNumber,
  mergeChunks,
  parseToc,
  subjectFromPath,
  type DetectedFile,
} from "../src/lib/importer.js";

const TODAY = "2026-11-20";

describe("names", () => {
  it("cleans file names into titles", () => {
    expect(cleanTitle("VL_03-Zellbiologie.pdf")).toBe("VL 03 – Zellbiologie");
    expect(cleanTitle("Lecture 3.mp4")).toBe("Lecture 3");
  });

  it("finds lecture numbers", () => {
    expect(lectureNumber("Lecture 3.pdf")).toBe(3);
    expect(lectureNumber("VL03_slides.pdf")).toBe(3);
    expect(lectureNumber("Intro.pdf")).toBeUndefined();
  });

  it("takes the subject from the folder, else from the file name", () => {
    expect(subjectFromPath("Semester/Biology/Lecture 3.pdf")).toBe("Biology");
    expect(subjectFromPath("Bio_VL03.pdf")).toBe("Bio");
    expect(subjectFromPath("Chemistry Lecture 5.pptx")).toBe("Chemistry");
  });
});

describe("book bookmarks", () => {
  it("makes one chapter per bookmark and unticks front/back matter", () => {
    const outline = [
      { title: "Contents", page: 3, level: 0 },
      { title: "1 Cells", page: 7, level: 0 },
      { title: "1.1 Membranes", page: 9, level: 1 },
      { title: "2 Genetics", page: 31, level: 0 },
      { title: "3 Evolution", page: 60, level: 0 },
      { title: "Index", page: 95, level: 0 },
    ];
    const chapters = chaptersFromOutline(outline, 100);
    expect(chapters.map((c) => [c.title, c.pages, c.include])).toEqual([
      ["Contents", 4, false],
      ["1 Cells", 24, true],
      ["2 Genetics", 29, true],
      ["3 Evolution", 35, true],
      ["Index", 6, false],
    ]);
  });

  it("goes one level down when the top level is just parts", () => {
    const outline = [
      { title: "Part I", page: 1, level: 0 },
      { title: "1 A", page: 2, level: 1 },
      { title: "2 B", page: 20, level: 1 },
      { title: "Part II", page: 40, level: 0 },
      { title: "3 C", page: 41, level: 1 },
    ];
    expect(chaptersFromOutline(outline, 60).map((c) => [c.title, c.pages])).toEqual([
      ["1 A", 18],
      ["2 B", 20],
      ["3 C", 20],
    ]);
  });
});

describe("table of contents", () => {
  it("reads top-level chapters and their page counts", () => {
    const toc = "1 Introduction ........ 1\n2 Cells 12\n2.1 Membranes 15\n3 Genetics .... 40\nIndex 80";
    expect(parseToc(toc, 90)).toEqual([
      { title: "1 Introduction", pages: 11, include: true, estimated: false },
      { title: "2 Cells", pages: 28, include: true, estimated: false },
      { title: "3 Genetics", pages: 40, include: true, estimated: false },
      { title: "Index", pages: 11, include: false, estimated: false },
    ]);
  });

  it("estimates the last chapter when the last page is unknown", () => {
    const chapters = parseToc("1 A 1\n2 B 21\n3 C 41");
    expect(chapters[2]).toMatchObject({ title: "3 C", estimated: true, pages: 20 });
    const draft = draftFromToc("1 A 1\n2 B 21\n3 C 41", "Bio", [], TODAY);
    expect(draft.subjects[0]!.chunks[2]!.note).toMatch(/estimated/);
  });
});

describe("buildDraft", () => {
  const files: DetectedFile[] = [
    { path: "Sem/Biology/Lecture 2.pdf", kind: "pdf", pages: 38, landscape: true },
    { path: "Sem/Biology/Lecture 1.pdf", kind: "pdf", pages: 41, landscape: true },
    { path: "Sem/Biology/Lecture 1.mp4", kind: "video", durationMinutes: 88.6 },
    { path: "Sem/Chemistry/Script.pdf", kind: "pdf", pages: 120, landscape: false, outline: [
      { title: "1 Atoms", page: 1, level: 0 },
      { title: "2 Bonds", page: 50, level: 0 },
    ] },
    { path: "Sem/Chemistry/notes.docx", kind: "other" },
  ];

  it("groups by folder, pairs videos with slides and splits books into chapters", () => {
    const draft = buildDraft(files, [], TODAY);
    expect(draft.subjects.map((s) => s.name)).toEqual(["Biology", "Chemistry"]);
    const bio = draft.subjects[0]!;
    expect(bio.chunks.map((c) => [c.title, c.recordingMinutes, c.slides])).toEqual([
      ["Lecture 1", 89, 41],
      ["Lecture 2", 0, 38],
    ]);
    expect(bio.chunks[0]!.sources.sort()).toEqual(["Lecture 1.mp4", "Lecture 1.pdf"]);
    const chem = draft.subjects[1]!;
    expect(chem.chunks.map((c) => [c.title, c.pages])).toEqual([
      ["1 Atoms", 49],
      ["2 Bonds", 71],
    ]);
    expect(draft.skipped).toEqual([{ name: "notes.docx", reason: "not a PDF, PowerPoint or video" }]);
  });

  it("matches existing subjects by name", () => {
    const draft = buildDraft(files, [{ id: "b", name: "biology", weight: 1, examDate: "2026-12-20" }], TODAY);
    expect(draft.subjects[0]).toMatchObject({ name: "biology", existingId: "b" });
  });

  it("counts portrait PDFs without bookmarks as pages", () => {
    const draft = buildDraft([{ path: "Psy/Ch 1.pdf", kind: "pdf", pages: 22, landscape: false }], [], TODAY);
    expect(draft.subjects[0]!.chunks[0]).toMatchObject({ pages: 22, slides: 0 });
  });

  it("merges chunks", () => {
    const [a, b] = buildDraft(files, [], TODAY).subjects[0]!.chunks;
    expect(mergeChunks(a!, b!)).toMatchObject({ title: "Lecture 1", recordingMinutes: 89, slides: 79 });
  });
});

describe("Anki decks", () => {
  it("turns Subject::Lecture decks into subjects and lectures", async () => {
    const { structureFromDecks } = await import("../src/lib/anki.js");
    const structure = structureFromDecks(["Default", "Biology", "Biology::Lecture 1", "Biology::Lecture 2", "Biology::Lecture 2::Extra", "Spanish"]);
    expect(structure).toEqual([
      { subject: "Biology", lectures: ["Lecture 1", "Lecture 2"] },
      { subject: "Spanish", lectures: [] },
    ]);
  });

  it("sets up a new subject from a collection, each sub-deck linked", async () => {
    const { draftFromAnki } = await import("../src/lib/importer.js");
    const names = ["Biology", "Biology::VL01 Intro", "Biology::VL02 Cells", "Biology::VL02 Cells::Extra", "Spanish"];
    const draft = draftFromAnki(names, ["Biology"], [], [], TODAY, 60);
    const s = draft.subjects[0]!;
    expect(s).toMatchObject({ name: "Biology", ankiDeck: "Biology", existingId: undefined, links: [] });
    // Anki imports are about the cards: no video length assumed.
    expect(s.chunks.map((c) => [c.title, c.ankiDeck, c.recordingMinutes])).toEqual([
      ["VL01 Intro", "Biology::VL01 Intro", 0],
      ["VL02 Cells", "Biology::VL02 Cells", 0],
    ]);
  });

  it("links existing chapters by similar names and only adds the rest", async () => {
    const { draftFromAnki, ankiTarget } = await import("../src/lib/importer.js");
    const existing = [{ id: "bio", name: "Biology", weight: 1 as const, examDate: "2026-12-20" }];
    const chunks = [
      { id: "c1", subjectId: "bio", title: "Lecture 1" },
      { id: "c2", subjectId: "bio", title: "Genetics" },
    ];
    const names = ["Bio WS26", "Bio WS26::VL01 Introduction", "Bio WS26::VL02 Cells", "Bio WS26::VL03 Genetics"];
    const draft = draftFromAnki(names, ["Bio WS26"], existing, chunks, TODAY, 60);
    const s = draft.subjects[0]!;
    // "Bio WS26" shares no full word with "Biology" → new subject first …
    expect(s.existingId).toBeUndefined();
    // … the user picks "Add to Biology" in the review: links are rebuilt.
    const t = ankiTarget(s, existing[0], chunks, 60);
    expect(t.existingId).toBe("bio");
    expect(t.links!.map((l) => [l.title, l.deck])).toEqual([
      ["Lecture 1", "Bio WS26::VL01 Introduction"],
      ["Genetics", "Bio WS26::VL03 Genetics"],
    ]);
    expect(t.chunks.map((c) => c.title)).toEqual(["VL02 Cells"]);
  });

  it("applies links and the collection when importing", async () => {
    const { useStore } = await import("../src/store.js");
    useStore.setState({
      subjects: [{ id: "bio", name: "Biology", weight: 1, examDate: "2026-12-20" }],
      chunks: [{ id: "c1", subjectId: "bio", title: "Lecture 1", pages: 10, slides: 0, order: 1 }],
    });
    useStore.getState().importDraft({
      skipped: [],
      subjects: [
        {
          id: "d",
          include: true,
          name: "Biology",
          existingId: "bio",
          examDate: TODAY,
          ankiDeck: "Bio",
          links: [{ chunkId: "c1", title: "Lecture 1", deck: "Bio::VL01", include: true }],
          chunks: [{ id: "x", include: true, title: "VL02", recordingMinutes: 60, pages: 0, slides: 0, sources: [], ankiDeck: "Bio::VL02" }],
        },
      ],
    });
    const st = useStore.getState();
    expect(st.subjects[0]!.ankiDeck).toBe("Bio");
    expect(st.chunks.map((c) => [c.title, c.ankiDeck])).toEqual([
      ["Lecture 1", "Bio::VL01"],
      ["VL02", "Bio::VL02"],
    ]);
  });

  // A big ready-made deck: regions with many sections each.
  const ANATOMY = [
    "Anatomy",
    ...["Upper limb", "Lower limb", "Thorax"].flatMap((region) => [
      `Anatomy::${region}`,
      ...Array.from({ length: 6 }, (_, i) => `Anatomy::${region}::Section ${i + 1}`),
    ]),
    "Anatomy::Extras", // a branch without sections
  ];

  it("offers deeper deck levels and keeps short branches", async () => {
    const { subdecks, maxDepth, chooseDepth, sectionTitle } = await import("../src/lib/anki.js");
    expect(maxDepth(ANATOMY, "Anatomy")).toBe(2);
    expect(subdecks(ANATOMY, "Anatomy")).toEqual(["Anatomy::Upper limb", "Anatomy::Lower limb", "Anatomy::Thorax", "Anatomy::Extras"]);
    const level2 = subdecks(ANATOMY, "Anatomy", 2);
    expect(level2).toHaveLength(19); // 18 sections + Extras
    expect(level2).toContain("Anatomy::Extras");
    expect(sectionTitle("Anatomy", "Anatomy::Upper limb::Section 1")).toBe("Upper limb – Section 1");
    // ~1300 cards per region → sections (~220 each) become the items.
    const counts: Record<string, number> = {};
    for (const d of level2) counts[d] = 220;
    for (const r of ["Upper limb", "Lower limb", "Thorax"]) counts[`Anatomy::${r}`] = 1320;
    expect(chooseDepth(ANATOMY, "Anatomy", counts)).toBe(2);
    // Small decks or unknown counts stay on the first level.
    expect(chooseDepth(ANATOMY, "Anatomy", {})).toBe(1);
  });

  it("imports a ready-made deck at the chosen level with its new cards", async () => {
    const { draftFromAnki, withBestDepth, depthChoices, setAnkiDepth } = await import("../src/lib/importer.js");
    const draft = draftFromAnki(ANATOMY, ["Anatomy"], [], [], TODAY, 60);
    expect(draft.subjects[0]!.chunks).toHaveLength(4);
    // As read from Anki (withCardCounts): every level, total and still new.
    const decks = draft.subjects[0]!.ankiDecks!;
    const counted = {
      ...draft,
      subjects: [{
        ...draft.subjects[0]!,
        ankiCounts: Object.fromEntries(decks.map((d) => [d, d.split("::").length === 3 ? 220 : 1320])),
        ankiNewCounts: Object.fromEntries(decks.map((d) => [d, d.split("::").length === 3 ? 200 : 1200])),
      }],
    };
    const best = withBestDepth(counted, [], [], 0).subjects[0]!;
    expect(best.ankiDepth).toBe(2);
    expect(best.chunks).toHaveLength(19);
    expect(best.chunks[0]).toMatchObject({ title: "Upper limb – Section 1", ankiCards: 220, ankiNew: 200, pages: 0, recordingMinutes: 0 });
    expect(depthChoices(best).map((c) => [c.depth, c.items, c.example])).toEqual([[1, 4, "Upper limb"], [2, 19, "Section 1"]]);
    // Switching back to the regions.
    expect(setAnkiDepth(best, 1, undefined, [], 0).chunks.map((c) => c.title)).toEqual(["Upper limb", "Lower limb", "Thorax", "Extras"]);

    // Importing: cards count as made, the new ones get learning time in the plan.
    const { useStore } = await import("../src/store.js");
    const { remainingMinutes, withDefaults } = await import("@studymaster/core");
    useStore.setState({ subjects: [], chunks: [], settings: withDefaults() });
    useStore.getState().importDraft({ ...counted, subjects: [best] });
    const st = useStore.getState();
    const first = st.chunks[0]!;
    expect(first).toMatchObject({ ankiCards: 220, ankiNew: 200, done: { cards: 1 } });
    // 200 new cards × 30 s = 100 min, nothing else to do.
    expect(remainingMinutes(first, st.subjects[0]!, st.settings)).toBe(100);
  });

  it("names decks Subject::Lecture without breaking Anki's separator", async () => {
    const { deckName } = await import("../src/lib/anki.js");
    expect(deckName("Biology", "Lecture 3")).toBe("Biology::Lecture 3");
    expect(deckName("Bio::Chem", 'Ch "1"')).toBe("Bio – Chem::Ch '1'");
  });
});

describe("which Anki deck a task opens", () => {
  it("opens each lecture's linked deck, else the subject deck", async () => {
    const { decksToOpen } = await import("../src/components/session.js");
    const subjects = new Map([["bio", { id: "bio", name: "Biology", weight: 1 as const, examDate: "2026-12-20", ankiDeck: "Bio WS26" }]]);
    const chunks = new Map([
      ["c3", { title: "Lecture 3", ankiDeck: "Bio WS26::VL03 Genetics" }],
      ["c4", { title: "Lecture 4" }],
    ]);
    const anki = (lectures: { chunkId: string; subjectId: string; title: string }[]) =>
      ({ kind: "anki", decks: ["bio"], anki: { newCards: 5, learnMinutes: 3, reviewMinutes: 10, lectures } }) as never;
    const decks = (l: Parameters<typeof anki>[0]) => decksToOpen(anki(l), subjects, chunks).map((x) => x.deck);
    expect(decks([{ chunkId: "c3", subjectId: "bio", title: "Lecture 3" }])).toEqual(["Bio WS26::VL03 Genetics"]);
    // No own deck in a linked subject: the subject's deck.
    expect(decks([{ chunkId: "c4", subjectId: "bio", title: "Lecture 4" }])).toEqual(["Bio WS26"]);
    expect(decks([])).toEqual(["Bio WS26"]);
    expect(decks([{ chunkId: "c3", subjectId: "bio", title: "L3" }, { chunkId: "c4", subjectId: "bio", title: "L4" }])).toHaveLength(2);
  });
});

describe("real-world books", () => {
  it("unticks cover, dedication, preface etc. when chapters are numbered", () => {
    const outline = [
      "Cover", "Half Title", "Title Page", "Copyright", "Dedication", "About the Authors", "Brief Contents",
      "Detailed Contents", "Preface", "Chapter 1 The Chemistry of Life", "Chapter 2 Cells", "Chapter 3 Genetics",
      "Chapter 4 Evolution", "Glossary", "Index",
    ].map((title, i) => ({ title, page: 1 + i * 8, level: 0 }));
    const chapters = chaptersFromOutline(outline, 130);
    expect(chapters.filter((c) => c.include).map((c) => c.title)).toEqual([
      "Chapter 1 The Chemistry of Life",
      "Chapter 2 Cells",
      "Chapter 3 Genetics",
      "Chapter 4 Evolution",
    ]);
    expect(chapters).toHaveLength(15); // nothing removed, only unticked
  });

  it("matches a book's subject to an existing subject by a shared word", () => {
    const existing = [{ id: "bio", name: "Biology", weight: 1 as const, examDate: "2026-12-20" }];
    const draft = buildDraft([{ path: "Campbell Biology 12th Edition.pdf", kind: "pdf", pages: 40, landscape: false }], existing, TODAY);
    expect(draft.subjects[0]).toMatchObject({ existingId: "bio", name: "Biology" });
  });

  it("adds an import to the one subject that has no material yet", async () => {
    const { adoptEmptySubject } = await import("../src/lib/importer.js");
    const existing = [
      { id: "anat", name: "Anatomy", weight: 1 as const, examDate: "2026-12-20" },
      { id: "chem", name: "Chemistry", weight: 1 as const, examDate: "2026-12-22" },
    ];
    const draft = buildDraft([{ path: "Gray's Textbook.pdf", kind: "pdf", pages: 22, landscape: false }], existing, TODAY);
    expect(draft.subjects[0]!.existingId).toBeUndefined();
    const adopted = adoptEmptySubject(draft, existing, [{ subjectId: "chem" }]);
    expect(adopted.subjects[0]).toMatchObject({ existingId: "anat", name: "Anatomy" });
    // Two empty subjects: ambiguous, so nothing is guessed.
    expect(adoptEmptySubject(draft, existing, []).subjects[0]!.existingId).toBeUndefined();
  });
});

describe("scanned tables of contents", () => {
  it("reads chapters from a column layout with letter-spaced titles (German textbook)", async () => {
    const { readFileSync } = await import("node:fs");
    const { parseToc } = await import("../src/lib/importer.js");
    const text = readFileSync(new URL("./fixtures/toc-arbeitsbuch.txt", import.meta.url), "utf8");
    const chapters = parseToc(text);
    expect(chapters.map((c) => c.title)).toEqual([
      "Lektion 1: Ankommen",
      "Lektion 2: Zu Hause",
      "Lektion 3: Essen und Trinken",
      "Lektion 4: Arbeitswelt",
      "Lektion 5: Sport und Fitness",
      "Lektion 6: Schule und Ausbildung",
      "Lektion 7: Feste und Geschenke",
    ]);
    // Start pages 10, 23, 36, 47, 59, 72, 84; the last one ends at 95.
    expect(chapters.map((c) => c.pages)).toEqual([13, 13, 11, 12, 13, 12, 12]);
    expect(chapters.every((c) => c.include && !c.estimated)).toBe(true);
  });

  it("joins letter-spaced words, leaves normal titles alone", async () => {
    const { unspace } = await import("../src/lib/importer.js");
    expect(unspace("E s s e n u n d T rin k e n")).toBe("Essen und Trinken");
    expect(unspace("Zu H a u se")).toBe("Zu Hause");
    expect(unspace("A r b e it s w e lt")).toBe("Arbeitswelt");
    expect(unspace("Cell biology and genetics")).toBe("Cell biology and genetics");
  });

  it("uses the printed table of contents of a PDF without bookmarks", async () => {
    const { readFileSync } = await import("node:fs");
    const { buildDraft } = await import("../src/lib/importer.js");
    const toc = readFileSync(new URL("./fixtures/toc-arbeitsbuch.txt", import.meta.url), "utf8");
    const draft = buildDraft([{ path: "Deutsch/Arbeitsbuch.pdf", kind: "pdf", pages: 180, landscape: false, outline: [], tocPages: [toc] }], [], TODAY);
    expect(draft.subjects[0]!.chunks.map((c) => c.title)[0]).toBe("Lektion 1: Ankommen");
    expect(draft.subjects[0]!.chunks).toHaveLength(7);
  });

  it("still reads normal 'Title ..... 12' tables of contents line by line", async () => {
    const { parseToc } = await import("../src/lib/importer.js");
    const chapters = parseToc("1 Cells ..... 1\n2 Genetics ..... 21\n3 Ecology ..... 40", 60);
    expect(chapters.map((c) => [c.title, c.pages])).toEqual([
      ["1 Cells", 20],
      ["2 Genetics", 19],
      ["3 Ecology", 21],
    ]);
  });
});

describe("chapters read by AI", () => {
  it("turns start pages into page counts, skipping back matter with its own numbering", async () => {
    const { chaptersFromAi } = await import("../src/lib/importer.js");
    const chapters = chaptersFromAi({
      chapters: [
        { title: "Lektion 1: Ankommen", startPage: 10, include: true },
        { title: "Lektion 2: Zu Hause", startPage: 23, include: true },
        { title: "Lektion 3: Essen", startPage: null, include: true },
        { title: "Lektion 4: Arbeit", startPage: 47, include: true },
        { title: "Lernwortschatz", startPage: 1, include: false },
      ],
      lastPage: 58,
    });
    expect(chapters.map((c) => [c.title, c.pages, c.estimated])).toEqual([
      ["Lektion 1: Ankommen", 13, false],
      ["Lektion 2: Zu Hause", 24, false],
      ["Lektion 3: Essen", 13, true],
      ["Lektion 4: Arbeit", 12, false],
      ["Lernwortschatz", 13, true],
    ]);
  });

  it("keeps the pasted text so the review can offer AI even when nothing was found", async () => {
    const { draftFromToc } = await import("../src/lib/importer.js");
    const draft = draftFromToc("some messy text without pages", "Deutsch", [], TODAY);
    expect(draft.subjects[0]).toMatchObject({ name: "Deutsch", chunks: [], tocText: "some messy text without pages" });
  });
});

describe("AI first, quick reader as fallback", () => {
  it("keeps the quick result to switch back and forth", async () => {
    const { applyAiToc, swapReader } = await import("../src/lib/importer.js");
    const quick = { id: "s", include: true, name: "Deutsch", examDate: TODAY, readBy: "quick" as const, tocText: "…",
      chunks: [{ id: "q", include: true, title: "Ankommen", recordingMinutes: 0, pages: 13, slides: 0, sources: ["Buch.pdf (table of contents)"] }] };
    const ai = applyAiToc(quick, { chapters: [{ title: "Lektion 1: Ankommen", startPage: 10, include: true }], lastPage: 22 }, "Buch.pdf");
    expect(ai).toMatchObject({ readBy: "ai", chunks: [{ title: "Lektion 1: Ankommen", pages: 13 }] });
    const back = swapReader(ai);
    expect(back).toMatchObject({ readBy: "quick", chunks: [{ title: "Ankommen" }] });
    expect(swapReader(back).chunks[0]!.title).toBe("Lektion 1: Ankommen");
  });
});

describe("day colors", () => {
  it("tints with plain rgba and splits diagonally for two subjects", async () => {
    const { dayBackground, subjectColor, tint } = await import("../src/lib/colors.js");
    expect(tint("#10b981", 30)).toBe("rgba(16, 185, 129, 0.30)");
    expect(dayBackground(["#10b981"], 30)).toBe("linear-gradient(rgba(16, 185, 129, 0.30), rgba(16, 185, 129, 0.30))");
    expect(dayBackground(["#8b5cf6", "#10b981"], 30)).toBe(
      "linear-gradient(to bottom right, rgba(139, 92, 246, 0.30) 0.00% 50.00%, rgba(16, 185, 129, 0.30) 50.00% 100.00%)",
    );
    expect(dayBackground([], 30)).toBeUndefined();
    // Subjects without a color still get a stable one.
    expect(subjectColor({ id: "abc" })).toBe(subjectColor({ id: "abc" }));
    expect(subjectColor({ id: "abc" })).toMatch(/^#/);
  });
});

describe("adding a section in the review", () => {
  it("starts empty with 0 pages and no warning", async () => {
    const { newDraftChunk } = await import("../src/lib/importer.js");
    const chunk = newDraftChunk();
    expect(chunk).toMatchObject({ title: "", pages: 0, slides: 0, recordingMinutes: 0, include: true });
    expect(chunk.note).toBeUndefined();
  });
});

