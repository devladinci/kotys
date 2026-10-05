import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import { promises as fs } from "node:fs";
import { detectProjectRoot, detectLspServer } from "./detect.js";

let home: string;

beforeEach(async () => {
  home = await fs.mkdtemp(path.join("/tmp", "lsp-detect-"));
});

afterEach(async () => {
  await fs.rm(home, { recursive: true, force: true });
});

describe("detectProjectRoot", () => {
  it("finds the directory containing tsconfig.json", async () => {
    const root = path.join(home, "project");
    const nested = path.join(root, "src", "components");
    await fs.mkdir(nested, { recursive: true });
    await fs.writeFile(path.join(root, "tsconfig.json"), "{}");

    const found = await detectProjectRoot(nested);
    expect(found).toBe(root);
  });

  it("falls back to package.json when no tsconfig exists", async () => {
    const root = path.join(home, "pkg");
    const nested = path.join(root, "lib");
    await fs.mkdir(nested, { recursive: true });
    await fs.writeFile(path.join(root, "package.json"), "{}");

    const found = await detectProjectRoot(nested);
    expect(found).toBe(root);
  });

  it("prefers tsconfig.json over package.json", async () => {
    const root = path.join(home, "pkg");
    const nested = path.join(root, "src");
    await fs.mkdir(nested, { recursive: true });
    await fs.writeFile(path.join(root, "package.json"), "{}");
    await fs.writeFile(path.join(root, "tsconfig.json"), "{}");

    const found = await detectProjectRoot(nested);
    expect(found).toBe(root);
  });

  it("returns null when no marker is found", async () => {
    const found = await detectProjectRoot(home);
    expect(found).toBeNull();
  });
});

describe("detectLspServer", () => {
  it("returns a TypeScript server config for a tsconfig project", async () => {
    const root = path.join(home, "ts-project");
    const nested = path.join(root, "src");
    await fs.mkdir(nested, { recursive: true });
    await fs.writeFile(path.join(root, "tsconfig.json"), "{}");

    const config = await detectLspServer(path.join(nested, "index.ts"));
    expect(config).not.toBeNull();
    expect(config?.command).toBe("typescript-language-server");
    expect(config?.args).toEqual(["--stdio"]);
    expect(config?.rootUri).toBe(`file://${root}`);
    expect(config?.languageId).toBe("typescript");
    expect(config?.commandPath).toContain("typescript-language-server");
  });

  it("returns null when the file is not in a project", async () => {
    const config = await detectLspServer(path.join(home, "orphan.ts"));
    expect(config).toBeNull();
  });
});
