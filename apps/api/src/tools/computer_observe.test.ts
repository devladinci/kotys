import {
  execute,
  isSameFrame,
  pickWindow,
  pngSize,
  rememberFrame,
  resetFramesForTests,
  type WindowInfo,
} from "./computer_observe.js";
import type { ToolContext } from "./types.js";
import os from "node:os";
import { beforeEach, describe, expect, it } from "vitest";

// A minimal well-formed PNG: signature + IHDR (dimensions at fixed offsets).
function png(width: number, height: number): Buffer {
  const buf = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.write("IHDR", 12, "latin1");
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

describe("pngSize", () => {
  it("reads dimensions from the IHDR chunk", () => {
    expect(pngSize(png(3008, 1912))).toEqual({ width: 3008, height: 1912 });
    expect(pngSize(png(1280, 812))).toEqual({ width: 1280, height: 812 });
  });

  it("rejects non-PNG and truncated bytes", () => {
    expect(() => pngSize(Buffer.alloc(24, 1))).toThrow(/not a PNG/);
    expect(() => pngSize(png(1, 1).subarray(0, 20))).toThrow();
  });
});

describe("frame hash memory", () => {
  beforeEach(() => resetFramesForTests());

  it("first hash is new, identical repeat is unchanged, others differ", () => {
    expect(isSameFrame("chat-1", "abc")).toBe(false);
    rememberFrame("chat-1", "abc");
    expect(isSameFrame("chat-1", "abc")).toBe(true);
    expect(isSameFrame("chat-1", "def")).toBe(false);
    expect(isSameFrame("chat-2", "abc")).toBe(false);
  });

  it("evicts the oldest chat beyond 64 entries", () => {
    for (let i = 0; i < 64; i++) rememberFrame(`chat-${i}`, `h${i}`);
    rememberFrame("chat-64", "h64");
    expect(isSameFrame("chat-0", "h0")).toBe(false);
    expect(isSameFrame("chat-64", "h64")).toBe(true);
  });
});

describe("pickWindow", () => {
  const win = (app: string, title = "", id = 1): WindowInfo => ({
    id,
    app,
    title,
    width: 800,
    height: 600,
  });
  // Front-to-back order, the same order CGWindowList returns.
  const windows = [
    win("Safari", "Kotys — Chat", 10),
    win("Google Chrome", "Dashboard", 11),
    win("Safari", "Release notes", 12),
    win("Xcode", "Kotys.xcodeproj", 13),
  ];

  it("matches the app name exactly, case-insensitively", () => {
    expect(pickWindow(windows, "xcode")?.id).toBe(13);
  });

  it("takes the frontmost window when an app has several", () => {
    expect(pickWindow(windows, "Safari")?.id).toBe(10);
  });

  it("matches a prefix or substring of the app name", () => {
    expect(pickWindow(windows, "Google")?.id).toBe(11);
    expect(pickWindow(windows, "chrome")?.id).toBe(11);
  });

  it("falls back to the window title", () => {
    expect(pickWindow(windows, "release notes")?.id).toBe(12);
  });

  it("returns null for no match and for an empty query", () => {
    expect(pickWindow(windows, "Photoshop")).toBeNull();
    expect(pickWindow(windows, "  ")).toBeNull();
    expect(pickWindow([], "Safari")).toBeNull();
  });
});

describe("execute", () => {
  beforeEach(() => resetFramesForTests());

  it.runIf(process.platform === "darwin")(
    "auto-denies when no approval channel exists (never captures)",
    async () => {
      const ctx = {
        ollama: {} as never,
        homedir: os.homedir(),
        chatId: 1,
        chatTopics: [],
        signal: new AbortController().signal,
      } satisfies ToolContext;
      const res = await execute({}, ctx);
      expect(res.content).toContain("declined");
      expect(res.resultImages).toBeUndefined();
    },
  );

  it.runIf(process.platform === "darwin")(
    "reports the open apps when no window matches, without prompting",
    async () => {
      let asked = false;
      const ctx = {
        ollama: {} as never,
        homedir: os.homedir(),
        chatId: 1,
        chatTopics: [],
        signal: new AbortController().signal,
        requestApproval: async () => {
          asked = true;
          return true;
        },
      } satisfies ToolContext;
      const res = await execute({ app: "NoSuchApp-zzz" }, ctx);
      const parsed = JSON.parse(res.content) as { open_apps?: string[] };
      expect(res.activity.status).toBe("error");
      expect(parsed.open_apps).toBeInstanceOf(Array);
      // Resolution happens before consent: a bad name costs no dialog.
      expect(asked).toBe(false);
      expect(res.resultImages).toBeUndefined();
    },
  );
});
