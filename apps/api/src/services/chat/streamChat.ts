import os from "node:os";
import { Ollama } from "ollama";
import type {
  ToolActivity,
  StreamRequest,
  ChatStreamResult,
  PermissionMode,
} from "@kotys/contracts";
import {
  DEFAULT_CONTEXT,
  estimateTokensFromChars,
  OLLAMA_CLOUD_HOST,
} from "@kotys/contracts";
import {
  getChatById,
  getChatIdForMessage,
  getChatTopics,
  getSetting,
  insertToolResults,
  updateMessage,
} from "@kotys/db";
import type { ToolContext } from "../../tools/types.js";
import { TOOL_DEFINITIONS } from "../../tools/index.js";
import { isReadOnlyBash } from "../../tools/readOnlyBash.js";
import {
  getToolRoster,
  getMcpToolDefinitionsByName,
  ALWAYS_LOADED_TOOLS,
} from "../mcp.js";
import { requestApproval } from "../approval.js";
import { requestUserInput } from "../input.js";
import { events } from "../events.js";
import {
  resolveConnector,
  resolveOllamaConnector,
  type ConnectorChatMessage,
} from "../llm/registry.js";
import {
  budgetLoadedMcpDefs,
  getLoadedMcpToolNames,
  mcpIndexTier,
  withSystemBlocks,
} from "./mcpIndex.js";
import { buildDaemonMessages } from "./context.js";
import { logTokenAccounting, recordTurnUsage } from "./context-budget.js";
import { getSkillAdvertisement } from "../skills/registry.js";
import { getEnabledTools } from "./toolEnabled.js";
import { maybeNotify } from "./notify.js";
import { createTurnStreamer, isAbortError } from "./turnStream.js";
import { createToolExecutor } from "./toolCallExecutor.js";
import {
  budgetStop,
  finalizeTurn,
  LAST_ROUND_PREFILL,
  MAX_TOOL_ROUNDS,
  type BudgetStop,
} from "./turnWrapUp.js";

export interface StreamCallbacks {
  onChunk: (chunk: { thinkingDelta: string; contentDelta: string }) => void;
  onToolActivity: (activity: ToolActivity, index: number) => void;
}

const LAST_ROUND_INDEX = MAX_TOOL_ROUNDS - 1;

/**
 * Streaming chat with an agentic tool loop. Deltas go to `onChunk`, tool
 * activity to `onToolActivity`. Abort stops the stream and retracts any
 * pending approval dialog.
 *
 * This is the orchestrator: turn setup, the round loop, and the return value.
 * Streaming lives in turnStream.ts, single-call execution in
 * toolCallExecutor.ts, and end-of-turn repair in turnWrapUp.ts.
 */
