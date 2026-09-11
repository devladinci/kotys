import {
  execute,
  pickWindow,
  pngSize,
  rememberFrame,
  resetFramesForTests,
  type WindowInfo,
} from "./capture_screen.js";
import type { ToolContext } from "./types.js";
import os from "node:os";
import { beforeEach, describe, expect, it } from "vitest";

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

  it("returns false for a new frame and true for an identical repeat", () => {
    expect(rememberFrame("chat-1", "abc")).toBe(false);
    expect(rememberFrame("chat-1", "abc")).toBe(true);
    expect(rememberFrame("chat-1", "def")).toBe(false);
    expect(rememberFrame("chat-2", "abc")).toBe(false);
  });

  it("evicts the oldest chat beyond 64 entries", () => {
    for (let i = 0; i < 64; i++) rememberFrame(`chat-${i}`, `h${i}`);
    rememberFrame("chat-64", "h64");
    expect(rememberFrame("chat-0", "h0")).toBe(false);
    expect(rememberFrame("chat-64", "h64")).toBe(true);
  });
});

describe("pickWindow", () => {
  const win = (app: string, title = "", id = 1): WindowInfo => ({
    id,
    app,
    title,
    x: 0,
    y: 0,
    width: 800,
    height: 600,
  });
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

  const baseCtx = {
    ollama: {} as never,
    homedir: os.homedir(),
    chatId: 1,
    chatTopics: [],
    signal: new AbortController().signal,
  } satisfies ToolContext;

  it.runIf(process.platform === "darwin")(
    "auto-denies when no approval channel exists (never captures)",
    async () => {
      const res = await execute({}, baseCtx);
      expect(res.content).toContain("declined");
      expect(res.resultImages).toBeUndefined();
    },
  );

  it.runIf(process.platform === "darwin")(
    "reports the open apps when no window matches, without prompting",
    async () => {
      let asked = false;
      const res = await execute(
        { app: "NoSuchApp-zzz" },
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
      expect(res.resultImages).toBeUndefined();
    },
  );

  it.runIf(process.platform === "darwin")(
    "lists the open apps for app=list without prompting",
    async () => {
      let asked = false;
      const res = await execute(
        { app: "list" },
        {
          ...baseCtx,
          requestApproval: async () => {
            asked = true;
            return true;
          },
        },
      );
      const parsed = JSON.parse(res.content) as { open_apps?: string[] };
      expect(res.activity.status).toBe("done");
      expect(parsed.open_apps).toBeInstanceOf(Array);
      expect(asked).toBe(false);
      expect(res.resultImages).toBeUndefined();
      expect(res.activity.unchanged).toBeUndefined();
    },
  );

  it.runIf(process.platform === "darwin")(
    "attaches a base64 thumbnail on captured activity, not on declined",
    async () => {
      const res = await execute(
        {},
        {
          ...baseCtx,
          requestApproval: async () => true,
        },
      );
      expect(res.activity.status).toBe("done");
      if (res.activity.unchanged) {
        // Screen identical to an earlier run in this suite — no new image.
        expect(res.activity.images).toBeUndefined();
      } else {
        const thumb = res.activity.images?.[0];
        expect(thumb).toBeTruthy();
        // sips re-encodes as JPEG — "/9j/" is the base64 SOI marker.
        expect(thumb!.startsWith("/9j/")).toBe(true);
        expect(thumb!.length).toBeLessThan(200_000);
        expect(res.activity.widget).toEqual({
          kind: "image",
          images: [thumb],
        });
      }
    },
  );
});
