export const TOOLS_ENABLED_SETTING = "tools_enabled";

export function readEnabledMap(raw: string | null): Record<string, boolean> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, boolean>;
    }
  } catch {
    // corrupt setting — treat as all-default
  }
  return {};
}

export const formatBytes = (bytes: number): string => {
  if (bytes <= 0) return "0 MB";
  const mb = bytes / 1024 / 1024;
  if (mb < 1024) return `${mb.toFixed(0)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
};

export const formatExpires = (iso: string | null): string => {
  if (!iso) return "—";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "expiring";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
};

export const CATEGORY_STYLES: Record<string, string> = {
  read: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  write: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  search: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  web: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  chat: "bg-pink-500/15 text-pink-400 border-pink-500/30",
  memory: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  system: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  media: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  task: "bg-teal-500/15 text-teal-400 border-teal-500/30",
};
