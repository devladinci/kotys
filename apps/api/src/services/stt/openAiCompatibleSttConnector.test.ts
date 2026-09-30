import { afterEach, describe, expect, it, beforeEach, vi } from "vitest";
import type { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";

vi.stubGlobal(
  "fetch",
  vi.fn(
    async () => new Response(JSON.stringify({ models: [] }), { status: 200 }),
  ),
);

const { createOpenAiCompatibleSttConnector } =
  await import("./openAiCompatibleSttConnector.js");

const fetchMock = vi.mocked(fetch);

const statusBody = (models: unknown[]) =>
  new Response(JSON.stringify({ models }), { status: 200 });

describe("openAiCompatibleSttConnector listModels", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("keeps only audio_stt models from /models/status", async () => {
    fetchMock.mockResolvedValueOnce(
      statusBody([
        { id: "parakeet-tdt-0.6b-v3", engine_type: "audio_stt" },
        { id: "qwen3-vl", engine_type: "vlm" },
        { id: "llama-3", engine_type: "batched" },
        { id: "kokoro", engine_type: "audio_tts" },
        { id: "hidden-stt", engine_type: "audio_stt", is_hidden: true },
        { engine_type: "audio_stt" },
      ]),
    );
    const connector = createOpenAiCompatibleSttConnector({
      baseUrl: "http://x/v1",
      apiKey: "k",
      provider: "omlx",
    });
    const models = await connector.listModels();
    expect(models).toHaveLength(1);
    expect(models[0]).toMatchObject({
      name: "parakeet-tdt-0.6b-v3",
      capabilities: ["stt"],
      source: "local",
      provider: "omlx",
    });
  });

  it("falls back to /models + audio-name heuristic when status fails", async () => {
    // Opposite polarity from the chat listing: here audio-named models are
    // KEPT as STT candidates (parakeet, whisper, tts…), chat names dropped.
    fetchMock
      .mockResolvedValueOnce(new Response("nope", { status: 404 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              { id: "parakeet-tdt-0.6b-v3" },
              { id: "whisper-small" },
              { id: "tts-model" },
              { id: "qwen-tts" },
              { id: "llama-3" },
            ],
          }),
          { status: 200 },
        ),
      );
    const connector = createOpenAiCompatibleSttConnector({
      baseUrl: "http://x/v1",
      apiKey: "",
      provider: "omlx",
    });
    const models = await connector.listModels();
    expect(models.map((m) => m.name)).toEqual([
      "parakeet-tdt-0.6b-v3",
      "whisper-small",
      "tts-model",
      "qwen-tts",
    ]);
  });

  it("sends Bearer auth only when a key exists", async () => {
    fetchMock.mockResolvedValueOnce(statusBody([]));
    const connector = createOpenAiCompatibleSttConnector({
      baseUrl: "http://x/v1",
      apiKey: "secret",
      provider: "omlx",
    });
    await connector.listModels();
    expect(fetchMock).toHaveBeenCalledWith("http://x/v1/models/status", {
      headers: { Authorization: "Bearer secret" },
    });

    fetchMock.mockResolvedValueOnce(statusBody([]));
    const noKey = createOpenAiCompatibleSttConnector({
      baseUrl: "http://x/v1",
      apiKey: "",
      provider: "omlx",
    });
    await noKey.listModels();
    expect(fetchMock).toHaveBeenLastCalledWith("http://x/v1/models/status", {
      headers: {},
    });
  });
});

describe("openAiCompatibleSttConnector transcribe", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("posts multipart file+model and maps the response", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ text: "Hello world.", language: "en", duration: 1.5 }),
        { status: 200 },
      ),
    );
    const connector = createOpenAiCompatibleSttConnector({
      baseUrl: "http://x/v1",
      apiKey: "k",
      provider: "omlx",
    });
    const result = await connector.transcribe({
      model: "parakeet-tdt-0.6b-v3",
      file: new Blob(["audio"]),
      filename: "audio.wav",
    });
    expect(result).toEqual({
      text: "Hello world.",
      language: "en",
      duration: 1.5,
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://x/v1/audio/transcriptions");
    expect(init?.method).toBe("POST");
    const form = init?.body as FormData;
    expect(form.get("model")).toBe("parakeet-tdt-0.6b-v3");
    expect(form.get("language")).toBeNull();
  });

  it("passes language when provided", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ text: "hi" }), { status: 200 }),
    );
    const connector = createOpenAiCompatibleSttConnector({
      baseUrl: "http://x/v1",
      apiKey: "",
      provider: "omlx",
    });
    await connector.transcribe({
      model: "m",
      file: new Blob(["a"]),
      filename: "a.wav",
      language: "en",
    });
    const form = fetchMock.mock.calls[0][1]?.body as FormData;
    expect(form.get("language")).toBe("en");
  });

  it("throws with upstream detail on non-2xx", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "model not loaded" } }), {
        status: 500,
      }),
    );
    const connector = createOpenAiCompatibleSttConnector({
      baseUrl: "http://x/v1",
      apiKey: "",
      provider: "omlx",
    });
    await expect(
      connector.transcribe({
        model: "m",
        file: new Blob(["a"]),
        filename: "a.wav",
      }),
    ).rejects.toThrow("transcription failed: 500");
  });
});

