import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, RefreshCw } from "lucide-react";
import { useRpc } from "@kotys/core";
import type { McpServerInfo } from "@kotys/contracts";
import { readEnabledMap, TOOLS_ENABLED_SETTING } from "../helpers";
import { McpServerForm } from "./McpServerForm";
import { McpServerRow } from "./McpServerRow";
import {
  MCP_SERVERS_SETTING,
  draftFromEntry,
  entryFromDraft,
  newServerDraft,
  parseMcpConfig,
  serializeMcpConfig,
} from "./mcpConfig";
import type { McpConfig, McpDraft } from "./mcpConfig";

const errorText = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

export default function McpSettings() {
  const rpc = useRpc();
  const [config, setConfig] = useState<McpConfig>({});
  const [servers, setServers] = useState<McpServerInfo[]>([]);
  const [enabledMap, setEnabledMap] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [reconnecting, setReconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<McpDraft | null>(null);

  useEffect(() => {
    let cancelled = false;
    /* eslint-disable react-hooks/set-state-in-effect -- initial load of MCP config */
    setLoading(true);
    void (async () => {
      const [raw, enabledRaw] = await Promise.all([
        rpc.settings.get({ key: MCP_SERVERS_SETTING }),
        rpc.settings.get({ key: TOOLS_ENABLED_SETTING }),
      ]);
      if (cancelled) return;
      setConfig(parseMcpConfig(raw.value));
      setEnabledMap(readEnabledMap(enabledRaw.value));
      try {
        const list = await rpc.mcp.servers();
        if (!cancelled) setServers(list);
      } catch (err) {
        if (!cancelled) setError(errorText(err));
      }
      if (!cancelled) setLoading(false);
    })();
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => {
      cancelled = true;
    };
  }, [rpc]);

  const saveConfig = useCallback(
    async (next: McpConfig) => {
      setConfig(next);
      setError(null);
      try {
        await rpc.settings.set({
          key: MCP_SERVERS_SETTING,
          value: serializeMcpConfig(next),
        });
        setReconnecting(true);
        setServers(await rpc.mcp.reconnect());
      } catch (err) {
        setError(errorText(err));
      } finally {
        setReconnecting(false);
      }
    },
    [rpc],
  );

  const handleToggleTool = useCallback(
    (name: string, enabled: boolean) => {
      setEnabledMap((prev) => {
        const next = { ...prev, [name]: enabled };
        void rpc.settings.set({
          key: TOOLS_ENABLED_SETTING,
          value: JSON.stringify(next),
        });
        return next;
      });
    },
    [rpc],
  );

  const handleAdd = useCallback(() => {
    setEditing(null);
    setDraft(newServerDraft());
  }, []);

  const handleEdit = useCallback(
    (name: string) => {
      const entry = config[name];
      if (!entry) return;
      setEditing(name);
      setDraft(draftFromEntry(name, entry));
    },
    [config],
  );

  const handleCancelDraft = useCallback(() => {
    setDraft(null);
    setEditing(null);
    setError(null);
  }, []);

  const handleSaveDraft = useCallback(async () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) {
      setError("Server name is required.");
      return;
    }
    if (draft.type === "http" && !draft.url.trim()) {
      setError("URL is required for HTTP servers.");
      return;
    }
    if (draft.type === "stdio" && !draft.command.trim()) {
      setError("Command is required for stdio servers.");
      return;
    }
    const previous = editing ? config[editing] : undefined;
    const extra = previous?.type === draft.type ? previous.extra : {};
    const next: McpConfig = { ...config };
    if (editing && editing !== name) delete next[editing];
    next[name] = entryFromDraft(draft, extra);
    await saveConfig(next);
    setDraft(null);
    setEditing(null);
  }, [draft, editing, config, saveConfig]);

  const handleRemove = useCallback(
    (name: string) => {
      const next = { ...config };
      delete next[name];
      void saveConfig(next);
    },
    [config, saveConfig],
  );

  const handleReconnect = useCallback(async () => {
    setReconnecting(true);
    setError(null);
    try {
      setServers(await rpc.mcp.reconnect());
    } catch (err) {
      setError(errorText(err));
    } finally {
      setReconnecting(false);
    }
  }, [rpc]);

  const handleReconnectClick = () => void handleReconnect();

  const handleSaveClick = () => void handleSaveDraft();

  return (
    <div>
      <div className="bg-surface border border-border rounded-xl p-5 mb-4">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-semibold">MCP Servers</h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleReconnectClick}
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
        <ul className="space-y-2">
          {Object.entries(config).map(([name, entry]) => (
            <McpServerRow
              key={name}
              name={name}
              entry={entry}
              info={servers.find((s) => s.name === name)}
              enabledMap={enabledMap}
              isReconnecting={reconnecting}
              onEdit={handleEdit}
              onRemove={handleRemove}
              onToggleTool={handleToggleTool}
            />
          ))}
        </ul>
      )}

      {draft && (
        <McpServerForm
          draft={draft}
          isEditing={editing !== null}
          isSaving={reconnecting}
          onChange={setDraft}
          onCancel={handleCancelDraft}
          onSave={handleSaveClick}
        />
      )}
    </div>
  );
}
