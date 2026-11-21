/**
 * Reading the user's Anki structure and numbers (desktop, AnkiConnect):
 * - follows renamed decks via Anki's deck ids,
 * - counts the cards in each chapter's deck,
 * - reads how many review cards are due per subject for the next days,
 * - finds sub-decks of linked collections that aren't linked yet.
 * Pure helpers + one `readAnki` that talks to Anki.
 */
import { addDays, type Chunk, type ISODate, type Subject } from "@studymaster/core";
import { ankiDeckIds, countCards, deckForSubject, deckSearch, ownDeck, subdecks } from "./anki";

/** Days of due counts read from Anki (today + 6). */
export const FORECAST_DAYS = 7;

export interface AnkiReading {
  /** Deck name → Anki's deck id. */
  ids: Record<string, number>;
  /** chunkId → cards in its own deck. */
  counts: Record<string, number>;
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

  const queries = [...chunkDecks.map((x) => deckSearch(x.deck)), ...subjectDecks.flatMap((x) => dueQueries(x.deck))];
  const results = await countCards(queries);

  const counts: Record<string, number> = {};
  chunkDecks.forEach((x, i) => (counts[x.id] = results[i] ?? 0));
  const due: Record<string, Record<ISODate, number>> = {};
  subjectDecks.forEach((x, k) => {
    const days: Record<ISODate, number> = {};
    for (let i = 0; i < FORECAST_DAYS; i++) days[addDays(today, i)] = results[chunkDecks.length + k * FORECAST_DAYS + i] ?? 0;
    due[x.id] = days;
  });

  const names = Object.keys(ids);
  const unlinked: Record<string, string[]> = {};
  for (const s of fixed.subjects) {
    if (!s.ankiDeck) continue;
    const used = new Set(fixed.chunks.filter((c) => c.subjectId === s.id).map((c) => c.ankiDeck));
    const free = subdecks(names, s.ankiDeck).filter((d) => !used.has(d));
    if (free.length) unlinked[s.id] = free;
  }
  return { ids, counts, due, unlinked };
}
