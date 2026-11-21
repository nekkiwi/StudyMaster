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
    const { draftFromAnki } = await import("../src/lib/importer.js");
    const structure = structureFromDecks([
      "Default",
      "Biology",
      "Biology::Lecture 1",
      "Biology::Lecture 2",
      "Biology::Lecture 2::Extra",
      "Spanish",
    ]);
    expect(structure).toEqual([
      { subject: "Biology", lectures: ["Lecture 1", "Lecture 2"] },
      { subject: "Spanish", lectures: [] },
    ]);
    const draft = draftFromAnki(structure, [], TODAY, 60);
    expect(draft.subjects[0]!.chunks.map((c) => [c.title, c.recordingMinutes])).toEqual([
      ["Lecture 1", 60],
      ["Lecture 2", 60],
    ]);
    expect(draft.skipped).toEqual([{ name: "Spanish", reason: "Anki deck without lecture subdecks" }]);
  });

  it("leaves out lectures StudyMaster already has", async () => {
    const { draftFromAnki } = await import("../src/lib/importer.js");
    const existing = [{ id: "bio", name: "Biology", weight: 1 as const, examDate: "2026-12-20" }];
    const draft = draftFromAnki(
      [{ subject: "Biology", lectures: ["Lecture 1", "Lecture 2"] }, { subject: "Anatomy", lectures: ["Bones"] }],
      existing,
      TODAY,
      60,
      [{ subjectId: "bio", title: "Lecture 1" }],
    );
    expect(draft.subjects.map((s) => [s.name, s.chunks.map((c) => c.title)])).toEqual([
      ["Biology", ["Lecture 2"]],
      ["Anatomy", ["Bones"]],
    ]);
    const none = draftFromAnki([{ subject: "Biology", lectures: ["Lecture 1"] }], existing, TODAY, 60, [{ subjectId: "bio", title: "Lecture 1" }]);
    expect(none.skipped).toEqual([{ name: "Biology", reason: "already in StudyMaster" }]);
  });

  it("names decks Subject::Lecture without breaking Anki's separator", async () => {
    const { deckName } = await import("../src/lib/anki.js");
    expect(deckName("Biology", "Lecture 3")).toBe("Biology::Lecture 3");
    expect(deckName("Bio::Chem", 'Ch "1"')).toBe("Bio – Chem::Ch '1'");
  });
});

describe("which Anki deck a task opens", () => {
  it("opens the lecture deck for one lecture, else the subject deck", async () => {
    const { deckToOpen } = await import("../src/components/session.js");
    const subjects = new Map([["bio", { id: "bio", name: "Biology", weight: 1 as const, examDate: "2026-12-20" }]]);
    const anki = (lectures: { subjectId: string; title: string }[]) =>
      ({ kind: "anki", decks: ["bio"], anki: { newCards: 5, learnMinutes: 3, reviewMinutes: 10, lectures } }) as never;
    expect(deckToOpen(anki([{ subjectId: "bio", title: "Lecture 3" }]), subjects)).toBe("Biology::Lecture 3");
    expect(deckToOpen(anki([]), subjects)).toBe("Biology");
    expect(deckToOpen(anki([{ subjectId: "bio", title: "L1" }, { subjectId: "bio", title: "L2" }]), subjects)).toBe("Biology");
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
