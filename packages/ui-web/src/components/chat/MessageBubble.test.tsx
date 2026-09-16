import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MessageBubble } from "./MessageBubble";
import type { Message } from "@kotys/contracts";

const userMessage = (content: string): Message => ({
  id: 1,
  role: "user",
  content,
  createdAt: 0,
});

const SKILL_MESSAGE = [
  "/typescript-react-style have you followed all rules?",
  "",
  "```kotys-skill:typescript-react-style",
  "# Instructions",
  "- use IProps instead of inlined type definition.",
  "```",
].join("\n");

const noop = () => {};

const renderBubble = (message: Message) =>
  render(
    <MessageBubble
      message={message}
      isStreamingThis={false}
      isHighlighted={false}
      onImageClick={noop}
    />,
  );

describe("MessageBubble skill message", () => {
  it("renders args as text plus the skill chip, without the raw header", () => {
    renderBubble(userMessage(SKILL_MESSAGE));
    expect(screen.getByText("typescript-react-style")).toBeDefined();
    expect(screen.getByText("have you followed all rules?")).toBeDefined();
    expect(screen.queryByText("/typescript-react-style")).toBeNull();
    expect(screen.queryByText(/use IProps/)).toBeNull();
  });

  it("renders a skill message with no args as just the chip", () => {
    renderBubble(userMessage("/pdf\n\n```kotys-skill:pdf\nbody\n```"));
    expect(screen.getByText("pdf")).toBeDefined();
    expect(screen.queryByText("/pdf")).toBeNull();
  });

  it("renders a plain message as markdown", () => {
    renderBubble(userMessage("just a normal **message**"));
    expect(screen.getByText("just a normal")).toBeDefined();
    expect(screen.queryByText("typescript-react-style")).toBeNull();
  });

  it("does not treat a message that merely starts with / as a skill", () => {
    renderBubble(userMessage("/not-a-skill with no fence"));
    expect(screen.getByText("/not-a-skill with no fence")).toBeDefined();
  });
});

describe("MessageBubble steer", () => {
  const steered: Message = {
    id: 2,
    role: "assistant",
    content: "Looking at it.\n\nSwitched to Y as asked.",
    createdAt: 0,
    toolCalls: [
      { tool: "list", status: "done", textOffset: 0, durationMs: 5 },
      {
        tool: "steer",
        status: "done",
        textOffset: "Looking at it.\n\n".length,
        widget: { kind: "steer", text: "use Y instead" },
      },
    ],
  };

  it("shows the steer inside the reply, between the text around it", () => {
    const { container } = renderBubble(steered);
    const text = container.textContent ?? "";
    const before = text.indexOf("Looking at it.");
    const steer = text.indexOf("use Y instead");
    const after = text.indexOf("Switched to Y as asked.");
    expect(before).toBeGreaterThan(-1);
    expect(steer).toBeGreaterThan(before);
    expect(after).toBeGreaterThan(steer);
    expect(screen.getByText("Sent mid-reply")).toBeDefined();
  });

  it("does not count the steer as a tool call", () => {
    renderBubble(steered);
    expect(screen.getAllByText(/^1 tool · /).length).toBeGreaterThan(0);
    expect(screen.queryByText(/2 tools/)).toBeNull();
  });
});
