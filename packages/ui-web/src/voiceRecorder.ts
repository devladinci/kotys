/**
 * MediaRecorder-based voice capture for web/desktop. Prefers webm/opus
 * (smallest, well-supported); falls back to whatever the browser offers.
 */
export type VoiceRecorder = {
  start: () => Promise<void>;
  stop: () => Promise<{ blob: Blob; mimeType: string }>;
};

const PREFERRED_MIME = "audio/webm;codecs=opus";

const pickMimeType = (): string | undefined => {
  if (typeof MediaRecorder === "undefined") return undefined;
  if (MediaRecorder.isTypeSupported?.(PREFERRED_MIME)) return PREFERRED_MIME;
  return undefined;
};

export function createVoiceRecorder(): VoiceRecorder {
  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let mimeType = "audio/webm";
  let stream: MediaStream | null = null;
  let starting: Promise<void> | null = null;

  return {
    async start() {
      if (recorder || starting) return;
      starting = (async () => {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mimeType = pickMimeType() ?? "";
        recorder = new MediaRecorder(
          stream,
          mimeType ? { mimeType } : undefined,
        );
        chunks = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };
        recorder.start();
      })();
      try {
        await starting;
      } finally {
        starting = null;
      }
    },
    async stop() {
      const rec = recorder;
      recorder = null;
      if (!rec) throw new Error("Not recording");
      const stopped = new Promise<void>((resolve) => {
        rec.onstop = () => resolve();
      });
      if (rec.state !== "inactive") rec.stop();
      await stopped;
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
      const type = rec.mimeType || mimeType || "audio/webm";
      const blob = new Blob(chunks, { type });
      chunks = [];
      // A very short press stops the recorder before it emitted a chunk.
      // Uploading it would only earn a cryptic server error.
      if (blob.size === 0) throw new Error("Recording was too short");
      return { blob, mimeType: type };
    },
  };
}
