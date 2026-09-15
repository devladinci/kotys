import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BUILTIN_AGENTS,
  getAgent,
  listAgentNames,
  resolveAgent,
  scanAgents,
  toolsForAgent,
  renderAgentIndex,
} from "./registry.js";
import { parseAgentFile } from "./parse.js";
import { TOOL_DEFINITIONS } from "../../tools/index.js";

vi.mock("../events.js", () => ({
  events: { emitEvent: () => {} },
}));

const originalAgentsDir = process.env.KOTYS_AGENTS_DIR;

beforeEach(async () => {
  process.env.KOTYS_AGENTS_DIR = await mkdtemp(
    path.join(os.tmpdir(), "kotys-agents-"),
  );
});

afterEach(async () => {
  await rm(process.env.KOTYS_AGENTS_DIR ?? "", {
    recursive: true,
    force: true,
  });
  if (originalAgentsDir === undefined) delete process.env.KOTYS_AGENTS_DIR;
  else process.env.KOTYS_AGENTS_DIR = originalAgentsDir;
});

const writeAgent = async (name: string, content: string) => {
  await mkdir(path.join(process.env.KOTYS_AGENTS_DIR!, name), {
    recursive: true,
  });
  await writeFile(
    path.join(process.env.KOTYS_AGENTS_DIR!, name, "AGENT.md"),
    content,
  );
};

describe("parseAgentFile", () => {
  it("parses frontmatter and body", () => {
    const parsed = parseAgentFile(
      "---\ndescription: Does research\ntools:\n  - read_file\n---\n\nBody text here.",
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.agent.frontmatter.description).toBe("Does research");
      expect(parsed.agent.frontmatter.tools).toEqual(["read_file"]);
      expect(parsed.agent.body).toBe("Body text here.");
    }
  });

  it("rejects missing frontmatter", () => {
    const parsed = parseAgentFile("just text, no fence");
    expect(parsed.ok).toBe(false);
  });

  it("rejects an empty description", () => {
    const parsed = parseAgentFile('---\ndescription: ""\n---\nbody');
    expect(parsed.ok).toBe(false);
  });
});

describe("scanAgents", () => {
  it("scans valid agent dirs and tolerates broken ones", async () => {
    await writeAgent(
      "researcher",
      "---\ndescription: Research helper\n---\n\nBe thorough.",
    );
    await writeAgent("broken", "no frontmatter at all");
    await mkdir(path.join(process.env.KOTYS_AGENTS_DIR!, "empty"));

    const cache = await scanAgents();
    expect(cache.entries.map((e) => e.name)).toEqual(["researcher"]);
    expect(cache.broken.map((b) => b.name).sort()).toEqual(["broken", "empty"]);
  });

  it("returns an empty cache when the root does not exist", async () => {
    process.env.KOTYS_AGENTS_DIR = path.join(
      process.env.KOTYS_AGENTS_DIR!,
      "missing",
    );
    const cache = await scanAgents();
    expect(cache.entries).toEqual([]);
    expect(cache.broken).toEqual([]);
  });

  it("picks up tools config", async () => {
    await writeAgent(
      "writer",
      "---\ndescription: Writes files\ntools:\n  - read_file\n  - write_file\n  - apply_patch\n---\n\nWrite well.",
    );
    await scanAgents();
    const agent = getAgent("writer");
    expect(agent?.tools).toEqual(["read_file", "write_file", "apply_patch"]);
  });
});

describe("resolveAgent", () => {
  it("falls back to builtins", () => {
    expect(resolveAgent("explore")?.name).toBe("explore");
    expect(resolveAgent("general")?.name).toBe("general");
    expect(resolveAgent("nope")).toBeNull();
    expect(BUILTIN_AGENTS.map((a) => a.name)).toEqual(["explore", "general"]);
  });

  it("a user file overrides a builtin", async () => {
    await writeAgent(
      "explore",
      "---\ndescription: My own explorer\n---\n\nCustom body.",
    );
    await scanAgents();
    const agent = resolveAgent("explore");
    expect(agent?.description).toBe("My own explorer");
    expect(listAgentNames()).toContain("explore");
  });
});

describe("toolsForAgent", () => {
  it("defaults to the read-only set", () => {
    const agent = resolveAgent("explore")!;
    const names = toolsForAgent(agent, TOOL_DEFINITIONS).map(
      (d) => d.function.name,
    );
    expect(names).toEqual([
      "list",
      "read_file",
      "grep",
      "web_search",
      "web_fetch",
    ]);
  });

  it("never includes spawn_agent and filters unknown names", () => {
    const agent = resolveAgent("general")!;
    const names = toolsForAgent(
      { ...agent, tools: ["bash", "spawn_agent", "not_a_tool"] },
      TOOL_DEFINITIONS,
    ).map((d) => d.function.name);
    expect(names).toEqual(["bash"]);
  });
});

describe("renderAgentIndex", () => {
  it("lists user agents with descriptions", async () => {
    await writeAgent(
      "researcher",
      "---\ndescription: Research helper\n---\n\nBody.",
    );
    await scanAgents();
    const index = renderAgentIndex();
    expect(index).toContain("- researcher: Research helper");
  });
});
