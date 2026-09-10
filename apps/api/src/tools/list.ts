import { promises as fs } from "node:fs";
import type { ToolDefinition, ToolArgs, ToolResult } from "@kotys/contracts";
import type { ToolContext } from "./types.js";
import { resolvePath, fileNotFoundError } from "./paths.js";
import { isSensitiveTarget } from "./sensitive_paths.js";

const LIST_MAX_ENTRIES = 200;

export const definition: ToolDefinition = {
  type: "function",
  category: "read",
  function: {
    name: "list",
    description:
      "List the entries of a local directory. Returns names, kinds (file/dir), sorted with directories first. Use to browse the filesystem before reading a specific file. The path may be absolute, start with ~ (home directory), or relative (resolved against the home directory).",
    parameters: {
      type: "object",
      required: ["path"],
      properties: {
        path: {
          type: "string",
          description:
            "Directory path: absolute, ~-prefixed, or relative (resolved against home), e.g. ~/projects, /Users/me/proj, or logs.",
        },
      },
    },
  },
};

export async function execute(
  args: ToolArgs,
  ctx: ToolContext,
): Promise<ToolResult> {
  const rawPath = String(args.path ?? "").trim();
  if (!rawPath) throw new Error("path is required");
  const resolved = resolvePath(rawPath, ctx.homedir);
  if (await isSensitiveTarget(resolved, ctx.homedir))
    throw new Error(`Refusing to list sensitive path: ${resolved}`);
  let stats;
  try {
    stats = await fs.stat(resolved);
  } catch {
    throw new Error(await fileNotFoundError(resolved));
  }
  if (!stats.isDirectory()) throw new Error(`not a directory: ${resolved}`);
  const entries = await fs.readdir(resolved, { withFileTypes: true });
  const rows = entries
    .slice(0, LIST_MAX_ENTRIES)
    .map((e) => ({
      name: e.name,
      kind: e.isDirectory() ? "dir" : "file",
    }))
    .sort((a, b) =>
      a.kind === b.kind
        ? a.name.localeCompare(b.name)
        : a.kind === "dir"
          ? -1
          : 1,
    );
  const truncated = entries.length > LIST_MAX_ENTRIES;
  return {
    content: JSON.stringify({
      path: resolved,
      count: entries.length,
      ...(truncated ? { truncated: true } : {}),
      entries: rows,
    }),
    activity: {
      filePath: rawPath,
      results: rows.map((r) => ({
        title: r.kind === "dir" ? `${r.name}/` : r.name,
        url: "",
      })),
    },
  };
}
