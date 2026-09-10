import { describe, expect, it } from "vitest";
import { selectSummaryHead } from "./compact.js";

// estimateTokens is chars/4; "x".repeat(400) = 100 tokens.
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
    // Each message is 100 tokens; budget 250 keeps the last two (200 <= 250).
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
    // A 4,096 window keeps 1,024 tokens, so a 1,193-token reply cannot stay.
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
