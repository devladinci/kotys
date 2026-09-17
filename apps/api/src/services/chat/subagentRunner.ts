import type { ToolActivity } from "@kotys/contracts";
import type { ConnectorChatMessage } from "../llm/types.js";
import type { ToolContext } from "../../tools/types.js";
import { TOOL_DEFINITIONS } from "../../tools/index.js";
import {
  createSubagentChat,
  insertMessage,
  insertToolResults,
} from "@kotys/db";
import { resolveConnector, resolveOllamaConnector } from "../llm/registry.js";
import { createTurnStreamer, isAbortError } from "./turnStream.js";
import { createToolExecutor } from "./toolCallExecutor.js";
import { budgetStop, finalizeTurn, type BudgetStop } from "./turnWrapUp.js";
import {
  resolveAgent,
  toolsForAgent,
  type AgentEntry,
} from "../agents/registry.js";

const SUBAGENT_ROUND_CAP = 50;
const LAST_ROUND_INDEX = SUBAGENT_ROUND_CAP - 1;
const RESULT_CHARS_MAX = 16_000;

export type SubagentRun = {
  content: string;
  childChatId: number | null;
  toolCalls: ToolActivity[];
};

export type SpawnRequest = {
  agent: string;
  prompt: string;
  /** Parent chat; the child row hangs off it. Null = ephemeral run. */
  parentChatId: number | null;
  model: SpawnModel;
  signal: AbortSignal;
  toolContext: ToolContext;
};

/**
 * The parent turn's model, down to what a child needs to re-resolve a
 * connector. The child always runs on the parent's model.
 */
export type SpawnModel = {
  name: string;
  provider?: string;
  source?: "cloud" | "local";
  contextLength?: number | null;
};

/**
 * One subagent turn: its own loop over a restricted toolset, the agent body
 * as the system prompt, a fresh context holding only the task prompt. Reuses
 * the same primitives as streamChat (turnStream / toolCallExecutor /
 * turnWrapUp) without chat-history rebuild, steering, compaction, or
 * notification — a subagent turn is a single task, not a conversation.
 */
export async function runSubagent(req: SpawnRequest): Promise<SubagentRun> {
  const { model, signal, toolContext } = req;
  const agent = resolveAgent(req.agent);
  if (!agent) throw new Error(`Unknown subagent: ${req.agent}`);

  const childChatId =
    req.parentChatId !== null
      ? createChildChat(req.parentChatId, agent, model)
      : null;

  const toolEnabled = toolContext.toolEnabled ?? (() => true);
  const tools = toolsForAgent(agent, TOOL_DEFINITIONS).filter((def) =>
    toolEnabled(def.function.name),
  );
  const chatMessages: ConnectorChatMessage[] = [
    { role: "system", content: agent.body },
    { role: "user", content: req.prompt },
  ];

  const connector =
    model.provider && model.provider !== "ollama"
      ? resolveConnector({ provider: model.provider, model: model.name })
      : resolveOllamaConnector(model.source === "cloud" ? "cloud" : "local");
  const streamer = createTurnStreamer({
    connector,
    modelName: model.name,
    chatMessages,
    tools,
    initialThink: false,
    signal,
    onDelta: () => {},
  });

  const executor = createToolExecutor({
    toolContext,
    enabledDefs: tools,
    toolEnabled,
    builtinDefs: TOOL_DEFINITIONS,
    chatId: childChatId,
    gateRead: toolContext.gateRead ?? false,
    contentLength: () => streamer.content.length,
    turnStartedAt: Date.now(),
  });

  const trace: ToolActivity[] = [];
  let toolResultBytes = 0;
  let stop: BudgetStop | null = null;
  let rounds = 0;
  try {
    for (;;) {
      stop = budgetStop(
        rounds,
        toolResultBytes,
        streamer.usage.promptTokens,
        model.contextLength ?? Number.POSITIVE_INFINITY,
      );
      if (stop) break;
      if (rounds === LAST_ROUND_INDEX) {
        chatMessages.push({
          role: "assistant",
          content:
            "CRITICAL — this is the final tool round for this task. Make the calls you still need now, then answer in plain text.",
        });
      }
      const toolCalls = await streamer.round();
      if (toolCalls.length === 0) break;
      chatMessages.push({
        role: "assistant",
        content: streamer.lastRoundContent,
        toolCalls,
      });
      for (const call of toolCalls) {
        if (signal.aborted) break;
        const outcome = await executor.run(call, signal);
        trace.push(outcome.entry);
        toolResultBytes += outcome.content.length;
        chatMessages.push({
          role: "tool",
          toolName: outcome.toolName,
          toolCallId: call.id ?? "",
          content: outcome.content,
        });
      }
      if (signal.aborted) break;
      rounds++;
      streamer.separator();
    }
    if (stop || !streamer.content.trim()) {
      try {
        await finalizeTurn(
          { streamer, chatMessages, aborted: () => signal.aborted },
          { budgetExhausted: Boolean(stop), budgetReason: stop },
        );
      } catch (err) {
        if (!signal.aborted && !isAbortError(err)) throw err;
      }
    }
  } finally {
    persistChildTurn(childChatId, req.prompt, streamer, trace);
  }

  return {
    content: streamer.content || "(subagent returned no text)",
    childChatId,
    toolCalls: trace,
  };
}

function createChildChat(
  parentChatId: number,
  agent: AgentEntry,
  model: SpawnModel,
): number | null {
  try {
    return createSubagentChat(parentChatId, `subagent:${agent.name}`, {
      name: model.name,
      contextLength: model.contextLength ?? null,
      capabilities: [],
      source: model.source ?? "cloud",
    });
  } catch {
    return null;
  }
}

function persistChildTurn(
  childChatId: number | null,
  prompt: string,
  streamer: { content: string },
  trace: ToolActivity[],
): void {
  if (childChatId === null) return;
  try {
    insertMessage(childChatId, "user", prompt);
    const assistantId = insertMessage(
      childChatId,
      "assistant",
      streamer.content,
    );
    if (assistantId !== null && trace.length > 0) {
      insertToolResults(
        assistantId,
        trace.map((t, i) => ({
          callIndex: i,
          content: t.query ?? t.url ?? t.filePath ?? t.tool,
        })),
      );
    }
  } catch {
    // Persistence is best-effort: the run result matters more than the rows.
  }
}

export function wrapSubagentResult(
  content: string,
  childChatId: number | null,
): string {
  const trimmed = content.slice(0, RESULT_CHARS_MAX);
  const suffix =
    content.length > RESULT_CHARS_MAX ? "\n\n[result truncated]" : "";
  const child = childChatId !== null ? `\n(child chat id: ${childChatId})` : "";
  return `<task_result>\n${trimmed}${suffix}${child}\n</task_result>`;
}
