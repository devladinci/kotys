import type { ToolDefinition, ToolActivity } from "@kotys/contracts";
import type { ToolContext } from "../../tools/types.js";
import { runTool } from "../../tools/index.js";
import {
  getMcpServerForTool,
  loadMcpTools,
  callMcpTool,
  isMcpTool,
  summarizeMcpArgs,
  MCP_LOAD_TOOLS_NAME,
} from "../mcp.js";
import { requestApproval } from "../approval.js";
import { rememberLoadedMcpTools } from "./mcpIndex.js";
import { loadSkill, LOAD_SKILL_NAME } from "../skills/registry.js";
import { DEDUPED_TOOLS, TODO_TOOLS, stableArgsKey } from "./toolDedup.js";
import type { RoundToolCall } from "./turnStream.js";

const SELF_APPROVING_TOOLS = new Set([
  "bash",
  "write_file",
  "apply_patch",
  "capture_screen",
  "control_screen",
  "create_memory",
  "update_memory",
  "delete_memory",
  "create_todo",
  "update_todo",
  "complete_todo",
  "delete_todo",
  "start_pomodoro",
]);

export type ToolExecutorArgs = {
  toolContext: ToolContext;
  enabledDefs: ToolDefinition[];
  toolEnabled: (name: string) => boolean;
  builtinDefs: ToolDefinition[];
  chatId: number | null;
  gateRead: boolean;
  contentLength: () => number;
  turnStartedAt: number;
};

export type ToolExecutor = {
  runningMeta(call: RoundToolCall): ToolActivity;
  setRoundAnchor(n: number): void;
  run(
    call: RoundToolCall,
    signal: AbortSignal,
  ): Promise<{
    content: string;
    images?: string[];
    entry: ToolActivity;
    toolName: string;
    isTodoTool: boolean;
  }>;
};

export function createToolExecutor(args: ToolExecutorArgs): ToolExecutor {
  const seenCalls = new Set<string>();
  let roundAnchor = 0;

  const meta = (
    name: string,
    server?: string,
    args2?: Record<string, unknown>,
  ) => {
    const a = args2 ?? {};
    return {
      tool: name,
      ...(server ? { server } : {}),
      query:
        typeof a.query === "string"
          ? a.query
          : typeof a.pattern === "string"
            ? a.pattern
            : typeof a.command === "string"
              ? a.command
              : server
                ? summarizeMcpArgs(a)
                : undefined,
      url: typeof a.url === "string" ? a.url : undefined,
      filePath: typeof a.path === "string" ? a.path : undefined,
      textOffset: args.contentLength(),
      roundAnchor,
      turnStartedAt: args.turnStartedAt,
    };
  };

  return {
    runningMeta(call) {
      const name = call.function?.name ?? "";
      const server = getMcpServerForTool(name);
      return {
        ...meta(name, server, call.function?.arguments),
        status: "running",
        startedAt: Date.now(),
      } as ToolActivity;
    },
    async run(call, signal) {
      const name = call.function?.name ?? "";
      const callArgs = call.function?.arguments ?? {};
      const server = getMcpServerForTool(name);
      const baseMeta = meta(name, server, callArgs);
      const startedAt = Date.now();
      let resultContent: string;
      let resultImages: string[] | undefined;
      let entry: ToolActivity;
      const finish = (
        partial: Omit<ToolActivity, "status" | "endedAt" | "durationMs"> & {
          status: ToolActivity["status"];
        },
      ): ToolActivity => {
        const endedAt = Date.now();
        return {
          ...partial,
          startedAt,
          endedAt,
          durationMs: endedAt - startedAt,
        };
      };

      const dedupeKey = DEDUPED_TOOLS.has(name)
        ? `${name}:${stableArgsKey(callArgs)}`
        : "";
      const duplicate = dedupeKey !== "" && seenCalls.has(dedupeKey);
      if (dedupeKey) seenCalls.add(dedupeKey);
      let declined = false;
      if (args.gateRead && !duplicate && !SELF_APPROVING_TOOLS.has(name)) {
        const approved = await requestApproval(
          {
            tool: name,
            command:
              typeof callArgs.command === "string"
                ? callArgs.command
                : undefined,
            preview:
              typeof callArgs.query === "string"
                ? callArgs.query
                : typeof callArgs.path === "string"
                  ? callArgs.path
                  : typeof callArgs.url === "string"
                    ? callArgs.url
                    : server
                      ? summarizeMcpArgs(callArgs)
                      : undefined,
          },
          signal,
        );
        if (!approved) declined = true;
      }
      try {
        if (declined) {
          resultContent = `User declined the ${name} call. Continue without it.`;
          entry = finish({ ...baseMeta, status: "error", error: "declined" });
        } else if (duplicate) {
          resultContent = `Duplicate call: ${name} was already called with these exact arguments earlier in this reply. Reuse that result instead of calling it again.`;
          entry = finish({ ...baseMeta, status: "done" });
        } else if (name === LOAD_SKILL_NAME) {
          // Skills have no schema to push: the body lands in this tool message
          // and persists in the transcript from then on.
          const loaded = loadSkill(callArgs);
          resultContent = loaded.content;
          entry = finish({
            ...baseMeta,
            status: "done",
            query: loaded.summary,
          });
        } else if (name === MCP_LOAD_TOOLS_NAME) {
          // Live-array push: the next round advertises these natively.
          const loaded = loadMcpTools(
            callArgs,
            args.toolEnabled,
            args.builtinDefs,
          );
          const known = new Set(args.enabledDefs.map((d) => d.function.name));
          for (const def of loaded.defs) {
            if (!known.has(def.function.name)) args.enabledDefs.push(def);
          }
          rememberLoadedMcpTools(
            args.chatId,
            loaded.defs.map((d) => d.function.name),
          );
          resultContent = loaded.content;
          entry = finish({
            ...baseMeta,
            status: "done",
            query: loaded.summary,
          });
        } else {
          const result = await runTool(name, callArgs, args.toolContext);
          // "Unknown tool" result (not a throw) → hand to the MCP client.
          const toMcp =
            result.content.startsWith("Unknown tool:") && isMcpTool(name);
          if (!toMcp) {
            resultContent = result.content;
            resultImages = result.resultImages;
            entry = finish({
              ...baseMeta,
              status: "done",
              ...result.activity,
            });
          } else if (!args.toolEnabled(name)) {
            resultContent = `${name} is disabled in settings.`;
            entry = finish({
              ...baseMeta,
              status: "error",
              error: "disabled",
            });
          } else {
            const mcpResult = await callMcpTool(name, callArgs, signal);
            resultContent = mcpResult.content;
            entry = finish({
              ...baseMeta,
              status: "done",
              ...mcpResult.activity,
            });
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        resultContent = `Error: ${msg}`;
        entry = finish({ ...baseMeta, status: "error", error: msg });
      }
      return {
        content: resultContent,
        images: resultImages,
        entry,
        toolName: name,
        isTodoTool: TODO_TOOLS.has(name) && !duplicate,
      };
    },
    setRoundAnchor(n) {
      roundAnchor = n;
    },
  };
}
