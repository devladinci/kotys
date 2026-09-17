import { ChevronRight, Trash2 } from "lucide-react";
import type { McpServerInfo } from "@kotys/contracts";
import { ToggleSwitch } from "../ToggleSwitch";
import type { McpConfigEntry } from "./mcpConfig";

const STATUS_STYLES: Record<McpServerInfo["status"], string> = {
  connected: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  disconnected: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  error: "bg-red-500/15 text-red-400 border-red-500/30",
};

interface IProps {
  name: string;
  entry: McpConfigEntry;
  info?: McpServerInfo;
  enabledMap: Record<string, boolean>;
  isReconnecting: boolean;
  onEdit: (name: string) => void;
  onRemove: (name: string) => void;
  onToggleTool: (toolName: string, enabled: boolean) => void;
}

export function McpServerRow({
  name,
  entry,
  info,
  enabledMap,
  isReconnecting,
  onEdit,
  onRemove,
  onToggleTool,
}: IProps) {
  const status = info?.status ?? "disconnected";
  const tools = info?.tools ?? [];
  const enabledCount = tools.filter((t) => enabledMap[t.name] !== false).length;

  const handleEdit = () => onEdit(name);

  const handleRemove = () => onRemove(name);

  return (
    <li className="px-4 py-3 bg-surface border border-border rounded-xl">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm truncate font-medium">{name}</span>
            <span
              className={`shrink-0 text-[10px] uppercase font-medium px-1.5 py-0.5 rounded border ${STATUS_STYLES[status]}`}
            >
              {status}
            </span>
          </div>
          <div className="text-[11px] text-text-muted leading-snug mt-0.5 truncate">
            {entry.type === "http"
              ? `${entry.url}${entry.clientId ? " (OAuth)" : ""}`
              : `${entry.command} ${entry.args.join(" ")}`}
          </div>
          {info?.error && (
            <div className="text-[11px] text-red-500 leading-snug mt-0.5">
              {info.error}
            </div>
          )}
          {tools.length > 0 && (
            <details className="mt-1.5 group">
              <summary className="cursor-pointer text-[11px] text-text-muted hover:text-text transition select-none flex items-center gap-1">
                <ChevronRight
                  size={10}
                  className="transition-transform group-open:rotate-90 shrink-0"
                />
                {enabledCount}/{tools.length} tools enabled
              </summary>
              <ul className="mt-1.5 space-y-1.5 pl-3 border-l border-border max-h-48 overflow-y-auto scrollbar-thin">
                {tools.map((t) => (
                  <li
                    key={t.name}
                    className="text-[11px] leading-snug flex items-start gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-text font-mono truncate">
                        {t.name}
                      </div>
                      {t.description && (
                        <div className="text-text-muted mt-0.5 line-clamp-2">
                          {t.description}
                        </div>
                      )}
                    </div>
                    <ToggleSwitch
                      size="sm"
                      enabled={enabledMap[t.name] !== false}
                      label={`Toggle ${t.name}`}
                      onChange={(next) => onToggleTool(t.name, next)}
                    />
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={handleEdit}
            aria-label={`Edit ${name}`}
            className="px-2 py-1 rounded text-xs text-text-muted hover:text-text hover:bg-surface-2 transition"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={handleRemove}
            disabled={isReconnecting}
            aria-label={`Remove ${name}`}
            className="p-1 rounded text-text-muted hover:text-red-500 hover:bg-surface-2 transition disabled:opacity-50"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </li>
  );
}
