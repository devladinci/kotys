import { describe, expect, it } from "vitest";
import {
  budgetStop,
  CONTEXT_HEADROOM_TOKENS,
  MAX_TOOL_ROUNDS,
  MAX_TOOL_RESULT_BYTES,
} from "./turnWrapUp.js";

describe("budgetStop", () => {
  it("runs free below all budgets", () => {
    expect(budgetStop(0, 0)).toBeNull();
    expect(
      budgetStop(
        MAX_TOOL_ROUNDS - 1,
        MAX_TOOL_RESULT_BYTES - 1,
        10_000,
        100_000,
      ),
    ).toBeNull();
  });

  it("stops on rounds first, then bytes", () => {
    expect(budgetStop(MAX_TOOL_ROUNDS, 0)).toBe("rounds");
    expect(budgetStop(MAX_TOOL_ROUNDS, MAX_TOOL_RESULT_BYTES)).toBe("rounds");
    expect(budgetStop(MAX_TOOL_ROUNDS - 1, MAX_TOOL_RESULT_BYTES)).toBe(
      "bytes",
    );
  });

  it("stops on server-reported prompt size nearing the context window", () => {
    // 32K window (oMLX's Qwen3.8): prompt + headroom crossing it trips.
    expect(budgetStop(5, 0, 32_768 - CONTEXT_HEADROOM_TOKENS, 32_768)).toBe(
      "context",
    );
    // Headroom keeps the loop running well before the boundary.
    expect(budgetStop(5, 0, 20_000, 32_768)).toBeNull();
    // No reported usage yet -> no token stop.
    expect(budgetStop(5, 0, 0, 32_768)).toBeNull();
  });

  it("token watch is off without a context limit", () => {
    expect(budgetStop(5, 0, 5_000_000)).toBeNull();
  });
});
