/**
 * Material import: turns files (PDFs, slides, videos) or a pasted table of
 * contents into a draft of subjects and chunks. The user reviews the draft
 * (untick, edit, merge, move) before anything is saved.
 *
 * Everything here is pure – reading the files happens in fileReaders.ts.
 */
import { addDays, type ISODate, type Subject } from "@studymaster/core";
import { leaf, matchDecks, subdecks } from "./anki";

/** What we learned from one file. */
export interface DetectedFile {
  /** Path inside the dropped folder, e.g. "Biology/Lecture 3.pdf" (or just the name). */
  path: string;
  kind: "pdf" | "pptx" | "video" | "other";
  /** PDF/PPTX: number of pages or slides. */
  pages?: number;
  /** PDF: first page wider than tall → probably slides. */
  landscape?: boolean;
  /** PDF bookmarks with their 1-based start page. */
  outline?: OutlineEntry[];
  /** PDF without bookmarks: text of the pages that look like a table of contents. */
  tocPages?: string[];
  /** Video: length in minutes. */
  durationMinutes?: number;
  error?: string;
}

export interface OutlineEntry {
  title: string;
  page: number;
  level: number;
}

export interface DraftChunk {
  id: string;
  include: boolean;
  title: string;
  recordingMinutes: number;
  pages: number;
  slides: number;
  /** File names (or "Table of contents") this chunk came from. */
  sources: string[];
  /** Shown as a hint in the review, e.g. "page count estimated". */
  note?: string;
  /** Lecture number found in the file name, used for sorting and pairing. */
  number?: number;
  /** Linked Anki deck (imports from Anki). */
  ankiDeck?: string;
}

/** An existing chapter that will be linked to an Anki deck. */
export interface DraftLink {
  chunkId: string;
  title: string;
  deck: string;
  include: boolean;
}

export interface DraftSubject {
  id: string;
  include: boolean;
  name: string;
  /** Set when the name matches a subject that already exists. */
  existingId?: string;
  /** Only used for new subjects. */
  examDate: ISODate;
  chunks: DraftChunk[];
  /** Linked Anki collection (imports from Anki). */
  ankiDeck?: string;
  /** Existing chapters of this subject that get linked to Anki decks. */
  links?: DraftLink[];
  /** All sub-decks of the linked collection (to rebuild links when the target changes). */
  ankiSubdecks?: string[];
  /** Text of the table of contents these chapters came from (for "Let AI read the contents"). */
  tocText?: string;
  /** Last page of the book, if the user entered it (pasted contents). */
  lastPage?: number;
  /** Who read the table of contents: the AI or the quick on-device reader. */
  readBy?: "ai" | "quick";
  /** The other reader's chapters, to switch back in the review. */
  otherChunks?: DraftChunk[];
}

export interface Draft {
  subjects: DraftSubject[];
  skipped: { name: string; reason: string }[];
}

let counter = 0;
const draftId = () => `d${Date.now().toString(36)}${(counter++).toString(36)}`;

const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv|avi)$/i;
export function fileKind(name: string): DetectedFile["kind"] {
  if (/\.pdf$/i.test(name)) return "pdf";
  if (/\.pptx$/i.test(name)) return "pptx";
  if (VIDEO_EXT.test(name)) return "video";
  return "other";
}

/** "VL_03-Zellbiologie.pdf" → "VL 03 Zellbiologie" */
export function cleanTitle(fileName: string): string {
  return fileName
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/[_]+/g, " ")
    .replace(/\s*-\s*/g, " – ")
    .replace(/\s+/g, " ")
    .replace(/^ – | – $/g, "")
    .trim();
}

/** First number in a file name: "Lecture 3", "VL03", "L_12_slides" → 3, 3, 12. */
export function lectureNumber(fileName: string): number | undefined {
  const m = fileName.replace(/\.[a-z0-9]{2,5}$/i, "").match(/(\d{1,3})(?!\d)/);
  return m ? Number(m[1]) : undefined;
}

