import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import type { ToolDefinition, ToolArgs, ToolResult } from "@kotys/contracts";
import type { ToolContext } from "./types.js";
import { resolvePath } from "./paths.js";

const MAX_OUTPUT_BYTES = 50_000;
const MAX_TIMEOUT_MS = 100_000;

// Live bash children, tracked so the daemon's shutdown handler can kill any
// still-running command instead of orphaning it. `detached: true` children sit
// in their own process group, so a terminal ^C aimed at the daemon's group
// never reaches them — without this registry they outlive the daemon.
const liveChildren = new Set<ChildProcess>();

/**
 * Kill every tracked bash child (its whole process group, matching the
 * timeout path). Called from the daemon's SIGTERM/SIGINT handler in main.ts.
 * Best-effort by design: shutdown must not hang on a misbehaving child.
 */
export function killLiveBashChildren(): void {
  for (const child of liveChildren) {
    try {
      if (child.pid) process.kill(-child.pid, "SIGTERM");
    } catch {
      try {
        child.kill("SIGTERM");
      } catch {
        // already gone
      }
    }
  }
  liveChildren.clear();
}

/** Test hook: how many bash children are currently tracked. */
export function liveBashChildCount(): number {
  return liveChildren.size;
}

// Patterns that indicate a potentially destructive command. When matched, the
// approval request carries a `destructive` flag so the UI can show a stronger
// warning. The command is still allowed — the user makes the final call — but
// the dialog makes the risk visible.
const DESTRUCTIVE_PATTERNS = [
  /\brm\s+(-[a-z]*f[a-z]*\s+)?/i, // rm -rf, rm -f
  /\bmkfs\b/i, // format filesystem
  /\bdd\b.*\bof=/i, // dd ... of= (raw disk write)
  /\bchmod\s+-R\b/i, // recursive chmod
  /\bchown\s+-R\b/i, // recursive chown
  />\s*\/(etc|usr|bin|sbin|System|var)\b/i, // redirect to system dir
  /\bcurl\b[^|]*\|\s*(sh|bash|zsh)\b/i, // curl ... | sh
  /\bwget\b[^|]*\|\s*(sh|bash|zsh)\b/i, // wget ... | sh
  /\beval\b\s*\$/i, // eval $(...)
  /\b:\(\)\s*\{/i, // fork bomb :(){...}
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bhalt\b/i,
  /\bkillall\b/i,
  /\bpkill\b/i,
  /\biotop\b/i,
  /\bnc\b.*-\w*l/i, // nc -l (listen)
  /\bcrontab\b/i,
];

function isDestructive(command: string): boolean {
  return DESTRUCTIVE_PATTERNS.some((re) => re.test(command));
}

// Strip secrets from the environment before passing it to the shell. The model
// could otherwise exfiltrate API keys/tokens via `env` or `printenv`.
const SECRET_ENV_PATTERNS =
  /^(?:.*(?:KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL|AUTH|API).*)$/i;
const SENSITIVE_ENV_KEYS = new Set([
  "AWS_SECRET_ACCESS_KEY",
  "GITHUB_TOKEN",
  "OLLAMA_API_KEY",
]);

// The desktop app runs the daemon on its own Electron binary with
// ELECTRON_RUN_AS_NODE=1. A shell must not inherit it: every Electron app the
// command starts — Kotys itself included, relaunched by the self-update
// installer — would run as plain Node and exit immediately.
const DAEMON_ONLY_ENV_KEYS = new Set(["ELECTRON_RUN_AS_NODE"]);

function sanitizeEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const clean: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(env)) {
    if (SENSITIVE_ENV_KEYS.has(key)) continue;
    if (SECRET_ENV_PATTERNS.test(key)) continue;
    if (DAEMON_ONLY_ENV_KEYS.has(key)) continue;
    clean[key] = value;
  }
  return clean;
}

