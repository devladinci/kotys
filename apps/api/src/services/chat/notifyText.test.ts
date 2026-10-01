import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectorChatRequest } from "../llm/types.js";

const mocks = vi.hoisted(() => ({
  chats: new Map<
    number,
    {
      model: string;
      model_provider: string | null;
      model_source: "cloud" | "local" | null;
      model_context_length: number | null;
    }
  >(),
  chat: vi.fn<(req: ConnectorChatRequest) => Promise<{ content: string }>>(),
  resolveConnector: vi.fn(),
  resolveOllamaConnector: vi.fn(),
}));

vi.mock("@kotys/db", () => ({
  getChatById: (id: number) => mocks.chats.get(id) ?? null,
}));

vi.mock("../llm/registry.js", () => ({
  resolveConnector: mocks.resolveConnector,
  resolveOllamaConnector: mocks.resolveOllamaConnector,
}));

const { DEFAULT_NOTIFY_MODEL, notificationSummary } =
  await import("./notifyText.js");

const REPLY = "| step | status |\n| - | - |\n| tests | green |";
const LONG_REPLY = `${REPLY}\n${"and the rest of the reply ".repeat(500)}`;

const lastRequest = () => mocks.chat.mock.calls[0][0];

beforeEach(() => {
  mocks.chats.clear();
  mocks.chats.set(7, {
    model: "deepseek-v4.1-flash",
    model_provider: "ollama",
    model_source: "cloud",
    model_context_length: 65_536,
  });
  mocks.chat.mockReset();
  mocks.chat.mockResolvedValue({ content: "<notify>All tests pass.</notify>" });
  mocks.resolveConnector.mockReset();
  mocks.resolveConnector.mockReturnValue({ chat: mocks.chat });
  mocks.resolveOllamaConnector.mockReset();
  mocks.resolveOllamaConnector.mockReturnValue({ chat: mocks.chat });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("notificationSummary", () => {
  it("asks the chat's own model with reasoning off and returns the sentence", async () => {
    expect(await notificationSummary(REPLY, 7)).toBe("All tests pass.");

    expect(mocks.resolveOllamaConnector).toHaveBeenCalledWith("cloud");
    expect(lastRequest()).toMatchObject({
      model: "deepseek-v4.1-flash",
      temperature: 0,
      maxTokens: 80,
      think: false,
    });
    expect(lastRequest().messages[1].content).toBe(REPLY);
    expect(lastRequest().messages[0].content).toContain("<notify>");
  });

  it("caps what it sends: a long reply is not worth a long prompt", async () => {
    await notificationSummary(LONG_REPLY, 7);

    expect(lastRequest().messages[1].content).toHaveLength(4_000);
  });

  it("uses the app's default model when the chat row is gone", async () => {
    expect(await notificationSummary(REPLY, 404)).toBe("All tests pass.");

    expect(mocks.resolveOllamaConnector).toHaveBeenCalledWith("cloud");
    expect(lastRequest().model).toBe(DEFAULT_NOTIFY_MODEL.name);
  });

  it("reads the sentence with a closing tag that never arrived", async () => {
    mocks.chat.mockResolvedValue({ content: "<notify>All tests pass." });

    expect(await notificationSummary(REPLY, 7)).toBe("All tests pass.");
  });

  it("routes a non-ollama chat through that provider", async () => {
    mocks.chats.set(8, {
      model: "qwen-local",
      model_provider: "omlx",
      model_source: "local",
      model_context_length: 32_768,
    });

    await notificationSummary(REPLY, 8);

    expect(mocks.resolveConnector).toHaveBeenCalledWith({
      provider: "omlx",
      model: "qwen-local",
    });
  });

  it("falls back to the ollama connector for a chat with no provider stored", async () => {
    mocks.chats.set(9, {
      model: "qwen-local",
      model_provider: null,
      model_source: null,
      model_context_length: null,
    });

    await notificationSummary(REPLY, 9);

    expect(mocks.resolveConnector).not.toHaveBeenCalled();
    expect(mocks.resolveOllamaConnector).toHaveBeenCalledWith("cloud");
  });

  it("returns nothing when the model answered without the tagged sentence", async () => {
    mocks.chat.mockResolvedValue({ content: "Sure! Here you go:" });

    expect(await notificationSummary(REPLY, 7)).toBeNull();
  });

  it("returns nothing for an empty reply, without calling a model", async () => {
    expect(await notificationSummary("   ", 7)).toBeNull();
    expect(mocks.chat).not.toHaveBeenCalled();
  });

  it("gives up on a model that takes too long", async () => {
    vi.useFakeTimers();
    mocks.chat.mockReturnValue(new Promise(() => {}));

    const summary = notificationSummary(REPLY, 7);
    const rejection = expect(summary).rejects.toThrow("took too long");
    await vi.advanceTimersByTimeAsync(3_000);

    await rejection;
  });
});
