import type { Chunk, ItemKind, PlannedSession, PlanItem, Settings, SlotId, StepKey, Subject } from "./types.js";
import { STEPS } from "./types.js";

const NO_STEPS: Record<StepKey, number> = { watch: 0, read: 0, cards: 0 };

/** Chapter (pages), slide deck (slides), both, or only a recording. */
export function chunkKind(chunk: Chunk): Exclude<ItemKind, "anki"> {
  if (chunk.pages > 0 && chunk.slides > 0) return "mixed";
  if (chunk.slides > 0) return "slides";
  if (chunk.pages > 0) return "chapter";
  return (chunk.recordingMinutes ?? 0) > 0 ? "recording" : "chapter";
}

export const ANKI_ITEM_PREFIX = "anki@";

export function isAnkiItem(item: PlanItem): boolean {
  return item.kind === "anki";
}

/**
 * Studying Anki: learning the new cards written in this session plus
 * reviewing earlier cards. `decks` = subject ids, most important first.
 */
export function ankiItem(
  slot: SlotId,
  decks: string[],
  parts: { reviewMinutes: number; learnMinutes?: number; newCards?: number },
): PlanItem {
  const learn = parts.learnMinutes ?? 0;
  const minutes = Math.round(parts.reviewMinutes + learn);
  return {
    kind: "anki",
    chunkId: `${ANKI_ITEM_PREFIX}${slot}`,
    subjectId: "",
    baseTitle: "Anki",
    title: "Anki",
    part: 1,
    parts: 1,
    minutes,
    steps: { ...NO_STEPS },
    pages: 0,
    slides: 0,
    cards: 0,
    learnMinutes: 0,
    deltas: { ...NO_STEPS },
    decks,
    anki: {
      newCards: Math.round(parts.newCards ?? 0),
      learnMinutes: Math.round(learn),
      reviewMinutes: Math.round(parts.reviewMinutes),
    },
  };
}

/** Total length of a session: all items plus the exam review. */
export function sessionMinutes(session: PlannedSession): number {
  return session.items.reduce((sum, i) => sum + i.minutes, 0) + (session.reviewMinutes ?? 0);
}

/** Room an item takes in a session: its work plus learning its new cards. */
export function itemCost(item: PlanItem): number {
  return item.minutes + item.learnMinutes;
}

/** Estimated Anki cards for a chunk (or the real count once entered). */
export function estimatedCards(chunk: Chunk, settings: Settings): number {
  if (chunk.cards !== undefined) return chunk.cards;
  const r = settings.rates;
  return Math.round(chunk.pages * r.cardsPerPage + chunk.slides * r.cardsPerSlide);
}

/** Full effort per step in minutes. Reading and writing cards include the subject weight. */
export function stepMinutes(
  chunk: Chunk,
  subject: Subject,
  settings: Settings,
): Record<StepKey, number> {
  const r = settings.rates;
  const w = subject.weight;
  return {
    watch: (chunk.recordingMinutes ?? 0) * r.recordingFactor,
    read: (chunk.pages * r.readPerPage + chunk.slides * r.readPerSlide) * w,
    cards: estimatedCards(chunk, settings) * r.minutesPerCard * w,
  };
}

export function doneFraction(chunk: Chunk, step: StepKey): number {
  return Math.min(1, Math.max(0, chunk.done?.[step] ?? 0));
}

export function totalMinutes(chunk: Chunk, subject: Subject, settings: Settings): number {
  const s = stepMinutes(chunk, subject, settings);
  return STEPS.reduce((sum, k) => sum + s[k], 0);
}

export function remainingMinutes(chunk: Chunk, subject: Subject, settings: Settings): number {
  const s = stepMinutes(chunk, subject, settings);
  return STEPS.reduce((sum, k) => sum + s[k] * (1 - doneFraction(chunk, k)), 0);
}

/** Anki cards that already exist for this chunk. */
export function cardsMade(chunk: Chunk, settings: Settings): number {
  return estimatedCards(chunk, settings) * doneFraction(chunk, "cards");
}

