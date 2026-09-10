import { z } from "zod";
import { getSetting } from "@kotys/db";
import { OLLAMA_CLOUD_HOST, OLLAMA_LOCAL_HOST } from "@kotys/contracts";
import {
  chatOllama,
  loadModel,
  listRunningModels,
  unloadModel,
} from "../services/ollamaModels.js";
import { resolveConnector } from "../services/llm/registry.js";
import { pub } from "./base.js";

const chatMessageSchema = z.object({
  role: z.string(),
  content: z.string(),
});

const chatInputSchema = z.object({
  model: z.string(),
  // A source, never a URL: the host the key is sent to must not be
  // caller-chosen, or an authenticated client could exfiltrate the key.
  source: z.enum(["cloud", "local"]).optional(),
  // Owning provider; omitted means Ollama (legacy clients).
  provider: z.string().optional(),
  messages: z.array(chatMessageSchema),
  num_predict: z.number().optional(),
  temperature: z.number().optional(),
  seed: z.number().optional(),
  think: z.boolean().optional(),
  format: z.record(z.string(), z.unknown()).optional(),
});

export const ollamaRouter = {
  running: pub.handler(async () => listRunningModels()),

  load: pub
    .input(z.object({ model: z.string() }))
    .handler(async ({ input }) => {
      await loadModel(input.model);
      return { ok: true as const };
    }),

  unload: pub
    .input(z.object({ model: z.string() }))
    .handler(async ({ input }) => {
      await unloadModel(input.model);
      return { ok: true as const };
    }),

  /** Non-streaming completion, for title/topic/summary inference. */
  chat: pub.input(chatInputSchema).handler(async ({ input }) => {
    // Non-Ollama providers are served by their connector (one facade, see
    // services/llm); the think flag is the provider-neutral control and the
    // connector maps it to the provider's own wire format.
    if (input.provider && input.provider !== "ollama") {
      const connector = resolveConnector({
        provider: input.provider,
        model: input.model,
      });
      const response = await connector.chat({
        model: input.model,
        messages: input.messages,
        ...(input.temperature !== undefined
          ? { temperature: input.temperature }
          : {}),
        ...(input.seed !== undefined ? { seed: input.seed } : {}),
        ...(input.num_predict !== undefined
          ? { maxTokens: input.num_predict }
          : {}),
        ...(input.think !== undefined ? { think: input.think } : {}),
      });
      return response.content;
    }
    const apiKey = getSetting("api_key") ?? "";
    const host =
      input.source === "local" ? OLLAMA_LOCAL_HOST : OLLAMA_CLOUD_HOST;
    return chatOllama(host, apiKey, input.model, input.messages, {
      num_predict: input.num_predict,
      temperature: input.temperature,
      seed: input.seed,
      think: input.think,
      format: input.format,
    });
  }),
};
