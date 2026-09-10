import type { ToolActivity } from "@kotys/contracts";

/**
 * Accumulates stream deltas and hands them to the caller's flush callback
 * as an immutable snapshot on a fixed cadence. Without this, a setState per
 * chunk (30-60/s) re-renders the whole message list — unusable on mobile,
 * where every bubble re-parses markdown.
 */
export type ChunkDeltas = { content: string; thinking: string };

export type ToolDelta = [index: number, activity: ToolActivity];

export class StreamCollector<K, D> {
  private pending = new Map<K, D>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly intervalMs: number;
  private readonly merge: (existing: D | undefined, incoming: D) => D;
  private readonly flush: (snapshot: Map<K, D>) => void;

  constructor(
    intervalMs: number,
    merge: (existing: D | undefined, incoming: D) => D,
    flush: (snapshot: Map<K, D>) => void,
  ) {
    this.intervalMs = intervalMs;
    this.merge = merge;
    this.flush = flush;
  }

  add(key: K, delta: D): void {
    this.pending.set(key, this.merge(this.pending.get(key), delta));
    if (this.timer === null) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.flushNow();
      }, this.intervalMs);
    }
  }

  discard(key: K): void {
    this.pending.delete(key);
  }

  /** Flush pending deltas now and cancel the scheduled run. */
  flushNow(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.pending.size === 0) return;
    const snapshot = new Map(this.pending);
    this.pending.clear();
    this.flush(snapshot);
  }

  dispose(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.pending.clear();
  }
}

export const mergeChunks = (
  existing: ChunkDeltas | undefined,
  incoming: ChunkDeltas,
): ChunkDeltas =>
  existing
    ? {
        content: existing.content + incoming.content,
        thinking: existing.thinking + incoming.thinking,
      }
    : incoming;

export const mergeTools = (
  existing: ToolDelta[] | undefined,
  incoming: ToolDelta[],
): ToolDelta[] => [...(existing ?? []), ...incoming];
