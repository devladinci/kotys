import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Square } from "lucide-react";
import { useRpc } from "@kotys/core";
import type { RunningModel } from "@kotys/contracts";
import { formatBytes, formatExpires } from "./helpers";

export function RunningModelsSection() {
  const rpc = useRpc();
  const [models, setModels] = useState<RunningModel[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [stopping, setStopping] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await rpc.ollama.running();
      setModels(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setModels([]);
    } finally {
      setLoading(false);
    }
  }, [rpc]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- initial load of running models */
    void refresh();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [refresh]);

  const handleStop = useCallback(
    async (name: string) => {
      setStopping(name);
      try {
        await rpc.ollama.unload({ model: name });
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setStopping(null);
      }
    },
    [refresh, rpc],
  );

  return (
    <section>
      <div className="bg-surface border border-border rounded-xl p-5 mb-4">
        <div className="flex items-center justify-between">
          <span className="block text-sm text-text-muted">
            Loaded local models
          </span>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            aria-label="Refresh loaded models"
            className="p-1 rounded hover:bg-surface-2 text-text-muted hover:text-text transition disabled:opacity-50"
          >
            {loading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <RefreshCw size={14} />
            )}
          </button>
        </div>
        {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
      </div>
      {models === null && loading ? (
        <div className="flex items-center gap-2 text-xs text-text-muted py-4">
          <Loader2 size={14} className="animate-spin" />
          <span>Checking local Ollama…</span>
        </div>
      ) : models && models.length > 0 ? (
        <div className="space-y-2">
          {models.map((m) => (
            <li
              key={m.name}
              className="list-none flex items-center gap-2 px-4 py-3 bg-surface border border-border rounded-xl"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{m.name}</div>
                <div className="text-[11px] text-text-muted">
                  {formatBytes(m.sizeVram)}
                  {m.expiresAt ? ` · ${formatExpires(m.expiresAt)}` : ""}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleStop(m.name)}
                disabled={stopping === m.name}
                aria-label={`Stop ${m.name}`}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs text-text-muted hover:text-red-500 hover:bg-surface-2 transition disabled:opacity-50"
              >
                {stopping === m.name ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Square size={12} className="fill-current" />
                )}
                Stop
              </button>
            </li>
          ))}
        </div>
      ) : (
        <p className="text-xs text-text-muted">
          {error
            ? "Could not reach local Ollama."
            : "No local models currently loaded."}
        </p>
      )}
    </section>
  );
}
