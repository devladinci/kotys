import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getSetting: vi.fn<(key: string) => string | null>(() => null),
}));

vi.mock("@kotys/db", () => ({
  DB_PATH: "/tmp/kotys-tts-route-test/chat.db",
  getSetting: mocks.getSetting,
}));

const synthesizeMock = vi.fn(
  async (_req: {
    model: string;
    text: string;
    voice?: string;
    language?: string;
  }) => new TextEncoder().encode("RIFF-fake-wav").buffer,
);

const condenseMock = vi.fn(async (text: string) => text);

vi.mock("./services/tts/condense.js", () => ({
  condenseForSpeech: (...args: Parameters<typeof condenseMock>) =>
    condenseMock(...args),
}));

vi.mock("./services/tts/registry.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./services/tts/registry.js")>()),
  resolveTtsConnector: vi.fn(() => ({
    listModels: vi.fn(),
    synthesize: synthesizeMock,
  })),
}));

import { Hono } from "hono";
import { requireAuth } from "./auth.js";
import { registerTtsRoute } from "./ttsRoute.js";

const app = new Hono();
app.use("/tts/speech", requireAuth());
registerTtsRoute(app);

const APP_TOKEN = "t".repeat(64);

const authed = (init: RequestInit = {}) =>
  app.request("/tts/speech", {
    ...init,
    headers: {
      ...(init.headers as Record<string, string>),
      Authorization: `Bearer ${APP_TOKEN}`,
    },
  });

const unauthed = (init: RequestInit = {}) =>
  app.request("/tts/speech", { ...init, headers: {} as never });

const post = (body: unknown) =>
  authed({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  synthesizeMock.mockClear();
  condenseMock.mockClear();
  condenseMock.mockImplementation(async (text: string) => text);
  // Default: valid auth token, no tts_model. Tests override tts_model with
  // mockImplementation so the api_token read survives.
  mocks.getSetting.mockReset();
  mocks.getSetting.mockImplementation((key: string) =>
    key === "api_token" ? APP_TOKEN : key === "tts_model" ? null : null,
  );
});

const withTtsModel = (value: string) => {
  mocks.getSetting.mockImplementation((key: string) =>
    key === "api_token" ? APP_TOKEN : key === "tts_model" ? value : null,
  );
};

describe("POST /tts/speech", () => {
  it("401 without a bearer token", async () => {
    const res = await unauthed({ method: "POST", body: "{}" });
    expect(res.status).toBe(401);
  });

  it("400 when no tts_model is selected", async () => {
    const res = await post({ text: "Hello" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("No text-to-speech model");
    expect(synthesizeMock).not.toHaveBeenCalled();
  });

  it("400 when text is missing or blank", async () => {
    withTtsModel("omlx:higgs_audio_v3-tts-4b");
    expect((await post({})).status).toBe(400);
    expect((await post({ text: "   " })).status).toBe(400);
  });

  it("413 when text is too long", async () => {
    withTtsModel("omlx:higgs_audio_v3-tts-4b");
    const res = await post({ text: "a".repeat(10_001) });
    expect(res.status).toBe(413);
  });

  it("200 with audio bytes on the happy path", async () => {
    withTtsModel("omlx:higgs_audio_v3-tts-4b");
    const res = await post({ text: "Здравей." });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("audio/wav");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes.byteLength).toBeGreaterThan(0);
    expect(synthesizeMock).toHaveBeenCalledTimes(1);
    const req = synthesizeMock.mock.calls[0][0];
    expect(req.model).toBe("higgs_audio_v3-tts-4b");
    expect(req.text).toBe("Здравей.");
    expect(req.voice).toBeUndefined();
  });

  it("parses bare legacy model names as omlx", async () => {
    withTtsModel("higgs_audio_v3-tts-4b");
    await post({ text: "Hi" });
    expect(synthesizeMock.mock.calls[0][0].model).toBe("higgs_audio_v3-tts-4b");
  });

  it("passes voice through when provided", async () => {
    withTtsModel("omlx:higgs_audio_v3-tts-4b");
    await post({ text: "Hi", voice: "assets/ref-clean-8s.wav" });
    expect(synthesizeMock.mock.calls[0][0].voice).toBe(
      "assets/ref-clean-8s.wav",
    );
  });

  it("502 when the upstream connector fails", async () => {
    withTtsModel("omlx:higgs_audio_v3-tts-4b");
    synthesizeMock.mockRejectedValueOnce(new Error("boom"));
    const res = await post({ text: "Hi" });
    expect(res.status).toBe(502);
  });

  it("passes language through when provided", async () => {
    withTtsModel("omlx:higgs_audio_v3-tts-4b");
    await post({ text: "Hi", language: "bg" });
    expect(synthesizeMock.mock.calls[0][0].language).toBe("bg");
  });

  it("condenses text through the speech rewriter before synthesis", async () => {
    withTtsModel("omlx:higgs_audio_v3-tts-4b");
    condenseMock.mockImplementation(async (text: string) => `spoken: ${text}`);
    await post({ text: "Hello world" });
    expect(condenseMock).toHaveBeenCalledWith("Hello world");
    expect(synthesizeMock.mock.calls[0][0].text).toBe("spoken: Hello world");
  });

  it("skips condensation when condense is false", async () => {
    withTtsModel("omlx:higgs_audio_v3-tts-4b");
    await post({ text: "Hello world", condense: false });
    expect(condenseMock).not.toHaveBeenCalled();
    expect(synthesizeMock.mock.calls[0][0].text).toBe("Hello world");
  });
});
