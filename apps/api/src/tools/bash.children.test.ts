import { beforeAll, afterAll, describe, expect, it } from "vitest";
import path from "node:path";
import { execute, liveBashChildCount, killLiveBashChildren } from "./bash.js";
import type { ToolContext } from "./types.js";

const ctxWith = (homedir: string) =>
  ({
    homedir,
    requestApproval: async () => true,
    signal: new AbortController().signal,
  }) as unknown as ToolContext;

let home: string;
beforeAll(async () => {
  const { promises: fs } = await import("node:fs");
  home = await fs.mkdtemp(path.join("/tmp", "bash-children-"));
});

afterAll(async () => {
  const { promises: fs } = await import("node:fs");
  await fs.rm(home, { recursive: true, force: true });
});

describe("bash child tracking for shutdown", () => {
  it("untracks a child after it exits normally", async () => {
    await execute({ command: "echo hi", cwd: home }, ctxWith(home));
    // close may fire after resolve; give the event loop a beat
    await new Promise((r) => setTimeout(r, 50));
    expect(liveBashChildCount()).toBe(0);
  });

  it("killLiveBashChildren stops a long-running detached child", async () => {
    const pending = execute({ command: "sleep 30", cwd: home }, ctxWith(home));
    await new Promise((r) => setTimeout(r, 300)); // let it spawn
    expect(liveBashChildCount()).toBe(1);
    killLiveBashChildren();
    const result = await pending;
    const parsed = JSON.parse(result.content) as {
      exitCode: number | null;
      signal?: string;
      failed?: boolean;
    };
    // Killed children surface as signal-death with failed:true, not a
    // normal exit (code is null → the payload keeps exitCode 0 but flags it).
    expect(parsed.failed).toBe(true);
    expect(parsed.signal).toBe("SIGTERM");
    expect(liveBashChildCount()).toBe(0);
  }, 5_000);

  it("registry is empty after killLiveBashChildren even if kill throws", () => {
    killLiveBashChildren();
    expect(liveBashChildCount()).toBe(0);
  });
});
