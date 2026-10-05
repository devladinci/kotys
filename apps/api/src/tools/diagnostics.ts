import type { ToolContext } from "./types.js";

export async function maybeDiagnostics(
  ctx: ToolContext,
  resolved: string,
): Promise<string> {
  if (!ctx.lsp) return "";
  try {
    const result = await ctx.lsp.getDiagnostics(resolved);
    if (!result || result.diagnostics.length === 0) return "";
    return `\n\n${result.formatted}`;
  } catch {
    return "";
  }
}
