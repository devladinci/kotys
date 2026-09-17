import type { Ollama } from "ollama";
import type {
  ToolArgs,
  ToolDefinition,
  ToolResult,
  InputField,
} from "@kotys/contracts";

// Backend-only (it holds the live Ollama client), so it stays in apps/api
// rather than contracts.
export type ToolContext = {
  ollama: Ollama;
  homedir: string;
  chatId: number | null;
  chatTopics: string[];
  /** Aborted when the user stops the turn; long-running tools must honor it. */
  signal: AbortSignal;
  /** Resolves true when the user consents. Absent means auto-deny. */
  requestApproval?: (request: {
    tool: string;
    command?: string;
    cwd?: string;
    destructive?: boolean;
    preview?: string;
  }) => Promise<boolean>;
  /** Resolves with the user's answers, or null when dismissed/aborted/timed out. */
  requestUserInput?: (request: {
    title: string;
    description?: string;
    fields: InputField[];
    submitLabel?: string;
    cancelLabel?: string;
  }) => Promise<Record<string, string> | null>;
  /** Settings toggles; a subagent inherits them. */
  toolEnabled?: (name: string) => boolean;
  /** Ask mode: every read waits for approval, in subagents too. */
  gateRead?: boolean;
  /** True inside a subagent turn — spawn_agent denies nesting on it. */
  isSubagent?: boolean;
  /** The parent turn's model; spawn_agent runs the child on it. */
  parentModel?: {
    name: string;
    provider?: string;
    source?: "cloud" | "local";
    contextLength?: number | null;
  };
};

export type ToolModule = {
  definition: ToolDefinition;
  execute: (args: ToolArgs, ctx: ToolContext) => Promise<ToolResult>;
};
