import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { getConfig } from "../shared/clients.js";
import { usePlatform, type Platform } from "../shared/provider.js";
import { requestSpeechAudio } from "./speechApi.js";
import {
  replaySpeech,
  speakMessage,
  stopSpeech,
  useSpeechStore,
} from "./speechSession.js";
import type {
  ISpeechClip,
  ISpeechDriver,
  ISpeechState,
  SpeechPhase,
} from "./types.js";

interface ISpeechActions {
  speak: (messageId: number, markdown: string) => void;
  replay: () => void;
  stop: () => void;
}

const unsupported = (): Promise<ISpeechClip> =>
  Promise.reject(new Error("Speech output is not supported here"));

const driverFor = (platform: Platform): ISpeechDriver => ({
  unlock: platform.unlockSpeech,
  createClip: platform.createSpeechClip ?? unsupported,
  fetchAudio: (text, signal) => requestSpeechAudio(getConfig(), text, signal),
});

export function useSpeechActions(): ISpeechActions {
  const platform = usePlatform();

  return useMemo(() => {
    const driver = driverFor(platform);

    return {
      speak: (messageId, markdown) => {
        void speakMessage(driver, messageId, markdown);
      },
      replay: () => {
        void replaySpeech(driver);
      },
      stop: stopSpeech,
    };
  }, [platform]);
}

export function useMessageSpeechPhase(messageId: number): SpeechPhase {
  return useSpeechStore((s) => (s.messageId === messageId ? s.phase : "idle"));
}

export function useSpeechBar(): Omit<ISpeechState, "messageId"> {
  return useSpeechStore(
    useShallow((s) => ({ phase: s.phase, text: s.text, error: s.error })),
  );
}
