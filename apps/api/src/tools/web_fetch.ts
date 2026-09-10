import type { ToolDefinition, ToolArgs, ToolResult } from "@kotys/contracts";
import type { ToolContext } from "./types.js";

const FETCH_CONTENT_CHARS = 8_000;

export const definition: ToolDefinition = {
  type: "function",
  category: "web",
  function: {
    name: "web_fetch",
    description:
      "Fetch a web page by URL and return its title, text content, and links.",
    parameters: {
      type: "object",
      required: ["url"],
      properties: {
        url: {
          type: "string",
          description: "Absolute URL of the page to fetch",
        },
      },
    },
  },
};

// Failures arrive as a raw JSON body ({"error":"not found"}).
const fetchErrorMessage = (err: unknown, url: string): string => {
  const raw = err instanceof Error ? err.message : String(err);
  let detail = raw;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "error" in parsed)
      detail = String(parsed.error);
  } catch {
    // not JSON
  }
  return `Could not fetch ${url}: ${detail}. The page may not exist or may block fetching; use web_search to find a working URL.`;
};

export async function execute(
  args: ToolArgs,
  ctx: ToolContext,
): Promise<ToolResult> {
  const url = String(args.url ?? "");
  const res = await ctx.ollama.webFetch({ url }).catch((err: unknown) => {
    throw new Error(fetchErrorMessage(err, url));
  });
  return {
    content: JSON.stringify({
      title: res.title,
      content: (res.content ?? "").slice(0, FETCH_CONTENT_CHARS),
      links: (res.links ?? []).slice(0, 20),
    }),
    activity: {
      url,
      results: [{ title: res.title || url, url }],
    },
  };
}
