import { spawn } from "node:child_process";
import path from "node:path";
import { promises as fs } from "node:fs";

// Cache git-repo-root lookups by directory to avoid repeated `git rev-parse`
// calls. Keyed by the input path's nearest existing ancestor.
const gitRootCache = new Map<string, string | null>();

function runGitRevParse(cwd: string): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
    });
    let stdout = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.on("error", () => resolve(null));
    child.on("close", (code) => {
      resolve(code === 0 ? stdout.trim() || null : null);
    });
  });
}

// Returns the git repo root containing `filePath`, or null if not in a repo.
// Caches by the file's directory to avoid repeated subprocess calls.
async function getGitRoot(filePath: string): Promise<string | null> {
  const dir = path.dirname(filePath);
  const cached = gitRootCache.get(dir);
  if (cached !== undefined) return cached;
  try {
    await fs.access(dir);
  } catch {
    return null;
  }
  const root = await runGitRevParse(dir);
  gitRootCache.set(dir, root);
  return root;
}

// Returns true if the file is inside a git work tree — meaning git tracks its
// history and a .bak backup is redundant.
export async function isInGitRepo(filePath: string): Promise<boolean> {
  const root = await getGitRoot(filePath);
  return root !== null;
}
