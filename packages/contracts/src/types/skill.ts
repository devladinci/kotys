/**
 * A user-authored skill: a directory with a SKILL.md (Agent Skills spec,
 * agentskills.io) plus optional scripts/, references/, assets/.
 */
export type SkillSource = "user" | "bundled";

/** Same ladder as the MCP index: context length decides what is advertised. */
export type SkillIndexTier = "full" | "brief" | "names";

/** A skill as listed to the settings UI. `error` marks a directory that failed to parse. */
export type SkillListing = {
  /** Directory name; for unparsable skills this is all we have. */
  name: string;
  description: string;
  source: SkillSource;
  enabled: boolean;
  /** false = hidden from the / menu (Claude Code's user-invocable). */
  userInvocable: boolean;
  /** false = slash-only, the model never auto-triggers it. */
  modelInvocable: boolean;
  argumentHint?: string;
  /** Parse/validation failure, shown inline instead of silently dropping the row. */
  error?: string;
};
