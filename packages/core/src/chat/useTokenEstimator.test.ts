import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { DEFAULT_CONTEXT } from "@kotys/contracts";
import {
  projectedUsedTokens,
  useTokenEstimator,
  type TokenizedMessage,
} from "./useTokenEstimator.js";

describe("useTokenEstimator", () => {
  it("estimates tokens from message content when no measured usage exists", () => {
    const { result } = renderHook(() =>
      useTokenEstimator(
        [
          { id: 1, role: "user", content: "a".repeat(40) },
          { id: 2, role: "assistant", content: "b".repeat(20) },
        ],
        131_072,
      ),
    );
    // (40 + 20) / 4 = 15
    expect(result.current.used).toBe(15);
    expect(result.current.ctx).toBe(131_072);
    expect(result.current.pct).toBe(0);
  });

  it("leads with the measured prompt and estimates the reply that followed it", () => {
    const { result } = renderHook(() =>
      useTokenEstimator(
        [
          { id: 1, role: "user", content: "a".repeat(40) },
          {
            id: 2,
            role: "assistant",
            content: "b".repeat(20),
            promptTokens: 1000,
            evalTokens: 200,
          },
        ],
        131_072,
      ),
    );
    // 1000 measured + 20/4 for the reply. Completion tokens are not added:
    // they count thinking, which is never replayed into the next prompt.
    expect(result.current.used).toBe(1005);
  });

  it("grows from the measured total as a new turn streams in", () => {
    const settled: TokenizedMessage[] = [
      { id: 1, role: "user", content: "a".repeat(40) },
      {
        id: 2,
        role: "assistant",
        content: "b".repeat(20),
        promptTokens: 30_000,
        evalTokens: 1_000,
      },
    ];
    const measured = renderHook(() => useTokenEstimator(settled, 131_072));
    expect(measured.result.current.used).toBe(30_005);

    // Sending and streaming must build on the measured figure, never replace
    // it with a guess: message text cannot see tool schemas or images.
    const sending = renderHook(() =>
      useTokenEstimator(
        [...settled, { id: 3, role: "user", content: "c".repeat(40) }],
        131_072,
      ),
    );
    expect(sending.result.current.used).toBe(30_015);

    const streaming = renderHook(() =>
      useTokenEstimator(
        [
          ...settled,
          { id: 3, role: "user", content: "c".repeat(40) },
          { id: 4, role: "assistant", content: "d".repeat(80) },
        ],
        131_072,
      ),
    );
    expect(streaming.result.current.used).toBe(30_035);
  });

  it("anchors past rows without usage instead of zeroing on them", () => {
    // The latest turn aborted before the server reported usage; the anchor
    // must fall back to the last measured turn, not collapse to text guesses.
    const { result } = renderHook(() =>
      useTokenEstimator(
        [
          { id: 1, role: "user", content: "a".repeat(40) },
          {
            id: 2,
            role: "assistant",
            content: "b".repeat(20),
            promptTokens: 30_000,
            evalTokens: 1_000,
          },
          { id: 3, role: "user", content: "c".repeat(400) },
          { id: 4, role: "assistant", content: "d".repeat(400) },
        ],
        131_072,
      ),
    );
    // 30k measured, plus (20 + 400 + 400)/4 = 205 estimated from the anchor on.
    expect(result.current.used).toBe(30_205);
  });

  it("falls back to default context when contextLength is null", () => {
    const { result } = renderHook(() =>
      useTokenEstimator([{ id: 1, role: "user", content: "hi" }], null),
    );
    expect(result.current.ctx).toBe(DEFAULT_CONTEXT);
  });
});

describe("projectedUsedTokens", () => {
  it("projects summary + post-boundary messages when compacted", () => {
    const msgs: TokenizedMessage[] = [
      { id: 1, role: "user", content: "a".repeat(4000) },
      { id: 2, role: "assistant", content: "b".repeat(4000) },
      { id: 3, role: "user", content: "c".repeat(400) },
      { id: 4, role: "assistant", content: "d".repeat(400) },
    ];
    const used = projectedUsedTokens(msgs, {
      summary: "s".repeat(800),
      summaryUpto: 2,
    });
    // 800/4 = 200 (summary) + (400 + 400)/4 = 200 (post-boundary) = 400.
    expect(used).toBe(400);
  });

  it("ignores a measurement taken before the summary boundary", () => {
    // That turn was billed for the messages the summary has since replaced,
    // so reusing its number would keep the meter pinned after a compaction.
    const msgs: TokenizedMessage[] = [
      {
        id: 1,
        role: "assistant",
        content: "a".repeat(40),
        promptTokens: 50_000,
      },
      { id: 3, role: "user", content: "c".repeat(400) },
    ];
    expect(
      projectedUsedTokens(msgs, { summary: "s".repeat(800), summaryUpto: 2 }),
    ).toBe(300);
  });

  it("uses the first measurement taken after a compaction", () => {
    const msgs: TokenizedMessage[] = [
      { id: 1, role: "assistant", content: "a", promptTokens: 50_000 },
      { id: 3, role: "user", content: "c".repeat(400) },
      {
        id: 4,
        role: "assistant",
        content: "d".repeat(400),
        promptTokens: 9_000,
      },
    ];
    expect(
      projectedUsedTokens(msgs, { summary: "s".repeat(800), summaryUpto: 2 }),
    ).toBe(9_100);
  });

  it("falls back to the measured anchor when nothing is compacted", () => {
    const msgs: TokenizedMessage[] = [
      { id: 1, role: "user", content: "a".repeat(40) },
      {
        id: 2,
        role: "assistant",
        content: "b".repeat(20),
        promptTokens: 1000,
        evalTokens: 100,
      },
    ];
    expect(projectedUsedTokens(msgs, { summary: null, summaryUpto: 0 })).toBe(
      1005,
    );
  });

  it("refuses to anchor on a row flagged as a chars/4 estimate", () => {
    const msgs: TokenizedMessage[] = [
      {
        id: 2,
        role: "assistant",
        content: "b".repeat(20),
        promptTokens: 50_000,
        tokensMeasured: false,
      },
      { id: 3, role: "user", content: "c".repeat(400) },
    ];
    // The fake 50k anchor is skipped: the meter falls back to estimating
    // every live message instead of trusting a guess.
    expect(projectedUsedTokens(msgs, { summary: null, summaryUpto: 0 })).toBe(
      (20 + 400) / 4,
    );
  });

  it("still anchors on a legacy row with no flag", () => {
    const msgs: TokenizedMessage[] = [
      {
        id: 2,
        role: "assistant",
        content: "",
        promptTokens: 4_000,
      },
      { id: 3, role: "user", content: "c".repeat(400) },
    ];
    expect(projectedUsedTokens(msgs, { summary: null, summaryUpto: 0 })).toBe(
      4_100,
    );
  });

  it("counts only non-system messages after the boundary", () => {
    const msgs: TokenizedMessage[] = [
      { id: 0, role: "system", content: "s".repeat(10_000) },
      { id: 3, role: "user", content: "c".repeat(400) },
    ];
    expect(projectedUsedTokens(msgs, { summary: "x", summaryUpto: 2 })).toBe(
      100,
    );
  });
});

