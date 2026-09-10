import type { ToolArgs } from "@kotys/contracts";

const ARG_SUMMARY_MAX = 120;
const CONTENT_ARG_KEYS = [
  "query",
  "q",
  "jql",
  "cql",
  "search",
  "searchString",
  "pattern",
  "command",
  "text",
  "message",
  "prompt",
  "title",
  "name",
  "summary",
  "path",
  "url",
];
const NOISY_ARG_KEY =
  /^(cloud_?id|api_?key|token|secret|limit|max_?\w*|offset|cursor|page|per_?page|format|type|sort|order|dry_?run|include_?\w*|fields|expand)$/i;

function scalarArg(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

const clamp = (value: string, max: number) =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value;

export function summarizeMcpArgs(args: ToolArgs): string | undefined {
  const repo = scalarArg(args.repo) ?? scalarArg(args.repository);
  if (repo) {
    const owner = scalarArg(args.owner) ?? scalarArg(args.org);
    const number =
      scalarArg(args.pullNumber) ??
      scalarArg(args.pull_number) ??
      scalarArg(args.issue_number) ??
      scalarArg(args.number);
    const slug = owner ? `${owner}/${repo}` : repo;
    return number ? `${slug}#${number}` : slug;
  }
  const channel =
    scalarArg(args.channel_name) ??
    scalarArg(args.channel) ??
    scalarArg(args.channel_id);
  if (channel) return /^[#@]/.test(channel) ? channel : `#${channel}`;
  const issue =
    scalarArg(args.issueKey) ??
    scalarArg(args.issueIdOrKey) ??
    scalarArg(args.issue_key) ??
    scalarArg(args.key);
  if (issue) return clamp(issue, ARG_SUMMARY_MAX);
  for (const key of CONTENT_ARG_KEYS) {
    const value = scalarArg(args[key]);
    if (value) return clamp(value, ARG_SUMMARY_MAX);
  }
  for (const [key, raw] of Object.entries(args)) {
    if (NOISY_ARG_KEY.test(key)) continue;
    const value = scalarArg(raw);
    if (value && value.length <= 60) return value;
  }
  return undefined;
}

const PREVIEW_ITEMS = 5;
const PREVIEW_CHARS = 160;
const ITEM_TITLE_KEYS = [
  "title",
  "name",
  "summary",
  "subject",
  "key",
  "text",
  "label",
  "path",
  "id",
];

function firstArray(value: unknown): unknown[] | undefined {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      if (Array.isArray(nested) && nested.length > 0) return nested;
    }
  }
  return undefined;
}

function itemTitle(item: unknown): string {
  if (typeof item === "string" || typeof item === "number")
    return clamp(String(item), PREVIEW_CHARS);
  if (item && typeof item === "object") {
    const record = item as Record<string, unknown>;
    for (const key of ITEM_TITLE_KEYS) {
      const value = scalarArg(record[key]);
      if (value) return clamp(value, PREVIEW_CHARS);
    }
  }
  try {
    return clamp(JSON.stringify(item) ?? "", PREVIEW_CHARS);
  } catch {
    return "";
  }
}

export function previewResults(text: string): { title: string; url: string }[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    parsed = undefined;
  }
  const items = parsed === undefined ? undefined : firstArray(parsed);
  if (items) {
    return items
      .slice(0, PREVIEW_ITEMS)
      .map((item) => ({
        title: itemTitle(item),
        url:
          item && typeof item === "object"
            ? (scalarArg((item as Record<string, unknown>).url) ?? "")
            : "",
      }))
      .filter((r) => r.title !== "");
  }
  return trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, PREVIEW_ITEMS)
    .map((line) => ({ title: clamp(line, PREVIEW_CHARS), url: "" }));
}
