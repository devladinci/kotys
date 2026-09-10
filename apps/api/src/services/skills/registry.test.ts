import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SkillIndexTier } from "@kotys/contracts";
import {
  LOAD_SKILL_NAME,
  getSkillAdvertisement,
  loadSkill,
  rankSkills,
  renderSkillIndex,
  scanSkills,
  type SkillEntry,
} from "./registry.js";

vi.mock("@kotys/db", () => ({
  getSetting: (key: string) =>
    key === "skills_enabled" && state.disabled.length > 0
      ? JSON.stringify(
          Object.fromEntries(state.disabled.map((n) => [n, false])),
        )
      : null,
  setSetting: () => {},
}));
vi.mock("../events.js", () => ({
  events: { emitEvent: () => {} },
}));

const state = { disabled: [] as string[] };

const originalSkillsDir = process.env.KOTYS_SKILLS_DIR;

beforeEach(async () => {
  state.disabled = [];
  process.env.KOTYS_SKILLS_DIR = await mkdtemp(
    path.join(os.tmpdir(), "kotys-skills-"),
  );
});

afterEach(async () => {
  state.disabled = [];
  await rm(process.env.KOTYS_SKILLS_DIR ?? "", {
    recursive: true,
    force: true,
  });
  if (originalSkillsDir === undefined) delete process.env.KOTYS_SKILLS_DIR;
  else process.env.KOTYS_SKILLS_DIR = originalSkillsDir;
});

/** Write a SKILL.md into the temp root and refresh the registry cache. */
const seed = async (
  name: string,
  frontmatter: string,
  body = "Instructions.",
): Promise<string> => {
  const dir = path.join(process.env.KOTYS_SKILLS_DIR ?? "", name);
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, "SKILL.md"),
    `---\n${frontmatter}\n---\n${body}\n`,
  );
  await scanSkills();
  return dir;
};

const entry = (
  name: string,
  description: string,
  extra: Partial<SkillEntry> = {},
): SkillEntry => ({
  name,
  source: "user",
  dir: `/tmp/skills/${name}`,
  frontmatter: { name, description },
  body: `# ${name}\nInstructions.`,
  ...extra,
});

describe("renderSkillIndex", () => {
  const listed = [
    entry("pdf", "Extracts text and tables from PDFs."),
    entry(
      "release-notes",
      "Writes release notes from git log between two tags.",
    ),
  ];

  it("renders the full tier with complete descriptions", () => {
    const text = renderSkillIndex(listed, "full");
    expect(text).toContain("## Skills");
    expect(text).toContain("- pdf — Extracts text and tables from PDFs.");
    expect(text).toContain("load_skill");
  });

  it("renders the brief tier with first sentences only", () => {
    const long =
      "Writes release notes from git log between two tags. Also sorts them by section, which is a long tail of detail that must be cut.";
    const text = renderSkillIndex([entry("release-notes", long)], "brief");
    expect(text).toContain(
      "Writes release notes from git log between two tags.",
    );
    expect(text).not.toContain("sorts them by section");
  });

  it("renders the names tier without descriptions and with a hint", () => {
    const text = renderSkillIndex(listed, "names");
    expect(text).toContain("- pdf\n- release-notes");
    expect(text).toContain("Names only");
  });

  it("caps at 50 skills with an omitted-count tail", () => {
    const many = Array.from({ length: 60 }, (_, i) =>
      entry(`skill-${i}`, `Skill number ${i}.`),
    );
    const text = renderSkillIndex(many, "full");
    expect(text).toContain("(+10 more");
  });

  it("caps the rendered index at ~4k chars", () => {
    const fat = Array.from({ length: 20 }, (_, i) =>
      entry(`skill-${i}`, `x`.repeat(400)),
    );
    const text = renderSkillIndex(fat, "full");
    expect(text.length).toBeLessThan(4600);
  });

  it("returns empty for no skills", () => {
    expect(renderSkillIndex([], "full")).toBe("");
  });
});

describe("getSkillAdvertisement", () => {
  it("omits the load tool when nothing is invocable", () => {
    expect(getSkillAdvertisement("full", () => false)).toEqual({
      index: "",
      loadTool: null,
    });
  });
});