/** Biggest piece a single session can hold next to its Anki item. */
export function maxPieceMinutes(settings: Settings): number {
  return settings.sessionMinutes * (1 - settings.anki.maxShareOfSession);
}

/**
 * Cuts a piece in two along its step order (watch → read → cards):
 * the head takes the first `headCost` minutes of room, the tail the rest.
 */
export function cutItem(item: PlanItem, headCost: number): [PlanItem, PlanItem] {
  const head: PlanItem = { ...item, steps: { ...NO_STEPS }, deltas: { ...NO_STEPS }, minutes: 0, pages: 0, slides: 0, cards: 0, learnMinutes: 0 };
  const tail: PlanItem = { ...item, steps: { ...NO_STEPS }, deltas: { ...NO_STEPS }, minutes: 0, pages: 0, slides: 0, cards: 0, learnMinutes: 0 };
  let left = Math.max(0, headCost);
  for (const k of STEPS) {
    const cost = item.steps[k] + (k === "cards" ? item.learnMinutes : 0);
    if (cost <= 0) continue;
    const f = Math.min(1, left / cost);
    left -= cost * f;
    for (const [part, share] of [[head, f], [tail, 1 - f]] as const) {
      part.steps[k] = item.steps[k] * share;
      part.deltas[k] = item.deltas[k] * share;
      part.minutes += item.steps[k] * share;
      if (k === "read") {
        part.pages = item.pages * share;
        part.slides = item.slides * share;
      }
      if (k === "cards") {
        part.cards = item.cards * share;
        part.learnMinutes = item.learnMinutes * share;
      }
    }
  }
  return [head, tail];
}

/**
 * Splits the remaining work of a chunk into session-sized pieces, in step
 * order: e.g. piece 1 = watch + start reading, piece 2 = finish reading +
 * write cards. A piece is limited by max pages, max slides and what fits in
 * one session.
 */
export function splitChunk(chunk: Chunk, subject: Subject, settings: Settings): PlanItem[] {
  const full = stepMinutes(chunk, subject, settings);
  const cards = estimatedCards(chunk, settings);
  const left: Record<StepKey, number> = { ...NO_STEPS };
  for (const k of STEPS) left[k] = 1 - doneFraction(chunk, k);

  const steps: Record<StepKey, number> = { ...NO_STEPS };
  for (const k of STEPS) steps[k] = full[k] * left[k];
  const work = STEPS.reduce((sum, k) => sum + steps[k], 0);
  if (work < 0.5) return [];

  const whole: PlanItem = {
    kind: chunkKind(chunk),
    chunkId: chunk.id,
    subjectId: chunk.subjectId,
    baseTitle: chunk.title,
    title: chunk.title,
    part: 1,
    parts: 1,
    minutes: work,
    steps,
    pages: chunk.pages * left.read,
    slides: chunk.slides * left.read,
    cards: cards * left.cards,
    learnMinutes: (cards * left.cards * settings.anki.secondsPerNewCard) / 60,
    deltas: left,
  };

  const parts = Math.max(
    1,
    Math.ceil(whole.pages / Math.max(1, settings.maxPagesPerChunk) - 1e-9),
    Math.ceil(whole.slides / Math.max(1, settings.maxSlidesPerChunk) - 1e-9),
    Math.ceil(itemCost(whole) / maxPieceMinutes(settings) - 1e-9),
  );

  const items: PlanItem[] = [];
  let rest = whole;
  for (let i = 0; i < parts - 1; i++) {
    const [head, tail] = cutItem(rest, itemCost(whole) / parts);
    items.push(head);
    rest = tail;
  }
  items.push(rest);
  return items.map((item, i) => ({
    ...item,
    part: i + 1,
    parts,
    title: parts > 1 ? `${chunk.title} (${i + 1}/${parts})` : chunk.title,
  }));
}

/** Minutes of Anki reviews per day for this many existing cards (before limits). */
export function ankiMinutesPerDay(activeCards: number, settings: Settings): number {
  const a = settings.anki;
  return (activeCards * a.dueFractionPerDay * a.secondsPerReview) / 60;
}

/**
 * Review time (earlier cards) reserved in each session. Grows with the number
 * of existing cards, never below the minimum and never above the max share.
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
