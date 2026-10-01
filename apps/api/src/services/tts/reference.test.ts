import { rmSync, truncateSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ settings: new Map<string, string>() }));

vi.mock("@kotys/db", async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "kotys-tts-reference-"));

  return {
    DB_PATH: join(dir, "chat.db"),
    getSetting: (key: string) => mocks.settings.get(key) ?? null,
    setSetting: (key: string, value: string) => mocks.settings.set(key, value),
  };
});

const { DB_PATH } = await import("@kotys/db");
const {
  isWav,
  loadReference,
  referenceStatus,
  removeReference,
  saveReference,
} = await import("./reference.js");

const FILE = path.join(path.dirname(DB_PATH), "tts-reference.wav");
const wav = (tail: string) =>
  new TextEncoder().encode(`RIFF\0\0\0\0WAVEfmt ${tail}`);

beforeEach(async () => {
  mocks.settings.clear();
  await removeReference();
});

afterAll(() => {
  rmSync(path.dirname(DB_PATH), { recursive: true, force: true });
});

describe("tts reference clip", () => {
  it("recognizes wav headers only", () => {
    expect(isWav(wav("data"))).toBe(true);
    expect(isWav(new TextEncoder().encode("ID3\u0004 mp3 frame data"))).toBe(
      false,
    );
    expect(isWav(new TextEncoder().encode("RIFF"))).toBe(false);
  });

  it("is not set until a clip and its transcript are saved", async () => {
    expect(await referenceStatus()).toEqual({ isSet: false, text: "" });
    expect(await loadReference()).toBeNull();
  });

  it("loads the saved clip as base64 with its transcript", async () => {
    const bytes = wav("one");
    await saveReference(bytes, "Words in the clip.");

    expect(await referenceStatus()).toEqual({
      isSet: true,
      text: "Words in the clip.",
    });
    expect(await loadReference()).toEqual({
      audio: Buffer.from(bytes).toString("base64"),
      text: "Words in the clip.",
    });
  });

  it("picks up a replaced clip", async () => {
    await saveReference(wav("one"), "First.");
    await loadReference();
    await saveReference(wav("second clip"), "Second.");

    expect(await loadReference()).toEqual({
      audio: Buffer.from(wav("second clip")).toString("base64"),
      text: "Second.",
    });
  });

  it("skips a clip that grew past the size limit on disk", async () => {
    await saveReference(wav("one"), "Words.");
    truncateSync(FILE, 10 * 1024 * 1024 + 1);

    expect(await loadReference()).toBeNull();
  });

  it("skips a transcript whose clip is gone", async () => {
    await saveReference(wav("one"), "Words.");
    rmSync(FILE);

    expect(await loadReference()).toBeNull();
    expect((await referenceStatus()).isSet).toBe(false);
  });

  it("removes the clip and the transcript", async () => {
    writeFileSync(FILE, wav("one"));
    mocks.settings.set("tts_reference_text", "Words.");
    await removeReference();

    expect(await referenceStatus()).toEqual({ isSet: false, text: "" });
  });
});
