import path from "node:path";
import { promises as fs, createReadStream } from "node:fs";
import readline from "node:readline";
import type { ToolDefinition, ToolArgs, ToolResult } from "@kotys/contracts";
import type { ToolContext } from "./types.js";
import { resolvePath, fileNotFoundError } from "./paths.js";
import { isSensitiveTarget } from "./sensitive_paths.js";

// Output is capped, not the input. The file is streamed so a 1 GB log won't
// crash the process — we only hold a window of lines in memory. When the
// output is truncated we return actionable guidance so the model can page or
// search instead of guessing at what was cut.
const MAX_OUTPUT_BYTES = 50_000;
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;
const MAX_LINE_LENGTH = 2_000;
const MAX_LINE_SUFFIX = `... (line truncated to ${MAX_LINE_LENGTH} chars)`;
const SAMPLE_BYTES = 4_096;
const SNIPPET_RADIUS = 120;
const MAX_PATTERN_MATCHES = 200;

const BINARY_EXTENSIONS = new Set([
  ".zip",
  ".tar",
  ".gz",
  ".exe",
  ".dll",
  ".so",
  ".class",
  ".jar",
  ".war",
  ".7z",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".odt",
  ".ods",
  ".odp",
  ".bin",
  ".dat",
  ".obj",
  ".o",
  ".a",
  ".lib",
  ".wasm",
  ".pyc",
  ".pyo",
]);

const isBinary = (filepath: string, sample: Buffer): boolean => {
  const ext = path.extname(filepath).toLowerCase();
  if (BINARY_EXTENSIONS.has(ext)) return true;
  if (sample.length === 0) return false;
  let nonPrintable = 0;
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] === 0) return true;
    if (sample[i] < 9 || (sample[i] > 13 && sample[i] < 32)) nonPrintable++;
  }
  return nonPrintable / sample.length > 0.3;
};

const truncateLine = (text: string) =>
  text.length > MAX_LINE_LENGTH
    ? text.slice(0, MAX_LINE_LENGTH) + MAX_LINE_SUFFIX
    : text;

export const definition: ToolDefinition = {
  type: "function",
  category: "read",
  function: {
    name: "read_file",
    description:
      "Read a local file by its absolute path. Returns text content (UTF-8) as numbered lines, with the total line count so you can page through large files with offset/limit. Pass a regex pattern to return only matching lines (with line numbers and snippets) instead of a range — useful for finding a symbol or string inside one file. Output is capped at ~50 KB; when truncated, the response tells you the next offset to use or suggests searching with a pattern. Binary files are refused. The path may be absolute, start with ~ (home directory), or relative (resolved against the home directory).",
    parameters: {
      type: "object",
      required: ["path"],
      properties: {
        path: {
          type: "string",
          description:
            "Absolute, relative (resolved against home), or ~-prefixed filesystem path, e.g. /Users/me/proj/src/index.ts, ~/projects/log.txt, or logs/train.out.",
        },
        offset: {
          type: "number",
          description:
            "1-indexed line number to start reading from (default 1). Use to page through files larger than the output cap.",
        },
        limit: {
          type: "number",
          description:
            "Maximum lines to return (default 200, max 500). Combine with offset to page.",
        },
        pattern: {
          type: "string",
          description:
            'Optional regex. When set, returns only lines that match, each with its line number and a snippet around the match, instead of a contiguous range. JavaScript regex syntax, e.g. "function\\\\s+openChat".',
        },
      },
    },
  },
};

