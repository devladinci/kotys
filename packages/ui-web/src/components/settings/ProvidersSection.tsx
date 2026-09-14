import { KeyRound } from "lucide-react";
import { useAppStore } from "@kotys/core";

const DEFAULT_OMLX_HOST = "http://127.0.0.1:7777/v1";

export function ProvidersSection() {
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
