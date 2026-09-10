import { useMemo } from "react";
import {
  contextPct,
  DEFAULT_CONTEXT,
  estimateTokens,
  projectContextTokens,
} from "@kotys/contracts";

export type TokenizedMessage = {
  id: number;
  role: "user" | "assistant" | "system";
  content: string;
  promptTokens?: number;
  evalTokens?: number;
};

/**
 * Context size as the next send would assemble it, by the same rule the server
 * uses to decide when to compact — or the meter says one thing while the server
 * does another. The provider's measurement leads; that turn's own reply and
 * what followed are estimated. Turns that never reported usage are skipped, and
 * a measurement from before the summary boundary is ignored.
 */
export function projectedUsedTokens(
  msgs: TokenizedMessage[],
  opts?: { summary?: string | null; summaryUpto?: number | null },
): number {
  const upto = opts?.summaryUpto ?? 0;
  const live = msgs.filter((m) => m.role !== "system" && m.id > upto);
  let anchor = -1;
  for (let i = live.length - 1; i >= 0; i--) {
    if (live[i].role === "assistant" && live[i].promptTokens) {
      anchor = i;
      break;
    }
  }
  const since = anchor === -1 ? live : live.slice(anchor);
  return projectContextTokens({
    measured: anchor === -1 ? 0 : (live[anchor].promptTokens ?? 0),
    estimated: since.reduce((n, m) => n + estimateTokens(m.content), 0),
    // Misses the system block, which the client cannot see.
    fallback: estimateTokens(opts?.summary ?? ""),
  });
}

export function useTokenEstimator(
  messages: TokenizedMessage[],
  contextLength: number | null,
  opts?: { summary?: string | null; summaryUpto?: number | null },
) {
  const { summary, summaryUpto } = opts ?? {};
  const used = useMemo(
    () => projectedUsedTokens(messages, { summary, summaryUpto }),
    [messages, summary, summaryUpto],
  );
  const ctx = contextLength ?? DEFAULT_CONTEXT;
  return { used, ctx, pct: contextPct(used, ctx) };
}
