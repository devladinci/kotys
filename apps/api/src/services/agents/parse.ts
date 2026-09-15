import { parse as parseYaml } from "yaml";
import {
  AGENT_FRONTMATTER_SCHEMA,
  type AgentFrontmatterParsed,
} from "@kotys/contracts";

export const AGENT_FILE = "AGENT.md";
/** Same cap as skills: a body over this is truncated, not banned. */
const AGENT_BODY_MAX = 64 * 1024;

const FRONTMATTER_MAX = 8 * 1024;

export type ParsedAgent = {
  frontmatter: AgentFrontmatterParsed;
  body: string;
};

/**
 * Split `---\nYAML\n---` off the top of AGENT.md. Mirrors skills/parse.ts;
 * the < and > ban exists because this text is rendered into a system prompt.
 */
export function parseAgentFile(
  raw: string,
): { ok: true; agent: ParsedAgent } | { ok: false; error: string } {
  const text = raw.startsWith("﻿") ? raw.slice(1) : raw;
  const normalized = text.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n") && normalized !== "---")
    return {
      ok: false,
      error: "AGENT.md must start with a --- frontmatter block",
    };
  const end = normalized.indexOf("\n---", 4);
  if (end === -1)
    return { ok: false, error: "AGENT.md frontmatter is not closed with ---" };
  const yamlText = normalized.slice(4, end);
  if (yamlText.length > FRONTMATTER_MAX)
    return { ok: false, error: "frontmatter exceeds 8 KB" };
  if (/[<>]/.test(yamlText))
    return {
      ok: false,
      error:
        "frontmatter must not contain < or > (rendered into system prompts)",
    };
  let parsed: unknown;
  try {
    parsed = parseYaml(yamlText);
  } catch (err) {
    return { ok: false, error: `invalid YAML: ${yamlMessage(err)}` };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
    return { ok: false, error: "frontmatter must be a YAML mapping" };
  const result = AGENT_FRONTMATTER_SCHEMA.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue.path.length > 0 ? issue.path.join(".") : "frontmatter";
    return { ok: false, error: `${where}: ${issue.message}` };
  }
  const body = normalized.slice(end + 4).replace(/^\n+/, "");
  if (body.length > AGENT_BODY_MAX) {
    return {
      ok: true,
      agent: {
        frontmatter: result.data,
        body: `${body.slice(0, AGENT_BODY_MAX)}\n\n[truncated]`,
      },
    };
  }
  return { ok: true, agent: { frontmatter: result.data, body } };
}

function yamlMessage(err: unknown): string {
  if (err instanceof Error) return err.message.split("\n")[0];
  return String(err);
}
