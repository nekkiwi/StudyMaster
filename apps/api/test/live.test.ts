// Live check against the Claude API. Runs only with ANTHROPIC_API_KEY set.
import { readFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { expect, it } from "vitest";
import { readTocStable } from "../src/toc";

const text = () => readFileSync(new URL("../../web/test/fixtures/toc-arbeitsbuch.txt", import.meta.url).pathname, "utf8");

it.runIf(!!process.env.ANTHROPIC_API_KEY)("reads a scanned German textbook TOC the same way every time", async () => {
  const client = new Anthropic();
  const runs = await Promise.all([1, 2, 3].map(() => readTocStable(client, text())));
  for (const r of runs) console.log(r.chapters.map((c) => `${c.title}@${c.startPage}${c.include ? "" : " (x)"}`).join(" | "), "| last", r.lastPage);
  const units = runs[0]!.chapters.filter((c) => c.include);
  expect(units).toHaveLength(7);
  expect(units[0]).toMatchObject({ startPage: 10 });
  expect(runs[1]).toEqual(runs[0]);
  expect(runs[2]).toEqual(runs[0]);
}, 180_000);
