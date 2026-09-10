import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { TOOL_DEFINITIONS, runTool } from "./index.js";
import type { ToolContext } from "./types.js";

// A tool that can guess should guess. These are the expensive refusals from
// the live error tally: each one costs a full model round-trip on an argument
// with an obvious default. If a tool starts refusing again, this file fails.
const OPTIONAL_WITH_DEFAULT: Record<string, string[]> = {
  bash: ["cwd"],
};

const testContext = (partial: Partial<ToolContext>): ToolContext =>
  ({ signal: new AbortController().signal, ...partial }) as ToolContext;

let home: string;
beforeEach(async () => {
  // /tmp, not os.tmpdir() — macOS /var/folders is on the denylist (see
  // read_guards.test.ts).
  home = await fs.mkdtemp(path.join("/tmp", "defaults-"));
});

afterEach(async () => {
  await fs.rm(home, { recursive: true, force: true });
});

describe("tools guess instead of refusing", () => {
  it("does not require arguments that have documented defaults", () => {
    for (const def of TOOL_DEFINITIONS) {
      const optional = OPTIONAL_WITH_DEFAULT[def.function.name];
      if (!optional) continue;
      const params = def.function.parameters as { required?: string[] };
      for (const name of optional) {
        expect(
          params.required ?? [],
          `${def.function.name}.${name} has a default and must not be required`,
        ).not.toContain(name);
      }
    }
  });

  it("bash runs without cwd", async () => {
    const result = await runTool(
      "bash",
      { command: "pwd" },
      testContext({ homedir: home, requestApproval: async () => true }),
    );
    expect(JSON.parse(result.content).cwd).toBe(home);
  });

  it("grep searches a single file when given one", async () => {
    const file = path.join(home, "note.ts");
    await fs.writeFile(file, "const needle = 1;\n");
    const result = await runTool(
      "grep",
      { pattern: "needle", path: file },
      testContext({ homedir: home }),
    );
    const parsed = JSON.parse(result.content) as { count: number };
    expect(parsed.count).toBe(1);
  });
});
