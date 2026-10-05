import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import { createRequire } from "node:module";
import { promises as fs } from "node:fs";
import { createLspManager } from "./manager.js";

async function linkTypescript(root: string): Promise<void> {
  const require = createRequire(import.meta.url);
  const tsDir = path.dirname(require.resolve("typescript/package.json"));
  const modulesDir = path.join(root, "node_modules");
  await fs.mkdir(modulesDir, { recursive: true });
  await fs.symlink(tsDir, path.join(modulesDir, "typescript"));
}

describe("LspManager integration", () => {
  let home: string;
  let manager: ReturnType<typeof createLspManager>;

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join("/tmp", "lsp-manager-"));
    manager = createLspManager();
  });

  afterEach(async () => {
    manager.close();
    await fs.rm(home, { recursive: true, force: true });
  });

  it("returns TypeScript diagnostics from the bundled language server", async () => {
    const root = path.join(home, "project");
    const src = path.join(root, "src");
    await fs.mkdir(src, { recursive: true });
    await fs.writeFile(
      path.join(root, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { strict: true } }),
    );
    await linkTypescript(root);
    const file = path.join(src, "index.ts");
    await fs.writeFile(file, "const x: number = 'oops';\n");

    const result = await manager.getDiagnostics(file);

    expect(result).not.toBeNull();
    expect(result?.diagnostics.length).toBeGreaterThan(0);
    expect(result?.formatted).toMatch(
      /Type 'string' is not assignable to type 'number'/,
    );
  }, 20000);

  it("returns null when the file has no diagnostics", async () => {
    const root = path.join(home, "project");
    const src = path.join(root, "src");
    await fs.mkdir(src, { recursive: true });
    await fs.writeFile(
      path.join(root, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { strict: true } }),
    );
    const file = path.join(src, "clean.ts");
    await fs.writeFile(file, "const x: number = 1;\n");

    const result = await manager.getDiagnostics(file);

    expect(result).toBeNull();
  }, 20000);

  it("returns null for files outside a recognized project", async () => {
    const file = path.join(home, "orphan.ts");
    await fs.writeFile(file, "const x: number = 'oops';\n");

    const result = await manager.getDiagnostics(file);

    expect(result).toBeNull();
  });
});
