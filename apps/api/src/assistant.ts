/**
 * "Tell StudyMaster…": one message about the user's plan → a short reply plus
 * proposed changes. Nothing is changed here – the app shows the changes as a
 * preview and applies them only after the user confirms.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod/v4";
import { MODEL, TocError } from "./toc";

/** Messages per user and day (UTC), counted in the user's Durable Object. */
export const DAILY_LIMIT = 30;
export const MAX_MESSAGE = 1000;
/** The plan summary the app sends along (subjects, items, sessions). */
export const MAX_CONTEXT = 60_000;

const Day = z.string().describe("YYYY-MM-DD");
const Step = z.enum(["watch", "read", "summary", "cards", "revise"]);
const Difficulty = z.enum(["very easy", "easy", "normal", "hard", "very hard"]);

export const Action = z.union([
  z.object({
    type: z.literal("block_days"),
    start: Day,
    end: Day.describe("YYYY-MM-DD, inclusive; same as start for one day"),
    reason: z.enum(["vacation", "sick", "break", "other"]),
    note: z.string().nullable(),
  }),
  z.object({ type: z.literal("unblock_days"), start: Day, end: Day }),
  z.object({
    type: z.literal("set_exam"),
    subjectId: z.string(),
    examDate: Day,
    examHalf: z.enum(["am", "pm"]).nullable().describe("am = morning exam, pm = afternoon; null = keep"),
  }),
  z.object({ type: z.literal("set_difficulty"), subjectId: z.string(), difficulty: Difficulty }),
  z.object({
    type: z.literal("set_week_day"),
    weekday: z.number().describe("0 = Sunday … 6 = Saturday"),
    morning: z.number().describe("study sessions in the morning: 0, 1 or 2"),
    afternoon: z.number().describe("study sessions in the afternoon: 0, 1 or 2"),
  }),
  z.object({
    type: z.literal("add_items"),
    subjectId: z.string(),
    items: z.array(
      z.object({
        title: z.string(),
        pages: z.number(),
        slides: z.number(),
        recordingMinutes: z.number().describe("lecture recording length, 0 = none"),
      }),
    ),
  }),
  z.object({
    type: z.literal("set_progress"),
    itemId: z.string(),
    steps: z.array(Step).nullable().describe("steps this is about; null = all steps"),
    done: z.number().describe("share of those steps now done in total, 0–1 (1 = finished, 0.5 = half)"),
  }),
  z.object({
    type: z.literal("check_in"),
    date: Day,
    allDone: z.boolean().describe("true = everything planned that day was done"),
    finished: z
      .array(
        z.object({
          itemId: z.string(),
          part: z.number(),
          fraction: z.number().describe("share of this planned piece that was done, 0–1"),
        }),
      )
      .describe("when allDone is false: the planned pieces that were (partly) done"),
  }),
  z.object({ type: z.literal("add_subject"), name: z.string(), examDate: Day, difficulty: Difficulty }),
  z.object({ type: z.literal("set_checkin_time"), time: z.string().describe("HH:MM, 24 h") }),
]);
export type Action = z.infer<typeof Action>;

export const AssistantResult = z.object({
  reply: z.string().describe("Short, friendly answer in the user's language (1–3 sentences)."),
  actions: z.array(Action).describe("Proposed changes; empty for questions or when unsure."),
});
export type AssistantResult = z.infer<typeof AssistantResult>;

export interface Turn {
  role: "user" | "assistant";
  text: string;
}

const SYSTEM = `You are the helper inside StudyMaster, a study planner for students. The student types one message; you answer briefly and, when they want something changed, propose changes as actions. The app shows your actions as a preview and applies them only if the student confirms – so propose exactly what they asked for, nothing more.

The app plans every study session itself from: subjects with exam dates and difficulty, their material (items such as lectures/chapters with pages, slides, recording minutes), the weekly rhythm (study sessions per morning/afternoon per weekday), days off, and progress. After any change it re-plans automatically, so never try to move single sessions – change the inputs instead.

What you can do (actions):
- block_days: days off (sick, vacation, break, other). "Sick until Thursday" = from today through that Thursday. Dates are inclusive.
- unblock_days: remove days off that overlap the range.
- set_exam: move an exam (examHalf null keeps the time of day).
- set_difficulty: how hard a subject is (changes how much time it gets).
- set_week_day: the normal week. "Make Saturdays free" = weekday 6, morning 0, afternoon 0. Use one action per weekday.
- add_items: new material for a subject, in order. Unknown numbers are 0.
- set_progress: progress on an item outside a check-in ("I already read chapter 4" = steps ["read"], done 1).
- check_in: what happened on a planned day. Only for dates in "sessions" with check-in open. Use the planned pieces (itemId + part) of that date. "Did everything" = allDone true.
- add_subject: a new subject with its exam date.
- set_checkin_time: time of the evening check-in reminder.

Rules:
- Use ids exactly as given in the plan data. Match names loosely (typos, abbreviations, other languages); if a name fits several things, ask instead of guessing.
- Resolve relative dates ("tomorrow", "Thursday", "next week") from today's date and the weekday list given. "Until Thursday" includes Thursday.
- Questions (why is a day full, am I on track, what's next): answer from the plan data, no actions. Status per subject is given: deficit > 0 means it doesn't fit before the exam.
- If the message is unclear, missing something essential, or not about studying with this app, ask a short question or say what you can help with – no actions.
- Never invent material, exams or progress the student didn't mention.
- Handle only the latest message. Earlier proposals may or may not have been applied – the plan data is always current; don't mention earlier proposals.
- "betterPlanWaiting" means a plan that fits better (using the weekly catch-up slot or extra sessions) is waiting for the student's OK in a banner; mention it when they ask whether things fit.
- reply: 1–3 short sentences in the language of the latest message, friendly, no jargon. When proposing actions, say what will change in plain words (the student confirms below your reply).`;

/** Asks Claude; throws TocError for unusable answers. */
export async function askAssistant(client: Anthropic, message: string, context: string, history: Turn[]): Promise<AssistantResult> {
  const messages: Anthropic.MessageParam[] = [];
  for (const turn of history.slice(-4)) messages.push({ role: turn.role, content: turn.text.slice(0, 2000) });
  if (messages[0]?.role === "assistant") messages.shift();
  messages.push({ role: "user", content: `<plan>\n${context}\n</plan>\n\n${message}` });

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    system: SYSTEM,
    messages,
    output_config: { format: zodOutputFormat(AssistantResult), effort: "low" },
  });
  if (response.stop_reason === "refusal") throw new TocError("I can only help with your study plan.", 422);
  if (!response.parsed_output) throw new TocError("I couldn't work that out – could you say it differently?", 502);
  return response.parsed_output;
}

/** Checks and trims the request body. */
export function readRequest(raw: unknown): { message: string; context: string; history: Turn[] } | string {
  if (!raw || typeof raw !== "object") return "Send JSON: { message, context }.";
  const b = raw as { message?: unknown; context?: unknown; history?: unknown };
  if (typeof b.message !== "string" || !b.message.trim()) return "Type a message first.";
  if (b.message.length > MAX_MESSAGE) return "That's a long message – please keep it shorter.";
  if (typeof b.context !== "string") return "Send JSON: { message, context }.";
  if (b.context.length > MAX_CONTEXT) return "Your plan is too big for the helper right now.";
  const history: Turn[] = Array.isArray(b.history)
    ? b.history
        .filter((t): t is Turn => !!t && (t.role === "user" || t.role === "assistant") && typeof t.text === "string")
        .map((t) => ({ role: t.role, text: t.text }))
    : [];
  return { message: b.message.trim(), context: b.context, history };
}
