/**
 * Talking to Anki.
 *
 * Desktop: the free AnkiConnect add-on (code 2055492159) runs a small server
 * on 127.0.0.1:8765 while Anki is open. The first call asks for permission:
 * Anki shows an "allow this website?" popup. After that we can read decks,
 * create the Subject::Lecture structure and open review of an exact deck.
 *
 * Phones (see phoneAnkiLink):
 *  - AnkiMobile 25.07+: anki://x-callback-url/study?deck=… starts studying that
 *    deck (from the AnkiMobile 25.07 release notes).
 *  - AnkiDroid 2.25+: anki://x-callback-url/browser?search=… opens its card
 *    browser with a search – the only AnkiDroid screen a web page may open
 *    (Chrome only starts BROWSABLE activities; "review deck" isn't one).
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

/** All decks with Anki's ids: { "Biology::Lecture 3": 1712345678901 }. */
export function ankiDeckIds(): Promise<Record<string, number>> {
  return call<Record<string, number>>("deckNamesAndIds");
}

/** Creates the decks that don't exist yet. Returns name → id of the new ones. */
export async function createAnkiDecks(names: string[]): Promise<Record<string, number>> {
  const existing = await ankiDeckIds();
  const created: Record<string, number> = {};
  for (const name of new Set(names)) {
    if (existing[name] === undefined) created[name] = await call<number>("createDeck", { deck: name });
  }
  return created;
}

/** How many cards each Anki search finds, in one request. */
export async function countCards(queries: string[]): Promise<number[]> {
  if (queries.length === 0) return [];
  const results = await call<unknown[]>(
    "multi",
    { actions: queries.map((query) => ({ action: "findCards", params: { query } })) },
    20_000,
  );
  return results.map((r) => {
    // Sub-actions answer either with the plain result or { result, error }.
    const value = r && typeof r === "object" && !Array.isArray(r) && "result" in r ? (r as { result: unknown }).result : r;
    return Array.isArray(value) ? value.length : 0;
  });
}

