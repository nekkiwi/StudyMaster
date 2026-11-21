/** Reading a messy table of contents with Claude (structured output). */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod/v4";

export const MODEL = "claude-haiku-5-5";
export const MAX_TEXT = 30_000;

export const TocResult = z.object({
  chapters: z.array(
    z.object({
      title: z.string(),
      /** Printed start page, or null if unknown. */
      startPage: z.number().nullable(),
      /** False for front/back matter (preface, index, word lists, …). */
      include: z.boolean(),
    }),
  ),
  /** Printed last page of the final study unit, if it can be told. */
  lastPage: z.number().nullable(),
});
export type TocResult = z.infer<typeof TocResult>;

const SYSTEM = `You read the table of contents of a textbook or lecture script and list its study units for a study planner.

The text was extracted from PDF pages and is often messy: OCR letter-spacing ("E s s e n u n d T rin k e n" = "Essen und Trinken"), titles and page numbers in separate columns, page-number prefixes such as "AB" or "S.", the same sub-headings repeated in every unit, bullets and stray characters.

Rules:
- List the top-level units a student works through one by one (chapters, lessons, units, Lektionen, Kapitel) in book order – not their sub-sections.
- Repair OCR spacing and obvious OCR errors in titles; keep the book's language. If units carry a label or number ("Lektion 3", "Chapter 3", "3"), start the title with it, e.g. "Lektion 3: Essen und Trinken".
- startPage: the printed start page of the unit – the smallest page number listed for that unit, copied exactly as printed (without prefixes such as "AB" or "S."), or null if it can't be told. Never estimate.
- include: false for front and back matter (preface, contents, index, glossary, word lists, answer keys, appendix), true for study units.
- lastPage: the largest page number listed for any part of the final study unit, copied exactly as printed, or null if none is listed. Never estimate.
- If the text is not a table of contents, return an empty chapters list.`;

export class TocError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** How many reads are compared; the majority wins (answers vary a little from run to run). */
export const READS = 3;

/**
 * Combines several reads of the same text: the most common chapter count,
 * then per chapter the most common title, start page and include flag, and
 * the most common last page. Ties go to the earlier read.
 */
export function consensus(results: TocResult[]): TocResult {
  const first = results[0];
  if (!first || results.length === 1) return first ?? { chapters: [], lastPage: null };
  const count = mostCommon(results.map((r) => r.chapters.length));
  const same = results.filter((r) => r.chapters.length === count);
  return {
    chapters: Array.from({ length: count }, (_, i) => ({
      title: mostCommon(same.map((r) => r.chapters[i]!.title.trim())),
      startPage: mostCommon(same.map((r) => r.chapters[i]!.startPage)),
      include: mostCommon(same.map((r) => r.chapters[i]!.include)),
    })),
    lastPage: mostCommon(same.map((r) => r.lastPage)),
  };
}

function mostCommon<T>(values: T[]): T {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = values[0] as T;
  for (const v of values) if ((counts.get(v) ?? 0) > (counts.get(best) ?? 0)) best = v;
  return best;
}

/** Reads the text several times in parallel and returns the majority answer. */
export async function readTocStable(client: Anthropic, text: string): Promise<TocResult> {
  const settled = await Promise.allSettled(Array.from({ length: READS }, () => readToc(client, text)));
  const ok = settled.filter((r): r is PromiseFulfilledResult<TocResult> => r.status === "fulfilled").map((r) => r.value);
  if (ok.length === 0) throw (settled[0] as PromiseRejectedResult).reason;
  return consensus(ok);
}

export async function readToc(client: Anthropic, text: string): Promise<TocResult> {
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    system: SYSTEM,
    messages: [{ role: "user", content: `<toc>\n${text.slice(0, MAX_TEXT)}\n</toc>` }],
    output_config: { format: zodOutputFormat(TocResult), effort: "low" },
  });
  if (response.stop_reason === "refusal") throw new TocError("The AI couldn't read this text.", 502);
  if (!response.parsed_output) throw new TocError("The AI's answer couldn't be read. Please try again.", 502);
  return response.parsed_output;
}