// Streams the file line-by-line, calling onLine for each. Stops early when
// onLine returns false. Returns the total line count. readline handles
// cross-chunk line splitting; memory stays O(max line length) regardless of
// file size.
async function forEachLine(
  rawPath: string,
  onLine: (line: number, text: string) => boolean | Promise<boolean>,
): Promise<number> {
  const rl = readline.createInterface({
    input: createReadStream(rawPath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });
  let lineNum = 0;
  let totalLines = 0;
  try {
    for await (const text of rl) {
      totalLines = ++lineNum;
      const truncated = truncateLine(text);
      if (!(await onLine(lineNum, truncated))) break;
    }
  } finally {
    rl.close();
  }
  // readline doesn't count a trailing empty line if the file ends without \n,
  // but that's fine — we only use totalLines for guidance, not for slicing.
  return totalLines;
}

export async function execute(
  args: ToolArgs,
  ctx: ToolContext,
): Promise<ToolResult> {
  const rawPath = String(args.path ?? "").trim();
  if (!rawPath) throw new Error("path is required");
  const resolved = resolvePath(rawPath, ctx.homedir);
  // Whatever comes back is folded into the prompt and sent to the model host,
  // so a credential file read is a credential file leaked.
  if (await isSensitiveTarget(resolved, ctx.homedir))
    throw new Error(`Refusing to read sensitive path: ${resolved}`);
  let stats;
  try {
    stats = await fs.stat(resolved);
  } catch {
    throw new Error(await fileNotFoundError(resolved));
  }
  if (!stats.isFile()) throw new Error(`not a regular file: ${resolved}`);

  // Sniff a small sample for binary detection before streaming the whole file.
  const fd = await fs.open(resolved, "r");
  try {
    const sample = Buffer.alloc(Math.min(SAMPLE_BYTES, stats.size));
    const { bytesRead } = await fd.read(sample, 0, sample.length, 0);
    if (isBinary(resolved, sample.subarray(0, bytesRead)))
      throw new Error(
        "file appears to be binary (null bytes or non-text content). Use grep to search within it, or ask the user for a text export.",
      );
  } finally {
    await fd.close();
  }

  const pattern = typeof args.pattern === "string" ? args.pattern : undefined;
  let regex: RegExp | undefined;
  if (pattern) {
    try {
      regex = new RegExp(pattern);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`invalid regex: ${msg}`);
    }
  }

  if (regex) {
    const matches: { line: number; snippet: string }[] = [];
    let totalLines = 0;
    await forEachLine(resolved, (lineNum, text) => {
      totalLines = lineNum;
      if (matches.length >= MAX_PATTERN_MATCHES) return false;
      const m = regex!.exec(text);
      if (m) {
        const start = Math.max(0, m.index - SNIPPET_RADIUS);
        const end = Math.min(
          text.length,
          m.index + m[0].length + SNIPPET_RADIUS,
        );
        matches.push({ line: lineNum, snippet: text.slice(start, end).trim() });
      }
      return true;
    });
    const truncated = matches.length >= MAX_PATTERN_MATCHES;
    return {
      content: JSON.stringify({
        path: resolved,
        bytes: stats.size,
        total_lines: totalLines,
        pattern,
        total_matches: matches.length,
        matches,
        ...(truncated
          ? {
              truncated: true,
              note: `Stopped at ${MAX_PATTERN_MATCHES} matches. Refine the pattern to narrow the search.`,
            }
          : {}),
      }),
      activity: {
        filePath: resolved,
        query: pattern,
        results: matches.slice(0, 20).map((m) => ({
          title: `${path.basename(resolved)}:${m.line}`,
          url: "",
        })),
      },
    };
  }

  const offset = Math.max(1, Math.floor(Number(args.offset) || 1));
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Math.floor(Number(args.limit) || DEFAULT_LIMIT)),
  );

  const collected: string[] = [];
  let totalLines = 0;
  let outputBytes = 0;
  let reachedByteCap = false;
  let nextOffset: number | undefined;

  await forEachLine(resolved, (lineNum, text) => {
    totalLines = lineNum;
    if (lineNum < offset) return true;
    if (collected.length >= limit) {
      nextOffset = lineNum;
      return false;
    }
    const lineStr = `${String(lineNum).padStart(6, " ")}\u2502 ${text}`;
    const lineBytes = Buffer.byteLength(lineStr, "utf-8") + 1;
    if (outputBytes + lineBytes > MAX_OUTPUT_BYTES) {
      reachedByteCap = true;
      nextOffset = lineNum;
      return false;
    }
    collected.push(lineStr);
    outputBytes += lineBytes;
    return true;
  });

  const last = offset + collected.length - 1;
  const hasMore = reachedByteCap || nextOffset !== undefined;
  const guidance = hasMore
    ? `Use offset=${nextOffset} to continue, or pass a pattern to search within this file.`
    : undefined;

  return {
    content: JSON.stringify({
      path: resolved,
      bytes: stats.size,
      total_lines: totalLines,
      offset,
      limit,
      returned: collected.length,
      has_more: hasMore,
      ...(reachedByteCap ? { byte_capped: true } : {}),
      ...(guidance ? { note: guidance } : {}),
      content: collected.join("\n"),
    }),
    activity: {
      filePath: resolved,
      results: [
        {
          title: `${path.basename(resolved)}:${offset}-${Math.max(offset, last)}`,
          url: "",
        },
      ],
    },
  };
}
