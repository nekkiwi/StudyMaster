/**
 * "Let AI read the contents": sends the text of a table of contents to our
 * Worker (apps/api, POST /api/toc), which asks Claude. Signed-in users only;
 * the API key stays on the server.
 */
import { idToken } from "./cloud";
import type { AiToc } from "./importer";

const CACHE_KEY = "studymaster-ai-toc";
const CACHE_SIZE = 20;

async function hash(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text.trim()));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

type Cache = { key: string; toc: AiToc }[];
const readCache = (): Cache => {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "[]") as Cache;
  } catch {
    return [];
  }
};

/** The same contents text gives the same answer on this device (and costs nothing the second time). */
export async function readTocWithAi(text: string): Promise<AiToc> {
  const key = await hash(text);
  const hit = readCache().find((e) => e.key === key);
  if (hit) return hit.toc;
  const toc = await fetchToc(text);
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify([{ key, toc }, ...readCache().filter((e) => e.key !== key)].slice(0, CACHE_SIZE)));
  } catch {
    // Storage full or blocked – the answer still works, it's just not remembered.
  }
  return toc;
}

async function fetchToc(text: string): Promise<AiToc> {
  const token = await idToken();
  if (!token) throw new Error("Sign in to let AI read the contents.");
  let res: Response;
  try {
    res = await fetch("/api/toc", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch {
    throw new Error("You seem to be offline.");
  }
  const body = (await res.json().catch(() => ({}))) as Partial<AiToc> & { error?: string };
  if (!res.ok || !Array.isArray(body.chapters)) throw new Error(body.error ?? "The AI couldn't answer right now.");
  return { chapters: body.chapters, lastPage: body.lastPage ?? null };
}
