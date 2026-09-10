import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "node:path";
import { promises as fs } from "node:fs";
import { execute } from "./write_file.js";
import type { ToolContext } from "./types.js";

// Only the two fields write_file actually reads; the rest of ToolContext is
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
  home = await fs.mkdtemp(path.join("/tmp", "wf-test-"));
});

afterEach(async () => {
  await fs.rm(home, { recursive: true, force: true });
});

describe("write_file approval", () => {
  it("refuses to write at all when no approval channel exists", async () => {
    await expect(
      execute({ path: "notes.md", content: "hi" }, ctxWith(home)),
    ).rejects.toThrow(/approval not available/i);
    await expect(fs.access(path.join(home, "notes.md"))).rejects.toThrow();
  });

  it("does not write when the user denies", async () => {
    const approve = approver(false);
    const result = await execute(
      { path: "notes.md", content: "hi" },
      ctxWith(home, approve),
    );

    expect(approve).toHaveBeenCalledOnce();
    expect(result.content).toMatch(/denied/i);
    // A refused call is not a successful one — the trace must not read as done.
    expect(result.activity.status).toBe("error");
    await expect(fs.access(path.join(home, "notes.md"))).rejects.toThrow();
  });

  it("writes when the user approves", async () => {
    const result = await execute(
      { path: "notes.md", content: "hello" },
      ctxWith(home, async () => true),
    );

    expect(result.activity.status).toBeUndefined(); // caller defaults it to done
    expect(await fs.readFile(path.join(home, "notes.md"), "utf-8")).toBe(
      "hello",
    );
  });

  it("creates missing parent directories", async () => {
    await execute(
      { path: "a/b/c/deep.md", content: "x" },
      ctxWith(home, async () => true),
    );
    expect(await fs.readFile(path.join(home, "a/b/c/deep.md"), "utf-8")).toBe(
      "x",
    );
  });

  it("shows overwrite rather than create when the file exists", async () => {
    await fs.writeFile(path.join(home, "notes.md"), "old");
    const approve = approver(true);
    await execute({ path: "notes.md", content: "new" }, ctxWith(home, approve));
    expect(approve.mock.calls[0][0].command).toMatch(/^overwrite /);
    expect(await fs.readFile(path.join(home, "notes.md"), "utf-8")).toBe("new");
  });
});

describe("write_file guards", () => {
  it("refuses a sensitive path before asking for approval", async () => {
    const approve = approver(true);
    await expect(
      execute(
        { path: "~/.ssh/authorized_keys", content: "pwned" },
        ctxWith(home, approve),
      ),
    ).rejects.toThrow(/sensitive path/i);
    expect(approve).not.toHaveBeenCalled();
  });

  it("refuses a case-variant of a sensitive path", async () => {
    await expect(
      execute(
        { path: "~/.SSH/authorized_keys", content: "pwned" },
        ctxWith(home, async () => true),
      ),
    ).rejects.toThrow(/sensitive path/i);
  });

  it("refuses a symlink pointing into a denied directory", async () => {
    await fs.mkdir(path.join(home, ".ssh"));
    await fs.symlink(path.join(home, ".ssh"), path.join(home, "innocent"));
    await expect(
      execute(
        { path: "innocent/authorized_keys", content: "pwned" },
        ctxWith(home, async () => true),
      ),
    ).rejects.toThrow(/sensitive path/i);
  });

  it("rejects oversized content", async () => {
    await expect(
      execute(
        { path: "big.txt", content: "x".repeat(200_001) },
        ctxWith(home, async () => true),
      ),
    ).rejects.toThrow(/too large/i);
  });

  it("requires a path", async () => {
    await expect(
      execute(
        { content: "x" },
        ctxWith(home, async () => true),
      ),
    ).rejects.toThrow(/path is required/i);
  });
});
