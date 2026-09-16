import { describe, expect, it } from "vitest";
import type { ToolActivity } from "@kotys/contracts";
import { parseTrace, splitReplyAtSteers } from "./steers.js";

const call = (tool: string): ToolActivity => ({ tool, status: "done" });
const steer = (text: string, textOffset?: number): ToolActivity => ({
  tool: "steer",
  status: "done",
  textOffset,
  widget: { kind: "steer", text },
});

describe("parseTrace", () => {
  it("reads junk as an empty trace", () => {
    expect(parseTrace(null)).toEqual([]);
    expect(parseTrace(undefined)).toEqual([]);
    expect(parseTrace("not json")).toEqual([]);
    expect(parseTrace('{"tool":"list"}')).toEqual([]);
  });
});

describe("splitReplyAtSteers", () => {
  it("returns one part spanning every call when nothing was steered", () => {
    expect(splitReplyAtSteers("answer", [call("list"), null])).toEqual([
      {
        kind: "reply",
        text: "answer",
        afterCall: -1,
        beforeCall: Number.POSITIVE_INFINITY,
      },
    ]);
  });

  it("splits at each steer and windows the calls around it", () => {
    const parts = splitReplyAtSteers("aaa bbb ccc", [
      call("list"),
      steer("first", 4),
      call("read_file"),
      steer("second", 8),
    ]);
    expect(parts).toEqual([
      { kind: "reply", text: "aaa ", afterCall: -1, beforeCall: 1 },
      { kind: "steer", text: "first" },
      { kind: "reply", text: "bbb ", afterCall: 1, beforeCall: 3 },
      { kind: "steer", text: "second" },
      {
        kind: "reply",
        text: "ccc",
        afterCall: 3,
        beforeCall: Number.POSITIVE_INFINITY,
      },
    ]);
  });

  it("clamps offsets into the text and never runs backwards", () => {
    const parts = splitReplyAtSteers("short", [
      steer("a", 3),
      steer("b", 1),
      steer("c", 99),
      steer("d"),
    ]);
    expect(
      parts.map((p) => (p.kind === "steer" ? `[${p.text}]` : p.text)),
    ).toEqual(["sho", "[a]", "", "[b]", "rt", "[c]", "", "[d]", ""]);
  });
});
