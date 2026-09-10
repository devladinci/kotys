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

export type SearchResultRow = {
  id: number;
  chat_id: number;
  role: string;
  title: string;
  snippet: string;
};
