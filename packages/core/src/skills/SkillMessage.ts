import type { ParsedSlashCommand } from "./slashCommand.js";
import {
  parseSlashCommand,
  SKILL_FENCE_PREFIX,
  substituteSkillArgs,
} from "./slashCommand.js";

const SKILL_FENCE = new RegExp(
  "```" +
    SKILL_FENCE_PREFIX.replace(":", "\\:") +
    "([a-z0-9-]+)\\n([\\s\\S]*?)\\n?```",
);

export class SkillMessage {
  readonly name: string;
  readonly args: string;
  readonly text: string;
  readonly body: string;

  private constructor(name: string, args: string, text: string, body: string) {
    this.name = name;
    this.args = args;
    this.text = text;
    this.body = body;
  }

  static fromContent(content: string): SkillMessage | null {
    const fence = SKILL_FENCE.exec(content);
    if (!fence) return null;

    const name = fence[1];
    const text = content.slice(0, fence.index).trim();
    const leading = parseSlashCommand(text);
    const args = leading?.name === name ? leading.args : text;
    return new SkillMessage(name, args, text, fence[2]);
  }

  static typedText(content: string): string {
    return SkillMessage.fromContent(content)?.text ?? content;
  }

  static build(
    text: string,
    { name, args }: ParsedSlashCommand,
    body: string,
  ): string {
    const fenced = `\`\`\`${SKILL_FENCE_PREFIX}${name}\n${substituteSkillArgs(body, args).trimEnd()}\n\`\`\``;
    return `${text.trim()}\n\n${fenced}`;
  }

  // The fence renders as the skill chip, so a leading command is dropped to
  // avoid showing the invocation twice.
  get displayContent(): string {
    const fence = `\`\`\`${SKILL_FENCE_PREFIX}${this.name}\n${this.body}\n\`\`\``;
    return this.args ? `${this.args}\n\n${fence}` : fence;
  }
}
