// Live check against the Claude API. Runs only with ANTHROPIC_API_KEY set.
import { readFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { expect, it } from "vitest";
import { readToc } from "../src/toc";

it.runIf(!!process.env.ANTHROPIC_API_KEY)("reads a scanned German textbook TOC", async () => {
  const text = readFileSync(new URL("../../web/test/fixtures/toc-arbeitsbuch.txt", import.meta.url).pathname, "utf8");
  const result = await readToc(new Anthropic(), text);
  console.log(JSON.stringify(result, null, 1));
  const units = result.chapters.filter((c) => c.include);
  expect(units).toHaveLength(7);
  expect(units[0]!.title).toMatch(/Ankommen/);
  expect(units[0]!.startPage).toBe(10);
}, 120_000);
