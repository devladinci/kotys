import path from "node:path";
import { promises as fs } from "node:fs";
import { watch, type FSWatcher } from "node:fs";
import type { ToolDefinition } from "@kotys/contracts";
import { events } from "../events.js";
import { agentsRoot } from "./paths.js";
import { AGENT_FILE, parseAgentFile } from "./parse.js";

const WATCH_DEBOUNCE_MS = 300;

export type AgentEntry = {
  name: string;
  dir: string;
  description: string;
  tools: string[] | null;
  body: string;
};

type BrokenAgent = {
  name: string;
  dir: string;
  error: string;
};

type Cache = {
  entries: AgentEntry[];
  broken: BrokenAgent[];
  scannedAt: number;
};

let cache: Cache = { entries: [], broken: [], scannedAt: 0 };
let watcher: FSWatcher | null = null;
let watchTimer: NodeJS.Timeout | null = null;

export async function scanAgents(): Promise<Cache> {
  const root = agentsRoot();
  const entries: AgentEntry[] = [];
  const broken: BrokenAgent[] = [];
  let names: string[];
  try {
    names = (await fs.readdir(root, { withFileTypes: true }))
      .filter((d) => d.isDirectory() && !d.name.startsWith("."))
      .map((d) => d.name);
  } catch {
    cache = { entries, broken, scannedAt: Date.now() };
    return cache;
  }
  for (const name of names) {
    const dir = path.join(root, name);
    const file = path.join(dir, AGENT_FILE);
    let raw: string;
    try {
      raw = await fs.readFile(file, "utf8");
    } catch {
      broken.push({ name, dir, error: `no ${AGENT_FILE} in the directory` });
      continue;
    }
    const parsed = parseAgentFile(raw);
    if (!parsed.ok) {
      broken.push({ name, dir, error: parsed.error });
      continue;
    }
    entries.push({
      name,
      dir,
      description: parsed.agent.frontmatter.description,
      tools: parsed.agent.frontmatter.tools ?? null,
      body: parsed.agent.body,
    });
  }
  cache = { entries, broken, scannedAt: Date.now() };
  return cache;
}

function startAgentsWatcher(): void {
  if (watcher) return;
  try {
    const w = watch(agentsRoot(), { persistent: false }, () =>
      scheduleRescan(),
    );
    w.on("error", () => {});
    watcher = w;
  } catch {
    // ENOENT — directory does not exist yet; the cache stays empty.
  }
}

function scheduleRescan(): void {
  if (watchTimer) clearTimeout(watchTimer);
  watchTimer = setTimeout(() => {
    watchTimer = null;
    void scanAgents().then(() => {
      events.emitEvent("agents:changed");
    });
  }, WATCH_DEBOUNCE_MS);
}

export async function initAgents(): Promise<void> {
  await scanAgents();
  startAgentsWatcher();
}

export function getAgent(name: string): AgentEntry | null {
  return cache.entries.find((e) => e.name === name) ?? null;
}

export function listAgentNames(): string[] {
  return cache.entries.map((e) => e.name);
}

/** Advertised in the spawn_agent description so the parent can pick one. */
export function renderAgentIndex(): string {
  if (cache.entries.length === 0) return "";
  return cache.entries.map((e) => `- ${e.name}: ${e.description}`).join("\n");
}

/**
 * Builtin defaults so spawn_agent works before the user writes any agent
 * files. explore = read-only research; general = broad toolset, no spawn.
 */
export const BUILTIN_AGENTS: AgentEntry[] = [
  {
    name: "explore",
    dir: "",
    description:
      "Read-only research agent: reads files, greps, and searches the web. Use for codebase exploration and questions that need many lookups but no writes.",
    tools: ["list", "read_file", "grep", "web_search", "web_fetch"],
    body: "You are a read-only research agent. Investigate thoroughly with the tools available and report findings as text. You cannot write files or run commands — report what you found instead, with file paths and line numbers.",
  },
  {
    name: "general",
    dir: "",
    description:
      "General-purpose agent with most tools except subagent spawning. Use for self-contained multi-step tasks delegated from the main conversation.",
    tools: null,
    body: "You are a task agent working on a delegated request. Complete the task end to end with the tools available, then report the outcome as text: what you did, what you verified, and anything left incomplete.",
  },
];

const DEFAULT_READ_ONLY_TOOLS = [
  "list",
  "read_file",
  "grep",
  "web_search",
  "web_fetch",
];

/** Builtins lose to a user file with the same name. */
export function resolveAgent(name: string): AgentEntry | null {
  return getAgent(name) ?? BUILTIN_AGENTS.find((a) => a.name === name) ?? null;
}

/**
 * Tool definitions for a subagent turn: names filtered against the builtin
 * registry, capped, spawn always excluded (nesting guard's second layer).
 */
export function toolsForAgent(
  agent: AgentEntry,
  builtinDefs: ToolDefinition[],
): ToolDefinition[] {
  const byName = new Map(builtinDefs.map((d) => [d.function.name, d]));
  const names = agent.tools ?? DEFAULT_READ_ONLY_TOOLS;
  const picked: ToolDefinition[] = [];
  for (const name of names) {
    if (name === "spawn_agent") continue;
    const def = byName.get(name);
    if (def) picked.push(def);
  }
  return picked;
}
