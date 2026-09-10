import { parseSlashCommand, SKILL_FENCE_PREFIX, substituteSkillArgs } from "./slashCommand.js";

/**
 * A persisted skill invocation: the typed `/name args` header followed by the
 * substituted skill body in a `kotys-skill:` fence. Owns both building and
 * parsing of that form so senders and renderers never re-implement it.
 */
export class SkillMessage {
  readonly name: string;
  readonly args: string;
  readonly body: string;

  private constructor(name: string, args: string, body: string) {
    this.name = name;
    this.args = args;
    this.body = body;
  }

  /** Parses a persisted message; null when it is not a skill invocation. */
  static fromContent(content: string): SkillMessage | null {
    const lineBreak = content.indexOf("\n");
    const header = lineBreak === -1 ? content : content.slice(0, lineBreak);
    const parsed = parseSlashCommand(header);
    if (!parsed) return null;

    const fence = new RegExp(
      "```" +
        SKILL_FENCE_PREFIX.replace(":", "\\:") +
        "([a-z0-9-]*)\\n([\\s\\S]*?)\\n?```",
    ).exec(content);
    if (!fence) return null;

    return new SkillMessage(parsed.name, parsed.args, fence[2]);
  }

  /** The persisted form written by the composer send path. */
  static build(name: string, args: string, body: string): string {
    const header = `/${name}${args ? ` ${args}` : ""}`;
    const fenced = `\`\`\`${SKILL_FENCE_PREFIX}${name}\n${substituteSkillArgs(body, args).trimEnd()}\n\`\`\``;
    return `${header}\n\n${fenced}`;
  }

  /**
   * The content a user bubble feeds to its markdown renderer: the typed
   * arguments, then the fenced body. The raw header is dropped — the fence
   * renders as the skill chip, so the invocation is never shown twice.
   */
  get displayContent(): string {
    const fence = `\`\`\`${SKILL_FENCE_PREFIX}${this.name}\n${this.body}\n\`\`\``;
    return this.args ? `${this.args}\n\n${fence}` : fence;
  }
}
