import type { ISpeechClip } from "@kotys/core";

let context: AudioContext | null = null;

const audioContext = (): AudioContext => {
  if (!context) context = new AudioContext();

  return context;
};

export const unlockSpeech = (): void => {
  void audioContext().resume();
};

export const createSpeechClip = async (
  audio: ArrayBuffer,
): Promise<ISpeechClip> => {
  const ctx = audioContext();
  const buffer = await ctx.decodeAudioData(audio.slice(0));
  let source: AudioBufferSourceNode | null = null;

  return {
    play: () =>
      new Promise<void>((resolve) => {
        const node = ctx.createBufferSource();
        node.buffer = buffer;
        node.connect(ctx.destination);
        node.onended = () => {
          node.disconnect();
          if (source === node) source = null;
          resolve();
        };
        source = node;
        node.start();
      }),
    stop: () => source?.stop(),
    release: () => source?.stop(),
  };
};
