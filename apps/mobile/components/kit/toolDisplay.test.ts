import { describe, expect, it } from "vitest";
import type { ToolActivity } from "@kotys/contracts";
import { humanizeTool, toolTone } from "./toolDisplay";

const ACCENT = "#accent";
const MUTED = "#muted";

const call = (partial: Partial<ToolActivity>): ToolActivity => ({
  tool: "read_file",
  status: "done",
  ...partial,
});

describe("toolTone", () => {
  it("flags any failed call, whatever the tool", () => {
    const tone = toolTone(
      call({ tool: "bash", status: "error" }),
      ACCENT,
      MUTED,
    );
    expect(tone.icon).toBe("alert-circle-outline");
  });

  it("gives web, shell, write and read tools their own icons", () => {
    expect(toolTone(call({ tool: "web_search" }), ACCENT, MUTED).icon).toBe(
      "globe-outline",
    );
    expect(toolTone(call({ tool: "bash" }), ACCENT, MUTED).icon).toBe(
      "terminal-outline",
    );
    expect(toolTone(call({ tool: "apply_patch" }), ACCENT, MUTED).icon).toBe(
      "create-outline",
    );
    expect(toolTone(call({ tool: "grep" }), ACCENT, MUTED)).toEqual({
      color: ACCENT,
      icon: "document-text-outline",
    });
  });

  it("matches memory, todo and pomodoro tools by name fragment", () => {
    expect(toolTone(call({ tool: "create_memory" }), ACCENT, MUTED).icon).toBe(
      "headset-outline",
    );
    expect(toolTone(call({ tool: "complete_todo" }), ACCENT, MUTED).icon).toBe(
      "checkbox-outline",
    );
    expect(toolTone(call({ tool: "start_pomodoro" }), ACCENT, MUTED).icon).toBe(
      "timer-outline",
    );
  });

  it("falls back to a cube for MCP servers and a bolt for anything else", () => {
    expect(
      toolTone(call({ tool: "jira_thing", server: "jira" }), ACCENT, MUTED),
    ).toEqual({ color: MUTED, icon: "cube-outline" });
    expect(toolTone(call({ tool: "jira_thing" }), ACCENT, MUTED)).toEqual({
      color: MUTED,
      icon: "flash-outline",
    });
  });
});

describe("humanizeTool", () => {
  it("prefers a trimmed query", () => {
    expect(humanizeTool(call({ query: "  hello world  " }))).toBe(
      "hello world",
    );
  });

  it("truncates a query longer than 42 characters", () => {
    const long = "x".repeat(43);
    expect(humanizeTool(call({ query: long }))).toBe(`${"x".repeat(40)}…`);
    expect(humanizeTool(call({ query: "y".repeat(42) }))).toBe("y".repeat(42));
  });

  it("shows host and path for a url, and the raw value when it is not one", () => {
    expect(
      humanizeTool(call({ tool: "web_fetch", url: "https://a.dev/x?q=1" })),
    ).toBe("a.dev/x");
    expect(humanizeTool(call({ tool: "web_fetch", url: "not a url" }))).toBe(
      "not a url",
    );
  });

  it("shows the file name of a path", () => {
    expect(humanizeTool(call({ filePath: "/a/b/notes.md" }))).toBe("notes.md");
  });

  it("falls back to the tool name without underscores or mcp prefix", () => {
    expect(humanizeTool(call({ tool: "mcp_list_issues" }))).toBe("list issues");
  });
});
