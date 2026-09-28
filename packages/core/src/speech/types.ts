export type SpeechPhase = "idle" | "loading" | "playing" | "done" | "error";

export interface ISpeechState {
  phase: SpeechPhase;
  messageId: number | null;
  text: string;
  error: string | null;
}

export interface ISpeechClip {
  play: () => Promise<void>;
  stop: () => void;
  release: () => void;
}

export interface ISpeechDriver {
  unlock?: () => void;
  createClip: (audio: ArrayBuffer) => Promise<ISpeechClip>;
  fetchAudio: (text: string, signal: AbortSignal) => Promise<ArrayBuffer>;
}
