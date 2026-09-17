import {
  execute,
  pickWindow,
  pngSize,
  rememberFrame,
  resetFramesForTests,
  imageToPoints,
  pointsToImage,
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

describe("imageToPoints / pointsToImage", () => {
  const fullScreen = { width: 1280, height: 827, w: 1728, h: 1117 };

  it("round-trips through a fractional scale", () => {
    const scale = 1728 / 1280;
    expect(imageToPoints(640, 413, { ...fullScreen, height: 827 })).toEqual({
      x: Math.round(640 * scale),
      y: Math.round(413 * scale),
    });
    expect(pointsToImage(864, 528, { ...fullScreen, height: 827 })).toEqual({
      x: Math.round(864 / scale),
      y: Math.round(528 / scale),
    });
  });

  it("scales window-relative clicks with the same factor", () => {
    const windowShot = { width: 1280, height: 800, w: 800, h: 500 };
    const p = imageToPoints(640, 400, windowShot);
    expect(p).toEqual({ x: 400, y: 250 });
  });

  it("is the identity when image pixels equal points", () => {
    const one = { width: 800, height: 600, w: 800, h: 600 };
    expect(imageToPoints(123, 45, one)).toEqual({ x: 123, y: 45 });
    expect(pointsToImage(123, 45, one)).toEqual({ x: 123, y: 45 });
  });

  it("handles Retina x2 captures", () => {
    const retina = { width: 2400, height: 1600, w: 1200, h: 800 };
    expect(imageToPoints(1200, 800, retina)).toEqual({ x: 600, y: 400 });
    expect(pointsToImage(600, 400, retina)).toEqual({ x: 1200, y: 800 });
  });

  it("clamps out-of-range coordinates into the target bounds", () => {
    const cl = { ...fullScreen, height: 827 };
    expect(imageToPoints(9999, 9999, cl)).toEqual({
      x: fullScreen.w,
      y: fullScreen.h,
    });
    expect(pointsToImage(-5, -5, cl)).toEqual({ x: 0, y: 0 });
    expect(
      imageToPoints(9999, -3, { width: 100, height: 100, w: 0, h: 50 }),
    ).toEqual({ x: 0, y: 0 });
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
