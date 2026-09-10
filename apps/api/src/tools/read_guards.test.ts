import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import { promises as fs } from "node:fs";
import { execute as readFile } from "./read_file.js";
import { execute as grep } from "./grep.js";
import { execute as list } from "./list.js";
import type { ToolContext } from "./types.js";

// Reads are the exfiltration direction: everything a tool returns is folded
// into the prompt and sent to the model host. These guards matter at least as
// much as the write-side ones, and none of them existed.
let home: string;
const ctx = () => ({ homedir: home }) as unknown as ToolContext;

beforeEach(async () => {
  // /tmp rather than os.tmpdir(): the latter is under /var on macOS, which the
  // denylist blocks wholesale and would make every case pass for free.
  home = await fs.mkdtemp(path.join("/tmp", "read-guard-"));
  await fs.mkdir(path.join(home, ".aws"));
  await fs.writeFile(
    path.join(home, ".aws", "credentials"),
    "aws_secret_access_key = TOPSECRET",
  );
  await fs.mkdir(path.join(home, ".ssh"));
  await fs.writeFile(
    path.join(home, ".ssh", "id_rsa"),
    "PRIVATE KEY TOPSECRET",
  );
  await fs.mkdir(path.join(home, "project"));
  await fs.writeFile(path.join(home, "project", "app.ts"), "const x = 1;");
});

afterEach(async () => {
  await fs.rm(home, { recursive: true, force: true });
});

describe("read_file", () => {
  it("refuses a credential file", async () => {
    await expect(
      readFile({ path: "~/.aws/credentials" }, ctx()),
    ).rejects.toThrow(/sensitive path/i);
  });

  it("refuses a case-variant of one", async () => {
    await expect(
      readFile({ path: "~/.AWS/credentials" }, ctx()),
    ).rejects.toThrow(/sensitive path/i);
  });

  it("still reads ordinary project files", async () => {
    const result = await readFile({ path: "project/app.ts" }, ctx());
    expect(result.content).toContain("const x = 1;");
  });
});

describe("grep", () => {
  it("refuses a search rooted at a denied directory", async () => {
    await expect(
      grep({ pattern: "TOPSECRET", path: "~/.ssh" }, ctx()),
    ).rejects.toThrow(/sensitive path/i);
  });

  // The dangerous case: an innocent-looking root that descends into secrets.
  // Assert on the matches, not the whole payload — the response echoes the
  // caller's own search pattern back, which is not a leak.
  it("does not surface secrets when searching the whole home directory", async () => {
    const result = await grep({ pattern: "TOPSECRET", path: "~" }, ctx());
    const { matches, count } = JSON.parse(result.content) as {
      matches: { file: string; snippet: string }[];
      count: number;
    };
    expect(matches).toEqual([]);
    expect(count).toBe(0);
  });

  it("still finds matches in ordinary files", async () => {
    const result = await grep({ pattern: "const x", path: "~" }, ctx());
    expect(result.content).toContain("app.ts");
  });
});

describe("list", () => {
  it("refuses to list a denied directory", async () => {
    await expect(list({ path: "~/.ssh" }, ctx())).rejects.toThrow(
      /sensitive path/i,
    );
  });

  it("still lists ordinary directories", async () => {
    const result = await list({ path: "project" }, ctx());
    expect(result.content).toContain("app.ts");
  });
});
