import type { ToolActivity } from "./tool";

export type Role = "user" | "assistant" | "system";

/** A message as the UI holds it. */
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
  /** Unixepoch seconds, straight from the row. Absent on optimistic sends. */
  createdAt?: number;
};

/** A message as it comes off the `messages` table. */
export type MessageRow = {
  id: number;
  chat_id: number;
  role: Role;
  content: string;
  thinking: string | null;
  images: string | null;
  model: string | null;
  prompt_tokens: number | null;
  eval_tokens: number | null;
  tool_calls: string | null;
  created_at: number;
};
