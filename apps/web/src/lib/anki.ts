/**
 * Talking to Anki.
 *
 * Desktop: the free AnkiConnect add-on (code 2055492159) runs a small server
 * on 127.0.0.1:8765 while Anki is open. The first call asks for permission:
 * Anki shows an "allow this website?" popup. After that we can read decks,
 * create the Subject::Lecture structure and open review of an exact deck.
 *
 * Phones: a web page can only open the Anki app (see openAnkiOnPhone).
 *  - AnkiDroid only opens a specific deck for installed apps, not for links.
 *  - AnkiMobile 25.07+ is reported to support anki://x-callback-url/study?deck=…
 *    (not verified against the official docs – test on a device).
 */

const ANKI_CONNECT_URL = "http://127.0.0.1:8765";
const VERSION = 6;

export type Platform = "android" | "ios" | "desktop";

export function detectPlatform(userAgent = typeof navigator !== "undefined" ? navigator.userAgent : ""): Platform {
  if (/android/i.test(userAgent)) return "android";
  if (/iphone|ipad|ipod/i.test(userAgent) || (/macintosh/i.test(userAgent) && typeof document !== "undefined" && "ontouchend" in document)) {
    return "ios";
  }
  return "desktop";
}

/** Deck names used by StudyMaster: "Biology" and "Biology::Lecture 3". */
export function deckName(subjectName: string, chunkTitle?: string): string {
  const clean = (s: string) => s.replace(/::/g, " – ").replace(/"/g, "'").trim();
  return chunkTitle ? `${clean(subjectName)}::${clean(chunkTitle)}` : clean(subjectName);
}

export class AnkiConnectError extends Error {}

async function call<T>(action: string, params?: Record<string, unknown>, timeoutMs = 4000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(ANKI_CONNECT_URL, {
      method: "POST",
      body: JSON.stringify({ action, version: VERSION, ...(params ? { params } : {}) }),
      signal: controller.signal,
    });
  } catch {
    throw new AnkiConnectError("Anki isn't reachable. Is Anki open with the AnkiConnect add-on installed?");
  } finally {
    clearTimeout(timer);
  }
  const body = (await response.json()) as { result: T; error: string | null };
  if (body.error) throw new AnkiConnectError(body.error);
  return body.result;
}

/**
 * Asks Anki for access. Anki shows a popup the first time; returns whether
 * this website may use AnkiConnect. Waits up to 2 minutes for the answer.
 */
export async function requestAnkiPermission(): Promise<boolean> {
  const result = await call<{ permission: "granted" | "denied" }>("requestPermission", undefined, 120_000);
  return result.permission === "granted";
}

export function ankiDeckNames(): Promise<string[]> {
  return call<string[]>("deckNames");
}

export async function createAnkiDecks(names: string[]): Promise<number> {
  const existing = new Set(await ankiDeckNames());
  const missing = names.filter((n) => !existing.has(n));
  for (const name of missing) await call<number>("createDeck", { deck: name });
  return missing.length;
}

/** Opens Anki desktop's review screen for this deck. */
export async function openDeckOnDesktop(name: string): Promise<void> {
  await call<boolean>("guiDeckReview", { name });
}

/** Cards due today per deck (new + learning + review), from AnkiConnect. */
export async function dueCounts(names: string[]): Promise<Record<string, number>> {
  const stats = await call<Record<string, { name: string; new_count: number; learn_count: number; review_count: number }>>(
    "getDeckStats",
    { decks: names },
  );
  const out: Record<string, number> = {};
  for (const s of Object.values(stats)) out[s.name] = s.new_count + s.learn_count + s.review_count;
  return out;
}

/** Link that opens Anki on a phone (the deck only where the app supports it). */
export function phoneAnkiLink(platform: Exclude<Platform, "desktop">, deck: string): string {
  if (platform === "ios") return `anki://x-callback-url/study?deck=${encodeURIComponent(deck)}`;
  // Opens AnkiDroid (or its Play Store page if it isn't installed).
  return "intent://#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=com.ichi2.anki;end";
}

export const ANKIWEB_DECKS_URL = "https://ankiweb.net/decks";

/**
 * Subjects and lectures from Anki deck names: "Biology::Lecture 3" → subject
 * "Biology", lecture "Lecture 3". Top-level decks without children become
 * subjects without lectures. "Default" and filtered/custom study decks are skipped.
 */
