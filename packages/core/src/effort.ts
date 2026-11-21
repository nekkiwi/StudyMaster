import type { Chunk, ItemKind, PlannedSession, PlanItem, Settings, SlotId, StepKey, Subject } from "./types.js";
import { STEPS } from "./types.js";

const NO_STEPS: Record<StepKey, number> = { watch: 0, read: 0, summary: 0, cards: 0, revise: 0 };

/** The chunk steps of the study style, in its order. */
export function workSteps(settings: Settings): StepKey[] {
  return settings.workflow.filter((a): a is StepKey => a !== "anki");
}

/** Whether the study style includes studying Anki. */
export function usesAnki(settings: Settings): boolean {
  return settings.workflow.includes("anki");
}

/** Anki goes first in a session when it comes before every chunk step. */
export function ankiFirst(settings: Settings): boolean {
  const anki = settings.workflow.indexOf("anki");
  const work = settings.workflow.findIndex((a) => a !== "anki");
  return anki >= 0 && (work < 0 || anki < work);
}

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
  parts: {
    reviewMinutes: number;
    learnMinutes?: number;
    newCards?: number;
    lectures?: { chunkId: string; subjectId: string; title: string }[];
  },
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
    ankiNew: 0,
    learnMinutes: 0,
    deltas: { ...NO_STEPS },
    decks,
    anki: {
      newCards: Math.round(parts.newCards ?? 0),
      learnMinutes: Math.round(learn),
      reviewMinutes: Math.round(parts.reviewMinutes),
      lectures: parts.lectures ?? [],
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

/** Cards a chunk should get, from pages and slides only. */
export function guessedCards(chunk: Chunk, settings: Settings): number {
  const r = settings.rates;
  return Math.round(chunk.pages * r.cardsPerPage + chunk.slides * r.cardsPerSlide);
}

/**
 * Anki cards for a chunk: the count entered by hand, else the guess – or
 * more, if Anki already has more cards in the linked deck.
 */
export function estimatedCards(chunk: Chunk, settings: Settings): number {
  if (chunk.cards !== undefined) return chunk.cards;
  return Math.max(guessedCards(chunk, settings), chunk.ankiCards ?? 0);
}

/**
 * Cards the user writes for this chunk: as estimated, except for cards that
 * came ready-made in a deck with no pages or slides to write them from.
 */
function cardsToWrite(chunk: Chunk, settings: Settings): number {
  if (chunk.cards === undefined && guessedCards(chunk, settings) <= 0) return 0;
  return estimatedCards(chunk, settings);
}

/**
 * Full effort per step in minutes; steps that aren't part of the study style
 * count 0. Everything except watching includes the subject weight.
 */
export function stepMinutes(
  chunk: Chunk,
  subject: Subject,
  settings: Settings,
): Record<StepKey, number> {
  const r = settings.rates;
  const w = subject.weight;
  const on = new Set(workSteps(settings));
  const per = (page: number, slide: number) => (chunk.pages * page + chunk.slides * slide) * w;
  return {
    watch: on.has("watch") ? (chunk.recordingMinutes ?? 0) * r.recordingFactor : 0,
    read: on.has("read") ? per(r.readPerPage, r.readPerSlide) : 0,
    summary: on.has("summary") ? per(r.summaryPerPage, r.summaryPerSlide) : 0,
    cards: on.has("cards") ? cardsToWrite(chunk, settings) * r.minutesPerCard * w : 0,
    revise: on.has("revise") ? per(r.revisePerPage, r.revisePerSlide) : 0,
  };
}

export function doneFraction(chunk: Chunk, step: StepKey): number {
  return Math.min(1, Math.max(0, chunk.done?.[step] ?? 0));
}

/** Minutes to learn this many new cards (all their first repetitions). */
export function learnCardMinutes(cards: number, settings: Settings): number {
  return (Math.max(0, cards) * settings.anki.secondsPerNewCard) / 60;
}

/**
 * Learning the cards that are already in the linked deck (read from Anki):
 * all of them in total, the still-new ones remaining. Only with Anki in the
 * study style.
 */
function deckLearnMinutes(chunk: Chunk, settings: Settings): { total: number; left: number } {
  if (!usesAnki(settings) || (chunk.ankiCards === undefined && chunk.ankiNew === undefined)) return { total: 0, left: 0 };
  const left = Math.max(0, chunk.ankiNew ?? 0);
  return { total: learnCardMinutes(Math.max(chunk.ankiCards ?? 0, left), settings), left: learnCardMinutes(left, settings) };
}

export function totalMinutes(chunk: Chunk, subject: Subject, settings: Settings): number {
  const s = stepMinutes(chunk, subject, settings);
  return STEPS.reduce((sum, k) => sum + s[k], 0) + deckLearnMinutes(chunk, settings).total;
}

export function remainingMinutes(chunk: Chunk, subject: Subject, settings: Settings): number {
  const s = stepMinutes(chunk, subject, settings);
  return STEPS.reduce((sum, k) => sum + s[k] * (1 - doneFraction(chunk, k)), 0) + deckLearnMinutes(chunk, settings).left;
}

/** Anki cards that already exist for this chunk (the real count from Anki if known). */
export function cardsMade(chunk: Chunk, settings: Settings): number {
  if (chunk.ankiCards !== undefined) return chunk.ankiCards;
  return estimatedCards(chunk, settings) * doneFraction(chunk, "cards");
}

/** Existing cards that are already being studied (made, minus Anki's still-new ones). */
export function activeCards(chunk: Chunk, settings: Settings): number {
  return Math.max(0, cardsMade(chunk, settings) - (chunk.ankiNew ?? 0));
}

/** Biggest piece a single session can hold next to its Anki item. */
export function maxPieceMinutes(settings: Settings): number {
  return settings.sessionMinutes * (1 - settings.anki.maxShareOfSession);
}

/**
 * Cuts a piece in two along its step order (the study style's order):
 * the head takes the first `headCost` minutes of room, the tail the rest.
 */
export function cutItem(item: PlanItem, headCost: number, order: readonly StepKey[] = STEPS): [PlanItem, PlanItem] {
  const empty = { steps: { ...NO_STEPS }, deltas: { ...NO_STEPS }, minutes: 0, pages: 0, slides: 0, cards: 0, ankiNew: 0, learnMinutes: 0 };
  const head: PlanItem = { ...item, ...empty, steps: { ...NO_STEPS }, deltas: { ...NO_STEPS } };
  const tail: PlanItem = { ...item, ...empty, steps: { ...NO_STEPS }, deltas: { ...NO_STEPS } };
  // Learning time: the cards written here go with "make cards", the cards
  // already in the deck come last.
  const allCards = item.cards + item.ankiNew;
  const writtenLearn = allCards > 0 ? (item.learnMinutes * item.cards) / allCards : 0;
  const deckLearn = item.learnMinutes - writtenLearn;
  let left = Math.max(0, headCost);
  for (const k of order) {
    const cost = item.steps[k] + (k === "cards" ? writtenLearn : 0);
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
        part.learnMinutes += writtenLearn * share;
      }
    }
  }
  if (deckLearn > 0) {
    const f = Math.min(1, left / deckLearn);
    for (const [part, share] of [[head, f], [tail, 1 - f]] as const) {
      part.ankiNew = item.ankiNew * share;
      part.learnMinutes += deckLearn * share;
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
  // Learning: the cards still to write (when Anki is studied) plus the cards
  // already in the deck that are still new (e.g. a ready-made deck).
  const writeCards = steps.cards > 0 ? cards * left.cards : 0;
  const deckNew = usesAnki(settings) ? Math.max(0, chunk.ankiNew ?? 0) : 0;
  const learn = usesAnki(settings) ? learnCardMinutes(writeCards + deckNew, settings) : 0;
  if (work + learn < 0.5) return [];

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
    cards: writeCards,
    ankiNew: deckNew,
    // Learning the new cards is reserved with the piece – only when Anki is studied.
    learnMinutes: learn,
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
    const [head, tail] = cutItem(rest, itemCost(whole) / parts, workSteps(settings));
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
  return sessionShare(ankiMinutesPerDay(activeCards, settings), sessionsThatDay, settings);
}

/** A day's review minutes split over its sessions, between the minimum and the max share. */
export function sessionShare(dayMinutes: number, sessionsThatDay: number, settings: Settings): number {
  const a = settings.anki;
  const perSession = dayMinutes / Math.max(1, sessionsThatDay);
  const cap = a.maxShareOfSession * settings.sessionMinutes;
  return Math.round(Math.min(cap, Math.max(a.minMinutesPerSession, perSession)));
}

/** Minutes to review this many due cards. */
export function dueReviewMinutes(dueCards: number, settings: Settings): number {
  return (dueCards * settings.anki.secondsPerReview) / 60;
}
