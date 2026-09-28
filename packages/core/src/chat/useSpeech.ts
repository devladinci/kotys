import { useCallback, useSyncExternalStore } from "react";
import { usePlatform } from "../shared/provider.js";
import { useAppStore } from "../shared/useAppStore.js";

export type SpeechStatus = "idle" | "loading" | "playing" | "error";

export type SpeechState = {
  status: SpeechStatus;
  /** Snippet of the message being spoken, shown in the player bar. */
  text: string;
  error: string | null;
};

type SpeechStore = {
  listeners: Set<() => void>;
  state: SpeechState;
};

const initialSpeechState: SpeechState = {
  status: "idle",
  text: "",
  error: null,
};

const createStore = (): SpeechStore => ({
  listeners: new Set(),
  state: initialSpeechState,
});

const speechStore = createStore();

const emit = (store: SpeechStore) => {
  for (const listener of store.listeners) listener();
};

const setSpeechState = (next: Partial<SpeechState>) => {
  speechStore.state = { ...speechStore.state, ...next };
  emit(speechStore);
};

const subscribeSpeech = (listener: () => void) => {
  speechStore.listeners.add(listener);
  return () => speechStore.listeners.delete(listener);
};

const getSpeechSnapshot = () => speechStore.state;

const reset = () => setSpeechState({ status: "idle", text: "", error: null });

/**
 * One global spoken utterance at a time: any caller (a bubble button, a
 * double-tap, a player bar) speaks through here, and every subscriber —
 * buttons and player bars on any screen — sees the same status.
 */
export function useSpeech() {
  const platform = usePlatform();
  const state = useSyncExternalStore(
    subscribeSpeech,
    getSpeechSnapshot,
    getSpeechSnapshot,
  );

  const stop = useCallback(() => {
    platform.stopSpeech?.();
    reset();
  }, [platform]);

  const speak = useCallback(
    async (text: string) => {
      if (!platform.playSpeech) {
        setSpeechState({
          status: "error",
          text,
          error: "Speech output not supported on this platform",
        });
        return;
      }
      const ttsModel = useAppStore.getState().ttsModel;
      if (!ttsModel) {
        setSpeechState({
          status: "error",
          text,
          error: "No text-to-speech model selected",
        });
        return;
      }
      setSpeechState({ status: "loading", text, error: null });
      try {
        await platform.playSpeech({ text });
        setSpeechState({
          status: "playing",
          text,
          error: null,
        });
      } catch (err) {
        setSpeechState({
          status: "error",
          text,
          error: (err as Error).message,
        });
      }
    },
    [platform],
  );

  return { ...state, speak, stop };
}
