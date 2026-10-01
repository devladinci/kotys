import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectorChatRequest } from "../llm/types.js";

const mocks = vi.hoisted(() => ({
  settings: new Map<string, string>(),
  messages: new Map<number, { id: number; content: string }>(),
  chat: vi.fn<(req: ConnectorChatRequest) => Promise<{ content: string }>>(),
  resolveConnector: vi.fn(),
  resolveOllamaConnector: vi.fn(),
}));

vi.mock("@kotys/db", () => ({
  getSetting: (key: string) => mocks.settings.get(key) ?? null,
  getMessage: (id: number) => mocks.messages.get(id),
}));

vi.mock("../llm/registry.js", () => ({
  resolveConnector: mocks.resolveConnector,
  resolveOllamaConnector: mocks.resolveOllamaConnector,
}));

const { summarizeForSpeech, TTS_SUMMARY_MODEL_SETTING } =
  await import("./summary.js");

const REPLY = "| step | status |\n| - | - |\n| tests | green |";

const useModel = (model: object) =>
  mocks.settings.set(TTS_SUMMARY_MODEL_SETTING, JSON.stringify(model));

const lastRequest = () => mocks.chat.mock.calls[0][0];

beforeEach(() => {
  mocks.settings.clear();
  mocks.messages.clear();
  mocks.messages.set(5, { id: 5, content: REPLY });
  mocks.chat.mockReset();
  mocks.chat.mockResolvedValue({ content: "<speech>All tests pass.</speech>" });
  mocks.resolveConnector.mockReset();
  mocks.resolveConnector.mockReturnValue({ chat: mocks.chat });
  mocks.resolveOllamaConnector.mockReset();
  mocks.resolveOllamaConnector.mockReturnValue({ chat: mocks.chat });
  useModel({
    name: "deepseek-v4.1-flash",
    source: "cloud",
    provider: "ollama",
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("summarizeForSpeech", () => {
  it.each([
    ["no summary model is chosen", ""],
    ["the setting is not valid json", "{oops"],
    ["the setting has no source", JSON.stringify({ name: "m" })],
  ])("returns nothing when %s", async (_, setting) => {
    mocks.settings.set(TTS_SUMMARY_MODEL_SETTING, setting);

    expect(await summarizeForSpeech(5)).toBeNull();
    expect(mocks.chat).not.toHaveBeenCalled();
  });

  it("returns nothing for an unknown message", async () => {
    expect(await summarizeForSpeech(404)).toBeNull();
    expect(mocks.chat).not.toHaveBeenCalled();
  });

  it("asks the chosen model with reasoning off and returns the script", async () => {
    mocks.chat.mockResolvedValue({
      content: "<speech>\n  All tests pass.  \n</speech>",
    });

    expect(await summarizeForSpeech(5)).toBe("All tests pass.");
    expect(mocks.resolveOllamaConnector).toHaveBeenCalledWith("cloud");
    expect(lastRequest()).toMatchObject({
      model: "deepseek-v4.1-flash",
      think: false,
      messages: [
        {
          role: "system",
          content: expect.stringContaining("same language as the reply"),
        },
        { role: "user", content: REPLY },
      ],
    });
  });

  it("uses the local ollama daemon for a local model", async () => {
    useModel({ name: "gemma4:latest", source: "local", provider: "ollama" });
    await summarizeForSpeech(5);

    expect(mocks.resolveOllamaConnector).toHaveBeenCalledWith("local");
  });

  it("resolves other providers through their own connector", async () => {
    useModel({ name: "qwen-small", source: "local", provider: "omlx" });
    await summarizeForSpeech(5);

    expect(mocks.resolveConnector).toHaveBeenCalledWith({
      provider: "omlx",
      model: "qwen-small",
    });
    expect(mocks.resolveOllamaConnector).not.toHaveBeenCalled();
  });

  it("sends at most 12,000 characters of a very long reply", async () => {
    mocks.messages.set(6, { id: 6, content: "a".repeat(20_000) });
    await summarizeForSpeech(6);

    expect(lastRequest().messages[1].content).toHaveLength(12_000);
  });

  it("drops reasoning the model wrote before the script", async () => {
    mocks.chat.mockResolvedValue({
      content:
        "The user wants a short script. Key facts: tests.\n<speech>All tests pass.</speech>",
    });

    expect(await summarizeForSpeech(5)).toBe("All tests pass.");
  });

  it("keeps a script that was cut off before its closing tag", async () => {
    mocks.chat.mockResolvedValue({ content: "<speech>All tests pass. Next" });

    expect(await summarizeForSpeech(5)).toBe("All tests pass. Next");
  });

  it.each([
    ["no script tag", "The user wants me to turn this reply into a script."],
    ["an empty script", "<speech>  </speech>"],
  ])("fails when the model returns %s", async (_, content) => {
    mocks.chat.mockResolvedValue({ content });

    await expect(summarizeForSpeech(5)).rejects.toThrow(
      "The summary model returned no script",
    );
  });

  it("passes the model error on", async () => {
    mocks.chat.mockRejectedValue(new Error("model not found"));

    await expect(summarizeForSpeech(5)).rejects.toThrow("model not found");
  });

  it("gives up after 20 seconds", async () => {
    vi.useFakeTimers();
    mocks.chat.mockReturnValue(new Promise(() => {}));
    const result = summarizeForSpeech(5);
    const failed = expect(result).rejects.toThrow(
      "The summary model took too long",
    );

    await vi.advanceTimersByTimeAsync(20_000);
    await failed;
  });
});
