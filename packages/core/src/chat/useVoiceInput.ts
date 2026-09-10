import { useCallback, useRef, useState } from "react";
import { getConfig } from "../shared/clients.js";
import {
  transcribeVoice,
  type Platform,
  type VoiceRecording,
} from "../shared/provider.js";

export type VoiceStatus = "idle" | "recording" | "transcribing" | "error";

/**
 * Hold-to-talk state machine: start on press, stop on release, then
 * transcribe through the platform-injected recorder. Cancel drops the
 * recording without paying for a transcription.
 */
export function useVoiceInput(
  platform: Platform,
  onTranscript: (text: string) => void,
) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const active = useRef(false);

  const start = useCallback(async () => {
    if (active.current) return;
    if (!platform.startVoiceRecording || !platform.stopVoiceRecording) {
      setError("Voice input not supported on this platform");
      setStatus("error");
      return;
    }
    active.current = true;
    setError(null);
    setStatus("recording");
    try {
      await platform.startVoiceRecording();
    } catch (err) {
      active.current = false;
      setStatus("error");
      setError((err as Error).message);
    }
  }, [platform]);

  const finish = useCallback(
    async (transcribe: boolean) => {
      if (!active.current) return;
      active.current = false;
      if (!transcribe) {
        try {
          await platform.stopVoiceRecording?.();
        } catch {
          // A cancelled recording needs no report — drop the stop error too.
        }
        setStatus("idle");
        return;
      }
      setStatus("transcribing");
      try {
        const recording: VoiceRecording = await platform.stopVoiceRecording!();
        const text = await transcribeVoice(getConfig(), recording);
        if (text.trim()) onTranscript(text.trim());
        setStatus("idle");
      } catch (err) {
        setStatus("error");
        setError((err as Error).message);
      }
    },
    [platform, onTranscript],
  );

  const stop = useCallback(() => {
    void finish(true);
  }, [finish]);
  const cancel = useCallback(() => {
    void finish(false);
  }, [finish]);

  const clearError = useCallback(() => {
    setError(null);
    setStatus((s) => (s === "error" ? "idle" : s));
  }, []);

  return { status, error, start, stop, cancel, clearError };
}
