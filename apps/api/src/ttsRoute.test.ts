import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ISpeechRequest } from "./services/tts/types.js";

const mocks = vi.hoisted(() => ({
  settings: new Map<string, string>(),
  synthesize: vi.fn<(req: ISpeechRequest) => Promise<ArrayBuffer>>(),
}));

vi.mock("@kotys/db", async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "kotys-tts-route-"));

  return {
    DB_PATH: join(dir, "chat.db"),
    getSetting: (key: string) => mocks.settings.get(key) ?? null,
    setSetting: (key: string, value: string) => mocks.settings.set(key, value),
  };
});

vi.mock("./services/tts/registry.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./services/tts/registry.js")>()),
  resolveTtsConnector: () => ({
    listModels: vi.fn(),
    synthesize: mocks.synthesize,
  }),
}));

const { Hono } = await import("hono");
const { DB_PATH } = await import("@kotys/db");
const { registerTtsRoute } = await import("./ttsRoute.js");

const app = new Hono();
registerTtsRoute(app);

const TOKEN = "t".repeat(64);
const REFERENCE_FILE = path.join(path.dirname(DB_PATH), "tts-reference.wav");
const WAV = new Uint8Array([
  ...new TextEncoder().encode("RIFF"),
  0,
  0,
  0,
  0,
  ...new TextEncoder().encode("WAVEfmt "),
]);

const speak = (body: unknown, token = TOKEN) =>
  app.request("/tts/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

const upload = (file: Blob | null, text: string | null) => {
  const form = new FormData();
  if (file) form.append("file", file, "reference.wav");
  if (text !== null) form.append("text", text);

  return app.request("/tts/reference", {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}` },
    body: form,
  });
};

const errorOf = async (res: Response) =>
  ((await res.json()) as { error: string }).error;

beforeEach(() => {
  mocks.settings.clear();
  mocks.settings.set("api_token", TOKEN);
  mocks.settings.set("tts_model", "omlx:higgs_audio_v3-tts-4b");
  mocks.synthesize.mockReset();
  mocks.synthesize.mockResolvedValue(new TextEncoder().encode("RIFF").buffer);
  rmSync(REFERENCE_FILE, { force: true });
});

afterAll(() => {
  rmSync(path.dirname(DB_PATH), { recursive: true, force: true });
});

describe("POST /tts/speech", () => {
  it("rejects requests without the app token", async () => {
    expect((await speak({ text: "Hi." }, "wrong")).status).toBe(401);
  });

  it("400 when no text-to-speech model is selected", async () => {
    mocks.settings.delete("tts_model");
    const res = await speak({ text: "Hi." });

    expect(res.status).toBe(400);
    expect(await errorOf(res)).toBe("No text-to-speech model selected");
    expect(mocks.synthesize).not.toHaveBeenCalled();
  });

  it("400 when the text is missing or blank", async () => {
    expect((await speak({})).status).toBe(400);
    expect((await speak({ text: "   " })).status).toBe(400);
    expect((await speak({ text: 42 })).status).toBe(400);
  });

  it("413 when one request carries too much text", async () => {
    expect((await speak({ text: "a".repeat(2_001) })).status).toBe(413);
  });

  it("returns the synthesized wav for the trimmed text", async () => {
    const res = await speak({ text: "  Здравей.  " });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("audio/wav");
    expect(await res.text()).toBe("RIFF");
    expect(mocks.synthesize).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "higgs_audio_v3-tts-4b",
        text: "Здравей.",
        refAudio: undefined,
        refText: undefined,
      }),
    );
    expect(mocks.synthesize.mock.calls[0][0].signal).toBeInstanceOf(
      AbortSignal,
    );
  });

  it("ignores extra fields such as a client-chosen voice or language", async () => {
    await speak({ text: "Hi.", voice: "/etc/hosts", language: "bg" });

    expect(Object.keys(mocks.synthesize.mock.calls[0][0]).sort()).toEqual([
      "model",
      "refAudio",
      "refText",
      "signal",
      "text",
    ]);
  });

  it("never reads a file path taken from settings", async () => {
    mocks.settings.set("tts_ref_audio", "/etc/hosts");
    mocks.settings.set("tts_ref_audio_text", "hosts");
    await speak({ text: "Hi." });

    expect(mocks.synthesize.mock.calls[0][0].refAudio).toBeUndefined();
  });

  it("uses the uploaded reference clip and its transcript", async () => {
    await upload(new Blob([WAV]), "Reference words.");
    await speak({ text: "Hi." });

    expect(mocks.synthesize.mock.calls[0][0]).toMatchObject({
      refAudio: Buffer.from(WAV).toString("base64"),
      refText: "Reference words.",
    });
  });

  it("502 with the upstream message when synthesis fails", async () => {
    mocks.synthesize.mockRejectedValueOnce(new Error("speech failed: 500"));
    const res = await speak({ text: "Hi." });

    expect(res.status).toBe(502);
    expect(await errorOf(res)).toBe("speech failed: 500");
  });
});

describe("POST /tts/reference", () => {
  it("stores the clip next to the database with its transcript", async () => {
    const res = await upload(new Blob([WAV]), "  Reference words.  ");

    expect(res.status).toBe(200);
    expect(new Uint8Array(readFileSync(REFERENCE_FILE))).toEqual(WAV);
    expect(mocks.settings.get("tts_reference_text")).toBe("Reference words.");
  });

  it("rejects a missing file", async () => {
    const res = await upload(null, "Words.");

    expect(res.status).toBe(400);
    expect(await errorOf(res)).toBe("Missing audio file");
  });

  it("rejects a clip that is not a wav file", async () => {
    const res = await upload(new Blob(["ID3 mp3 bytes here"]), "Words.");

    expect(res.status).toBe(400);
    expect(await errorOf(res)).toBe("The reference clip must be a WAV file");
    expect(existsSync(REFERENCE_FILE)).toBe(false);
  });

  it("requires the transcript", async () => {
    const res = await upload(new Blob([WAV]), "   ");

    expect(res.status).toBe(400);
    expect(existsSync(REFERENCE_FILE)).toBe(false);
  });

  it("rejects clips over the size limit", async () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    big.set(WAV);
    const res = await upload(new Blob([big]), "Words.");

    expect(res.status).toBe(413);
    expect(existsSync(REFERENCE_FILE)).toBe(false);
  });
});