describe("openAiCompatibleSttConnector supportsStreaming", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  const connector = () =>
    createOpenAiCompatibleSttConnector({
      baseUrl: "http://x/v1",
      apiKey: "k",
      provider: "omlx",
    });

  it("reads realtime_stt from /models/status", async () => {
    fetchMock.mockImplementation(async () =>
      statusBody([
        {
          id: "whisper-large-v3-turbo",
          engine_type: "audio_stt",
          realtime_stt: true,
        },
        {
          id: "parakeet-tdt-0.6b-v3",
          engine_type: "audio_stt",
          realtime_stt: false,
        },
      ]),
    );
    await expect(
      connector().supportsStreaming?.("whisper-large-v3-turbo"),
    ).resolves.toBe(true);
    await expect(
      connector().supportsStreaming?.("parakeet-tdt-0.6b-v3"),
    ).resolves.toBe(false);
    await expect(connector().supportsStreaming?.("gone")).resolves.toBe(false);
  });

  it("says no when the server has no status listing", async () => {
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 404 }));
    await expect(connector().supportsStreaming?.("whisper")).resolves.toBe(
      false,
    );
  });
});

describe("openAiCompatibleSttConnector openRealtime", () => {
  let wss: WebSocketServer;
  let baseUrl = "";

  beforeEach(async () => {
    wss = new WebSocketServer({ port: 0, host: "127.0.0.1" });
    await new Promise((resolve) => wss.on("listening", resolve));
    baseUrl = `http://127.0.0.1:${(wss.address() as AddressInfo).port}/v1`;
  });

  afterEach(async () => {
    await new Promise((resolve) => wss.close(resolve));
  });

  const connector = (apiKey: string) =>
    createOpenAiCompatibleSttConnector({ baseUrl, apiKey, provider: "omlx" });

  it("streams through the oMLX realtime endpoint with the key in the start message", async () => {
    let start: unknown = null;
    wss.on("connection", (ws) => {
      ws.on("message", (data, isBinary) => {
        if (isBinary) {
          ws.send(JSON.stringify({ type: "transcript.delta", delta: " Hi" }));
          return;
        }
        const message = JSON.parse(data.toString()) as { type: string };
        if (message.type === "start") {
          start = message;
          ws.send(JSON.stringify({ type: "ready" }));
        }
        if (message.type === "stop") {
          ws.send(JSON.stringify({ type: "transcript.done", text: " Hi" }));
          ws.close(1000);
        }
      });
    });

    const result = await connector("secret").openRealtime?.({
      model: "whisper",
      language: "en",
    });
    if (!result?.ok) throw new Error("expected the stream to open");
    const deltas: string[] = [];
    result.session.onDelta((delta) => deltas.push(delta));
    result.session.feedPcm16(new Uint8Array(3200));
    for (let i = 0; i < 100 && deltas.length === 0; i++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    await expect(result.session.stop()).resolves.toEqual({
      ok: true,
      text: " Hi",
    });
    expect(deltas).toEqual([" Hi"]);
    expect(start).toEqual({
      type: "start",
      model: "whisper",
      api_key: "secret",
      language: "en",
    });
  });

  it("hands an engine refusal back", async () => {
    wss.on("connection", (ws) => {
      ws.on("message", () => {
        ws.send(JSON.stringify({ type: "error", detail: "Invalid API key" }));
        ws.close(1008);
      });
    });

    await expect(
      connector("wrong").openRealtime?.({ model: "whisper" }),
    ).resolves.toMatchObject({ ok: false, errorCode: "BAD_TOKEN" });
  });
});
