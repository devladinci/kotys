import { describe, expect, it, beforeEach } from "vitest";
import type { ChatStreamResult } from "@kotys/contracts";
import { estimateTokens } from "@kotys/contracts";
import {
  claimLiveStream,
  releaseLiveStream,
  resetLiveStreams,
} from "./liveStreams.js";
import { applyDone, applyUsage, classifyFrame } from "./streamFrames.js";
import type { Message } from "./types.js";
import { projectedUsedTokens } from "./useTokenEstimator.js";

beforeEach(() => {
  resetLiveStreams();
});

describe("classifyFrame", () => {
  it("routes claimed request ids as own — parallel streams stay own", () => {
    claimLiveStream(42, 7);
    claimLiveStream(43, 8);
    expect(classifyFrame(42, 7, 9)).toBe("own");
    expect(classifyFrame(43, 8, 9)).toBe("own");
    expect(classifyFrame(42, 9, 9)).toBe("own");
  });

  it("releasing a claim demotes its frames to foreign routing", () => {
    claimLiveStream(42, 7);
    releaseLiveStream(42);
    expect(classifyFrame(42, 7, 7)).toBe("visible");
    expect(classifyFrame(42, 8, 7)).toBe("ignore");
  });

  it("unknown request ids route by the open chat as before", () => {
    expect(classifyFrame(99, 9, 9)).toBe("visible");
    expect(classifyFrame(99, 8, 9)).toBe("ignore");
    // Legacy server / owner never sent a chatId: nothing to scope with.
    expect(classifyFrame(99, undefined, 9)).toBe("ignore");
  });

  it("no claims at all falls back to active-chat routing", () => {
    expect(classifyFrame(99, 7, 7)).toBe("visible");
    expect(classifyFrame(99, 8, 7)).toBe("ignore");
  });
});

describe("live usage", () => {
  const turn = (): Message[] => [
    { id: 1, role: "user", content: "hi" },
    { id: 2, role: "assistant", content: "" },
  ];

  const result: ChatStreamResult = {
    content: "done",
    thinking: "",
    promptTokens: 4_554,
    evalTokens: 735,
    tokensMeasured: true,
    toolCalls: [],
    toolResultTokens: 3_000,
  };

  it("stamps the running turn's request size on its reply", () => {
    const next = applyUsage(turn(), 2, 26_944);
    expect(next[1].livePromptTokens).toBe(26_944);
    expect(next[0]).toEqual({ id: 1, role: "user", content: "hi" });
  });

  it("ignores usage for a reply this view does not hold", () => {
    const messages = turn();
    expect(applyUsage(messages, 99, 1_000)).toBe(messages);
  });

  it("hands over to the settled figures once the turn is done", () => {
    const streaming = applyUsage(turn(), 2, 26_944);
    const done = applyDone(streaming, 2, result);
    expect(done[1].livePromptTokens).toBeUndefined();
    expect(done[1].promptTokens).toBe(4_554);
    expect(done[1].toolResultTokens).toBe(3_000);
  });

  it("keeps a reply the provider never counted from anchoring the meter", () => {
    const done = applyDone(turn(), 2, {
      ...result,
      promptTokens: 9_000,
      tokensMeasured: false,
      toolResultTokens: undefined,
    });
    expect(done[1].tokensMeasured).toBe(false);
    expect(projectedUsedTokens(done)).toBe(
      estimateTokens("hi") + estimateTokens("done"),
    );
  });

  it("keeps the row's flag when a legacy daemon sends none", () => {
    const measured: Message[] = [
      { id: 1, role: "user", content: "hi" },
      { id: 2, role: "assistant", content: "", tokensMeasured: true },
    ];
    const legacy = { ...result } as Partial<ChatStreamResult>;
    delete legacy.tokensMeasured;
    const done = applyDone(measured, 2, legacy as ChatStreamResult);
    expect(done[1].tokensMeasured).toBe(true);
    expect(projectedUsedTokens(done)).toBe(
      4_554 + estimateTokens("done") + 3_000,
    );
  });
});
