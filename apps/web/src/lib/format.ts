import { daysBetween, type ISODate, type SlotId } from "@studymaster/core";

/** Today's date in the user's own timezone. */
export function todayISO(now = new Date()): ISODate {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function asDate(date: ISODate): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}

const LOCALE = "en-GB";

export function formatDay(date: ISODate): string {
  return asDate(date).toLocaleDateString(LOCALE, { weekday: "short", day: "numeric", month: "short" });
}

export function formatLongDay(date: ISODate): string {
  return asDate(date).toLocaleDateString(LOCALE, { weekday: "long", day: "numeric", month: "long" });
}

export function formatShort(date: ISODate): string {
  return asDate(date).toLocaleDateString(LOCALE, { day: "numeric", month: "short" });
}

export function weekdayShort(date: ISODate): string {
  return asDate(date).toLocaleDateString(LOCALE, { weekday: "short" });
}

/** "today", "tomorrow", "in 5 days", "3 days ago" */
export function relativeDays(from: ISODate, to: ISODate): string {
  const n = daysBetween(from, to);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

export function formatMinutes(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h} h` : `${h} h ${rest} min`;
}

export function formatHours(minutes: number): string {
  return `${Math.round((minutes / 60) * 10) / 10} h`;
}

export const SLOT_LABEL: Record<SlotId, string> = {
  am1: "Morning 1",
  am2: "Morning 2",
  pm1: "Afternoon 1",
  pm2: "Afternoon 2",
};

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
