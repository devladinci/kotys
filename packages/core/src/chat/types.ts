import type { ToolActivity } from "@kotys/contracts";

export type Role = "user" | "assistant" | "system";

export type Message = {
  id: number;
  role: Role;
  content: string;
  thinking?: string;
  images?: string[];
  model?: string;
  promptTokens?: number;
  evalTokens?: number;
  /** True when the provider counted this turn; false means chars/4 estimate. */
  tokensMeasured?: boolean;
  toolCalls?: ToolActivity[];
  toolResultTokens?: number;
  /** The running turn's latest request size; cleared when the turn ends. */
  livePromptTokens?: number;
  /** Unixepoch seconds, straight from the row; absent on optimistic sends. */
  createdAt?: number;
};
