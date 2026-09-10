import path from "node:path";
import { promises as fs } from "node:fs";

export function resolvePath(raw: string, homedir: string): string {
  const trimmed = raw.trim();
  // Strip "~/" fully: path.resolve(home, "/Projects") would discard home.
  if (trimmed.startsWith("~"))
    return path.resolve(homedir, trimmed.slice(1).replace(/^[/\\]+/, ""));
  if (path.isAbsolute(trimmed)) return path.resolve(trimmed);
  return path.resolve(homedir, trimmed);
}

/**
 * Lexical path with symlinks resolved as far as the target exists on disk.
 * Denylists that only inspect the literal path are bypassed by symlinks, so
 * callers that gate access should test this form as well.
 */
export async function realResolvedPath(resolved: string): Promise<string> {
  const trailing: string[] = [path.basename(resolved)];
  let dir = path.dirname(resolved);
  for (;;) {
    try {
      const real = await fs.realpath(dir);
      return path.resolve(real, ...[...trailing].reverse());
    } catch {
      const parent = path.dirname(dir);
      // Hit the filesystem root without finding anything that exists.
      if (parent === dir) return resolved;
      trailing.push(path.basename(dir));
      dir = parent;
    }
  }
}

// On ENOENT, list the parent directory so the model has its next move.
export async function fileNotFoundError(target: string): Promise<string> {
  const dir = path.dirname(target);
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const listing = entries
      .slice(0, 30)
      .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
      .sort()
      .join(", ");
    return `Not found: ${target}. Contents of ${dir}: ${listing || "(empty)"}`;
  } catch {
    return `Not found: ${target}`;
  }
}
