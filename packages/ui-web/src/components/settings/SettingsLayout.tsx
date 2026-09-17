import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Cpu,
  Plug,
  Brain,
  Wrench,
  Timer,
  Mic,
  Zap,
} from "lucide-react";
import { useAppStore, useRpc, getSocket } from "@kotys/core";

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

const isEditable = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

const RAIL_ITEMS = [
  { to: "/settings", label: "General", Icon: Cpu, end: true },
  { to: "/settings/tools", label: "Tooling", Icon: Wrench, end: false },
  { to: "/settings/mcp", label: "MCP Servers", Icon: Plug, end: false },
  { to: "/settings/skills", label: "Skills", Icon: Zap, end: false },
  { to: "/settings/memory", label: "Memory", Icon: Brain, end: false },
  { to: "/settings/pomodoro", label: "Pomodoro", Icon: Timer, end: false },
  { to: "/settings/voice", label: "Voice", Icon: Mic, end: false },
] as const;

export function SettingsLayout() {
  const navigate = useNavigate();
  const { activeChatId } = useAppStore();
  const rpc = useRpc();
  const panelRef = useRef<HTMLDivElement>(null);
  const [memoryCount, setMemoryCount] = useState<number | null>(null);
  const [mcpConnectedCount, setMcpConnectedCount] = useState<number | null>(
    null,
  );
  const [skillCount, setSkillCount] = useState<number | null>(null);

  const refreshMcpCount = useCallback(async () => {
    try {
      const list = await rpc.mcp.servers();
      setMcpConnectedCount(list.filter((s) => s.status === "connected").length);
    } catch {
      setMcpConnectedCount(0);
    }
  }, [rpc]);

  const refreshMemoryCount = useCallback(async () => {
    try {
      const list = await rpc.memories.list();
      setMemoryCount(list.length);
    } catch {
      setMemoryCount(0);
    }
  }, [rpc]);

  const refreshSkillCount = useCallback(async () => {
    try {
      const list = await rpc.skills.list();
      setSkillCount(list.filter((s) => s.enabled).length);
    } catch {
      setSkillCount(0);
    }
  }, [rpc]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- refresh counts on mount */
    void refreshMcpCount();
    void refreshMemoryCount();
    void refreshSkillCount();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [refreshMcpCount, refreshMemoryCount, refreshSkillCount]);

  // Skills change on disk (editor, manual edits) — re-fetch the rail count.
  useEffect(() => {
    return getSocket().on((msg) => {
      if (msg.type === "skills:changed") void refreshSkillCount();
    });
  }, [refreshSkillCount]);

  const handleClose = useCallback(() => {
    if (activeChatId !== null) navigate(`/chat/${activeChatId}`);
    else navigate("/");
  }, [navigate, activeChatId]);

  const outletContext = useMemo(
    () => ({ refreshMcpCount, refreshMemoryCount }),
    [refreshMcpCount, refreshMemoryCount],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (e.defaultPrevented || isEditable(e.target)) return;
        e.preventDefault();
        handleClose();
        return;
      }
      if (e.key === "Tab" && panelRef.current) {
        const nodes = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
        if (nodes.length === 0) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const prevActive = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      prevActive?.focus?.();
    };
  }, [handleClose]);

  return (
    <main className="flex-1 flex flex-col min-w-0">
      <header className="app-drag pt-10 px-6 pb-3 border-b border-border bg-surface flex items-center gap-3 flex-shrink-0">
        <button
          onClick={handleClose}
          aria-label="Back to chat"
          title="Back to chat (Esc)"
          className="app-no-drag flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-2 hover:bg-border text-xs transition"
        >
          <ArrowLeft size={14} />
          Back
        </button>
        <h1 className="flex-1 min-w-0 text-sm font-semibold truncate">
          Settings
        </h1>
      </header>
      <div ref={panelRef} className="flex-1 min-h-0 flex overflow-hidden">
        <nav
          aria-label="Settings sections"
          className="w-48 flex-shrink-0 border-r border-border bg-surface p-2 space-y-0.5 overflow-y-auto scrollbar-thin"
        >
          {RAIL_ITEMS.map(({ to, label, Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition ${
                  isActive
                    ? "bg-surface-2 text-text font-medium"
                    : "text-text-muted hover:text-text hover:bg-surface-2/50"
                }`
              }
            >
              <Icon size={15} className="shrink-0" />
              <span className="flex-1 min-w-0 truncate">{label}</span>
              {to === "/settings/mcp" && mcpConnectedCount !== null && (
                <span className="text-[10px] text-text-muted">
                  {mcpConnectedCount}
                </span>
              )}
              {to === "/settings/memory" && memoryCount !== null && (
                <span className="text-[10px] text-text-muted">
                  {memoryCount}
                </span>
              )}
              {to === "/settings/skills" && skillCount !== null && (
                <span className="text-[10px] text-text-muted">
                  {skillCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="flex-1 min-w-0 overflow-y-auto scrollbar-thin bg-bg">
          <div className="max-w-2xl mx-auto p-6 space-y-4">
            <Outlet context={outletContext} />
          </div>
        </div>
      </div>
    </main>
  );
}
