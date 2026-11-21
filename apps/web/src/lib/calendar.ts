/**
 * Calendars and timetables: classes from a university calendar (ICS link or
 * file) or from a timetable read by AI become busy times the planner goes
 * around. Recurring events are expanded for the planning period.
 */
import { addDays, type BusyTime, type ISODate } from "@studymaster/core";

export interface CalendarSource {
  id: string;
  name: string;
  /** Where the events come from. */
  kind: "link" | "file" | "timetable" | "google";
  /** Google Calendar: the calendar's id (connected via Google sign-in). */
  googleId?: string;
  /** ICS link (Google "secret address", Outlook "publish", iCloud, university portal). */
  url?: string;
  /** University calendar (classes) – shown as such; blocks study time by default. */
  university: boolean;
  /** Plan around these events. */
  block: boolean;
  /** When the events were last read (ISO timestamp). */
  updatedAt: string;
  /** Timetables read by AI: the weekly classes, to repeat them when the plan grows. */
  classes?: WeeklyClass[];
  /** Timetables: classes only between these days (semester), if known. */
  classesFrom?: ISODate;
  classesUntil?: ISODate;
}

/** One event on one day, local time. */
export type CalEvent = BusyTime & { title: string };

/** "15:30" → 930. */
export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
/** 930 → "15:30". */
export const toClock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

const pad = (n: number) => String(n).padStart(2, "0");
const localDate = (d: Date): ISODate => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localMinutes = (d: Date) => d.getHours() * 60 + d.getMinutes();

/** Splits an event that runs past midnight into one entry per day (all-day events are skipped). */
export function toDays(title: string, start: Date, end: Date, from: ISODate, to: ISODate): CalEvent[] {
  const out: CalEvent[] = [];
  let day = localDate(start);
  const last = localDate(end);
  for (let guard = 0; day <= last && guard < 14; guard++, day = addDays(day, 1)) {
    const s = day === localDate(start) ? localMinutes(start) : 0;
    const e = day === last ? localMinutes(end) : 24 * 60;
    if (e > s && day >= from && day <= to) out.push({ date: day, start: s, end: e, title });
  }
  return out;
}

/**
 * Events from an ICS calendar between `from` and `to` (inclusive), with
 * repeating events (weekly lectures, holidays left out) expanded. All-day
 * events are skipped: they usually aren't classes (holidays, deadlines).
 */
export async function parseIcs(text: string, from: ISODate, to: ISODate): Promise<CalEvent[]> {
  const ICAL = (await import("ical.js")).default;
  const root = new ICAL.Component(ICAL.parse(text));
  for (const tz of root.getAllSubcomponents("vtimezone")) ICAL.TimezoneService.register(tz);
  const rangeStart = new Date(`${from}T00:00:00`);
  const rangeEnd = new Date(`${addDays(to, 1)}T00:00:00`);
  const out: CalEvent[] = [];
  const overrides = new Set<string>();

  for (const vevent of root.getAllSubcomponents("vevent")) {
    const event = new ICAL.Event(vevent);
    if (!event.startDate || event.startDate.isDate) continue; // all-day
    if (event.isRecurrenceException()) overrides.add(`${event.uid}|${event.recurrenceId?.toString()}`);
  }

  for (const vevent of root.getAllSubcomponents("vevent")) {
    const event = new ICAL.Event(vevent);
    if (!event.startDate || event.startDate.isDate) continue;
    if (String(vevent.getFirstPropertyValue("status") ?? "").toUpperCase() === "CANCELLED") continue;
    const title = event.summary || "Busy";
    if (!event.isRecurring()) {
      const s = event.startDate.toJSDate();
      const e = event.endDate.toJSDate();
      if (e > rangeStart && s < rangeEnd) out.push(...toDays(title, s, e, from, to));
      continue;
    }
    const it = event.iterator();
    for (let next = it.next(), n = 0; next && n < 2000; next = it.next(), n++) {
      const occ = event.getOccurrenceDetails(next);
      const s = occ.startDate.toJSDate();
      if (s >= rangeEnd) break;
      // Moved or cancelled single dates are separate events (RECURRENCE-ID).
      if (overrides.has(`${event.uid}|${next.toString()}`)) continue;
      const e = occ.endDate.toJSDate();
      if (e > rangeStart) out.push(...toDays(title, s, e, from, to));
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
}

/** A weekly class as read from a timetable (PDF, photo) by the AI. */
export interface WeeklyClass {
  /** 1 = Monday … 7 = Sunday. */
  weekday: number;
  start: string;
  end: string;
  title: string;
  /** Every week, or only odd / even calendar weeks. */
  weeks: "all" | "odd" | "even";
}

/** ISO week number (for odd/even-week classes). */
function isoWeek(date: ISODate): number {
  const d = new Date(`${date}T12:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}

/** Weekly classes → events on every matching day between `from` and `to`. */
export function weeklyToEvents(classes: WeeklyClass[], from: ISODate, to: ISODate): CalEvent[] {
  const out: CalEvent[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const wd = ((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
    const week = isoWeek(day);
    for (const c of classes) {
      if (c.weekday !== wd) continue;
      if ((c.weeks === "odd" && week % 2 === 0) || (c.weeks === "even" && week % 2 === 1)) continue;
      const s = toMinutes(c.start);
      const e = toMinutes(c.end);
      if (e > s) out.push({ date: day, start: s, end: e, title: c.title || "Class" });
    }
  }
  return out;
}

/** Busy times of all calendars that block study time. */
export function busyTimes(sources: CalendarSource[], events: Record<string, CalEvent[]>): BusyTime[] {
  return sources.filter((s) => s.block).flatMap((s) => events[s.id] ?? []);
}

/** Period to read calendars for: from a week ago until a while after the last exam. */
export function calendarRange(today: ISODate, lastExam: ISODate | undefined): { from: ISODate; to: ISODate } {
  const to = lastExam && lastExam > today ? addDays(lastExam, 14) : addDays(today, 120);
  return { from: addDays(today, -7), to };
}

/** An event as the Google Calendar API returns it (the parts we use). */
export interface GoogleEvent {
  summary?: string;
  status?: string;
  transparency?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

/**
 * Google Calendar events → busy times. All-day events, cancelled events and
 * events marked "free" (transparent) are skipped. Times are shown locally.
 */
export function googleToEvents(items: GoogleEvent[], from: ISODate, to: ISODate): CalEvent[] {
  const out: CalEvent[] = [];
  for (const e of items) {
    if (e.status === "cancelled" || e.transparency === "transparent") continue;
    if (!e.start?.dateTime || !e.end?.dateTime) continue;
    out.push(...toDays(e.summary || "Busy", new Date(e.start.dateTime), new Date(e.end.dateTime), from, to));
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
}
