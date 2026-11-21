// Live check against the Claude API. Runs only with ANTHROPIC_API_KEY and TIMETABLE_PDF set.
import { readFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { expect, it } from "vitest";
import { readTimetable } from "../src/calendar";

it.runIf(!!process.env.ANTHROPIC_API_KEY && !!process.env.TIMETABLE_PDF)("reads a timetable PDF into weekly classes", async () => {
  const data = readFileSync(process.env.TIMETABLE_PDF!).toString("base64");
  const t = await readTimetable(new Anthropic(), data, "application/pdf");
  console.log(JSON.stringify(t));
  expect(t.classes.length).toBe(5);
  expect(t.classes.find((c) => c.title.includes("Physiologie"))).toMatchObject({ weekday: 1, start: "14:00", end: "15:30" });
  expect(t.classes.find((c) => c.title.includes("Seminar"))?.weeks).toBe("even");
  expect(t.startDate).toBe("2026-10-19");
}, 120_000);
