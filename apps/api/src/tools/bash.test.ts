import { promises as fs } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execute, definition } from "./bash.js";
import type { ToolContext } from "./types.js";

type ApprovalFn = NonNullable<ToolContext["requestApproval"]>;

const ctxWith = (homedir: string, requestApproval?: ApprovalFn) =>
  ({
    homedir,
    requestApproval,
    signal: new AbortController().signal,
  }) as unknown as ToolContext;

let home: string;

beforeEach(async () => {
  home = await fs.mkdtemp(path.join("/tmp", "bash-test-"));
});

afterEach(async () => {
  await fs.rm(home, { recursive: true, force: true });
});

describe("bash approval contract", () => {
  it("refuses to run without an approval channel", async () => {
    await expect(
      execute({ command: "echo hi", cwd: home }, ctxWith(home)),
    ).rejects.toThrow(/approval not available/i);
  });

  it("does not run the command when the user denies", async () => {
    const approve = vi.fn(async () => false);
    const result = await execute(
      { command: "touch marker-file", cwd: home },
      ctxWith(home, approve),
    );
    expect(approve).toHaveBeenCalledOnce();
    // The command was never executed — no file exists.
    await expect(fs.access(path.join(home, "marker-file"))).rejects.toThrow();
    expect(result.content).toMatch(/denied/i);
    expect(result.activity.status).toBe("error");
  });

  it("defaults cwd to the homedir and reports it", async () => {
    const result = await execute(
      { command: "pwd" },
      ctxWith(home, async () => true),
    );
    const parsed = JSON.parse(result.content) as { cwd: string };
    expect(parsed.cwd).toBe(home);
  });

  it("runs a harmless command when approved and returns structured output", async () => {
    const result = await execute(
      { command: "echo approved", cwd: home },
      ctxWith(home, async () => true),
    );
    // stdout/stderr/exitCode arrive as one JSON payload.
    const parsed = JSON.parse(result.content) as {
      command: string;
      exitCode: number;
      stdout: string;
    };
    expect(parsed.exitCode).toBe(0);
    expect(parsed.stdout).toContain("approved");
    // Success leaves status unset — streamChat stamps "done"; only failures
    // carry an explicit status.
    expect(result.activity.status).toBeUndefined();
    expect(result.activity.results?.[0]?.title).toContain("echo approved");
  });

  it("flags destructive commands to the approver", async () => {
    const approve = vi.fn<ApprovalFn>(async () => false);
    await execute(
      { command: "rm -rf /tmp/bash-test-victim", cwd: home },
      ctxWith(home, approve),
    );
    expect(approve.mock.calls[0]?.[0]).toMatchObject({
      tool: "bash",
      destructive: true,
    });
  });

  it("requires command", async () => {
    const approve = vi.fn(async () => true);
    await expect(execute({}, ctxWith(home, approve))).rejects.toThrow(
      /command is required/,
    );
    expect(approve).not.toHaveBeenCalled();
  });

  it("declares itself as a per-invocation approval tool in its schema", () => {
    expect(definition.function.name).toBe("bash");
    const params = definition.function.parameters as {
      required?: string[];
    };
    expect(params.required).toEqual(["command"]);
  });
});
