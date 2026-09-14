import { useCallback, useState } from "react";
import { Search, Loader2 } from "lucide-react";
import { usePlatform } from "@kotys/core";

interface IProps {
  onPaired: () => void;
}

interface Instance {
  name: string;
  host: string;
}

type DiscoverState =
  | { phase: "idle" }
  | { phase: "scanning" }
  | { phase: "list"; instances: Instance[] }
  | { phase: "unavailable"; error: string };

type PairState =
  | { phase: "idle"; instance: null }
  | { phase: "claiming"; instance: Instance }
  | { phase: "failed"; instance: Instance; error: string };

const CODE_PATTERN = /^\d{4}$/;

/** Daemon error codes → user-facing text; anything else passes through. */
const claimErrorText = (raw: string): string => {
  if (raw === "wrong_code")
    return "Wrong code — check the other instance's panel and try again.";
  if (raw === "no_pairing_in_progress") {
    return "No pairing in progress — reopen the code on the other instance (it expires after 2 minutes).";
  }
  if (raw === "too_many_attempts") {
    return "Too many wrong attempts — reopen the code on the other instance and start over.";
  }
  return `Pairing failed: ${raw}`;
};

const discoverErrorText = (error: string): string =>
  error.includes("Pairing needs")
    ? error
    : "Pairing runs on the tailnet, but Tailscale seems off or has no other peers.";

/**
 * Bluetooth-style join: scan for Kotys daemons on the tailnet, pick one,
 * type the 4-digit code its settings panel shows, done — no connect codes
 * to copy. The paste-code input stays as the fallback for hosts discovery
 * can't see.
 */
export function PairingPanel({ onPaired }: IProps) {
  const platform = usePlatform();
  const discover = platform.backend?.discover;
  const pair = platform.backend?.pair;

  const [discovery, setDiscovery] = useState<DiscoverState>({ phase: "idle" });
  const [pairing, setPairing] = useState<PairState>({
    phase: "idle",
    instance: null,
  });
  const [code, setCode] = useState("");
  const [isScanning, setIsScanning] = useState(false);

  const handleScan = useCallback(async () => {
    if (!discover || isScanning) return;
    setIsScanning(true);
    setPairing({ phase: "idle", instance: null });
    setCode("");
    const result = await discover();
    setIsScanning(false);
    if (result.status === "unavailable") {
      setDiscovery({ phase: "unavailable", error: result.error });
      return;
    }
    setDiscovery({ phase: "list", instances: result.instances });
  }, [discover, isScanning]);

  const handlePick = useCallback((instance: Instance) => {
    setPairing({ phase: "claiming", instance });
    setCode("");
  }, []);

  const handleClaim = useCallback(async () => {
    if (!pair || pairing.phase !== "claiming") return;
    const entered = code.trim();
    if (!CODE_PATTERN.test(entered)) return;
    try {
      await pair({ host: pairing.instance.host, code: entered });
      onPaired();
    } catch (err) {
      setPairing({
        phase: "failed",
        instance: pairing.instance,
        error: claimErrorText(err instanceof Error ? err.message : String(err)),
      });
    }
  }, [code, onPaired, pair, pairing]);

  return (
    <div className="rounded-lg border border-border p-3 mt-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-muted">
          Or pair with an instance found on your tailnet:
        </p>
        <button
          type="button"
          onClick={handleScan}
          disabled={isScanning}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-surface-2 disabled:opacity-40"
        >
          {isScanning ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Search size={13} />
          )}
          {isScanning ? "Scanning…" : "Scan"}
        </button>
      </div>

      {discovery.phase === "unavailable" && (
        <p className="text-xs text-text-muted mt-2">
          {discoverErrorText(discovery.error)}
        </p>
      )}

      {discovery.phase === "list" && discovery.instances.length === 0 && (
        <p className="text-xs text-text-muted mt-2">
          No other Kotys instances found. Kotys must be running on the other
          machine, with Tailscale connected on both — then Scan again.
        </p>
      )}

      {discovery.phase === "list" && discovery.instances.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {discovery.instances.map((instance) => (
            <li key={instance.host}>
              <button
                type="button"
                onClick={() => handlePick(instance)}
                className="w-full flex items-center justify-between rounded-md border border-border px-2.5 py-2 text-xs hover:bg-surface-2"
              >
                <span className="font-medium">{instance.name}</span>
                <span className="font-mono text-text-muted">
                  {instance.host}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {pairing.phase === "claiming" && (
        <div className="mt-2.5 flex items-center gap-2">
          <span className="text-xs text-text-muted">
            Code shown on{" "}
            <span className="font-medium">{pairing.instance.name}</span>:
          </span>
          <input
            type="text"
            inputMode="numeric"
            maxLength={4}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleClaim();
            }}
            aria-label="Pairing code"
            className="w-20 bg-bg border border-border rounded-md px-2 py-1 text-sm tracking-widest text-center font-mono outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={() => void handleClaim()}
            disabled={!CODE_PATTERN.test(code.trim())}
            className="px-3 py-1.5 rounded-md border border-accent text-accent text-xs font-medium disabled:opacity-40"
          >
            Pair
          </button>
          <button
            type="button"
            onClick={() => setPairing({ phase: "idle", instance: null })}
            className="px-2 py-1.5 rounded-md text-xs text-text-muted hover:text-text"
          >
            Cancel
          </button>
        </div>
      )}

      {pairing.phase === "failed" && (
        <div className="mt-2.5">
          <p className="text-xs text-red-400">
            {claimErrorText(pairing.error)}
          </p>
          <button
            type="button"
            onClick={() => setPairing({ phase: "idle", instance: null })}
            className="mt-1.5 text-xs text-text-muted hover:text-text underline"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
