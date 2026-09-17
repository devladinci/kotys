export const SKILL_FENCE_PREFIX = "kotys-skill:";

export type ParsedSlashCommand = {
  name: string;
  args: string;
};

export type SlashQuery = {
  query: string;
  from: number;
  to: number;
};

export type SlashInsert = {
  text: string;
  cursor: number;
};

const LEADING_COMMAND = /^\s*\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\s+([\s\S]*))?$/;
const INLINE_COMMAND =
  /(?:^|\s)\/([a-z0-9]+(?:-[a-z0-9]+)*)(?=[.,;:!?)]*(?:\s|$))/g;
const CODE_SPANS = /```[\s\S]*?(?:```|$)|`[^`\n]*`/g;

export function parseSlashCommand(text: string): ParsedSlashCommand | null {
  const match = LEADING_COMMAND.exec(text);
  if (!match) return null;
  return { name: match[1], args: (match[2] ?? "").trim() };
}

export function findSlashCommands(text: string): ParsedSlashCommand[] {
  const leading = parseSlashCommand(text);
  const found = leading ? [leading] : [];
  const args = text.trim();
  for (const [, name] of text
    .replace(CODE_SPANS, " ")
    .matchAll(INLINE_COMMAND)) {
    if (found.some((command) => command.name === name)) continue;
    found.push({ name, args });
  }
  return found;
}

export function findSlashQuery(
  text: string,
  cursor: number,
): SlashQuery | null {
  // Selection events can arrive before the text change they belong to.
  const at = Math.min(cursor, text.length);
  const head = /(?:^|\s)\/([a-z0-9-]*)$/.exec(text.slice(0, at));
  const tail = /^[a-z0-9-]*(?=\s|$)/.exec(text.slice(at));
  if (!head || !tail) return null;
  return {
    query: head[1] + tail[0],
    from: at - head[1].length - 1,
    to: at + tail[0].length,
  };
}

export function insertSlashCommand(
  text: string,
  query: SlashQuery,
  name: string,
): SlashInsert {
  const head = `${text.slice(0, query.from)}/${name} `;
  return {
    text: head + text.slice(query.to).replace(/^ +/, ""),
    cursor: head.length,
  };
}

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
