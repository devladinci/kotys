import type { ToolDefinition } from "@kotys/contracts";
import {
  applyConnectorRoundUsage,
  emptyUsage,
  type TurnUsage,
} from "../usage.js";
import type { ConnectorChatMessage, LlmConnector } from "../llm/types.js";

/** One round's tool calls, as the connector reports them. */
export type RoundToolCall = {
  id?: string;
  function: { name: string; arguments: Record<string, unknown> };
};

type TurnThink = boolean | "low" | "medium" | "high" | "max";

export type TurnStreamerArgs = {
  connector: LlmConnector;
  modelName: string;
  /** Live array — rounds always read its current contents. */
  chatMessages: ConnectorChatMessage[];
  /** Live array of tool definitions, read at call time. */
  tools: ToolDefinition[];
  initialThink: TurnThink;
  signal: AbortSignal;
  onDelta: (thinkingDelta: string, contentDelta: string) => void;
};

export type TurnStreamer = {
  /** Text streamed this turn, across all rounds. */
  readonly content: string;
  readonly thinking: string;
  readonly usage: TurnUsage;
  /** The prose written in the most recent round, before its tool calls. */
  readonly lastRoundContent: string;
  /** False once the model rejected tools and the fallback dropped them. */
  readonly toolsActive: boolean;
  disableTools(): void;
  /** One round with tools offered, retrying without think/tools on rejection. */
  round(): Promise<RoundToolCall[]>;
  /** One round with the tools array dropped (final-answer forcing). */
  roundWithoutTools(think?: TurnThink): Promise<RoundToolCall[]>;
  /** Separate text before and after tool use. */
  separator(): void;
};

const isAbortError = (err: unknown) =>
  err instanceof Error &&
  (err.name === "AbortError" || /abort/i.test(err.message));

/**
 * One turn's streaming state: accumulates text and usage across rounds,
 * retries once without think or tools when the model rejects them, and never
 * advertises an empty tools array.
 */
export function createTurnStreamer(args: TurnStreamerArgs): TurnStreamer {
  const { connector, modelName, chatMessages, tools, signal, onDelta } = args;
  let content = "";
  let thinking = "";
  let usage: TurnUsage = emptyUsage();
  let think = args.initialThink;
  let useTools = true;
  let lastRoundContent = "";

  const streamOnce = async (
    offerTools: boolean,
    thinkOverride?: TurnThink,
  ): Promise<RoundToolCall[]> => {
    const useThink = thinkOverride ?? think;
    const roundToolCalls: RoundToolCall[] = [];
    lastRoundContent = "";
    const handle = connector.stream(
      {
        model: modelName,
        messages: chatMessages,
        ...(useTools && offerTools && tools.length > 0 ? { tools } : {}),
        // Provider-neutral: each connector maps `think` to its own wire
        // format (Ollama's think field, oMLX's chat_template_kwargs, ...).
        ...(useThink === undefined ? {} : { think: useThink }),
      },
      (chunk) => {
        lastRoundContent += chunk.contentDelta;
        content += chunk.contentDelta;
        thinking += chunk.thinkingDelta;
        // Empty deltas are bookkeeping only; never reach the client.
        if (chunk.thinkingDelta || chunk.contentDelta) {
          onDelta(chunk.thinkingDelta, chunk.contentDelta);
        }
        if (chunk.toolCalls?.length) roundToolCalls.push(...chunk.toolCalls);
      },
      signal,
    );
    const roundUsage = await handle.done;
    if (roundUsage) usage = applyConnectorRoundUsage(usage, roundUsage);
    return roundToolCalls;
  };

  // Retry once without think / without tools when the model rejects them.
  // Retries are allowed only while nothing has streamed, so a mid-turn
  // rejection is never papered over with a truncated reply.
  const round = async (): Promise<RoundToolCall[]> => {
    for (;;) {
      try {
        return await streamOnce(true);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!content && !thinking) {
          if (think && /think/i.test(msg)) {
            think = false;
            continue;
          }
          if (useTools && /tool/i.test(msg)) {
            useTools = false;
            continue;
          }
        }
        throw err;
      }
    }
  };

  const roundWithoutTools = (thinkOverride?: TurnThink) =>
    streamOnce(false, thinkOverride);

  return {
    get content() {
      return content;
    },
    get thinking() {
      return thinking;
    },
    get usage() {
      return usage;
    },
    get lastRoundContent() {
      return lastRoundContent;
    },
    get toolsActive() {
      return useTools;
    },
    disableTools() {
      useTools = false;
    },
    round,
    roundWithoutTools,
    separator() {
      // The break must also land in the accumulated content: the persisted
      // writes (progress tick, final result) store `content`, and without it
      // every round boundary collapses once the message is read back from the
      // database — the live stream looked right while the saved row did not.
      if (content) {
        content += "\n\n";
        onDelta("", "\n\n");
      }
    },
  };
}

export { isAbortError };
