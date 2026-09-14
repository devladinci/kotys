import { useCallback, useEffect, useState } from "react";
import { Copy, Check, Server, Link2 } from "lucide-react";
import { usePlatform } from "@kotys/core";
import { PairingPanel } from "./PairingPanel";

type BackendView = { kind: "own" } | { kind: "connect"; host: string };

/**
 * Narrow the persisted backend config coming over IPC. Anything unexpected
 * reads as "own" — the default — so a stale or foreign file can never wedge
 * the settings UI.
 */
const asBackendView = (value: unknown): BackendView => {
  if (!value || typeof value !== "object") return { kind: "own" };
  const mode = (value as { mode?: unknown }).mode;
  if (!mode || typeof mode !== "object") return { kind: "own" };
  if ((mode as { kind?: unknown }).kind === "own") return { kind: "own" };
  if ((mode as { kind?: unknown }).kind === "connect") {
    const host = (mode as { host?: unknown }).host;
    if (typeof host === "string") return { kind: "connect", host };
  }
  return { kind: "own" };
};

const CHOICES = [
  {
    kind: "own",
    label: "This instance",
    Icon: Server,
    hint: "This Mac runs its own backend and its own database. Default.",
  },
  {
    kind: "connect",
    label: "Connect to a running instance",
    Icon: Link2,
    hint: "Attach to a backend on another machine (e.g. over Tailscale) and share its data.",
  },
] as const;

export function BackendSettings() {
  const platform = usePlatform();
  const backend = platform.backend;

  const [persisted, setPersisted] = useState<BackendView | null>(null);
  const [selected, setSelected] = useState<"own" | "connect">("own");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!backend) return;
    let cancelled = false;
    const load = async () => {
      const raw = await backend.get();
      if (cancelled) return;
      const view = asBackendView(raw);
      setPersisted(view);
      setSelected(view.kind);
      if (view.kind === "connect") setCode(`${view.host}|`);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [backend]);

  const handleSelect = useCallback((kind: "own" | "connect") => {
    setSelected(kind);
    setError("");
  }, []);

  // A successful pair persists the connect config in the main process;
  // restarting the window against it is the only thing left to do.
  const handlePaired = useCallback(async () => {
    if (!backend) return;
    setError("");
    try {
      await backend.restart();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [backend]);

  const handleCopy = useCallback(async () => {
    if (!backend) return;
    const { code: shareCode } = await backend.connectCode();
    if (!shareCode) {
      setError(
        "No backend is running on this Mac yet, so there is nothing to share.",
      );
      return;
    }
    try {
      await navigator.clipboard.writeText(shareCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError(
        "Clipboard access was denied — select the code and copy it manually.",
      );
    }
  }, [backend]);

  const handleApply = useCallback(async () => {
    if (!backend || isBusy) return;
    setIsBusy(true);
    setError("");
    try {
      if (selected === "own") {
        await backend.set({ kind: "own" });
      } else {
        if (!code.trim())
          throw new Error("Paste the other instance's connect code first.");
        await backend.set({ kind: "connect", connectCode: code });
      }
      // The choice only takes effect through a restart against the freshly
      // persisted config; this window is destroyed and recreated.
      await backend.restart();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setIsBusy(false);
    }
  }, [backend, code, isBusy, selected]);

  if (!backend) return null;

  const isDirty =
    persisted !== null &&
    (persisted.kind !== selected || (selected === "connect" && !code.trim()));

  return (
    <section className="bg-surface border border-border rounded-xl p-5">
      <h2 className="text-base font-semibold mb-1">Backend</h2>
      <p className="text-xs text-text-muted mb-4">
        Where this app&apos;s data lives. Each instance keeps its own database
        unless you explicitly connect two of them.
      </p>

      <div className="space-y-2">
        {CHOICES.map(({ kind, label, Icon, hint }) => (
          <button
            key={kind}
            type="button"
            onClick={() => handleSelect(kind)}
            aria-pressed={selected === kind}
            className={`w-full text-left rounded-lg border p-3 transition ${
              selected === kind
                ? "border-accent bg-surface-2"
                : "border-border hover:bg-surface-2"
            }`}
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <Icon
                size={14}
                className={
                  selected === kind ? "text-accent" : "text-text-muted"
                }
              />
              {label}
            </span>
            <span className="block text-xs text-text-muted mt-1">{hint}</span>
          </button>
        ))}
      </div>

      {selected === "connect" && (
        <div className="mt-4">
          <label
            htmlFor="backend-connect-code"
            className="block text-xs text-text-muted mb-1.5"
          >
            Connect code — on the machine that owns your data: Settings →
            Backend → Copy connect code
          </label>
          <input
            id="backend-connect-code"
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="100.x.y.z|token"
            aria-label="Backend connect code"
            className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent font-mono"
          />
          <PairingPanel onPaired={handlePaired} />
        </div>
      )}

      {selected === "own" && persisted?.kind === "own" && (
        <div className="mt-4 rounded-lg border border-border p-3">
          <p className="text-xs text-text-muted mb-2">
            Sharing with another Mac? Copy this instance&apos;s connect code
            into Kotys there.
          </p>
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-surface-2"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? "Copied" : "Copy connect code"}
          </button>
        </div>
      )}

      {persisted?.kind === "connect" && (
        <p className="text-xs text-text-muted mt-3">
          Currently connected to{" "}
          <span className="font-mono">{persisted.host}</span> — this window
          shows that instance&apos;s data.
        </p>
      )}

      {error && <p className="text-xs text-red-400 mt-3">{error}</p>}

      <button
        type="button"
        onClick={handleApply}
        disabled={isBusy || !isDirty}
        className="mt-4 px-3 py-1.5 rounded-lg border border-accent text-accent text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-2"
      >
        {isBusy ? "Restarting…" : "Apply & restart"}
      </button>
      <p className="text-xs text-text-muted mt-1.5">
        Switching backends restarts the app window. Your data is not touched —
        only which database this window points at.
      </p>
    </section>
  );
}
