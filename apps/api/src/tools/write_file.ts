import path from "node:path";
import { promises as fs } from "node:fs";
import type { ToolDefinition, ToolArgs, ToolResult } from "@kotys/contracts";
import type { ToolContext } from "./types.js";
import { resolvePath } from "./paths.js";
import { isSensitiveTarget } from "./sensitive_paths.js";
import { isInGitRepo } from "./git_check.js";
import { verifiedBackup } from "./backup.js";

const MAX_WRITE_BYTES = 200_000;

export const definition: ToolDefinition = {
  type: "function",
  category: "write",
  function: {
    name: "write_file",
    description:
      "Write content to a local file, creating it or overwriting it. Parent directories are created if they do not exist. Atomic write (temp file + rename). If the file is inside a git repo, no backup is created (git tracks history). If outside a git repo, a .bak backup is made and verified before overwriting. Every write requires user approval, inside a git repo or not. The path may be absolute, start with ~, or be relative (resolved against home). Use for creating new files or replacing entire file contents; use apply_patch for targeted edits.",
    parameters: {
      type: "object",
      required: ["path", "content"],
      properties: {
        path: {
          type: "string",
          description:
            "Absolute, ~-prefixed, or relative (resolved against home) file path.",
        },
        content: {
          type: "string",
          description: "The full file content to write.",
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
  const content = String(args.content ?? "");
  if (Buffer.byteLength(content, "utf-8") > MAX_WRITE_BYTES)
    throw new Error(`content too large (max ${MAX_WRITE_BYTES} bytes)`);
  const resolved = resolvePath(rawPath, ctx.homedir);
  if (await isSensitiveTarget(resolved, ctx.homedir))
    throw new Error(`Refusing to write to sensitive path: ${resolved}`);

  const inGit = await isInGitRepo(resolved);
  let fileExists = false;
  try {
    await fs.access(resolved);
    fileExists = true;
  } catch {
    // new file
  }

  // Always require approval for file writes — the user should see and consent
  // to every file the model creates or overwrites. The preview carries the
  // full content so the user can review before approving. No approval channel
  // means no write: silently proceeding would turn a missing dependency into
  // an unreviewed change on disk.
  if (!ctx.requestApproval) {
    throw new Error(
      "approval not available — cannot write a file without user consent",
    );
  }
  const approved = await ctx.requestApproval({
    tool: "write_file",
    command: fileExists ? `overwrite ${resolved}` : `create ${resolved}`,
    cwd: path.dirname(resolved),
    preview: content,
  });
  if (!approved) {
    return {
      content: fileExists
        ? "User denied approval to overwrite this file."
        : "User denied approval to create this file.",
      activity: {
        filePath: resolved,
        status: "error",
        error: fileExists
          ? "Denied: file not overwritten."
          : "Denied: file not created.",
      },
    };
  }

  await fs.mkdir(path.dirname(resolved), { recursive: true });

  // Only back up if the file exists AND we're not in a git repo (git already
  // tracks history, and .bak files can leak into commits).
  let bak: string | null = null;
  if (fileExists && !inGit) {
    bak = await verifiedBackup(resolved);
  }

  const tmp = `${resolved}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, content, "utf-8");
  await fs.rename(tmp, resolved);
  return {
    content: JSON.stringify({
      path: resolved,
      bytes: Buffer.byteLength(content, "utf-8"),
      ...(bak ? { backup: bak } : {}),
      ...(inGit ? { in_git_repo: true } : {}),
    }),
    activity: {
      filePath: resolved,
      results: [{ title: `${path.basename(resolved)} (written)`, url: "" }],
    },
  };
}
