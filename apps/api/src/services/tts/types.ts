import type { ModelListing } from "@kotys/contracts";

export interface ISpeechRequest {
  model: string;
  text: string;
  refAudio?: string;
  refText?: string;
  signal?: AbortSignal;
}

export interface TtsConnector {
  listModels(): Promise<ModelListing[]>;
  synthesize(req: ISpeechRequest): Promise<ArrayBuffer>;
}
