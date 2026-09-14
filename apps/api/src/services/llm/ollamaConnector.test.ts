import { describe, expect, it, vi } from "vitest";

// The Ollama SDK is constructed per call; capture the chat payload it gets.
const chatMock = vi.hoisted(() => vi.fn());
vi.mock("ollama", () => ({
  Ollama: class {
    chat = chatMock;
  },
}));

import { createOllamaConnector } from "./ollamaConnector.js";
import type { ConnectorChatMessage } from "./types.js";

describe("ollamaConnector image normalization", () => {
  it("strips data-URI prefixes before sending images to Ollama", async () => {
    chatMock.mockResolvedValue({ message: { content: "ok" } });
    const connector = createOllamaConnector("local", "");
    const messages: ConnectorChatMessage[] = [
      {
        role: "user",
        content: "what is this?",
        images: ["data:image/jpeg;base64,QUJD", "Qg=="],
      },
    ];
    await connector.chat({ model: "m", messages });
    const payload = chatMock.mock.calls[0][0];
    expect(payload.messages[0].images).toEqual(["QUJD", "Qg=="]);
  });

  it("normalizes images on streamed requests too", async () => {
    chatMock.mockReturnValue(
      (async function* () {
        yield { message: { content: "hi" }, done: true };
      })(),
    );
    const connector = createOllamaConnector("cloud", "k");
    const messages: ConnectorChatMessage[] = [
      {
        role: "user",
        content: "look",
        images: ["data:image/png;base64,QUJD"],
      },
    ];
    await connector
      .stream({ model: "m", messages }, () => {}, new AbortController().signal)
      .done;
    const payload = chatMock.mock.calls.at(-1)![0];
    expect(payload.messages[0].images).toEqual(["QUJD"]);
  });
});