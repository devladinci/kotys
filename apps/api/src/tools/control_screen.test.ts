import {
  execute,
  validateActions,
  describeActions,
  keyCommands,
  type ControlAction,
} from "./control_screen.js";
import type { ToolContext } from "./types.js";
import os from "node:os";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("validateActions", () => {
  it("accepts a valid mixed batch", () => {
    const res = validateActions([
      { op: "click", x: 10, y: 20 },
      { op: "type", text: "hello" },
      { op: "key", key: "return" },
      { op: "key", key: "a", modifiers: ["cmd"] },
      { op: "wait", ms: 500 },
    ]);
    expect(res.error).toBeUndefined();
    expect(res.actions).toHaveLength(5);
  });

  it("rejects empty, oversized and malformed batches", () => {
    expect(validateActions([]).error).toMatch(/non-empty/);
    expect(
      validateActions(
        Array.from({ length: 13 }, () => ({ op: "wait", ms: 100 })),
      ).error,
    ).toMatch(/At most 12/);
    expect(validateActions([{ op: "click", x: -1, y: 0 }]).error).toMatch(
      /integer/,
    );
    expect(validateActions([{ op: "click", x: 1.5, y: 0 }]).error).toMatch(
      /integer/,
    );
    expect(validateActions([{ op: "type", text: "" }]).error).toMatch(
      /non-empty/,
    );
    expect(validateActions([{ op: "key", key: "cmd+alt" }]).error).toMatch(
      /cliclick key name/,
    );
    expect(
      validateActions([{ op: "key", key: "return", modifiers: ["meta"] }])
        .error,
    ).toMatch(/modifiers/);
    expect(validateActions([{ op: "wait", ms: 20 }]).error).toMatch(/between/);
    expect(validateActions([{ op: "drag", x: 1, y: 2 }]).error).toMatch(
      /Unknown action op/,
    );
    expect(validateActions("click").error).toMatch(/non-empty/);
  });
});

describe("describeActions", () => {
  it("renders a compact batch summary", () => {
    const actions = [
      { op: "click", x: 5, y: 6 },
      { op: "type", text: "hi" },
    ] as ControlAction[];
    expect(describeActions(actions)).toBe('click(5,6) → type("hi")');
  });
});

describe("keyCommands", () => {
  it("uses kp for special keys and t for characters", () => {
    expect(keyCommands({ op: "key", key: "return" })).toEqual(["kp:return"]);
    expect(keyCommands({ op: "key", key: "f5" })).toEqual(["kp:f5"]);
    expect(keyCommands({ op: "key", key: "a" })).toEqual(["t:a"]);
    expect(keyCommands({ op: "key", key: "v", modifiers: ["cmd"] })).toEqual([
      "kd:cmd",
      "t:v",
      "ku:cmd",
    ]);
  });
});

describe("execute", () => {
  const baseCtx = {
    ollama: {} as never,
    homedir: os.homedir(),
    chatId: 1,
    chatTopics: [],
    signal: new AbortController().signal,
  } satisfies ToolContext;

  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects non-macOS without touching anything", async () => {
    vi.stubGlobal("process", { ...process, platform: "linux" });
    const res = await execute(
      { actions: [{ op: "click", x: 1, y: 2 }] },
      baseCtx,
    );
    expect(res.content).toContain("macOS only");
  });

  it.runIf(process.platform === "darwin")(
    "auto-denies whole-screen actions when no approval channel exists",
    async () => {
      const res = await execute(
        { actions: [{ op: "click", x: 1, y: 2 }] },
        baseCtx,
      );
      expect(res.content).toContain("declined");
    },
  );

  it.runIf(process.platform === "darwin")(
    "returns open apps when the app query matches no window",
    async () => {
      let asked = false;
      const res = await execute(
        { actions: [{ op: "click", x: 1, y: 2 }], app: "NoSuchApp-zzz" },
        {
          ...baseCtx,
          requestApproval: async () => {
            asked = true;
            return true;
          },
        },
      );
      const parsed = JSON.parse(res.content) as { open_apps?: string[] };
      expect(res.activity.status).toBe("error");
      expect(parsed.open_apps).toBeInstanceOf(Array);
      expect(asked).toBe(false);
    },
  );

  it.runIf(process.platform === "darwin")(
    "errors with install guidance when cliclick is missing",
    async () => {
      const res = await execute(
        { actions: [{ op: "click", x: 1, y: 2 }], app: "NoSuchApp-but-window" },
        baseCtx,
      );
      expect(res.activity.status).toBe("error");
    },
  );
});
