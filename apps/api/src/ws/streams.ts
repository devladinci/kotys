import type { ServerMessage } from "./protocol.js";

const MAX_BUFFERED_FRAMES = 4000;

type Live = {
  seq: number;
  frames: ServerMessage[];
  abort: AbortController;
  /** Chat the assistant message belongs to; frames fan out to that chat. */
  chatId?: number;
  done: boolean;
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
  });
  return abort;
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

/** Drop every buffered stream — for tests only. */
export function resetStreams(): void {
  streams.clear();
}
