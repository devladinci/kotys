import path from "node:path";
import { promises as fs } from "node:fs";
import { watch, type FSWatcher } from "node:fs";
import type {
  SkillFrontmatterParsed,
  SkillIndexTier,
  SkillListing,
  SkillSource,
  ToolArgs,
  ToolDefinition,
} from "@kotys/contracts";
import { getSetting, setSetting } from "@kotys/db";
import { events } from "../events.js";
import { firstSentence } from "../mcp.js";
import { skillsRoot } from "./paths.js";
import { SKILL_FILE, parseSkillDir, truncateBody } from "./parse.js";

const SKILLS_ENABLED_KEY = "skills_enabled";
export const LOAD_SKILL_NAME = "load_skill";

// Same shape of problem as MCP: ~40–100 tokens per skill in the index, so the
// advertisement is capped and truncated least-important-first.
const INDEX_SKILL_MAX = 50;
const INDEX_CHARS_MAX = 4096;
const SEARCH_LIMIT = 15;
const WATCH_DEBOUNCE_MS = 300;

export type SkillEntry = {
  /** Directory name — the skill's identity everywhere. */
  name: string;
  source: SkillSource;
  dir: string;
  frontmatter: SkillFrontmatterParsed;
  body: string;
};

/** A scanned directory that failed to parse; listed in settings, never advertised. */
type BrokenSkill = {
  name: string;
  source: SkillSource;
  dir: string;
  error: string;
};

type Cache = {
  entries: SkillEntry[];
  broken: BrokenSkill[];
  scannedAt: number;
};

let cache: Cache = { entries: [], broken: [], scannedAt: 0 };
let watcher: FSWatcher | null = null;
let watchTimer: NodeJS.Timeout | null = null;

// Missing = enabled, exactly like tools_enabled.
function getEnabledSkills(): Record<string, boolean> {
  const raw = getSetting(SKILLS_ENABLED_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      return parsed as Record<string, boolean>;
  } catch {
    // corrupt setting — treat as all-default
  }
  return {};
}

export function setSkillEnabled(name: string, enabled: boolean): void {
  const map = getEnabledSkills();
  if (enabled) delete map[name];
  else map[name] = false;
  setSetting(SKILLS_ENABLED_KEY, JSON.stringify(map));
}

/** Scan the skills root. The filesystem is the source of truth; no SQLite copy. */
export async function scanSkills(): Promise<Cache> {
  const user = await scanRoot(skillsRoot(), "user");
  cache = {
    entries: user.entries,
    broken: user.broken,
    scannedAt: Date.now(),
  };
  return cache;
}

async function scanRoot(
  root: string,
  source: SkillEntry["source"],
): Promise<{ entries: SkillEntry[]; broken: BrokenSkill[] }> {
  const entries: SkillEntry[] = [];
  const broken: BrokenSkill[] = [];
  let names: string[];
  try {
    names = (await fs.readdir(root, { withFileTypes: true }))
      .filter((d) => d.isDirectory() && !d.name.startsWith("."))
      .map((d) => d.name);
  } catch {
    return { entries, broken }; // root does not exist yet — normal on first run
  }
  for (const name of names) {
    const dir = path.join(root, name);
    const file = path.join(dir, SKILL_FILE);
    let raw: string;
    try {
      raw = await fs.readFile(file, "utf8");
    } catch {
      broken.push({ name, source, dir, error: "no SKILL.md in the directory" });
      continue;
    }
    const parsed = parseSkillDir(name, raw);
    if (!parsed.ok) {
      broken.push({ name, source, dir, error: parsed.error });
      continue;
    }
    entries.push({
      name,
      source,
      dir,
      frontmatter: parsed.skill.frontmatter,
      body: parsed.skill.body,
    });
  }
  return { entries, broken };
}

/** Debounced fs.watch on the skills root; a change re-scans and tells clients. */
function startSkillsWatcher(): void {
  if (watcher) return;
  try {
    const w = watch(skillsRoot(), { persistent: false }, () =>
      scheduleRescan(),
    );
    w.on("error", () => {
      // Root vanished mid-session; the rescan simply finds nothing.
    });
    watcher = w;
  } catch {
    // ENOENT — the directory does not exist yet; the cache stays empty.
  }
}

function scheduleRescan(): void {
  if (watchTimer) clearTimeout(watchTimer);
  watchTimer = setTimeout(() => {
    watchTimer = null;
    void scanSkills().then(() => {
      events.emitEvent("skills:changed");
    });
  }, WATCH_DEBOUNCE_MS);
}

/** Await once at startup so the first request does not race the watcher. */
export async function initSkills(): Promise<void> {
  await scanSkills();
  startSkillsWatcher();
}

export function listSkills(): SkillListing[] {
  const enabled = getEnabledSkills();
  return [...cache.entries, ...cache.broken].map((e) => toListing(e, enabled));
}

function toListing(
  e: SkillEntry | BrokenSkill,
  enabled: Record<string, boolean>,
): SkillListing {
  if ("frontmatter" in e) {
    const fm = e.frontmatter;
    return {
      name: e.name,
      description: fm.description,
      source: e.source,
      enabled: enabled[e.name] !== false,
      userInvocable: fm["user-invocable"] !== false,
      modelInvocable: fm["disable-model-invocation"] !== true,
      ...(fm["argument-hint"] ? { argumentHint: fm["argument-hint"] } : {}),
    };
  }
  const broken = e as BrokenSkill;
  return {
    name: broken.name,
    description: "",
    source: broken.source,
    enabled: enabled[broken.name] !== false,
    userInvocable: true,
    modelInvocable: true,
    error: broken.error,
  };
}

