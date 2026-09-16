import { getDb } from "./client.js";
import type {
  ActivityDayRow,
  AnalyticsOverview,
  ModelUsageRow,
  ToolUsageRow,
} from "@kotys/contracts";

export type { ActivityDayRow, AnalyticsOverview, ModelUsageRow, ToolUsageRow };

const ACTIVITY_DAYS = 30;

export const activityDays = (
  rows: { created_at: number; messages: number; tokens: number }[],
): ActivityDayRow[] => {
  const byDay = new Map<number, { messages: number; tokens: number }>();
  for (const row of rows) {
    const day = localDayStart(row.created_at);
    const acc = byDay.get(day) ?? { messages: 0, tokens: 0 };
    acc.messages += row.messages;
    acc.tokens += row.tokens;
    byDay.set(day, acc);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a - b)
    .map(([day, acc]) => ({ day, ...acc }));
};

const localDayStart = (epochSec: number): number => {
  const d = new Date(epochSec * 1000);
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
};

const TOOL_USAGE_SQL = `
  SELECT
    je.value ->> 'tool' AS tool,
    je.value ->> 'server' AS server,
    COUNT(*) AS calls,
    SUM(CASE WHEN je.value ->> 'status' = 'error' THEN 1 ELSE 0 END) AS errors,
    COALESCE(SUM(je.value ->> 'durationMs'), 0) AS total_ms
  FROM messages m, json_each(m.tool_calls) je
  WHERE m.tool_calls IS NOT NULL AND m.tool_calls != '[]'
    AND COALESCE(je.value ->> '$.widget.kind', '') <> 'steer'
  GROUP BY tool, server`;

function normalizeToolRows(
  rows: unknown[],
  builtinNames: ReadonlySet<string>,
): ToolUsageRow[] {
  const merged = new Map<string, ToolUsageRow>();
  for (const raw of rows) {
    const r = raw as {
      tool: string;
      server: string | null;
      calls: number;
      errors: number;
      total_ms: number;
    };
    const mcp =
      (r.server != null && r.server !== "") || !builtinNames.has(r.tool);
    const server = mcp ? r.server || "" : null;
    const key = server ? `${server}::${r.tool}` : r.tool;
    const existing = merged.get(key);
    if (existing) {
      existing.calls += r.calls;
      existing.errors += r.errors;
      existing.total_ms += r.total_ms;
      continue;
    }
    merged.set(key, {
      tool: r.tool,
      server,
      calls: r.calls,
      errors: r.errors,
      total_ms: r.total_ms,
    });
  }
  return [...merged.values()].sort((a, b) => b.calls - a.calls);
}

export function getAnalyticsOverview(
  builtinToolNames: Iterable<string> = [],
): AnalyticsOverview {
  const db = getDb();

  const totals = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM chats) AS total_chats,
         (SELECT COUNT(*) FROM messages) AS total_messages,
         (SELECT COUNT(*) FROM messages WHERE role = 'user') AS user_messages,
         (SELECT COALESCE(SUM(eval_tokens), 0) FROM messages WHERE role = 'assistant')
           AS eval_tokens`,
    )
    .get() as {
    total_chats: number;
    total_messages: number;
    user_messages: number;
    eval_tokens: number;
  };

  const models = db
    .prepare(
      `SELECT mo.name, mo.provider, mo.source,
              COUNT(*) AS messages,
              COALESCE(SUM(m.prompt_tokens), 0) AS prompt_tokens,
              COALESCE(SUM(m.eval_tokens), 0) AS eval_tokens,
              MAX(m.created_at) AS last_used_at
       FROM messages m
       JOIN models mo ON mo.id = m.model_id
       WHERE m.role = 'assistant'
       GROUP BY m.model_id
       ORDER BY messages DESC`,
    )
    .all() as ModelUsageRow[];

  const toolRows = db.prepare(TOOL_USAGE_SQL).all();
  const tools = normalizeToolRows(toolRows, new Set(builtinToolNames));

  const rawActivity = db
    .prepare(
      `SELECT COUNT(*) AS messages,
              COALESCE(SUM(COALESCE(eval_tokens, 0)), 0) AS tokens,
              created_at
       FROM messages
       WHERE created_at >= unixepoch() - ? * 86400
       GROUP BY created_at ORDER BY created_at ASC`,
    )
    .all(ACTIVITY_DAYS) as {
    created_at: number;
    messages: number;
    tokens: number;
  }[];
  const activity = activityDays(rawActivity);

  return { ...totals, models, tools, activity };
}
