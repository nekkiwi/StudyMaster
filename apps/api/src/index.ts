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
import { fetchIcs, readTimetable } from "./calendar";
import { Reminders, type ReminderUpdate } from "./push";
import { MAX_TEXT, readTocStable, TocError } from "./toc";

// Cloudflare treats every named export of the main module as an entry point:
// only the default handler and Durable Object classes may be exported here.
export { Reminders };

interface Env {
  ASSETS: Fetcher;
  ANTHROPIC_API_KEY?: string;
  REMINDERS: DurableObjectNamespace<Reminders>;
}

/** Firebase project (public, same as the web app's config). */
const FIREBASE_PROJECT = "studymaster-caa36";

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

/** Signed-in user (Firebase ID token) within the rate limit, or an error response. */
async function signedIn(request: Request): Promise<string | Response> {
  if (request.method !== "POST") return reply({ error: "Use POST." }, 405);
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  let uid: string;
  try {
    uid = await verifyFirebaseToken(token, FIREBASE_PROJECT);
  } catch (e) {
    return reply({ error: e instanceof AuthError ? "Please sign in again." : "Sign-in check failed." }, 401);
  }
  if (!allow(uid)) return reply({ error: "That's a lot at once – please try again in an hour." }, 429);
  return uid;
}

async function body<T>(request: Request): Promise<T | undefined> {
  try {
    return (await request.json()) as T;
  } catch {
    return undefined;
  }
}

async function handleToc(request: Request, env: Env): Promise<Response> {
  if (!env.ANTHROPIC_API_KEY) return reply({ error: "AI import isn't set up on the server yet." }, 503);
  const uid = await signedIn(request);
  if (uid instanceof Response) return uid;
  const text = (await body<{ text?: unknown }>(request))?.text;
  if (typeof text !== "string" || !text.trim()) return reply({ error: "No text to read." }, 400);
  if (text.length > MAX_TEXT * 2) return reply({ error: "That's too much text for a table of contents." }, 413);
  return withClaude(env, (client) => readTocStable(client, text));
}

async function handleIcs(request: Request): Promise<Response> {
  const uid = await signedIn(request);
  if (uid instanceof Response) return uid;
  const url = (await body<{ url?: unknown }>(request))?.url;
  if (typeof url !== "string") return reply({ error: "Send JSON: { url }." }, 400);
  try {
    return reply({ ics: await fetchIcs(url) });
  } catch (e) {
    return e instanceof TocError ? reply({ error: e.message }, e.status) : reply({ error: "Couldn't read that calendar." }, 500);
  }
}

async function handleTimetable(request: Request, env: Env): Promise<Response> {
  if (!env.ANTHROPIC_API_KEY) return reply({ error: "AI isn't set up on the server yet." }, 503);
  const uid = await signedIn(request);
  if (uid instanceof Response) return uid;
  const b = await body<{ data?: unknown; mediaType?: unknown }>(request);
  if (typeof b?.data !== "string" || typeof b.mediaType !== "string") return reply({ error: "Send JSON: { data, mediaType }." }, 400);
  return withClaude(env, (client) => readTimetable(client, b.data as string, b.mediaType as string));
}

/** The server's public push key (for the browser's subscription). */
async function handlePushKey(env: Env): Promise<Response> {
  const keys = await env.REMINDERS.get(env.REMINDERS.idFromName("vapid")).vapidKeys();
  return reply({ publicKey: keys.publicKey });
}

/** Reminder settings and state of the signed-in user (subscription, time, planned days, check-ins). */
async function handlePush(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return reply({ error: "Use POST." }, 405);
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  let uid: string;
  try {
    uid = await verifyFirebaseToken(token, FIREBASE_PROJECT);
  } catch {
    return reply({ error: "Please sign in again." }, 401);
  }
  const change = await body<ReminderUpdate>(request);
  if (!change) return reply({ error: "Send JSON." }, 400);
  return reply(await env.REMINDERS.get(env.REMINDERS.idFromName(`user:${uid}`)).update(change));
}

/** Runs a Claude call and turns errors into friendly answers. */
async function withClaude(env: Env, run: (client: Anthropic) => Promise<unknown>): Promise<Response> {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1 });
  try {
    return reply(await run(client));
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
    if (url.pathname === "/api/ics") return handleIcs(request);
    if (url.pathname === "/api/timetable") return handleTimetable(request, env);
    if (url.pathname === "/api/push/key") return handlePushKey(env);
    if (url.pathname === "/api/push") return handlePush(request, env);
    if (url.pathname.startsWith("/api/")) return reply({ error: "Not found." }, 404);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
