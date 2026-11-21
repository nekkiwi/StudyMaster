import { describe, expect, it } from "vitest";
import { busyTimes, parseIcs, weeklyToEvents } from "../src/lib/calendar.js";

// A weekly lecture on Mondays 10:15–11:45 (floating local time), with one
// holiday left out (EXDATE) and one week moved to Tuesday (RECURRENCE-ID).
const ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Uni//Timetable//EN
BEGIN:VEVENT
UID:bio-lecture
DTSTART:20261123T101500
DTEND:20261123T114500
RRULE:FREQ=WEEKLY;UNTIL=20261221T235959
EXDATE:20261207T101500
SUMMARY:Biochemistry lecture
END:VEVENT
BEGIN:VEVENT
UID:bio-lecture
RECURRENCE-ID:20261214T101500
DTSTART:20261215T120000
DTEND:20261215T133000
SUMMARY:Biochemistry lecture (moved)
END:VEVENT
BEGIN:VEVENT
UID:holiday
DTSTART;VALUE=DATE:20261224
DTEND;VALUE=DATE:20261225
SUMMARY:Christmas
END:VEVENT
BEGIN:VEVENT
UID:utc-seminar
DTSTART:20261125T130000Z
DTEND:20261125T140000Z
SUMMARY:Seminar
END:VEVENT
END:VCALENDAR`;

describe("ICS calendars", () => {
  it("expands weekly classes, skips holidays (EXDATE), moves single dates, ignores all-day events", async () => {
    const events = await parseIcs(ICS, "2026-11-20", "2026-12-31");
    const lecture = events.filter((e) => e.title.startsWith("Biochemistry"));
    expect(lecture.map((e) => `${e.date} ${e.start}-${e.end}`)).toEqual([
      "2026-11-23 615-705",
      "2026-11-30 615-705",
      // 7 Dec: holiday (EXDATE); 14 Dec: moved to Tuesday 15 Dec 12:00
      "2026-12-15 720-810",
      "2026-12-21 615-705",
    ]);
    expect(events.some((e) => e.title === "Christmas")).toBe(false);
    // UTC times are shown in local time.
    const seminar = events.find((e) => e.title === "Seminar")!;
    const local = new Date("2026-11-25T13:00:00Z");
    expect(seminar.start).toBe(local.getHours() * 60 + local.getMinutes());
  });

  it("only returns events in the period", async () => {
    const events = await parseIcs(ICS, "2026-12-01", "2026-12-16");
    expect(events.map((e) => e.date)).toEqual(["2026-12-15"]);
  });
});

describe("timetables read by AI", () => {
  it("repeats weekly classes, odd/even weeks too", () => {
    const events = weeklyToEvents(
      [
        { weekday: 1, start: "08:15", end: "09:45", title: "Anatomy", weeks: "all" },
        { weekday: 3, start: "14:00", end: "15:30", title: "Lab", weeks: "even" },
      ],
      "2026-11-23",
      "2026-12-06",
    );
    // Mondays 23 Nov + 30 Nov; Lab only in the even ISO week (week 48 = 23–29 Nov).
    expect(events.map((e) => `${e.date} ${e.title}`)).toEqual(["2026-11-23 Anatomy", "2026-11-25 Lab", "2026-11-30 Anatomy"]);
  });

  it("only calendars that block study time count", () => {
    const ev = { date: "2026-11-23", start: 600, end: 700, title: "X" };
    const busy = busyTimes(
      [
        { id: "uni", name: "Uni", kind: "link", university: true, block: true, updatedAt: "" },
        { id: "private", name: "Private", kind: "file", university: false, block: false, updatedAt: "" },
      ],
      { uni: [ev], private: [{ ...ev, title: "Y" }] },
    );
    expect(busy).toEqual([ev]);
  });
});

describe("Google Calendar", () => {
  it("turns events into busy times, skipping all-day, cancelled and 'free' events", async () => {
    const { googleToEvents } = await import("../src/lib/calendar.js");
    const local = (iso: string) => {
      const d = new Date(iso);
      return d.getHours() * 60 + d.getMinutes();
    };
    const events = googleToEvents(
      [
        { summary: "Anatomy", start: { dateTime: "2026-11-23T10:15:00+01:00" }, end: { dateTime: "2026-11-23T11:45:00+01:00" } },
        { summary: "Holiday", start: { date: "2026-11-24" }, end: { date: "2026-11-25" } },
        { summary: "Cancelled", status: "cancelled", start: { dateTime: "2026-11-25T10:00:00Z" }, end: { dateTime: "2026-11-25T11:00:00Z" } },
        { summary: "Free time", transparency: "transparent", start: { dateTime: "2026-11-26T10:00:00Z" }, end: { dateTime: "2026-11-26T11:00:00Z" } },
      ],
      "2026-11-20",
      "2026-11-30",
    );
    expect(events.map((e) => e.title)).toEqual(["Anatomy"]);
    expect(events[0]!.start).toBe(local("2026-11-23T10:15:00+01:00"));
  });

  it("lists calendars and pages through events", async () => {
    const { listGoogleCalendars, googleEvents } = await import("../src/lib/googleCalendar.js");
    const calls: string[] = [];
    const fake = async (url: string) => {
      calls.push(url);
      if (url.includes("calendarList")) {
        return new Response(JSON.stringify({ items: [{ id: "b", summary: "Uni" }, { id: "a", summary: "Me", primary: true }] }));
      }
      const page2 = url.includes("pageToken=p2");
      return new Response(
        JSON.stringify({
          items: [{ summary: page2 ? "Lab" : "Lecture", start: { dateTime: "2026-11-23T10:00:00Z" }, end: { dateTime: "2026-11-23T11:00:00Z" } }],
          ...(page2 ? {} : { nextPageToken: "p2" }),
        }),
      );
    };
    const original = globalThis.fetch;
    globalThis.fetch = fake as typeof fetch;
    try {
      expect((await listGoogleCalendars("t")).map((c) => c.summary)).toEqual(["Me", "Uni"]);
      const events = await googleEvents("t", "uni@group.calendar.google.com", "2026-11-20", "2026-11-30");
      expect(events.map((e) => e.title).sort()).toEqual(["Lab", "Lecture"]);
      expect(calls.some((c) => c.includes("singleEvents=true"))).toBe(true);
    } finally {
      globalThis.fetch = original;
    }
  });
});
