import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  settings: new Map<string, string>(),
  summarize: vi.fn<(messageId: number) => Promise<string | null>>(),
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

vi.mock("./services/tts/summary.js", () => ({
  summarizeForSpeech: mocks.summarize,
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

const post = (route: string, body: unknown, token = TOKEN) =>
  app.request(route, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

const summarize = (body: unknown, token = TOKEN) =>
  post("/tts/summary", body, token);

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
  mocks.summarize.mockReset();
  mocks.summarize.mockResolvedValue("A short version.");
  rmSync(REFERENCE_FILE, { force: true });
});

afterAll(() => {
  rmSync(path.dirname(DB_PATH), { recursive: true, force: true });
});

describe("POST /tts/summary", () => {
  it("rejects requests without the app token", async () => {
    expect((await summarize({ messageId: 5 }, "wrong")).status).toBe(401);
    expect(mocks.summarize).not.toHaveBeenCalled();
  });

  it.each([{}, { messageId: "5" }, { messageId: 1.5 }])(
    "400 without a whole message id: %j",
    async (body) => {
      const res = await summarize(body);

      expect(res.status).toBe(400);
      expect(await errorOf(res)).toBe("Missing message");
      expect(mocks.summarize).not.toHaveBeenCalled();
    },
  );

  it("returns the short version of the message", async () => {
    const res = await summarize({ messageId: 5 });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: "A short version." });
    expect(mocks.summarize).toHaveBeenCalledWith(5);
  });

  it("returns no text when there is nothing to summarize with", async () => {
    mocks.summarize.mockResolvedValueOnce(null);
    const res = await summarize({ messageId: 5 });

    expect(await res.json()).toEqual({ text: null });
  });

  it("502 with the reason when the summary fails", async () => {
    mocks.summarize.mockRejectedValueOnce(
      new Error("The summary model took too long"),
    );
    const res = await summarize({ messageId: 5 });

    expect(res.status).toBe(502);
    expect(await errorOf(res)).toBe("The summary model took too long");
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
