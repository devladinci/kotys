import { rmSync } from "node:fs";
import path from "node:path";
import type {
  ISttEngineConfig,
  ISttTranscribeInput,
  ITtsEngineConfig,
  ITtsSynthesizeInput,
} from "@saystack/core";
import type { IOpenAiTtsOptions } from "@saystack/engine-openai-compatible";
import type { Context } from "hono";
import type { WSEvents } from "hono/ws";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  settings: new Map<string, string>(),
  transcribe: vi.fn<(input: ISttTranscribeInput) => Promise<unknown>>(),
  synthesize: vi.fn<(input: ITtsSynthesizeInput) => Promise<unknown>>(),
  engines: [] as ISttEngineConfig[],
  ttsOptions: [] as (IOpenAiTtsOptions | undefined)[],
  upgrade: null as ((c: Context) => Promise<WSEvents>) | null,
}));

vi.mock("@kotys/db", async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "kotys-voice-route-"));

  return {
    DB_PATH: join(dir, "chat.db"),
    getSetting: (key: string) => mocks.settings.get(key) ?? null,
    setSetting: (key: string, value: string) => mocks.settings.set(key, value),
  };
});

vi.mock("@saystack/engine-openai-compatible", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@saystack/engine-openai-compatible")
  >()),
  createOpenAiSttAdapter: (engine: ISttEngineConfig) => {
    mocks.engines.push(engine);
    return {
      capabilities: {
        streaming: false,
        interimResults: false,
        wordTimings: false,
        languages: [],
      },
      transcribe: mocks.transcribe,
    };
  },
  createOpenAiTtsAdapter: (
    _engine: ITtsEngineConfig,
    options?: IOpenAiTtsOptions,
  ) => {
    mocks.ttsOptions.push(options);
    return {
      capabilities: { streaming: false, voiceCloning: true },
      synthesize: mocks.synthesize,
    };
  },
}));

vi.mock("@hono/node-server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@hono/node-server")>()),
  upgradeWebSocket: (factory: (c: Context) => Promise<WSEvents>) => {
    mocks.upgrade = factory;
    return async () => new Response("upgraded");
  },
}));

const { Hono } = await import("hono");
const { DB_PATH } = await import("@kotys/db");
const { maxAudioTokens } = await import("@saystack/engine-openai-compatible");
const { saveReference } = await import("./services/tts/reference.js");
const { registerVoiceRoutes } = await import("./voiceRoute.js");

const app = new Hono();
registerVoiceRoutes(app);

const TOKEN = "t".repeat(64);
const WAV = new Uint8Array([
  ...new TextEncoder().encode("RIFF"),
  0,
  0,
  0,
  0,
  ...new TextEncoder().encode("WAVEfmt "),
]);

