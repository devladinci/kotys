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
}

/**
 * When a chat view remounts (new chat → back), its component-local streaming
 * state is gone but the daemon may still be streaming into this chat. Ask the
 * daemon which stream is live and let the caller re-adopt it; a follow-up
 * check catches a stream that ended between the two answers.
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
    if (candidate === null) return;
    let cancelled = false;
    const probe = async () => {
      try {
        return await rpc.chats.liveStream({ chatId: activeChatId });
      } catch {
        // Daemon unreachable: stay idle; the progress pulses and refresh
        // paths heal the view once the connection returns.
        return null;
      }
    };
    void Promise.resolve().then(async () => {
      const liveId = await probe();
      if (cancelled) return;
      if (liveId !== candidate) {
        // Clear the claim here: a stale entry must not re-probe on the next
        // mount even if the caller's onGone does something else.
        releaseLiveStream(candidate);
        handlersRef.current.onGone(candidate);
        return;
      }
      handlersRef.current.adopt(candidate);
      setTimeout(() => {
        if (cancelled) return;
        void probe().then((still) => {
          if (!cancelled && still !== candidate)
            handlersRef.current.onGone(candidate);
        });
      }, ADOPT_RECHECK_MS);
    });
    return () => {
      cancelled = true;
    };
  }, [activeChatId, rpc]);
}
