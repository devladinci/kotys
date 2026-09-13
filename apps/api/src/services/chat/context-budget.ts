import { IMAGE_TOKENS } from "@kotys/contracts";

/**
 * One module owns the token accounting vocabulary: how a request's prompt size
 * is estimated, how a turn's usage is classified (measured by the provider vs
 * estimated), and how compact failures are rate-limited. The compact trigger
 * itself lives in context.ts; this is its shared vocabulary.
 */

/** Why the token accounting module surfaced an event. */
export type TokenAccountingKind = "compact-failed" | "estimate-fallback";

export type TokenAccountingEvent = {
  kind: TokenAccountingKind;
  chatId?: number;
  detail?: string;
  at?: number;
};

/** Ring buffer, so a chatty failure cannot grow the process without bound. */
const LOG_LIMIT = 50;

const log: TokenAccountingEvent[] = [];

const listeners = new Set<(e: TokenAccountingEvent) => void>();

export function onTokenAccountingEvent(
  cb: (e: TokenAccountingEvent) => void,
): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function logTokenAccounting(
  kind: TokenAccountingKind,
  e: Omit<TokenAccountingEvent, "kind"> = {},
): void {
  const stamped = { ...e, kind, at: e.at ?? Date.now() };
  log.push(stamped);
  if (log.length > LOG_LIMIT) log.shift();
  for (const cb of listeners) {
    try {
      cb(stamped);
    } catch {
      // A broken UI hook must not break streaming.
    }
  }
}

export function getTokenAccountingLog(): TokenAccountingEvent[] {
  return [...log];
}

export function clearTokenAccountingLog(): void {
  log.length = 0;
  lastCompactFailureAt.clear();
}

/**
 * Once per chat per window a compact failure is worth a warning; repeats add
 * log lines but no new information.
 */
export const COMPACT_FAILURE_SUPPRESS_MS = 5 * 60_000;

const lastCompactFailureAt = new Map<number, number>();

/**
 * Records a compact failure for chatId, rate-limited per chat. Returns false
 * when the failure happened while a previous one is still being suppressed.
 */
export function recordCompactFailure(
  chatId: number,
  detail: string,
  now = Date.now(),
): boolean {
  const last = lastCompactFailureAt.get(chatId) ?? 0;
  lastCompactFailureAt.set(chatId, now);
  if (now - last < COMPACT_FAILURE_SUPPRESS_MS) return false;
  logTokenAccounting("compact-failed", { chatId, detail });
  return true;
}

/** A request as the connectors will serialize it, in estimate order. */
export type PromptMessageLike = {
  role: string;
  content?: string;
  images?: string[];
  toolResults?: { toolName: string; content: string }[];
};

/**
 * chars/4 over everything the request would carry. The provider's measured
 * count always wins when available; this is the floor, not a stand-in.
 */
export function estimatePromptFromMessages(
  messages: PromptMessageLike[],
): number {
  let chars = 0;
  for (const m of messages) {
    chars += (m.content ?? "").length;
    chars += (m.images?.length ?? 0) * (IMAGE_TOKENS * 4);
    for (const r of m.toolResults ?? []) chars += r.content.length;
  }
  return Math.max(0, Math.round(chars / 4));
}

/**
 * Classifies a turn's usage before anything persists it: true means the
 * provider counted this turn itself; false means the number is a chars/4
 * guess and must never anchor the compact trigger or the client meter.
 */
export function recordTurnUsage(usage: {
  promptTokens: number;
  evalTokens: number;
  estimate?: number;
}): { promptTokens: number; evalTokens: number; tokensMeasured: boolean } {
  const measured = usage.promptTokens > 0;
  if (usage.promptTokens < 0) usage.promptTokens = 0;
  if (usage.evalTokens < 0) usage.evalTokens = 0;
  const promptTokens = measured
    ? usage.promptTokens
    : Math.max(0, usage.estimate ?? 0);
  return {
    promptTokens,
    evalTokens: usage.evalTokens,
    tokensMeasured: measured,
  };
}

/**
 * Whether a context overflow auto-compact may run for this chat right now.
 * Only a *failed* compact blocks retries: a failure (provider down, window
 * too small for a summary call) used to retry on every message — the loop
 * behind "auto compact is broken" — while a success that still leaves the
 * chat over the window must be allowed to run again immediately.
 */
export const COMPACT_RETRY_COOLDOWN_MS = 60_000;

export function shouldAttemptCompact(
  chatId: number,
  now = Date.now(),
): boolean {
  const last = lastCompactFailureAt.get(chatId) ?? 0;
  return now - last >= COMPACT_RETRY_COOLDOWN_MS;
}
