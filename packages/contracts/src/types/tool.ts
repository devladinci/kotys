export type TodoWidget = {
  kind: "todo";
  action: "created" | "updated" | "completed" | "reopened" | "deleted";
  id: number;
  title: string;
  description?: string;
  status?: "pending" | "in_progress" | "completed" | "archived";
  priority?: "low" | "medium" | "high";
  due_at?: number | string | null;
  notify_at?: number | string | null;
};

export type InputWidget = {
  kind: "input";
  title: string;
  description?: string;
  fields: InputField[];
  answers: Record<string, string> | null;
};

export type ToolActivity = {
  tool: string;
  server?: string;
  query?: string;
  url?: string;
  filePath?: string;
  /** True when the tool verified its target and produced nothing new. */
  unchanged?: boolean;
  status: "running" | "done" | "error";
  durationMs?: number;
  startedAt?: number;
  endedAt?: number;
  turnStartedAt?: number;
  turnEndedAt?: number;
  textOffset?: number;
  roundAnchor?: number;
  results?: { title: string; url: string }[];
  /** Base64 preview images (e.g. screenshot thumbnails) shown in the timeline. */
  images?: string[];
  widget?: TodoWidget | InputWidget;
  error?: string;
};

export type ToolCategory =
  | "read"
  | "write"
  | "search"
  | "web"
  | "chat"
  | "memory"
  | "system"
  | "media"
  | "task";

export type ToolDefinition = {
  type: "function";
  category?: ToolCategory;
  function: {
    name: string;
    description: string;
    parameters: object;
  };
};

export type ToolArgs = Record<string, unknown>;

export type ToolResult = {
  content: string;
  resultImages?: string[];
  activity: Omit<ToolActivity, "tool" | "status"> & {
    status?: ToolActivity["status"];
  };
};

export type ToolListing = {
  name: string;
  description: string;
  category: ToolCategory | null;
};

export type ToolEvent = ToolActivity & {
  requestId: number;
  index: number;
};

export type ApprovalRequest = {
  id: number;
  tool: string;
  command?: string;
  cwd?: string;
  destructive?: boolean;
  preview?: string;
  host?: string;
};

export type InputOption = { value: string; label: string };

export type InputFieldBase = {
  id: string;
  label?: string;
  required?: boolean;
};

export type ChoiceField = InputFieldBase & {
  kind: "choice";
  options: InputOption[];
};

export type TextField = InputFieldBase & {
  kind: "text";
  placeholder?: string;
  multiline?: boolean;
};

export type InputField = ChoiceField | TextField;

export type InputRequest = {
  id: number;
  title: string;
  description?: string;
  fields: InputField[];
  submitLabel?: string;
  cancelLabel?: string;
  host?: string;
};
