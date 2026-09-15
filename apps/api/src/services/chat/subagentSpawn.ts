import type { ToolArgs, ToolDefinition } from "@kotys/contracts";
import type { ToolContext } from "../../tools/types.js";
import { resolveAgent, renderAgentIndex } from "../agents/registry.js";
import {
  runSubagent,
  wrapSubagentResult,
  type SpawnModel,
} from "./subagentRunner.js";

export const SPAWN_AGENT_NAME = "spawn_agent";

const definition: ToolDefinition = {
  type: "function",
  category: "system",
  function: {
    name: SPAWN_AGENT_NAME,
    description:
      "Delegate a task to a subagent, which runs in its own isolated turn with its own context and toolset and reports back its final answer. Use for self-contained subtasks (research sweeps, bulk reading) whose intermediate steps would flood this conversation. Available agents:\n[AGENTS_INDEX]",
    parameters: {
      type: "object",
      required: ["agent", "prompt", "description"],
      properties: {
        agent: {
          type: "string",
          description: "Agent name from the list in this tool's description",
        },
        prompt: {
          type: "string",
          description:
            "Full, self-contained task for the subagent — it sees nothing else from this conversation",
        },
        description: {
          type: "string",
          description: "One short sentence shown to the user while it runs",
        },
      },
    },
  },
};

/** The description is not static: the agent index is baked in at scan time. */
export function spawnAgentDefinition(): ToolDefinition {
  return {
    ...definition,
    function: {
      ...definition.function,
      description: definition.function.description.replace(
        "[AGENTS_INDEX]",
        renderAgentIndex() || "explore, general",
      ),
    },
  };
}

export type SpawnOutcome = {
  ok: boolean;
  content: string;
  summary: string;
};

/**
 * Executor branch for spawn_agent. Runs synchronously inside the parent's
 * tool round; the parent's abort signal covers the child turn, and approval
 * dialogs pass through the shared ToolContext so they still reach the UI.
 */
export async function spawnSubagent(
  args: ToolArgs,
  parentContext: ToolContext,
): Promise<SpawnOutcome> {
  const agentName = typeof args.agent === "string" ? args.agent : "";
  const prompt = typeof args.prompt === "string" ? args.prompt.trim() : "";
  const description =
    typeof args.description === "string" && args.description.trim()
      ? args.description.trim()
      : `Running ${agentName || "subagent"}`;

  if (!agentName || !resolveAgent(agentName)) {
    return {
      ok: false,
      content: `Error: unknown subagent "${agentName}". Available: ${renderAgentIndex() || "explore, general"}.`,
      summary: `unknown agent ${agentName}`,
    };
  }
  if (!prompt) {
    return {
      ok: false,
      content: "Error: spawn_agent needs a non-empty prompt for the subagent.",
      summary: "empty prompt",
    };
  }
  if (parentContext.isSubagent === true) {
    return {
      ok: false,
      content:
        "Error: subagents cannot spawn further subagents. Report what you found instead.",
      summary: "nesting denied",
    };
  }
  const model = parentContext.parentModel;
  if (!model || !model.name) {
    return {
      ok: false,
      content: "Error: spawn_agent is unavailable without a parent model.",
      summary: "no parent model",
    };
  }

  const run = await runSubagent({
    agent: agentName,
    prompt,
    parentChatId: parentContext.chatId,
    model: model as SpawnModel,
    signal: parentContext.signal,
    toolContext: childToolContext(parentContext),
  });

  return {
    ok: true,
    content: wrapSubagentResult(run.content, run.childChatId),
    summary: description,
  };
}

/**
 * The child shares the parent's approval and input channels (so consent
 * dialogs still surface) and its ollama client; only isSubagent changes.
 */
function childToolContext(parent: ToolContext): ToolContext {
  return { ...parent, isSubagent: true };
}
