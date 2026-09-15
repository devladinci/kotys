import { z } from "zod";

/** Same shape rules as skill names — the directory is the identity. */
export const AGENT_NAME_SCHEMA = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const AGENT_FRONTMATTER_SCHEMA = z.object({
  description: z.string().min(1).max(1024),
  /**
   * Tool names the subagent may use. Names not in the builtin toolset are
   * ignored. Omitted = read-only defaults (list, read_file, grep, glob,
   * web_search, web_fetch).
   */
  tools: z.array(z.string().min(1).max(64)).max(32).optional(),
});

export type AgentFrontmatterParsed = z.infer<typeof AGENT_FRONTMATTER_SCHEMA>;
