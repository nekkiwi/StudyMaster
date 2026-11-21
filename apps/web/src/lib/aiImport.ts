/**
 * "Let AI read the contents": sends the text of a table of contents to our
 * Worker (apps/api, POST /api/toc), which asks Claude. Signed-in users only;
 * the API key stays on the server.
 */
import { idToken } from "./cloud";
import type { AiToc } from "./importer";

export async function readTocWithAi(text: string): Promise<AiToc> {
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
