import { useCallback, useEffect, useState } from "react";
import { ChevronRight, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useRpc } from "@kotys/core";
import type { McpServerInfo } from "@kotys/contracts";
import { readEnabledMap } from "./helpers";
import { ToggleSwitch } from "./ToggleSwitch";

type McpConfigEntry = {
  type: "stdio" | "http";
  command: string;
  args: string[];
  env: { key: string; value: string }[];
  url: string;
  clientId: string;
};

type McpConfig = Record<string, McpConfigEntry>;

const STATUS_STYLES: Record<McpServerInfo["status"], string> = {
  connected: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  disconnected: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  error: "bg-red-500/15 text-red-400 border-red-500/30",
};

function parseMcpConfig(raw: string | null): McpConfig {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {};
    const out: McpConfig = {};
    for (const [name, entry] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as Record<string, unknown>;
      const type = e.type === "http" ? "http" : "stdio";
      if (type === "http") {
        const url = typeof e.url === "string" ? e.url : "";
        if (!url) continue;
        const clientId = typeof e.clientId === "string" ? e.clientId : "";
        out[name] = {
          type,
          command: "",
          args: [],
          env: [],
          url,
          clientId,
        };
      } else {
        const command = typeof e.command === "string" ? e.command : "";
        if (!command) continue;
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
        out[name] = {
          type,
          command,
          args,
          env,
          url: "",
          clientId: "",
        };
      }
    }
    return out;
  } catch {
    return {};
  }
}

function serializeMcpConfig(cfg: McpConfig): string {
  const out: Record<string, Record<string, unknown>> = {};
  for (const [name, entry] of Object.entries(cfg)) {
    if (entry.type === "http") {
      const httpEntry: Record<string, unknown> = {
        type: "http",
        url: entry.url,
      };
      if (entry.clientId) httpEntry.clientId = entry.clientId;
      out[name] = httpEntry;
    } else {
      const env: Record<string, string> = {};
      for (const { key, value } of entry.env) {
        if (key.trim()) env[key.trim()] = value;
      }
      out[name] = { command: entry.command, args: entry.args, env };
    }
  }
  return JSON.stringify(out);
}

