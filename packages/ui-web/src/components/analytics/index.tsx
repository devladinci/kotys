import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import type { AnalyticsOverview } from "@kotys/contracts";
import type { ToolListing } from "@kotys/contracts";
import { useAppStore, useNow, useRpc } from "@kotys/core";
import { AnalyticsHeader } from "./AnalyticsHeader";
import { ActivityChart } from "./ActivityChart";
import { StatCards } from "./StatCards";
import { Empty, ModelRow, Section, ToolRow } from "./UsageRows";
import { ACTIVITY_DAYS } from "@kotys/contracts";

/** "" = server-less rows from older builds whose server cannot be recovered. */
const mcpServerLabel = (server: string) =>
  server === "" ? "Unknown server (older data)" : server;

export default function AnalyticsPage() {
  const rpc = useRpc();
  const navigate = useNavigate();
  const { chatsVersion } = useAppStore();
  const now = useNow(60_000);
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [roster, setRoster] = useState<ToolListing[]>([]);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const [data, tools] = await Promise.all([
        rpc.analytics.overview(),
        rpc.tools.list(),
      ]);
      setOverview(data);
      setRoster(tools);
      setError(false);
    } catch {
      setError(true);
    }
  }, [rpc]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- initial load of analytics */
    void load();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [load, chatsVersion]);

  const back = () => {
    const { activeChatId } = useAppStore.getState();
    navigate(activeChatId !== null ? `/chat/${activeChatId}` : "/");
  };

  if (error) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center gap-3">
        <p className="text-sm text-text-muted">Could not load analytics.</p>
        <button
          onClick={() => void load()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-2 hover:bg-border text-xs transition"
        >
          <RefreshCw size={13} />
          Retry
        </button>
      </main>
    );
  }

  if (!overview) {
    return (
      <main className="flex-1 flex items-center justify-center text-text-muted">
        <p>Loading…</p>
      </main>
    );
  }

  const builtinTools = overview.tools.filter((t) => t.server === null);
  const mcpTools = overview.tools.filter((t) => t.server !== null);
  const mcpServers = [...new Set(mcpTools.map((t) => t.server!))]
    .sort()
    .map((s) => [s, mcpServerLabel(s)] as const);
  const calledBuiltins = new Set(builtinTools.map((t) => t.tool));
  const unusedBuiltins = roster
    .map((t) => t.name)
    .filter((name) => !calledBuiltins.has(name))
    .sort();

  return (
    <main className="flex-1 flex flex-col min-w-0">
      <AnalyticsHeader onBack={back} onRefresh={() => void load()} />

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
        <div className="max-w-3xl mx-auto p-6 space-y-6">
          <StatCards
            messages={overview.total_messages}
            userMessages={overview.user_messages}
            evalTokens={overview.eval_tokens}
            chats={overview.total_chats}
            toolCalls={overview.tools.reduce((sum, t) => sum + t.calls, 0)}
            distinctTools={overview.tools.length}
          />

          <Section title={`Activity — last ${ACTIVITY_DAYS} days`}>
            <ActivityChart
              data={overview.activity}
              nowSec={Math.floor(now / 1000)}
              days={ACTIVITY_DAYS}
            />
          </Section>

          <Section title="Models" count={overview.models.length}>
            {overview.models.length === 0 ? (
              <Empty>No model usage yet.</Empty>
            ) : (
              <div className="divide-y divide-border -my-1.5">
                {overview.models.map((m) => (
                  <ModelRow
                    key={`${m.provider}-${m.source}-${m.name}`}
                    m={m}
                    max={overview.models[0]!.messages}
                  />
                ))}
              </div>
            )}
          </Section>

          <Section title="Built-in tools" count={builtinTools.length}>
            {builtinTools.length === 0 ? (
              <Empty>No built-in tool calls yet.</Empty>
            ) : (
              <>
                <div className="divide-y divide-border -my-1.5">
                  {builtinTools.map((t) => (
                    <ToolRow key={t.tool} t={t} max={builtinTools[0]!.calls} />
                  ))}
                </div>
                {roster.length > 0 && unusedBuiltins.length > 0 && (
                  <p className="mt-3 pt-3 border-t border-border text-xs text-text-muted">
                    Never called: {unusedBuiltins.join(", ")}
                  </p>
                )}
              </>
            )}
          </Section>

          <Section title="MCP tools" count={mcpTools.length}>
            {mcpServers.length === 0 ? (
              <Empty>No MCP tool calls yet.</Empty>
            ) : (
              <div className="space-y-4">
                {mcpServers.map(([server, label]) => {
                  const rows = mcpTools.filter((t) => t.server === server);
                  return (
                    <div key={server || "unknown"}>
                      <div className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1">
                        {label}
                      </div>
                      <div className="divide-y divide-border -my-1.5">
                        {rows.map((t) => (
                          <ToolRow key={t.tool} t={t} max={rows[0]!.calls} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>
        </div>
      </div>
    </main>
  );
}
