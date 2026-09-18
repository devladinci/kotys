import type { ModelListing } from "./model";
import type { ToolActivity } from "./tool";

export type ThinkEffort = "off" | "low" | "medium" | "high" | "max";

export type PermissionMode = "ask" | "copilot" | "autopilot";

export type StreamRequest = {
  requestId: number;
  chatId?: number;
  historyUpto?: number;
  host: string;
  model: ModelListing;
  messages: { role: string; content: string; images?: string[] }[];
  /** Owning provider; legacy clients omit it and are served Ollama. */
  provider?: string;
  /** Omitted = server default (thinking on for capable models). */
  think?: ThinkEffort;
  /** Omitted = "copilot". */
  mode?: PermissionMode;
};

export type SteerAppend = {
  content: string;
  id?: string;
};

export type StreamChunk = {
  requestId: number;
  /** Monotonic per request. Used to resume after a dropped socket. */
  seq: number;
  thinkingDelta: string;
  contentDelta: string;
};

export type ChatStreamResult = {
  content: string;
  thinking: string;
  promptTokens: number;
  evalTokens: number;
  /** True when the provider reported these counts; false = chars/4 estimate. */
  tokensMeasured: boolean;
  toolCalls: ToolActivity[];
  toolResultTokens?: number;
};
