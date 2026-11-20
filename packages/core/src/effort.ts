import type { Chunk, ItemKind, PlannedSession, PlanItem, Settings, SlotId, StepKey, Subject } from "./types.js";
import { STEPS } from "./types.js";

/** Chapter (pages), slide deck (slides) or both. */
export function chunkKind(chunk: Chunk): Exclude<ItemKind, "anki"> {
  if (chunk.pages > 0 && chunk.slides > 0) return "mixed";
  return chunk.slides > 0 ? "slides" : "chapter";
}

export const ANKI_ITEM_PREFIX = "anki@";

export function isAnkiItem(item: PlanItem): boolean {
  return item.kind === "anki";
}

/** An Anki review item. `decks` = subject ids, most important first. */
export function ankiItem(slot: SlotId, minutes: number, decks: string[]): PlanItem {
  return {
    kind: "anki",
    chunkId: `${ANKI_ITEM_PREFIX}${slot}`,
    subjectId: "",
    baseTitle: "Anki review",
    title: "Anki review",
    part: 1,
    parts: 1,
    minutes: Math.round(minutes),
    cards: 0,
    deltas: { read: 0, summary: 0, cards: 0 },
    decks,
  };
}

/** Total length of a session: all items plus the exam review. */
export function sessionMinutes(session: PlannedSession): number {
  return session.items.reduce((sum, i) => sum + i.minutes, 0) + (session.reviewMinutes ?? 0);
}

/** Estimated Anki cards for a chunk (or the real count once entered). */
export function estimatedCards(chunk: Chunk, settings: Settings): number {
  if (chunk.cards !== undefined) return chunk.cards;
  const r = settings.rates;
  return Math.round(chunk.pages * r.cardsPerPage + chunk.slides * r.cardsPerSlide);
}

/** Full effort per step in minutes, including the subject weight. */
export function stepMinutes(
  chunk: Chunk,
  subject: Subject,
  settings: Settings,
): Record<StepKey, number> {
  const r = settings.rates;
  const w = subject.weight;
  return {
    read: (chunk.pages * r.readPerPage + chunk.slides * r.readPerSlide) * w,
    summary: (chunk.pages * r.summaryPerPage + chunk.slides * r.summaryPerSlide) * w,
    cards: estimatedCards(chunk, settings) * r.minutesPerCard * w,
  };
}

export function doneFraction(chunk: Chunk, step: StepKey): number {
  return Math.min(1, Math.max(0, chunk.done?.[step] ?? 0));
}

export function totalMinutes(chunk: Chunk, subject: Subject, settings: Settings): number {
  const s = stepMinutes(chunk, subject, settings);
  return s.read + s.summary + s.cards;
}

export function remainingMinutes(chunk: Chunk, subject: Subject, settings: Settings): number {
  const s = stepMinutes(chunk, subject, settings);
  return STEPS.reduce((sum, k) => sum + s[k] * (1 - doneFraction(chunk, k)), 0);
}

/** Anki cards that already exist for this chunk. */
export function cardsMade(chunk: Chunk, settings: Settings): number {
  return estimatedCards(chunk, settings) * doneFraction(chunk, "cards");
}

/** Biggest piece a single session can hold next to its Anki review. */
export function maxPieceMinutes(settings: Settings): number {
  return settings.sessionMinutes * (1 - settings.anki.maxShareOfSession);
}

/**
 * Splits the remaining work of a chunk into session-sized pieces.
 * A piece is limited by max pages, max slides and what fits in one session.
 */
export function splitChunk(chunk: Chunk, subject: Subject, settings: Settings): PlanItem[] {
  const full = stepMinutes(chunk, subject, settings);
  const left: Record<StepKey, number> = { read: 0, summary: 0, cards: 0 };
  for (const k of STEPS) left[k] = 1 - doneFraction(chunk, k);

  const remaining = STEPS.reduce((sum, k) => sum + full[k] * left[k], 0);
  if (remaining < 0.5) return [];

  const fullTotal = full.read + full.summary + full.cards;
  const share = fullTotal > 0 ? remaining / fullTotal : 0;
  const parts = Math.max(
    1,
    Math.ceil((chunk.pages * share) / Math.max(1, settings.maxPagesPerChunk) - 1e-9),
    Math.ceil((chunk.slides * share) / Math.max(1, settings.maxSlidesPerChunk) - 1e-9),
    Math.ceil(remaining / maxPieceMinutes(settings) - 1e-9),
  );

  const cards = estimatedCards(chunk, settings);
  const items: PlanItem[] = [];
  for (let i = 0; i < parts; i++) {
    const deltas: Record<StepKey, number> = { read: 0, summary: 0, cards: 0 };
    for (const k of STEPS) deltas[k] = left[k] / parts;
    items.push({
      kind: chunkKind(chunk),
      chunkId: chunk.id,
      subjectId: chunk.subjectId,
      baseTitle: chunk.title,
      title: parts > 1 ? `${chunk.title} (${i + 1}/${parts})` : chunk.title,
      part: i + 1,
      parts,
      minutes: remaining / parts,
      cards: (cards * left.cards) / parts,
      deltas,
    });
  }
  return items;
}

/** Minutes of Anki per day for this many existing cards (before limits). */
export function ankiMinutesPerDay(activeCards: number, settings: Settings): number {
  const a = settings.anki;
  return (activeCards * a.dueFractionPerDay * a.secondsPerReview) / 60;
}

/**
 * Anki review time at the start of each session. Grows with the number of
 * existing cards, never below the minimum and never above the max share.
 */
export function ankiMinutesPerSession(
  activeCards: number,
  sessionsThatDay: number,
  settings: Settings,
): number {
  const a = settings.anki;
  const perSession = ankiMinutesPerDay(activeCards, settings) / Math.max(1, sessionsThatDay);
  const cap = a.maxShareOfSession * settings.sessionMinutes;
  return Math.round(Math.min(cap, Math.max(a.minMinutesPerSession, perSession)));
}
