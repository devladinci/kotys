export const COMPACT_BUFFER = 20_000;
export const KEEP_TOKENS = 8_000;
export const SUMMARY_MAX_TOKENS = 2_048;
export const DEFAULT_CONTEXT = 262_144;

/** Canonical endpoints — every package resolves hosts from here. */
export const OLLAMA_CLOUD_HOST = "https://ollama.com";
export const OLLAMA_LOCAL_HOST = "http://localhost:11434";

/**
 * Local models allocate their whole KV cache at load time, so the advertised
 * max (262k on qwen3.8) is charged against unified memory whether or not the
 * conversation ever fills it — ~7GB on a 27B. Cloud models are managed
 * server-side and keep their full window.
 */
export const LOCAL_CONTEXT = 32_768;

export const estimateTokensFromChars = (chars: number) =>
  Math.max(0, Math.round(chars / 4));

export const estimateTokens = (text: string) =>
  estimateTokensFromChars(text.length);

/** Compact threshold: the window less room for a reply, capped at a quarter. */
export const usableTokens = (ctx: number) =>
  ctx - Math.min(COMPACT_BUFFER, Math.floor(ctx / 4));

export const IMAGE_TOKENS = 800;

/**
 * The one formula for "how big is the next request", shared by the server's
 * compact trigger and the client's meter so the two cannot disagree. `measured`
 * is the provider's own prompt size for the last turn, covering the system
 * prompt, tool schemas and images that counting characters cannot see.
 */
export const projectContextTokens = (input: {
  measured: number;
  estimated: number;
  fallback: number;
}): number =>
  (input.measured > 0 ? input.measured : input.fallback) + input.estimated;

/** Share of the model's window, so half a window reads as 50%. */
export const contextPct = (used: number, ctx: number) =>
  ctx <= 0 ? 0 : Math.min(999, Math.round((used / ctx) * 100));

/**
 * Million-token contexts are real now, and without an M tier a 1_048_576 window
 * rendered as the unreadable "1049k". Drops the decimal once the leading digits
 * carry enough precision on their own.
 */
export const fmtTokens = (n: number) => {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `${m >= 10 ? Math.round(m) : m.toFixed(1)}M`;
  }
  if (n >= 1000) {
    const k = n / 1000;
    return `${k >= 100 ? Math.round(k) : k.toFixed(1)}k`;
  }
  return String(n);
};