/**
 * Subject for a file: its folder ("Biology/Lecture 3.pdf" → "Biology"), or
 * for loose files the name before the lecture number ("Bio_VL03.pdf" → "Bio").
 */
export function subjectFromPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 2]!;
  const base = cleanTitle(parts[0] ?? path)
    .replace(/\d.*$/, "")
    .replace(/\b(lecture|lec|vl|vorlesung|slides?|folien|chapter|ch|kapitel|week|woche|l)\s*$/i, "")
    .replace(/[\s–-]+$/g, "")
    .trim();
  return base || "New subject";
}

const NON_CHAPTER = /^(contents|brief contents|detailed contents|table of contents|inhalt|inhaltsverzeichnis|index|subject index|register|bibliography|references|literatur|literaturverzeichnis|preface|vorwort|foreword|geleitwort|acknowledg|danksagung|dedication|widmung|cover|front cover|back cover|half title|title page|titel|impressum|copyright|about the authors?|über die autor|glossary|glossar|appendix|anhang|list of (figures|tables|abbreviations)|abbildungsverzeichnis|tabellenverzeichnis|abkürzungs|abbreviations|answers|lösungen|credits|notes|further reading|endpapers?)/i;

/** "Chapter 3 …", "Kapitel 3", "3 Cells", "3. Cells", "Unit 3" … */
const NUMBERED_CHAPTER = /^(chapter|chap\.?|kapitel|kap\.?|unit|lesson|lektion|module|modul)?\s*\d{1,3}\b\s*[.:)\-–]?\s*\S/i;

/** Front and back matter is detected but unticked by default. */
export function looksLikeChapter(title: string): boolean {
  return !NON_CHAPTER.test(title.replace(/^[\d.\s]+/, "").trim());
}

/**
 * Chapters from PDF bookmarks. Uses the top level, or the level below when
 * the top level has fewer than 3 entries (e.g. "Part I", "Part II").
 */
export function chaptersFromOutline(outline: OutlineEntry[], totalPages: number): { title: string; pages: number; include: boolean }[] {
  if (outline.length === 0) return [];
  const minLevel = Math.min(...outline.map((o) => o.level));
  let level = minLevel;
  if (outline.filter((o) => o.level === minLevel).length < 3 && outline.some((o) => o.level === minLevel + 1)) {
    level = minLevel + 1;
  }
  // Every entry at or above the chosen level marks a boundary.
  const boundaries = outline.filter((o) => o.level <= level).sort((a, b) => a.page - b.page);
  const out: { title: string; pages: number; include: boolean }[] = [];
  boundaries.forEach((entry, i) => {
    if (entry.level !== level) return;
    const next = boundaries[i + 1];
    const end = next ? next.page - 1 : totalPages;
    const pages = Math.max(1, end - entry.page + 1);
    out.push({ title: entry.title.trim(), pages, include: looksLikeChapter(entry.title) });
  });
  // Books with numbered chapters: everything that isn't one (cover, dedication,
  // preface, …) starts unticked. Nothing is removed – the user can tick it.
  const numbered = out.filter((c) => NUMBERED_CHAPTER.test(c.title));
  if (numbered.length >= 3) {
    for (const c of out) c.include = c.include && NUMBERED_CHAPTER.test(c.title);
  }
  return out;
}

const TOC_LINE = /^(.*?\S)[\s.·…_-]+(\d{1,4})\s*$/;

/**
 * Chapters from a pasted table of contents: one line per entry ending with
 * its start page. Uses top-level entries ("3 Cells") when there are also
 * sub-entries ("3.1 Membranes"). The last chapter ends at `lastPage` if given.
 */
export function parseToc(text: string, lastPage?: number): TocChapter[] {
  const lines = parseLineToc(text, lastPage);
  // Scanned books often come out as columns (titles, then page numbers) –
  // try reading the block structure when that finds more chapters.
  const blocks = parseBlockToc(text);
  return blocks.length >= 3 && blocks.length > lines.filter((x) => x.include).length ? blocks : lines;
}

