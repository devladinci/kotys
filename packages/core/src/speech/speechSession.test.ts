import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  replaySpeech,
  speakMessage,
  stopSpeech,
  useSpeechStore,
} from "./speechSession.js";
import type { ISpeechClip, ISpeechDriver } from "./types.js";

interface IFakeRequest {
  text: string;
  signal: AbortSignal;
  resolve: (audio: ArrayBuffer) => void;
  reject: (err: Error) => void;
}

interface IFakeClip extends ISpeechClip {
  audio: ArrayBuffer;
  finish: () => void;
}

const audioFor = (text: string) => new TextEncoder().encode(text).buffer;

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const createDriver = () => {
  const requests: IFakeRequest[] = [];
  const clips: IFakeClip[] = [];
  const driver: ISpeechDriver = {
    unlock: vi.fn(),
    fetchAudio: vi.fn(
      (text: string, signal: AbortSignal) =>
        new Promise<ArrayBuffer>((resolve, reject) => {
          requests.push({ text, signal, resolve, reject });
        }),
    ),
    createClip: vi.fn(async (audio: ArrayBuffer) => {
      let done: () => void = () => {};
      const clip: IFakeClip = {
        audio,
        play: vi.fn(
          () =>
            new Promise<void>((resolve) => {
              done = resolve;
            }),
        ),
        stop: vi.fn(() => done()),
        release: vi.fn(),
        finish: () => done(),
      };
      clips.push(clip);
      return clip;
    }),
  };
  return { driver, requests, clips };
};

const LONG_REPLY = Array.from(
  { length: 12 },
  (_, i) => `This is sentence number ${i + 1} of the reply.`,
).join(" ");

