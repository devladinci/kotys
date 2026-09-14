import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearTokenAccountingLog,
  COMPACT_FAILURE_SUPPRESS_MS,
  COMPACT_RETRY_COOLDOWN_MS,
  estimatePromptFromMessages,
  getTokenAccountingLog,
  logTokenAccounting,
  onTokenAccountingEvent,
  recordCompactFailure,
  recordTurnUsage,
  shouldAttemptCompact,
  type TokenAccountingEvent,
} from "./context-budget.js";
import { IMAGE_TOKENS } from "@kotys/contracts";

const listen = () => {
  const seen: TokenAccountingEvent[] = [];
  const off = onTokenAccountingEvent((e) => seen.push(e));
  return { seen, off };
};

beforeEach(() => clearTokenAccountingLog());

afterEach(() => clearTokenAccountingLog());

describe("logTokenAccounting", () => {
  it("emits and records events", () => {
    const { seen, off } = listen();
    logTokenAccounting("compact-failed", { chatId: 7, detail: "x" });
    off();
    logTokenAccounting("compact-failed", { chatId: 8, detail: "y" });

    expect(seen).toHaveLength(1);
    expect(seen[0].kind).toBe("compact-failed");
    expect(seen[0].chatId).toBe(7);
    expect(seen[0].detail).toBe("x");
    expect(getTokenAccountingLog()).toHaveLength(2);
  });

  it("tolerates a listener that throws", () => {
    onTokenAccountingEvent(() => {
      throw new Error("boom");
    });
    expect(() =>
      logTokenAccounting("estimate-fallback", { detail: "d" }),
    ).not.toThrow();
  });
});

describe("estimatePromptFromMessages", () => {
  it("sums text, images and tool payloads by the shared chars/4 rule", () => {
    const total = estimatePromptFromMessages([
      { role: "system", content: "x".repeat(400) },
      {
        role: "user",
        content: "y".repeat(80),
        images: ["data:image/png;base64,AAAA"],
      },
      {
        role: "assistant",
        content: "",
        toolResults: [{ toolName: "t", content: "z".repeat(80) }],
      },
    ]);
    // Images bill flat per IMAGE_TOKENS; the base64 wrapper is noise.
    expect(total).toBe(100 + 20 + IMAGE_TOKENS + 20);
  });

  it("ignores messages without content", () => {
    expect(
      estimatePromptFromMessages([
        { role: "user" },
        { role: "assistant", content: "abcd" },
      ]),
    ).toBe(1);
  });

  it("returns zero for an empty request", () => {
    expect(estimatePromptFromMessages([])).toBe(0);
  });
});

describe("recordTurnUsage", () => {
  it("keeps measured counts and marks them measured", () => {
    const stored = recordTurnUsage({ promptTokens: 3_012, evalTokens: 410 });
    expect(stored).toEqual({
      promptTokens: 3_012,
      evalTokens: 410,
      tokensMeasured: true,
    });
  });

  it("marks the chars/4 fallback as unmeasured", () => {
    const stored = recordTurnUsage({
      promptTokens: 0,
      evalTokens: 0,
      estimate: 100,
    });
    expect(stored).toEqual({
      promptTokens: 100,
      evalTokens: 0,
      tokensMeasured: false,
    });
  });

  it("never returns negative counts", () => {
    const stored = recordTurnUsage({ promptTokens: -5, evalTokens: -1 });
    expect(stored.promptTokens).toBe(0);
    expect(stored.evalTokens).toBe(0);
    expect(stored.tokensMeasured).toBe(false);
  });
});

describe("compact failure backoff", () => {
  it("suppresses a repeat inside the window", () => {
    const now = 1_000_000;
    expect(recordCompactFailure(7, "a", now)).toBe(true);
    const allowed = recordCompactFailure(7, "b", now + 1);
    expect(allowed).toBe(false);
    expect(getTokenAccountingLog()).toHaveLength(1);
  });

  it("allows a new failure after the window passes", () => {
    const now = 1_000_000;
    expect(recordCompactFailure(7, "a", now)).toBe(true);
    const allowed = recordCompactFailure(
      7,
      "b",
      now + COMPACT_FAILURE_SUPPRESS_MS + 1,
    );
    expect(allowed).toBe(true);
    expect(getTokenAccountingLog()).toHaveLength(2);
  });

  it("tracks each chat separately", () => {
    const now = 1_000_000;
    expect(recordCompactFailure(7, "a", now)).toBe(true);
    expect(recordCompactFailure(7, "b", now + 1)).toBe(false);
    expect(recordCompactFailure(8, "a", now + 2)).toBe(true);
  });
});

describe("shouldAttemptCompact", () => {
  it("allows an attempt when nothing failed before", () => {
    expect(shouldAttemptCompact(7, 1_000_000)).toBe(true);
  });

  it("blocks retries right after a failure", () => {
    recordCompactFailure(7, "a", 1_000_000);
    expect(shouldAttemptCompact(7, 1_000_000 + 1)).toBe(false);
  });

  it("unblocks after the cooldown", () => {
    recordCompactFailure(7, "a", 1_000_000);
    expect(
      shouldAttemptCompact(7, 1_000_000 + COMPACT_RETRY_COOLDOWN_MS + 1),
    ).toBe(true);
  });

  it("tracks each chat separately", () => {
    recordCompactFailure(7, "a", 1_000_000);
    expect(shouldAttemptCompact(8, 1_000_000 + 1)).toBe(true);
  });
});
