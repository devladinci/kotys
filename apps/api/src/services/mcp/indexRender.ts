import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type {
  ToolDefinition,
  ToolArgs,
  McpServerStatus,
} from "@kotys/contracts";
import { parseConfig, servers, toDefinition } from "./registry.js";

export type McpIndexTier = "full" | "brief" | "names";

export const MCP_LOAD_TOOLS_NAME = "mcp_load_tools";

const SIGNATURE_ARG_MAX = 6;
const DESCRIPTION_MAX = 110;
const SENTENCE_MIN = 24;
const SEARCH_LIMIT = 15;

const ABBREVIATION = /(?:^|\s)(?:e\.g|i\.e|etc|vs|cf|approx|resp|fig|no)\.$/i;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const LOAD_TOOLS_SHAPE: ToolDefinition = {
  type: "function",
  category: "system",
  function: {
    name: MCP_LOAD_TOOLS_NAME,
    description: "",
    parameters: {
      type: "object",
      properties: {
        names: {
          type: "array",
          items: { type: "string" },
          description:
            "Exact tool names to load, copied from the index. Load every tool you expect to need in one call.",
        },
        query: {
          type: "string",
          description:
            "Search terms, used when the index is partial or the name is unknown. Returns matching signatures without loading them.",
        },
      },
    },
  },
};
export const ALWAYS_LOADED_TOOLS = new Set([
  "current_datetime",
  "list",
  "bash",
  "read_file",
  "web_search",
  "grep",
  "web_fetch",
]);

export function getToolRoster(
  tier: McpIndexTier,
  isEnabled: (name: string) => boolean,
  alreadyLoaded: string[],
  builtins: ToolDefinition[],
): { index: string; loadTool: ToolDefinition | null } {
  const blocks: McpServerTools[] = [];
  const builtinTools: Tool[] = builtins
    .filter((d) => !ALWAYS_LOADED_TOOLS.has(d.function.name))
    .filter((d) => isEnabled(d.function.name))
    .map((d) => ({
      name: d.function.name,
      description: d.function.description,
      inputSchema: d.function.parameters as Tool["inputSchema"],
    }));
  if (builtinTools.length > 0)
    blocks.push({ name: "built-in", tools: builtinTools });
  blocks.push(...connectedServers(isEnabled));
  if (blocks.length === 0) return { index: "", loadTool: null };
  return {
    index: renderMcpToolIndex(blocks, tier, alreadyLoaded),
    loadTool: buildLoadToolsDefinition(blocks),
  };
}
export function buildLoadToolsDefinition(
  listed: McpServerTools[],
): ToolDefinition {
  const roster = listed
    .map((s) => `${s.name} (${plural(s.tools.length, "tool")})`)
    .join(", ");
  return {
    ...LOAD_TOOLS_SHAPE,
    function: {
      ...LOAD_TOOLS_SHAPE.function,
      description: `Load the full schemas for tools listed under "Tool signatures" in the system prompt (built-in and MCP alike). Available: ${roster}. Prefer MCP tools over web_fetch or web_search whenever the task targets one of those services. Pass the exact names here, or a query to search. Once loaded, call the tool directly by its own name — not through this one.`,
    },
  };
}

export function firstSentence(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const boundary = /[.!?](?=\s|$)/g;
  let sentence = flat;
  for (let m = boundary.exec(flat); m !== null; m = boundary.exec(flat)) {
    const candidate = flat.slice(0, m.index + 1);
    if (candidate.length < SENTENCE_MIN || ABBREVIATION.test(candidate))
      continue;
    sentence = candidate;
    break;
  }
  return sentence.length > DESCRIPTION_MAX
    ? `${sentence.slice(0, DESCRIPTION_MAX - 1)}…`
    : sentence;
}

function toSignature(tool: Tool): string {
  const schema = tool.inputSchema as
    { properties?: Record<string, unknown>; required?: string[] } | undefined;
  const props = Object.keys(schema?.properties ?? {});
  const required = new Set(schema?.required ?? []);
  const ordered = [
    ...props.filter((p) => required.has(p)),
    ...props.filter((p) => !required.has(p)),
  ];
  const shown = ordered
    .slice(0, SIGNATURE_ARG_MAX)
    .map((p) => (required.has(p) ? p : `${p}?`));
  if (ordered.length > SIGNATURE_ARG_MAX) shown.push("...");
  return `${tool.name}(${shown.join(", ")})`;
}

export type McpServerTools = { name: string; tools: Tool[] };

function connectedServers(
  isEnabled: (name: string) => boolean,
): McpServerTools[] {
  const out: McpServerTools[] = [];
  for (const s of servers.values()) {
    if (s.status !== "connected") continue;
    const tools = s.tools.filter((t) => isEnabled(t.name));
    if (tools.length > 0) out.push({ name: s.name, tools });
  }
  return out;
}
export function renderMcpToolIndex(
  listed: McpServerTools[],
  tier: McpIndexTier,
  alreadyLoaded: string[] = [],
): string {
  if (listed.length === 0) return "";
  const loaded = new Set(alreadyLoaded);
  const blocks = listed.map(({ name, tools }) => {
    const header = `### ${name} (${plural(tools.length, "tool")})`;
    if (tier === "names") {
      return `${header}\n${tools.map((t) => t.name).join(", ")}`;
    }
    const lines = tools.map((t) => {
      if (loaded.has(t.name)) return `- ${t.name} [loaded]`;
      const desc =
        tier === "full" && t.description
          ? ` — ${firstSentence(t.description)}`
          : "";
      return `- ${toSignature(t)}${desc}`;
    });
    return `${header}\n${lines.join("\n")}`;
  });
  const shape =
    tier === "names"
      ? "Names only — pass a `query` to see arguments."
      : "A trailing `?` marks an optional argument; `[loaded]` means the schema is already available and you can call it directly.";
  return [
    "## Tool signatures",
    "",
    `These tools exist but their schemas are not loaded. Call ${MCP_LOAD_TOOLS_NAME} with the exact names you need, then call each tool directly by its own name. Use the names exactly as written — do not invent or normalize them. ${shape}`,
    "",
    blocks.join("\n\n"),
  ].join("\n");
}

