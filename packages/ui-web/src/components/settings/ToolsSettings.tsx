import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useRpc } from "@kotys/core";
import type { ToolListing } from "@kotys/contracts";
import {
  CATEGORY_STYLES,
  readEnabledMap,
  TOOLS_ENABLED_SETTING,
} from "./helpers";
import { ToggleSwitch } from "./ToggleSwitch";
import { TOOL_ICONS } from "../chat/toolDisplay";

export function ToolsSettings() {
  const rpc = useRpc();
  const [tools, setTools] = useState<ToolListing[] | null>(null);
  const [enabledMap, setEnabledMap] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    /* eslint-disable react-hooks/set-state-in-effect -- initial load of tools */
    setLoading(true);
    void (async () => {
      const [list, raw] = await Promise.all([
        rpc.tools.list(),
        rpc.settings.get({ key: TOOLS_ENABLED_SETTING }),
      ]);
      if (cancelled) return;
      setTools(list);
      setEnabledMap(readEnabledMap(raw.value));
      setLoading(false);
    })();
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => {
      cancelled = true;
    };
  }, [rpc]);

  const handleToggle = useCallback(
    (name: string, enabled: boolean) => {
      setEnabledMap((prev) => {
        const next = { ...prev, [name]: enabled };
        void rpc.settings.set({
          key: TOOLS_ENABLED_SETTING,
          value: JSON.stringify(next),
        });
        return next;
      });
    },
    [rpc],
  );

  const enabledCount = tools
    ? tools.filter((t) => enabledMap[t.name] !== false).length
    : 0;

  return (
    <div>
      <div className="bg-surface border border-border rounded-xl p-5 mb-4">
        <h2 className="text-base font-semibold mb-1">Tooling</h2>
        <p className="text-xs text-text-muted">
          Built-in tools the model can call during a reply. Disabling a tool
          removes it from the model&apos;s schema for new requests; ongoing
          replies are unaffected. MCP server tools are toggled under Settings →
          MCP Servers.{" "}
          {tools && (
            <span className="text-text">
              {enabledCount}/{tools.length} enabled
            </span>
          )}
        </p>
      </div>

      {loading || tools === null ? (
        <div className="flex items-center gap-2 text-xs text-text-muted py-4">
          <Loader2 size={14} className="animate-spin" />
          <span>Loading tools…</span>
        </div>
      ) : (
        <ul className="space-y-2">
          {tools.map((t) => {
            const enabled = enabledMap[t.name] !== false;
            const Icon = TOOL_ICONS[t.name];
            return (
              <li
                key={t.name}
                className={`flex items-start gap-3 px-4 py-3 bg-surface border border-border rounded-xl transition-opacity ${
                  enabled ? "" : "opacity-80"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {Icon && (
                      <Icon
                        size={15}
                        className="shrink-0 text-text-muted"
                        aria-hidden
                      />
                    )}
                    <span className="text-sm truncate font-medium">
                      {t.name}
                    </span>
                    {t.category && (
                      <span
                        className={`shrink-0 text-[10px] uppercase font-medium px-1.5 py-0.5 rounded border ${CATEGORY_STYLES[t.category] ?? ""}`}
                      >
                        {t.category}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-text-muted leading-snug mt-0.5 line-clamp-2">
                    {t.description}
                  </div>
                </div>
                <ToggleSwitch
                  enabled={enabled}
                  label={`Toggle ${t.name}`}
                  onChange={(next) => handleToggle(t.name, next)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