export interface TocChapter {
  title: string;
  pages: number;
  include: boolean;
  estimated: boolean;
}

function parseLineToc(text: string, lastPage?: number): TocChapter[] {
  const entries = text
    .split(/\r?\n/)
    .map((line) => line.trim().match(TOC_LINE))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => ({ title: m[1]!.replace(/[\s.·…_-]+$/, "").trim(), page: Number(m[2]) }))
    .filter((e) => e.title.length > 0);
  if (entries.length === 0) return [];

  const isSub = (t: string) => /^\d+\.\d+/.test(t);
  const hasTop = entries.some((e) => !isSub(e.title));
  const all = entries.slice().sort((a, b) => a.page - b.page);
  const top = all.filter((e) => !hasTop || !isSub(e.title));

  const pagesKnown = top.map((e, i) => {
    const next = top[i + 1];
    if (next) return Math.max(1, next.page - e.page);
    return lastPage && lastPage >= e.page ? lastPage - e.page + 1 : undefined;
  });
  const known = pagesKnown.filter((p): p is number => p !== undefined).sort((a, b) => a - b);
  const median = known.length ? known[Math.floor(known.length / 2)]! : 20;

  return top.map((e, i) => ({
    title: e.title,
    pages: pagesKnown[i] ?? median,
    include: looksLikeChapter(e.title),
    estimated: pagesKnown[i] === undefined,
  }));
}

const BULLET = /^[•■▪●◦*·]\s*/;
/** A line that is just a page number, maybe glued to a prefix ("AB10", "ABABAB23", "1]"). */
const NUMBER_LINE = /^(\p{L}*)(\d{1,4})[\])}.,;:]?$/u;
/** A title line that continues on the next line ("Schule und" / "Ausbildung"). */
const CONTINUES = /(\b(und|and|&|of|for|the|der|die|das|mit|von|zu|im|in|am)|[,–-])$/i;

/**
 * Undoes OCR letter-spacing: "E s s e n u n d T rin k e n" → "Essen und
 * Trinken". Only touches lines that are mostly 1–2 letter fragments.
 */
export function unspace(text: string): string {
  const tokens = text.trim().split(/\s+/);
  const short = tokens.filter((t) => t.length <= 2).length;
  if (tokens.length < 3 || short / tokens.length < 0.5) return text.trim();
  return tokens
    .join("")
    .replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2")
    .replace(/(\p{Ll}{3,})(und|and)(?=\s|$)/gu, "$1 $2");
}

/**
 * Tables of contents of scanned books, where every chapter has the same
 * sub-entries ("Schritt A–E, Phonetik, Test, …") and the page numbers come
 * as separate columns. The line repeated in every chapter marks the
 * chapters; the line(s) before it are the chapter title; the first number of
 * each column of page numbers is a chapter's start page.
 */
