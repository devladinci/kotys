import type { ModelListing, ModelRef, ToolDefinition } from "@kotys/contracts";

export type ConnectorUsage = { promptTokens: number; evalTokens: number };

export type ConnectorChatMessage = {
  role: string;
  content: string;
  images?: string[];
  toolCalls?: {
    id?: string;
    function: { name: string; arguments: Record<string, unknown> };
  }[];
  /** Set on role:"tool" messages; the call these results belong to. */
  toolCallId?: string;
  toolName?: string;
};

export type ConnectorChatRequest = {
  model: string;
  messages: ConnectorChatMessage[];
  tools?: ToolDefinition[];
  temperature?: number;
  seed?: number;
  maxTokens?: number;
  /**
   * Provider-neutral reasoning control (boolean or effort string). Each
   * connector maps it to its own wire format — Ollama's think field, oMLX's
   * chat_template_kwargs.{enable_thinking,reasoning_effort}; servers without
   * a reasoning switch ignore it.
   */
  think?: boolean | "low" | "medium" | "high" | "max";
};

/** One delta of a streamed chat completion. Usage arrives via StreamHandle. */
export type ConnectorStreamChunk = {
  thinkingDelta: string;
  contentDelta: string;
  toolCalls?: {
    id?: string;
    function: { name: string; arguments: Record<string, unknown> };
  }[];
};

export type StreamHandle = {
  /** Resolves with the round's usage once the stream ends. */
  done: Promise<ConnectorUsage | null>;
};

type ChatJsonRequest = {
  model: string;
  messages: { role: string; content: string }[];
  temperature?: number;
  seed?: number;
  maxTokens?: number;
};

/**
 * A provider = endpoint + wire protocol. Implementations translate between
 * the provider-neutral shapes above and the provider's own wire format.
 */
export interface LlmConnector {
  listModels(): Promise<ModelListing[]>;
  /** For providers whose window is configured server-side and can change under a chat. */
  describeModel?(name: string): Promise<ModelListing | null>;
  chat(
    req: ConnectorChatRequest,
  ): Promise<{ content: string; usage: ConnectorUsage | null }>;
  stream(
    req: ConnectorChatRequest,
    onChunk: (chunk: ConnectorStreamChunk) => void,
    signal: AbortSignal,
  ): StreamHandle;
  chatJson(req: ChatJsonRequest, schema: object): Promise<string>;
  /** Warm the model (Ollama keep_alive); providers with always-on servers no-op. */
  ensureLoaded?(ref: ModelRef): Promise<void>;
  /** Release the model (keep_alive: 0); providers with always-on servers no-op. */
  release?(ref: ModelRef): Promise<void>;
}
