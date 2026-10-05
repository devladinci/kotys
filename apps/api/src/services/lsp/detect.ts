import path from "node:path";
import { createRequire } from "node:module";
import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";

export type LspServerConfig = {
  command: string;
  args: string[];
  rootUri: string;
  languageId: string;
  commandPath: string;
};

type BaseConfig = { languageId: string; command: string; args: string[] };

const MARKERS: Record<string, BaseConfig> = {
  "tsconfig.json": {
    languageId: "typescript",
    command: "typescript-language-server",
    args: ["--stdio"],
  },
  "jsconfig.json": {
    languageId: "javascript",
    command: "typescript-language-server",
    args: ["--stdio"],
  },
};

const FALLBACK_MARKERS: Record<string, BaseConfig> = {
  "package.json": {
    languageId: "javascript",
    command: "typescript-language-server",
    args: ["--stdio"],
  },
  "Cargo.toml": { languageId: "rust", command: "rust-analyzer", args: [] },
  "go.mod": { languageId: "go", command: "gopls", args: [] },
  "pyproject.toml": { languageId: "python", command: "pylsp", args: [] },
  "setup.py": { languageId: "python", command: "pylsp", args: [] },
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
    if (entries.includes(name)) {
      return buildConfig(root, config.languageId, config.command, config.args);
    }
  }
  for (const [name, config] of Object.entries(FALLBACK_MARKERS)) {
    if (entries.includes(name)) {
      return buildConfig(root, config.languageId, config.command, config.args);
    }
  }
  return null;
}

function buildConfig(
  root: string,
  languageId: string,
  command: string,
  args: string[],
): LspServerConfig {
  const commandPath = bundledCommandPath(command) ?? command;
  return {
    command,
    args,
    rootUri: fileUri(root),
    languageId,
    commandPath,
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
