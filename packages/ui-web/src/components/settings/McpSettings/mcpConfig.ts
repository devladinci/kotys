export const MCP_SERVERS_SETTING = "mcp_servers";

export type McpServerType = "stdio" | "http";

type McpEnv = { key: string; value: string }[];

export type McpConfigEntry = {
  type: McpServerType;
  command: string;
  args: string[];
  env: McpEnv;
  url: string;
  clientId: string;
  // Fields the form does not edit (headers, clientSecret, scope) ride along.
  extra: Record<string, unknown>;
};

export type McpConfig = Record<string, McpConfigEntry>;

export type McpEnvRow = { id: number; key: string; value: string };

export type McpDraft = {
  name: string;
  type: McpServerType;
  command: string;
  args: string;
  env: McpEnvRow[];
  url: string;
  clientId: string;
};

const HTTP_FORM_KEYS = ["type", "url", "clientId"];
const STDIO_FORM_KEYS = ["type", "command", "args", "env"];

let lastEnvRowId = 0;

export function envRow(key = "", value = ""): McpEnvRow {
  lastEnvRowId += 1;
  return { id: lastEnvRowId, key, value };
}

export function newServerDraft(): McpDraft {
  return {
    name: "",
    type: "stdio",
    command: "npx",
    args: "",
    env: [],
    url: "",
    clientId: "",
  };
}

export function draftFromEntry(name: string, entry: McpConfigEntry): McpDraft {
  if (entry.type === "http") {
    return {
      ...newServerDraft(),
      name,
      type: "http",
      command: "",
      url: entry.url,
      clientId: entry.clientId,
    };
  }
  return {
    ...newServerDraft(),
    name,
    command: entry.command,
    args: entry.args.join("\n"),
    env:
      entry.env.length > 0
        ? entry.env.map(({ key, value }) => envRow(key, value))
        : [envRow()],
  };
}

export function entryFromDraft(
  draft: McpDraft,
  extra: Record<string, unknown>,
): McpConfigEntry {
  if (draft.type === "http") {
    return {
      type: "http",
      command: "",
      args: [],
      env: [],
      url: draft.url.trim(),
      clientId: draft.clientId.trim(),
      extra,
    };
  }
  return {
    type: "stdio",
    command: draft.command.trim(),
    args: draft.args
      .split("\n")
      .map((a) => a.trim())
      .filter(Boolean),
    env: draft.env
      .filter((row) => row.key.trim() !== "")
      .map(({ key, value }) => ({ key, value })),
    url: "",
    clientId: "",
    extra,
  };
}

const withoutKeys = (
  entry: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> =>
  Object.fromEntries(Object.entries(entry).filter(([k]) => !keys.includes(k)));

function parseEntry(e: Record<string, unknown>): McpConfigEntry | null {
  if (e.type === "http") {
    const url = typeof e.url === "string" ? e.url : "";
    if (!url) return null;
    return {
      type: "http",
      command: "",
      args: [],
      env: [],
      url,
      clientId: typeof e.clientId === "string" ? e.clientId : "",
      extra: withoutKeys(e, HTTP_FORM_KEYS),
    };
  }
  const command = typeof e.command === "string" ? e.command : "";
  if (!command) return null;
  const args = Array.isArray(e.args)
    ? e.args.filter((a): a is string => typeof a === "string")
    : [];
  const envRaw =
    e.env && typeof e.env === "object" && !Array.isArray(e.env)
      ? (e.env as Record<string, unknown>)
      : {};
  const env = Object.entries(envRaw)
    .filter(([, v]) => typeof v === "string")
    .map(([key, value]) => ({ key, value: String(value) }));
  return {
    type: "stdio",
    command,
    args,
    env,
    url: "",
    clientId: "",
    extra: withoutKeys(e, STDIO_FORM_KEYS),
  };
}

export function parseMcpConfig(raw: string | null): McpConfig {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const out: McpConfig = {};
    for (const [name, entry] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      if (!entry || typeof entry !== "object") continue;
      const parsedEntry = parseEntry(entry as Record<string, unknown>);
      if (parsedEntry) out[name] = parsedEntry;
    }
    return out;
  } catch {
    return {};
  }
}

export function serializeMcpConfig(cfg: McpConfig): string {
  const out: Record<string, Record<string, unknown>> = {};
  for (const [name, entry] of Object.entries(cfg)) {
    if (entry.type === "http") {
      out[name] = {
        ...entry.extra,
        type: "http",
        url: entry.url,
        ...(entry.clientId ? { clientId: entry.clientId } : {}),
      };
      continue;
    }
    const env: Record<string, string> = {};
    for (const { key, value } of entry.env) {
      if (key.trim()) env[key.trim()] = value;
    }
    out[name] = {
      ...entry.extra,
      command: entry.command,
      args: entry.args,
      env,
    };
  }
  return JSON.stringify(out);
}
