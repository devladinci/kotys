import type { ToolTone } from "../../toolDisplay";

export const TONE_CLASSES: Record<ToolTone, string> = {
  web: "bg-tl-web",
  read: "bg-tl-read",
  write: "bg-tl-write",
  shell: "bg-tl-shell",
  memory: "bg-tl-memory",
  task: "bg-tl-task",
  chat: "bg-tl-chat",
  mcp: "bg-tl-mcp",
};

export const TONE_TEXT: Record<ToolTone, string> = {
  web: "text-tl-web-ink",
  read: "text-tl-read-ink",
  write: "text-tl-write-ink",
  shell: "text-tl-shell-ink",
  memory: "text-tl-memory-ink",
  task: "text-tl-task-ink",
  chat: "text-tl-chat-ink",
  mcp: "text-tl-mcp-ink",
};

export const ERROR_CLASS = "bg-tl-error";
export const ERROR_TEXT = "text-tl-error-ink";
export const LLM_CLASS = "bg-surface-llm";
