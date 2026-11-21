import { describe, expect, it } from "vitest";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { AssistantResult, MAX_MESSAGE, readRequest } from "../src/assistant";

describe("assistant request", () => {
  it("accepts a message with plan context and keeps only valid history turns", () => {
    const r = readRequest({
      message: "  I'm sick until Thursday ",
      context: "{}",
      history: [{ role: "user", text: "hi" }, { role: "system", text: "x" }, { role: "assistant", text: 3 }, null],
    });
    expect(r).toEqual({ message: "I'm sick until Thursday", context: "{}", history: [{ role: "user", text: "hi" }] });
  });

  it("rejects empty, overlong and malformed requests", () => {
    expect(readRequest(null)).toBeTypeOf("string");
    expect(readRequest({ message: " ", context: "{}" })).toBeTypeOf("string");
    expect(readRequest({ message: "x".repeat(MAX_MESSAGE + 1), context: "{}" })).toBeTypeOf("string");
    expect(readRequest({ message: "hi" })).toBeTypeOf("string");
  });

  it("builds a structured-output schema the API accepts (no number constraints)", () => {
    const format = zodOutputFormat(AssistantResult);
    const json = JSON.stringify(format.schema);
    expect(json).toContain("block_days");
    expect(json).not.toMatch(/"(minimum|maximum|exclusiveMinimum|exclusiveMaximum)"/);
  });

  it("parses a typical answer", () => {
    const parsed = AssistantResult.parse({
      language: "English",
      reply: "Get well soon! I'll keep today to Thursday free.",
      actions: [{ type: "block_days", start: "2026-11-21", end: "2026-11-26", reason: "sick", note: null }],
    });
    expect(parsed.actions[0]!.type).toBe("block_days");
  });
});
