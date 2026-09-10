import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart2 } from "lucide-react";
import type { AnalyticsOverview } from "@kotys/contracts";
import { fmtTokens } from "@kotys/contracts";
import { useAppStore, useRpc } from "@kotys/core";

/**
 * Live analytics strip for the welcome (no chat open) screen. Reads the same
 * overview the full Analytics page does and refetches on chatsVersion, so the
 * numbers track activity without any polling.
 */
export default function AnalyticsStrip() {
  const rpc = useRpc();
  const navigate = useNavigate();
  const { chatsVersion } = useAppStore();
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);

  useEffect(() => {
    let cancelled = false;
    void rpc.analytics
      .overview()
      .then((data) => {
        if (!cancelled) setOverview(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [rpc, chatsVersion]);

  if (!overview || overview.total_messages === 0) return null;

  const cells = [
    { label: "chats", value: overview.total_chats.toLocaleString() },
    { label: "messages", value: overview.total_messages.toLocaleString() },
    {
      label: "tokens",
      value: fmtTokens(overview.eval_tokens),
    },
  ];

  return (
    <button
      onClick={() => navigate("/analytics")}
      title="Open analytics"
      className="mt-10 flex items-center gap-5 rounded-xl border border-border bg-surface px-5 py-3 transition-colors hover:bg-surface-2"
    >
      <BarChart2 size={15} className="text-text-muted" aria-hidden="true" />
      {cells.map(({ label, value }) => (
        <span key={label} className="flex items-baseline gap-1.5 text-xs">
          <span className="text-sm font-semibold text-text">{value}</span>
          <span className="text-text-muted">{label}</span>
        </span>
      ))}
    </button>
  );
}
