import { create } from "zustand";
import { needsSummary, speechChunks, toSpeechText } from "./speechText.js";
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
  source: string;
  text: string;
  shouldSummarize: boolean;
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

const summaryOf = async (
  driver: ISpeechDriver,
  utterance: IUtterance,
  signal: AbortSignal,
): Promise<string> => {
  const summary = await driver
    .fetchSummary(utterance.messageId, signal)
    .catch(() => null);
  const text = summary ? toSpeechText(summary) : "";

  return text || utterance.text;
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
  const { signal } = current.controller;
  const played: ArrayBuffer[] = [];
  useSpeechStore.setState({
    phase: "loading",
    messageId: utterance.messageId,
    text: utterance.text,
    error: null,
  });

  const text = utterance.shouldSummarize
    ? await summaryOf(driver, utterance, signal)
    : utterance.text;
  if (!isCurrent()) return;
  const ready: IUtterance = { ...utterance, text, shouldSummarize: false };
  last = ready;
  useSpeechStore.setState({ text });
  const loaders = loadersFor(driver, ready, signal);

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
    last = { ...ready, audio: played };
  }
  useSpeechStore.setState({ phase: "done" });
  hideLater();
}

export function speakMessage(
  driver: ISpeechDriver,
  messageId: number,
  markdown: string,
): Promise<void> {
  const source = toSpeechText(markdown);
  if (!source) {
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
    last?.messageId === messageId && last.source === source ? last : null;

  return run(
    driver,
    cached ?? {
      messageId,
      source,
      text: source,
      shouldSummarize: needsSummary(markdown),
      audio: null,
    },
  );
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
