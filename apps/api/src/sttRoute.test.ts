import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getSetting: vi.fn<(key: string) => string | null>(() => null),
  setSetting: vi.fn<() => void>(),
}));

vi.mock("@kotys/db", () => ({
  DB_PATH: "/tmp/kotys-stt-route-test/chat.db",
  getSetting: mocks.getSetting,
  setSetting: mocks.setSetting,
}));

type TranscribeArgs = [
  { model: string; file: Blob; filename: string; language?: string },
];
const transcribeMock = vi.fn(async (..._args: TranscribeArgs) => ({
  text: "Hello world.",
  language: "en",
  duration: 1,
}));

vi.mock("./services/stt/registry.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./services/stt/registry.js")>()),
  resolveSttConnector: vi.fn(() => ({
    listModels: vi.fn(),
    transcribe: transcribeMock,
  })),
}));

import { Hono } from "hono";
import { requireAuth } from "./auth.js";
import { registerSttRoute } from "./sttRoute.js";

const app = new Hono();
app.use("/stt/transcribe", requireAuth());
registerSttRoute(app);

const APP_TOKEN = "t".repeat(64);

const authed = (init: RequestInit = {}) =>
  app.request("/stt/transcribe", {
    ...init,
    headers: {
      ...(init.headers as Record<string, string>),
      Authorization: `Bearer ${APP_TOKEN}`,
    },
  });

const unauthed = (init: RequestInit = {}) =>
  app.request("/stt/transcribe", { ...init, headers: {} as never });

beforeEach(() => {
  transcribeMock.mockClear();
  // Default: valid auth token, no stt_model. Tests override stt_model with
  // mockImplementation so the api_token read survives.
  mocks.getSetting.mockReset();
  mocks.getSetting.mockImplementation((key: string) =>
    key === "api_token" ? APP_TOKEN : key === "stt_model" ? null : null,
  );
  mocks.setSetting.mockClear();
});

const withSttModel = (value: string) => {
  mocks.getSetting.mockImplementation((key: string) =>
    key === "api_token" ? APP_TOKEN : key === "stt_model" ? value : null,
  );
};

describe("POST /stt/transcribe", () => {
  it("401 without a bearer token", async () => {
    const res = await unauthed({ method: "POST", body: new FormData() });
    expect(res.status).toBe(401);
  });
  it("400 when no stt_model is selected", async () => {
    const res = await authed({ method: "POST", body: new FormData() });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("No speech-to-text model");
    expect(transcribeMock).not.toHaveBeenCalled();
  });

  it("400 when the file part is missing", async () => {
    withSttModel("omlx:parakeet");
    const form = new FormData();
    form.append("language", "en");
    const res = await authed({ method: "POST", body: form });
    expect(res.status).toBe(400);
  });

  it("200 with transcribed text on the happy path", async () => {
    withSttModel("omlx:parakeet");
    const form = new FormData();
    form.append(
      "file",
      new Blob(["wav-bytes"], { type: "audio/wav" }),
      "a.wav",
    );
    const res = await authed({ method: "POST", body: form });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { text: string }).text).toBe("Hello world.");
    expect(transcribeMock).toHaveBeenCalledTimes(1);
    const req = transcribeMock.mock.calls[0][0];
    expect(req.model).toBe("parakeet");
    expect(req.filename).toBe("a.wav");
    expect(req.language).toBeUndefined();
  });

  it("parses bare legacy model names as omlx", async () => {
    withSttModel("parakeet-tdt-0.6b-v3");
    const form = new FormData();
    form.append("file", new Blob(["wav"], { type: "audio/wav" }), "a.wav");
    await authed({ method: "POST", body: form });
    expect(transcribeMock.mock.calls[0][0].model).toBe("parakeet-tdt-0.6b-v3");
  });

  it("passes language through when provided", async () => {
    withSttModel("omlx:parakeet");
    const form = new FormData();
    form.append("file", new Blob(["wav"], { type: "audio/wav" }), "a.wav");
    form.append("language", "en");
    await authed({ method: "POST", body: form });
    expect(transcribeMock.mock.calls[0][0].language).toBe("en");
  });

  it("502 when the upstream connector fails", async () => {
    withSttModel("omlx:parakeet");
    transcribeMock.mockRejectedValueOnce(new Error("boom"));
    const form = new FormData();
    form.append("file", new Blob(["wav"], { type: "audio/wav" }), "a.wav");
    const res = await authed({ method: "POST", body: form });
    expect(res.status).toBe(502);
  });
});