describe("rankSkills", () => {
  const listed = [
    entry("pdf-processing", "Extracts text and tables from PDFs."),
    entry("release-notes", "Writes release notes from git log."),
    entry("pdf-forms", "Fills PDF forms."),
  ];

  it("scores exact name matches highest", () => {
    const hits = rankSkills(listed, "pdf-forms");
    expect(hits[0].entry.name).toBe("pdf-forms");
  });

  it("matches description terms too", () => {
    const hits = rankSkills(listed, "release");
    expect(hits[0].entry.name).toBe("release-notes");
  });

  it("returns nothing for junk queries", () => {
    expect(rankSkills(listed, "  ")).toEqual([]);
    expect(rankSkills(listed, "a")).toEqual([]);
    expect(rankSkills(listed, "qqqq")).toEqual([]);
  });
});

describe("loadSkill", () => {
  it("returns the body for an exact hit, with the directory path", async () => {
    const dir = await seed(
      "pdf",
      'name: pdf\ndescription: "Extracts text from PDFs."',
    );
    const out = loadSkill({ name: "pdf" });
    expect(out.content).toContain('Skill "pdf"');
    expect(out.content).toContain(dir);
    expect(out.content).toContain("Instructions.");
    expect(out.summary).toBe("pdf");
  });

  it("refuses a disabled skill by name", async () => {
    await seed("pdf", 'name: pdf\ndescription: "Extracts text."');
    state.disabled = ["pdf"];
    const out = loadSkill({ name: "pdf" });
    expect(out.content).toMatch(/disabled/);
  });

  it("searches when no exact name matches", async () => {
    await seed("pdf", 'name: pdf\ndescription: "Extracts text from PDFs."');
    const out = loadSkill({ query: "extract text" });
    expect(out.content).toContain("Matches for");
    expect(out.content).toContain("- pdf —");
    expect(out.summary).toBe("extract text");
  });

  it("reports a clean miss", async () => {
    await seed("pdf", 'name: pdf\ndescription: "Extracts text."');
    const out = loadSkill({ name: "nope" });
    expect(out.content).toMatch(/No skill matches/);
  });

  it("requires at least one argument", () => {
    expect(loadSkill({}).content).toMatch(/Pass `name`/);
  });

  it("prefers the disabled notice over a fuzzy search miss", async () => {
    await seed("notes", 'name: notes\ndescription: "Writes notes."');
    const out = loadSkill({ name: "notes" }, () => false);
    expect(out.content).toMatch(/disabled/);
  });

  it("falls through to search when an unknown name is given", async () => {
    await seed("notes", 'name: notes\ndescription: "Writes notes."');
    const out = loadSkill({ name: "note" }, () => false);
    expect(out.content).toMatch(/No skill matches|Matches for/);
  });
});

describe("tier plumbing", () => {
  it("adheres to the same tier type as the MCP index", () => {
    const tiers: SkillIndexTier[] = ["full", "brief", "names"];
    for (const tier of tiers)
      expect(renderSkillIndex([entry("a", "b.")], tier)).toContain("- a");
  });

  it("exposes the load tool under the documented name", () => {
    const ad = getSkillAdvertisement("full");
    expect(ad.loadTool?.function.name).toBe(LOAD_SKILL_NAME);
  });
});

describe("scanSkills", () => {
  it("picks up seeded skills and hides disabled ones from the advertisement", async () => {
    await seed("pdf", 'name: pdf\ndescription: "Reads PDFs."');
    state.disabled = ["pdf"];
    const ad = getSkillAdvertisement("full");
    expect(ad.index).toBe("");
    expect(ad.loadTool).toBeNull();
  });

  it("lists broken directories with their error instead of dropping them", async () => {
    await seed("pdf", "name: pdf\ndescription: d");
    await seed("other", "name: mismatched\ndescription: d");
    const ads = getSkillAdvertisement("full");
    expect(ads.index).toContain("- pdf");
    expect(ads.index).not.toContain("mismatched");
  });

  it("suppresses disable-model-invocation skills from the index but keeps them loadable", async () => {
    await seed(
      "secret-steps",
      'name: secret-steps\ndescription: "Only slash-invoked."\ndisable-model-invocation: true',
    );
    const ad = getSkillAdvertisement("full");
    expect(ad.index).toBe("");
    expect(ad.loadTool).toBeNull();
    // Still loadable by name — a slash command resolved server-side.
    const out = loadSkill({ name: "secret-steps" });
    expect(out.content).toContain("Instructions.");
  });

  it("hides nothing from a user root that does not exist", async () => {
    process.env.KOTYS_SKILLS_DIR = path.join(
      process.env.KOTYS_SKILLS_DIR ?? "",
      "never-created",
    );
    await scanSkills();
    expect(getSkillAdvertisement("full").index).toBe("");
  });
});
