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

/**
 * True when `candidate` sits inside `root` after symlink resolution — the
 * check tools/paths.ts realResolvedPath() already performs for file tools,
 * reused here so a symlinked skill cannot escape its root.
 */
export function containsPath(root: string, candidate: string): boolean {
  const rel = path.relative(path.resolve(root), path.resolve(candidate));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}
