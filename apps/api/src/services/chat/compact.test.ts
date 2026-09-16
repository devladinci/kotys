import { beforeEach, describe, expect, it, vi } from "vitest";
import { selectSummaryHead, withSteerLines } from "./compact.js";

const h = vi.hoisted(() => ({
  toolResults: [] as {
    message_id: number;
    call_index: number;
    content: string;
  }[],
}));

vi.mock("@kotys/db", () => ({
  getToolResultsForMessages: (ids: number[]) =>
    h.toolResults.filter((r) => ids.includes(r.message_id)),
}));

beforeEach(() => {
  h.toolResults.length = 0;
});

// estimateTokens is chars/4.
const msg = (id: number, chars: number) => ({
  id,
  role: id % 2 === 1 ? ("user" as const) : ("assistant" as const),
  content: "x".repeat(chars),
  images: null,
});

describe("selectSummaryHead", () => {
  it("returns everything when the budget is zero (forced compact)", () => {
    const candidates = [msg(1, 4000), msg(2, 4000), msg(3, 4000)];
    expect(selectSummaryHead(candidates, 0)).toEqual(candidates);
  });

  it("keeps the recent window verbatim when it fits the budget", () => {
    // 400 + 100 + 100 tokens: only the last two fit in 250.
    const candidates = [msg(1, 1600), msg(2, 400), msg(3, 400)];
    const head = selectSummaryHead(candidates, 250);
    expect(head.map((m) => m.id)).toEqual([1]);
  });

  it("never summarizes the newest message, even when it busts the budget", () => {
    const candidates = [msg(1, 8000), msg(2, 8000), msg(3, 8000), msg(4, 8000)];
    const head = selectSummaryHead(candidates, 100);
    expect(head.map((m) => m.id)).toEqual([1, 2, 3]);
  });

  it("summarizes the previous exchange and keeps the pending question", () => {
    // A 4,096 window keeps 1,024 tokens, so a 1,194-token reply cannot stay.
    const candidates = [msg(1, 132), msg(2, 4774), msg(3, 40)];
    const head = selectSummaryHead(candidates, 1024);
    expect(head.map((m) => m.id)).toEqual([1, 2]);
  });

  it("keeps nothing when every message fits the budget", () => {
    const candidates = [msg(1, 400), msg(2, 400)];
    expect(selectSummaryHead(candidates, 500)).toEqual([]);
  });

  it("returns an empty head for no candidates", () => {
    expect(selectSummaryHead([], 100)).toEqual([]);
  });
});

describe("withSteerLines", () => {
  const reply = (content: string, trace: unknown[] | null) => ({
    id: 2,
    role: "assistant",
    content,
    images: null,
    tool_calls: trace ? JSON.stringify(trace) : null,
  });
  const steer = (text: string, textOffset: number) => ({
    tool: "steer",
    status: "done",
    textOffset,
    widget: { kind: "steer", text },
  });

  it("leaves a reply without steers untouched", () => {
    const r = reply("Plain answer.\n", [{ tool: "list", status: "done" }]);
    expect(withSteerLines(r)).toBe("Plain answer.\n");
    expect(withSteerLines(reply("No trace.", null))).toBe("No trace.");
  });

  it("puts each steer where the model received it", () => {
    const r = reply("Part one.\n\nPart two.", [
      { tool: "list", status: "done" },
      steer("and Z", "Part one.\n\n".length),
    ]);
    expect(withSteerLines(r)).toBe(
      "Part one.\n\n[User]: and Z\n\n[Assistant]: Part two.",
    );
  });

  it("keeps the caller's label on an empty opening before the first steer", () => {
    const r = reply("Done.", [steer("use Y", 0)]);
    // The caller prefixes "[Assistant]: " to this.
    expect(withSteerLines(r)).toBe("\n\n[User]: use Y\n\n[Assistant]: Done.");
  });
});
