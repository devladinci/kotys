import type { SteerAppend } from "@kotys/contracts";
import type { ServerMessage } from "./protocol.js";

const MAX_BUFFERED_FRAMES = 4000;

type Live = {
  seq: number;
  frames: ServerMessage[];
  abort: AbortController;
  chatId?: number;
  done: boolean;
  pending: SteerAppend[];
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

export function queueAppend(requestId: number, append: SteerAppend): boolean {
  const live = streams.get(requestId);
  if (!live || live.done) return false;
  live.pending.push(append);
  return true;
}

export function drainAppends(requestId: number): SteerAppend[] {
  const live = streams.get(requestId);
  if (!live || live.pending.length === 0) return [];
  return live.pending.splice(0, live.pending.length);
}

export function record(
  requestId: number,
  frame: Omit<Extract<ServerMessage, { seq: number }>, "seq">,
): ServerMessage | null {
  const live = streams.get(requestId);
  if (!live) return null;
  const stamped = { ...frame, seq: ++live.seq } as ServerMessage;
  live.frames.push(stamped);
  // A client this far behind gets a partial replay, which beats an OOM.
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
  // Long enough for a phone locked mid-stream to wake up and resume the tail.
  // A retry reuses the id, so only this stream's own entry may go.
  setTimeout(() => {
    if (streams.get(requestId) === live) streams.delete(requestId);
  }, 10 * 60_000);
}

export function chatIdOf(requestId: number): number | undefined {
  return streams.get(requestId)?.chatId;
}

export function isLive(requestId: number): boolean {
  const live = streams.get(requestId);
  return live !== undefined && !live.done;
}

export function liveForChat(chatId: number): number | null {
  for (const [requestId, live] of streams) {
    if (!live.done && live.chatId === chatId) return requestId;
  }
  return null;
}

/** For tests only. */
export function resetStreams(): void {
  streams.clear();
}
