import { memo } from "react";
import { FoldVertical } from "lucide-react";
import { fmtTokens } from "@kotys/contracts";

interface IProps {
  used: number;
  pct: number;
  /** The model's full context window. */
  ctx: number;
  compacted?: boolean;
  isCompacting?: boolean;
  onCompact?: () => void;
}

function TokenBadgeBase({
  used,
  pct,
  ctx,
  compacted,
  isCompacting,
  onCompact,
}: IProps) {
  if (used <= 0) return null;
  const ring = pct >= 90 ? "#ef4444" : pct >= 75 ? "#f59e0b" : "var(--accent)";
  const textColor =
    pct >= 90
      ? "text-red-400"
      : pct >= 75
        ? "text-amber-400"
        : "text-text-muted";
  // Full turn = 360° minus a cap gap, so the arc never closes into a circle.
  const sweep = (Math.min(pct, 100) / 100) * (360 - 72);
  const r = 6.5;
  const c = 2 * Math.PI * r;
  return (
    <span className="group relative inline-flex items-center">
      <span
        className="inline-flex items-center gap-1.5 cursor-default"
        aria-label={`Context ${fmtTokens(used)} of ${fmtTokens(ctx)}, ${pct}%`}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          className="-rotate-90"
          aria-hidden="true"
        >
          <circle
            cx="8"
            cy="8"
            r={r}
            fill="none"
            stroke="var(--border)"
            strokeWidth="2"
          />
          <circle
            cx="8"
            cy="8"
            r={r}
            fill="none"
            stroke={ring}
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={`${(sweep / 360) * c} ${c}`}
            className="transition-all"
          />
        </svg>
        <span className={`text-[11px] tabular-nums ${textColor}`}>{pct}%</span>
      </span>
      <span
        className="absolute bottom-full right-0 mb-1.5 hidden group-hover:block w-max min-w-44 rounded-xl border border-border bg-surface shadow-xl z-40 p-1.5 before:content-[''] before:absolute before:top-full before:right-0 before:h-2 before:w-full"
        role="tooltip"
      >
        <span className="block whitespace-nowrap px-2.5 py-1.5">
          <span className="font-semibold">
            {fmtTokens(used)} / {fmtTokens(ctx)}
          </span>
          <span className={` ${textColor}`}> ({pct}%)</span>
          {compacted && <span className="text-text-muted"> · compacted</span>}
        </span>
        {onCompact && (
          <button
            onClick={onCompact}
            disabled={isCompacting}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-surface-2 disabled:opacity-50 disabled:hover:bg-transparent text-left transition"
            title={
              compacted
                ? "Compact again to free more context"
                : "Summarize older messages to free context"
            }
          >
            <FoldVertical
              size={12}
              className={`text-text-muted shrink-0 ${isCompacting ? "animate-pulse" : ""}`}
            />
            <span className="text-sm">
              {isCompacting ? "Compacting…" : "Compact now"}
              <span className="block text-[10px] font-normal text-text-muted">
                {isCompacting
                  ? "Summarizing older messages"
                  : compacted
                    ? "Summarize again to free more context"
                    : "Summarize older messages"}
              </span>
            </span>
          </button>
        )}
      </span>
    </span>
  );
}

const TokenBadgeBaseMemo = memo(TokenBadgeBase);
export default TokenBadgeBaseMemo;
