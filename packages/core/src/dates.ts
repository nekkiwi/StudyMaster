/**
 * Tiny, timezone-safe date helpers. All dates are plain ISO calendar dates
 * ("YYYY-MM-DD") and all arithmetic happens on UTC day numbers, so DST and
 * the user's local timezone can never shift a day.
 */
export type ISODate = string;

const MS_PER_DAY = 86_400_000;
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(value: string): boolean {
  if (!ISO_RE.test(value)) return false;
  return fromDayNumber(toDayNumber(value)) === value;
}

export function toDayNumber(date: ISODate): number {
  const [y, m, d] = date.split("-").map(Number);
  return Math.floor(Date.UTC(y!, m! - 1, d!) / MS_PER_DAY);
}

export function fromDayNumber(day: number): ISODate {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromDayNumber(toDayNumber(date) + days);
}

/** 0 = Sunday … 6 = Saturday (same as Date#getDay). */
export function weekday(date: ISODate): number {
  return new Date(toDayNumber(date) * MS_PER_DAY).getUTCDay();
}

/** Day number of the Monday that starts this date's week. */
export function weekKey(date: ISODate): number {
  const n = toDayNumber(date);
  return n - ((weekday(date) + 6) % 7);
}

export function daysBetween(from: ISODate, to: ISODate): number {
  return toDayNumber(to) - toDayNumber(from);
}

export function isWithin(date: ISODate, start: ISODate, end: ISODate): boolean {
  return date >= start && date <= end;
}

/** Every date from `start` to `end`, both inclusive. */
export function eachDay(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let n = toDayNumber(start), last = toDayNumber(end); n <= last; n++) {
    out.push(fromDayNumber(n));
  }
  return out;
}
