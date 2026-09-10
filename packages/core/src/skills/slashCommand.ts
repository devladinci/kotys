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
