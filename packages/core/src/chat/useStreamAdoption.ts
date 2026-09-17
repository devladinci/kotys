import { useEffect, useRef } from "react";
import { getRpc } from "../shared/clients.js";
import { candidateLiveStream, releaseLiveStream } from "./liveStreams.js";

/** How long after adoption the stream's liveness is re-confirmed. */
const ADOPT_RECHECK_MS = 2000;

export interface StreamAdoptionHandlers {
  /** Resume owning the stream: restore busy/streaming state. */
  adopt: (requestId: number) => void;
  /**
   * The daemon reports the stream gone (finished, aborted, or restarted
   * while the view was unmounted): drop any registry claim and refresh.
   */
  onGone: (requestId: number) => void;
  /** A stream another client started is live: adopt it as a viewer. */
  onForeign: (requestId: number) => void;
  /**
   * The viewer-adopted stream is no longer live (done/error frame lost, or
   * the stream died between frames): clear the viewer state.
   */
  onForeignGone: (requestId: number) => void;
  /** No live stream for this chat: drop any stale viewer state. */
  onNone: () => void;
}

/**
 * When a chat view mounts, ask the daemon which stream is live for this chat.
 * A stream this client started is re-adopted (component-local streaming state
 * died with the previous mount); a stream started elsewhere is adopted as a
 * viewer, so a chat another device is streaming into shows Stop here too.
 * Follow-up checks catch a stream that ended between two answers.
 */
export function useStreamAdoption(
  activeChatId: number | null,
  handlers: StreamAdoptionHandlers,
): void {
  const rpc = getRpc();
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    if (activeChatId === null) return;
    const candidate = candidateLiveStream(activeChatId);
    let cancelled = false;
    // undefined = probe failed (daemon unreachable): keep state, heal later.
    // null = the daemon answered: no live stream for this chat.
    const probe = async (): Promise<number | null | undefined> => {
      try {
        return await rpc.chats.liveStream({ chatId: activeChatId });
      } catch {
        return undefined;
      }
    };

    // While the foreign stream runs, keep confirming it: a done frame lost
    // to a socket drop must not leave the viewer stuck on Stop.
    const recheckForeign = (liveId: number) => {
      setTimeout(() => {
        if (cancelled) return;
        void probe().then((still) => {
          if (cancelled) return;
          if (still === liveId) recheckForeign(liveId);
          else handlersRef.current.onForeignGone(liveId);
        });
      }, ADOPT_RECHECK_MS);
    };

    void Promise.resolve().then(async () => {
      const liveId = await probe();
      if (cancelled) return;
      if (liveId === undefined) return;
      if (liveId === null) {
        if (candidate === null) {
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
        setTimeout(() => {
          if (cancelled) return;
          void probe().then((still) => {
            if (!cancelled && still !== candidate)
              handlersRef.current.onGone(candidate);
          });
        }, ADOPT_RECHECK_MS);
        return;
      }
      if (candidate !== null) {
        releaseLiveStream(candidate);
        handlersRef.current.onGone(candidate);
        return;
      }
      handlersRef.current.onForeign(liveId);
      recheckForeign(liveId);
    });
    return () => {
      cancelled = true;
    };
  }, [activeChatId, rpc]);
}
