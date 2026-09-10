import { describe, expect, it } from "vitest";
import { execute } from "./current_datetime.js";
import type { ToolContext } from "./types.js";

// current_datetime reads neither args nor ctx.
const ctx = {
  homedir: "/tmp",
  chatId: null,
  chatTopics: [],
} as unknown as ToolContext;

describe("current_datetime", () => {
  it("returns parseable iso/local/timezone JSON", async () => {
    const result = await execute({}, ctx);
    const parsed = JSON.parse(result.content) as {
      iso: string;
      local: string;
      timezone: string;
    };
    expect(Number.isNaN(Date.parse(parsed.iso))).toBe(false);
    expect(parsed.timezone.length).toBeGreaterThan(0);
    expect(parsed.local.length).toBeGreaterThan(0);
  });

  it("surfaces the data as a result row for the timeline widget", async () => {
    const result = await execute({}, ctx);
    expect(result.activity.results).toHaveLength(1);
    expect(result.activity.results?.[0]?.title).toContain("(");
  });
});
