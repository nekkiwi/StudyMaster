import { describe, expect, it } from "vitest";
import { generateVapidKeys, instant, nextReminder, reminderDue, validEndpoint, vapidHeader, zoned } from "../src/reminder";

const b64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

describe("web push", () => {
  it("signs a VAPID header the push service can verify", async () => {
    const keys = await generateVapidKeys();
    const header = await vapidHeader("https://fcm.googleapis.com/fcm/send/abc", keys, "https://app.studymaster.workers.dev", 1_800_000_000_000);
    const [, token, k] = header.match(/^vapid t=([^,]+), k=(.+)$/)!;
    expect(k).toBe(keys.publicKey);
    const [h, p, sig] = token!.split(".");
    expect(JSON.parse(new TextDecoder().decode(b64(p!)))).toMatchObject({ aud: "https://fcm.googleapis.com", sub: "https://app.studymaster.workers.dev" });
    const pub = await crypto.subtle.importKey("raw", b64(keys.publicKey), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, b64(sig!), new TextEncoder().encode(`${h}.${p}`));
    expect(ok).toBe(true);
  });

  it("only sends to real push services", () => {
    expect(validEndpoint("https://fcm.googleapis.com/fcm/send/x")).toBe(true);
    expect(validEndpoint("https://web.push.apple.com/abc")).toBe(true);
    expect(validEndpoint("https://updates.push.services.mozilla.com/wpush/v2/x")).toBe(true);
    expect(validEndpoint("https://evil.example.com/x")).toBe(false);
    expect(validEndpoint("http://fcm.googleapis.com/x")).toBe(false);
  });
});

describe("reminder times", () => {
  it("converts local check-in times in a time zone, also across daylight saving", () => {
    // 20:00 in Berlin: winter UTC+1, summer UTC+2.
    expect(new Date(instant("2026-12-01", 20 * 60, "Europe/Berlin")).toISOString()).toBe("2026-12-01T19:00:00.000Z");
    expect(new Date(instant("2026-07-01", 20 * 60, "Europe/Berlin")).toISOString()).toBe("2026-07-01T18:00:00.000Z");
    expect(zoned(Date.parse("2026-12-01T19:00:00Z"), "Europe/Berlin")).toEqual({ date: "2026-12-01", minutes: 1200 });
  });

  it("schedules today's time if still ahead, else tomorrow's", () => {
    const at = (iso: string) => new Date(nextReminder(Date.parse(iso), "20:00", "Europe/Berlin")).toISOString();
    expect(at("2026-12-01T10:00:00Z")).toBe("2026-12-01T19:00:00.000Z");
    expect(at("2026-12-01T19:30:00Z")).toBe("2026-12-02T19:00:00.000Z");
  });

  it("reminds only on planned days without a check-in", () => {
    const now = Date.parse("2026-12-01T19:00:00Z");
    const base = { subscriptions: [{ endpoint: "https://fcm.googleapis.com/x" }], time: "20:00", timeZone: "Europe/Berlin", planDates: ["2026-12-01"] };
    expect(reminderDue(base, now)).toBe(true);
    expect(reminderDue({ ...base, lastCheckIn: "2026-12-01" }, now)).toBe(false);
    expect(reminderDue({ ...base, planDates: ["2026-12-02"] }, now)).toBe(false);
    expect(reminderDue({ ...base, subscriptions: [] }, now)).toBe(false);
  });
});