const speak = (body: unknown, token = TOKEN) =>
  app.request("/voice/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

const transcribe = (form: FormData, token = TOKEN) =>
  app.request("/voice/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

const recording = (language?: string): FormData => {
  const form = new FormData();
  form.append("file", new Blob([WAV], { type: "audio/webm" }), "a.webm");
  if (language) form.append("language", language);
  return form;
};

beforeEach(() => {
  mocks.settings.clear();
  mocks.settings.set("api_token", TOKEN);
  mocks.settings.set("omlx_enabled", "true");
  mocks.settings.set("omlx_host", "http://127.0.0.1:7777/v1");
  mocks.settings.set("omlx_api_key", "sk-local");
  mocks.settings.set("stt_model", "omlx:whisper-large-v3-turbo");
  mocks.settings.set("tts_model", "omlx:higgs_audio_v3-tts-4b");
  mocks.engines.length = 0;
  mocks.ttsOptions.length = 0;
  mocks.transcribe.mockReset();
  mocks.transcribe.mockResolvedValue({ ok: true, text: "Здравей." });
  mocks.synthesize.mockReset();
  mocks.synthesize.mockResolvedValue({
    ok: true,
    audio: new TextEncoder().encode("RIFF").buffer,
    mimeType: "audio/wav",
  });
  rmSync(path.join(path.dirname(DB_PATH), "tts-reference.wav"), {
    force: true,
  });
});

afterAll(() => {
  rmSync(path.dirname(DB_PATH), { recursive: true, force: true });
});

describe("POST /voice/speech", () => {
  it("rejects requests without the app token", async () => {
    expect((await speak({ text: "Hi." }, "wrong")).status).toBe(401);
  });

  it("NO_ADAPTER when no text-to-speech model is selected", async () => {
    mocks.settings.delete("tts_model");
    const res = await speak({ text: "Hi." });

    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ errorCode: "NO_ADAPTER" });
    expect(mocks.synthesize).not.toHaveBeenCalled();
  });

  it("NO_ADAPTER while oMLX is turned off", async () => {
    mocks.settings.set("omlx_enabled", "false");

    expect((await speak({ text: "Hi." })).status).toBe(503);
  });

  it("blank text is EMPTY_TEXT, too much text is TEXT_TOO_LONG", async () => {
    expect((await speak({ text: "   " })).status).toBe(400);
    const long = await speak({ text: "a".repeat(2_001) });

    expect(long.status).toBe(413);
    expect(await long.json()).toMatchObject({ errorCode: "TEXT_TOO_LONG" });
  });

  it("returns the wav and hands the request's abort signal to the engine", async () => {
    const res = await speak({ text: "Здравей." });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("audio/wav");
    expect(await res.text()).toBe("RIFF");
    expect(mocks.synthesize.mock.calls[0]?.[0].signal).toBeInstanceOf(
      AbortSignal,
    );
  });

  it("caps the audio tokens oMLX may generate, so a model that runs on stops", async () => {
    await speak({ text: "Hi." });

    expect(mocks.ttsOptions[0]?.maxTokens).toBe(maxAudioTokens);
  });

  it("reads in the stored reference voice, never one sent by the client", async () => {
    await speak({ text: "Hi.", refAudio: "Y2xpZW50", refText: "client" });
    expect(mocks.synthesize.mock.calls[0]?.[0]).not.toHaveProperty("refAudio");

    await saveReference(WAV, "Reference words.");
    await speak({ text: "Hi.", refAudio: "Y2xpZW50", refText: "client" });

    expect(mocks.synthesize.mock.calls[1]?.[0]).toMatchObject({
      refAudio: Buffer.from(WAV).toString("base64"),
      refText: "Reference words.",
    });
  });

  it("an engine failure keeps its code for the client", async () => {
    mocks.synthesize.mockResolvedValueOnce({
      ok: false,
      errorCode: "TTS_UNAVAILABLE",
      message: "engine down",
    });
    const res = await speak({ text: "Hi." });

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      errorCode: "TTS_UNAVAILABLE",
      message: "engine down",
    });
  });
});

describe("POST /voice/audio/transcriptions", () => {
  it("rejects requests without the app token", async () => {
    expect((await transcribe(recording(), "wrong")).status).toBe(401);
  });

  it("transcribes with the selected model on the oMLX server, passing the language", async () => {
    const res = await transcribe(recording("bg"));

    expect(await res.json()).toEqual({ text: "Здравей." });
    expect(mocks.engines[0]).toEqual({
      url: "http://127.0.0.1:7777/v1",
      token: "sk-local",
      model: "whisper-large-v3-turbo",
    });
    expect(mocks.transcribe.mock.calls[0]?.[0].language).toBe("bg");
  });

  it("a legacy bare model name still means oMLX", async () => {
    mocks.settings.set("stt_model", "parakeet-tdt-0.6b-v3");
    await transcribe(recording());

    expect(mocks.engines[0]?.model).toBe("parakeet-tdt-0.6b-v3");
  });

  it("NO_ADAPTER for a provider Kotys does not know", async () => {
    mocks.settings.set("stt_model", "whisper-web:base");
    const res = await transcribe(recording());

    expect(res.status).toBe(503);
    expect(mocks.transcribe).not.toHaveBeenCalled();
  });
});

describe("GET /voice/audio/transcriptions/realtime", () => {
  const openSocket = async (token: string) => {
    const res = await app.request(
      `/voice/audio/transcriptions/realtime?token=${token}`,
    );
    const context = {
      req: { query: (key: string) => (key === "token" ? token : undefined) },
    } as unknown as Context;
    const events = await mocks.upgrade?.(context);
    const closed: number[] = [];
    events?.onOpen?.(new Event("open"), {
      send: () => undefined,
      close: (code: number) => closed.push(code),
    } as never);

    return { status: res.status, closed };
  };

  it("lets the upgrade through the auth middleware, then checks the query token", async () => {
    const refused = await openSocket("wrong");
    expect(refused.status).toBe(200);
    expect(refused.closed).toEqual([4001]);

    const allowed = await openSocket(TOKEN);
    expect(allowed.closed).toEqual([]);
  });
});
