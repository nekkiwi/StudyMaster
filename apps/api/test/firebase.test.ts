import { describe, expect, it } from "vitest";
import { AuthError, verifyFirebaseToken } from "../src/firebase";
import { allow } from "../src/rateLimit";

const PROJECT = "demo-project";
const enc = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function setup() {
  const pair = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as JsonWebKey;
  const sign = async (payload: Record<string, unknown>, kid = "k1") => {
    const data = `${enc({ alg: "RS256", kid, typ: "JWT" })}.${enc(payload)}`;
    const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, new TextEncoder().encode(data)));
    return `${data}.${btoa(String.fromCharCode(...sig)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
  };
  return { sign, keys: async () => ({ k1: jwk }) };
}

const NOW = 1_800_000_000;
const good = { aud: PROJECT, iss: `https://securetoken.google.com/${PROJECT}`, sub: "user-1", iat: NOW - 10, exp: NOW + 3000 };

describe("Firebase sign-in check", () => {
  it("accepts a valid token and returns the user id", async () => {
    const { sign, keys } = await setup();
    expect(await verifyFirebaseToken(await sign(good), PROJECT, { now: NOW, keys })).toBe("user-1");
  });

  it("rejects expired, foreign, unsigned and tampered tokens", async () => {
    const { sign, keys } = await setup();
    const check = (t: string) => verifyFirebaseToken(t, PROJECT, { now: NOW, keys });
    await expect(check(await sign({ ...good, exp: NOW - 1 }))).rejects.toThrow(AuthError);
    await expect(check(await sign({ ...good, aud: "other" }))).rejects.toThrow(/another project/);
    await expect(check(await sign(good, "unknown"))).rejects.toThrow(/Unknown signing key/);
    const [h, , s] = (await sign(good)).split(".");
    await expect(check(`${h}.${enc({ ...good, sub: "someone-else" })}.${s}`)).rejects.toThrow(/Bad signature/);
    await expect(check("nonsense")).rejects.toThrow(AuthError);
  });
});

describe("rate limit", () => {
  it("allows 20 AI reads per user and hour", () => {
    const t = 1_000_000;
    for (let i = 0; i < 20; i++) expect(allow("u", t + i)).toBe(true);
    expect(allow("u", t + 21)).toBe(false);
    expect(allow("other", t + 21)).toBe(true);
    expect(allow("u", t + 3600_001 + 20)).toBe(true);
  });
});
