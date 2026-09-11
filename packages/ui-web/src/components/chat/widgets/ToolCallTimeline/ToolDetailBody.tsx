import type { ToolActivity } from "@kotys/contracts";
import { describeTool, formatDuration } from "../../toolDisplay";

interface IToolDetailBodyProps {
  tc: ToolActivity;
  durationMs: number;
}

export function ToolDetailBody({ tc, durationMs }: IToolDetailBodyProps) {
  const { Icon, label, server } = describeTool(tc);
  const params: [string, string | undefined][] = [
    ["server", tc.server],
    ["query", tc.query],
    ["url", tc.url],
    ["file", tc.filePath],
  ];
  const shown = params.filter(([, v]) => !!v);

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-xs text-text">
        <Icon size={13} className="shrink-0" />
        <span className="truncate">{label}</span>
        {server && (
          <span className="shrink-0 rounded bg-surface-2 border border-border px-1 text-[10px] leading-4 text-text-muted">
            {server}
          </span>
        )}
        {tc.status === "running" && (
          <span className="shrink-0 text-[10px] uppercase tracking-wide text-accent animate-pulse">
            running
          </span>
        )}
        {tc.status === "error" && (
          <span className="shrink-0 text-[10px] uppercase tracking-wide text-red-400">
            failed
          </span>
        )}
      </div>
      {shown.length > 0 && (
        <dl className="mt-1.5 space-y-0.5 text-[11px] leading-4">
          {shown.map(([key, value]) => (
            <div key={key} className="flex gap-1.5">
              <dt className="shrink-0 text-text-muted/70">{key}</dt>
              <dd className="text-text-muted break-all min-w-0">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {tc.images && tc.images.length > 0 && (
        <div className="mt-2 flex flex-col gap-2">
          {tc.images.map((src, j) => (
            <img
              key={j}
              src={`data:image/png;base64,${src}`}
              alt={`${label} preview ${j + 1}`}
              className="rounded-md border border-border max-h-48 w-auto self-start"
            />
          ))}
        </div>
      )}
      {tc.results && tc.results.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 border-l-2 border-border pl-2">
          {tc.results.map((r, j) => (
            <li key={j} className="text-[11px] text-text-muted truncate">
              {r.title || r.url}
              {r.url ? <span className="opacity-60"> — {r.url}</span> : null}
            </li>
          ))}
        </ul>
      )}
      {tc.status === "error" && tc.error && (
        <div className="mt-1.5 border-l-2 border-red-400/60 pl-2 text-[11px] text-red-400 break-all">
          {tc.error}
        </div>
      )}
      {durationMs > 0 && (
        <div className="mt-1.5 text-[10px] text-text-muted/70">
          {formatDuration(durationMs)}
        </div>
      )}
    </div>
  );
}
