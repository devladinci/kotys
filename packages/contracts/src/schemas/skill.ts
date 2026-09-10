import { z } from "zod";

/**
 * Agent Skills spec: 1–64 chars, a-z0-9 and hyphens only, no leading/trailing
 * hyphen, no doubled hyphen. The regex encodes all four at once: hyphens may
 * only sit between alphanumeric runs.
 */
export const SKILL_NAME_SCHEMA = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const SKILL_FRONTMATTER_SCHEMA = z.object({
  name: SKILL_NAME_SCHEMA,
  description: z.string().min(1).max(1024),
  license: z.string().min(1).optional(),
  compatibility: z.string().max(500).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  "allowed-tools": z.string().optional(),
  "disable-model-invocation": z.boolean().optional(),
  "user-invocable": z.boolean().optional(),
  "argument-hint": z.string().max(200).optional(),
});

export type SkillFrontmatterParsed = z.infer<typeof SKILL_FRONTMATTER_SCHEMA>;
