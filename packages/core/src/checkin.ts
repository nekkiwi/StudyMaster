import type { ISODate } from "./dates.js";
import { guessedCards } from "./effort.js";
import { STEPS, type Chunk, type Plan, type PlanItem, type Settings, type StepKey } from "./types.js";

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

/**
 * Takes the card counts read from Anki (chunkId → cards in its linked deck)
 * into the chunks: stores them, and moves "write cards" forward to the share
 * of the expected cards that exist (only when pages or slides are known). Once all expected cards exist, the
 * earlier steps (watch, read) count as done too. Progress never goes back.
 * Returns the same array if nothing changed.
 */
export function applyAnkiCounts(chunks: Chunk[], counts: Record<string, number>, settings: Settings): Chunk[] {
  let changed = false;
  const out = chunks.map((chunk) => {
    const n = counts[chunk.id];
    if (n === undefined) return chunk;
    const expected = chunk.cards ?? guessedCards(chunk, settings);
    // Without pages/slides there's nothing to compare with (e.g. a shared
    // deck imported from Anki) – keep the count, don't guess progress.
    const share = n <= 0 || expected <= 0 ? 0 : Math.min(1, n / expected);
    const done = { ...chunk.done };
    if (share > (done.cards ?? 0) + 1e-9) done.cards = share > 0.999 ? 1 : share;
    if ((done.cards ?? 0) >= 1) {
      done.watch = 1;
      done.read = 1;
    }
    const same =
      chunk.ankiCards === n && STEPS.every((k) => (chunk.done?.[k] ?? 0) === (done[k] ?? 0));
    if (same) return chunk;
    changed = true;
    return { ...chunk, ankiCards: n, done };
  });
  return changed ? out : chunks;
}
