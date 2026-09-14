import type { ModelListing } from "@kotys/contracts";
import { asDataUriImage } from "@kotys/contracts";
import type {
  ConnectorChatMessage,
  ConnectorChatRequest,
  ConnectorStreamChunk,
  ConnectorUsage,
  LlmConnector,
  StreamHandle,
} from "./types.js";

/**
 * Generic connector for any OpenAI-compatible server (oMLX, LM Studio,
 * vLLM…): {baseUrl}/models + {baseUrl}/chat/completions with a Bearer key.
 * Provider specifics — reasoning_content deltas, string tool arguments,
 * OpenAI usage fields — are mapped here so callers stay provider-dumb.
 */
export type OpenAiCompatibleConfig = {
  /** e.g. http://127.0.0.1:7777/v1 */
  baseUrl: string;
  apiKey: string;
  /** Badge/identity written into ModelListing. */
  provider: string;
  /** Which listing source these models count as. */
  source?: "cloud" | "local";
};

type OpenAiToolCall = {
  index?: number;
  id?: string;
  function?: { name?: string; arguments?: string };
};

type OpenAiDelta = {
  reasoning_content?: string;
  content?: string;
  tool_calls?: OpenAiToolCall[];
};

type OpenAiChunk = {
  choices?: { delta?: OpenAiDelta; finish_reason?: string | null }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  } | null;
};

type OpenAiResponse = {
  choices?: {
    message?: { content?: string; reasoning_content?: string };
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
};

type OpenAiContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

type OpenAiMessage = {
  role: string;
  content: string | OpenAiContentPart[];
  tool_calls?: {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }[];
  tool_call_id?: string;
};

const headers = (apiKey: string): Record<string, string> => ({
  "Content-Type": "application/json",
  ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
});

/** OpenAI tool arguments arrive as a JSON string; parse leniently. */
const parseToolArgs = (raw: string | undefined): Record<string, unknown> => {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : { value: parsed };
  } catch {
    return { _raw: raw };
  }
};

/**
 * OpenAI streams tool calls as argument-string deltas keyed by index; oMLX
 * delivers each call in one chunk, but the accumulation below is the general
 * contract (LM Studio/vLLM split arguments across chunks).
 */
const accumulateToolCalls = (
  acc: Map<number, { id: string; name: string; arguments: string }>,
  deltaCalls: OpenAiToolCall[] | undefined,
): void => {
  for (const tc of deltaCalls ?? []) {
    const index = tc.index ?? 0;
    const existing = acc.get(index) ?? { id: "", name: "", arguments: "" };
    acc.set(index, {
      id: tc.id ?? existing.id,
      name: existing.name + (tc.function?.name ?? ""),
      arguments: existing.arguments + (tc.function?.arguments ?? ""),
    });
  }
};

/**
 * OpenAI wire format carries images as data-URI content parts; Kotys's
 * internal format keeps them as bare base64 strings on the message.
 */
const toOpenAiContent = (
  content: string,
  images: string[] | undefined,
): string | OpenAiContentPart[] => {
  if (!images || images.length === 0) return content;
  return [
    { type: "text", text: content },
    ...images.map((b64) => ({
      type: "image_url" as const,
      image_url: { url: asDataUriImage(b64) },
    })),
  ];
};

const toOpenAiMessages = (messages: ConnectorChatMessage[]): OpenAiMessage[] =>
  messages.map((m) => {
    if (m.role === "tool") {
      return {
        role: "tool",
        content: toOpenAiContent(m.content, m.images),
        tool_call_id: m.toolCallId ?? "",
      };
    }
    const out: OpenAiMessage = {
      role: m.role,
      content: toOpenAiContent(m.content, m.images),
    };
    if (m.toolCalls && m.toolCalls.length > 0) {
      out.tool_calls = m.toolCalls.map((tc, i) => ({
        id: tc.id ?? `call_${i}`,
        type: "function",
        function: {
          name: tc.function.name,
          arguments: JSON.stringify(tc.function.arguments),
        },
      }));
    }
    return out;
  });

/**
 * Kotys's neutral think control -> the oMLX/OpenAI-compatible wire. Verified
 * against oMLX (Qwen3.8-27B): top-level reasoning_effort alone does nothing;
 * the chat template's enable_thinking is the on/off switch and reasoning_effort
 * modulates depth when thinking is on (false wins over any effort).
 * Servers without these knobs just ignore the extra body fields.
 */
