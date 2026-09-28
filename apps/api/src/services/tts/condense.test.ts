import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getSetting: vi.fn<(key: string) => string | null>(() => null),
  chat: vi.fn(),
}));

vi.mock("@kotys/db", () => ({
  DB_PATH: "/tmp/kotys-tts-condense-test/chat.db",
  getSetting: mocks.getSetting,
}));

vi.mock("../llm/openaiCompatibleConnector.js", () => ({
  createOpenAiCompatibleConnector: () => ({ chat: mocks.chat }),
}));

vi.mock("../llm/registry.js", () => ({
  omlxConfig: () => ({ baseUrl: "", apiKey: "", provider: "omlx" }),
}));

import { condenseForSpeech } from "./condense.js";

describe("condenseForSpeech", () => {
  beforeEach(() => {
    mocks.chat.mockClear();
  });
  it("returns the text unchanged when no default model is set", async () => {
    mocks.getSetting.mockReturnValue(null);
    const out = await condenseForSpeech("Здравей.");
    expect(out).toBe("Здравей.");
    expect(mocks.chat).not.toHaveBeenCalled();
  });

  it("sends the text to the default model and returns its reply", async () => {
    mocks.getSetting.mockReturnValue("kimi-k2.7-code");
    mocks.chat.mockResolvedValue({ content: "Кратко сказано.", usage: null });
    const out = await condenseForSpeech("# Header\n| a | b |\n| - | - |");
    expect(out).toBe("Кратко сказано.");
    expect(mocks.chat.mock.calls[0][0].model).toBe("kimi-k2.7-code");
  });

  it("falls back to the raw text when the model call fails", async () => {
    mocks.getSetting.mockReturnValue("kimi-k2.7-code");
    mocks.chat.mockRejectedValue(new Error("boom"));
    const out = await condenseForSpeech("Здравей.");
    expect(out).toBe("Здравей.");
  });

  it("falls back when the model returns an empty reply", async () => {
    mocks.getSetting.mockReturnValue("kimi-k2.7-code");
    mocks.chat.mockResolvedValue({ content: "  ", usage: null });
    const out = await condenseForSpeech("Здравей.");
    expect(out).toBe("Здравей.");
  });

  it("short-circuits on empty input without a model call", async () => {
    mocks.getSetting.mockReturnValue("kimi-k2.7-code");
    const out = await condenseForSpeech("```js\nconst x = 1;\n```");
    expect(out).toBe("```js\nconst x = 1;\n```");
    expect(mocks.chat).not.toHaveBeenCalled();
  });
});
