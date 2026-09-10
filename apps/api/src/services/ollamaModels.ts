import { Ollama } from "ollama";
import { LOCAL_CONTEXT, OLLAMA_LOCAL_HOST } from "@kotys/contracts";

export async function chatOllama(
  host: string,
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[],
  opts?: {
    num_predict?: number;
    temperature?: number;
    seed?: number;
    think?: boolean;
    format?: object;
  },
): Promise<string> {
  const ollama = new Ollama({
    host,
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
  });
  // Built by presence, not truthiness — temperature 0 and seed 0 are meaningful.
  const options: Record<string, number> = {};
  if (opts?.num_predict !== undefined) options.num_predict = opts.num_predict;
  if (opts?.temperature !== undefined) options.temperature = opts.temperature;
  if (opts?.seed !== undefined) options.seed = opts.seed;
  if (host === OLLAMA_LOCAL_HOST) options.num_ctx = LOCAL_CONTEXT;
  const response = await ollama.chat({
    model,
    messages,
    stream: false,
    ...(Object.keys(options).length > 0 ? { options } : {}),
    ...(opts?.think !== undefined ? { think: opts.think } : {}),
    ...(opts?.format ? { format: opts.format } : {}),
  });
  const text = response.message?.content || "";
  return text;
}

export async function loadModel(model: string): Promise<void> {
  const ollama = new Ollama({ host: OLLAMA_LOCAL_HOST });
  await ollama.generate({
    model,
    prompt: "",
    keep_alive: "20m",
    options: { num_ctx: LOCAL_CONTEXT },
  });
}

export async function unloadModel(model: string): Promise<void> {
  // The JS SDK typings don't always accept keep_alive: 0 across versions, so
  // hit the REST endpoint directly with a raw fetch.
  await fetch(`${OLLAMA_LOCAL_HOST}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, keep_alive: 0 }),
  });
}

export async function listRunningModels() {
  const ollama = new Ollama({ host: OLLAMA_LOCAL_HOST });
  const ps = await ollama.ps();
  return (ps.models ?? []).map((m) => ({
    name: m.name,
    sizeVram: m.size_vram ?? 0,
    expiresAt: m.expires_at ? new Date(m.expires_at).toISOString() : null,
  }));
}
