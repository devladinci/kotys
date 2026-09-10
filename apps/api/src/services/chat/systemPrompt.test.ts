import { describe, expect, it } from "vitest";
import { formatMemoryBlock } from "./systemPrompt.js";

const mem = (
  id: number,
  type: string,
  content: string,
  topics: string[] = [],
) => ({ id, type, content, topics });

describe("formatMemoryBlock", () => {
  it("returns empty for no memories", () => {
    expect(formatMemoryBlock([])).toBe("");
  });

  it("renders ids, type, content, and topics", () => {
    const out = formatMemoryBlock([
      mem(7, "user", "Name is Vlado", ["identity"]),
    ]);
    expect(out).toContain("- [7] (user) Name is Vlado — topics: identity");
  });

  it("caps each line at 240 chars", () => {
    const out = formatMemoryBlock([mem(1, "user", "x".repeat(1000))]);
    const line = out.split("\n")[1];
    expect(line.length).toBeLessThanOrEqual(240);
    expect(line.endsWith("…")).toBe(true);
  });

  it("drops lines past the block budget and names search_memories", () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      mem(i + 1, "user", `Memory number ${i}: ${"y".repeat(90)}`),
    );
    const out = formatMemoryBlock(many);
    expect(out).toContain("more not shown");
    expect(out).toContain("search_memories");
    // Every line that made the cut is intact.
    const shown = out.split("\n").filter((l) => l.startsWith("- ["));
    expect(shown.length).toBeGreaterThan(5);
    expect(shown.length).toBeLessThan(40);
  });

  it("keeps everything when it fits under the budget", () => {
    const few = [
      mem(1, "user", "short fact"),
      mem(2, "preference", "likes brevity"),
    ];
    const out = formatMemoryBlock(few);
    expect(out).not.toContain("more not shown");
    expect(out).toContain("[1]");
    expect(out).toContain("[2]");
  });
});
