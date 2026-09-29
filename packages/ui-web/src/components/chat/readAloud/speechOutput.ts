import { getConfig, requestSpeechAudio } from "@kotys/core";
import type { ITtsDriver, ITtsSynthesizeResult } from "@saystack/core";
import {
  createAudioLevels,
  createWebClip,
  sharedAudioContext,
  unlockWebAudio,
  type IAudioLevels,
} from "@saystack/web";

export interface ISpeechOutput {
  driver: ITtsDriver;
  readLevels: () => Float32Array | undefined;
  dispose: () => void;
}

const failure = (error: unknown): ITtsSynthesizeResult => {
  if (error instanceof TypeError) {
    return {
      ok: false,
      errorCode: "TTS_UNAVAILABLE",
      message: "Could not reach Kotys",
    };
  }

  return {
    ok: false,
    errorCode: "TTS_FAILED",
    message:
      error instanceof Error && error.message ? error.message : "Speech failed",
  };
};

// Speech plays through a level meter so the aura and the player can follow
// the voice. The meter is made with the first clip, after a user gesture.
export function createSpeechOutput(): ISpeechOutput {
  let levels: IAudioLevels | null = null;

  const meter = (): IAudioLevels => {
    if (!levels) levels = createAudioLevels({ isAudible: true });

    return levels;
  };

  const driver: ITtsDriver = {
    unlock: () => unlockWebAudio(),

    synthesize: async ({ text, signal }) => {
      try {
        const audio = await requestSpeechAudio(
          getConfig(),
          text,
          signal ?? new AbortController().signal,
        );

        return { ok: true, audio, mimeType: "audio/wav" };
      } catch (error) {
        return failure(error);
      }
    },

    createClip: async (audio) => {
      try {
        const clip = await createWebClip(audio, {
          context: sharedAudioContext(),
          output: meter().input,
        });

        return { ok: true, clip };
      } catch (error) {
        return {
          ok: false,
          errorCode: "TTS_UNSUPPORTED_MEDIA",
          message:
            error instanceof Error ? error.message : "Unplayable speech audio",
        };
      }
    },
  };

  return {
    driver,
    readLevels: () => levels?.read(),
    dispose: () => {
      levels?.dispose();
      levels = null;
    },
  };
}
