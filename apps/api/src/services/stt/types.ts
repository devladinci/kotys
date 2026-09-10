import type { ModelListing } from "@kotys/contracts";

/** A single transcription: text plus whatever metadata came back. */
type TranscriptionResult = {
  text: string;
  language: string | null;
  duration: number | null;
};

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
}
