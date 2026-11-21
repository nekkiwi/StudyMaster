/**
 * "Tell StudyMaster…": the plan summary sent to the helper, and turning its
 * proposed actions into a preview and into store changes. Pure – no React.
 *
 * Ids in the summary are short ("s1", "i4") to keep messages cheap; `ids`
 * maps them back to the real ones.
 */
import {
  addDays,
  applyResults,
  isISODate,
  itemsForDate,
  STEPS,
  weekday,
  withDefaults,
  type BlockReason,
  type BlockedRange,
  type Chunk,
  type DayPlan,
  type HalfDaySessions,
  type ISODate,
  type ItemResult,
  type Plan,
  type StepKey,
  type Subject,
  type Weight,
  type WeekPlan,
} from "@studymaster/core";
import type { AppData, CheckInRecord } from "../store";
import { nextColor } from "./colors";
import { formatShort, newId, WEEKDAYS } from "./format";

type Difficulty = "very easy" | "easy" | "normal" | "hard" | "very hard";
const DIFFICULTY: Record<Difficulty, Weight> = { "very easy": 0.5, easy: 0.8, normal: 1, hard: 1.2, "very hard": 1.5 };
const difficultyOf = (w: Weight): Difficulty => (Object.keys(DIFFICULTY) as Difficulty[]).find((d) => DIFFICULTY[d] === w) ?? "normal";

/** What the helper can propose (same shape as the Worker's schema). */
export type AssistantAction =
  | { type: "block_days"; start: ISODate; end: ISODate; reason: BlockReason; note: string | null }
  | { type: "unblock_days"; start: ISODate; end: ISODate }
  | { type: "set_exam"; subjectId: string; examDate: ISODate; examHalf: "am" | "pm" | null }
  | { type: "set_difficulty"; subjectId: string; difficulty: Difficulty }
  | { type: "set_week_day"; weekday: number; morning: number; afternoon: number }
  | { type: "add_items"; subjectId: string; items: { title: string; pages: number; slides: number; recordingMinutes: number }[] }
  | { type: "set_progress"; itemId: string; steps: StepKey[] | null; done: number }
  | { type: "check_in"; date: ISODate; allDone: boolean; finished: { itemId: string; part: number; fraction: number }[] }
  | { type: "add_subject"; name: string; examDate: ISODate; difficulty: Difficulty }
  | { type: "set_checkin_time"; time: string };

export interface AssistantContext {
  /** JSON text for the helper. */
  text: string;
  /** Short id → real id (subjects and items). */
  ids: Map<string, string>;
}

const hours = (minutes: number) => Math.round((minutes / 60) * 10) / 10;
const DAY_NAMES = WEEKDAYS.map((d) => d.slice(0, 3));

/** Days with planned work that can still be checked in: open past days and today. */
export function checkInDates(data: Pick<AppData, "checkIns">, plan: Plan, today: ISODate): ISODate[] {
  const dates = [...new Set(plan.sessions.filter((s) => s.date <= today && s.items.some((i) => i.kind !== "anki")).map((s) => s.date))];
  return dates.filter((d) => !data.checkIns[d]).sort();
}

