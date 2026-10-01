import type { ModelListing } from "@kotys/contracts";
import { getChatById } from "@kotys/db";
import { resolveConnector, resolveOllamaConnector } from "../llm/registry.js";

const SUMMARY_TIMEOUT_MS = 3_000;
const SUMMARY_INPUT_MAX_CHARS = 4_000;
const SUMMARY_MAX_TOKENS = 80;
const NOTIFY_PART = /<notify>([\s\S]*?)(?:<\/notify>|$)/;

/** Reached only when the chat row is gone; the app's own default model. */
export const DEFAULT_NOTIFY_MODEL: ModelListing = {
  name: "kimi-k2.7-code",
  capabilities: [],
  contextLength: null,
  source: "cloud",
  provider: "ollama",
};

const PROMPT = `You write the system notification for a chat reply the user has not read yet.
Write in the same language as the reply, at most about 20 words, as one plain sentence. Say what was achieved or what the reply is about — never the first words of the reply, never a greeting.
No markdown, lists, code, links, file paths or emoji. Do not add facts that are not in the reply, and do not mention that this is a summary.
Put the sentence between <notify> and </notify>.`;

const modelForChat = (chatId: number | null): ModelListing => {
  const chat = chatId === null ? null : getChatById(chatId);
  if (!chat?.model) return DEFAULT_NOTIFY_MODEL;

  return {
    name: chat.model,
    capabilities: [],
    contextLength: chat.model_context_length,
    source: chat.model_source ?? "cloud",
    provider: chat.model_provider ?? "ollama",
  };
};

const connectorFor = (model: ModelListing) =>
  model.provider && model.provider !== "ollama"
    ? resolveConnector({ provider: model.provider, model: model.name })
    : resolveOllamaConnector(model.source);

/** The tagged sentence, or null when the model wrote something else instead. */
export async function notificationSummary(
  content: string,
  chatId: number | null,
): Promise<string | null> {
  if (!content.trim()) return null;
  const model = modelForChat(chatId);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("The notification model took too long")),
      SUMMARY_TIMEOUT_MS,
    );
  });

  try {
    const { content: written } = await Promise.race([
      connectorFor(model).chat({
        model: model.name,
        messages: [
          { role: "system", content: PROMPT },
          {
            role: "user",
            content: content.slice(0, SUMMARY_INPUT_MAX_CHARS),
          },
        ],
        temperature: 0,
        maxTokens: SUMMARY_MAX_TOKENS,
        think: false,
      }),
      expired,
    ]);

    return NOTIFY_PART.exec(written)?.[1] ?? null;
  } finally {
    clearTimeout(timer);
  }
}
