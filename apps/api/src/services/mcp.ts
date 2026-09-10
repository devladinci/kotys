import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type {
  McpServersConfig,
  McpStdioServerConfig,
  McpHttpServerConfig,
  ToolArgs,
  ToolResult,
} from "@kotys/contracts";
import {
  findServerForTool,
  parseConfig,
  servers,
  type ManagedServer,
} from "./mcp/registry.js";
import {
  KotysOAuthProvider,
  startCallbackServer,
  stopCallbackServer,
} from "./mcp/oauth.js";
import { previewResults } from "./mcp/preview.js";

export {
  type McpIndexTier,
  MCP_LOAD_TOOLS_NAME,
  ALWAYS_LOADED_TOOLS,
  getToolRoster,
  buildLoadToolsDefinition,
  firstSentence,
  renderMcpToolIndex,
  getMcpToolDefinitionsByName,
  rankMcpTools,
  loadMcpTools,
  getMcpServerInfo,
} from "./mcp/indexRender.js";
export { summarizeMcpArgs } from "./mcp/preview.js";

const MCP_TOOL_TIMEOUT_MS = 30_000;

async function connectStdio(
  name: string,
  cfg: McpStdioServerConfig,
): Promise<ManagedServer> {
  const client = new Client({ name: "kotys", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: cfg.command,
    args: cfg.args,
    env: cfg.env,
    stderr: "pipe",
  });
  const server: ManagedServer = {
    name,
    client,
    tools: [],
    status: "disconnected",
    close: async () => {
      try {
        await client.close();
      } catch {
        // already closed
      }
    },
  };
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    server.tools = tools;
    server.status = "connected";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[mcp] ${name}: connect failed:`, msg);
    server.status = "error";
    server.error = msg;
  }
  return server;
}

async function connectHttp(
  name: string,
  cfg: McpHttpServerConfig,
  skipOAuth: boolean,
): Promise<ManagedServer> {
  const client = new Client({ name: "kotys", version: "1.0.0" });
  const provider = new KotysOAuthProvider(name, {
    clientId: cfg.clientId,
    scope: cfg.scope,
    skipOAuth,
  });
  let transport = new StreamableHTTPClientTransport(new URL(cfg.url), {
    authProvider: provider,
    ...(cfg.headers ? { requestInit: { headers: cfg.headers } } : {}),
  });
  const server: ManagedServer = {
    name,
    client,
    tools: [],
    status: "disconnected",
    close: async () => {
      try {
        await transport.close();
      } catch {
        // already closed
      }
      stopCallbackServer(name);
    },
  };
  try {
    const expectedState = await provider.state();
    // Only start the callback server when we actually intend to do the
    // OAuth dance. With skipOAuth we let the UnauthorizedError surface so
    // the UI can prompt the user to reconnect manually.
    const codePromise = skipOAuth
      ? null
      : startCallbackServer(name, expectedState);
    let connected = false;
    try {
      await client.connect(transport);
      connected = true;
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        (err.name === "UnauthorizedError" || /unauthorized/i.test(err.message))
      ) {
        if (skipOAuth) {
          server.status = "error";
          server.error =
            "MCP server requires authorization. Reconnect from Settings → MCP Servers to authenticate.";
          return server;
        }
        const code = await (codePromise as Promise<string>);
        if (!code) throw new Error("OAuth authorization timed out");
        await transport.finishAuth(code);
        // The first transport is spent — create a fresh one with the
        // same provider (now holding tokens) for the retry.
        try {
          await transport.close();
        } catch {
          // already closed
        }
        transport = new StreamableHTTPClientTransport(new URL(cfg.url), {
          authProvider: provider,
          ...(cfg.headers ? { requestInit: { headers: cfg.headers } } : {}),
        });
        await client.connect(transport);
        connected = true;
      } else {
        throw err;
      }
    }
    if (!connected) throw new Error("Failed to connect");
    stopCallbackServer(name);
    const { tools } = await client.listTools();
    server.tools = tools;
    server.status = "connected";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[mcp] ${name}: http connect failed:`, msg);
    server.status = "error";
    server.error = msg;
    stopCallbackServer(name);
  }
  return server;
}

async function connectOne(
  name: string,
  cfg: McpServersConfig[string],
  skipOAuth: boolean,
): Promise<ManagedServer> {
  if ("type" in cfg && cfg.type === "http") {
    return connectHttp(name, cfg, skipOAuth);
  }
  return connectStdio(name, cfg as McpStdioServerConfig);
}

export async function connectMcpServers(
  opts: { skipOAuth?: boolean } = {},
): Promise<void> {
  const skipOAuth = opts.skipOAuth ?? true;
  const config = parseConfig();
  for (const [name, cfg] of Object.entries(config)) {
    if (servers.has(name)) continue;
    const server = await connectOne(name, cfg, skipOAuth);
    servers.set(name, server);
  }
}

export async function reconnectMcpServers(): Promise<void> {
  await disconnectMcpServers();
  // Manual reconnect from Settings → MCP Servers is the only path that
  // is allowed to pop the browser for OAuth.
  await connectMcpServers({ skipOAuth: false });
}

export async function disconnectMcpServers(): Promise<void> {
  const closes = [...servers.values()].map((s) => s.close());
  await Promise.all(closes);
  servers.clear();
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`MCP tool timed out after ${ms}ms`)),
      ms,
    );
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

function extractContent(result: CallToolResult): string {
  const blocks = (result.content ?? []) as Array<
    { type: "text"; text?: string } | { type: string; [k: string]: unknown }
  >;
  const texts = blocks
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text ?? "");
  if (texts.length > 0) return texts.join("\n");
  try {
    return JSON.stringify(result);
  } catch {
    return "";
  }
}

export async function callMcpTool(
  name: string,
  args: ToolArgs,
  signal?: AbortSignal,
): Promise<ToolResult> {
  const server = findServerForTool(name);
  if (!server) {
    return {
      content: `Unknown MCP tool: ${name}`,
      activity: { status: "error", error: `Unknown MCP tool: ${name}` },
    };
  }
  let result: CallToolResult;
  try {
    result = (await withTimeout(
      server.client.callTool(
        { name, arguments: args },
        undefined,
        signal ? { signal } : undefined,
      ),
      MCP_TOOL_TIMEOUT_MS,
    )) as CallToolResult;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[mcp] ${name}: call failed:`, msg);
    return {
      content: `Error: ${msg}`,
      activity: { status: "error", error: msg },
    };
  }
  const content = extractContent(result);
  if (result.isError) {
    return {
      content: content || `MCP tool ${name} returned an error`,
      activity: { status: "error", error: content || "MCP tool error" },
    };
  }
  const results = previewResults(content);
  return {
    content,
    activity: results.length > 0 ? { results } : {},
  };
}

export function isMcpTool(name: string): boolean {
  return findServerForTool(name) !== undefined;
}

export function getMcpServerForTool(name: string): string | undefined {
  return findServerForTool(name)?.name;
}
