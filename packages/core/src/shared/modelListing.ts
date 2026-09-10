import type { ModelListing } from "@kotys/contracts";

/** A chat row as returned by the RPC chats.list endpoint. */
export type ChatRow = {
  id: number;
  title: string;
  summary: string | null;
  summary_upto: number | null;
  /** Comma-joined topic names, or null when the chat has none. */
  topics_blob: string | null;
  created_at: number;
  updated_at: number;
  model_name: string | null;
  model_provider: string | null;
  model_source: "cloud" | "local" | null;
  model_host: string | null;
  model_context_length: number | null;
  model_capabilities: string | null;
};

export type Chat = ChatRow & {
  topics: string[];
  llmModel: ModelListing;
};

function modelOf(r: ChatRow): ModelListing {
  return {
    name: r.model_name ?? "",
    provider: r.model_provider ?? "ollama",
    source: r.model_source ?? "cloud",
    ...(r.model_host ? { host: r.model_host } : {}),
    contextLength: r.model_context_length,
    capabilities: r.model_capabilities
      ? (JSON.parse(r.model_capabilities) as string[])
      : [],
  };
}

export function rowToChat(r: ChatRow): Chat {
  return {
    ...r,
    summary: r.summary ?? null,
    summary_upto: r.summary_upto ?? null,
    topics: (r.topics_blob ?? "").split("\u001e").filter(Boolean),
    llmModel: modelOf(r),
  };
}
