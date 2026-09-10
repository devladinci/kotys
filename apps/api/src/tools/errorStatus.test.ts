import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "node:path";
import { promises as fs } from "node:fs";
import { runTool } from "./index.js";
import { execute as bash } from "./bash.js";
import type { ToolActivity } from "@kotys/contracts";
import type { ToolContext } from "./types.js";

const testContext = (partial: Partial<ToolContext>): ToolContext =>
  ({ signal: new AbortController().signal, ...partial }) as ToolContext;

// chatStream renders a trace entry as `{ ...meta, status: "done", ...activity }`
// and the UI only surfaces `error` when `status === "error"`. So any failure
// that sets an error message without a status shows the user a green,
// successful-looking chip with the reason hidden inside it.
type ApprovalFn = NonNullable<ToolContext["requestApproval"]>;

const asTraceEntry = (activity: {
  status?: ToolActivity["status"];
  error?: string;
}) => ({ tool: "x", status: "done" as const, ...activity });

let home: string;

beforeEach(async () => {
  home = await fs.mkdtemp(path.join("/tmp", "err-test-"));
});

afterEach(async () => {
  await fs.rm(home, { recursive: true, force: true });
});

describe("failures are reported as failures", () => {
  it("marks an unknown tool as an error", async () => {
    const result = await runTool("no_such_tool", {}, {} as ToolContext);
    expect(result.content).toMatch(/^Unknown tool:/);
    expect(asTraceEntry(result.activity).status).toBe("error");
  });

  it("marks a command that could not be spawned as an error", async () => {
    const approve = vi.fn<ApprovalFn>(async () => true);
    const result = await bash(
      { command: "true", cwd: path.join(home, "does-not-exist") },
      testContext({ homedir: home, requestApproval: approve }),
    );
    expect(result.content).toMatch(/^Error:/);
    expect(asTraceEntry(result.activity).status).toBe("error");
  });

  it("marks a denied command as an error", async () => {
    const result = await bash(
      { command: "echo hi", cwd: home },
      testContext({ requestApproval: vi.fn<ApprovalFn>(async () => false) }),
    );
    expect(asTraceEntry(result.activity).status).toBe("error");
  });

  // A command that runs and exits non-zero is a successful tool call: the
  // exit code is part of the result the model asked for, not a tool failure.
  it("leaves a non-zero exit as a completed call", async () => {
    const result = await bash(
      { command: "exit 3", cwd: home },
      testContext({ requestApproval: vi.fn<ApprovalFn>(async () => true) }),
    );
    expect(JSON.parse(result.content).exitCode).toBe(3);
    expect(asTraceEntry(result.activity).status).toBe("done");
  });
});
