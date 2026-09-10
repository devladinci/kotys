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
  toolCalls?: ToolActivity[];
  /** Unixepoch seconds, straight from the row; absent on optimistic sends. */
  createdAt?: number;
};