/** The compact plan summary the helper answers from. */
export function buildContext(data: AppData, plan: Plan, today: ISODate, extra: { betterPlanWaiting?: boolean } = {}): AssistantContext {
  const ids = new Map<string, string>();
  const short = new Map<string, string>();
  data.subjects.forEach((s, i) => {
    ids.set(`s${i + 1}`, s.id);
    short.set(s.id, `s${i + 1}`);
  });
  const chunks = [...data.chunks].sort((a, b) => a.order - b.order);
  chunks.forEach((c, i) => {
    ids.set(`i${i + 1}`, c.id);
    short.set(c.id, `i${i + 1}`);
  });
  const open = new Set(checkInDates(data, plan, today));
  const status = new Map(plan.subjects.map((s) => [s.subjectId, s]));
  const steps = data.settings.workflow;

  const summary = {
    today: `${today} ${DAY_NAMES[weekday(today)]}`,
    nextDays: Array.from({ length: 14 }, (_, i) => {
      const d = addDays(today, i + 1);
      return `${d} ${DAY_NAMES[weekday(d)]}`;
    }),
    studyStyle: steps,
    week: Object.fromEntries(data.settings.week.map((d, i) => [DAY_NAMES[i], { morning: d.am, afternoon: d.pm }])),
    daysOff: data.blocked.filter((b) => b.end >= today).map((b) => ({ start: b.start, end: b.end, reason: b.reason, note: b.note })),
    checkInTime: data.checkInTime,
    subjects: data.subjects.map((s) => {
      const st = status.get(s.id);
      return {
        id: short.get(s.id),
        name: s.name,
        exam: `${s.examDate} ${s.examHalf ?? "am"}`,
        difficulty: difficultyOf(s.weight),
        ...(st ? { hoursLeft: hours(st.remainingMinutes), hoursPlanned: hours(st.scheduledMinutes), deficitHours: hours(st.deficitMinutes), mainStudyEnds: st.finishBy } : {}),
      };
    }),
    items: chunks
      .filter((c) => data.subjects.some((s) => s.id === c.subjectId))
      .map((c) => {
        const done = Object.fromEntries(STEPS.filter((k) => (c.done?.[k] ?? 0) > 0).map((k) => [k, Math.round((c.done![k] ?? 0) * 100) / 100]));
        return {
          id: short.get(c.id),
          subject: short.get(c.subjectId),
          title: c.title,
          ...(c.pages ? { pages: c.pages } : {}),
          ...(c.slides ? { slides: c.slides } : {}),
          ...(c.recordingMinutes ? { recordingMinutes: c.recordingMinutes } : {}),
          ...(Object.keys(done).length ? { done } : {}),
        };
      }),
    sessions: plan.sessions
      .filter((s) => open.has(s.date) || (s.date >= today && s.date <= addDays(today, 7)))
      .map((s) => ({
        date: s.date,
        slot: s.slot,
        type: s.type,
        ...(open.has(s.date) ? { checkInOpen: true } : {}),
        pieces: s.items.map((i) =>
          i.kind === "anki"
            ? { anki: true, minutes: i.minutes }
            : { itemId: short.get(i.chunkId), part: i.part, parts: i.parts, title: i.title, subject: short.get(i.subjectId), minutes: i.minutes },
        ),
      })),
    unscheduledHours: hours(plan.unscheduled.reduce((sum, i) => sum + i.minutes, 0)),
    ...(extra.betterPlanWaiting ? { betterPlanWaiting: true } : {}),
  };
  return { text: JSON.stringify(summary), ids };
}

/** One proposed change, ready to show and apply. */
export interface ProposedChange {
  action: AssistantAction;
  /** Plain words for the preview, e.g. "Days off: 21 Nov – 26 Nov (sick)". */
  label: string;
}

const clampInt = (n: unknown, min: number, max: number) => (typeof n === "number" && Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : min);
const clamp01 = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
const validTime = (t: unknown): t is string => typeof t === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
const REASON_LABEL: Record<BlockReason, string> = { sick: "sick", vacation: "vacation", break: "break", other: "day off" };

function range(start: ISODate, end: ISODate): string {
  return start === end ? formatShort(start) : `${formatShort(start)} – ${formatShort(end)}`;
}

function halfText(n: number): string {
  return n === 0 ? "free" : n === 1 ? "1 session" : "2 sessions";
}

/**
 * Checks the helper's actions against the data, maps short ids back and
 * describes each one. Actions that don't fit (unknown ids, bad dates) are dropped.
 */
