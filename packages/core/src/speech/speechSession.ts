import { create } from "zustand";
import { speechChunks, toSpeechText } from "./speechText.js";
import type { ISpeechClip, ISpeechDriver, ISpeechState } from "./types.js";

const LINGER_MS = 30_000;
const CACHE_MAX_BYTES = 32 * 1024 * 1024;
const NOTHING_TO_READ = "Nothing to read aloud in this reply";

const IDLE: ISpeechState = {
  phase: "idle",
  messageId: null,
  text: "",
  error: null,
};

interface ISession {
  controller: AbortController;
  clip: ISpeechClip | null;
}

interface IUtterance {
  messageId: number;
  text: string;
  audio: ArrayBuffer[] | null;
}

export const useSpeechStore = create<ISpeechState>(() => IDLE);

let session: ISession | null = null;
let last: IUtterance | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

const clearHideTimer = () => {
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = null;
};

const hideLater = () => {
  clearHideTimer();
  hideTimer = setTimeout(() => {
    hideTimer = null;
    useSpeechStore.setState(IDLE);
  }, LINGER_MS);
};

const endSession = () => {
  if (!session) return;
  session.controller.abort();
  session.clip?.stop();
  session = null;
};

const errorMessage = (err: unknown): string =>
  err instanceof Error && err.message ? err.message : "Speech failed";

const byteLength = (audio: ArrayBuffer[]): number =>
  audio.reduce((sum, bytes) => sum + bytes.byteLength, 0);

const loadersFor = (
  driver: ISpeechDriver,
  utterance: IUtterance,
  signal: AbortSignal,
): (() => Promise<ArrayBuffer>)[] => {
  if (utterance.audio) {
    return utterance.audio.map((bytes) => () => Promise.resolve(bytes));
  }

  return speechChunks(utterance.text).map(
    (chunk) => () => driver.fetchAudio(chunk, signal),
  );
};

async function run(
  driver: ISpeechDriver,
  utterance: IUtterance,
): Promise<void> {
  endSession();
  clearHideTimer();
  const current: ISession = { controller: new AbortController(), clip: null };
  session = current;
  last = utterance;
  const isCurrent = () => session === current;
  const loaders = loadersFor(driver, utterance, current.controller.signal);
  const played: ArrayBuffer[] = [];
  useSpeechStore.setState({
    phase: "loading",
    messageId: utterance.messageId,
    text: utterance.text,
    error: null,
  });

  try {
    let pending = loaders[0]();
    for (let i = 0; i < loaders.length; i++) {
      const bytes = await pending;
      if (!isCurrent()) return;
      played.push(bytes);
      const next = loaders[i + 1];
      if (next) {
        pending = next();
        pending.catch(() => undefined);
      }
      const clip = await driver.createClip(bytes);
      if (!isCurrent()) {
        clip.release();
        return;
      }
      current.clip = clip;
      useSpeechStore.setState({ phase: "playing" });
      await clip.play().finally(() => clip.release());
      current.clip = null;
      if (!isCurrent()) return;
    }
  } catch (err) {
    if (!isCurrent()) return;
    endSession();
    useSpeechStore.setState({ phase: "error", error: errorMessage(err) });
    hideLater();
    return;
  }

  session = null;
  if (byteLength(played) <= CACHE_MAX_BYTES) {
    last = { ...utterance, audio: played };
  }
  useSpeechStore.setState({ phase: "done" });
  hideLater();
}

export function speakMessage(
  driver: ISpeechDriver,
  messageId: number,
  markdown: string,
): Promise<void> {
  const text = toSpeechText(markdown);
  if (!text) {
    endSession();
    last = null;
    useSpeechStore.setState({
      phase: "error",
      messageId,
      text: "",
      error: NOTHING_TO_READ,
    });
    hideLater();
    return Promise.resolve();
  }
  driver.unlock?.();
  const cached =
    last?.messageId === messageId && last.text === text ? last : null;

  return run(driver, cached ?? { messageId, text, audio: null });
}

export function replaySpeech(driver: ISpeechDriver): Promise<void> {
  if (!last) return Promise.resolve();
  driver.unlock?.();

  return run(driver, last);
}

export function stopSpeech(): void {
  endSession();
  clearHideTimer();
  useSpeechStore.setState(IDLE);
}
