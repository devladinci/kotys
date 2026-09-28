import type { ModelListing } from "@kotys/contracts";

/**
 * A speech-to-text provider = endpoint + wire protocol. Implementations
 * translate between this provider-neutral shape and the provider's own API —
 * the same seam the LLM connectors draw, so adding a cloud TTS provider is
 * a new connector, not a route rewrite.
 */
export interface TtsConnector {
  listModels(): Promise<ModelListing[]>;
  synthesize(req: {
    model: string;
    text: string;
    voice?: string;
  }): Promise<ArrayBuffer>;
}
