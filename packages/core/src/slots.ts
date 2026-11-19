import { addDays, eachDay, isWithin, weekKey, weekday, type ISODate } from "./dates.js";
import type { Half, SessionCount, Slot, SlotId, StudyState } from "./types.js";

export const SLOT_ORDER: readonly SlotId[] = ["am1", "am2", "pm1", "pm2"];

const SLOTS_FOR_COUNT: Record<SessionCount, SlotId[]> = {
  1: ["am1"],
  2: ["am1", "pm1"],
  3: ["am1", "am2", "pm1"],
  4: ["am1", "am2", "pm1", "pm2"],
};

export function slotsForCount(count: SessionCount): SlotId[] {
  return SLOTS_FOR_COUNT[count];
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
 * Blocked days have no slots. Exam halves are removed. Slots above the
 * preferred count are "extra". One half-day per week becomes "buffer".
 */
export function buildSlotGrid(state: StudyState, from: ISODate, to: ISODate): Slot[] {
  const s = state.settings;
  const preferred = slotsForCount(s.preferredSessionsPerDay);
  const all = slotsForCount(
    Math.max(s.preferredSessionsPerDay, s.maxSessionsPerDay) as SessionCount,
  );

  const grid: Slot[] = [];
  if (to < from) return grid;

  for (const date of eachDay(from, to)) {
    if (isBlocked(state, date)) continue;
    const examHalves = new Set(
      state.subjects.filter((x) => x.examDate === date).map((x) => x.examHalf ?? "am"),
    );
    for (const slot of all) {
      if (examHalves.has(halfOf(slot))) continue;
      grid.push({ date, slot, kind: preferred.includes(slot) ? "normal" : "extra" });
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