export function getMcpToolDefinitionsByName(
  names: string[],
  isEnabled: (name: string) => boolean,
  builtinNames: string[] = [],
): ToolDefinition[] {
  const wanted = new Set(names);
  const defs = new Map<string, ToolDefinition>();
  for (const s of servers.values()) {
    if (s.status !== "connected") continue;
    for (const tool of s.tools) {
      if (!wanted.has(tool.name) || !isEnabled(tool.name)) continue;
      if (!defs.has(tool.name)) defs.set(tool.name, toDefinition(s.name, tool));
    }
  }
  for (const name of wanted) {
    if (defs.has(name) && builtinNames.includes(name)) {
      console.warn(
        `[mcp] tool "${name}" shadows a built-in tool of the same name — the built-in wins and the MCP version is unreachable`,
      );
    }
  }
  return [...defs.values()];
}

function searchMcpTools(
  query: string,
  isEnabled: (name: string) => boolean,
): { server: string; tool: Tool; score: number }[] {
  return rankMcpTools(connectedServers(isEnabled), query);
}
export function rankMcpTools(
  listed: McpServerTools[],
  query: string,
): { server: string; tool: Tool; score: number }[] {
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
  if (terms.length === 0) return [];
  const hits: { server: string; tool: Tool; score: number }[] = [];
  for (const { name, tools } of listed) {
    for (const tool of tools) {
      const toolName = tool.name.toLowerCase();
      const desc = (tool.description ?? "").toLowerCase();
      let score = 0;
      for (const term of terms) {
        if (toolName === term) score += 20;
        else if (toolName.includes(term)) score += 8;
        if (desc.includes(term)) score += 2;
      }
      if (score > 0) hits.push({ server: name, tool, score });
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, SEARCH_LIMIT);
}

export function loadMcpTools(
  args: ToolArgs,
  isEnabled: (name: string) => boolean,
  builtinDefs: ToolDefinition[] = [],
): { content: string; defs: ToolDefinition[]; summary: string } {
  const names = Array.isArray(args.names)
    ? args.names.filter((n): n is string => typeof n === "string")
    : [];
  const query = typeof args.query === "string" ? args.query.trim() : "";

  if (names.length === 0 && query === "") {
    return {
      content:
        "Pass `names` (exact tool names from the tool signatures index) or `query` to search.",
      defs: [],
      summary: "no arguments",
    };
  }

  if (names.length === 0) {
    const hits = searchMcpTools(query, isEnabled);
    if (hits.length === 0) {
      return {
        content: `No tool matches "${query}".`,
        defs: [],
        summary: query,
      };
    }
    const lines = hits.map(
      (h) => `- [${h.server}] ${renderMcpToolSignature(h.tool)}`,
    );
    return {
      content: [
        `Matches for "${query}". Call ${MCP_LOAD_TOOLS_NAME} again with the names you want:`,
        ...lines,
      ].join("\n"),
      defs: [],
      summary: query,
    };
  }

  const defs = getMcpToolDefinitionsByName(
    names,
    isEnabled,
    builtinDefs.map((d) => d.function.name),
  );
  const builtin = new Map(
    builtinDefs
      .filter((d) => isEnabled(d.function.name))
      .map((d) => [d.function.name, d]),
  );
  const seen = new Set(defs.map((d) => d.function.name));
  for (const name of names) {
    if (!seen.has(name)) {
      const def = builtin.get(name);
      if (def) {
        defs.push(def);
        seen.add(name);
      }
    }
  }
  const found = new Set(defs.map((d) => d.function.name));
  const missing = names.filter((n) => !found.has(n));
  if (defs.length === 0) {
    return {
      content: `None of these are available tools: ${missing.join(", ")}. Use the names exactly as they appear in the tool signatures index, or pass a query to search.`,
      defs: [],
      summary: names.join(", "),
    };
  }
  const parts = [
    `Loaded ${plural(defs.length, "tool")}: ${[...found].join(", ")}. Their schemas are now available — call each one directly by its own name.`,
  ];
  if (missing.length > 0) {
    parts.push(`Not found: ${missing.join(", ")}.`);
  }
  return { content: parts.join(" "), defs, summary: names.join(", ") };
}

function renderMcpToolSignature(tool: Tool): string {
  const desc = tool.description ? ` — ${firstSentence(tool.description)}` : "";
  return `${toSignature(tool)}${desc}`;
}

export function getMcpServerInfo(): {
  name: string;
  status: McpServerStatus;
  error?: string;
  tools: { name: string; description: string }[];
}[] {
  const connected = new Map([...servers.values()].map((s) => [s.name, s]));
  const names = new Set([...connected.keys(), ...Object.keys(parseConfig())]);
  return [...names].map((name) => {
    const s = connected.get(name);
    return {
      name,
      status: s?.status ?? "disconnected",
      error: s?.error,
      tools: (s?.tools ?? []).map((t) => ({
        name: t.name,
        description: t.description ?? "",
      })),
    };
  });
}
