import { addDays, eachDay, isWithin, weekKey, weekday, type ISODate } from "./dates.js";
import type { DayPlan, Half, Settings, Slot, SlotId, StudyState } from "./types.js";

export const SLOT_ORDER: readonly SlotId[] = ["am1", "am2", "pm1", "pm2"];

/** The sessions of a normal day, e.g. { am: 0, pm: 2 } → pm1, pm2. */
export function normalSlots(day: DayPlan): SlotId[] {
  const out: SlotId[] = [];
  if (day.am >= 1) out.push("am1");
  if (day.am >= 2) out.push("am2");
  if (day.pm >= 1) out.push("pm1");
  if (day.pm >= 2) out.push("pm2");
  return out;
}

/**
 * Slots that may be added on a busy day (with approval), closest to the
 * normal sessions first. Days without any normal session get none.
 */
export function extraSlots(day: DayPlan, maxSessions: number): SlotId[] {
  const normal = normalSlots(day);
  if (normal.length === 0) return [];
  const pos = (x: SlotId) => SLOT_ORDER.indexOf(x);
  const distance = (x: SlotId) => Math.min(...normal.map((n) => Math.abs(pos(n) - pos(x))));
  return SLOT_ORDER.filter((x) => !normal.includes(x))
    .sort((a, b) => distance(a) - distance(b) || pos(a) - pos(b))
    .slice(0, Math.max(0, maxSessions - normal.length));
}

/** Normal sessions in a week. */
export function sessionsPerWeek(settings: Settings): number {
  return settings.week.reduce((sum, d) => sum + d.am + d.pm, 0);
}

/** Whether any study day allows extra sessions. */
export function allowsExtraSessions(settings: Settings): boolean {
  return settings.week.some((d) => extraSlots(d, settings.maxSessionsPerDay).length > 0);
}

export function halfOf(slot: SlotId): Half {
  return slot.startsWith("am") ? "am" : "pm";
}

/** Sortable position of a slot in time. */
export function slotKey(date: ISODate, slot: SlotId): string {
  return `${date}#${SLOT_ORDER.indexOf(slot)}`;
}

export function isBlocked(state: StudyState, date: ISODate): boolean {
  return state.blocked.some((b) => isWithin(date, b.start, b.end));
}

/**
 * All study slots from `from` to `to` (inclusive), in time order.
 * Normal slots come from the weekly plan; free days and half-days have none.
 * Blocked days have no slots. Exam halves are removed. Extra slots (up to
 * max sessions per day, only on study days) are marked "extra". One
 * half-day per week becomes "buffer".
 */
export function buildSlotGrid(state: StudyState, from: ISODate, to: ISODate): Slot[] {
  const s = state.settings;

  const grid: Slot[] = [];
  if (to < from) return grid;

  for (const date of eachDay(from, to)) {
    if (isBlocked(state, date)) continue;
    const examHalves = new Set(
      state.subjects.filter((x) => x.examDate === date).map((x) => x.examHalf ?? "am"),
    );
    const day = s.week[weekday(date)]!;
    const normal = normalSlots(day);
    const extra = extraSlots(day, s.maxSessionsPerDay);
    for (const slot of SLOT_ORDER) {
      if (!normal.includes(slot) && !extra.includes(slot)) continue;
      if (examHalves.has(halfOf(slot))) continue;
      grid.push({ date, slot, kind: normal.includes(slot) ? "normal" : "extra" });
    }
  }

  if (s.weeklyBuffer.enabled) markWeeklyBuffer(state, grid);
  return grid;
}

function markWeeklyBuffer(state: StudyState, grid: Slot[]): void {
  const when = state.settings.weeklyBuffer.when;
  // In auto mode, keep exam days and the day before an exam free for reviews.
  const nearExam = new Set<ISODate>();
  for (const subject of state.subjects) {
    nearExam.add(subject.examDate);
    nearExam.add(addDays(subject.examDate, -1));
  }
  const weeks = new Map<number, Slot[]>();
  for (const slot of grid) {
    const key = weekKey(slot.date);
    let list = weeks.get(key);
    if (!list) weeks.set(key, (list = []));
    list.push(slot);
  }

  for (const slots of weeks.values()) {
    const normal = slots.filter((x) => x.kind === "normal");
    if (normal.length === 0) continue;

    let day: ISODate | undefined;
    let half: Half;
    if (when === "auto") {
      const calm = normal.filter((x) => !nearExam.has(x.date));
      const pool = calm.length > 0 ? calm : normal;
      day = pool[pool.length - 1]!.date;
      half = "pm";
    } else {
      day = normal.find((x) => weekday(x.date) === when.weekday)?.date;
      half = when.half;
    }
    if (!day) continue;

    const ofDay = normal.filter((x) => x.date === day);
    const inHalf = ofDay.filter((x) => halfOf(x.slot) === half);
    for (const slot of inHalf.length > 0 ? inHalf : ofDay) slot.kind = "buffer";
  }
}
