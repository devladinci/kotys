import { Ollama } from "ollama";
import type { ModelListing, ModelRef } from "@kotys/contracts";
import {
  LOCAL_CONTEXT,
  OLLAMA_CLOUD_HOST,
  OLLAMA_LOCAL_HOST,
} from "@kotys/contracts";
import type {
  ConnectorChatMessage,
  ConnectorChatRequest,
  ConnectorUsage,
  LlmConnector,
} from "./types.js";
import { asBase64Images } from "@kotys/contracts";

export type OllamaHost = "cloud" | "local";

const hostForSource = (host: OllamaHost) =>
  host === "local" ? OLLAMA_LOCAL_HOST : OLLAMA_CLOUD_HOST;

/** Ollama SDK message shape this connector speaks. */
type OllamaMessage = {
  role: string;
  content: string;
  images?: string[];
  tool_calls?: {
    function: { name: string; arguments: Record<string, unknown> };
  }[];
  tool_name?: string;
};

const toOllamaMessages = (messages: ConnectorChatMessage[]): OllamaMessage[] =>
  messages.map((m) => {
    const out: OllamaMessage = { role: m.role, content: m.content };
    // Ollama's API takes raw base64; DB rows can hold data-URIs (composer
    // uploads replayed as history) — strip the prefix or the request 400s.
    if (m.images && m.images.length > 0) out.images = asBase64Images(m.images);
    if (m.toolCalls && m.toolCalls.length > 0)
      out.tool_calls = m.toolCalls.map((tc) => ({
        function: { name: tc.function.name, arguments: tc.function.arguments },
      }));
    if (m.role === "tool") out.tool_name = m.toolName ?? "";
    return out;
  });

// Lists models from a single Ollama endpoint, tagging each with its source.
// Serves both the cloud and the local connector via listModels().
async function listFromEndpoint(
  ollama: Ollama,
  source: "cloud" | "local",
): Promise<ModelListing[]> {
  const list = await ollama.list();
  return Promise.all(
    (list.models ?? []).map(async (m): Promise<ModelListing> => {
      try {
        const info = await ollama.show({ model: m.name });
        const modelInfo = (info.model_info ?? {}) as unknown as Record<
          string,
          unknown
        >;
        let contextLength: number | null = null;
        for (const [key, value] of Object.entries(modelInfo)) {
          if (key.endsWith(".context_length") && typeof value === "number") {
            contextLength = value;
            break;
          }
        }
        return {
          name: m.name,
          contextLength:
            source === "local"
              ? Math.min(contextLength ?? LOCAL_CONTEXT, LOCAL_CONTEXT)
              : contextLength,
          capabilities: info.capabilities ?? [],
          source,
          provider: "ollama",
          ...(source === "cloud" ? { host: OLLAMA_CLOUD_HOST } : {}),
        };
      } catch {
        return {
          name: m.name,
          contextLength: source === "local" ? LOCAL_CONTEXT : null,
          capabilities: [],
          source,
          provider: "ollama",
          ...(source === "cloud" ? { host: OLLAMA_CLOUD_HOST } : {}),
        };
      }
    }),
  );
}

/**
 * Connector for one Ollama endpoint (cloud or local). Host is fixed at
 * construction — callers pick cloud vs local, not arbitrary URLs.
 */
export function createOllamaConnector(
  host: OllamaHost,
  apiKey: string,
): LlmConnector {
  const endpoint = hostForSource(host);
  const client = () =>
    new Ollama({
      host: endpoint,
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    });
  // Local models allocate their KV cache at load; cloud is server-managed.
  const requestOptions = (
    req: Pick<ConnectorChatRequest, "temperature" | "seed" | "maxTokens">,
  ): Record<string, number> => {
    const options: Record<string, number> = {};
    if (req.temperature !== undefined) options.temperature = req.temperature;
    if (req.seed !== undefined) options.seed = req.seed;
    if (req.maxTokens !== undefined) options.num_predict = req.maxTokens;
    if (host === "local") options.num_ctx = LOCAL_CONTEXT;
    return options;
  };
  const withOptions = (options: Record<string, number>) =>
    Object.keys(options).length > 0 ? { options } : {};

  return {
    async listModels() {
      return listFromEndpoint(client(), host === "local" ? "local" : "cloud");
    },

    async chat(req) {
      const response = await client().chat({
        model: req.model,
        messages: toOllamaMessages(req.messages),
        stream: false,
        ...withOptions(requestOptions(req)),
        ...(req.think !== undefined ? { think: toSdkThink(req.think) } : {}),
      });
      return {
        content: response.message?.content ?? "",
        usage: {
          promptTokens: response.prompt_eval_count ?? 0,
          evalTokens: response.eval_count ?? 0,
        },
      };
    },

    stream(req, onChunk, signal) {
      const ollama = client();
      let finalUsage: ConnectorUsage | null = null;
      const done = (async (): Promise<ConnectorUsage | null> => {
        const stream = await ollama.chat({
          model: req.model,
          messages: toOllamaMessages(req.messages),
          stream: true,
          ...(req.think !== undefined ? { think: toSdkThink(req.think) } : {}),
          ...withOptions(requestOptions(req)),
          ...(req.tools && req.tools.length > 0 ? { tools: req.tools } : {}),
        });
        for await (const part of stream) {
          if (signal.aborted) {
            try {
              ollama.abort();
            } catch {
              // request already settled
            }
            break;
          }
          const toolCalls = (part.message?.tool_calls ?? []).map((tc) => ({
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
            },
          }));
          const usage = part.done
            ? {
                promptTokens: part.prompt_eval_count ?? 0,
                evalTokens: part.eval_count ?? 0,
              }
            : undefined;
          onChunk({
            thinkingDelta: part.message?.thinking ?? "",
            contentDelta: part.message?.content ?? "",
            ...(toolCalls.length > 0 ? { toolCalls } : {}),
          });
          if (usage) finalUsage = usage;
        }
        return finalUsage;
      })();
      return { done };
    },

    async chatJson(req, schema) {
      const response = await client().chat({
        model: req.model,
        messages: req.messages,
        stream: false,
        format: schema,
        ...withOptions(requestOptions(req)),
        think: false,
      });
      return response.message?.content ?? "";
    },

    async ensureLoaded(ref: ModelRef) {
      await client().generate({
        model: ref.model,
        prompt: "",
        keep_alive: "20m",
        options: { num_ctx: LOCAL_CONTEXT },
      });
    },

    async release(ref: ModelRef) {
      // The JS SDK typings don't always accept keep_alive: 0 across versions,
      // so hit the REST endpoint directly with a raw fetch.
      await fetch(`${OLLAMA_LOCAL_HOST}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: ref.model, keep_alive: 0 }),
      });
    },
  };
}

/**
 * The SDK's `think` union tops out at "high"; "max" is a newer server value
 * that passes through at runtime (same cast the old inline calls made).
 */
const toSdkThink = (
  think: boolean | "low" | "medium" | "high" | "max",
): boolean | "low" | "medium" | "high" =>
  think as boolean | "low" | "medium" | "high";
