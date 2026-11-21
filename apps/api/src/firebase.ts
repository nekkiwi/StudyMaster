/**
 * Verifies a Firebase Auth ID token (RS256 JWT) without any library:
 * Google's public keys (JWK), signature, audience, issuer and expiry.
 * Returns the user's id (uid) or throws.
 */
const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

type Keys = Record<string, JsonWebKey>;
let cached: { keys: Keys; until: number } | undefined;

async function googleKeys(): Promise<Keys> {
  const now = Date.now();
  if (cached && cached.until > now) return cached.keys;
  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error("Couldn't load Google's sign-in keys.");
  const body = (await res.json()) as { keys: (JsonWebKey & { kid: string })[] };
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get("cache-control") ?? "")?.[1] ?? 3600);
  const keys = Object.fromEntries(body.keys.map((k) => [k.kid, k]));
  cached = { keys, until: now + maxAge * 1000 };
  return keys;
}

const b64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const json = (s: string) => JSON.parse(new TextDecoder().decode(b64url(s))) as Record<string, unknown>;

export class AuthError extends Error {}

export async function verifyFirebaseToken(
  token: string,
  projectId: string,
  options: { now?: number; keys?: () => Promise<Keys> } = {},
): Promise<string> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new AuthError("Malformed token.");
  const [h, p, s] = parts as [string, string, string];
  let header: Record<string, unknown>;
  let payload: Record<string, unknown>;
  try {
    header = json(h);
    payload = json(p);
  } catch {
    throw new AuthError("Malformed token.");
  }
  if (header.alg !== "RS256" || typeof header.kid !== "string") throw new AuthError("Unexpected token type.");

  const now = options.now ?? Math.floor(Date.now() / 1000);
  const sub = payload.sub;
  if (payload.aud !== projectId) throw new AuthError("Token is for another project.");
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) throw new AuthError("Token has the wrong issuer.");
  if (typeof payload.exp !== "number" || payload.exp <= now) throw new AuthError("Token expired.");
  if (typeof payload.iat !== "number" || payload.iat > now + 300) throw new AuthError("Token issued in the future.");
  if (typeof sub !== "string" || !sub || sub.length > 128) throw new AuthError("Token has no user.");

  const keys = await (options.keys ?? googleKeys)();
  const jwk = keys[header.kid];
  if (!jwk) throw new AuthError("Unknown signing key.");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64url(s), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) throw new AuthError("Bad signature.");
  return sub;
}
