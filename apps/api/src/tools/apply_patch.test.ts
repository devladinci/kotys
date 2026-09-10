import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "node:path";
import { promises as fs } from "node:fs";
import { execute } from "./apply_patch.js";
import type { ToolContext } from "./types.js";

// Only the two fields apply_patch actually reads; the rest of ToolContext is
// DB and Ollama plumbing it never touches.
type ApprovalFn = NonNullable<ToolContext["requestApproval"]>;

const ctxWith = (homedir: string, requestApproval?: ApprovalFn) =>
  ({ homedir, requestApproval }) as unknown as ToolContext;

/** A stub approval channel that always answers the same way. */
const approver = (answer: boolean) => vi.fn<ApprovalFn>(async () => answer);

let home: string;

beforeEach(async () => {
  // /tmp, not os.tmpdir(): on macOS the latter lives under /var, which the
  // denylist blocks outright.
  home = await fs.mkdtemp(path.join("/tmp", "ap-test-"));
});

afterEach(async () => {
  await fs.rm(home, { recursive: true, force: true });
});

// Three levels up from this file is apps/ — inside the checked-out repo, so a
// file written there hits the in-git branch that skips the .bak backup.
const repoHome = path.resolve(__dirname, "..", "..", "..");
const repoFile = (name: string) => path.join(repoHome, name);

const parse = (content: string) =>
  JSON.parse(content) as Record<string, unknown>;

describe("apply_patch success", () => {
  it("applies a single-hunk patch and reports the result", async () => {
    await fs.writeFile(path.join(home, "a.txt"), "line1\nalpha\nline3\n");
    const result = await execute(
      { path: "a.txt", old_text: "alpha", new_text: "beta" },
      ctxWith(home, async () => true),
    );

    expect(await fs.readFile(path.join(home, "a.txt"), "utf-8")).toBe(
      "line1\nbeta\nline3\n",
    );
    const body = parse(result.content);
    expect(body.replaced).toBe(1);
    expect(body.path).toBe(path.join(home, "a.txt"));
    expect(result.activity.status).toBeUndefined(); // caller defaults it to done
    expect(body.in_git_repo).toBeUndefined();
    expect(body.backup).toBe(path.join(home, "a.txt.bak"));
  });

  it("creates a .bak backup outside a git repo", async () => {
    await fs.writeFile(path.join(home, "a.txt"), "before\n");
    await execute(
      { path: "a.txt", old_text: "before", new_text: "after" },
      ctxWith(home, async () => true),
    );

    expect(await fs.readFile(path.join(home, "a.txt.bak"), "utf-8")).toBe(
      "before\n",
    );
    expect(await fs.readFile(path.join(home, "a.txt"), "utf-8")).toBe(
      "after\n",
    );
  });

  it("creates no backup inside a git repo", async () => {
    const file = repoFile(`ap-repo-${process.pid}.txt`);
    await fs.writeFile(file, "old\n");
    try {
      const result = await execute(
        { path: file, old_text: "old", new_text: "new" },
        ctxWith(home, async () => true),
      );

      expect(await fs.readFile(file, "utf-8")).toBe("new\n");
      const body = parse(result.content);
      expect(body.in_git_repo).toBe(true);
      expect(body.backup).toBeUndefined();
      await expect(fs.access(`${file}.bak`)).rejects.toThrow();
    } finally {
      await fs.rm(file, { force: true });
      await fs.rm(`${file}.bak`, { force: true });
    }
  });
});

describe("apply_patch guards", () => {
  it("does not patch when the user denies", async () => {
    await fs.writeFile(path.join(home, "a.txt"), "before\n");
    const approve = approver(false);
    const result = await execute(
      { path: "a.txt", old_text: "before", new_text: "after" },
      ctxWith(home, approve),
    );

    expect(approve).toHaveBeenCalledOnce();
    expect(result.content).toMatch(/denied/i);
    expect(result.activity.status).toBe("error");
    expect(await fs.readFile(path.join(home, "a.txt"), "utf-8")).toBe(
      "before\n",
    );
    await expect(fs.access(path.join(home, "a.txt.bak"))).rejects.toThrow();
  });

  it("rejects when old_text is not found", async () => {
    await fs.writeFile(path.join(home, "a.txt"), "one\ntwo\nthree\n");
    await expect(
      execute(
        { path: "a.txt", old_text: "missing", new_text: "x" },
        ctxWith(home, async () => true),
      ),
    ).rejects.toThrow(/old_text not found/i);
    expect(await fs.readFile(path.join(home, "a.txt"), "utf-8")).toBe(
      "one\ntwo\nthree\n",
    );
  });

  it("returns the nearest candidate lines on a miss", async () => {
    await fs.writeFile(
      path.join(home, "a.txt"),
      "const alpha = 1;\nconst beta = 2;\nconst gamma = 3;\n",
    );
    await expect(
      execute(
        { path: "a.txt", old_text: "const beta  = 2", new_text: "x" },
        ctxWith(home, async () => true),
      ),
    ).rejects.toThrow(/line 2[\s\S]*const beta/);
  });

  it("rejects when old_text matches more than once", async () => {
    await fs.writeFile(path.join(home, "a.txt"), "dup\ndup\ndup\n");
    await expect(
      execute(
        { path: "a.txt", old_text: "dup", new_text: "x" },
        ctxWith(home, async () => true),
      ),
    ).rejects.toThrow(/more than once/i);
    expect(await fs.readFile(path.join(home, "a.txt"), "utf-8")).toBe(
      "dup\ndup\ndup\n",
    );
    await expect(fs.access(path.join(home, "a.txt.bak"))).rejects.toThrow();
  });
});
