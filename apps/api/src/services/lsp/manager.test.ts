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

async function createProject(
  home: string,
  compilerOptions: Record<string, unknown> = {},
): Promise<string> {
  const root = path.join(home, "project");
  await fs.mkdir(path.join(root, "src"), { recursive: true });
  await fs.writeFile(
    path.join(root, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { strict: true, ...compilerOptions } }),
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

  it("checks .tsx files as TSX", async () => {
    const root = await createProject(home, { jsx: "preserve" });
    await linkTypescript(root);
    await fs.writeFile(
      path.join(root, "src", "jsx.d.ts"),
      "declare namespace JSX { interface IntrinsicElements { div: object } }\n",
    );
    const file = path.join(root, "src", "view.tsx");
    await fs.writeFile(
      file,
      "const label: string = 1;\nexport const view = <div>{label}</div>;\n",
    );

    const result = await manager.getDiagnostics(file);

    expect(result?.formatted).toBe(
      "LSP diagnostics for view.tsx (1 issue):\n- 1:7 Error [2322]: Type 'number' is not assignable to type 'string'.",
    );
  }, 20000);

  it.each([
    ["README.md", "# Project\n\nNotes.\n"],
    ["package.json", '{ "name": "project" }\n'],
  ])(
    "returns null for %s, which the server does not check",
    async (name, text) => {
      const root = await createProject(home);
      const file = path.join(root, name);
      await fs.writeFile(file, text);

      const result = await manager.getDiagnostics(file);

      expect(result).toBeNull();
    },
  );

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
