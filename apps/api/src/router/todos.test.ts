import { beforeAll, describe, expect, it, vi } from "vitest";

// The events emitter is a singleton; spying on it keeps the assertions honest
// without coupling the test to the ws broadcast layer.
const { emitEvent } = vi.hoisted(() => ({ emitEvent: vi.fn() }));
vi.mock("../services/events.js", () => ({
  events: { emitEvent },
}));

import { initDatabase } from "@kotys/db";
import { createTodo, getChatByTodoId, getMessages } from "@kotys/db";
import type { ModelListing } from "@kotys/contracts";
import { todosRouter } from "./todos.js";

const MODEL: ModelListing = {
  name: "test-model",
  provider: "test",
  source: "cloud",
  contextLength: 8192,
  capabilities: [],
};

const callable = todosRouter.chatAbout.callable({
  context: { clientId: null },
}) as unknown as (input: { todoId: number; model: ModelListing }) => Promise<{
  chat_id: number;
  prompt: string | null;
}>;

beforeAll(() => {
  initDatabase(":memory:");
});

describe("todos.chatAbout", () => {
  it("creates the chat and persists the prompt as the first message", async () => {
    const todoId = createTodo({
      title: "Ship the release",
      description: "Tag v1 and write notes",
    });

    const result = await callable({ todoId, model: MODEL });

    expect(getChatByTodoId(todoId)).toBe(result.chat_id);
    expect(result.chat_id).toBeGreaterThan(0);
    // The prompt is echoed back for API compatibility, but its authority is
    // the database row: no client-side pending state exists any more.
    expect(result.prompt).toContain("Let's work on this todo:");

    const messages = getMessages(result.chat_id) as {
      id: number;
      role: string;
      content: string;
    }[];
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toContain("Let's work on this todo:");
    expect(messages[0].content).toContain("**Ship the release**");
    expect(messages[0].content).toContain(
      "Description: Tag v1 and write notes",
    );
    expect(messages[0].content).toContain("Status: pending");

    expect(emitEvent).toHaveBeenCalledWith("chats:changed", {
      chatId: result.chat_id,
    });
    expect(emitEvent).toHaveBeenCalledWith("messages:changed", {
      chatId: result.chat_id,
      messageId: messages[0].id,
    });
  });

  it("reopens the existing chat without duplicating the prompt", async () => {
    const todoId = createTodo({ title: "Existing chat todo" });

    const first = await callable({ todoId, model: MODEL });
    expect(first.prompt).toContain("Let's work on this todo:");
    expect(getMessages(first.chat_id)).toHaveLength(1);

    const second = await callable({ todoId, model: MODEL });
    expect(second.chat_id).toBe(first.chat_id);
    expect(second.prompt).toBeNull();
    expect(getMessages(second.chat_id)).toHaveLength(1);
  });

  it("skips the prompt when the chat already has messages", async () => {
    const todoId = createTodo({ title: "Already active todo" });
    const result = await callable({ todoId, model: MODEL });
    expect(getMessages(result.chat_id)).toHaveLength(1);

    // The first todo's chat stays untouched on repeat calls.
    expect(await callable({ todoId, model: MODEL })).toEqual({
      chat_id: result.chat_id,
      prompt: null,
    });
    expect(getMessages(result.chat_id)).toHaveLength(1);

    // A different todo with its own fresh chat still gets a prompt.
    const todo2 = createTodo({ title: "Second todo for same chat" });
    const second = await callable({ todoId: todo2, model: MODEL });
    expect(second.chat_id).not.toBe(result.chat_id);
    expect(second.prompt).toContain("Let's work on this todo:");
  });

  it("rejects an unknown todo", async () => {
    await expect(callable({ todoId: 999999, model: MODEL })).rejects.toThrow(
      /Todo not found/,
    );
  });
});
