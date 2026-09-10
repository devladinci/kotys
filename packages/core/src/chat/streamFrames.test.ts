import { describe, expect, it } from "vitest";
import type { ChatStreamResult } from "@kotys/contracts";
import {
  applyChunk,
  applyDone,
  applyToolActivity,
  classifyFrame,
} from "./streamFrames.js";
import type { Message } from "./types.js";

const msg = (id: number, content = ""): Message => ({
  id,
  role: "assistant",
  content,
});

const done = (content: string): ChatStreamResult => ({
  content,
  thinking: "",
  promptTokens: 0,
  evalTokens: 0,
  toolCalls: [],
});

describe("classifyFrame", () => {
  it("routes own stream frames as own regardless of chatId", () => {
    expect(classifyFrame(42, undefined, 42, 7)).toBe("own");
    expect(classifyFrame(42, 7, 42, 7)).toBe("own");
    expect(classifyFrame(42, 9, 42, 7)).toBe("own");
  });

  it("routes foreign frames only when they carry the open chat", () => {
    expect(classifyFrame(99, 7, 42, 7)).toBe("visible");
    expect(classifyFrame(99, 8, 42, 7)).toBe("ignore");
    // Legacy server / owner never sent a chatId: nothing to scope with.
    expect(classifyFrame(99, undefined, 42, 7)).toBe("ignore");
  });

  it("ignores foreign frames when no stream of ours is running", () => {
    expect(classifyFrame(99, 7, null, 7)).toBe("visible");
    expect(classifyFrame(99, 8, null, 7)).toBe("ignore");
  });
});

describe("applyChunk", () => {
  it("appends deltas to the matching message", () => {
    const messages = [msg(1, "a"), msg(2, "")];
    const next = applyChunk(messages, 2, "th", "bc");
    expect(next[0].content).toBe("a");
    expect(next[1].content).toBe("bc");
    expect(next[1].thinking).toBe("th");
    // Original untouched.
    expect(messages[1].content).toBe("");
  });

  it("returns the same array when the message is missing", () => {
    const messages = [msg(1)];
    expect(applyChunk(messages, 404, "x", "y")).toBe(messages);
  });
});

describe("applyToolActivity", () => {
  it("appends activity and drops sparse holes like the live path does", () => {
    const messages = [{ ...msg(1), toolCalls: [{ tool: "search" } as never] }];
    const next = applyToolActivity(messages, 1, 2, { tool: "bash" } as never);
    // Index 2 was never filled in (gap in live events), so the hole is
    // compacted away — same behavior useChat's collector has always had.
    expect(next[0].toolCalls?.map((t) => t.tool)).toEqual(["search", "bash"]);
  });

  it("creates the list from nothing", () => {
    const next = applyToolActivity([msg(1)], 1, 0, { tool: "bash" } as never);
    expect(next[0].toolCalls?.[0]?.tool).toBe("bash");
  });

  it("returns the same array when the message is missing", () => {
    const messages = [msg(1)];
    expect(applyToolActivity(messages, 404, 0, { tool: "x" } as never)).toBe(
      messages,
    );
  });
});

describe("applyDone", () => {
  it("replaces content with the final result", () => {
    const next = applyDone([msg(1, "partial")], 1, done("final"));
    expect(next[0].content).toBe("final");
  });

  it("keeps streamed content when the result is empty", () => {
    const next = applyDone([msg(1, "streamed")], 1, done(""));
    expect(next[0].content).toBe("streamed");
  });

  it("stamps nothing else", () => {
    const next = applyDone([msg(1)], 1, done("x"));
    expect(next[0].model).toBeUndefined();
  });
});
