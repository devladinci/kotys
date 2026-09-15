import os from "node:os";
import path from "node:path";

/**
 * Global agents live in ~/.kotys/agents (same reasoning as skills: the model
 * must read these files, and Application Support is off-limits to its own file
 * tools). Per-project agents under <project>/.kotys/agents come later.
 */
export function agentsRoot(): string {
  const override = process.env.KOTYS_AGENTS_DIR;
  if (override && override.trim()) return path.resolve(override.trim());
  return path.join(os.homedir(), ".kotys", "agents");
}
