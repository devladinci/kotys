/** A chat as it comes off the `chats` table. */
export type ChatRow = {
  id: number;
  title: string;
  model: string;
  model_context_length: number | null;
  model_capabilities: string | null;
  model_info: string | null;
  created_at: number;
  updated_at: number;
  summary: string | null;
  summary_upto: number | null;
};

/**
 * Marker the server and clients write into an assistant row's content when a
 * turn fails. Bubbles detect failed turns by this marker (Retry affordance);
 * retry wipes the row, so it never reaches the model as history.
 */
export const ERROR_TURN_PREFIX = "**Error:**";

/** True when an assistant message's content marks a failed turn. */
export const isErrorTurn = (content: string): boolean =>
  content.includes(ERROR_TURN_PREFIX);

export type SearchResultRow = {
  id: number;
  chat_id: number;
  role: string;
  title: string;
  snippet: string;
};
