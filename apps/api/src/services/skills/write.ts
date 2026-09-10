import path from "node:path";
import { promises as fs } from "node:fs";
import { skillsRoot, containsPath } from "./paths.js";
import { SKILL_BODY_MAX, SKILL_FILE, parseSkillDir } from "./parse.js";
import { scanSkills } from "./registry.js";

/**
 * Serialise frontmatter to YAML by hand: the field set is small and known,
 * and hand-rolled quoting avoids pulling a serializer's config surface into
 * the write path. Values go through YAML-safe quoting.
 */
function serializeFrontmatter(fields: {
  name: string;
  description: string;
  argumentHint?: string;
  disableModelInvocation?: boolean;
  userInvocable?: boolean;
}): string {
  const lines = [
    `name: ${yamlQuote(fields.name)}`,
    `description: ${yamlQuote(fields.description)}`,
  ];
  if (fields.argumentHint?.trim())
    lines.push(`argument-hint: ${yamlQuote(fields.argumentHint.trim())}`);
  if (fields.disableModelInvocation === true)
    lines.push("disable-model-invocation: true");
  if (fields.userInvocable === false) lines.push("user-invocable: false");
  return lines.join("\n");
}

function yamlQuote(value: string): string {
  // Quote unless the value is trivially safe unquoted (letters, digits, hyphen,
  // space, and not a YAML special).
  if (/^[A-Za-z0-9][A-Za-z0-9 _-]*$/.test(value) && value.trim() === value)
    return value;
  return JSON.stringify(value);
}

export type SkillWriteInput = {
  name: string;
  description: string;
  argumentHint?: string;
  disableModelInvocation?: boolean;
  userInvocable?: boolean;
  body: string;
};

/** Spec rules, for the editor's live feedback and the write path alike. */
function validateSkillInput(
  input: SkillWriteInput,
  currentName?: string,
): string | null {
  if (input.name !== currentName) {
    // A rename may reuse the current name (directory overwritten in place).
    if (input.name.length > 64) return "name must be 64 characters or fewer";
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.name))
      return "name must be a-z0-9 and hyphens only, no leading/trailing hyphen";
  }
  if (input.description.trim().length === 0) return "description is required";
  if (input.description.length > 1024)
    return "description must be 1024 characters or fewer";
  if (input.body.length > SKILL_BODY_MAX) return "body exceeds 64 KB";
  return null;
}

/** Build the full SKILL.md text from typed fields + a Markdown body. */
function buildSkillFile(input: SkillWriteInput): string {
  return `---\n${serializeFrontmatter(input)}\n---\n${input.body.replace(/^\n/, "")}`;
}

/** Create a skill directory + SKILL.md atomically (temp file, then rename). */
export async function createSkill(input: SkillWriteInput): Promise<void> {
  const error = validateSkillInput(input);
  if (error) throw new Error(error);
  const dir = path.join(skillsRoot(), input.name);
  if (!(await containsPath(skillsRoot(), dir))) throw new Error("invalid path");
  if (await exists(dir)) throw new Error(`"${input.name}" already exists`);
  await fs.mkdir(dir, { recursive: true });
  await atomicWrite(path.join(dir, SKILL_FILE), buildSkillFile(input));
  await scanSkills();
}

/** Update in place; a rename moves the directory to keep name == dirname. */
export async function updateSkill(
  currentName: string,
  input: SkillWriteInput,
): Promise<void> {
  const error = validateSkillInput(input, currentName);
  if (error) throw new Error(error);
  const currentDir = path.join(skillsRoot(), currentName);
  if (!(await containsPath(skillsRoot(), currentDir)))
    throw new Error(`skill "${currentName}" does not exist`);
  const nextDir = path.join(skillsRoot(), input.name);
  if (input.name !== currentName) {
    if (await exists(nextDir))
      throw new Error(`"${input.name}" already exists`);
    await fs.rename(currentDir, nextDir);
  }
  await atomicWrite(path.join(nextDir, SKILL_FILE), buildSkillFile(input));
  await scanSkills();
}

/** Delete a skill directory after confirming it belongs to the root. */
export async function removeSkill(name: string): Promise<void> {
  const dir = path.join(skillsRoot(), name);
  const real = await fs.realpath(dir).catch(() => dir);
  if (!(await containsPath(skillsRoot(), real)))
    throw new Error(`skill "${name}" does not exist`);
  await fs.rm(dir, { recursive: true, force: true });
  await scanSkills();
}

/** Read one skill for the editor (404-ish when absent). */
export async function readSkill(name: string): Promise<{
  name: string;
  description: string;
  argumentHint?: string;
  disableModelInvocation: boolean;
  userInvocable: boolean;
  body: string;
} | null> {
  const dir = path.join(skillsRoot(), name);
  if (!(await containsPath(skillsRoot(), dir))) return null;
  let raw: string;
  try {
    raw = await fs.readFile(path.join(dir, SKILL_FILE), "utf8");
  } catch {
    return null;
  }
  const parsed = parseSkillDir(name, raw);
  if (!parsed.ok) throw new Error(parsed.error);
  const fm = parsed.skill.frontmatter;
  return {
    name: fm.name,
    description: fm.description,
    ...(fm["argument-hint"] ? { argumentHint: fm["argument-hint"] } : {}),
    disableModelInvocation: fm["disable-model-invocation"] === true,
    userInvocable: fm["user-invocable"] !== false,
    body: parsed.skill.body,
  };
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function atomicWrite(file: string, text: string): Promise<void> {
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, text, "utf8");
  await fs.rename(tmp, file);
}
