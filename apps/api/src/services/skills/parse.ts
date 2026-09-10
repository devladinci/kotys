import { parse as parseYaml } from "yaml";
import {
  SKILL_FRONTMATTER_SCHEMA,
  type SkillFrontmatterParsed,
} from "@kotys/contracts";

export const SKILL_FILE = "SKILL.md";
/** Bodies above this are truncated at load time, not banned at parse time. */
export const SKILL_BODY_MAX = 64 * 1024;

const FRONTMATTER_MAX = 8 * 1024;

export type ParsedSkill = {
  frontmatter: SkillFrontmatterParsed;
  body: string;
};

/**
 * Split `---\nYAML\n---` off the top of SKILL.md. The fence must be the very
 * first line; the spec's `<`/`>` ban applies to the raw frontmatter text,
 * because that text is what gets rendered into a system prompt.
 */
export function splitFrontmatter(
  raw: string,
):
  | { ok: true; frontmatter: SkillFrontmatterParsed; body: string }
  | { ok: false; error: string } {
  const text = raw.startsWith("﻿") ? raw.slice(1) : raw;
  const normalized = text.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n") && normalized !== "---")
    return {
      ok: false,
      error: "SKILL.md must start with a --- frontmatter block",
    };
  const end = normalized.indexOf("\n---", 4);
  if (end === -1)
    return { ok: false, error: "SKILL.md frontmatter is not closed with ---" };
  const yamlText = normalized.slice(4, end);
  if (yamlText.length > FRONTMATTER_MAX)
    return { ok: false, error: "frontmatter exceeds 8 KB" };
  if (/[<>]/.test(yamlText))
    return {
      ok: false,
      error:
        "frontmatter must not contain < or > (spec rule — it is rendered into prompts)",
    };
  let parsed: unknown;
  try {
    parsed = parseYaml(yamlText);
  } catch (err) {
    return { ok: false, error: `invalid YAML: ${yamlMessage(err)}` };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
    return { ok: false, error: "frontmatter must be a YAML mapping" };
  const result = SKILL_FRONTMATTER_SCHEMA.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue.path.length > 0 ? issue.path.join(".") : "frontmatter";
    return { ok: false, error: `${where}: ${issue.message}` };
  }
  return {
    ok: true,
    frontmatter: result.data,
    body: normalized.slice(end + 4).replace(/^\n/, ""),
  };
}

function yamlMessage(err: unknown): string {
  if (err instanceof Error) return err.message.split("\n")[0];
  return String(err);
}

/** Parse with the name-matches-directory rule layered on top. */
export function parseSkillDir(
  dirname: string,
  raw: string,
): { ok: true; skill: ParsedSkill } | { ok: false; error: string } {
  const split = splitFrontmatter(raw);
  if (!split.ok) return split;
  if (split.frontmatter.name !== dirname)
    return {
      ok: false,
      error: `frontmatter name "${split.frontmatter.name}" does not match directory "${dirname}"`,
    };
  return {
    ok: true,
    skill: { frontmatter: split.frontmatter, body: split.body },
  };
}

export function truncateBody(body: string): string {
  if (body.length <= SKILL_BODY_MAX) return body;
  return `${body.slice(0, SKILL_BODY_MAX)}\n\n[truncated — read the rest with read_file]`;
}
