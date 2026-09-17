import { getRpc } from "../shared/clients.js";
import type { ParsedSlashCommand } from "./slashCommand.js";
import { SkillMessage } from "./SkillMessage.js";

export async function expandSkill(
  text: string,
  commands: ParsedSlashCommand[],
): Promise<string> {
  const details = await Promise.all(
    commands.map((command) =>
      getRpc()
        .skills.get({ name: command.name })
        .catch(() => null),
    ),
  );

  const index = details.findIndex(Boolean);
  const detail = details[index];
  if (!detail) return text;
  return SkillMessage.build(text, commands[index], detail.body);
}