export function parseBlockToc(text: string): TocChapter[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(BULLET, "").trim())
    .filter(Boolean);
  const isNumber = (l: string) => NUMBER_LINE.test(l);
  const key = (l: string) => l.toLowerCase().replace(/\s+/g, " ");

  const counts = new Map<string, number>();
  for (const l of lines) if (!isNumber(l) && l.length > 1) counts.set(key(l), (counts.get(key(l)) ?? 0) + 1);
  const max = Math.max(0, ...counts.values());
  if (max < 3) return [];
  const anchor = key(lines.find((l) => !isNumber(l) && counts.get(key(l)) === max)!);
  const repeated = new Set([...counts].filter(([, n]) => n >= Math.max(3, max / 2)).map(([k]) => k));

  // Chapter titles: the line before each anchor, plus earlier lines that continue into it.
  const titles: string[] = [];
  lines.forEach((l, i) => {
    if (key(l) !== anchor) return;
    const parts: string[] = [];
    for (let j = i - 1; j >= 0; j--) {
      const prev = lines[j]!;
      if (isNumber(prev) || repeated.has(key(prev)) || !/\p{L}{2}/u.test(prev.replace(/\s/g, ""))) break;
      if (parts.length > 0 && !CONTINUES.test(unspace(prev))) break;
      parts.unshift(prev);
      if (parts.length >= 3) break;
    }
    if (parts.length) titles.push(unspace(parts.join(" ")));
  });
  if (titles.length < 3) return [];

  // Columns of page numbers: a run starts after a text line or with a prefix ("AB10").
  const runs: { start: number; max: number }[] = [];
  let run: { start: number; max: number } | undefined;
  for (const l of lines) {
    const m = l.match(NUMBER_LINE);
    if (!m) {
      run = undefined;
      continue;
    }
    const n = Number(m[2]);
    if (!run || m[1]) runs.push((run = { start: n, max: n }));
    else run.max = Math.max(run.max, n);
  }
  const starts = increasing(runs.map((r) => r.start));
  const usable = starts.length === titles.length;

  // "LektionLektion…Lektion" (a label glued once per chapter) → "Lektion 3: …".
  let label: string | undefined;
  for (const l of lines) {
    const m = l.match(/^(\p{Lu}\p{Ll}{3,}?)\1+\d*$/u);
    if (m && l.replace(/\d+$/, "").length / m[1]!.length === titles.length) label = m[1];
  }

  const known = usable ? starts.slice(1).map((s, i) => s - starts[i]!) : [];
  const lastRun = usable ? runs.find((r) => r.start === starts[starts.length - 1]) : undefined;
  if (lastRun && lastRun.max > lastRun.start) known.push(lastRun.max - lastRun.start + 1);
  const sorted = known.slice().sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)]! : 20;
  return titles.map((title, i) => ({
    title: label ? `${label} ${i + 1}: ${title}` : title,
    pages: known[i] !== undefined && known[i]! > 0 ? known[i]! : median,
    include: true,
    estimated: known[i] === undefined || known[i]! <= 0,
  }));
}

/** Longest strictly increasing subsequence (earliest one). */
function increasing(values: number[]): number[] {
  const best: number[][] = [];
  for (const v of values) {
    let pick: number[] = [];
    for (const seq of best) if (seq[seq.length - 1]! < v && seq.length > pick.length) pick = seq;
    best.push([...pick, v]);
  }
  return best.reduce((a, b) => (b.length > a.length ? b : a), [] as number[]);
}

/** Two chunks become one: recordings and page/slide counts add up. */
export function mergeChunks(a: DraftChunk, b: DraftChunk): DraftChunk {
  return {
    ...a,
    include: a.include || b.include,
    recordingMinutes: a.recordingMinutes + b.recordingMinutes,
    pages: a.pages + b.pages,
    slides: a.slides + b.slides,
    sources: [...a.sources, ...b.sources],
    note: [a.note, b.note].filter(Boolean).join(" · ") || undefined,
  };
}

const words = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 4);

/** Same name, one starts with the other, or a shared word ("Campbell Biology" ~ "Biology"). */
function matchSubject(name: string, existing: Subject[]): Subject | undefined {
  const n = name.toLowerCase();
  const nw = words(name);
  return (
    existing.find((s) => s.name.toLowerCase() === n) ??
    existing.find((s) => n.length >= 3 && (s.name.toLowerCase().startsWith(n) || n.startsWith(s.name.toLowerCase()))) ??
    existing.find((s) => words(s.name).some((w) => nw.includes(w)))
  );
}

/**
 * When an import finds exactly one new subject and exactly one existing
 * subject has no material yet (e.g. the one just created in the setup
 * wizard), it's almost certainly the same subject: add the import to it.
 */
