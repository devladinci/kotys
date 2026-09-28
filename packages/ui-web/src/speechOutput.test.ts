import { beforeEach, describe, expect, it, vi } from "vitest";

class FakeSource {
  buffer: unknown = null;
  onended: (() => void) | null = null;
  connect = vi.fn();
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn(() => this.onended?.());
}

const sources: FakeSource[] = [];
const contexts: FakeAudioContext[] = [];

class FakeAudioContext {
  constructor() {
    contexts.push(this);
  }

  destination = {};
  resume = vi.fn(async () => {});
  decodeAudioData = vi.fn(async (bytes: ArrayBuffer) => ({ bytes }));
  createBufferSource = vi.fn(() => {
    const source = new FakeSource();
    sources.push(source);
    return source;
  });
}

vi.stubGlobal("AudioContext", FakeAudioContext);

const { createSpeechClip, unlockSpeech } = await import("./speechOutput");

const wav = () => new TextEncoder().encode("RIFF....WAVE").buffer;

beforeEach(() => {
  sources.length = 0;
});

describe("web speech output", () => {
  it("decodes a copy so cached audio can be played again", async () => {
    const bytes = wav();
    await createSpeechClip(bytes);
    const decoded = contexts[0].decodeAudioData.mock.calls[0][0];

    expect(decoded).not.toBe(bytes);
    expect(new Uint8Array(decoded)).toEqual(new Uint8Array(bytes));
  });

  it("finishes playing when the audio ends", async () => {
    const clip = await createSpeechClip(wav());
    let isDone = false;
    const playing = clip.play().then(() => {
      isDone = true;
    });
    await Promise.resolve();

    expect(sources[0].start).toHaveBeenCalled();
    expect(isDone).toBe(false);

    sources[0].onended?.();
    await playing;

    expect(isDone).toBe(true);
    expect(sources[0].disconnect).toHaveBeenCalled();
  });

  it("stop ends playback early", async () => {
    const clip = await createSpeechClip(wav());
    const playing = clip.play();
    clip.stop();

    await expect(playing).resolves.toBeUndefined();
    expect(sources[0].stop).toHaveBeenCalledTimes(1);
  });

  it("unlock resumes the one shared audio context", () => {
    unlockSpeech();

    expect(contexts).toHaveLength(1);
    expect(contexts[0].resume).toHaveBeenCalledTimes(1);
  });
});