export function reviewActions(raw: unknown[], data: AppData, plan: Plan, today: ISODate, ids: Map<string, string>): ProposedChange[] {
  const subject = (id: unknown) => data.subjects.find((s) => s.id === ids.get(String(id)));
  const chunk = (id: unknown) => data.chunks.find((c) => c.id === ids.get(String(id)));
  const open = new Set(checkInDates(data, plan, today));
  const out: ProposedChange[] = [];

  for (const a of raw as AssistantAction[]) {
    if (!a || typeof a !== "object") continue;
    switch (a.type) {
      case "block_days": {
        if (!isISODate(a.start) || !isISODate(a.end)) break;
        const [start, end] = a.start <= a.end ? [a.start, a.end] : [a.end, a.start];
        const reason: BlockReason = ["vacation", "sick", "break", "other"].includes(a.reason) ? a.reason : "other";
        const note = typeof a.note === "string" && a.note.trim() ? a.note.trim().slice(0, 80) : null;
        out.push({ action: { ...a, start, end, reason, note }, label: `Days off: ${range(start, end)} (${note ?? REASON_LABEL[reason]})` });
        break;
      }
      case "unblock_days": {
        if (!isISODate(a.start) || !isISODate(a.end)) break;
        const hit = data.blocked.some((b) => b.start <= a.end && b.end >= a.start);
        if (hit) out.push({ action: a, label: `No longer days off: ${range(a.start, a.end)}` });
        break;
      }
      case "set_exam": {
        const s = subject(a.subjectId);
        if (!s || !isISODate(a.examDate)) break;
        const examHalf = a.examHalf === "am" || a.examHalf === "pm" ? a.examHalf : null;
        const when = examHalf ? (examHalf === "am" ? " (morning)" : " (afternoon)") : "";
        out.push({ action: { ...a, subjectId: s.id, examHalf }, label: `${s.name} exam: ${formatShort(a.examDate)}${when}` });
        break;
      }
      case "set_difficulty": {
        const s = subject(a.subjectId);
        if (!s || !(a.difficulty in DIFFICULTY)) break;
        out.push({ action: { ...a, subjectId: s.id }, label: `${s.name}: ${a.difficulty}` });
        break;
      }
      case "set_week_day": {
        const day = clampInt(a.weekday, 0, 6);
        if (a.weekday !== day) break;
        const morning = clampInt(a.morning, 0, 2);
        const afternoon = clampInt(a.afternoon, 0, 2);
        const label =
          morning + afternoon === 0
            ? `${WEEKDAYS[day]}s: free`
            : `${WEEKDAYS[day]}s: morning ${halfText(morning)}, afternoon ${halfText(afternoon)}`;
        out.push({ action: { ...a, weekday: day, morning, afternoon }, label });
        break;
      }
      case "add_items": {
        const s = subject(a.subjectId);
        const items = (Array.isArray(a.items) ? a.items : [])
          .filter((i) => i && typeof i.title === "string" && i.title.trim())
          .slice(0, 50)
          .map((i) => ({
            title: i.title.trim().slice(0, 120),
            pages: clampInt(i.pages, 0, 5000),
            slides: clampInt(i.slides, 0, 5000),
            recordingMinutes: clampInt(i.recordingMinutes, 0, 600),
          }));
        if (!s || items.length === 0) break;
        const what = items.map((i) => {
          const size = [i.pages && `${i.pages} pages`, i.slides && `${i.slides} slides`, i.recordingMinutes && `${i.recordingMinutes} min video`].filter(Boolean).join(", ");
          return size ? `${i.title} (${size})` : i.title;
        });
        out.push({ action: { ...a, subjectId: s.id, items }, label: `Add to ${s.name}: ${what.join(" · ")}` });
        break;
      }
      case "set_progress": {
        const c = chunk(a.itemId);
        if (!c) break;
        const steps = Array.isArray(a.steps) ? a.steps.filter((k) => STEPS.includes(k)) : null;
        const done = clamp01(a.done);
        const which = steps?.length ? steps.join(" + ") : "everything";
        const amount = done >= 1 ? "done" : done <= 0 ? "not started" : `${Math.round(done * 100)}% done`;
        out.push({ action: { ...a, itemId: c.id, steps: steps?.length ? steps : null, done }, label: `${c.title}: ${which} ${amount}` });
        break;
      }
      case "check_in": {
        if (!open.has(a.date)) break;
        const items = itemsForDate(plan, a.date).filter((i) => i.kind !== "anki");
        if (a.allDone) {
          out.push({ action: { ...a, finished: [] }, label: `Check-in ${formatShort(a.date)}: all done` });
          break;
        }
        const finished = (Array.isArray(a.finished) ? a.finished : [])
          .map((f) => ({ itemId: ids.get(String(f.itemId)) ?? "", part: f.part, fraction: clamp01(f.fraction) }))
          .filter((f) => f.fraction > 0 && items.some((i) => i.chunkId === f.itemId && i.part === f.part));
        const parts = finished.map((f) => {
          const item = items.find((i) => i.chunkId === f.itemId && i.part === f.part)!;
          const name = `${data.subjects.find((x) => x.id === item.subjectId)?.name ?? ""} ${item.title}`.trim();
          return f.fraction >= 1 ? name : `${Math.round(f.fraction * 100)}% of ${name}`;
        });
        const label = parts.length
          ? `Check-in ${formatShort(a.date)}: did ${parts.join(", ")} – the rest moves`
          : `Check-in ${formatShort(a.date)}: nothing done – it all moves`;
        out.push({ action: { ...a, finished }, label });
        break;
      }
      case "add_subject": {
        const name = typeof a.name === "string" ? a.name.trim().slice(0, 60) : "";
        if (!name || !isISODate(a.examDate)) break;
        const difficulty: Difficulty = a.difficulty in DIFFICULTY ? a.difficulty : "normal";
        out.push({ action: { ...a, name, difficulty }, label: `New subject: ${name}, exam ${formatShort(a.examDate)}` });
        break;
      }
      case "set_checkin_time": {
        if (!validTime(a.time)) break;
        out.push({ action: a, label: `Evening check-in at ${a.time}` });
        break;
      }
    }
  }
  return out;
}

/** The data the helper's changes touch (also what "Undo" restores). */
export type ChangedData = Pick<AppData, "subjects" | "chunks" | "blocked" | "settings" | "checkInTime" | "checkIns">;