const chatTemplateKwargs = (
  think: ConnectorChatRequest["think"],
): Record<string, unknown> | null => {
  if (think === undefined) return null;
  // `false` is the normalized off; "off" shouldn't reach a connector (the
  // stream boundary normalizes it), but treat it the same if it does.
  if (think === false || (think as string) === "off")
    return { chat_template_kwargs: { enable_thinking: false } };
  const effort = think === true ? undefined : think === "high" ? "max" : think;
  return {
    chat_template_kwargs: {
      enable_thinking: true,
      ...(effort ? { reasoning_effort: effort } : {}),
    },
  };
};

const chatBody = (
  req: ConnectorChatRequest,
  extra: Record<string, unknown>,
) => ({
  model: req.model,
  messages: toOpenAiMessages(req.messages),
  ...(req.tools && req.tools.length > 0 ? { tools: req.tools } : {}),
  ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
  ...(req.seed !== undefined ? { seed: req.seed } : {}),
  ...(req.maxTokens !== undefined ? { max_tokens: req.maxTokens } : {}),
  ...(chatTemplateKwargs(req.think) ?? {}),
  ...extra,
});

const mapUsage = (usage: OpenAiResponse["usage"]): ConnectorUsage | null =>
  usage
    ? {
        promptTokens: usage.prompt_tokens ?? 0,
        evalTokens: usage.completion_tokens ?? 0,
      }
    : null;

/**
 * Audio-model name heuristic for servers that don't expose model kinds
 * (plain /models only). Best-effort: only obvious TTS/STT names are
 * excluded, so a misnamed chat model still shows up.
 */
const AUDIO_MODEL_NAME_RE =
  /(^|[^a-z])(tts|stt|asr|whisper|parakeet|transcri|speech|codec|voice)([^a-z]|$)/i;

export const isAudioModelName = (name: string): boolean =>
  AUDIO_MODEL_NAME_RE.test(name);

