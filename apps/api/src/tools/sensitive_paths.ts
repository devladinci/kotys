import path from "node:path";
import { realResolvedPath } from "./paths.js";

// Paths the model must never touch. Every comparison is case-insensitive:
// APFS and NTFS are case-insensitive by default, so `.SSH` opens the same
// file as `.ssh`; on case-sensitive volumes this can only over-block.
const SYSTEM_DENYLIST = [
  "/etc",
  "/usr",
  "/bin",
  "/sbin",
  "/var",
  "/System",
  "/Library",
  "/private/etc",
  "/private/var",
  "/boot",
  "/dev",
  "/proc",
  "/sys",
];

const HOME_DENYLIST = [
  ".ssh",
  ".aws",
  ".gnupg",
  ".config/git/credentials",
  ".config/gh",
  ".docker",
  ".kube",
  ".npmrc",
  ".netrc",
  ".gitconfig",
  ".git-credentials",
  ".bashrc",
  ".bash_profile",
  ".zshrc",
  ".zprofile",
  ".profile",
  ".env",
  // macOS keychains and this app's own data. chat.db lives under ~/Library,
  // which the absolute "/Library" entry does not cover.
  "Library/Keychains",
  "Library/Application Support/Kotys",
];

const lower = (value: string) => value.toLowerCase();

/**
 * True when `resolved` is `base/candidate` or sits beneath it.
 *
 * The relative path is computed on lowercased inputs so a differently-cased
 * home prefix (`/USERS/vlado/...`) cannot escape the comparison either.
 */
function pathMatches(
  resolved: string,
  base: string,
  candidates: string[],
): boolean {
  const rel = path.relative(lower(base), lower(resolved));
  if (rel.startsWith("..")) return false;
  const normalized = rel.replace(/\\/g, "/");
  return candidates.some((candidate) => {
    const c = lower(candidate);
    return normalized === c || normalized.startsWith(c + "/");
  });
}

export function isSensitivePath(resolved: string, homedir: string): boolean {
  const absResolved = lower(path.resolve(resolved));
  if (
    SYSTEM_DENYLIST.some((p) => {
      const c = lower(p);
      return absResolved === c || absResolved.startsWith(c + "/");
    })
  )
    return true;
  return pathMatches(absResolved, homedir, HOME_DENYLIST);
}

/**
 * The check every file tool gates on, reads included (returned content is
 * folded into the prompt and sent off-device): literal path *and*
 * symlink-resolved path, compared against the resolved homedir too.
 */
export async function isSensitiveTarget(
  resolved: string,
  homedir: string,
): Promise<boolean> {
  if (isSensitivePath(resolved, homedir)) return true;
  const [real, realHome] = await Promise.all([
    realResolvedPath(resolved),
    realResolvedPath(homedir),
  ]);
  return isSensitivePath(real, homedir) || isSensitivePath(real, realHome);
}
