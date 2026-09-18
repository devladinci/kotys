import os from "node:os";
import { Ollama } from "ollama";
import type {
  ToolActivity,
  StreamRequest,
  ChatStreamResult,
  PermissionMode,
  SteerAppend,
} from "@kotys/contracts";
import {
  DEFAULT_CONTEXT,
  estimateTokens,
  estimateTokensFromChars,
  isSteerActivity,
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
import { resolveConnector, resolveOllamaConnector } from "../llm/registry.js";
import type { ConnectorChatMessage } from "../llm/registry.js";
import {
  budgetLoadedMcpDefs,
  getLoadedMcpToolNames,
  mcpIndexTier,
  withSystemBlocks,
} from "./mcpIndex.js";
import { buildDaemonMessages } from "./context.js";
import { logTokenAccounting, recordTurnUsage } from "./context-budget.js";
import { getSkillAdvertisement } from "../skills/registry.js";
import { spawnAgentDefinition, SPAWN_AGENT_NAME } from "./subagentSpawn.js";
import { getEnabledTools } from "./toolEnabled.js";
import { maybeNotify } from "./notify.js";
import { syncModelWindow } from "./modelWindow.js";
import { createTurnStreamer, isAbortError } from "./turnStream.js";
import { createToolExecutor } from "./toolCallExecutor.js";
import {
  budgetStop,
  finalizeTurn,
  LAST_ROUND_PREFILL,
  MAX_TOOL_ROUNDS,
} from "./turnWrapUp.js";
import type { BudgetStop } from "./turnWrapUp.js";

export interface StreamCallbacks {
  onChunk: (chunk: { thinkingDelta: string; contentDelta: string }) => void;
  onToolActivity: (activity: ToolActivity, index: number) => void;
  onUsage?: (peakPromptTokens: number) => void;
  /** Drains (returns and clears) the steering messages queued so far. */
  pendingAppends?: () => SteerAppend[];
}

const LAST_ROUND_INDEX = MAX_TOOL_ROUNDS - 1;

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
            permissionMode === "copilot" &&
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
  await syncModelWindow(connector, model.name, streamChatId);
  // The stored row wins: the client's listing dates from when the model was
  // picked, and the window can change provider-side after that.
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
    ...(toolEnabled(SPAWN_AGENT_NAME) ? [spawnAgentDefinition()] : []),
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
      // First round, not the peak: the peak re-sends this turn's own tool
      // traffic, which the next turn replays only within budget and prices
      // separately (toolResultTokens).
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
    onUsage: callbacks.onUsage,
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
    requestUserInput: (req) =>
      requestUserInput({ chatId: streamChatId, ...req }, signal),
    toolEnabled,
    gateRead,
    parentModel: {
      name: model.name,
      ...(req.provider ? { provider: req.provider } : {}),
      ...(model.source ? { source: model.source } : {}),
      contextLength,
    },
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

  // The steer trace entry doubles as the delivery receipt clients wait for.
  const takeSteers = () => callbacks.pendingAppends?.() ?? [];
  const injectSteers = (appends: SteerAppend[]) => {
    for (const { content, id } of appends) {
      chatMessages.push({ role: "user", content });
      const now = Date.now();
      const entry: ToolActivity = {
        tool: "steer",
        status: "done",
        startedAt: now,
        endedAt: now,
        turnStartedAt: startedAt,
        textOffset: streamer.content.length,
        roundAnchor: roundAnchor++,
        widget: { kind: "steer", text: content, ...(id ? { id } : {}) },
      };
      trace.push(entry);
      callbacks.onToolActivity(entry, callIndex++);
    }
  };

  try {
    for (;;) {
      stop = budgetStop(
        rounds,
        toolResultBytes,
        streamer.usage.promptTokens,
        contextLength,
      );
      if (stop) break;
      injectSteers(takeSteers());
      if (rounds === LAST_ROUND_INDEX && !lastRoundPrefillSent) {
        lastRoundPrefillSent = true;
        chatMessages.push({ role: "assistant", content: LAST_ROUND_PREFILL });
      }

      const toolCalls = await streamer.round();
      // Images were sent with this request; later rounds need only the text.
      for (const m of chatMessages) {
        if (m.role === "tool" && m.images?.length) delete m.images;
      }
      if (aborted) break;
      if (toolCalls.length === 0) {
        // Late steers get a round of their own, or the finished stream drops them.
        const late = takeSteers();
        if (late.length === 0) break;
        if (streamer.lastRoundContent) {
          chatMessages.push({
            role: "assistant",
            content: streamer.lastRoundContent,
          });
        }
        rounds++;
        streamer.separator();
        injectSteers(late);
        continue;
      }
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
      // A budget stop skips the top-of-round drain.
      injectSteers(takeSteers());
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
        const used = [
          ...new Set(
            trace.filter((t) => !isSteerActivity(t)).map((t) => t.tool),
          ),
        ].join(", ");
        emitChunk(
          "",
          `_The model stopped without writing an answer${used ? ` after using ${used}` : ""}. Ask again, or narrow the question._`,
        );
      }
    }
  } catch (err) {
    // A stop rejects the in-flight request (fetch throws AbortError): that is
    // the turn ending as asked, not a failure.
    if (!aborted) throw err;
  } finally {
    signal.removeEventListener("abort", onSignalAbort);
    stopTick();
  }
  const usage = streamer.usage;
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

  tick();
  return {
    content: streamer.content,
    thinking: streamer.thinking,
    promptTokens: turnUsage.promptTokens,
    evalTokens: turnUsage.evalTokens,
    tokensMeasured: turnUsage.tokensMeasured,
    toolCalls: trace,
    toolResultTokens: persist.reduce(
      (n, p) => n + estimateTokens(p.content),
      0,
    ),
  };
}
