import { describe, expect, it } from "vitest";
import {
  applyConnectorRoundUsage,
  emptyUsage,
  type ConnectorRoundCounts,
} from "./usage.js";

const EMPTY = emptyUsage();

const round = (
  promptTokens: number,
  evalTokens: number,
): ConnectorRoundCounts => ({
  promptTokens,
  evalTokens,
});

describe("applyConnectorRoundUsage", () => {
  it("sums completion tokens across a tool loop; keeps the peak prompt", () => {
    // Every round's output is real generated text, so a 40-round turn must
    // report all 40 rounds' completions, not just the last round's.
    let usage = applyConnectorRoundUsage(EMPTY, round(1000, 50));
    usage = applyConnectorRoundUsage(usage, round(9000, 80));
    usage = applyConnectorRoundUsage(usage, round(14_000, 120));
    expect(usage.promptTokens).toBe(14_000); // max — round N re-sends N-1
    expect(usage.evalTokens).toBe(250); // 50 + 80 + 120
  });

  it("holds the first round's prompt apart from the peak", () => {
    let usage = applyConnectorRoundUsage(EMPTY, round(1000, 50));
    usage = applyConnectorRoundUsage(usage, round(14_000, 80));
    expect(usage.basePromptTokens).toBe(1000);
    expect(usage.promptTokens).toBe(14_000);
  });

  it("takes the first reported prompt even when earlier rounds reported none", () => {
    let usage = applyConnectorRoundUsage(EMPTY, {});
    usage = applyConnectorRoundUsage(usage, round(1200, 20));
    expect(usage.basePromptTokens).toBe(1200);
  });

  it("holds prior counts when a round reports none", () => {
    let usage = applyConnectorRoundUsage(EMPTY, round(1000, 50));
    usage = applyConnectorRoundUsage(usage, {});
    expect(usage).toEqual({
      promptTokens: 1000,
      basePromptTokens: 1000,
      evalTokens: 50,
    });
  });

  it("reports zero for a turn whose rounds never reported usage", () => {
    let usage = applyConnectorRoundUsage(EMPTY, {});
    usage = applyConnectorRoundUsage(usage, {});
    expect(usage).toEqual({
      promptTokens: 0,
      basePromptTokens: 0,
      evalTokens: 0,
    });
  });
});