export function adoptEmptySubject(draft: Draft, existing: Subject[], chunks: { subjectId: string }[]): Draft {
  const fresh = draft.subjects.filter((s) => !s.existingId);
  const empty = existing.filter((s) => !chunks.some((c) => c.subjectId === s.id));
  if (fresh.length !== 1 || empty.length !== 1) return draft;
  const target = empty[0]!;
  if (draft.subjects.some((s) => s.existingId === target.id)) return draft;
  return {
    ...draft,
    subjects: draft.subjects.map((s) => (s === fresh[0] ? { ...s, existingId: target.id, name: target.name || s.name } : s)),
  };
}

function fileName(path: string): string {
  return path.split("/").pop() ?? path;
}

/**
 * Builds the review draft from detected files:
 * - subjects from folders (or file names), matched to existing subjects
 * - book PDFs with bookmarks → one chunk per chapter
 * - slide PDFs / PPTX → one lecture each; portrait PDFs without bookmarks → pages
 * - videos → recording length, merged with slides that share the lecture number
 */
export function buildDraft(files: DetectedFile[], existing: Subject[], today: ISODate): Draft {
  const skipped: Draft["skipped"] = [];
  const bySubject = new Map<string, DraftChunk[]>();
  const tocBySubject = new Map<string, string>();
  const add = (subject: string, chunk: DraftChunk) => {
    let list = bySubject.get(subject);
    if (!list) bySubject.set(subject, (list = []));
    list.push(chunk);
  };

  for (const file of files) {
    const name = fileName(file.path);
    if (file.kind === "other") {
      skipped.push({ name, reason: "not a PDF, PowerPoint or video" });
      continue;
    }
    if (file.error) {
      skipped.push({ name, reason: file.error });
      continue;
    }
    const subject = subjectFromPath(file.path);
    const base = { include: true, recordingMinutes: 0, pages: 0, slides: 0, sources: [name], number: lectureNumber(name) };

    if (file.kind === "video") {
      if (!file.durationMinutes) {
        add(subject, { ...base, id: draftId(), title: cleanTitle(name), recordingMinutes: 60, note: "length unknown – please check" });
      } else {
        add(subject, { ...base, id: draftId(), title: cleanTitle(name), recordingMinutes: Math.round(file.durationMinutes) });
      }
      continue;
    }

    const pages = file.pages ?? 0;
    const chapters = file.kind === "pdf" && pages >= 30 ? chaptersFromOutline(file.outline ?? [], pages) : [];
    if (chapters.length >= 2) {
      // A book: one chunk per chapter, in book order (no lecture pairing).
      chapters.forEach((ch) =>
        add(subject, { ...base, number: undefined, id: draftId(), title: ch.title, pages: ch.pages, include: ch.include, sources: [name] }),
      );
      continue;
    }
    // No bookmarks: read the printed table of contents.
    if (file.tocPages?.length) {
      const prev = tocBySubject.get(subject);
      tocBySubject.set(subject, (prev ? `${prev}\n\n` : "") + file.tocPages.join("\n"));
    }
    const fromToc = file.kind === "pdf" && pages >= 30 ? (file.tocPages ?? []).map((t) => parseToc(t)).filter((c) => c.length >= 3).flat() : [];
    if (fromToc.length >= 3) {
      fromToc.forEach((ch) =>
        add(subject, {
          ...base,
          number: undefined,
          id: draftId(),
          title: ch.title,
          pages: ch.pages,
          include: ch.include,
          sources: [`${name} (table of contents)`],
          ...(ch.estimated ? { note: "pages estimated – please check" } : {}),
        }),
      );
      continue;
    }

    const asSlides = file.kind === "pptx" || file.landscape !== false;
    add(subject, { ...base, id: draftId(), title: cleanTitle(name), ...(asSlides ? { slides: pages } : { pages }) });
  }

  const subjects: DraftSubject[] = [];
  for (const [name, chunks] of bySubject) {
    // Pair recordings and slides of the same lecture number.
    const paired: DraftChunk[] = [];
    for (const chunk of chunks) {
      const twin =
        chunk.number !== undefined
          ? paired.find((x) => x.number === chunk.number && (x.recordingMinutes > 0) !== (chunk.recordingMinutes > 0))
          : undefined;
      if (twin) {
        const merged = mergeChunks(twin.recordingMinutes > 0 ? chunk : twin, twin.recordingMinutes > 0 ? twin : chunk);
        paired[paired.indexOf(twin)] = { ...merged, id: twin.id, number: twin.number };
      } else {
        paired.push(chunk);
      }
    }
    // Lectures in number order; book chapters keep their order.
    const numbered = paired.every((c) => c.number !== undefined);
    if (numbered) paired.sort((a, b) => a.number! - b.number! || a.title.localeCompare(b.title));

    const match = matchSubject(name, existing);
    subjects.push({
      id: draftId(),
      include: true,
      name: match?.name ?? name,
      existingId: match?.id,
      examDate: addDays(today, 42),
      chunks: paired,
      ...(tocBySubject.has(name) ? { tocText: tocBySubject.get(name) } : {}),
    });
  }
  subjects.sort((a, b) => a.name.localeCompare(b.name));
  return { subjects, skipped };
}

