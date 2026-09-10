import type { Ollama } from "ollama";
import type {
  ToolArgs,
  ToolDefinition,
  ToolResult,
  InputField,
} from "@kotys/contracts";

/**
 * Context handed to every tool executor.
 *
 * Note what is NOT here any more: the `db` object of 20+ closures. Tools import
 * from `@kotys/db` directly. This is backend-only — it references the live
 * Ollama client — which is why it stays in apps/api rather than contracts.
 */
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
};

export type ToolModule = {
  definition: ToolDefinition;
  execute: (args: ToolArgs, ctx: ToolContext) => Promise<ToolResult>;
};
