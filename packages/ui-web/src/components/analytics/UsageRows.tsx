import type { ModelUsageRow, ToolUsageRow } from "@kotys/contracts";
import { fmtTokens } from "@kotys/contracts";
import { TOOL_ICONS } from "../chat/toolDisplay";
import { fmtDuration, fmtInt } from "./format";

export function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold mb-2">
        {title}
        {count !== undefined && (
          <span className="ml-2 text-xs font-normal text-text-muted">
            {count}
          </span>
        )}
      </h2>
      <div className="rounded-xl border border-border bg-surface p-4">
        {children}
      </div>
    </section>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-text-muted">{children}</p>;
}

/** One ranked row: label, inline share bar, right-aligned metrics. */
function RankRow({
  icon,
  label,
  badge,
  value,
  share,
  metrics,
}: {
  icon?: React.ReactNode;
  label: string;
  badge?: string;
  value: string;
  share: number;
  metrics: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="w-48 shrink-0 min-w-0 flex items-center gap-1.5">
        {icon}
        <div className="min-w-0">
          <div className="text-sm truncate">{label}</div>
          {badge && (
            <div className="text-xs text-text-muted truncate">{badge}</div>
          )}
        </div>
      </div>
      <div className="flex-1 h-1.5 rounded-full bg-surface-2 overflow-hidden">
        <div
          className="h-full rounded-full bg-accent"
          style={{ width: `${Math.max(share * 100, 2)}%` }}
        />
      </div>
      <div className="w-14 text-right text-sm tabular-nums">{value}</div>
      <div className="w-28 text-right text-xs text-text-muted tabular-nums">
        {metrics}
      </div>
    </div>
  );
}

export function ModelRow({ m, max }: { m: ModelUsageRow; max: number }) {
  return (
    <RankRow
      label={m.name}
      badge={m.provider}
      value={fmtInt(m.messages)}
      share={m.messages / max}
      metrics={
        <span>
          {fmtTokens(m.eval_tokens)} out · {m.source}
        </span>
      }
    />
  );
}

export function ToolRow({ t, max }: { t: ToolUsageRow; max: number }) {
  const Icon = t.server === null ? TOOL_ICONS[t.tool] : undefined;
  return (
    <RankRow
      icon={Icon ? <Icon size={13} className="text-text-muted" /> : undefined}
      label={t.tool}
      badge={t.server === null ? undefined : t.server || "unknown server"}
      value={fmtInt(t.calls)}
      share={t.calls / max}
      metrics={
        <span>
          {t.errors > 0 ? (
            <span className="text-red-500">{t.errors} err · </span>
          ) : null}
          {fmtDuration(t.total_ms / t.calls)} avg
        </span>
      }
    />
  );
}
