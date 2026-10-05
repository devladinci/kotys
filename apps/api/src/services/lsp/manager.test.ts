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

async function createProject(home: string): Promise<string> {
  const root = path.join(home, "project");
  await fs.mkdir(path.join(root, "src"), { recursive: true });
  await fs.writeFile(
    path.join(root, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { strict: true } }),
  );
  return root;
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
    const root = await createProject(home);
    await linkTypescript(root);
    const file = path.join(root, "src", "index.ts");
    await fs.writeFile(file, "const x: number = 'oops';\n");

    const result = await manager.getDiagnostics(file);

    expect(result).not.toBeNull();
    expect(result?.diagnostics.length).toBeGreaterThan(0);
    expect(result?.formatted).toMatch(
      /Type 'string' is not assignable to type 'number'/,
    );
  }, 20000);

  it("checks the file again after each edit", async () => {
    const root = await createProject(home);
    await linkTypescript(root);
    const file = path.join(root, "src", "index.ts");

    await fs.writeFile(file, "const x: number = 'oops';\n");
    const broken = await manager.getDiagnostics(file);
    await fs.writeFile(file, "const x: number = 1;\n");
    const fixed = await manager.getDiagnostics(file);
    await fs.writeFile(file, "const x: number = 1;\nconst y: string = 2;\n");
    const brokenAgain = await manager.getDiagnostics(file);

    expect(broken?.formatted).toMatch(
      /Type 'string' is not assignable to type 'number'/,
    );
    expect(fixed).toBeNull();
    expect(brokenAgain?.formatted).toMatch(
      /2:7 Error \[2322\]: Type 'number' is not assignable to type 'string'/,
    );
  }, 30000);

  it("returns null when the file has no diagnostics", async () => {
    const root = await createProject(home);
    const file = path.join(root, "src", "clean.ts");
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
