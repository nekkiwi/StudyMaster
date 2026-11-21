import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchIcs, icsUrl } from "../src/calendar";

afterEach(() => vi.unstubAllGlobals());

describe("calendar links", () => {
  it("accepts https and webcal links, rejects others", () => {
    expect(icsUrl("webcal://p01-caldav.icloud.com/published/2/abc").toString()).toBe("https://p01-caldav.icloud.com/published/2/abc");
    expect(icsUrl(" https://calendar.google.com/calendar/ical/x/private-y/basic.ics ").hostname).toBe("calendar.google.com");
    expect(() => icsUrl("ftp://example.com/cal.ics")).toThrow(/https/);
    expect(() => icsUrl("not a link")).toThrow();
  });

  it("returns the calendar text, refuses non-calendars", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("BEGIN:VCALENDAR\nEND:VCALENDAR", { status: 200 })));
    expect(await fetchIcs("https://uni.example/cal.ics")).toContain("BEGIN:VCALENDAR");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>login</html>", { status: 200 })));
    await expect(fetchIcs("https://uni.example/cal.ics")).rejects.toThrow(/doesn't lead to a calendar/);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 404 })));
    await expect(fetchIcs("https://uni.example/cal.ics")).rejects.toThrow(/404/);
  });
});
