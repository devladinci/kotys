import os from "node:os";
import path from "node:path";

/**
 * Skills live in a dotfile directory, deliberately outside the tool denylist:
 * skills bundle scripts/ and references/ the model must read and run, and
 * anything under ~/Library/Application Support/Kotys is off-limits to its own
 * file tools (see tools/sensitive_paths.ts).
 */
export function skillsRoot(): string {
  const override = process.env.KOTYS_SKILLS_DIR;
  if (override && override.trim()) return path.resolve(override.trim());
  return path.join(os.homedir(), ".kotys", "skills");
}

// Names come from clients and from disk; only a plain folder name may reach
// the filesystem, or "", "." and "x/.." would address the root itself.
export function isSkillDirName(name: string): boolean {
  return (
    name !== "" &&
    name !== "." &&
    name !== ".." &&
    name === path.basename(name) &&
    !name.includes("\\")
  );
}

export function skillDir(name: string): string {
  if (!isSkillDirName(name)) throw new Error(`invalid skill name "${name}"`);
  return path.join(skillsRoot(), name);
}

/**
 * True when `candidate` sits strictly inside `root` — the root itself does
 * not count. Callers pass real paths so a symlinked skill cannot escape.
 */
export function containsPath(root: string, candidate: string): boolean {
  const rel = path.relative(path.resolve(root), path.resolve(candidate));
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}
