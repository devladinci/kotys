import { beforeEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal(
  "fetch",
  vi.fn(async () => new Response("", { status: 200 })),
);

const { createOpenAiCompatibleTtsConnector, maxAudioTokens } =
  await import("./openAiCompatibleTtsConnector.js");

const fetchMock = vi.mocked(fetch);

const connector = createOpenAiCompatibleTtsConnector({
  baseUrl: "http://x/v1",
  apiKey: "k",
  provider: "omlx",
});

const sentBody = (): Record<string, unknown> =>
  JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as Record<
    string,
    unknown
  >;

describe("openAiCompatibleTtsConnector", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(
      async () => new Response(new Uint8Array([1, 2, 3])),
    );
  });

  it("lists only visible audio_tts models", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          models: [
            { id: "higgs_audio_v3-tts-4b", engine_type: "audio_tts" },
            { id: "whisper-large-v3-turbo", engine_type: "audio_stt" },
            { id: "qwen3", engine_type: "batched" },
            { id: "hidden-tts", engine_type: "audio_tts", is_hidden: true },
            { engine_type: "audio_tts" },
          ],
        }),
      ),
    );
    const models = await connector.listModels();

    expect(fetchMock.mock.calls[0][0]).toBe("http://x/v1/models/status");
    expect(models).toEqual([
      {
        name: "higgs_audio_v3-tts-4b",
        contextLength: null,
        capabilities: ["tts"],
        source: "local",
        provider: "omlx",
      },
    ]);
  });

  it("fails the listing instead of guessing from model names", async () => {
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 404 }));
    await expect(connector.listModels()).rejects.toThrow(
      "models/status failed: 404",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("asks for wav with a length cap and the model's own sampling", async () => {
    const audio = await connector.synthesize({ model: "m", text: "Hello." });

    expect(fetchMock.mock.calls[0][0]).toBe("http://x/v1/audio/speech");
    expect(sentBody()).toEqual({
      model: "m",
      input: "Hello.",
      response_format: "wav",
      max_tokens: maxAudioTokens("Hello."),
    });
    expect(new Uint8Array(audio)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("sends the reference clip only together with its transcript", async () => {
    await connector.synthesize({
      model: "m",
      text: "Hi.",
      refAudio: "UklGRg==",
      refText: "Reference words.",
    });
    await connector.synthesize({ model: "m", text: "Hi.", refAudio: "x" });

    expect(sentBody()).toMatchObject({
      ref_audio: "UklGRg==",
      ref_text: "Reference words.",
    });
    const second = JSON.parse(
      String(fetchMock.mock.calls[1][1]?.body),
    ) as Record<string, unknown>;
    expect(second).not.toHaveProperty("ref_audio");
  });

  it("passes the abort signal to the upstream request", async () => {
    const controller = new AbortController();
    await connector.synthesize({
      model: "m",
      text: "Hi.",
      signal: controller.signal,
    });

    expect(fetchMock.mock.calls[0][1]?.signal).toBe(controller.signal);
  });

  it("reports the upstream error with its detail", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("'ref_text' is required", { status: 400 }),
    );
    await expect(
      connector.synthesize({ model: "m", text: "Hi." }),
    ).rejects.toThrow("speech failed: 400 — 'ref_text' is required");
  });

  it("caps generation to what the text can need", () => {
    expect(maxAudioTokens("Hi.")).toBe(65);
    expect(maxAudioTokens("a".repeat(100))).toBe(550);
    expect(maxAudioTokens("a".repeat(5_000))).toBe(2048);
  });
});
