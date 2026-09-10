export type ModelRef = {
  provider: string;
  model: string;
};

export type ModelListing = {
  name: string;
  contextLength: number | null;
  capabilities: string[];
  source: "cloud" | "local";
  /** Owning provider; legacy listings without it are Ollama. */
  provider?: string;
  host?: string;
};

export type RunningModel = {
  name: string;
  sizeVram: number;
  expiresAt: string | null;
};
