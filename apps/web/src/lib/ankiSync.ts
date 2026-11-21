/**
 * Reading the user's Anki structure and numbers (desktop, AnkiConnect):
 * - follows renamed decks via Anki's deck ids,
 * - counts the cards in each chapter's deck,
 * - reads how many review cards are due per subject for the next days,
 * - finds sub-decks of linked collections that aren't linked yet.
 * Pure helpers + one `readAnki` that talks to Anki.
 */
import { addDays, type Chunk, type ISODate, type Subject } from "@studymaster/core";
import { ankiDeckIds, cardSearch, countCards, deckForSubject, deckSearch, linkedDepth, newCardSearch, ownDeck, relatedDecks, subdecks } from "./anki";

/** Days of due counts read from Anki (today + 6). */
export const FORECAST_DAYS = 7;

export interface AnkiReading {
  /** Deck name → Anki's deck id. */
  ids: Record<string, number>;
  /** chunkId → cards in its own deck (not suspended). */
  counts: Record<string, number>;
  /** chunkId → cards in its own deck not studied yet. */
  newCounts: Record<string, number>;
  /** subjectId → date → review cards due. */
  due: Record<string, Record<ISODate, number>>;
  /** subjectId → sub-decks of its collection that no item is linked to. */
  unlinked: Record<string, string[]>;
}

/**
 * Updates deck names from Anki's ids (renamed decks keep their link) and
 * remembers the ids of linked decks. Returns the same arrays if nothing changed.
 */
export function reconcileDecks(
  subjects: Subject[],
  chunks: Chunk[],
  ids: Record<string, number>,
): { subjects: Subject[]; chunks: Chunk[] } {
  const nameOf = new Map(Object.entries(ids).map(([name, id]) => [id, name]));
  const fix = <T extends { ankiDeck?: string; ankiDeckId?: number }>(x: T): T => {
    if (!x.ankiDeck) return x;
    if (x.ankiDeckId !== undefined) {
      const name = nameOf.get(x.ankiDeckId);
      if (name && name !== x.ankiDeck) return { ...x, ankiDeck: name };
      return x;
    }
    const id = ids[x.ankiDeck];
    return id !== undefined ? { ...x, ankiDeckId: id } : x;
  };
  const s2 = subjects.map(fix);
  const c2 = chunks.map(fix);
  return {
    subjects: s2.some((x, i) => x !== subjects[i]) ? s2 : subjects,
    chunks: c2.some((x, i) => x !== chunks[i]) ? c2 : chunks,
  };
}

/** Anki searches for one subject deck's due reviews: today, then each next day. */
export function dueQueries(deck: string): string[] {
  const d = deckSearch(deck);
  return Array.from({ length: FORECAST_DAYS }, (_, i) => (i === 0 ? `${d} is:due` : `${d} prop:due=${i}`));
}

/**
 * Fills in how many cards each Anki deck of a draft has, and how many of them
 * are still new (one request, every level so the level can be changed).
 */
export async function withCardCounts<
  T extends {
    subjects: {
      ankiSubdecks?: string[];
      ankiDecks?: string[];
      ankiCounts?: Record<string, number>;
      ankiNewCounts?: Record<string, number>;
      chunks: { ankiDeck?: string; ankiCards?: number; ankiNew?: number }[];
      links?: { deck: string; ankiCards?: number; ankiNew?: number }[];
    }[];
  },
>(draft: T): Promise<T> {
  const decks = [
    ...new Set(
      draft.subjects
        .flatMap((s) => [...(s.ankiDecks ?? s.ankiSubdecks ?? []), ...s.chunks.map((c) => c.ankiDeck), ...(s.links ?? []).map((l) => l.deck)])
        .filter((d): d is string => !!d),
    ),
  ];
  if (decks.length === 0) return draft;
  const results = await countCards([...decks.map(cardSearch), ...decks.map(newCardSearch)]);
  const of = new Map(decks.map((d, i) => [d, results[i] ?? 0]));
  const fresh = new Map(decks.map((d, i) => [d, results[decks.length + i] ?? 0]));
  return {
    ...draft,
    subjects: draft.subjects.map((s) => {
      const own = s.ankiDecks ?? s.ankiSubdecks ?? [];
      return {
        ...s,
        ankiCounts: Object.fromEntries(own.map((d) => [d, of.get(d) ?? 0])),
        ankiNewCounts: Object.fromEntries(own.map((d) => [d, fresh.get(d) ?? 0])),
        chunks: s.chunks.map((c) => (c.ankiDeck ? { ...c, ankiCards: of.get(c.ankiDeck), ankiNew: fresh.get(c.ankiDeck) } : c)),
        links: s.links?.map((l) => ({ ...l, ankiCards: of.get(l.deck), ankiNew: fresh.get(l.deck) })),
      };
    }),
  };
}

/** Reads everything from Anki in two requests. */
export async function readAnki(subjects: Subject[], chunks: Chunk[], today: ISODate): Promise<AnkiReading> {
  const ids = await ankiDeckIds();
  const fixed = reconcileDecks(subjects, chunks, ids);
  const exists = (deck: string | undefined): deck is string => !!deck && ids[deck] !== undefined;
  const subjectById = new Map(fixed.subjects.map((s) => [s.id, s]));

  const chunkDecks = fixed.chunks
    .map((c) => ({ id: c.id, deck: subjectById.has(c.subjectId) ? ownDeck(c, subjectById.get(c.subjectId)!) : undefined }))
    .filter((x): x is { id: string; deck: string } => exists(x.deck));
  const subjectDecks = fixed.subjects.map((s) => ({ id: s.id, deck: deckForSubject(s) })).filter((x) => exists(x.deck));

  const queries = [
    ...chunkDecks.map((x) => cardSearch(x.deck)),
    ...chunkDecks.map((x) => newCardSearch(x.deck)),
    ...subjectDecks.flatMap((x) => dueQueries(x.deck)),
  ];
  const results = await countCards(queries);

  const counts: Record<string, number> = {};
  const newCounts: Record<string, number> = {};
  const n = chunkDecks.length;
  chunkDecks.forEach((x, i) => {
    counts[x.id] = results[i] ?? 0;
    newCounts[x.id] = results[n + i] ?? 0;
  });
  const due: Record<string, Record<ISODate, number>> = {};
  subjectDecks.forEach((x, k) => {
    const days: Record<ISODate, number> = {};
    for (let i = 0; i < FORECAST_DAYS; i++) days[addDays(today, i)] = results[2 * n + k * FORECAST_DAYS + i] ?? 0;
    due[x.id] = days;
  });

  const names = Object.keys(ids);
  const unlinked: Record<string, string[]> = {};
  for (const s of fixed.subjects) {
    if (!s.ankiDeck) continue;
    const used = fixed.chunks.filter((c) => c.subjectId === s.id).map((c) => c.ankiDeck).filter((d): d is string => !!d);
    // Same level as the linked decks; decks inside or around a linked one aren't "new".
    const free = subdecks(names, s.ankiDeck, linkedDepth(s.ankiDeck, used)).filter((d) => !used.some((u) => relatedDecks(u, d)));
    if (free.length) unlinked[s.id] = free;
  }
  return { ids, counts, newCounts, due, unlinked };
}
