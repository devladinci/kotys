import { describe, expect, it } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ToolActivity } from "@kotys/contracts";
import ToolCallTimeline from "./widgets/ToolCallTimeline";
import { formatDuration } from "./toolDisplay";

const activity = (partial: Partial<ToolActivity>): ToolActivity => ({
  tool: "web_search",
  status: "done",
  ...partial,
});

const T0 = 1_000_000;

const timed = (
  startedAt: number,
  durationMs: number,
  partial: Partial<ToolActivity> = {},
): ToolActivity =>
  activity({
    startedAt: T0 + startedAt,
    endedAt: T0 + startedAt + durationMs,
    durationMs,
    turnStartedAt: T0,
    ...partial,
  });

/** The timeline starts expanded; tests that assert on the collapsed quiet
 * line collapse it first. */
const collapseTimeline = () => {
  fireEvent.click(screen.getByRole("button", { name: /tool(s)? ·/ }));
};

describe("ToolCallTimeline", () => {
  it("shows the expanded strip by default and collapses to a quiet line on click", () => {
    render(
      <ToolCallTimeline
        isStreaming={false}
        calls={[
          timed(500, 2000, {
            tool: "web_search",
            query: "oauth",
            turnEndedAt: T0 + 2500,
          }),
        ]}
      />,
    );
    // Expanded by default: the strip segments are rendered.
    expect(screen.getByRole("button", { name: /oauth/ })).toBeInTheDocument();
    collapseTimeline();
    const summary = screen.getByText(/1 tool · 2\.5s/);
    expect(summary).toBeInTheDocument();
    // No strip segments are rendered while collapsed.
    expect(screen.queryByRole("button", { name: /oauth/ })).toBeNull();
  });

  it("stays collapsed while a widget call renders its card", () => {
    render(
      <ToolCallTimeline
        isStreaming={false}
        calls={[
          activity({
            tool: "create_todo",
            widget: {
              kind: "todo",
              action: "created",
              id: 1,
              title: "Review the PR",
            },
          }),
        ]}
      />,
    );
    expect(screen.getByText("Review the PR")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /todo/ })).toBeNull();
  });

  it("lays calls out on one full-width, gapless timeline with LLM spans when expanded", async () => {
    render(
      <ToolCallTimeline
        isStreaming={false}
        calls={[
          timed(500, 2000, { tool: "web_search", query: "oauth" }),
          timed(4000, 500, { tool: "read_file", filePath: "~/app/main.ts" }),
        ]}
      />,
    );

    // Segments mount as icon pills and then grow to size over an animation
    // frame — let the mount flip land before asserting final proportions.
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(r));
    });
    // 500ms lead + 2000ms search + 1500ms generation + 500ms read + 0 trailing
    // (LLM spans display-compress at ms^0.75)
    const lead = screen.getByRole("button", { name: /thought before/ });
    const search = screen.getByRole("button", { name: /oauth/ });
    const gen = screen.getByRole("button", { name: /between calls/ });
    const read = screen.getByRole("button", { name: /main.ts/ });
    expect(lead.style.flexGrow).toBe(String(Math.pow(500, 0.75)));
    expect(search.style.flexGrow).toBe("2000");
    expect(gen.style.flexGrow).toBe(String(Math.pow(1500, 0.75)));
    expect(read.style.flexGrow).toBe("500");
    // LLM spans carry their own icon so model time is identifiable.
    expect(lead.querySelector("svg")).not.toBeNull();
    expect(gen.querySelector("svg")).not.toBeNull();

    const track = search.parentElement as HTMLElement;
    expect(track.className).toContain("w-full");
    expect(track.className).not.toMatch(/gap-/);
    expect(track.className).toContain("rounded");
  });

  it("shows tool params and results in the hover modal, then hides it", async () => {
    render(
      <ToolCallTimeline
        isStreaming={false}
        calls={[
          timed(500, 1500, {
            tool: "searchJiraIssuesUsingJql",
            server: "atlassian",
            query: "project = INC",
            results: [{ title: "INC-1035 Copilot", url: "" }],
          }),
        ]}
      />,
    );

    const chip = screen.getByRole("button", { name: /Searched Jira/ });
    fireEvent.mouseEnter(chip);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    expect(screen.getByText("project = INC")).toBeInTheDocument();
    expect(screen.getByText("INC-1035 Copilot")).toBeInTheDocument();
    expect(screen.getByText("1.5s")).toBeInTheDocument();

    fireEvent.mouseLeave(chip);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("shows a failed call's error in the hover modal", () => {
    render(
      <ToolCallTimeline
        isStreaming={false}
        calls={[
          timed(0, 300, {
            tool: "slack_read_channel",
            server: "slack",
            status: "error",
            error: "channel_not_found",
          }),
        ]}
      />,
    );

    const chip = screen.getByRole("button", { name: /Read channel/ });
    expect(chip.className).toContain("bg-tl-error");
    fireEvent.mouseEnter(chip);
    expect(screen.getByText("channel_not_found")).toBeInTheDocument();
  });

  it("summarises tool count and total vs tool time when expanded", () => {
    render(
      <ToolCallTimeline
        isStreaming={false}
        calls={[
          timed(1000, 1000),
          timed(4000, 2500, {
            tool: "grep",
            query: "x",
            turnEndedAt: T0 + 9000,
          }),
        ]}
      />,
    );

    expect(
      screen.getByText("2 tools · 9.0s total · 3.5s in tools"),
    ).toBeInTheDocument();
  });

  it("derives missing startedAt from endedAt - durationMs (pre-fix history)", () => {
    render(
      <ToolCallTimeline
        isStreaming={false}
        calls={[
          activity({
            startedAt: undefined,
            endedAt: T0 + 3500,
            durationMs: 1000,
            turnStartedAt: T0,
          }),
          activity({
            tool: "grep",
            startedAt: undefined,
            endedAt: T0 + 9000,
            durationMs: 2500,
            turnEndedAt: T0 + 9500,
          }),
        ]}
      />,
    );

    // Without the derivation the gap after call 0 would stretch to "now";
    // derived starts keep the total at the true turn span (lead 2.5s is
    // unknowable when startedAt is absent, so it's excluded).
    expect(
      screen.getByText("2 tools · 7.0s total · 3.5s in tools"),
    ).toBeInTheDocument();
  });

  it("renders widget calls and their cards", () => {
    render(
      <ToolCallTimeline
        isStreaming={false}
        calls={[
          activity({
            tool: "create_todo",
            widget: {
              kind: "todo",
              action: "created",
              id: 1,
              title: "Review the PR",
            },
          }),
        ]}
      />,
    );
    expect(screen.getByText("Review the PR")).toBeInTheDocument();
  });

  it("formats durations compactly", () => {
    expect(formatDuration(420)).toBe("420ms");
    expect(formatDuration(1500)).toBe("1.5s");
    expect(formatDuration(23_400)).toBe("23s");
    expect(formatDuration(65_000)).toBe("1m 05s");
  });
});