export function structureFromDecks(names: string[]): { subject: string; lectures: string[] }[] {
  const map = new Map<string, string[]>();
  for (const full of names) {
    const parts = full.split("::").map((p) => p.trim()).filter(Boolean);
    const top = parts[0];
    if (!top || /^default$/i.test(top) || /^(custom study session|filtered deck)/i.test(top)) continue;
    let list = map.get(top);
    if (!list) map.set(top, (list = []));
    // Only the second level counts: "Biology::Lecture 3::Extra" is still Lecture 3.
    const lecture = parts[1];
    if (lecture && !list.includes(lecture)) list.push(lecture);
  }
  return [...map.entries()].map(([subject, lectures]) => ({ subject, lectures }));
}

/** Top-level decks ("collections"), without Default and filtered decks. */
export function collections(names: string[]): string[] {
  return [...new Set(structureFromDecks(names).map((s) => s.subject))].sort((a, b) => a.localeCompare(b));
}

/** Direct sub-decks of a collection, as full names ("Biology::Lecture 3"). */
export function subdecks(names: string[], collection: string): string[] {
  const prefix = `${collection}::`;
  const seen = new Set<string>();
  for (const n of names) {
    if (!n.startsWith(prefix)) continue;
    const second = n.slice(prefix.length).split("::")[0]!.trim();
    if (second) seen.add(`${prefix}${second}`);
  }
  return [...seen];
}

/** Last part of a deck name: "Biology::Lecture 3" → "Lecture 3". */
export function leaf(deck: string): string {
  return deck.split("::").pop()!.trim();
}

const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const firstNumber = (s: string) => {
  const m = s.match(/(\d{1,3})(?!\d)/);
  return m ? Number(m[1]) : undefined;
};
const STOPWORDS = new Set(["and", "und", "the", "der", "die", "das", "with", "mit", "for", "für", "von", "and", "des", "lecture", "vorlesung", "chapter", "kapitel"]);
const tokens = (s: string) =>
  new Set(normalize(s).split(" ").filter((t) => t.length >= 3 && !/\d/.test(t) && !STOPWORDS.has(t)));

/** How alike a chapter title and a deck name are, 0–1. */
export function similarity(title: string, deck: string): number {
  const a = normalize(title);
  const b = normalize(leaf(deck));
  if (!a || !b) return 0;
  if (a === b) return 1;
  let score = 0;
  const na = firstNumber(a);
  const nb = firstNumber(b);
  if (na !== undefined && na === nb) score = 0.7;
  if (na !== undefined && nb !== undefined && na !== nb) return 0; // "Lecture 2" is never "Lecture 3"
  const ta = tokens(a);
  const tb = tokens(b);
  const shared = [...ta].filter((t) => tb.has(t)).length;
  const smaller = Math.min(ta.size, tb.size);
  if (smaller > 0 && shared > 0) score = Math.max(score, Math.min(0.95, score + (shared / smaller) * 0.65));
  if (a.includes(b) || b.includes(a)) score = Math.max(score, 0.8);
  return score;
}

/**
 * Links chapters to sub-decks by similar names: same name, same lecture
 * number, or shared words. Best pairs first, each deck used once.
 * Returns chunkId → deck (only for confident matches).
 */
export function matchDecks(chunks: { id: string; title: string }[], decks: string[], threshold = 0.5): Map<string, string> {
  const pairs: { id: string; deck: string; score: number }[] = [];
  for (const c of chunks) for (const d of decks) {
    const score = similarity(c.title, d);
    if (score >= threshold) pairs.push({ id: c.id, deck: d, score });
  }
  pairs.sort((x, y) => y.score - x.score);
  const out = new Map<string, string>();
  const used = new Set<string>();
  for (const p of pairs) {
    if (out.has(p.id) || used.has(p.deck)) continue;
    out.set(p.id, p.deck);
    used.add(p.deck);
  }
  return out;
}

/** The deck a chapter's ▶ Anki opens: its link, else "Subject::Title". */
export function deckForChunk(chunk: { title: string; ankiDeck?: string }, subject: { name: string; ankiDeck?: string }): string {
  return chunk.ankiDeck ?? deckName(subject.ankiDeck ?? subject.name, chunk.title);
}

/** The deck for a whole subject: its link, else its name. */
export function deckForSubject(subject: { name: string; ankiDeck?: string }): string {
  return subject.ankiDeck ?? deckName(subject.name);
}
