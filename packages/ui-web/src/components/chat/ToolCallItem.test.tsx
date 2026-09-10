import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ToolActivity } from "@kotys/contracts";
import { ToolCallItem } from "./widgets";

const activity = (partial: Partial<ToolActivity>): ToolActivity => ({
  tool: "web_search",
  status: "done",
  ...partial,
});

describe("ToolCallItem", () => {
  it("renders a built-in tool with past tense", () => {
    render(
      <ToolCallItem
        tc={activity({ tool: "grep", query: "oauth", filePath: "~/app" })}
      />,
    );
    expect(
      screen.getByText('Searched for "oauth" in ~/app'),
    ).toBeInTheDocument();
  });

  it("tags an MCP call with its server and expands its result preview", async () => {
    render(
      <ToolCallItem
        tc={activity({
          tool: "searchJiraIssuesUsingJql",
          server: "atlassian",
          query: "project = INC",
          results: [{ title: "INC-1035 Copilot", url: "" }],
        })}
      />,
    );
    expect(screen.getByText("atlassian")).toBeInTheDocument();
    expect(
      screen.getByText("Searched Jira issues using JQL: project = INC"),
    ).toBeInTheDocument();

    expect(screen.queryByText("INC-1035 Copilot")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { expanded: false }));
    expect(screen.getByText("INC-1035 Copilot")).toBeInTheDocument();
  });

  it("marks a failed call and shows the error when expanded", async () => {
    render(
      <ToolCallItem
        tc={activity({
          tool: "slack_read_channel",
          server: "slack",
          status: "error",
          error: "channel_not_found",
        })}
      />,
    );
    expect(screen.getByText("failed")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { expanded: false }));
    expect(screen.getByText("channel_not_found")).toBeInTheDocument();
  });
});
