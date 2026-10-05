import path from "node:path";
import { createRequire } from "node:module";
import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";

export type LspServerConfig = {
  command: string;
  args: string[];
  rootUri: string;
  languageIds: string[];
  commandPath: string;
};

type BaseConfig = { command: string; args: string[]; languageIds: string[] };

const TYPESCRIPT_SERVER: BaseConfig = {
  command: "typescript-language-server",
  args: ["--stdio"],
  languageIds: [
    "typescript",
    "typescriptreact",
    "javascript",
    "javascriptreact",
  ],
};

const MARKERS: Record<string, BaseConfig> = {
  "tsconfig.json": TYPESCRIPT_SERVER,
  "jsconfig.json": TYPESCRIPT_SERVER,
};

const FALLBACK_MARKERS: Record<string, BaseConfig> = {
  "package.json": TYPESCRIPT_SERVER,
  "Cargo.toml": { command: "rust-analyzer", args: [], languageIds: ["rust"] },
  "go.mod": { command: "gopls", args: [], languageIds: ["go"] },
  "pyproject.toml": { command: "pylsp", args: [], languageIds: ["python"] },
  "setup.py": { command: "pylsp", args: [], languageIds: ["python"] },
};

const LANGUAGE_IDS: Record<string, string> = {
  ".ts": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".tsx": "typescriptreact",
  ".js": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".jsx": "javascriptreact",
  ".rs": "rust",
  ".go": "go",
  ".py": "python",
};

function bundledCommandPath(command: string): string | null {
  try {
    const require = createRequire(import.meta.url);
    const pkgPath = require.resolve(`${command}/package.json`);
    const pkg = require(pkgPath) as { bin?: Record<string, string> | string };
    const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.[command];
    if (!bin) return null;
    return path.resolve(path.dirname(pkgPath), bin);
  } catch {
    return null;
  }
}

function fileUri(filePath: string): string {
  return `file://${filePath}`;
}

export async function detectProjectRoot(
  startPath: string,
): Promise<string | null> {
  let dir = path.resolve(startPath);
  let lastExisting: string | null = null;
  for (let i = 0; i < 100; i++) {
    try {
      await fs.access(dir);
      lastExisting = dir;
    } catch {
      // Keep walking upward from the nearest existing ancestor.
    }
    const check = lastExisting ?? dir;
    try {
      const entries = await fs.readdir(check);
      for (const name of Object.keys(MARKERS)) {
        if (entries.includes(name)) return check;
      }
      for (const name of Object.keys(FALLBACK_MARKERS)) {
        if (entries.includes(name)) return check;
      }
    } catch {
      // Directory may not exist yet; continue upward.
    }
    const parent = path.dirname(check);
    if (parent === check) break;
    dir = parent;
  }
  return null;
}

export async function detectLspServer(
  filePath: string,
): Promise<LspServerConfig | null> {
  const root = await detectProjectRoot(path.dirname(filePath));
  if (!root) return null;

  const entries = await fs.readdir(root);
  for (const [name, config] of Object.entries(MARKERS)) {
    if (entries.includes(name)) return buildConfig(root, config);
  }
  for (const [name, config] of Object.entries(FALLBACK_MARKERS)) {
    if (entries.includes(name)) return buildConfig(root, config);
  }
  return null;
}

export function languageIdFor(
  filePath: string,
  config: LspServerConfig,
): string | null {
  const languageId = LANGUAGE_IDS[path.extname(filePath).toLowerCase()];
  if (!languageId || !config.languageIds.includes(languageId)) return null;
  return languageId;
}

function buildConfig(root: string, base: BaseConfig): LspServerConfig {
  return {
    ...base,
    rootUri: fileUri(root),
    commandPath: bundledCommandPath(base.command) ?? base.command,
  };
}

async function isCommandInPath(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("which", [command], { env: process.env }, (err) => {
      resolve(err === null);
    });
  });
}

export async function resolveCommandPath(
  config: LspServerConfig,
): Promise<string | null> {
  const bundled = bundledCommandPath(config.command);
  if (bundled) {
    try {
      await fs.access(bundled);
      return bundled;
    } catch {
      // fall through to PATH lookup
    }
  }
  const inPath = await isCommandInPath(config.command);
  if (inPath) return config.command;
  return null;
}
