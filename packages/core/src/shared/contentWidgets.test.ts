import { describe, expect, it } from "vitest";
import type { InputWidget, ToolActivity } from "@kotys/contracts";
import { splitContentByWidgets } from "./contentWidgets.js";

const inputWidget = (title: string): InputWidget => ({
  kind: "input",
  title,
  fields: [],
  answers: {},
});

const call = (partial: Partial<ToolActivity>): ToolActivity => ({
  tool: "request_user_input",
  status: "done",
  ...partial,
});

describe("splitContentByWidgets", () => {
  it("returns the whole text when no call carries a widget", () => {
    const segments = splitContentByWidgets("hello world", [
      call({ tool: "web_search" }),
    ]);
    expect(segments).toEqual([{ kind: "text", text: "hello world" }]);
  });

  it("interleaves a widget at its offset between text", () => {
    const segments = splitContentByWidgets(
      "Yes I will test it.\n\nHere is the review.",
      [
        call({
          tool: "request_user_input",
          widget: inputWidget("Q"),
          textOffset: 19,
        }),
      ],
    );
    expect(segments).toEqual([
      { kind: "text", text: "Yes I will test it." },
      { kind: "widget", widget: expect.objectContaining({ title: "Q" }) },
      { kind: "text", text: "\n\nHere is the review." },
    ]);
  });

  it("leaves a widget without a recorded offset out of the flow (legacy messages)", () => {
    const segments = splitContentByWidgets("plain answer", [
      call({ tool: "request_user_input", widget: inputWidget("old form") }),
    ]);
    expect(segments).toEqual([{ kind: "text", text: "plain answer" }]);
  });

  it("orders two widgets by offset and keeps same-offset calls in index order", () => {
    const segments = splitContentByWidgets("aaa bbb ccc", [
      call({ widget: inputWidget("second"), textOffset: 7, tool: "t" }),
      call({ tool: "web_search" }),
      call({ widget: inputWidget("first"), textOffset: 3 }),
    ]);
    expect(
      segments.map((s) => {
        if (s.kind === "text") return s.text;
        return s.widget.kind === "input" ? s.widget.title : s.widget.kind;
      }),
    ).toEqual(["aaa", "first", " bbb", "second", " ccc"]);
  });
});