// ── Advertisement ────────────────────────────────────────────────────────────

export type SkillAdvertisement = {
  index: string;
  loadTool: ToolDefinition | null;
};

export function getSkillAdvertisement(
  tier: SkillIndexTier,
  enabled: (name: string) => boolean = (n) => getEnabledSkills()[n] !== false,
): SkillAdvertisement {
  const listed = cache.entries.filter(
    (e) =>
      enabled(e.name) && e.frontmatter["disable-model-invocation"] !== true,
  );
  if (listed.length === 0) return { index: "", loadTool: null };
  return {
    index: renderSkillIndex(listed, tier),
    loadTool: LOAD_SKILL_SHAPE,
  };
}

const LOAD_SKILL_SHAPE: ToolDefinition = {
  type: "function",
  category: "system",
  function: {
    name: LOAD_SKILL_NAME,
    description:
      'Load the full instructions for a skill so you can follow them. Available skills are listed under "Skills" in the system prompt: pass an exact name, or a query to search. Load a skill before starting the task it covers, not after.',
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Exact skill name from the Skills index.",
        },
        query: {
          type: "string",
          description:
            "Search terms, when the name is unknown or the index is truncated.",
        },
      },
    },
  },
};

export function renderSkillIndex(
  listed: SkillEntry[],
  tier: SkillIndexTier,
): string {
  if (listed.length === 0) return "";
  const lines: string[] = [];
  let chars = 0;
  let omitted = listed.length;
  for (const e of listed) {
    const desc =
      tier === "full"
        ? e.frontmatter.description
        : tier === "brief"
          ? firstSentence(e.frontmatter.description)
          : "";
    const line = `- ${e.name}${desc ? ` — ${desc}` : ""}`;
    if (
      lines.length >= INDEX_SKILL_MAX ||
      chars + line.length > INDEX_CHARS_MAX
    )
      break;
    lines.push(line);
    chars += line.length;
    omitted--;
  }
  const tail =
    omitted > 0
      ? `\n(+${omitted} more — pass a \`query\` to load_skill to find them)`
      : tier === "names"
        ? "\nNames only — pass a `query` to see what each covers."
        : "";
  return [
    "## Skills",
    "",
    "Procedures written for this machine. Each is a set of instructions you load before doing the task it covers — when one matches, call load_skill with its exact name and follow what it returns. Prefer a matching skill over improvising.",
    "",
    lines.join("\n") + tail,
  ].join("\n");
}

// ── Search + load ────────────────────────────────────────────────────────────

// Scores name matches above description matches; same shape as rankMcpTools.
export function rankSkills(
  listed: SkillEntry[],
  query: string,
): { entry: SkillEntry; score: number }[] {
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
  if (terms.length === 0) return [];
  const hits: { entry: SkillEntry; score: number }[] = [];
  for (const entry of listed) {
    const name = entry.name.toLowerCase();
    const desc = entry.frontmatter.description.toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (name === term) score += 20;
      else if (name.includes(term)) score += 8;
      if (desc.includes(term)) score += 2;
    }
    if (score > 0) hits.push({ entry, score });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, SEARCH_LIMIT);
}

/** The load_skill executor: exact name, else search, else a miss message. */
export function loadSkill(
  args: ToolArgs,
  enabled: (name: string) => boolean = (n) => getEnabledSkills()[n] !== false,
): { content: string; summary: string } {
  const name = typeof args.name === "string" ? args.name.trim() : "";
  const query = typeof args.query === "string" ? args.query.trim() : "";
  const enabledOf = (e: SkillEntry) => enabled(e.name);
  const pool = cache.entries.filter(enabledOf);

  if (name === "" && query === "")
    return {
      content:
        "Pass `name` (an exact skill name from the Skills index) or `query` to search.",
      summary: "no arguments",
    };

  if (name !== "") {
    const entry = pool.find((e) => e.name === name);
    if (entry)
      return {
        content: renderLoadedSkill(entry),
        summary: name,
      };
    if (cache.entries.some((e) => e.name === name && !enabledOf(e)))
      return {
        content: `Skill "${name}" is disabled in settings.`,
        summary: name,
      };
  }

  const searched = name !== "" ? name : query;
  const hits = rankSkills(pool, searched);
  if (hits.length === 0)
    return {
      content: `No skill matches "${searched}". Available skills are listed under "Skills" in the system prompt.`,
      summary: searched,
    };
  const lines = hits.map(
    (h) =>
      `- ${h.entry.name} — ${firstSentence(h.entry.frontmatter.description)}`,
  );
  return {
    content: [
      `Matches for "${searched}". Call load_skill again with the exact name you want:`,
      ...lines,
    ].join("\n"),
    summary: searched,
  };
}

function renderLoadedSkill(entry: SkillEntry): string {
  return [
    `Skill "${entry.name}" (from ${entry.dir}). Follow these instructions for the task they cover:`,
    "",
    truncateBody(entry.body),
  ].join("\n");
}
