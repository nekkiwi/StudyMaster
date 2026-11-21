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
- startPage: the printed start page of the unit, or null if it can't be told.
- include: false for front and back matter (preface, contents, index, glossary, word lists, answer keys, appendix), true for study units.
- lastPage: the last printed page of the final study unit if it can be inferred, else null.
- If the text is not a table of contents, return an empty chapters list.`;

export class TocError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
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
