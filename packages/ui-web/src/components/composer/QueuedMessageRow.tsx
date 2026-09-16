import { CornerDownRight, Loader2, X } from "lucide-react";
import { QUEUE_LABELS, steerStateOf } from "@kotys/core";
import type { QueuedMessage } from "@kotys/core";

interface IProps {
  message: QueuedMessage;
  streamingId: number | null;
  onDequeue: (id: number) => void;
  onSteer?: (id: number) => void;
}

export function QueuedMessageRow({
  message,
  streamingId,
  onDequeue,
  onSteer,
}: IProps) {
  const steerState = steerStateOf(message, streamingId);

  const handleSteer = () => onSteer?.(message.id);

  const handleDequeue = () => onDequeue(message.id);

  return (
    <div className="group flex items-center gap-2 px-2 py-1 rounded-lg bg-surface-2 border border-border text-xs">
      <span className="flex-1 min-w-0 truncate text-text-muted">
        {message.text || QUEUE_LABELS.images}
      </span>
      {/* Offered to the reply: it can no longer be taken back. */}
      {steerState === "injecting" ? (
        <span
          className="shrink-0 flex items-center gap-1 text-[11px] text-text-muted"
          title="Reaches the model at its next step. If the reply ends first, it is sent as a new message."
        >
          <Loader2 size={11} className="animate-spin" aria-hidden="true" />
          {QUEUE_LABELS.injecting}
        </span>
      ) : (
        <>
          {steerState === "ready" && onSteer && (
            <button
              onClick={handleSteer}
              aria-label={QUEUE_LABELS.inject}
              title="Inject into this reply at its next step"
              className="shrink-0 p-0.5 rounded text-text-muted hover:text-text transition"
            >
              <CornerDownRight size={12} />
            </button>
          )}
          <button
            onClick={handleDequeue}
            aria-label={QUEUE_LABELS.remove}
            className="shrink-0 p-0.5 rounded text-text-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-red-400 transition"
          >
            <X size={12} />
          </button>
        </>
      )}
    </div>
  );
}
