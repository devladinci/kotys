import { useCallback, useEffect, useRef, useState } from "react";
import { getConfig } from "../shared/clients.js";
import {
  transcribeVoice,
  type Platform,
  type VoiceRecording,
  type VoiceStream,
} from "../shared/provider.js";

export type VoiceStatus = "idle" | "recording" | "transcribing" | "error";

/** Dictation that streams into the draft while it is spoken. */
export type VoiceInputLive = {
  /** Everything heard so far, while the user still speaks. */
  onText: (text: string) => void;
  /** The text to keep, or null when the recording was dropped. */
  onEnd: (text: string | null) => void;
};

/**
 * Hold-to-talk state machine: start on press, stop on release, then
 * transcribe through the platform-injected recorder. Cancel drops the
 * recording without paying for a transcription. With `live`, a platform that
 * can stream the transcription shows the words while they are spoken, and
 * the recording is only transcribed when the stream broke off.
 */
export function useVoiceInput(
  platform: Platform,
  onTranscript: (text: string) => void,
  live?: VoiceInputLive,
) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const active = useRef(false);
  const stream = useRef<VoiceStream | null>(null);
  const heard = useRef("");
  const liveRef = useRef(live);

  useEffect(() => {
    liveRef.current = live;
  });

  const start = useCallback(async () => {
    if (active.current) return;
    if (!platform.startVoiceRecording || !platform.stopVoiceRecording) {
      setError("Voice input not supported on this platform");
      setStatus("error");
      return;
    }
    active.current = true;
    heard.current = "";
    setError(null);
    setStatus("recording");
    // Opened before the microphone, so the engine gets ready while the
    // user starts to speak.
    stream.current =
      liveRef.current && platform.streamVoice
        ? platform.streamVoice(getConfig(), (text) => {
            heard.current = text;
            liveRef.current?.onText(text);
          })
        : null;
    try {
      await platform.startVoiceRecording();
    } catch (err) {
      active.current = false;
      stream.current?.cancel();
      stream.current = null;
      setStatus("error");
      setError((err as Error).message);
    }
  }, [platform]);

  const finish = useCallback(
    async (transcribe: boolean) => {
      if (!active.current) return;
      active.current = false;
      const liveStream = stream.current;
      stream.current = null;
      if (!transcribe) {
        liveStream?.cancel();
        try {
          await platform.stopVoiceRecording?.();
        } catch {
          // A cancelled recording needs no report — drop the stop error too.
        }
        if (liveStream) liveRef.current?.onEnd(null);
        setStatus("idle");
        return;
      }
      setStatus("transcribing");
      try {
        const recording: VoiceRecording = await platform.stopVoiceRecording!();
        if (liveStream) {
          const text =
            (await liveStream.finish()) ??
            (await transcribeVoice(getConfig(), recording));
          liveRef.current?.onEnd(text.trim());
          setStatus("idle");
          return;
        }
        const text = await transcribeVoice(getConfig(), recording);
        if (text.trim()) onTranscript(text.trim());
        setStatus("idle");
      } catch (err) {
        if (liveStream) {
          liveStream.cancel();
          // Keep what was already on screen rather than wiping it.
          liveRef.current?.onEnd(heard.current || null);
        }
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
