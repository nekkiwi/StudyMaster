/**
 * StudyMaster Worker: serves the web app (static assets) and a small API.
 * Only /api/* runs this code (wrangler.jsonc → assets.run_worker_first);
 * everything else is served straight from the assets.
 *
 * POST /api/toc  { text }  →  { chapters, lastPage }
 *   Reads a messy table of contents with Claude (3 reads, majority wins). Signed-in users only
 *   (Firebase ID token), limited per user. The key is a Worker secret.
 */
import Anthropic from "@anthropic-ai/sdk";
import { AuthError, verifyFirebaseToken } from "./firebase";
import { allow } from "./rateLimit";
import { MAX_TEXT, readTocStable, TocError } from "./toc";

// Only the default export may be exported from this file: Cloudflare treats
// every named export of the main module as an entry point.

interface Env {
  ASSETS: Fetcher;
  ANTHROPIC_API_KEY?: string;
}

/** Firebase project (public, same as the web app's config). */
const FIREBASE_PROJECT = "studymaster-caa36";

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

async function handleToc(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return reply({ error: "Use POST." }, 405);
  if (!env.ANTHROPIC_API_KEY) return reply({ error: "AI import isn't set up on the server yet." }, 503);

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  let uid: string;
  try {
    uid = await verifyFirebaseToken(token, FIREBASE_PROJECT);
  } catch (e) {
    return reply({ error: e instanceof AuthError ? "Please sign in again." : "Sign-in check failed." }, 401);
  }
  if (!allow(uid)) return reply({ error: "That's a lot of AI reads – please try again in an hour." }, 429);

  let text: unknown;
  try {
    text = ((await request.json()) as { text?: unknown }).text;
  } catch {
    return reply({ error: "Send JSON: { text }." }, 400);
  }
  if (typeof text !== "string" || !text.trim()) return reply({ error: "No text to read." }, 400);
  if (text.length > MAX_TEXT * 2) return reply({ error: "That's too much text for a table of contents." }, 413);

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1 });
  try {
    return reply(await readTocStable(client, text));
  } catch (e) {
    if (e instanceof TocError) return reply({ error: e.message }, e.status);
    if (e instanceof Anthropic.RateLimitError) return reply({ error: "The AI is busy – please try again in a minute." }, 429);
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
      return reply({ error: "AI import isn't set up correctly on the server." }, 503);
    }
    if (e instanceof Anthropic.APIError) return reply({ error: "The AI couldn't answer right now. Please try again." }, 502);
    return reply({ error: "Something went wrong." }, 500);
  }
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/toc") return handleToc(request, env);
    if (url.pathname.startsWith("/api/")) return reply({ error: "Not found." }, 404);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
