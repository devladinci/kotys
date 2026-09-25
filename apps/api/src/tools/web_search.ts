import type { ToolDefinition, ToolArgs, ToolResult } from "@kotys/contracts";
import type { ToolContext } from "./types.js";
import {
  getWebSearchProvider,
  searchViaSearxng,
  type NormalizedSearchResult,
} from "./webSearchProviders.js";

const SEARCH_RESULT_CHARS = 2_000;

export const definition: ToolDefinition = {
  type: "function",
  category: "web",
  function: {
    name: "web_search",
    description:
      "Search the web for current information. Returns the top results with title, url, and a content snippet.",
    parameters: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string", description: "The search query" },
        max_results: {
          type: "number",
          description: "Maximum results to return (default 5, max 8)",
        },
      },
    },
  },
};

const toActivity = (results: NormalizedSearchResult[]) =>
  results.map((r) => ({ title: r.title, url: r.url }));

const searchOllama = async (
  args: ToolArgs,
  ctx: ToolContext,
  maxResults: number,
): Promise<NormalizedSearchResult[]> => {
  // The SDK's WebSearchResult type only declares `content`, but ollama.com
  // returns title and url too — keep them through a looser cast.
  const res = (await ctx.ollama.webSearch({
    query: String(args.query ?? ""),
    maxResults,
  })) as { results?: { title?: string; url?: string; content?: string }[] };
  return (res.results ?? []).slice(0, maxResults).map((r) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    content: (r.content ?? "").slice(0, SEARCH_RESULT_CHARS),
  }));
};

export async function execute(
  args: ToolArgs,
  ctx: ToolContext,
): Promise<ToolResult> {
  const maxResults = Math.min(Math.max(Number(args.max_results) || 5, 1), 8);
  const query = String(args.query ?? "");

  const provider = getWebSearchProvider();
  const results =
    provider === "searxng"
      ? await searchViaSearxng(query, maxResults, ctx.signal)
      : await searchOllama(args, ctx, maxResults);

  return {
    content: JSON.stringify(
      results.map((r) => ({
        title: r.title,
        url: r.url,
        content: r.content.slice(0, SEARCH_RESULT_CHARS),
      })),
    ),
    activity: {
      query: typeof args.query === "string" ? args.query : undefined,
      results: toActivity(results),
    },
  };
}