export const definition: ToolDefinition = {
  type: "function",
  category: "write",
  function: {
    name: "bash",
    description:
      "Run a shell command in the user's project directory and return stdout/stderr. Destructive, mutating, build, and install commands require user approval per invocation — the user sees the command and must approve before it runs. Purely read-only commands (ls, cat, find, grep, rg, git status/log/diff, npm list, and similar inspections) run without approval. Prefer the dedicated find/grep/read_file tools for file inspection; use bash for git, npm, build, test, and inspection commands. Avoid long-running commands (timeout 100s). The optional cwd may be absolute, start with ~, or be relative (resolved against home) — omit it to run in the user's project directory. If the user denies approval, the command does not run and you should proceed without it.",
    parameters: {
      type: "object",
      required: ["command"],
      properties: {
        command: {
          type: "string",
          description:
            "Shell command to run, e.g. 'git status', 'npm test', 'ls -la'.",
        },
        cwd: {
          type: "string",
          optional: true,
          description:
            "Working directory: absolute, ~-prefixed, or relative (resolved against home). Optional — defaults to the user's project directory.",
        },
      },
    },
  },
};

export async function execute(
  args: ToolArgs,
  ctx: ToolContext,
): Promise<ToolResult> {
  const command = String(args.command ?? "").trim();
  if (!command) throw new Error("command is required");
  const rawCwd = String(args.cwd ?? "").trim();
  const cwd = resolvePath(rawCwd || ".", ctx.homedir);
  const destructive = isDestructive(command);

  if (!ctx.requestApproval) {
    throw new Error(
      "approval not available — cannot run bash without user consent",
    );
  }
  const approved = await ctx.requestApproval({
    tool: "bash",
    command,
    cwd,
    destructive,
  });
  if (!approved) {
    return {
      content: "User denied approval for this command.",
      activity: {
        query: command,
        filePath: cwd,
        status: "error",
        error: "Denied: command not run.",
      },
    };
  }

  return new Promise<ToolResult>((resolve) => {
    // detached + process group so we can kill the entire tree on timeout,
    // not just the direct child (npm test spawns node, etc.)
    const child = spawn(command, {
      cwd,
      env: sanitizeEnv(process.env),
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });
    liveChildren.add(child);
    const untrack = (): void => {
      liveChildren.delete(child);
    };
    let stdout = "";
    let stderr = "";
    let killed = false;
    const killTree = () => {
      try {
        process.kill(-child.pid!, "SIGTERM");
      } catch {
        child.kill("SIGTERM");
      }
    };
    const timer = setTimeout(() => {
      killed = true;
      killTree();
    }, MAX_TIMEOUT_MS);
    // A user stop must also kill the child, not wait out the timeout.
    const onAbort = () => {
      killed = true;
      killTree();
    };
    ctx.signal.addEventListener("abort", onAbort, { once: true });
    child.stdout.on("data", (d) => {
      stdout += d;
      if (stdout.length > MAX_OUTPUT_BYTES) {
        try {
          process.kill(-child.pid!, "SIGTERM");
        } catch {
          child.kill("SIGTERM");
        }
      }
    });
    child.stderr.on("data", (d) => {
      stderr += d;
      if (stderr.length > MAX_OUTPUT_BYTES) {
        try {
          process.kill(-child.pid!, "SIGTERM");
        } catch {
          child.kill("SIGTERM");
        }
      }
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      ctx.signal.removeEventListener("abort", onAbort);
      untrack();
      resolve({
        content: `Error: ${err.message}`,
        activity: {
          query: command,
          filePath: cwd,
          status: "error",
          error: err.message,
        },
      });
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      ctx.signal.removeEventListener("abort", onAbort);
      untrack();
      const exitCode = code ?? 0;
      const truncated =
        stdout.length > MAX_OUTPUT_BYTES || stderr.length > MAX_OUTPUT_BYTES;
      const result: ToolResult = {
        content: JSON.stringify({
          command,
          cwd,
          exitCode,
          // A signal-death (timeout kill, abort, daemon shutdown) must not
          // masquerade as success — code is null in that case and the ?? 0
          // above would otherwise report exitCode 0.
          ...(signal ? { signal, failed: true } : {}),
          ...(killed ? { timedOut: true } : {}),
          ...(truncated ? { truncated: true } : {}),
          stdout: stdout.slice(0, MAX_OUTPUT_BYTES),
          stderr: stderr.slice(0, MAX_OUTPUT_BYTES),
        }),
        activity: {
          query: command,
          filePath: cwd,
          results: [
            {
              title: `${path.basename(cwd)}$ ${command} → ${exitCode}`,
              url: "",
            },
          ],
        },
      };
      resolve(result);
    });
  });
}
