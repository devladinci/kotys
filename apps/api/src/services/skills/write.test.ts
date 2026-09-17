import {
  mkdtemp,
  mkdir,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readSkill, removeSkill, updateSkill } from "./write.js";

vi.mock("@kotys/db", () => ({
  getSetting: () => null,
  setSetting: () => {},
}));
vi.mock("../events.js", () => ({
  events: { emitEvent: () => {} },
}));

const originalSkillsDir = process.env.KOTYS_SKILLS_DIR;
let root = "";

const seed = async (name: string): Promise<void> => {
  const dir = path.join(root, name);
  await mkdir(path.join(dir, "scripts"), { recursive: true });
  await writeFile(
    path.join(dir, "SKILL.md"),
    `---\nname: ${name.toLowerCase()}\ndescription: A skill\n---\nBody.\n`,
  );
};

beforeEach(async () => {
  root = await realpath(
    await mkdtemp(path.join(os.tmpdir(), "kotys-skills-write-")),
  );
  process.env.KOTYS_SKILLS_DIR = root;
  await seed("alpha");
  await seed("beta");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  if (originalSkillsDir === undefined) delete process.env.KOTYS_SKILLS_DIR;
  else process.env.KOTYS_SKILLS_DIR = originalSkillsDir;
});

const input = {
  name: "alpha",
  description: "A skill",
  body: "Body.",
};

describe("skill names that are not a single folder", () => {
  it("never removes the skills folder or a folder inside a skill", async () => {
    for (const name of ["", ".", "..", "alpha/..", "alpha/scripts"]) {
      await expect(removeSkill(name), name).rejects.toThrow();
    }
    expect((await readdir(root)).sort()).toEqual(["alpha", "beta"]);
    expect(await readdir(path.join(root, "alpha"))).toContain("scripts");
  });

  it("never writes outside a skill folder", async () => {
    for (const name of ["", ".", "alpha/.."]) {
      await expect(
        updateSkill(name, { ...input, name }),
        JSON.stringify(name),
      ).rejects.toThrow();
    }
    expect((await readdir(root)).sort()).toEqual(["alpha", "beta"]);
  });

  it("reads nothing for them", async () => {
    for (const name of ["", ".", "alpha/.."]) {
      expect(await readSkill(name)).toBeNull();
    }
  });

  it("still removes a folder whose name breaks the naming rules", async () => {
    await seed("PDF-Tools");
    await removeSkill("PDF-Tools");
    expect((await readdir(root)).sort()).toEqual(["alpha", "beta"]);
  });
});
