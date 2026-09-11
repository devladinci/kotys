import {
  Blocks,
  Brain,
  BrainCircuit,
  Bug,
  Camera,
  CheckSquare,
  CircleHelp,
  Clock,
  Database,
  FilePen,
  FilePlus2,
  FileSearch,
  FileText,
  FolderOpen,
  GitPullRequest,
  Globe,
  History,
  List,
  ListTodo,
  MessageSquare,
  MessageSquareText,
  MessagesSquare,
  Monitor,
  NotebookText,
  Plus,
  Search,
  Send,
  SquareKanban,
  Terminal,
  Timer,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import type { ToolActivity } from "@kotys/contracts";

export type ToolPresentation = {
  Icon: LucideIcon;
  label: string;
  server?: string;
};

/**
 * Coarse tool families, each with its own color in the timeline strip. The
 * strip is read at a glance, so tones stay few and well separated.
 */
export type ToolTone =
  "web" | "read" | "write" | "shell" | "memory" | "task" | "chat" | "mcp";

const TONES: Record<ToolTone, string[]> = {
  web: ["web_search", "web_fetch", "mcp_load_tools"],
  read: ["read_file", "list", "grep"],
  write: ["write_file", "apply_patch"],
  shell: ["bash", "capture_screen"],
  memory: [
    "search_memories",
    "create_memory",
    "update_memory",
    "delete_memory",
  ],
  task: [
    "create_todo",
    "update_todo",
    "complete_todo",
    "list_todos",
    "delete_todo",
    "start_pomodoro",
  ],
  chat: [
    "list_chats",
    "search_chats",
    "get_chat",
    "current_datetime",
    "request_user_input",
  ],
  mcp: [],
};

export function toolTone(tc: ToolActivity): ToolTone {
  for (const [tone, names] of Object.entries(TONES)) {
    if (names.includes(tc.tool)) return tone as ToolTone;
  }
  return "mcp";
}

/** Canonical implementation lives in core; re-exported for ui-web consumers. */
export { formatDuration } from "@kotys/core";

const MAX_LABEL_VALUE = 60;

const clamp = (value: string, max = MAX_LABEL_VALUE) =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value;

const shortenUrl = (url: string) =>
  clamp(url.replace(/^https?:\/\//, "").replace(/\/$/, ""));

// Paths are truncated from the left: the file name carries more meaning than
// the prefix it lives under.
export const shortenPath = (path: string, max = MAX_LABEL_VALUE) => {
  if (path.length <= max) return path;
  const parts = path.split("/");
  let tail = parts.pop() ?? path;
  if (tail.length >= max) return `…${tail.slice(-(max - 1))}`;
  for (let head = parts.pop(); head !== undefined; head = parts.pop()) {
    const next = `${head}/${tail}`;
    if (next.length + 2 > max) break;
    tail = next;
  }
  return `…/${tail}`;
};

const quoted = (value: string) => `"${clamp(value)}"`;

type Formatter = (tc: ToolActivity, running: boolean) => ToolPresentation;

/**
 * Tool name → icon, the single source of truth for every place a tool is
 * shown: the timeline, tool rows, and the settings list. Formatters may
 * override at render time (capture_screen swaps to Monitor when the frame
 * is unchanged) but must start from here so new surfaces stay in sync.
 */
export const TOOL_ICONS: Record<string, LucideIcon> = {
  current_datetime: Clock,
  web_search: Search,
  web_fetch: Globe,
  read_file: FileText,
  list: FolderOpen,
  grep: FileSearch,
  write_file: FilePlus2,
  apply_patch: FilePen,
  bash: Terminal,
  capture_screen: Camera,
  list_chats: MessagesSquare,
  search_chats: History,
  get_chat: MessageSquareText,
  request_user_input: CircleHelp,
  mcp_load_tools: Blocks,
  search_memories: Brain,
  create_memory: BrainCircuit,
  update_memory: BrainCircuit,
  delete_memory: Trash2,
  create_todo: Plus,
  update_todo: ListTodo,
  complete_todo: CheckSquare,
  list_todos: ListTodo,
  delete_todo: Trash2,
  start_pomodoro: Timer,
};

const BUILTIN: Record<string, Formatter> = {
  current_datetime: (_tc, running) => ({
    Icon: TOOL_ICONS.current_datetime,
    label: running ? "Checking current time" : "Checked current time",
  }),
  web_search: (tc, running) => ({
    Icon: TOOL_ICONS.web_search,
    label: `${running ? "Searching" : "Searched"} the web for ${quoted(tc.query ?? "")}`,
  }),
  web_fetch: (tc, running) => ({
    Icon: TOOL_ICONS.web_fetch,
    label: `${running ? "Fetching" : "Fetched"} ${shortenUrl(tc.url ?? "")}`,
  }),
  read_file: (tc, running) => ({
    Icon: TOOL_ICONS.read_file,
    label: `${running ? "Reading" : "Read"} ${shortenPath(tc.filePath ?? "")}`,
  }),
  list: (tc, running) => ({
    Icon: TOOL_ICONS.list,
    label: `${running ? "Listing" : "Listed"} ${shortenPath(tc.filePath ?? "")}`,
  }),
  grep: (tc, running) => ({
    Icon: TOOL_ICONS.grep,
    label: `${running ? "Searching" : "Searched"} for ${quoted(tc.query ?? "")} in ${shortenPath(tc.filePath ?? "")}`,
  }),
  write_file: (tc, running) => ({
    Icon: TOOL_ICONS.write_file,
    label: `${running ? "Writing" : "Wrote"} ${shortenPath(tc.filePath ?? "")}`,
  }),
  apply_patch: (tc, running) => ({
    Icon: TOOL_ICONS.apply_patch,
    label: `${running ? "Patching" : "Patched"} ${shortenPath(tc.filePath ?? "")}`,
  }),
  bash: (tc, running) => ({
    Icon: TOOL_ICONS.bash,
    label: `${running ? "Running" : "Ran"} ${clamp(tc.query ?? "", 70)}`,
  }),
  capture_screen: (tc, running) => {
    const unchanged = !running && tc.status === "done" && !!tc.unchanged;
    const target = tc.query || "the screen";
    return {
      Icon: unchanged ? Monitor : TOOL_ICONS.capture_screen,
      label: `${running ? "Capturing" : "Captured"} ${target}${unchanged ? " (unchanged)" : ""}`,
    };
  },
  list_chats: (tc, running) => ({
    Icon: TOOL_ICONS.list_chats,
    label: tc.query
      ? `${running ? "Listing" : "Listed"} chats matching ${quoted(tc.query)}`
      : `${running ? "Listing" : "Listed"} past chats`,
  }),
  search_chats: (tc, running) => ({
    Icon: TOOL_ICONS.search_chats,
    label: `${running ? "Searching" : "Searched"} past chats for ${quoted(tc.query ?? "")}`,
  }),
  get_chat: (tc, running) => ({
    Icon: TOOL_ICONS.get_chat,
    label: `${running ? "Reading" : "Read"} chat ${clamp(tc.filePath ?? "")}`,
  }),
  request_user_input: (tc, running) => ({
    Icon: TOOL_ICONS.request_user_input,
    label: tc.query
      ? `${running ? "Asking" : "Asked"} ${quoted(tc.query)}`
      : `${running ? "Asking" : "Asked"} you a question`,
  }),
  // The loader serves built-in and MCP tools alike (see ALWAYS_LOADED_TOOLS in
  // apps/api/src/services/mcp.ts), so the row must not say "MCP".
  mcp_load_tools: (tc, running) => ({
    Icon: TOOL_ICONS.mcp_load_tools,
    label: `${running ? "Loading" : "Loaded"} tool schemas${tc.query ? `: ${clamp(tc.query)}` : ""}`,
  }),
  search_memories: (tc, running) => ({
    Icon: TOOL_ICONS.search_memories,
    label: `${running ? "Searching" : "Searched"} memory${tc.query ? ` for ${quoted(tc.query)}` : ""}`,
  }),
  create_memory: (tc, running) => ({
    Icon: TOOL_ICONS.create_memory,
    label: `${running ? "Saving" : "Saved"} memory ${clamp(tc.query ?? "")}`,
  }),
  update_memory: (tc, running) => ({
    Icon: TOOL_ICONS.update_memory,
    label: `${running ? "Updating" : "Updated"} memory ${clamp(tc.query ?? "")}`,
  }),
  delete_memory: (tc, running) => ({
    Icon: TOOL_ICONS.delete_memory,
    label: `${running ? "Deleting" : "Deleted"} memory ${clamp(tc.query ?? "")}`,
  }),
  create_todo: (tc, running) => ({
    Icon: TOOL_ICONS.create_todo,
    label: `${running ? "Creating" : "Created"} task ${clamp(tc.query ?? "")}`,
  }),
  update_todo: (tc, running) => ({
    Icon: TOOL_ICONS.update_todo,
    label: `${running ? "Updating" : "Updated"} task ${clamp(tc.query ?? "")}`,
  }),
  complete_todo: (tc, running) => ({
    Icon: TOOL_ICONS.complete_todo,
    label: `${running ? "Toggling" : "Toggled"} task ${clamp(tc.query ?? "")}`,
  }),
  list_todos: (tc, running) => ({
    Icon: TOOL_ICONS.list_todos,
    label:
      tc.query && tc.query !== "all"
        ? `${running ? "Listing" : "Listed"} ${tc.query} tasks`
        : `${running ? "Listing" : "Listed"} tasks`,
  }),
  delete_todo: (tc, running) => ({
    Icon: TOOL_ICONS.delete_todo,
    label: `${running ? "Deleting" : "Deleted"} task ${clamp(tc.query ?? "")}`,
  }),
  start_pomodoro: (tc, running) => ({
    Icon: TOOL_ICONS.start_pomodoro,
    label: `${running ? "Starting" : "Started"} Pomodoro ${clamp(tc.query ?? "")}`,
  }),
};

// --- MCP tools: no shared naming convention, so the row is derived from the
// tool name itself. `server_` prefixes are dropped (the server is shown as its
// own tag) and a leading — or trailing — verb drives the tense.

const ACRONYMS: Record<string, string> = {
  api: "API",
  cql: "CQL",
  csv: "CSV",
  html: "HTML",
  id: "ID",
  ids: "IDs",
  jql: "JQL",
  json: "JSON",
  mcp: "MCP",
  pdf: "PDF",
  pr: "PR",
  prs: "PRs",
  sql: "SQL",
  ui: "UI",
  url: "URL",
  urls: "URLs",
};

const PROPER_NOUNS: Record<string, string> = {
  atlassian: "Atlassian",
  bitbucket: "Bitbucket",
  compass: "Compass",
  confluence: "Confluence",
  figma: "Figma",
  github: "GitHub",
  gitlab: "GitLab",
  google: "Google",
  jira: "Jira",
  linear: "Linear",
  notion: "Notion",
  sentry: "Sentry",
  slack: "Slack",
};

const VERBS: Record<string, [string, string]> = {
  add: ["Adding", "Added"],
  archive: ["Archiving", "Archived"],
  cancel: ["Cancelling", "Cancelled"],
  create: ["Creating", "Created"],
  delete: ["Deleting", "Deleted"],
  edit: ["Editing", "Edited"],
  fetch: ["Fetching", "Fetched"],
  find: ["Finding", "Found"],
  get: ["Getting", "Got"],
  list: ["Listing", "Listed"],
  lookup: ["Looking up", "Looked up"],
  open: ["Opening", "Opened"],
  post: ["Posting", "Posted"],
  read: ["Reading", "Read"],
  remove: ["Removing", "Removed"],
  run: ["Running", "Ran"],
  schedule: ["Scheduling", "Scheduled"],
  search: ["Searching", "Searched"],
  send: ["Sending", "Sent"],
  set: ["Setting", "Set"],
  transition: ["Transitioning", "Transitioned"],
  update: ["Updating", "Updated"],
  upload: ["Uploading", "Uploaded"],
  write: ["Writing", "Wrote"],
};

const VERB_ICONS: Record<string, LucideIcon> = {
  add: Plus,
  create: Plus,
  delete: Trash2,
  edit: FilePen,
  fetch: Globe,
  find: Search,
  get: FileText,
  list: List,
  lookup: Search,
  open: Globe,
  post: Send,
  read: FileText,
  remove: Trash2,
  search: Search,
  send: Send,
  update: FilePen,
  upload: Send,
  write: FilePen,
};

const SERVER_ICONS: [RegExp, LucideIcon][] = [
  [/slack|discord|teams|mattermost/, MessageSquare],
  [/git(hub|lab)|bitbucket/, GitPullRequest],
  [/jira|atlassian|confluence|linear|asana|trello/, SquareKanban],
  [/sentry|datadog/, Bug],
  [/notion|obsidian|docs?$/, NotebookText],
  [/memory|recall/, Brain],
  [/postgres|mysql|sqlite|database|^db$/, Database],
  [/file ?system|^fs$|drive/, FolderOpen],
  [/browser|chrome|playwright|puppeteer|fetch|web/, Globe],
];

const tokenize = (value: string) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[\s_\-.:]+/)
    .filter(Boolean)
    .map((token) => token.toLowerCase());

const word = (token: string) =>
  ACRONYMS[token] ??
  PROPER_NOUNS[token] ??
  (token === "me" ? "my account" : token);

function toolTokens(name: string, server?: string): string[] {
  const serverTokens = server ? tokenize(server) : [];
  let tokens = tokenize(name.replace(/^mcp__.*?__/, ""));
  while (tokens.length > 1 && serverTokens.includes(tokens[0]))
    tokens = tokens.slice(1);
  return tokens;
}

// The verb sits at either end: `search_pull_requests` vs `pull_request_read`.
function splitVerb(tokens: string[]): { verb?: string; rest: string[] } {
  if (VERBS[tokens[0]]) return { verb: tokens[0], rest: tokens.slice(1) };
  const last = tokens[tokens.length - 1];
  if (tokens.length > 1 && VERBS[last])
    return { verb: last, rest: tokens.slice(0, -1) };
  return { rest: tokens };
}

export function humanizeToolName(
  name: string,
  running: boolean,
  server?: string,
): string {
  const { verb, rest } = splitVerb(toolTokens(name, server));
  const phrase = rest.map(word).join(" ");
  if (verb) {
    const conjugated = VERBS[verb][running ? 0 : 1];
    return phrase ? `${conjugated} ${phrase}` : conjugated;
  }
  return `${running ? "Calling" : "Called"} ${phrase || name}`;
}

function mcpIcon(name: string, server?: string): LucideIcon {
  const { verb } = splitVerb(toolTokens(name, server));
  if (verb && VERB_ICONS[verb]) return VERB_ICONS[verb];
  const haystack = `${server ?? ""} ${name}`.toLowerCase();
  for (const [pattern, Icon] of SERVER_ICONS) {
    if (pattern.test(haystack)) return Icon;
  }
  return Blocks;
}

export function describeTool(tc: ToolActivity): ToolPresentation {
  const running = tc.status === "running";
  const builtin = BUILTIN[tc.tool];
  if (builtin) return builtin(tc, running);
  const humanized = humanizeToolName(tc.tool, running, tc.server);
  return {
    Icon: mcpIcon(tc.tool, tc.server),
    label: tc.query ? `${humanized}: ${clamp(tc.query, 70)}` : humanized,
    server: tc.server,
  };
}
