import path from "node:path";
import { promises as fs } from "node:fs";
import type { ToolDefinition, ToolArgs, ToolResult } from "@kotys/contracts";
import type { ToolContext } from "./types.js";
import { resolvePath, fileNotFoundError } from "./paths.js";
import { isSensitivePath, isSensitiveTarget } from "./sensitive_paths.js";

const GREP_MAX_MATCHES = 200;
const GREP_MAX_FILE_BYTES = 1_000_000;
const GREP_CONTEXT_CHARS = 240;
const GREP_IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "release",
  "build",
]);

export const definition: ToolDefinition = {
  type: "function",
  category: "read",
  function: {
    name: "grep",
    description:
      "Search file contents for a regex pattern. Pass a directory to search it recursively (returns matching file paths, line numbers, and snippets), or a single file path to search just that file. Skips common generated directories (node_modules, .git, dist) in recursive mode. Use to find where something is defined or referenced before reading the file. The path may be absolute, start with ~ (home directory), or relative (resolved against the home directory).",
    parameters: {
      type: "object",
      required: ["pattern", "path"],
      properties: {
        pattern: {
          type: "string",
          description:
            'Regular expression to search for, e.g. "function\\\\s+openChat" or "TODO:". JavaScript regex syntax.',
        },
        path: {
          type: "string",
          description:
            "Directory to search recursively, or a single file to search. Absolute, ~-prefixed, or relative (resolved against home), e.g. ~/projects, /Users/me/proj/src, or src/index.ts.",
        },
        glob: {
          type: "string",
          description:
            'Optional filename pattern to filter, e.g. "*.ts". Bare substring match on the filename when no wildcards are present.',
        },
      },
    },
  },
};

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const matchesGlob = (filename: string, pattern: string): boolean => {
  if (!pattern) return true;
  if (pattern.includes("*") || pattern.includes("?")) {
    const re = new RegExp(
      `^${pattern.split("*").map(escapeRegex).join(".*").replace(/\?/g, ".")}$`,
    );
    return re.test(filename);
  }
  return filename.includes(pattern);
};

type Match = { file: string; line: number; snippet: string };

async function walk(
  root: string,
  regex: RegExp,
  glob: string | undefined,
  matches: Match[],
  visited: Set<string>,
  homedir: string,
): Promise<void> {
  if (matches.length >= GREP_MAX_MATCHES) return;
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (matches.length >= GREP_MAX_MATCHES) return;
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (GREP_IGNORE_DIRS.has(entry.name)) continue;
      const real = await fs.realpath(full).catch(() => full);
      if (visited.has(real)) continue;
      if (isSensitivePath(full, homedir) || isSensitivePath(real, homedir))
        continue;
      visited.add(real);
      await walk(full, regex, glob, matches, visited, homedir);
    } else if (entry.isFile()) {
      if (glob && !matchesGlob(entry.name, glob)) continue;
      const realFile = await fs.realpath(full).catch(() => full);
      if (isSensitivePath(full, homedir) || isSensitivePath(realFile, homedir))
        continue;
      try {
        const st = await fs.stat(full);
        if (st.size > GREP_MAX_FILE_BYTES) continue;
        const buf = await fs.readFile(full);
        const text = buf.toString("utf8");
        const lines = text.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (matches.length >= GREP_MAX_MATCHES) break;
          const m = regex.exec(lines[i]);
          if (m) {
            const start = Math.max(0, m.index - GREP_CONTEXT_CHARS / 2);
            const end = Math.min(
              lines[i].length,
              m.index + m[0].length + GREP_CONTEXT_CHARS / 2,
            );
            matches.push({
              file: full,
              line: i + 1,
              snippet: lines[i].slice(start, end).trim(),
            });
          }
        }
      } catch {
        // unreadable as utf-8 or permission denied — skip
      }
    }
  }
}

export async function execute(
  args: ToolArgs,
  ctx: ToolContext,
): Promise<ToolResult> {
  const rawPattern = String(args.pattern ?? "");
  if (!rawPattern) throw new Error("pattern is required");
  const root = String(args.path ?? "").trim();
  if (!root) throw new Error("path is required");
  const glob = typeof args.glob === "string" ? args.glob : undefined;
  const resolved = resolvePath(root, ctx.homedir);
  if (await isSensitiveTarget(resolved, ctx.homedir))
    throw new Error(`Refusing to search sensitive path: ${resolved}`);
  let stats;
  try {
    stats = await fs.stat(resolved);
  } catch {
    throw new Error(await fileNotFoundError(resolved));
  }

  let regex: RegExp;
  try {
    regex = new RegExp(rawPattern);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`invalid regex: ${msg}`);
  }

  const matches: Match[] = [];
  const visited = new Set<string>([
    await fs.realpath(resolved).catch(() => resolved),
  ]);
  if (stats.isFile()) {
    await walkFile(resolved, regex, glob, matches, ctx.homedir);
    return buildResult(resolved, rawPattern, glob, matches, false);
  }
  await walk(resolved, regex, glob, matches, visited, ctx.homedir);

  const truncated = matches.length >= GREP_MAX_MATCHES;
  return buildResult(resolved, rawPattern, glob, matches, truncated);
}

function buildResult(
  root: string,
  rawPattern: string,
  glob: string | undefined,
  matches: Match[],
  truncated: boolean,
): ToolResult {
  return {
    content: JSON.stringify({
      pattern: rawPattern,
      path: root,
      ...(glob ? { glob } : {}),
      count: matches.length,
      ...(truncated ? { truncated: true } : {}),
      matches: matches.map((m) => ({
        file: m.file,
        line: m.line,
        snippet: m.snippet,
      })),
    }),
    activity: {
      query: rawPattern,
      filePath: root,
      results: matches.slice(0, 20).map((m) => ({
        title: `${path.basename(m.file)}:${m.line}`,
        url: "",
      })),
    },
  };
}

async function walkFile(
  file: string,
  regex: RegExp,
  glob: string | undefined,
  matches: Match[],
  homedir: string,
): Promise<void> {
  const name = path.basename(file);
  if (glob && !matchesGlob(name, glob)) return;
  if (isSensitivePath(file, homedir)) return;
  let st;
  try {
    st = await fs.stat(file);
  } catch {
    return;
  }
  if (st.size > GREP_MAX_FILE_BYTES) return;
  try {
    const buf = await fs.readFile(file);
    const lines = buf.toString("utf8").split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (matches.length >= GREP_MAX_MATCHES) break;
      const m = regex.exec(lines[i]);
      if (m) {
        const start = Math.max(0, m.index - GREP_CONTEXT_CHARS / 2);
        const end = Math.min(
          lines[i].length,
          m.index + m[0].length + GREP_CONTEXT_CHARS / 2,
        );
        matches.push({
          file,
          line: i + 1,
          snippet: lines[i].slice(start, end).trim(),
        });
      }
    }
  } catch {
    // unreadable as utf-8 or permission denied — skip
  }
}
