import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  RefreshCw,
  Square,
  Monitor,
  Moon,
  Sun,
  KeyRound,
} from "lucide-react";
import { useAppStore, useRpc, type ThemeMode } from "@kotys/core";
import type { RunningModel } from "@kotys/contracts";
import { formatBytes, formatExpires } from "./helpers";
import { BackendSettings } from "./BackendSettings";

const DEFAULT_OMLX_HOST = "http://127.0.0.1:7777/v1";

export default function GeneralSettings({
  theme,
  onThemeChange,
}: {
  theme: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
}) {
  return (
    <div className="space-y-4">
      <ProvidersSection />
      <BackendSettings />
      <AppearanceSection theme={theme} onThemeChange={onThemeChange} />
      <RunningModelsSection />
    </div>
  );
}

function ProvidersSection() {
  const {
    apiKey,
    apiKeyPresent,
    omlxEnabled,
    omlxHost,
    omlxApiKeyPresent,
    setApiKey,
    setOmlxEnabled,
    setOmlxHost,
    setOmlxApiKey,
  } = useAppStore();

  return (
    <section className="bg-surface border border-border rounded-xl p-5">
      <h2 className="text-base font-semibold mb-1">Providers</h2>
      <p className="text-xs text-text-muted mb-4">
        Model sources and their credentials. Keys are stored locally in this
        app&apos;s SQLite database and never sent back to the UI.
      </p>

      <div className="space-y-4">
        <div className="rounded-lg border border-border p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium">Ollama</span>
            <span className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-surface-2 text-text-muted">
              always on
            </span>
          </div>
          <p className="text-xs text-text-muted mb-3">
            Cloud (ollama.com) and local daemon (localhost:11434).
          </p>
          <label
            htmlFor="api-key-input"
            className="block text-xs text-text-muted mb-1.5"
          >
            <KeyRound size={11} className="inline mr-1 -mt-0.5" />
            Cloud API key
          </label>
          <input
            id="api-key-input"
            type="password"
            value={apiKey}
            onChange={(e) => void setApiKey(e.target.value)}
            placeholder={
              apiKeyPresent
                ? "••••••••••••  (stored — type to replace)"
                : "ollama_..."
            }
            aria-label="Ollama Cloud API key"
            className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <p className="text-xs text-text-muted mt-1.5">
            {apiKeyPresent
              ? "A key is stored. Type to replace it."
              : "No key stored yet. Needed only for Ollama Cloud models."}
          </p>
        </div>

        <div className="rounded-lg border border-border p-4">
          <div className="flex items-center justify-between mb-1">
            <label
              htmlFor="omlx-enabled"
              className="text-sm font-medium cursor-pointer"
            >
              oMLX
            </label>
            <input
              id="omlx-enabled"
              type="checkbox"
              checked={omlxEnabled}
              onChange={(e) => void setOmlxEnabled(e.target.checked)}
              className="accent-accent w-4 h-4 cursor-pointer"
            />
          </div>
          <p className="text-xs text-text-muted mb-3">
            OpenAI-compatible server (oMLX, or any /v1 endpoint). Models appear
            in the picker with an <span className="font-mono">omlx</span> badge
            when enabled.
          </p>
          <div className={omlxEnabled ? "" : "opacity-50 pointer-events-none"}>
            <label
              htmlFor="omlx-host-input"
              className="block text-xs text-text-muted mb-1.5"
            >
              Server URL
            </label>
            <input
              id="omlx-host-input"
              type="text"
              value={omlxHost}
              onChange={(e) => void setOmlxHost(e.target.value)}
              placeholder={DEFAULT_OMLX_HOST}
              aria-label="oMLX server URL"
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent font-mono"
            />
            <label
              htmlFor="omlx-api-key-input"
              className="block text-xs text-text-muted mb-1.5 mt-3"
            >
              <KeyRound size={11} className="inline mr-1 -mt-0.5" />
              API key
            </label>
            <input
              id="omlx-api-key-input"
              type="password"
              value=""
              onChange={(e) => void setOmlxApiKey(e.target.value)}
              placeholder={
                omlxApiKeyPresent
                  ? "••••••••••••  (stored — type to replace)"
                  : "sk-omlx-..."
              }
              aria-label="oMLX API key"
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <p className="text-xs text-text-muted mt-1.5">
              {omlxApiKeyPresent
                ? "A key is stored. Type to replace it."
                : "No key stored yet. The server may not require one."}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function AppearanceSection({
  theme,
  onThemeChange,
}: {
  theme: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
}) {
  return (
    <section className="bg-surface border border-border rounded-xl p-5">
      <h2 className="text-base font-semibold mb-1">Appearance</h2>
      <p className="text-xs text-text-muted mb-4">
        Theme follows your system by default.
      </p>
      <div className="flex gap-2">
        {(
          [
            { mode: "system", label: "System", Icon: Monitor },
            { mode: "light", label: "Light", Icon: Sun },
            { mode: "dark", label: "Dark", Icon: Moon },
          ] as const
        ).map(({ mode, label, Icon }) => (
          <button
            key={mode}
            type="button"
            onClick={() => onThemeChange(mode)}
            aria-pressed={theme === mode}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition ${
              theme === mode
                ? "border-accent text-accent bg-surface-2"
                : "border-border text-text-muted hover:text-text hover:bg-surface-2"
            }`}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>
      <p className="text-xs text-text-muted mt-2">
        System follows your OS appearance, switching light during the day and
        dark at night.
      </p>
    </section>
  );
}

function RunningModelsSection() {
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
