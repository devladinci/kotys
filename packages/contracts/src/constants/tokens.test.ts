import { describe, expect, it } from "vitest";
import {
  COMPACT_BUFFER,
  contextPct,
  estimateTokens,
  estimateTokensFromChars,
  fmtTokens,
  projectContextTokens,
  REPLAY_TOOL_BUDGET_TOKENS,
  replayedToolMessages,
  usableTokens,
} from "./tokens.js";

describe("usableTokens", () => {
  it("reserves the full buffer once the window can spare it", () => {
    expect(usableTokens(262_144)).toBe(242_144);
    expect(usableTokens(COMPACT_BUFFER * 4)).toBe(COMPACT_BUFFER * 3);
  });

  it("scales the reserve down rather than eating a small window", () => {
    // A fixed 20k reserve is bigger than the whole window here; taking it
    // would leave nothing, and reserving half wastes most of the model.
    expect(usableTokens(4_096)).toBe(3_072);
    expect(usableTokens(32_768)).toBe(24_576);
  });

  it("leaves headroom at every size", () => {
    for (const ctx of [2_048, 4_096, 32_768, 131_072, 1_048_576]) {
      expect(usableTokens(ctx)).toBeLessThan(ctx);
      expect(usableTokens(ctx)).toBeGreaterThan(ctx / 2);
    }
  });
});

describe("estimateTokens", () => {
  it("is chars/4", () => {
    expect(estimateTokens("a".repeat(40))).toBe(10);
    expect(estimateTokens("")).toBe(0);
  });

  it("never returns negative", () => {
    expect(estimateTokensFromChars(-100)).toBe(0);
  });
});

describe("fmtTokens", () => {
  it("formats the documented tiers", () => {
    expect(fmtTokens(999)).toBe("999");
    expect(fmtTokens(1_000)).toBe("1.0k");
    expect(fmtTokens(16_384)).toBe("16.4k");
    expect(fmtTokens(262_144)).toBe("262k");
    expect(fmtTokens(1_048_576)).toBe("1.0M");
    expect(fmtTokens(2_000_000)).toBe("2.0M");
    expect(fmtTokens(20_000_000)).toBe("20M");
  });
});

describe("projectContextTokens", () => {
  it("adds only what happened after the measurement", () => {
    expect(
      projectContextTokens({ measured: 14_000, estimated: 300, fallback: 900 }),
    ).toBe(14_300);
  });

  it("falls back only when nothing has been measured", () => {
    expect(
      projectContextTokens({ measured: 0, estimated: 300, fallback: 900 }),
    ).toBe(1_200);
  });
});

describe("contextPct", () => {
  it("measures against the window, so half a window reads as half", () => {
    expect(contextPct(2_048, 4_096)).toBe(50);
    expect(contextPct(4_096, 4_096)).toBe(100);
  });

  it("reports overflow rather than pinning at 100", () => {
    expect(contextPct(4_600, 4_096)).toBe(112);
  });

  it("caps at 999", () => {
    expect(contextPct(8_000_000, 16_384)).toBe(999);
  });

  it("reads zero for an empty window", () => {
    expect(contextPct(1_000, 0)).toBe(0);
  });
});

describe("replayedToolMessages", () => {
  it("replays every turn while the budget holds", () => {
    const replayed = replayedToolMessages([
      { id: 1, tokens: 1_000 },
      { id: 2, tokens: 2_000 },
    ]);
    expect([...replayed].sort()).toEqual([1, 2]);
  });

  it("fills the budget newest first", () => {
    const replayed = replayedToolMessages([
      { id: 1, tokens: 4_000 },
      { id: 2, tokens: 4_000 },
    ]);
    expect([...replayed]).toEqual([2]);
  });

  it("skips a turn too big to fit but keeps older ones that still do", () => {
    const replayed = replayedToolMessages([
      { id: 1, tokens: 1_000 },
      { id: 2, tokens: REPLAY_TOOL_BUDGET_TOKENS + 1 },
      { id: 3, tokens: 500 },
    ]);
    expect([...replayed].sort()).toEqual([1, 3]);
  });

  it("replays a turn that exactly fills the budget", () => {
    const replayed = replayedToolMessages([
      { id: 1, tokens: REPLAY_TOOL_BUDGET_TOKENS },
    ]);
    expect([...replayed]).toEqual([1]);
  });
});
