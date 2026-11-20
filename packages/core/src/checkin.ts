import type { ISODate } from "./dates.js";
import { STEPS, type Chunk, type Plan, type PlanItem, type StepKey } from "./types.js";

/** What happened with one planned piece. */
export interface ItemResult {
  item: PlanItem;
  /** Only these steps were done (e.g. read but no cards yet). Default: all. */
  steps?: StepKey[];
  /** Share of the piece that was done, 0–1. Default: 1. */
  fraction?: number;
}

/** A piece the user did finish on a "no" day. */
export interface FinishedEntry {
  chunkId: string;
  part: number;
  steps?: StepKey[];
  fraction?: number;
}

/** All study pieces planned on a date. */
export function itemsForDate(plan: Plan, date: ISODate): PlanItem[] {
  return plan.sessions.filter((x) => x.date === date).flatMap((x) => x.items);
}

/** Adds finished work to the chunks. Returns new chunk objects; the input is not changed. */
export function applyResults(chunks: Chunk[], results: ItemResult[]): Chunk[] {
  const byId = new Map(chunks.map((c) => [c.id, c]));
  const changed = new Map<string, Chunk & { done: Partial<Record<StepKey, number>> }>();
  for (const result of results) {
    // Anki items don't change chunk progress; they're only recorded.
    if (result.item.kind === "anki") continue;
    const original = byId.get(result.item.chunkId);
    if (!original) continue;
    let chunk = changed.get(original.id);
    if (!chunk) changed.set(original.id, (chunk = { ...original, done: { ...original.done } }));
    const fraction = Math.min(1, Math.max(0, result.fraction ?? 1));
    for (const step of result.steps ?? STEPS) {
      const next = (chunk.done[step] ?? 0) + result.item.deltas[step] * fraction;
      chunk.done[step] = next > 0.999 ? 1 : Math.min(1, next);
    }
  }
  return chunks.map((c) => changed.get(c.id) ?? c);
}

/**
 * The end-of-day check-in.
 * "yes" → everything planned that day is done.
 * "no"  → only what is listed in `finished` (default: nothing) is done.
 * Afterwards, plan again from the next day with planWithEscalation().
 */
export function checkInDay(
  chunks: Chunk[],
  plan: Plan,
  date: ISODate,
  answer: "yes" | "no",
  finished: FinishedEntry[] = [],
): Chunk[] {
  const items = itemsForDate(plan, date);
  if (answer === "yes") return applyResults(chunks, items.map((item) => ({ item })));

  const results: ItemResult[] = [];
  for (const entry of finished) {
    const item = items.find((x) => x.chunkId === entry.chunkId && x.part === entry.part);
    if (item) results.push({ item, steps: entry.steps, fraction: entry.fraction });
  }
  return applyResults(chunks, results);
}

/** Store the real number of Anki cards made for a chunk. */
export function setCardsMade(chunks: Chunk[], chunkId: string, cards: number): Chunk[] {
  return chunks.map((c) => (c.id === chunkId ? { ...c, cards: Math.max(0, Math.round(cards)) } : c));
}
