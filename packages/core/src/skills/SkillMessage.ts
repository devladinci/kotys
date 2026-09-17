import {
  parseSlashCommand,
  SKILL_FENCE_PREFIX,
  substituteSkillArgs,
} from "./slashCommand.js";

const SKILL_FENCE = new RegExp(
  "```" +
    SKILL_FENCE_PREFIX.replace(":", "\\:") +
    "([a-z0-9-]*)\\n([\\s\\S]*?)\\n?```",
);

export class SkillMessage {
  readonly name: string;
  readonly args: string;
  readonly body: string;

  private constructor(name: string, args: string, body: string) {
    this.name = name;
    this.args = args;
    this.body = body;
  }

  static fromContent(content: string): SkillMessage | null {
    const fence = SKILL_FENCE.exec(content);
    if (!fence) return null;

    const parsed = parseSlashCommand(content.slice(0, fence.index));
    if (!parsed) return null;

    return new SkillMessage(parsed.name, parsed.args, fence[2]);
  }

  static build(name: string, args: string, body: string): string {
    const header = `/${name}${args ? ` ${args}` : ""}`;
    const fenced = `\`\`\`${SKILL_FENCE_PREFIX}${name}\n${substituteSkillArgs(body, args).trimEnd()}\n\`\`\``;
    return `${header}\n\n${fenced}`;
  }

  // The fence renders as the skill chip, so the raw header is dropped to
  // avoid showing the invocation twice.
  get displayContent(): string {
    const fence = `\`\`\`${SKILL_FENCE_PREFIX}${this.name}\n${this.body}\n\`\`\``;
    return this.args ? `${this.args}\n\n${fence}` : fence;
  }
}
