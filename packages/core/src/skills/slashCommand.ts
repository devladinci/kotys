/**
 * Parsing and argument substitution for `/skill-name args` composer input.
 * Pure functions, no DOM — unit-testable without React.
 */
export const SKILL_FENCE_PREFIX = "kotys-skill:";

/** A `/command` at the very start of the composer text. */
export type ParsedSlashCommand = {
  /** Name without the leading slash, lowercased, trimmed. */
  name: string;
  /** Everything after the name, trimmed; "" when absent. */
  args: string;
  /** Full raw text (for echo-back / edit flows). */
  raw: string;
};

/**
 * Recognise a leading `/name` token. `"/pdf v1"` parses; `"/pdf/v1"` does not
 * (slash inside the name), nor does a `/` deeper in the text.
 */
export function parseSlashCommand(text: string): ParsedSlashCommand | null {
  const trimmedStart = text.replace(/^\s+/, "");
  if (!trimmedStart.startsWith("/")) return null;
  const m = /^\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\s+([\s\S]*))?$/.exec(
    trimmedStart,
  );
  if (!m) return null;
  return { name: m[1], args: (m[2] ?? "").trim(), raw: text };
}

/** Composer slash-menu state: the bare `/` and partial names match too. */
export type SlashQuery = {
  /** Name typed so far, possibly "" for a bare `/`. */
  query: string;
  args: string;
  raw: string;
};

/**
 * Autocomplete counterpart of parseSlashCommand: it must match while the name
 * is still being typed (`/`, `/rel`, `/release-`), so unlike parseSlashCommand
 * it accepts an empty or hyphen-terminated name. Sending still goes through
 * parseSlashCommand, which requires a complete name.
 */
export function parseSlashQuery(text: string): SlashQuery | null {
  const trimmedStart = text.replace(/^\s+/, "");
  if (!trimmedStart.startsWith("/")) return null;
  const m = /^\/([a-z0-9-]*)(?:\s+([\s\S]*))?$/.exec(trimmedStart);
  if (!m) return null;
  return { query: m[1], args: (m[2] ?? "").trim(), raw: text };
}

/**
 * Substitute `$ARGUMENTS` (the whole string) and `$0`–`$9` (positional, split
 * on whitespace) into a skill body. Unknown positions become "".
 */
export function substituteSkillArgs(body: string, args: string): string {
  const positional = args.split(/\s+/).filter(Boolean);
  return body
    .replaceAll("$ARGUMENTS", args)
    .replaceAll(/\$(\d)/g, (_match, digits: string) => {
      const index = Number(digits);
      if (index === 0) return args;
      return positional[index - 1] ?? "";
    });
}

/**
 * The persisted user-message form: the typed command echoed, then the skill
 * body in a fenced block the renderer can collapse into a chip.
 */
export function buildSkillMessage(
  name: string,
  args: string,
  body: string,
): string {
  const header = `/${name}${args ? ` ${args}` : ""}`;
  return `${header}\n\n\`\`\`${SKILL_FENCE_PREFIX}${name}\n${substituteSkillArgs(body, args).trimEnd()}\n\`\`\``;
}

/** Extract the fenced body from a persisted skill message. */
export function extractSkillMessage(
  content: string,
): { name: string; args: string; body: string } | null {
  const first = content.indexOf("\n");
  const header = first === -1 ? content : content.slice(0, first);
  const parsed = parseSlashCommand(header);
  if (!parsed) return null;
  const match = new RegExp(
    "```" +
      SKILL_FENCE_PREFIX.replace(":", "\\:") +
      "([a-z0-9-]*)\\n([\\s\\S]*?)\\n?```",
  ).exec(content);
  if (!match) return null;
  return { name: parsed.name, args: parsed.args, body: match[2] };
}