export function snapshot(data: AppData): ChangedData {
  const { subjects, chunks, blocked, settings, checkInTime, checkIns } = data;
  return { subjects, chunks, blocked, settings, checkInTime, checkIns };
}

/** Applies reviewed changes. Check-ins use the plan they were made for. */
export function applyChanges(data: AppData, changes: ProposedChange[], plan: Plan, now = new Date()): ChangedData {
  let { subjects, chunks, blocked, settings, checkInTime, checkIns } = snapshot(data);

  // Check-ins first: they refer to the plan as it is now.
  for (const { action: a } of changes) {
    if (a.type !== "check_in") continue;
    const items = itemsForDate(plan, a.date);
    const results: ItemResult[] = a.allDone
      ? items.map((item) => ({ item }))
      : a.finished.flatMap((f) => {
          const item = items.find((i) => i.chunkId === f.itemId && i.part === f.part);
          return item ? [{ item, fraction: f.fraction }] : [];
        });
    const doneKeys = new Set(results.filter((r) => (r.fraction ?? 1) >= 1).map((r) => `${r.item.chunkId}-${r.item.part}`));
    const record: CheckInRecord = {
      answer: a.allDone ? "yes" : "no",
      at: now.toISOString(),
      items: items.map((i) => ({ title: i.title, subjectId: i.subjectId, minutes: i.minutes, done: a.allDone || doneKeys.has(`${i.chunkId}-${i.part}`) })),
    };
    chunks = applyResults(chunks, results);
    checkIns = { ...checkIns, [a.date]: record };
  }

  for (const { action: a } of changes) {
    switch (a.type) {
      case "block_days":
        blocked = [...blocked, { id: newId(), start: a.start, end: a.end, reason: a.reason, ...(a.note ? { note: a.note } : {}) } satisfies BlockedRange];
        break;
      case "unblock_days":
        blocked = blocked.flatMap((b) => {
          if (b.end < a.start || b.start > a.end) return [b];
          const kept: BlockedRange[] = [];
          if (b.start < a.start) kept.push({ ...b, end: addDays(a.start, -1) });
          if (b.end > a.end) kept.push({ ...b, id: kept.length ? newId() : b.id, start: addDays(a.end, 1) });
          return kept;
        });
        break;
      case "set_exam":
        subjects = subjects.map((s) => (s.id === a.subjectId ? { ...s, examDate: a.examDate, ...(a.examHalf ? { examHalf: a.examHalf } : {}) } : s));
        break;
      case "set_difficulty":
        subjects = subjects.map((s) => (s.id === a.subjectId ? { ...s, weight: DIFFICULTY[a.difficulty] } : s));
        break;
      case "set_week_day": {
        const week = settings.week.map((d, i) => (i === a.weekday ? ({ am: a.morning as HalfDaySessions, pm: a.afternoon as HalfDaySessions } satisfies DayPlan) : d)) as WeekPlan;
        settings = withDefaults({ ...settings, week });
        break;
      }
      case "add_items": {
        const order = Math.max(0, ...chunks.filter((c) => c.subjectId === a.subjectId).map((c) => c.order + 1));
        const added: Chunk[] = a.items.map((i, n) => ({
          id: newId(),
          subjectId: a.subjectId,
          title: i.title,
          pages: i.pages,
          slides: i.slides,
          ...(i.recordingMinutes ? { recordingMinutes: i.recordingMinutes } : {}),
          order: order + n,
        }));
        chunks = [...chunks, ...added];
        break;
      }
      case "set_progress":
        chunks = chunks.map((c) => {
          if (c.id !== a.itemId) return c;
          const done = { ...c.done };
          for (const k of a.steps ?? STEPS) done[k] = a.done;
          return { ...c, done };
        });
        break;
      case "add_subject": {
        const subject: Subject = {
          id: newId(),
          name: a.name,
          color: nextColor(subjects.map((s) => s.color)),
          weight: DIFFICULTY[a.difficulty],
          examDate: a.examDate,
        };
        subjects = [...subjects, subject];
        break;
      }
      case "set_checkin_time":
        checkInTime = a.time;
        break;
    }
  }
  return { subjects, chunks, blocked, settings, checkInTime, checkIns };
}

/** Ideas shown under the box, picked to fit the moment. */
export function suggestions(data: AppData, plan: Plan, today: ISODate): string[] {
  const list: string[] = [];
  if (checkInDates(data, plan, today).includes(today)) list.push("I did everything today");
  list.push("I'm sick today");
  if (plan.subjects.some((s) => s.deficitMinutes > 0)) list.push("What doesn't fit?");
  else list.push("Am I on track?");
  list.push("Make Saturdays free");
  return list;
}
