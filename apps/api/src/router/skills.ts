import { z } from "zod";
import { listSkills, setSkillEnabled } from "../services/skills/registry.js";
import {
  createSkill,
  readSkill,
  removeSkill,
  updateSkill,
} from "../services/skills/write.js";
import { skillsRoot } from "../services/skills/paths.js";
import { events } from "../services/events.js";
import { pub } from "./base.js";

const skillWriteInput = z.object({
  name: z.string(),
  description: z.string(),
  argumentHint: z.string().optional(),
  disableModelInvocation: z.boolean().optional(),
  userInvocable: z.boolean().optional(),
  body: z.string(),
});

export const skillsRouter = {
  /** Everything on disk, including broken directories and toggles. */
  list: pub.handler(async () => listSkills()),

  /** One skill's parsed frontmatter + body, for the editor. */
  get: pub
    .input(z.object({ name: z.string() }))
    .handler(async ({ input }) => readSkill(input.name)),

  create: pub.input(skillWriteInput).handler(async ({ input }) => {
    await createSkill(input);
    events.emitEvent("skills:changed");
    return { ok: true as const };
  }),

  update: pub
    .input(skillWriteInput.extend({ currentName: z.string() }))
    .handler(async ({ input }) => {
      const { currentName, ...write } = input;
      await updateSkill(currentName, write);
      events.emitEvent("skills:changed");
      return { ok: true as const };
    }),

  remove: pub
    .input(z.object({ name: z.string() }))
    .handler(async ({ input }) => {
      await removeSkill(input.name);
      events.emitEvent("skills:changed");
      return { ok: true as const };
    }),

  /** Enable/disable a skill (missing = enabled, matching tools_enabled). */
  setEnabled: pub
    .input(z.object({ name: z.string(), enabled: z.boolean() }))
    .handler(async ({ input }) => {
      setSkillEnabled(input.name, input.enabled);
      events.emitEvent("skills:changed");
      return { ok: true as const };
    }),

  /** Open the skills directory in the OS file manager (desktop convenience). */
  reveal: pub.handler(async () => ({ dir: skillsRoot() })),
};