export function createOpenAiCompatibleConnector(
  config: OpenAiCompatibleConfig,
): LlmConnector {
  const { baseUrl, apiKey } = config;
  const source = config.source ?? "local";

  /**
   * Preferred listing: oMLX's /models/status carries engine_type, which
   * separates chat models (vlm) from TTS/STT/audio engines that cannot
   * serve /chat/completions — plus thinking_default. Generic servers
   * without the endpoint fall back to /models with a name heuristic.
   */
  type ModelStatus = {
    id?: string;
    max_context_window?: number;
    model_context_length?: number;
    engine_type?: string;
    thinking_default?: boolean | null;
    is_hidden?: boolean;
  };
  const listFromStatus = async (): Promise<ModelListing[]> => {
    const res = await fetch(`${baseUrl}/models/status`, {
      headers: headers(apiKey),
    });
    if (!res.ok) throw new Error(`models/status failed: ${res.status}`);
    const body = (await res.json()) as { models?: ModelStatus[] };
    return (body.models ?? [])
      .filter(
        (m): m is ModelStatus & { id: string } =>
          typeof m.id === "string" &&
          m.is_hidden !== true &&
          // Only text engines serve /chat/completions — exclude audio (tts/stt)
          // engines, not everything that isn't "vlm" ("batched" LLMs are fine).
          !m.engine_type?.startsWith("audio"),
      )
      .map((m) => ({
        name: m.id,
        contextLength:
          typeof m.max_context_window === "number"
            ? m.max_context_window
            : typeof m.model_context_length === "number"
              ? m.model_context_length
              : null,
        capabilities: [
          // A text engine serves /chat/completions, so it reasons on demand
          // (chat_template_kwargs) even when thinking_default is false — the
          // default only decides whether reasoning streams unprompted.
          ...(m.engine_type === "vlm" || m.engine_type === "batched"
            ? ["thinking"]
            : []),
          ...(m.thinking_default ? ["thinking"] : []),
          // vlm = vision-language model: images over chat are expected to work.
          ...(m.engine_type === "vlm" ? ["vision"] : []),
        ],
        source,
        provider: config.provider,
      }));
  };

  /** Audio-model name patterns seen on OpenAI-compatible servers. */
  const listFromModels = async (): Promise<ModelListing[]> => {
    const res = await fetch(`${baseUrl}/models`, { headers: headers(apiKey) });
    if (!res.ok) throw new Error(`/models failed: ${res.status}`);
    const body = (await res.json()) as {
      data?: { id?: string; max_model_len?: number }[];
    };
    return (body.data ?? [])
      .filter(
        (m): m is { id: string; max_model_len?: number } =>
          typeof m.id === "string" && !isAudioModelName(m.id),
      )
      .map((m) => ({
        name: m.id,
        // Server-managed context: clamp never — the server rejects requests
        // larger than max_model_len and we never fight it.
        contextLength:
          typeof m.max_model_len === "number" ? m.max_model_len : null,
        capabilities: [],
        source,
        provider: config.provider,
      }));
  };

  return {
    listModels: () => listFromStatus().catch(() => listFromModels()),

    async chat(req) {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: headers(apiKey),
        body: JSON.stringify(chatBody(req, {})),
      });
      if (!res.ok) throw new Error(`chat/completions failed: ${res.status}`);
      const body = (await res.json()) as OpenAiResponse;
      const choice = body.choices?.[0];
      return {
        // reasoning_content stays out of content so callers parsing JSON
        // never see reasoning spillover.
        content: choice?.message?.content ?? "",
        usage: mapUsage(body.usage),
      };
    },

    stream(req, onChunk, signal) {
      const controller = new AbortController();
      const onOuterAbort = () => controller.abort();
      if (signal.aborted) controller.abort();
      else signal.addEventListener("abort", onOuterAbort, { once: true });
      let finalUsage: ConnectorUsage | null = null;
      const done = (async (): Promise<ConnectorUsage | null> => {
        try {
          const res = await fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: headers(apiKey),
            // Without include_usage the server reports no usage on a stream.
            body: JSON.stringify(
              chatBody(req, {
                stream: true,
                stream_options: { include_usage: true },
              }),
            ),
            signal: controller.signal,
          });
          if (!res.ok || !res.body)
            throw new Error(`chat/completions stream failed: ${res.status}`);
          const toolAcc = new Map<
            number,
            { id: string; name: string; arguments: string }
          >();
          // SSE frames: lines separated by \n\n, payload after "data: ".
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          outer: for (;;) {
            const { done: readerDone, value } = await reader.read();
            if (readerDone) break;
            buffer += decoder.decode(value, { stream: true });
            for (;;) {
              const sep = buffer.indexOf("\n\n");
              if (sep === -1) break;
              const frame = buffer.slice(0, sep);
              buffer = buffer.slice(sep + 2);
              for (const line of frame.split("\n")) {
                const data = line.startsWith("data: ") ? line.slice(6) : "";
                if (!data || data === "[DONE]") {
                  if (data === "[DONE]") break outer;
                  continue;
                }
                let chunk: OpenAiChunk;
                try {
                  chunk = JSON.parse(data) as OpenAiChunk;
                } catch {
                  continue; // keepalive or malformed frame
                }
                // include_usage arrives on a choices-less final frame.
                const usage = mapUsage(chunk.usage);
                if (usage) finalUsage = usage;
                const delta = chunk.choices?.[0]?.delta;
                if (!delta) continue;
                const mapped: ConnectorStreamChunk = {
                  thinkingDelta: delta.reasoning_content ?? "",
                  contentDelta: delta.content ?? "",
                };
                if (delta.tool_calls?.length) {
                  accumulateToolCalls(toolAcc, delta.tool_calls);
                }
                if (
                  mapped.thinkingDelta ||
                  mapped.contentDelta ||
                  mapped.toolCalls
                )
                  onChunk(mapped);
              }
            }
          }
          // Emit accumulated tool calls exactly once, after the stream ends.
          if (toolAcc.size > 0) {
            onChunk({
              thinkingDelta: "",
              contentDelta: "",
              toolCalls: [...toolAcc.values()].map((tc) => ({
                id: tc.id || undefined,
                function: {
                  name: tc.name,
                  arguments: parseToolArgs(tc.arguments),
                },
              })),
            });
          }
        } finally {
          signal.removeEventListener("abort", onOuterAbort);
        }
        return finalUsage;
      })();
      const handle: StreamHandle = { done };
      return handle;
    },

    async chatJson(req, schema) {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: headers(apiKey),
        body: JSON.stringify({
          ...chatBody(req, {}),
          response_format: {
            type: "json_schema",
            json_schema: { name: "response", strict: true, schema },
          },
        }),
      });
      if (!res.ok)
        throw new Error(`chat/completions (json) failed: ${res.status}`);
      const body = (await res.json()) as OpenAiResponse;
      return body.choices?.[0]?.message?.content ?? "";
    },

    async ensureLoaded(): Promise<void> {
      // The server keeps its engine pool warm; nothing to pre-load.
    },

    async release(): Promise<void> {
      // Server-managed lifecycle; never fight it.
    },
  };
}
