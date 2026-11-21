/**
 * Helpers for evening check-in reminders (pure, testable). The Durable
 * Object that uses them is in push.ts.
 *
 * Evening check-in reminders with Web Push – no extra service or secret:
 * - VAPID keys are generated once by the Worker and kept in a Durable
 *   Object ("vapid" instance).
 * - Each signed-in user has a Durable Object (id = uid) with their push
 *   subscriptions, check-in time, time zone, planned study days and the last
 *   day they checked in. It sets an alarm for the next check-in time and, if
 *   that day had sessions and no check-in yet, sends a push (no payload: the
 *   service worker shows "How did today go?").
 */

export interface PushSubscriptionJSON {
  endpoint: string;
  keys?: Record<string, string>;
}

export interface ReminderState {
  subscriptions: PushSubscriptionJSON[];
  /** "HH:MM", local time. */
  time: string;
  /** IANA time zone, e.g. "Europe/Berlin". */
  timeZone: string;
  /** Local dates with study sessions (next weeks). */
  planDates: string[];
  /** Local date of the last check-in. */
  lastCheckIn?: string;
}

export interface ReminderUpdate {
  subscription?: PushSubscriptionJSON;
  removeEndpoint?: string;
  time?: string;
  timeZone?: string;
  planDates?: string[];
  lastCheckIn?: string;
}

/** Push services browsers use – we only ever send to these. */
const PUSH_HOSTS = /^(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)$/i;

export function validEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && PUSH_HOSTS.test(url.hostname);
  } catch {
    return false;
  }
}

const b64url = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const enc = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));

export interface VapidKeys {
  publicKey: string;
  privateJwk: JsonWebKey;
}

export async function generateVapidKeys(): Promise<VapidKeys> {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const raw = (await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer;
  const privateJwk = (await crypto.subtle.exportKey("jwk", pair.privateKey)) as JsonWebKey;
  return { publicKey: b64url(raw), privateJwk };
}

/** The Authorization header for one push service (VAPID, RFC 8292). */
export async function vapidHeader(endpoint: string, keys: VapidKeys, subject: string, now = Date.now()): Promise<string> {
  const key = await crypto.subtle.importKey("jwk", keys.privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const data = `${enc({ typ: "JWT", alg: "ES256" })}.${enc({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })}`;
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(data));
  return `vapid t=${data}.${b64url(signature)}, k=${keys.publicKey}`;
}

/** Local date and minutes after midnight of an instant in a time zone. */
export function zoned(ms: number, timeZone: string): { date: string; minutes: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

/** The instant of a local date + time in a time zone. */
export function instant(date: string, minutes: number, timeZone: string): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const wall = Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
  let guess = wall;
  for (let i = 0; i < 3; i++) {
    const z = zoned(guess, timeZone);
    const [zy, zm, zd] = z.date.split("-").map(Number) as [number, number, number];
    const seen = Date.UTC(zy, zm - 1, zd, Math.floor(z.minutes / 60), z.minutes % 60);
    guess += wall - seen;
  }
  return guess;
}

const addDay = (date: string) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

/** Next reminder time after `now` (today's if still ahead, else tomorrow's). */
export function nextReminder(now: number, time: string, timeZone: string): number {
  const [h, m] = time.split(":").map(Number) as [number, number];
  const today = zoned(now, timeZone).date;
  const t = instant(today, h * 60 + m, timeZone);
  return t > now + 30_000 ? t : instant(addDay(today), h * 60 + m, timeZone);
}

/** Whether a reminder is due now: a planned day without a check-in yet. */
export function reminderDue(state: ReminderState, now: number): boolean {
  if (state.subscriptions.length === 0) return false;
  const today = zoned(now, state.timeZone).date;
  return state.planDates.includes(today) && state.lastCheckIn !== today;
}