beforeEach(() => {
  stopSpeech();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("speakMessage", () => {
  it("is loading while the first chunk synthesizes, playing while audible, done after", async () => {
    const { driver, requests, clips } = createDriver();
    const done = speakMessage(driver, 7, "Hello there.");

    expect(useSpeechStore.getState()).toMatchObject({
      phase: "loading",
      messageId: 7,
      text: "Hello there.",
    });
    expect(driver.unlock).toHaveBeenCalledTimes(1);

    requests[0].resolve(audioFor("a"));
    await flush();

    expect(useSpeechStore.getState().phase).toBe("playing");
    expect(clips[0].play).toHaveBeenCalledTimes(1);

    clips[0].finish();
    await done;

    expect(useSpeechStore.getState().phase).toBe("done");
    expect(clips[0].release).toHaveBeenCalledTimes(1);
  });

  it("requests the next chunk while the current one is still playing", async () => {
    const { driver, requests, clips } = createDriver();
    void speakMessage(driver, 11, LONG_REPLY);

    requests[0].resolve(audioFor("1"));
    await flush();

    expect(clips[0].play).toHaveBeenCalled();
    expect(requests).toHaveLength(2);
    expect(`${requests[0].text} ${requests[1].text}`).toBe(
      LONG_REPLY.slice(
        0,
        requests[0].text.length + requests[1].text.length + 1,
      ),
    );
  });

  it("plays chunks in order and finishes after the last one", async () => {
    const { driver, requests, clips } = createDriver();
    const done = speakMessage(driver, 12, LONG_REPLY);

    for (let i = 0; i < 20 && useSpeechStore.getState().phase !== "done"; i++) {
      requests[i]?.resolve(audioFor(String(i)));
      await flush();
      clips[i]?.finish();
      await flush();
    }
    await done;

    expect(useSpeechStore.getState().phase).toBe("done");
    expect(clips.length).toBe(requests.length);
    expect(clips.map((c) => new TextDecoder().decode(c.audio))).toEqual(
      requests.map((_, i) => String(i)),
    );
    expect(
      clips.every((c) => vi.mocked(c.release).mock.calls.length === 1),
    ).toBe(true);
  });

  it("stop during synthesis aborts the request and never plays", async () => {
    const { driver, requests } = createDriver();
    void speakMessage(driver, 3, "Hello there.");

    stopSpeech();

    expect(requests[0].signal.aborted).toBe(true);
    expect(useSpeechStore.getState().phase).toBe("idle");

    requests[0].resolve(audioFor("late"));
    await flush();

    expect(driver.createClip).not.toHaveBeenCalled();
    expect(useSpeechStore.getState().phase).toBe("idle");
  });

  it("stop during playback stops the clip and stays idle", async () => {
    const { driver, requests, clips } = createDriver();
    const done = speakMessage(driver, 13, LONG_REPLY);
    requests[0].resolve(audioFor("1"));
    await flush();

    stopSpeech();
    await done;

    expect(clips[0].stop).toHaveBeenCalledTimes(1);
    expect(clips[0].release).toHaveBeenCalledTimes(1);
    expect(requests[1].signal.aborted).toBe(true);
    expect(useSpeechStore.getState().phase).toBe("idle");
  });

  it("speaking another message replaces the current one", async () => {
    const { driver, requests, clips } = createDriver();
    void speakMessage(driver, 1, "First reply.");
    requests[0].resolve(audioFor("first"));
    await flush();

    void speakMessage(driver, 2, "Second reply.");

    expect(clips[0].stop).toHaveBeenCalledTimes(1);
    expect(useSpeechStore.getState()).toMatchObject({
      phase: "loading",
      messageId: 2,
      text: "Second reply.",
    });
  });

  it("ignores a late result from a replaced message", async () => {
    const { driver, requests, clips } = createDriver();
    void speakMessage(driver, 14, "First reply.");
    void speakMessage(driver, 15, "Second reply.");

    requests[0].resolve(audioFor("first"));
    await flush();

    expect(clips).toHaveLength(0);
    expect(useSpeechStore.getState()).toMatchObject({
      phase: "loading",
      messageId: 15,
    });
  });

  it("surfaces the server error", async () => {
    const { driver, requests } = createDriver();
    const done = speakMessage(driver, 4, "Hello there.");

    requests[0].reject(new Error("No text-to-speech model selected"));
    await done;

    expect(useSpeechStore.getState()).toMatchObject({
      phase: "error",
      messageId: 4,
      error: "No text-to-speech model selected",
    });
  });

  it("stops at a failed chunk after the earlier ones played", async () => {
    const { driver, requests, clips } = createDriver();
    const done = speakMessage(driver, 16, LONG_REPLY);
    requests[0].resolve(audioFor("1"));
    await flush();

    requests[1].reject(new Error("speech failed: 500"));
    clips[0].finish();
    await done;

    expect(clips).toHaveLength(1);
    expect(useSpeechStore.getState()).toMatchObject({
      phase: "error",
      error: "speech failed: 500",
    });
  });

  it("reports a code-only reply without calling the server", async () => {
    const { driver } = createDriver();
    await speakMessage(driver, 5, "```js\nconst x = 1;\n```");

    expect(driver.fetchAudio).not.toHaveBeenCalled();
    expect(useSpeechStore.getState()).toMatchObject({
      phase: "error",
      messageId: 5,
      error: "Nothing to read aloud in this reply",
    });
  });

  it("hides the bar 30 seconds after playback ends", async () => {
    vi.useFakeTimers();
    const { driver, requests, clips } = createDriver();
    const done = speakMessage(driver, 6, "Hello there.");
    requests[0].resolve(audioFor("a"));
    await vi.advanceTimersByTimeAsync(0);
    clips[0].finish();
    await done;

    await vi.advanceTimersByTimeAsync(29_000);
    expect(useSpeechStore.getState().phase).toBe("done");

    await vi.advanceTimersByTimeAsync(1_000);
    expect(useSpeechStore.getState()).toMatchObject({
      phase: "idle",
      messageId: null,
    });
  });
});

describe("replaySpeech", () => {
  it("replays the last message from cached audio without new requests", async () => {
    const { driver, requests, clips } = createDriver();
    const first = speakMessage(driver, 8, "Hello there.");
    requests[0].resolve(audioFor("cached"));
    await flush();
    clips[0].finish();
    await first;

    const replay = replaySpeech(driver);
    await flush();

    expect(driver.fetchAudio).toHaveBeenCalledTimes(1);
    expect(useSpeechStore.getState()).toMatchObject({
      phase: "playing",
      messageId: 8,
    });
    expect(new TextDecoder().decode(clips[1].audio)).toBe("cached");

    clips[1].finish();
    await replay;

    expect(useSpeechStore.getState().phase).toBe("done");
  });

  it("speaking the same message again also uses the cache", async () => {
    const { driver, requests, clips } = createDriver();
    const first = speakMessage(driver, 10, "Hello there.");
    requests[0].resolve(audioFor("cached"));
    await flush();
    clips[0].finish();
    await first;

    void speakMessage(driver, 10, "Hello there.");
    await flush();

    expect(driver.fetchAudio).toHaveBeenCalledTimes(1);
    expect(clips).toHaveLength(2);
  });

  it("retries a failed message with a fresh request", async () => {
    const { driver, requests } = createDriver();
    const first = speakMessage(driver, 9, "Hello there.");
    requests[0].reject(new Error("boom"));
    await first;

    void replaySpeech(driver);

    expect(driver.fetchAudio).toHaveBeenCalledTimes(2);
    expect(useSpeechStore.getState()).toMatchObject({
      phase: "loading",
      messageId: 9,
      error: null,
    });
  });
});