/** Opens Anki desktop's review screen for this deck. False if Anki has no such deck. */
export async function openDeckOnDesktop(name: string): Promise<boolean> {
  return (await call<boolean | null>("guiDeckReview", { name })) !== false;
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

/** Anki search for exactly this deck (and its sub-decks). `*`, `_`, `\` and `"` are escaped. */
export function deckSearch(deck: string): string {
  return `deck:"${deck.replace(/([*_\\"])/g, "\\$1")}"`;
}

/**
 * Link that opens this deck in the phone's Anki app.
 * iPhone: AnkiMobile studies the deck. Android: AnkiDroid shows the deck's
 * cards; without AnkiDroid 2.25+ the Play Store opens to install/update it.
 */
export function phoneAnkiLink(platform: Exclude<Platform, "desktop">, deck: string): string {
  if (platform === "ios") return `anki://x-callback-url/study?deck=${encodeURIComponent(deck)}`;
  const search = encodeURIComponent(deckSearch(deck));
  return `intent://x-callback-url/browser?search=${search}#Intent;scheme=anki;package=com.ichi2.anki;end`;
}

/**
 * Safari on a Mac blocks every request from a website to 127.0.0.1
 * (WebKit bug 171934), so AnkiConnect can't be reached from it.
 */
export function isDesktopSafari(userAgent = typeof navigator !== "undefined" ? navigator.userAgent : ""): boolean {
  return detectPlatform(userAgent) === "desktop" && /Safari\//.test(userAgent) && !/Chrome|Chromium|CriOS|Edg\/|OPR\/|Firefox|FxiOS/.test(userAgent);
}

export const ANKIWEB_DECKS_URL = "https://ankiweb.net/decks";

/**
 * AnkiWeb has no link that opens one deck (and no interface for other
 * websites), so we open its deck list and say which deck to tap.
 */
export function ankiWebHint(deck: string): string {
  const path = deck.split("::").map((p) => p.trim()).filter(Boolean);
  return path.length ? `In AnkiWeb, open ${path.map((p) => `“${p}”`).join(" › ")}.` : "AnkiWeb is open in a new tab.";
}

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

/** Path of a deck below a collection: "Ana::Arm::Shoulder" → ["Arm", "Shoulder"]. */
function below(collection: string, deck: string): string[] {
  const prefix = `${collection}::`;
  if (!deck.startsWith(prefix)) return [];
  return deck.slice(prefix.length).split("::").map((x) => x.trim());
}

/** Every deck below a collection (all levels), as full names, in Anki's order. */
export function descendants(names: string[], collection: string): string[] {
  const seen = new Set<string>();
  for (const n of names) {
    const parts = below(collection, n);
    // Parents without an own entry still count ("A::B::C" implies "A::B").
    for (let i = 1; i <= parts.length; i++) if (parts.slice(0, i).every(Boolean)) seen.add(`${collection}::${parts.slice(0, i).join("::")}`);
  }
  return [...seen];
}

/** How many levels below the collection a deck is ("Ana::Arm::Shoulder" → 2). */
export function deckDepth(collection: string, deck: string): number {
  return below(collection, deck).length;
}

/**
 * Sub-decks of a collection at one level, as full names. Level 1 = direct
 * sub-decks ("Biology::Lecture 3"); level 2 = their sub-decks, and so on.
 * Branches that end earlier keep their last deck, so no cards are left out.
 */
export function subdecks(names: string[], collection: string, depth = 1): string[] {
  const all = descendants(names, collection);
  return all.filter((d) => {
    const n = deckDepth(collection, d);
    if (n === depth) return true;
    return n < depth && !all.some((x) => x.startsWith(`${d}::`));
  });
}

/** Deepest level below a collection. */
export function maxDepth(names: string[], collection: string): number {
  return Math.max(0, ...descendants(names, collection).map((d) => deckDepth(collection, d)));
}

/** The level most linked decks of a subject are on (1 if none). */
export function linkedDepth(collection: string, decks: (string | undefined)[]): number {
  const counts = new Map<number, number>();
  for (const d of decks) {
    const n = d ? deckDepth(collection, d) : 0;
    if (n > 0) counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  let best = 1;
  for (const [n, c] of counts) if (c > (counts.get(best) ?? 0)) best = n;
  return best;
}

/** True if one deck contains the other (or they're the same). */
export function relatedDecks(a: string, b: string): boolean {
  return a === b || a.startsWith(`${b}::`) || b.startsWith(`${a}::`);
}

/** Item title for a sub-deck: its path below the collection ("Arm – Shoulder"). */
export function sectionTitle(collection: string, deck: string): string {
  const parts = below(collection, deck);
  return parts.length ? parts.join(" – ") : leaf(deck);
}

/** Cards per item we aim for when choosing a level automatically. */
export const CARDS_PER_SECTION = 400;

/**
 * The level to use as items: the first one where a typical section has at
 * most CARDS_PER_SECTION cards (huge decks like a whole anatomy course go
 * deeper), without making hundreds of items. Level 1 if counts are unknown.
 */
export function chooseDepth(names: string[], collection: string, counts: Record<string, number>): number {
  const deepest = maxDepth(names, collection);
  for (let depth = 1; depth <= deepest; depth++) {
    const decks = subdecks(names, collection, depth);
    const sizes = decks.map((d) => counts[d] ?? 0).sort((a, b) => a - b);
    const median = sizes[Math.floor(sizes.length / 2)] ?? 0;
    if (median <= CARDS_PER_SECTION) return depth;
    const next = depth < deepest ? subdecks(names, collection, depth + 1).length : Infinity;
    if (next > 150) return depth;
  }
  return Math.max(1, deepest);
}

/** Cards of a deck that will be studied (suspended ones left out). */
export function cardSearch(deck: string): string {
  return `${deckSearch(deck)} -is:suspended`;
}

/** Cards of a deck that haven't been studied yet. */
export function newCardSearch(deck: string): string {
  return `${deckSearch(deck)} is:new -is:suspended`;
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

/** A sub-deck name inside a linked collection: "Bio WS26::Lecture 9". */
export function subdeckName(collection: string, title: string): string {
  return `${collection}::${title.replace(/::/g, " – ").replace(/"/g, "'").trim()}`;
}

/**
 * The deck a chapter's ▶ Anki opens: its own linked deck; in a linked
 * subject without an own deck, the subject's deck; else "Subject::Title".
 */
export function deckForChunk(chunk: { title: string; ankiDeck?: string }, subject: { name: string; ankiDeck?: string }): string {
  return chunk.ankiDeck ?? subject.ankiDeck ?? deckName(subject.name, chunk.title);
}

/** The chapter's own deck (not the whole subject's), or undefined. */
export function ownDeck(chunk: { title: string; ankiDeck?: string }, subject: { name: string; ankiDeck?: string }): string | undefined {
  if (chunk.ankiDeck) return chunk.ankiDeck;
  return subject.ankiDeck ? undefined : deckName(subject.name, chunk.title);
}

/** The deck for a whole subject: its link, else its name. */
export function deckForSubject(subject: { name: string; ankiDeck?: string }): string {
  return subject.ankiDeck ?? deckName(subject.name);
}