describe("useTokenEstimator — meter semantics", () => {
  it("reads half a window as 50%", () => {
    const { result } = renderHook(() =>
      useTokenEstimator(
        [{ id: 1, role: "assistant", content: "", promptTokens: 2_048 }],
        4_096,
      ),
    );
    expect(result.current.pct).toBe(50);
  });

  it("reads a full window as 100%", () => {
    const { result } = renderHook(() =>
      useTokenEstimator(
        [{ id: 1, role: "assistant", content: "", promptTokens: 32_768 }],
        32_768,
      ),
    );
    expect(result.current.pct).toBe(100);
  });

  it("overflows past 100% rather than pinning", () => {
    const { result } = renderHook(() =>
      useTokenEstimator(
        [{ id: 1, role: "assistant", content: "", promptTokens: 4_600 }],
        4_096,
      ),
    );
    expect(result.current.pct).toBe(112);
  });
});

describe("projectedUsedTokens tool replay", () => {
  const measuredTurn = (
    id: number,
    promptTokens: number,
    toolResultTokens: number,
  ): TokenizedMessage => ({
    id,
    role: "assistant",
    content: "b".repeat(20),
    promptTokens,
    toolResultTokens,
  });

  it("counts the tool output the next request replays", () => {
    const msgs: TokenizedMessage[] = [
      { id: 1, role: "user", content: "a".repeat(40) },
      measuredTurn(2, 4_554, 3_000),
    ];
    // 4554 measured + 20/4 reply + 3000 replayed tool output.
    expect(projectedUsedTokens(msgs)).toBe(7_559);
  });

  it("leaves out tool output too big for the replay budget", () => {
    const msgs: TokenizedMessage[] = [
      { id: 1, role: "user", content: "a".repeat(40) },
      measuredTurn(2, 4_554, 22_000),
    ];
    expect(projectedUsedTokens(msgs)).toBe(4_559);
  });

  it("does not add an earlier turn's tool output twice", () => {
    // Turn 2's replayed output is already inside turn 4's measured prompt.
    const msgs: TokenizedMessage[] = [
      measuredTurn(2, 1_000, 2_000),
      { id: 3, role: "user", content: "c".repeat(40) },
      measuredTurn(4, 5_000, 1_000),
    ];
    expect(projectedUsedTokens(msgs)).toBe(6_005);
  });

  it("shares the budget newest first, like the server", () => {
    const msgs: TokenizedMessage[] = [
      { id: 1, role: "user", content: "" },
      { id: 2, role: "assistant", content: "", toolResultTokens: 4_000 },
      { id: 3, role: "user", content: "" },
      { id: 4, role: "assistant", content: "", toolResultTokens: 4_000 },
    ];
    // Unmeasured, so every turn is estimated; only turn 4 fits the budget.
    expect(projectedUsedTokens(msgs)).toBe(4_000);
  });
});

describe("projectedUsedTokens while a turn runs", () => {
  const settled: TokenizedMessage[] = [
    { id: 1, role: "user", content: "a".repeat(40) },
    {
      id: 2,
      role: "assistant",
      content: "b".repeat(20),
      promptTokens: 4_554,
    },
    { id: 3, role: "user", content: "c".repeat(40) },
  ];

  it("shows the size of the request the model is working on now", () => {
    const msgs: TokenizedMessage[] = [
      ...settled,
      { id: 4, role: "assistant", content: "", livePromptTokens: 26_944 },
    ];
    expect(projectedUsedTokens(msgs)).toBe(26_944);
  });

  it("never reads lower than the projection", () => {
    const msgs: TokenizedMessage[] = [
      ...settled,
      { id: 4, role: "assistant", content: "", livePromptTokens: 100 },
    ];
    expect(projectedUsedTokens(msgs)).toBe(4_569);
  });
});
