/**
 * Material import: turns files (PDFs, slides, videos) or a pasted table of
 * contents into a draft of subjects and chunks. The user reviews the draft
 * (untick, edit, merge, move) before anything is saved.
 *
 * Everything here is pure – reading the files happens in fileReaders.ts.
 */
import { addDays, type ISODate, type Subject } from "@studymaster/core";

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

const NON_CHAPTER = /^(contents|table of contents|inhalt|inhaltsverzeichnis|index|register|bibliography|references|literatur|literaturverzeichnis|preface|vorwort|foreword|acknowledg|cover|title page|titel|copyright|about the author|glossary|appendix|anhang)/i;

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
  return out;
}

const TOC_LINE = /^(.*?\S)[\s.·…_-]+(\d{1,4})\s*$/;

/**
 * Chapters from a pasted table of contents: one line per entry ending with
 * its start page. Uses top-level entries ("3 Cells") when there are also
 * sub-entries ("3.1 Membranes"). The last chapter ends at `lastPage` if given.
 */
export function parseToc(text: string, lastPage?: number): { title: string; pages: number; include: boolean; estimated: boolean }[] {
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

function matchSubject(name: string, existing: Subject[]): Subject | undefined {
  const n = name.toLowerCase();
  return (
    existing.find((s) => s.name.toLowerCase() === n) ??
    existing.find((s) => n.length >= 3 && (s.name.toLowerCase().startsWith(n) || n.startsWith(s.name.toLowerCase())))
  );
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
    });
  }
  subjects.sort((a, b) => a.name.localeCompare(b.name));
  return { subjects, skipped };
}

/** Draft from a pasted table of contents, for one subject. */
export function draftFromToc(text: string, subjectName: string, existing: Subject[], today: ISODate, lastPage?: number): Draft {
  const chapters = parseToc(text, lastPage);
  const match = matchSubject(subjectName, existing);
  return {
    subjects: chapters.length
      ? [
          {
            id: draftId(),
            include: true,
            name: match?.name ?? (subjectName.trim() || "New subject"),
            existingId: match?.id,
            examDate: addDays(today, 42),
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
 * Draft from Anki decks ("Subject::Lecture"). Lectures that StudyMaster already
 * has (same subject, same title) are left out. Sizes are unknown, so they're
 * left for the user to fill in.
 */
export function draftFromAnki(
  structure: { subject: string; lectures: string[] }[],
  existing: Subject[],
  today: ISODate,
  defaultRecordingMinutes: number,
  existingChunks: { subjectId: string; title: string }[] = [],
): Draft {
  const known = (subjectId: string | undefined, title: string) =>
    !!subjectId && existingChunks.some((c) => c.subjectId === subjectId && c.title.trim().toLowerCase() === title.trim().toLowerCase());
  const fresh = structure.map((s) => {
    const match = matchSubject(s.subject, existing);
    return { ...s, match, lectures: s.lectures.filter((l) => !known(match?.id, l)), hadLectures: s.lectures.length > 0 };
  });
  return {
    subjects: fresh
      .filter((s) => s.lectures.length > 0)
      .map((s) => {
        const match = s.match;
        return {
          id: draftId(),
          include: true,
          name: match?.name ?? s.subject,
          existingId: match?.id,
          examDate: addDays(today, 42),
          chunks: s.lectures.map((title) => ({
            id: draftId(),
            include: true,
            title,
            recordingMinutes: defaultRecordingMinutes,
            pages: 0,
            slides: 0,
            sources: ["Anki deck"],
            number: lectureNumber(title),
            note: "add pages or slides",
          })),
        };
      }),
    skipped: fresh
      .filter((s) => s.lectures.length === 0)
      .map((s) => ({
        name: s.subject,
        reason: s.hadLectures ? "already in StudyMaster" : "Anki deck without lecture subdecks",
      })),
  };
}
