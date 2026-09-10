import path from "node:path";
import { promises as fs } from "node:fs";
import type { ToolDefinition, ToolArgs, ToolResult } from "@kotys/contracts";
import type { ToolContext } from "./types.js";
import { resolvePath } from "./paths.js";
import { isSensitiveTarget } from "./sensitive_paths.js";
import { isInGitRepo } from "./git_check.js";
import { verifiedBackup } from "./backup.js";

const MAX_FILE_BYTES = 200_000;
const HINT_RADIUS_LINES = 2;
const HINT_MAX_CHARS_PER_LINE = 200;

async function nearestLines(
  resolved: string,
  oldText: string,
): Promise<string> {
  try {
    const text = await fs.readFile(resolved, "utf-8");
    const lines = text.split("\n");
    const probe = oldText
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2);
    if (!probe.length) return "";
    let bestIdx = -1;
    let bestScore = 0;
    for (let i = 0; i < lines.length; i++) {
      const hay = lines[i].toLowerCase();
      let score = 0;
      for (const word of probe) if (hay.includes(word)) score++;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    if (bestIdx === -1 || bestScore < 2) return "";
    const start = Math.max(0, bestIdx - HINT_RADIUS_LINES);
    const end = Math.min(lines.length, bestIdx + HINT_RADIUS_LINES + 1);
    const shown = lines
      .slice(start, end)
      .map((l) =>
        l.length > HINT_MAX_CHARS_PER_LINE
          ? `${l.slice(0, HINT_MAX_CHARS_PER_LINE)}…`
          : l,
      );
    return ` Nearest match near line ${bestIdx + 1}:\n${shown
      .map((l, i) => `  ${start + i + 1} │ ${l}`)
      .join("\n")}\n(use these exact lines as old_text)`;
  } catch {
    return "";
  }
}

export const definition: ToolDefinition = {
  type: "function",
  category: "write",
  function: {
    name: "apply_patch",
    description:
      "Apply a targeted text replacement to a local file. Replaces the first occurrence of old_text with new_text. Fails if old_text is not found or appears more than once (ambiguous). Atomic write (temp + rename). If inside a git repo, no backup is created (git tracks history). If outside a git repo, a verified .bak backup is made before patching. Every patch requires user approval, inside a git repo or not. The path may be absolute, start with ~, or be relative (resolved against home). Use write_file for full rewrites; use apply_patch for small targeted edits.",
    parameters: {
      type: "object",
      required: ["path", "old_text", "new_text"],
      properties: {
        path: {
          type: "string",
          description:
            "Absolute, ~-prefixed, or relative (resolved against home) file path.",
        },
        old_text: {
          type: "string",
          description:
            "Exact text to find in the file. Must be unique within the file to avoid ambiguous replacements.",
        },
        new_text: {
          type: "string",
          description: "Text to replace old_text with.",
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
  const oldText = String(args.old_text ?? "");
  const newText = String(args.new_text ?? "");
  if (!oldText) throw new Error("old_text is required");
  const resolved = resolvePath(rawPath, ctx.homedir);
  if (await isSensitiveTarget(resolved, ctx.homedir))
    throw new Error(`Refusing to patch sensitive path: ${resolved}`);
  let existing: string;
  try {
    existing = await fs.readFile(resolved, "utf-8");
  } catch {
    throw new Error(`Cannot read ${resolved}: file not found or unreadable`);
  }
  if (Buffer.byteLength(existing, "utf-8") > MAX_FILE_BYTES)
    throw new Error(`file too large (max ${MAX_FILE_BYTES} bytes)`);
  const first = existing.indexOf(oldText);
  if (first === -1) {
    const hint = await nearestLines(resolved, oldText);
    throw new Error(
      `old_text not found in file. Check whitespace and indentation.${hint}`,
    );
  }
  const last = existing.indexOf(oldText, first + 1);
  if (last !== -1)
    throw new Error(
      "old_text appears more than once in file. Include more surrounding context to make it unique.",
    );

  const inGit = await isInGitRepo(resolved);

  if (!ctx.requestApproval) {
    throw new Error(
      "approval not available — cannot patch a file without user consent",
    );
  }
  const approved = await ctx.requestApproval({
    tool: "apply_patch",
    command: `patch ${resolved}`,
    cwd: path.dirname(resolved),
    preview: `--- ${resolved}\n+++ ${resolved}\n@@\n-${oldText}\n+${newText}`,
  });
  if (!approved) {
    return {
      content: "User denied approval to patch this file.",
      activity: {
        filePath: resolved,
        status: "error",
        error: "Denied: file not patched.",
      },
    };
  }

  const updated =
    existing.slice(0, first) + newText + existing.slice(first + oldText.length);

  let bak: string | null = null;
  if (!inGit) {
    bak = await verifiedBackup(resolved);
  }

  const tmp = `${resolved}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, updated, "utf-8");
  await fs.rename(tmp, resolved);
  return {
    content: JSON.stringify({
      path: resolved,
      replaced: 1,
      bytes: Buffer.byteLength(updated, "utf-8"),
      ...(bak ? { backup: bak } : {}),
      ...(inGit ? { in_git_repo: true } : {}),
    }),
    activity: {
      filePath: resolved,
      results: [{ title: `${path.basename(resolved)} (patched)`, url: "" }],
    },
  };
}
