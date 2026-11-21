/**
 * Calendars for the planner:
 * - POST /api/ics { url }: fetches an ICS calendar link (Google "secret
 *   address", Outlook "publish", iCloud, university portals). Browsers can't
 *   fetch these themselves (no CORS), so the Worker does.
 * - POST /api/timetable { data, mediaType }: reads a timetable (PDF or
 *   photo) with Claude into weekly classes.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod/v4";
import { MODEL, TocError } from "./toc";

export const MAX_ICS_BYTES = 5_000_000;

/** webcal:// → https://; only http(s) links. */
export function icsUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim().replace(/^webcals?:\/\//i, "https://"));
  } catch {
    throw new TocError("That doesn't look like a calendar link.", 400);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new TocError("Calendar links start with https:// or webcal://.", 400);
  return url;
}

export async function fetchIcs(raw: string): Promise<string> {
  const url = icsUrl(raw);
  let res: Response;
  try {
    res = await fetch(url.toString(), { headers: { accept: "text/calendar, */*" }, signal: AbortSignal.timeout(15_000), redirect: "follow" });
  } catch {
    throw new TocError("The calendar link didn't answer. Check the link and try again.", 502);
  }
  if (!res.ok) throw new TocError(`The calendar link answered with an error (${res.status}). Is it the private/secret ICS link?`, 502);
  const length = Number(res.headers.get("content-length") ?? 0);
  if (length > MAX_ICS_BYTES) throw new TocError("That calendar is too big.", 413);
  const text = await res.text();
  if (text.length > MAX_ICS_BYTES) throw new TocError("That calendar is too big.", 413);
  if (!/BEGIN:VCALENDAR/i.test(text.slice(0, 2000))) throw new TocError("That link doesn't lead to a calendar (ICS). Use the iCal/ICS link.", 422);
  return text;
}

export const Timetable = z.object({
  classes: z.array(
    z.object({
      /** 1 = Monday … 7 = Sunday. */
      weekday: z.number(),
      /** "HH:MM", 24 h. */
      start: z.string(),
      end: z.string(),
      title: z.string(),
      weeks: z.enum(["all", "odd", "even"]),
    }),
  ),
  /** First and last day of classes ("YYYY-MM-DD"), if the timetable says. */
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
});
export type Timetable = z.infer<typeof Timetable>;

const SYSTEM = `You read a student's university timetable (a PDF page or a photo/screenshot) and list the weekly classes.

Rules:
- One entry per class and weekday: weekday (1 = Monday … 7 = Sunday), start and end as "HH:MM" in 24-hour time, a short title (course name, add the type like "Lecture" or "Lab" if shown), and weeks: "all", or "odd"/"even" if the class only takes place every other week.
- Read times from the time axis or the printed times; don't guess classes that aren't shown.
- startDate / endDate: the first and last day of classes ("YYYY-MM-DD") if the timetable states them (e.g. semester dates), else null.
- If the image is not a timetable, return an empty classes list.`;

const MEDIA = ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif"] as const;
type Media = (typeof MEDIA)[number];
export const MAX_FILE_BASE64 = 10_000_000;

export async function readTimetable(client: Anthropic, data: string, mediaType: string): Promise<Timetable> {
  if (!MEDIA.includes(mediaType as Media)) throw new TocError("Send a PDF or an image (PNG, JPEG, WebP).", 415);
  if (data.length > MAX_FILE_BASE64) throw new TocError("That file is too big (max. about 7 MB).", 413);
  const file =
    mediaType === "application/pdf"
      ? ({ type: "document", source: { type: "base64", media_type: "application/pdf", data } } as const)
      : ({ type: "image", source: { type: "base64", media_type: mediaType as Exclude<Media, "application/pdf">, data } } as const);
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    system: SYSTEM,
    messages: [{ role: "user", content: [file, { type: "text", text: "List the weekly classes in this timetable." }] }],
    output_config: { format: zodOutputFormat(Timetable), effort: "medium" },
  });
  if (response.stop_reason === "refusal") throw new TocError("The AI couldn't read this file.", 502);
  if (!response.parsed_output) throw new TocError("The AI's answer couldn't be read. Please try again.", 502);
  return response.parsed_output;
}
