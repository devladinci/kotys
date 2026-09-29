import type { ModelListing } from "@kotys/contracts";

/** A single transcription: text plus whatever metadata came back. */
type TranscriptionResult = {
  text: string;
  language: string | null;
  duration: number | null;
};

/** What a live transcription reports while the user speaks. */
export type SttStreamEvent =
  | { type: "ready" }
  | { type: "delta"; text: string }
  | { type: "done"; text: string }
  | { type: "error"; message: string };

/** One live transcription: 16 kHz mono PCM16 in, text as it settles out. */
export interface SttStream {
  send(pcm: Uint8Array): void;
  /** No more audio: the provider finishes the text, then reports done. */
  stop(): void;
  close(): void;
}

/**
 * A speech-to-text provider = endpoint + wire protocol. Implementations
 * translate between this provider-neutral shape and the provider's own API —
 * the same seam the LLM connectors draw, so adding a cloud STT provider is
 * a new connector, not a route rewrite.
 */
export interface SttConnector {
  listModels(): Promise<ModelListing[]>;
  transcribe(req: {
    model: string;
    file: Blob;
    filename: string;
    language?: string;
  }): Promise<TranscriptionResult>;
  /** Providers without live transcription leave these out. */
  supportsStreaming?(model: string): Promise<boolean>;
  openStream?(
    req: { model: string; language?: string },
    onEvent: (event: SttStreamEvent) => void,
  ): SttStream;
}