export async function streamChat(
  req: StreamRequest,
  callbacks: StreamCallbacks,
  signal: AbortSignal,
): Promise<ChatStreamResult> {
  const { requestId, model, messages } = req;
  const startedAt = Date.now();
  const permissionMode: PermissionMode = req.mode ?? "copilot";
  const consent =
    permissionMode === "autopilot"
      ? async () => true
      : (req2: Parameters<typeof requestApproval>[0]) => {
          if (
            req2.tool === "bash" &&
            typeof req2.command === "string" &&
            isReadOnlyBash(req2.command)
          ) {
            return Promise.resolve(true);
          }
          return requestApproval(req2, signal);
        };
  const gateRead = permissionMode === "ask";
  const isOmlx = req.provider === "omlx";
  const connector = isOmlx
    ? resolveConnector({ provider: "omlx", model: model.name })
    : resolveOllamaConnector(model.source === "local" ? "local" : "cloud");
  const supportsThinking = isOmlx || model.capabilities.includes("thinking");
  const initialThink = !supportsThinking
    ? false
    : req.think === "off"
      ? false
      : (req.think ?? true);

  const enabledMap = getEnabledTools();
  const toolEnabled = (name: string) => enabledMap[name] !== false;
  const streamChatId = getChatIdForMessage(requestId);
  /**
   * One authority for the turn — compact trigger, MCP tier and budget watch
   * must not disagree. The stored row leads: the client's listing was captured
   * when the model was picked, while the window moves provider-side.
   */
  const contextLength =
    (streamChatId !== null
      ? getChatById(streamChatId)?.model_context_length
      : undefined) ??
    model.contextLength ??
    DEFAULT_CONTEXT;
  const mcpLoader = (names: string[]) =>
    getMcpToolDefinitionsByName(
      names,
      toolEnabled,
      TOOL_DEFINITIONS.map((d) => d.function.name),
    );
  const { defs: preloadedMcp, dropped } = budgetLoadedMcpDefs(
    streamChatId,
    mcpLoader,
  );
  const tier = mcpIndexTier(contextLength);
  const loadedNames = getLoadedMcpToolNames(streamChatId);
  const toolRoster = getToolRoster(
    tier,
    toolEnabled,
    loadedNames,
    TOOL_DEFINITIONS,
  );
  const skills = getSkillAdvertisement(tier);
  const enabledDefs = [
    ...TOOL_DEFINITIONS.filter(
      (d) =>
        ALWAYS_LOADED_TOOLS.has(d.function.name) &&
        toolEnabled(d.function.name),
    ),
    ...(toolRoster.loadTool ? [toolRoster.loadTool] : []),
    ...(skills.loadTool ? [skills.loadTool] : []),
    ...preloadedMcp,
  ];

  const trace: ToolActivity[] = [];
  const persist: { callIndex: number; content: string }[] = [];
  const evictionNotice =
    dropped.length > 0
      ? `These MCP tools were unloaded this turn to keep the prompt small: ${dropped.join(", ")}. They remain listed in the tool signatures index — call mcp_load_tools with their names to load them again.`
      : "";
  const daemonMessages = await buildDaemonMessages(
    req,
    toolRoster.index,
    skills.index,
    contextLength,
  );
  const chatMessages: ConnectorChatMessage[] =
    daemonMessages ??
    withSystemBlocks(messages, toolRoster.index, skills.index, evictionNotice);

  const emitChunk = (thinkingDelta: string, contentDelta: string) => {
    callbacks.onChunk({ thinkingDelta, contentDelta });
  };

  let lastTickKey = "";
  const tick = () => {
    if (streamChatId === null) return;
    const lastStatus = trace.length > 0 ? trace[trace.length - 1].status : "";
    const key = `${streamer.content.length}|${streamer.thinking.length}|${streamer.usage.promptTokens}|${streamer.usage.evalTokens}|${trace.length}|${lastStatus}`;
    if (key === lastTickKey) return;
    lastTickKey = key;
    updateMessage(requestId, {
      content: streamer.content,
      thinking: streamer.thinking,
      // First round, not the peak: the peak carries tool traffic later turns
      // never replay. It stays in memory for the loop guard.
      promptTokens: streamer.usage.basePromptTokens || undefined,
      evalTokens: streamer.usage.evalTokens || undefined,
      tokensMeasured: streamer.usage.basePromptTokens > 0 || undefined,
      ...(trace.length > 0 ? { toolCalls: JSON.stringify(trace) } : {}),
    });
    events.emitEvent("messages:progress", {
      chatId: streamChatId,
      messageId: requestId,
    });
  };
  const tickTimer = streamChatId !== null ? setInterval(tick, 1000) : null;
  const stopTick = () => {
    if (tickTimer !== null) clearInterval(tickTimer);
  };
  if (signal.aborted) stopTick();
  else signal.addEventListener("abort", stopTick, { once: true });

  const streamer = createTurnStreamer({
    connector,
    modelName: model.name,
    chatMessages,
    tools: enabledDefs,
    initialThink,
    signal,
    onDelta: emitChunk,
  });

  const cloudApiKey = getSetting("api_key") ?? "";
  const toolOllama = new Ollama({
    host: OLLAMA_CLOUD_HOST,
    headers: cloudApiKey ? { Authorization: `Bearer ${cloudApiKey}` } : {},
  });
  const toolContext: ToolContext = {
    ollama: toolOllama,
    homedir: os.homedir(),
    chatId: streamChatId,
    chatTopics: streamChatId ? getChatTopics(streamChatId) : [],
    signal,
    requestApproval: consent,
    requestUserInput: (req) => requestUserInput(req, signal),
  };

  const executor = createToolExecutor({
    toolContext,
    enabledDefs,
    toolEnabled,
    builtinDefs: TOOL_DEFINITIONS,
    chatId: streamChatId,
    gateRead,
    contentLength: () => streamer.content.length,
    turnStartedAt: startedAt,
  });
  let roundAnchor = 0;

  let aborted = false;
  const onSignalAbort = () => {
    aborted = true;
    toolOllama.abort();
  };
  if (signal.aborted) aborted = true;
  else signal.addEventListener("abort", onSignalAbort, { once: true });

  let rounds = 0;
  let toolResultBytes = 0;
  let stop: BudgetStop | null = null;
  let lastRoundPrefillSent = false;
  let callIndex = 0;
  try {
    for (;;) {
      stop = budgetStop(
        rounds,
        toolResultBytes,
        streamer.usage.promptTokens,
        contextLength,
      );
      if (stop) break;
      if (rounds === LAST_ROUND_INDEX && !lastRoundPrefillSent) {
        lastRoundPrefillSent = true;
        chatMessages.push({ role: "assistant", content: LAST_ROUND_PREFILL });
      }

      const toolCalls = await streamer.round();
      // The capture was in the request that just went out; later rounds only
      // need the text result.
      for (const m of chatMessages) {
        if (m.role === "tool" && m.images?.length) delete m.images;
      }
      if (aborted || toolCalls.length === 0) break;
      chatMessages.push({
        role: "assistant",
        content: streamer.lastRoundContent,
        toolCalls,
      });

      for (const call of toolCalls) {
        if (aborted) break;
        const index = callIndex++;
        executor.setRoundAnchor(roundAnchor++);
        callbacks.onToolActivity(executor.runningMeta(call), index);
        const outcome = await executor.run(call, signal);
        trace.push(outcome.entry);
        callbacks.onToolActivity(outcome.entry, index);
        if (outcome.isTodoTool) events.emitEvent("todos:changed");
        toolResultBytes += outcome.content.length;
        persist.push({ callIndex: index, content: outcome.content });
        chatMessages.push({
          role: "tool",
          toolName: outcome.toolName,
          toolCallId: call.id ?? "",
          content: outcome.content,
          ...(outcome.images?.length ? { images: outcome.images } : {}),
        });
      }
      if (aborted) break;
      rounds++;
      streamer.separator();
    }
    if (!aborted && (stop || !streamer.content.trim())) {
      try {
        await finalizeTurn(
          {
            streamer,
            chatMessages,
            aborted: () => aborted,
          },
          { budgetExhausted: Boolean(stop), budgetReason: stop },
        );
      } catch (err) {
        if (!aborted && !isAbortError(err)) throw err;
      }
      if (!aborted && !streamer.content.trim()) {
        const used = [...new Set(trace.map((t) => t.tool))].join(", ");
        emitChunk(
          "",
          `_The model stopped without writing an answer${used ? ` after using ${used}` : ""}. Ask again, or narrow the question._`,
        );
      }
    }
  } finally {
    signal.removeEventListener("abort", onSignalAbort);
    stopTick();
  }
  const usage = streamer.usage;
  // The provider's first-round count is the only trustworthy number; the
  // chars/4 fallback is an estimate and is flagged so nothing downstream
  // (compact trigger, client meter) ever anchors on it as a measurement.
  const turnUsage = recordTurnUsage({
    promptTokens: usage.basePromptTokens,
    evalTokens: usage.evalTokens,
    estimate: estimateTokensFromChars(
      messages.map((m) => m.content ?? "").join("").length,
    ),
  });
  if (!turnUsage.tokensMeasured) {
    logTokenAccounting("estimate-fallback", {
      chatId: streamChatId ?? undefined,
    });
  }
  const turnEndedAt = Date.now();
  for (const entry of trace) entry.turnEndedAt = turnEndedAt;
  if (streamChatId !== null && persist.length > 0) {
    insertToolResults(requestId, persist);
  }
  maybeNotify(startedAt, streamer.content, (title, body) =>
    events.emitEvent("notify", { title, body }),
  );
  // owner's finalise write covers its own client, the server persistResult
  // covers a vanished owner.
  tick();
  return {
    content: streamer.content,
    thinking: streamer.thinking,
    promptTokens: turnUsage.promptTokens,
    evalTokens: turnUsage.evalTokens,
    tokensMeasured: turnUsage.tokensMeasured,
    toolCalls: trace,
  };
}
