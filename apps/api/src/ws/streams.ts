import type { ServerMessage } from "./protocol.js";

const MAX_BUFFERED_FRAMES = 4000;

type Live = {
  seq: number;
  frames: ServerMessage[];
  abort: AbortController;
  /** Chat the assistant message belongs to; frames fan out to that chat. */
  chatId?: number;
  done: boolean;
  /** Steering texts waiting to enter the turn at the next round boundary. */
  pending: string[];
};

const streams = new Map<number, Live>();

export function beginStream(
  requestId: number,
  chatId?: number,
): AbortController {
  const abort = new AbortController();
  streams.set(requestId, {
    seq: 0,
    frames: [],
    abort,
    chatId,
    done: false,
    pending: [],
  });
  return abort;
}

/** Queue a steering append for a live stream. False if the stream is gone. */
export function queueAppend(requestId: number, content: string): boolean {
  const live = streams.get(requestId);
  if (!live || live.done) return false;
  live.pending.push(content);
  return true;
}

/** Take every queued append for this stream, in order. */
export function drainAppends(requestId: number): string[] {
  const live = streams.get(requestId);
  if (!live || live.pending.length === 0) return [];
  return live.pending.splice(0, live.pending.length);
}

/** Stamps a frame with the next seq and records it for replay. */
export function record(
  requestId: number,
  frame: Omit<Extract<ServerMessage, { seq: number }>, "seq">,
): ServerMessage | null {
  const live = streams.get(requestId);
  if (!live) return null;
  const stamped = { ...frame, seq: ++live.seq } as ServerMessage;
  live.frames.push(stamped);
  // Bounded: a very long reply drops its oldest frames rather than growing
  // without limit. A client that far behind gets a partial replay, which beats
  // an OOM.
  if (live.frames.length > MAX_BUFFERED_FRAMES) live.frames.shift();
  return stamped;
}

export function framesAfter(
  requestId: number,
  lastSeq: number,
): ServerMessage[] {
  const live = streams.get(requestId);
  if (!live) return [];
  return live.frames.filter(
    (f) => "seq" in f && (f as { seq: number }).seq > lastSeq,
  );
}

export function abortStream(requestId: number): void {
  streams.get(requestId)?.abort.abort();
}

export function finishStream(requestId: number): void {
  const live = streams.get(requestId);
  if (!live) return;
  live.done = true;
  // Kept long enough for a phone that was locked mid-stream to wake up and
  // resume the tail — shorter TTLs left such clients with no done frame.
  setTimeout(() => streams.delete(requestId), 10 * 60_000);
}

export function chatIdOf(requestId: number): number | undefined {
  return streams.get(requestId)?.chatId;
}

/** True while the stream is still producing frames (not done, not expired). */
export function isLive(requestId: number): boolean {
  const live = streams.get(requestId);
  return live !== undefined && !live.done;
}

/** A still-running stream for this chat, if any — the remount-adopt query. */
export function liveForChat(chatId: number): number | null {
  for (const [requestId, live] of streams) {
    if (!live.done && live.chatId === chatId) return requestId;
  }
  return null;
}

/** Drop every buffered stream — for tests only. */
export function resetStreams(): void {
  streams.clear();
}
