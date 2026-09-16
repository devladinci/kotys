import type { QueuedMessage } from "./queueStore.js";

export type SteerState = "injecting" | "ready" | "unavailable";

export const QUEUE_LABELS = {
  images: "(images)",
  inject: "Inject into the running reply",
  injecting: "Injecting",
  remove: "Remove queued message",
} as const;

export function steerStateOf(
  item: QueuedMessage,
  streamingId: number | null,
): SteerState {
  if (streamingId === null) return "unavailable";
  if (item.steer?.requestId === streamingId) return "injecting";
  // An append carries text only; a message with images waits its turn.
  if (item.images.length > 0 || !item.text.trim()) return "unavailable";
  return "ready";
}

export function queueCaption(isStreaming: boolean, count: number): string {
  if (isStreaming) {
    return "Queued — inject to steer this reply, or it sends when the reply finishes";
  }
  return `${count} queued — sends when the reply finishes`;
}
