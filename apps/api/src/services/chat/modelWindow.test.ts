import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ModelListing } from "@kotys/contracts";
import { createChat, getChatById, initDatabase } from "@kotys/db";
import { events } from "../events.js";
import type { LlmConnector } from "../llm/types.js";
import { DESCRIBE_TIMEOUT_MS, syncModelWindow } from "./modelWindow.js";

beforeAll(() => initDatabase(":memory:"));

afterEach(() => {
  vi.useRealTimers();
});

const omlxModel = (name: string, contextLength: number): ModelListing => ({
  name,
  contextLength,
  capabilities: ["thinking", "vision"],
  source: "local",
  provider: "omlx",
});

const connectorReturning = (
  describeModel: LlmConnector["describeModel"],
): LlmConnector => ({ describeModel }) as LlmConnector;

const chatChanges = () => {
  const seen: (number | undefined)[] = [];
  const off = events.onEvent("chats:changed", ({ chatId }) => {
    seen.push(chatId);
  });
  return { seen, off };
};

describe("syncModelWindow", () => {
  it("moves a stored window to what the server enforces now and tells clients", async () => {
    const chatId = Number(createChat("t", omlxModel("qwen-a", 32_768)));
    const changes = chatChanges();

    await syncModelWindow(
      connectorReturning(async () => omlxModel("qwen-a", 65_536)),
      "qwen-a",
      chatId,
    );

    changes.off();

    expect(getChatById(chatId)?.model_context_length).toBe(65_536);
    expect(changes.seen).toEqual([chatId]);
  });

  it("stays quiet when the window did not move", async () => {
    const chatId = Number(createChat("t", omlxModel("qwen-b", 65_536)));
    const changes = chatChanges();

    await syncModelWindow(
      connectorReturning(async () => omlxModel("qwen-b", 65_536)),
      "qwen-b",
      chatId,
    );

    changes.off();

    expect(changes.seen).toEqual([]);
  });

  it("keeps the stored window when the server is down or no longer lists the model", async () => {
    const chatId = Number(createChat("t", omlxModel("qwen-c", 32_768)));

    await syncModelWindow(
      connectorReturning(async () => {
        throw new Error("ECONNREFUSED");
      }),
      "qwen-c",
      chatId,
    );

    await syncModelWindow(
      connectorReturning(async () => null),
      "qwen-c",
      chatId,
    );

    expect(getChatById(chatId)?.model_context_length).toBe(32_768);
  });

  it("does not hold the turn hostage to a server that never answers", async () => {
    vi.useFakeTimers();
    const chatId = Number(createChat("t", omlxModel("qwen-d", 32_768)));

    const pending = syncModelWindow(
      connectorReturning(() => new Promise(() => undefined)),
      "qwen-d",
      chatId,
    );

    await vi.advanceTimersByTimeAsync(DESCRIBE_TIMEOUT_MS);
    await pending;

    expect(getChatById(chatId)?.model_context_length).toBe(32_768);
  });

  it("is a no-op for providers that cannot describe a model", async () => {
    const chatId = Number(createChat("t", omlxModel("qwen-e", 32_768)));

    await syncModelWindow({} as LlmConnector, "qwen-e", chatId);

    expect(getChatById(chatId)?.model_context_length).toBe(32_768);
  });
});
