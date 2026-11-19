/**
 * Quick entry for many chunks at once. One line per chunk or per range:
 *
 *   Ch 1: 22                 → 22 pages
 *   Lecture 3: 45 slides     → 45 slides
 *   Ch 2: 18p 30s            → 18 pages + 30 slides
 *   Ch 1-4: 22, 18, 30, 25   → four chunks "Ch 1" … "Ch 4"
 *
 * Numbers without "p"/"s" count as `defaultKind`.
 */
export interface ParsedChunk {
  title: string;
  pages: number;
  slides: number;
}

export interface BulkResult {
  chunks: ParsedChunk[];
  errors: string[];
}

const RANGE_RE = /^(.*?)(\d+)\s*[-–]\s*(\d+)\s*$/;
const VALUE_RE = /(\d+(?:[.,]\d+)?)\s*(pages?|p|slides?|s|folien|seiten)?\b/gi;

function parseSpec(spec: string, defaultKind: "pages" | "slides"): { pages: number; slides: number } | null {
  let pages = 0;
  let slides = 0;
  let found = false;
  for (const m of spec.matchAll(VALUE_RE)) {
    found = true;
    const n = Math.round(Number(m[1]!.replace(",", ".")));
    const unit = (m[2] ?? "").toLowerCase();
    const isSlides = unit.startsWith("s") || unit === "folien" || (!unit && defaultKind === "slides");
    if (unit === "seiten") pages += n;
    else if (isSlides) slides += n;
    else pages += n;
  }
  return found ? { pages, slides } : null;
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
