import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MessageBubble } from "./MessageBubble";
import type { Message } from "@kotys/contracts";

const userMessage = (content: string): Message => ({
  id: 1,
  chatId: 1,
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

const renderBubble = (content: string) =>
  render(
    <MessageBubble
      message={userMessage(content)}
      isStreamingThis={false}
      isHighlighted={false}
      onImageClick={() => {}}
    />,
  );

describe("MessageBubble skill message", () => {
  it("renders args as text plus the skill chip, without the raw header", () => {
    renderBubble(SKILL_MESSAGE);
    expect(screen.getByText("typescript-react-style")).toBeDefined();
    expect(screen.getByText("have you followed all rules?")).toBeDefined();
    expect(screen.queryByText("/typescript-react-style")).toBeNull();
    expect(screen.queryByText(/use IProps/)).toBeNull();
  });

  it("renders a skill message with no args as just the chip", () => {
    renderBubble("/pdf\n\n```kotys-skill:pdf\nbody\n```");
    expect(screen.getByText("pdf")).toBeDefined();
    expect(screen.queryByText("/pdf")).toBeNull();
  });

  it("renders a plain message as markdown", () => {
    renderBubble("just a normal **message**");
    expect(screen.getByText("just a normal")).toBeDefined();
    expect(screen.queryByText("typescript-react-style")).toBeNull();
  });

  it("does not treat a message that merely starts with / as a skill", () => {
    renderBubble("/not-a-skill with no fence");
    expect(screen.getByText("/not-a-skill with no fence")).toBeDefined();
  });
});
