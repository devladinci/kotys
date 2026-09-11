import { describe, expect, it } from "vitest";
import { Camera, Monitor } from "lucide-react";
import type { ToolActivity } from "@kotys/contracts";
import {
  describeTool,
  humanizeToolName,
  shortenPath,
  toolTone,
  TOOL_ICONS,
} from "./toolDisplay";

const activity = (partial: Partial<ToolActivity>): ToolActivity => ({
  tool: "web_search",
  status: "done",
  ...partial,
});

describe("humanizeToolName", () => {
  it("conjugates a leading verb and keeps acronyms and product names", () => {
    expect(humanizeToolName("searchJiraIssuesUsingJql", false)).toBe(
      "Searched Jira issues using JQL",
    );
    expect(humanizeToolName("searchJiraIssuesUsingJql", true)).toBe(
      "Searching Jira issues using JQL",
    );
  });

  it("moves a trailing verb to the front", () => {
    expect(humanizeToolName("pull_request_read", false)).toBe(
      "Read pull request",
    );
  });

  it("drops a leading server name", () => {
    expect(humanizeToolName("slack_read_channel", false, "slack")).toBe(
      "Read channel",
    );
    expect(humanizeToolName("atlassianUserInfo", false, "atlassian")).toBe(
      "Called user info",
    );
  });

  it("strips an mcp__server__ prefix", () => {
    expect(humanizeToolName("mcp__linear__list_issues", false)).toBe(
      "Listed issues",
    );
  });

  it("falls back to a neutral verb when the name has none", () => {
    expect(humanizeToolName("weather_forecast", true)).toBe(
      "Calling weather forecast",
    );
  });

  it("keeps a bare verb name intact", () => {
    expect(humanizeToolName("search", false)).toBe("Searched");
  });
});

describe("shortenPath", () => {
  it("keeps short paths untouched", () => {
    expect(shortenPath("~/projects/app/main.ts")).toBe(
      "~/projects/app/main.ts",
    );
  });

  it("truncates from the left so the file name survives", () => {
    const long = `/Users/someone/${"nested/".repeat(12)}main.ts`;
    const short = shortenPath(long);
    expect(short.startsWith("…/")).toBe(true);
    expect(short.endsWith("main.ts")).toBe(true);
    expect(short.length).toBeLessThanOrEqual(60);
  });
});

describe("TOOL_ICONS", () => {
  // Keep in sync with apps/api/src/tools/index.ts — the registry is the
  // source of truth; this list is the UI-side snapshot asserting every
  // built-in tool renders with an icon in the settings list and timeline.
  const BUILTIN_TOOL_NAMES = [
    "apply_patch",
    "bash",
    "capture_screen",
    "complete_todo",
    "create_memory",
    "create_todo",
    "current_datetime",
    "delete_memory",
    "delete_todo",
    "get_chat",
    "grep",
    "list",
    "list_chats",
    "list_todos",
    "read_file",
    "request_user_input",
    "search_chats",
    "search_memories",
    "start_pomodoro",
    "update_memory",
    "update_todo",
    "web_fetch",
    "web_search",
    "write_file",
  ];

  it("covers every built-in tool (mcp_load_tools is the synthetic loader)", () => {
    for (const name of BUILTIN_TOOL_NAMES) {
      expect(TOOL_ICONS[name], `${name} has no icon`).toBeDefined();
    }
    expect(Object.keys(TOOL_ICONS).sort()).toEqual(
      [...BUILTIN_TOOL_NAMES, "mcp_load_tools"].sort(),
    );
  });
});

describe("describeTool", () => {
  it("labels built-in tools by tense", () => {
    expect(
      describeTool(activity({ tool: "web_search", query: "ollama" })).label,
    ).toBe('Searched the web for "ollama"');
    expect(
      describeTool(
        activity({ tool: "bash", query: "ls -la", status: "running" }),
      ).label,
    ).toBe("Running ls -la");
  });

  it("labels memory tools instead of falling through to the generic case", () => {
    expect(
      describeTool(activity({ tool: "create_memory", query: "likes-vitest" }))
        .label,
    ).toBe("Saved memory likes-vitest");
  });

  it("phrases an input request around the question", () => {
    expect(
      describeTool(
        activity({ tool: "request_user_input", query: "Which case?" }),
      ).label,
    ).toBe('Asked "Which case?"');
    expect(
      describeTool(activity({ tool: "request_user_input", status: "running" }))
        .label,
    ).toBe("Asking you a question");
  });

  it("surfaces the server and argument summary for MCP tools", () => {
    const { label, server } = describeTool(
      activity({
        tool: "searchJiraIssuesUsingJql",
        server: "atlassian",
        query: "project = INC",
      }),
    );
    expect(label).toBe("Searched Jira issues using JQL: project = INC");
    expect(server).toBe("atlassian");
  });

  it("leaves no server tag on unknown non-MCP tools", () => {
    expect(
      describeTool(activity({ tool: "mystery_tool" })).server,
    ).toBeUndefined();
  });

  it("labels the schema loader without claiming MCP", () => {
    expect(
      describeTool(activity({ tool: "mcp_load_tools", query: "bash" })).label,
    ).toBe("Loaded tool schemas: bash");
    expect(
      describeTool(activity({ tool: "mcp_load_tools", status: "running" }))
        .label,
    ).toBe("Loading tool schemas");
  });

  it("labels capture_screen by target and state", () => {
    const running = describeTool(
      activity({ tool: "capture_screen", status: "running" }),
    );
    expect(running.label).toBe("Capturing the screen");
    expect(running.Icon).toBe(Camera);

    const captured = describeTool(
      activity({ tool: "capture_screen", query: "the screen" }),
    );
    expect(captured.label).toBe("Captured the screen");
    expect(captured.Icon).toBe(Camera);

    const window = describeTool(
      activity({ tool: "capture_screen", query: "Safari" }),
    );
    expect(window.label).toBe("Captured Safari");
    expect(window.Icon).toBe(Camera);

    const unchanged = describeTool(
      activity({
        tool: "capture_screen",
        query: "the screen",
        unchanged: true,
      }),
    );
    expect(unchanged.label).toBe("Captured the screen (unchanged)");
    expect(unchanged.Icon).toBe(Monitor);

    const windowUnchanged = describeTool(
      activity({ tool: "capture_screen", query: "Safari", unchanged: true }),
    );
    expect(windowUnchanged.label).toBe("Captured Safari (unchanged)");
    expect(windowUnchanged.Icon).toBe(Monitor);
  });

  it("puts capture_screen in the shell tone", () => {
    expect(toolTone(activity({ tool: "capture_screen" }))).toBe("shell");
  });
});