/** Draft from a pasted table of contents, for one subject. */
export function draftFromToc(text: string, subjectName: string, existing: Subject[], today: ISODate, lastPage?: number): Draft {
  const chapters = parseToc(text, lastPage);
  const match = matchSubject(subjectName, existing);
  // Even when nothing was found, the review can still let AI read the text.
  return {
    subjects: text.trim()
      ? [
          {
            id: draftId(),
            include: true,
            name: match?.name ?? (subjectName.trim() || "New subject"),
            existingId: match?.id,
            examDate: addDays(today, 42),
            tocText: text,
            ...(lastPage ? { lastPage } : {}),
            chunks: chapters.map((c) => ({
              id: draftId(),
              include: c.include,
              title: c.title,
              recordingMinutes: 0,
              pages: c.pages,
              slides: 0,
              sources: ["Table of contents"],
              note: c.estimated ? "page count estimated – please check" : undefined,
            })),
          },
        ]
      : [],
    skipped: [],
  };
}

/**
 * Draft from Anki collections (top-level decks). For each chosen collection:
 * - the subject is the one already linked to it, a subject with a matching
 *   name, or a new one;
 * - sub-decks with a similar name to an existing chapter are linked to it;
 * - the other sub-decks become new chapters, each linked to its deck.
 */
export function draftFromAnki(
  deckNames: string[],
  chosen: string[],
  existing: Subject[],
  existingChunks: ExistingChunk[],
  today: ISODate,
  defaultRecordingMinutes: number,
): Draft {
  const subjects = chosen.map((collection) => {
    const match = existing.find((s) => s.ankiDeck === collection) ?? matchSubject(collection, existing);
    const base: DraftSubject = {
      id: draftId(),
      include: true,
      name: match?.name ?? collection,
      examDate: addDays(today, 42),
      chunks: [],
      ankiDeck: collection,
      ankiSubdecks: subdecks(deckNames, collection),
    };
    return ankiTarget(base, match, existingChunks, defaultRecordingMinutes);
  });
  return { subjects, skipped: [] };
}

type ExistingChunk = { id: string; subjectId: string; title: string; ankiDeck?: string };

/**
 * (Re)builds an Anki draft subject for a target: an existing subject (its
 * chapters get linked by similar names) or a new one (every sub-deck becomes
 * a new item).
 */
