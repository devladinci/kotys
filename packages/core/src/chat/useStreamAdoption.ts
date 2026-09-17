import { useEffect, useRef } from "react";
import { getRpc } from "../shared/clients.js";
import { candidateLiveStream, releaseLiveStream } from "./liveStreams.js";
import { getStreamingId } from "./streamState.js";

/** How long after adoption the stream's liveness is re-confirmed. */
const ADOPT_RECHECK_MS = 2000;

export interface StreamAdoptionHandlers {
  adopt: (requestId: number) => void;
  onGone: (requestId: number) => void;
  onForeign: (requestId: number) => void;
  onForeignGone: (requestId: number) => void;
  onNone: () => void;
}

/**
 * When a chat view mounts, ask the daemon which stream is live for this chat.
 * A stream this client started is re-adopted (component-local streaming state
 * died with the previous mount); a stream started elsewhere is adopted as a
 * viewer, so a chat another device is streaming into shows Stop here too.
 */
export function useStreamAdoption(
  activeChatId: number | null,
  handlers: StreamAdoptionHandlers,
): void {
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    if (activeChatId === null) return;
    // getRpc() is a module singleton; reading it here (not in the hook
    // body) keeps an unstable caller-side reference from re-probing on
    // every render — a re-probe can end a stream this client just claimed.
    const rpc = getRpc();
    let cancelled = false;
    const candidate = candidateLiveStream(activeChatId);
    // Probe-departure ground truth: an answer of null is only valid if no
    // busy-marking frame landed while the probe was in flight (a stream
    // the other device started right after this view mounted).
    const busyAtDeparture = getStreamingId(activeChatId);

    // undefined = probe failed (daemon unreachable): keep state, heal later.
    // null = the daemon answered: no live stream for this chat.
    const probe = async (): Promise<number | null | undefined> => {
      try {
        return await rpc.chats.liveStream({ chatId: activeChatId });
      } catch {
        return undefined;
      }
    };

    // While a stream runs (ours after adopt, or another device's), keep
    // confirming it: a done frame lost to a socket drop must not leave a
    // Stop button stuck. A failed probe answers undefined — it proves
    // nothing, so the state stands and the check simply retries.
    const recheck = (liveId: number, onEnd: (id: number) => void) => {
      setTimeout(() => {
        if (cancelled) return;
        void probe().then((still) => {
          if (cancelled) return;
          if (still === undefined || still === liveId) recheck(liveId, onEnd);
          else onEnd(liveId);
        });
      }, ADOPT_RECHECK_MS);
    };

    void Promise.resolve().then(async () => {
      const liveId = await probe();
      if (cancelled) return;
      if (liveId === undefined) return;
      // Re-read the claim: a send that landed while the probe was in flight
      // changed the ground truth, and its own effect cycle (the owner path)
      // manages the state from here — none of the cases below are ours.
      if (candidateLiveStream(activeChatId) !== candidate) return;
      if (liveId === null) {
        if (candidate === null) {
          // A frame marked the chat busy while the probe was in flight:
          // newer ground truth, the null answer is stale.
          if (getStreamingId(activeChatId) !== busyAtDeparture) return;
          handlersRef.current.onNone();
          return;
        }
        // Clear the claim here: a stale entry must not re-probe on the next
        // mount even if the caller's onGone does something else.
        releaseLiveStream(candidate);
        handlersRef.current.onGone(candidate);
        return;
      }
      if (liveId === candidate) {
        handlersRef.current.adopt(candidate);
        recheck(candidate, (id) => handlersRef.current.onGone(id));
        return;
      }
      if (candidate !== null) {
        releaseLiveStream(candidate);
        handlersRef.current.onGone(candidate);
        return;
      }
      handlersRef.current.onForeign(liveId);
      recheck(liveId, (id) => handlersRef.current.onForeignGone(id));
    });
    return () => {
      cancelled = true;
    };
  }, [activeChatId]);
}