export default function McpSettings() {
  const rpc = useRpc();
  const [config, setConfig] = useState<McpConfig>({});
  const [servers, setServers] = useState<McpServerInfo[]>([]);
  const [enabledMap, setEnabledMap] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [reconnecting, setReconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<{
    name: string;
    type: "stdio" | "http";
    command: string;
    args: string;
    env: { key: string; value: string }[];
    url: string;
    clientId: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    /* eslint-disable react-hooks/set-state-in-effect -- initial load of MCP config */
    setLoading(true);
    void (async () => {
      const [raw, enabledRaw] = await Promise.all([
        rpc.settings.get({ key: "mcp_servers" }),
        rpc.settings.get({ key: "tools_enabled" }),
      ]);
      if (cancelled) return;
      setConfig(parseMcpConfig(raw.value));
      setEnabledMap(readEnabledMap(enabledRaw.value));
      try {
        const list = await rpc.mcp.servers();
        if (!cancelled) setServers(list);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      }
      if (!cancelled) setLoading(false);
    })();
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => {
      cancelled = true;
    };
  }, [rpc]);

  const handleToggleTool = useCallback(
    (name: string, enabled: boolean) => {
      setEnabledMap((prev) => {
        const next = { ...prev, [name]: enabled };
        void rpc.settings.set({
          key: "tools_enabled",
          value: JSON.stringify(next),
        });
        return next;
      });
    },
    [rpc],
  );

  const handleAdd = useCallback(() => {
    setEditing(null);
    setDraft({
      name: "",
      type: "stdio",
      command: "npx",
      args: "",
      env: [],
      url: "",
      clientId: "",
    });
  }, []);

  const handleEdit = useCallback(
    (name: string) => {
      const entry = config[name];
      if (!entry) return;
      setEditing(name);
      if (entry.type === "http") {
        setDraft({
          name,
          type: "http",
          command: "",
          args: "",
          env: [],
          url: entry.url,
          clientId: entry.clientId,
        });
      } else {
        setDraft({
          name,
          type: "stdio",
          command: entry.command,
          args: entry.args.join("\n"),
          env: entry.env.length > 0 ? entry.env : [{ key: "", value: "" }],
          url: "",
          clientId: "",
        });
      }
    },
    [config],
  );

  const handleSaveDraft = useCallback(async () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) {
      setError("Server name is required.");
      return;
    }
    if (draft.type === "http") {
      if (!draft.url.trim()) {
        setError("URL is required for HTTP servers.");
        return;
      }
      const next: McpConfig = { ...config };
      if (editing && editing !== name) delete next[editing];
      next[name] = {
        type: "http",
        command: "",
        args: [],
        env: [],
        url: draft.url.trim(),
        clientId: draft.clientId.trim(),
      };
      setConfig(next);
      setError(null);
      try {
        await rpc.settings.set({
          key: "mcp_servers",
          value: serializeMcpConfig(next),
        });
        setReconnecting(true);
        const list = await rpc.mcp.reconnect();
        setServers(list);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setReconnecting(false);
        setDraft(null);
        setEditing(null);
      }
      return;
    }
    if (!draft.command.trim()) {
      setError("Command is required for stdio servers.");
      return;
    }
    const args = draft.args
      .split("\n")
      .map((a) => a.trim())
      .filter(Boolean);
    const env = draft.env.filter((e) => e.key.trim() !== "");
    const next: McpConfig = { ...config };
    if (editing && editing !== name) delete next[editing];
    next[name] = {
      type: "stdio",
      command: draft.command.trim(),
      args,
      env,
      url: "",
      clientId: "",
    };
    setConfig(next);
    setError(null);
    try {
      await rpc.settings.set({
        key: "mcp_servers",
        value: serializeMcpConfig(next),
      });
      setReconnecting(true);
      const list = await rpc.mcp.reconnect();
      setServers(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setReconnecting(false);
      setDraft(null);
      setEditing(null);
    }
  }, [draft, editing, config, rpc]);

  const handleRemove = useCallback(
    async (name: string) => {
      const next = { ...config };
      delete next[name];
      setConfig(next);
      setError(null);
      try {
        await rpc.settings.set({
          key: "mcp_servers",
          value: serializeMcpConfig(next),
        });
        setReconnecting(true);
        const list = await rpc.mcp.reconnect();
        setServers(list);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setReconnecting(false);
      }
    },
    [config, rpc],
  );

  const handleReconnect = useCallback(async () => {
    setReconnecting(true);
    setError(null);
    try {
      const list = await rpc.mcp.reconnect();
      setServers(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setReconnecting(false);
    }
  }, [rpc]);

  const addEnvRow = useCallback(() => {
    setDraft((d) =>
      d ? { ...d, env: [...d.env, { key: "", value: "" }] } : d,
    );
  }, []);

  const updateEnvRow = useCallback(
    (index: number, field: "key" | "value", value: string) => {
      setDraft((d) => {
        if (!d) return d;
        const env = d.env.map((e, i) =>
          i === index ? { ...e, [field]: value } : e,
        );
        return { ...d, env };
      });
    },
    [],
  );

  const removeEnvRow = useCallback((index: number) => {
    setDraft((d) => {
      if (!d) return d;
      return { ...d, env: d.env.filter((_, i) => i !== index) };
    });
  }, []);

  return (
    <div>
      <div className="bg-surface border border-border rounded-xl p-5 mb-4">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-semibold">MCP Servers</h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => void handleReconnect()}
              disabled={reconnecting}
              aria-label="Reconnect MCP servers"
              className="p-1 rounded hover:bg-surface-2 text-text-muted hover:text-text transition disabled:opacity-50"
            >
              {reconnecting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <RefreshCw size={14} />
              )}
            </button>
            <button
              type="button"
              onClick={handleAdd}
              aria-label="Add MCP server"
              className="p-1 rounded hover:bg-surface-2 text-text-muted hover:text-text transition"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
        <p className="text-xs text-text-muted">
          External Model Context Protocol servers. Their tools appear in chat
          alongside built-in ones; expand a server to enable or disable them
          individually.
        </p>
      </div>

      {error && <p className="text-xs text-red-500 mb-3">{error}</p>}
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-text-muted py-4">
          <Loader2 size={14} className="animate-spin" />
          <span>Loading MCP servers…</span>
        </div>
      ) : Object.keys(config).length === 0 && !draft ? (
        <p className="text-xs text-text-muted py-2">
          No MCP servers configured.
        </p>
      ) : (
        <div className="space-y-2">
          {Object.entries(config).map(([name, entry]) => {
            const info = servers.find((s) => s.name === name);
            const status = info?.status ?? "disconnected";
            return (
              <li
                key={name}
                className="list-none px-4 py-3 bg-surface border border-border rounded-xl"
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm truncate font-medium">
                        {name}
                      </span>
                      <span
                        className={`shrink-0 text-[10px] uppercase font-medium px-1.5 py-0.5 rounded border ${STATUS_STYLES[status]}`}
                      >
                        {status}
                      </span>
                    </div>
                    <div className="text-[11px] text-text-muted leading-snug mt-0.5 truncate">
                      {entry.type === "http"
                        ? `${entry.url}${entry.clientId ? " (OAuth)" : ""}`
                        : `${entry.command} ${entry.args.join(" ")}`}
                    </div>
                    {info?.error && (
                      <div className="text-[11px] text-red-500 leading-snug mt-0.5">
                        {info.error}
                      </div>
                    )}
                    {info && info.tools.length > 0 && (
                      <details className="mt-1.5 group">
                        <summary className="cursor-pointer text-[11px] text-text-muted hover:text-text transition select-none flex items-center gap-1">
                          <ChevronRight
                            size={10}
                            className="transition-transform group-open:rotate-90 shrink-0"
                          />
                          {
                            info.tools.filter(
                              (t) => enabledMap[t.name] !== false,
                            ).length
                          }
                          /{info.tools.length} tools enabled
                        </summary>
                        <ul className="mt-1.5 space-y-1.5 pl-3 border-l border-border max-h-48 overflow-y-auto scrollbar-thin">
                          {info.tools.map((t) => {
                            const toolEnabled = enabledMap[t.name] !== false;
                            return (
                              <li
                                key={t.name}
                                className="text-[11px] leading-snug flex items-start gap-2"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="font-medium text-text font-mono truncate">
                                    {t.name}
                                  </div>
                                  {t.description && (
                                    <div className="text-text-muted mt-0.5 line-clamp-2">
                                      {t.description}
                                    </div>
                                  )}
                                </div>
                                <ToggleSwitch
                                  size="sm"
                                  enabled={toolEnabled}
                                  label={`Toggle ${t.name}`}
                                  onChange={(next) =>
                                    handleToggleTool(t.name, next)
                                  }
                                />
                              </li>
                            );
                          })}
                        </ul>
                      </details>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleEdit(name)}
                      aria-label={`Edit ${name}`}
                      className="px-2 py-1 rounded text-xs text-text-muted hover:text-text hover:bg-surface-2 transition"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleRemove(name)}
                      disabled={reconnecting}
                      aria-label={`Remove ${name}`}
                      className="p-1 rounded text-text-muted hover:text-red-500 hover:bg-surface-2 transition disabled:opacity-50"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </div>
      )}

      {draft && (
        <div className="mt-3 border border-border rounded-lg p-3 bg-bg space-y-2">
          <div>
            <span className="block text-[11px] text-text-muted mb-1">Name</span>
            <input
              type="text"
              value={draft.name}
              onChange={(e) =>
                setDraft((d) => (d ? { ...d, name: e.target.value } : d))
              }
              disabled={editing !== null}
              placeholder="slack"
              aria-label="Server name"
              className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm outline-none focus:border-accent disabled:opacity-60"
            />
          </div>
          {!editing && (
            <div>
              <span className="block text-[11px] text-text-muted mb-1">
                Type
              </span>
              <select
                value={draft.type}
                onChange={(e) =>
                  setDraft((d) =>
                    d
                      ? {
                          ...d,
                          type: e.target.value as "stdio" | "http",
                        }
                      : d,
                  )
                }
                aria-label="Server type"
                className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm outline-none focus:border-accent"
              >
                <option value="stdio">Stdio (local subprocess)</option>
                <option value="http">HTTP (remote + OAuth)</option>
              </select>
            </div>
          )}
          {draft.type === "http" ? (
            <>
              <div>
                <span className="block text-[11px] text-text-muted mb-1">
                  URL
                </span>
                <input
                  type="text"
                  value={draft.url}
                  onChange={(e) =>
                    setDraft((d) => (d ? { ...d, url: e.target.value } : d))
                  }
                  placeholder="https://mcp.slack.com/mcp"
                  aria-label="Server URL"
                  className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm outline-none focus:border-accent font-mono"
                />
              </div>
              <div>
                <span className="block text-[11px] text-text-muted mb-1">
                  Client ID (optional — for pre-registered OAuth)
                </span>
                <input
                  type="text"
                  value={draft.clientId}
                  onChange={(e) =>
                    setDraft((d) =>
                      d ? { ...d, clientId: e.target.value } : d,
                    )
                  }
                  placeholder="1601185624273.8899143856786"
                  aria-label="OAuth client ID"
                  className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm outline-none focus:border-accent font-mono"
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <span className="block text-[11px] text-text-muted mb-1">
                  Command
                </span>
                <input
                  type="text"
                  value={draft.command}
                  onChange={(e) =>
                    setDraft((d) => (d ? { ...d, command: e.target.value } : d))
                  }
                  placeholder="npx"
                  aria-label="Command"
                  className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm outline-none focus:border-accent"
                />
              </div>
              <div>
                <span className="block text-[11px] text-text-muted mb-1">
                  Args (one per line)
                </span>
                <textarea
                  value={draft.args}
                  onChange={(e) =>
                    setDraft((d) => (d ? { ...d, args: e.target.value } : d))
                  }
                  placeholder={"-y\nkorotovsky/slack-mcp-server"}
                  aria-label="Arguments"
                  rows={3}
                  className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm outline-none focus:border-accent font-mono"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="block text-[11px] text-text-muted">
                    Environment variables
                  </span>
                  <button
                    type="button"
                    onClick={addEnvRow}
                    className="text-text-muted hover:text-text transition"
                    aria-label="Add environment variable"
                  >
                    <Plus size={12} />
                  </button>
                </div>
                <div className="space-y-1.5">
                  {draft.env.length === 0 && (
                    <p className="text-[11px] text-text-muted">No env vars.</p>
                  )}
                  {draft.env.map((row, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={row.key}
                        onChange={(e) => updateEnvRow(i, "key", e.target.value)}
                        placeholder="SLACK_BOT_TOKEN"
                        aria-label="Env var key"
                        className="flex-1 bg-surface border border-border rounded px-2 py-1 text-xs outline-none focus:border-accent font-mono"
                      />
                      <input
                        type="text"
                        value={row.value}
                        onChange={(e) =>
                          updateEnvRow(i, "value", e.target.value)
                        }
                        placeholder="xoxb-..."
                        aria-label="Env var value"
                        className="flex-1 bg-surface border border-border rounded px-2 py-1 text-xs outline-none focus:border-accent font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => removeEnvRow(i)}
                        aria-label="Remove env var"
                        className="p-1 rounded text-text-muted hover:text-red-500 hover:bg-surface-2 transition"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setDraft(null);
                setEditing(null);
                setError(null);
              }}
              className="px-3 py-1.5 rounded-lg border border-border text-text-muted hover:text-text hover:bg-surface-2 text-xs transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSaveDraft()}
              disabled={reconnecting}
              className="px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-medium transition disabled:opacity-50"
            >
              {reconnecting ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
