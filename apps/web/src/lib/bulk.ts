/**
 * Quick entry for many chunks at once. One line per chunk or per range:
 *
 *   Ch 1: 22                 → 22 pages
 *   Lecture 3: 45 slides     → 45 slides
 *   Ch 2: 18p 30s            → 18 pages + 30 slides
 *   Lecture 4: 40s 90min     → 40 slides + a 90-minute recording ("1.5h" works too)
 *   Ch 1-4: 22, 18, 30, 25   → four chunks "Ch 1" … "Ch 4"
 *
 * Numbers without a unit count as `defaultKind`.
 */
export interface ParsedChunk {
  title: string;
  pages: number;
  slides: number;
  /** Only set when the line names a recording length. */
  recordingMinutes?: number;
}

export interface BulkResult {
  chunks: ParsedChunk[];
  errors: string[];
}

const RANGE_RE = /^(.*?)(\d+)\s*[-–]\s*(\d+)\s*$/;
const VALUE_RE = /(\d+(?:[.,]\d+)?)\s*(pages?|p|slides?|s|folien|seiten|minutes?|mins?|m|hours?|hrs?|h)?\b/gi;

function parseSpec(spec: string, defaultKind: "pages" | "slides"): Omit<ParsedChunk, "title"> | null {
  let pages = 0;
  let slides = 0;
  let recording: number | undefined;
  let found = false;
  for (const m of spec.matchAll(VALUE_RE)) {
    found = true;
    const value = Number(m[1]!.replace(",", "."));
    const unit = (m[2] ?? "").toLowerCase();
    if (unit.startsWith("m")) recording = (recording ?? 0) + Math.round(value);
    else if (unit.startsWith("h")) recording = (recording ?? 0) + Math.round(value * 60);
    else if (unit === "seiten" || unit.startsWith("p")) pages += Math.round(value);
    else if (unit === "folien" || unit.startsWith("s")) slides += Math.round(value);
    else if (defaultKind === "slides") slides += Math.round(value);
    else pages += Math.round(value);
  }
  if (!found) return null;
  return recording !== undefined ? { pages, slides, recordingMinutes: recording } : { pages, slides };
}

export function parseBulk(text: string, defaultKind: "pages" | "slides" = "pages"): BulkResult {
  const chunks: ParsedChunk[] = [];
  const errors: string[] = [];

  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return;
    const sep = line.search(/[:\t]/);
    if (sep < 0) {
      errors.push(`Line ${index + 1}: add a colon, e.g. "Ch 1: 22".`);
      return;
    }
    const title = line.slice(0, sep).trim();
    const values = line.slice(sep + 1).trim();
    if (!title) {
      errors.push(`Line ${index + 1}: missing a name before the colon.`);
      return;
    }

    const range = title.match(RANGE_RE);
    const entries = values.split(/[,;]/).map((x) => x.trim()).filter(Boolean);
    if (range) {
      const [, prefix, a, b] = range;
      const start = Number(a);
      const end = Number(b);
      const count = end - start + 1;
      if (count < 1 || count > 200) {
        errors.push(`Line ${index + 1}: range ${start}–${end} doesn't look right.`);
        return;
      }
      if (entries.length !== count) {
        errors.push(`Line ${index + 1}: ${count} chunks but ${entries.length} values.`);
        return;
      }
      entries.forEach((entry, i) => {
        const spec = parseSpec(entry, defaultKind);
        if (!spec) errors.push(`Line ${index + 1}: "${entry}" is not a number.`);
        else chunks.push({ title: `${prefix}${start + i}`.trim(), ...spec });
      });
      return;
    }

    const spec = parseSpec(values, defaultKind);
    if (!spec) errors.push(`Line ${index + 1}: no pages or slides found.`);
    else chunks.push({ title, ...spec });
  });

  return { chunks, errors };
}