export function ankiTarget(d: DraftSubject, target: Subject | undefined, existingChunks: ExistingChunk[], defaultRecordingMinutes: number): DraftSubject {
  const decks = d.ankiSubdecks ?? [];
  const own = target ? existingChunks.filter((c) => c.subjectId === target.id) : [];
  const alreadyLinked = new Set(own.map((c) => c.ankiDeck).filter(Boolean));
  const free = decks.filter((x) => !alreadyLinked.has(x));
  const links = matchDecks(own.filter((c) => !c.ankiDeck), free);
  const linkedDecks = new Set(links.values());
  return {
    ...d,
    existingId: target?.id,
    name: target?.name ?? d.name,
    links: own.filter((c) => links.has(c.id)).map((c) => ({ chunkId: c.id, title: c.title, deck: links.get(c.id)!, include: true })),
    chunks: free
      .filter((x) => !linkedDecks.has(x))
      .map((deck) => ({
        id: draftId(),
        include: true,
        title: leaf(deck),
        recordingMinutes: defaultRecordingMinutes,
        pages: 0,
        slides: 0,
        sources: [`Anki: ${deck}`],
        number: lectureNumber(leaf(deck)),
        note: "add pages or slides",
        ankiDeck: deck,
      })),
  };
}

/** What the AI returns for a table of contents (see apps/api/src/toc.ts). */
export interface AiToc {
  chapters: { title: string; startPage: number | null; include: boolean }[];
  lastPage: number | null;
}

/**
 * Chapters with page counts from the AI's start pages: up to the next
 * chapter that starts later; the last one up to the last page.
 */
export function chaptersFromAi(toc: AiToc, lastPage?: number): TocChapter[] {
  const end = lastPage ?? toc.lastPage ?? undefined;
  const raw = toc.chapters.map((c, i) => {
    const start = c.startPage === null ? undefined : Math.round(c.startPage);
    if (start === undefined) return undefined;
    // Page numbers that restart (e.g. a word list numbered from 1) can't be measured.
    if (toc.chapters.slice(0, i).some((p) => p.startPage !== null && Math.round(p.startPage) > start)) return undefined;
    const next = toc.chapters.slice(i + 1).find((n) => n.startPage !== null && Math.round(n.startPage) > start);
    if (next) return Math.round(next.startPage!) - start;
    return end !== undefined && end >= start ? end - start + 1 : undefined;
  });
  const known = raw.filter((p, i): p is number => p !== undefined && p > 0 && toc.chapters[i]!.include).sort((a, b) => a - b);
  const median = known.length ? known[Math.floor(known.length / 2)]! : 20;
  return toc.chapters
    .map((c, i) => ({
      title: c.title.trim(),
      pages: raw[i] && raw[i]! > 0 ? raw[i]! : median,
      include: c.include,
      estimated: !(raw[i] && raw[i]! > 0),
    }))
    .filter((c) => c.title);
}

/** Replaces a draft subject's chapters with the ones the AI read. */
export function applyAiToc(subject: DraftSubject, toc: AiToc, source: string): DraftSubject {
  return {
    ...subject,
    readBy: "ai",
    otherChunks: subject.readBy === "ai" ? subject.otherChunks : subject.chunks,
    chunks: chaptersFromAi(toc, subject.lastPage).map((c) => ({
      id: draftId(),
      include: c.include,
      title: c.title,
      recordingMinutes: 0,
      pages: c.pages,
      slides: 0,
      sources: [`${source} (read by AI)`],
      ...(c.estimated ? { note: "pages estimated – please check" } : {}),
    })),
  };
}

/** Switches between the AI's and the quick reader's chapters. */
export function swapReader(subject: DraftSubject): DraftSubject {
  if (!subject.otherChunks) return subject;
  return { ...subject, chunks: subject.otherChunks, otherChunks: subject.chunks, readBy: subject.readBy === "ai" ? "quick" : "ai" };
}

/** An empty chapter the user adds in the review (e.g. a section the reader missed). */
export function newDraftChunk(): DraftChunk {
  // Pages start at 0 on purpose: filling them in is the user's job, no warning needed.
  return { id: draftId(), include: true, title: "", recordingMinutes: 0, pages: 0, slides: 0, sources: ["Added by you"] };
}
