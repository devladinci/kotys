import { getSetting } from "@kotys/db";

const SEARXNG_URL_SETTING = "searxng_url";

export type WebSearchProvider = "ollama" | "searxng";

export const getWebSearchProvider = (): WebSearchProvider => {
  const value = getSetting("web_search_provider");
  if (value === "searxng") return "searxng";
  return "ollama";
};

export const getSearxngUrl = (): string =>
  (getSetting(SEARXNG_URL_SETTING) ?? "").replace(/\/+$/, "");

type SearxngResult = {
  title?: unknown;
  url?: unknown;
  content?: unknown;
};

export type NormalizedSearchResult = {
  title: string;
  url: string;
  content: string;
};

export const normalizeSearxngResults = (
  payload: unknown,
  maxResults: number,
): NormalizedSearchResult[] => {
  const results =
    payload && typeof payload === "object" && "results" in payload
      ? (payload as { results?: unknown }).results
      : undefined;
  if (!Array.isArray(results)) return [];
  return results.slice(0, maxResults).map((r: unknown) => {
    const rec = (r ?? {}) as SearxngResult;
    return {
      title: typeof rec.title === "string" ? rec.title : "",
      url: typeof rec.url === "string" ? rec.url : "",
      content: typeof rec.content === "string" ? rec.content : "",
    };
  });
};

export const searchViaSearxng = async (
  query: string,
  maxResults: number,
  signal?: AbortSignal,
): Promise<NormalizedSearchResult[]> => {
  const base = getSearxngUrl();
  if (!base) {
    throw new Error(
      "SearXNG URL is not configured. Set it in Settings → Providers.",
    );
  }
  const url = `${base}/search?q=${encodeURIComponent(query)}&format=json`;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`SearXNG returned HTTP ${res.status}`);
  }
  return normalizeSearxngResults(await res.json(), maxResults);
};

export const searxngFetchHtml = async (
  url: string,
  signal?: AbortSignal,
): Promise<string> => {
  const res = await fetch(url, {
    signal,
    headers: { "user-agent": "Mozilla/5.0 (Kotys web_fetch)" },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.text();
};