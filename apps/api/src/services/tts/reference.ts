import path from "node:path";
import { readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { DB_PATH, getSetting, setSetting } from "@kotys/db";

export const REFERENCE_MAX_BYTES = 10 * 1024 * 1024;
export const REFERENCE_TEXT_MAX_CHARS = 1_000;
const REFERENCE_TEXT_SETTING = "tts_reference_text";

interface ISpeechReference {
  audio: string;
  text: string;
}

interface ICachedAudio {
  mtimeMs: number;
  size: number;
  base64: string;
}

let cached: ICachedAudio | null = null;

const referencePath = (): string =>
  path.join(path.dirname(DB_PATH), "tts-reference.wav");

const ascii = (bytes: Uint8Array, start: number, end: number): string =>
  String.fromCharCode(...bytes.subarray(start, end));

export const isWav = (bytes: Uint8Array): boolean =>
  bytes.length > 12 &&
  ascii(bytes, 0, 4) === "RIFF" &&
  ascii(bytes, 8, 12) === "WAVE";

export async function saveReference(
  bytes: Uint8Array,
  text: string,
): Promise<void> {
  const target = referencePath();
  await writeFile(`${target}.tmp`, bytes);
  await rename(`${target}.tmp`, target);
  setSetting(REFERENCE_TEXT_SETTING, text);
  cached = null;
}

export async function removeReference(): Promise<void> {
  await rm(referencePath(), { force: true });
  setSetting(REFERENCE_TEXT_SETTING, "");
  cached = null;
}

export async function referenceStatus(): Promise<{
  isSet: boolean;
  text: string;
}> {
  const text = getSetting(REFERENCE_TEXT_SETTING) ?? "";
  const info = await stat(referencePath()).catch(() => null);

  return { isSet: Boolean(text && info?.isFile()), text };
}

export async function loadReference(): Promise<ISpeechReference | null> {
  const text = getSetting(REFERENCE_TEXT_SETTING);
  if (!text) return null;
  const info = await stat(referencePath()).catch(() => null);
  if (!info?.isFile() || info.size > REFERENCE_MAX_BYTES) return null;
  if (!cached || cached.mtimeMs !== info.mtimeMs || cached.size !== info.size) {
    const bytes = await readFile(referencePath());
    cached = {
      mtimeMs: info.mtimeMs,
      size: info.size,
      base64: bytes.toString("base64"),
    };
  }

  return { audio: cached.base64, text };
}
