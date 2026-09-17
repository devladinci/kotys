import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ToolDefinition, ToolArgs, ToolResult } from "@kotys/contracts";
import type { ToolContext } from "./types.js";

/**
 * capture_screen — a macOS screenshot as vision input for the model.
 *
 * Window shots go through `screencapture -l<windowid>`, which grabs the
 * window's own surface (anything stacked on top stays out of the frame).
 * Repeats of the same target are deduped by hashing the post-downscale bytes —
 * raw captures bake in metadata, so their hashes differ on every call even
 * when the screen is identical.
 *
 * kCGWindowOwnerName (the app) is readable without any permission;
 * kCGWindowName (the title) comes back empty without Screen Recording access,
 * which is why matching leans on the owner name.
 */

const DEFAULT_MAX_DIM = 1280;
const MIN_WINDOW_DIM = 60;
const THUMB_MAX_DIM = 384;

export type WindowInfo = {
  id: number;
  app: string;
  title: string;
  width: number;
  height: number;
  x: number;
  y: number;
};

const WINDOW_LIST_JXA = `
ObjC.import('CoreGraphics');
const raw = $.CGWindowListCopyWindowInfo(
  $.kCGWindowListOptionOnScreenOnly | $.kCGWindowListExcludeDesktopElements, 0);
JSON.stringify(ObjC.deepUnwrap(ObjC.castRefToObject(raw))
  .filter((w) => w.kCGWindowLayer === 0)
  .map((w) => ({
    id: w.kCGWindowNumber,
    app: w.kCGWindowOwnerName || '',
    title: w.kCGWindowName || '',
    x: Math.round(w.kCGWindowBounds.X),
    y: Math.round(w.kCGWindowBounds.Y),
    width: Math.round(w.kCGWindowBounds.Width),
    height: Math.round(w.kCGWindowBounds.Height),
  })));
`;

const SCREEN_INFO_JXA = `
ObjC.import('CoreGraphics');
const main = $.CGMainDisplayID();
const modeRef = $.CGDisplayCopyDisplayMode(main);
JSON.stringify({
  w: Number($.CGDisplayModeGetWidth(modeRef)),
  h: Number($.CGDisplayModeGetHeight(modeRef)),
});
`;

export type ScreenInfo = { w: number; h: number };

export type ImageGeom = { width: number; height: number; w: number; h: number };

export function imageToPoints(
  x: number,
  y: number,
  geom: ImageGeom,
): { x: number; y: number } {
  if (geom.width <= 0 || geom.w <= 0) return { x: 0, y: 0 };
  const scale = geom.w / geom.width;
  return {
    x: Math.max(0, Math.min(geom.w, Math.round(x * scale))),
    y: Math.max(
      0,
      Math.min(geom.h, Math.round(y * (geom.h / (geom.height || 1)))),
    ),
  };
}

export function pointsToImage(
  x: number,
  y: number,
  geom: ImageGeom,
): { x: number; y: number } {
  if (geom.width <= 0 || geom.w <= 0) return { x: 0, y: 0 };
  return {
    x: Math.max(0, Math.min(geom.width, Math.round(x * (geom.width / geom.w)))),
    y: Math.max(
      0,
      Math.min(geom.height, Math.round(y * (geom.height / geom.h))),
    ),
  };
}

export async function getScreenInfo(
  signal: AbortSignal,
): Promise<ScreenInfo | null> {
  try {
    const { stdout } = await exec(
      "osascript",
      ["-l", "JavaScript", "-e", SCREEN_INFO_JXA],
      signal,
    );
    const parsed: unknown = JSON.parse(stdout);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("w" in parsed) ||
      !("h" in parsed)
    ) {
      return null;
    }
    const { w, h } = parsed as Record<"w" | "h", unknown>;
    if (typeof w !== "number" || typeof h !== "number") return null;
    return { w: Math.round(w), h: Math.round(h) };
  } catch {
    return null;
  }
}

function exec(
  cmd: string,
  args: string[],
  signal: AbortSignal,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 15_000, signal }, (err, stdout, stderr) => {
      if (err) reject(err);
      else resolve({ stdout, stderr });
    });
  });
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function makeThumbnail(png: Buffer): Promise<string | null> {
  const src = join(tmpdir(), `kotys-thumb-src-${Date.now()}.png`);
  const dst = join(tmpdir(), `kotys-thumb-${Date.now()}.jpg`);
  try {
    await writeFile(src, png);
    await exec(
      "sips",
      [
        "-Z",
        String(THUMB_MAX_DIM),
        "-s",
        "format",
        "jpeg",
        "-s",
        "formatOptions",
        "70",
        src,
        "--out",
        dst,
      ],
      AbortSignal.timeout(10_000),
    );
    return (await readFile(dst)).toString("base64");
  } catch {
    return null;
  } finally {
    await rm(src, { force: true });
    await rm(dst, { force: true });
  }
}

export function pngSize(png: Buffer): { width: number; height: number } {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (png.length < 24 || !png.subarray(0, 8).equals(sig)) {
    throw new Error("not a PNG");
  }
  if (png.toString("latin1", 12, 16) !== "IHDR") {
    throw new Error("malformed PNG: missing IHDR");
  }
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

export async function listWindows(signal: AbortSignal): Promise<WindowInfo[]> {
  const { stdout } = await exec(
    "osascript",
    ["-l", "JavaScript", "-e", WINDOW_LIST_JXA],
    signal,
  );
  const rows: unknown = JSON.parse(stdout);
  if (!Array.isArray(rows)) return [];
  return (rows as WindowInfo[]).filter(
    (w) =>
      Number.isInteger(w.id) &&
      w.app !== "" &&
      w.width >= MIN_WINDOW_DIM &&
      w.height >= MIN_WINDOW_DIM,
  );
}

export function pickWindow(
  windows: WindowInfo[],
  query: string,
): WindowInfo | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  return (
    windows.find((w) => w.app.toLowerCase() === q) ??
    windows.find((w) => w.app.toLowerCase().startsWith(q)) ??
    windows.find((w) => w.app.toLowerCase().includes(q)) ??
    windows.find((w) => w.title.toLowerCase().includes(q)) ??
    null
  );
}

const frameHashes = new Map<string, string>();

/** Store a frame hash; returns true when this exact frame was seen before. */
export function rememberFrame(key: string, hash: string): boolean {
  const seen = frameHashes.get(key) === hash;
  if (!seen) {
    if (frameHashes.size >= 64) {
      const oldest = frameHashes.keys().next().value;
      if (oldest !== undefined) frameHashes.delete(oldest);
    }
    frameHashes.set(key, hash);
  }
  return seen;
}

export function resetFramesForTests(): void {
  frameHashes.clear();
}

export const definition: ToolDefinition = {
  type: "function",
  category: "media",
  function: {
    name: "capture_screen",
    description:
      "Take a screenshot on macOS and see it as an image. " +
      "Without arguments it captures the whole screen; pass `app` to capture only that app's frontmost window, which is sharper and cheaper when the question is about one app. " +
      'Pass `app: "list"` first when you don\'t know which apps are running. ' +
      "Repeat calls on the same target may return unchanged without a new image.",
    parameters: {
      type: "object",
      properties: {
        app: {
          type: "string",
          description:
            "App name to capture (e.g. 'Safari', 'Xcode'), or `list` to get the apps that currently have on-screen windows. Omit to capture the whole screen.",
        },
        max_dim: {
          type: "integer",
          enum: [1280, 1600],
          description:
            "Long side of the image in pixels. Larger means more readable and more tokens.",
        },
      },
    },
  },
};

async function listOpenApps(signal: AbortSignal): Promise<ToolResult | null> {
  let windows: WindowInfo[];
  try {
    windows = await listWindows(signal);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      content: `Error: could not list windows (${msg}). Retry without \`app\` to capture the whole screen.`,
      activity: { status: "error", error: msg },
    };
  }
  return {
    content: JSON.stringify({
      open_apps: [...new Set(windows.map((w) => w.app))].slice(0, 20),
      note: "Pass one of open_apps to `app` to capture its frontmost window, or omit `app` for the whole screen.",
    }),
    activity: { status: "done", query: "open apps" },
  };
}

export async function execute(
  args: ToolArgs,
  ctx: ToolContext,
): Promise<ToolResult> {
  if (process.platform !== "darwin") {
    return {
      content: "capture_screen works on macOS only.",
      activity: { status: "error", error: "unsupported platform" },
    };
  }

  const appQuery = typeof args.app === "string" ? args.app.trim() : "";

  if (appQuery.toLowerCase() === "list") {
    const listing = await listOpenApps(ctx.signal);
    if (listing) return listing;
  }

  let target: WindowInfo | null = null;
  if (appQuery) {
    let windows: WindowInfo[];
    try {
      windows = await listWindows(ctx.signal);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: `Error: could not list windows (${msg}). Retry without \`app\` to capture the whole screen.`,
        activity: { status: "error", error: msg },
      };
    }
    target = pickWindow(windows, appQuery);
    if (!target) {
      return {
        content: JSON.stringify({
          error: `No open window found for app ${JSON.stringify(appQuery)}.`,
          open_apps: [...new Set(windows.map((w) => w.app))].slice(0, 20),
          note: "Retry with one of open_apps, or omit `app` to capture the whole screen.",
        }),
        activity: { status: "error", error: "no matching window" },
      };
    }
  }

  const label = target ? target.app : "the screen";

  const approved = ctx.requestApproval
    ? await ctx.requestApproval({
        tool: "capture_screen",
        preview: target
          ? `${target.app}${target.title ? ` — "${target.title}"` : ""} (${target.width}×${target.height})\n` +
            "Only this window is captured, not the rest of the screen."
          : "The whole screen, everything visible on it right now.",
      })
    : false;
  if (!approved) {
    return {
      content: "User declined the screenshot request. Continue without it.",
      activity: { status: "error", error: "declined" },
    };
  }

  const path = join(tmpdir(), `kotys-capture-${Date.now()}.png`);

  let png: Buffer;
  try {
    const captureArgs = target
      ? ["-x", "-o", `-l${target.id}`, path]
      : ["-x", "-C", path];
    await exec("screencapture", captureArgs, ctx.signal);
    png = await readFile(path);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await rm(path, { force: true });
    return {
      content:
        `Error: screencapture failed (${msg}). ` +
        (target
          ? "The window may have closed since it was found; otherwise the app "
          : "Likely cause: the app ") +
        "has no Screen Recording permission " +
        "(System Settings → Privacy & Security → Screen Recording).",
      activity: { status: "error", error: msg },
    };
  }

  const maxDim = args.max_dim === 1600 ? 1600 : DEFAULT_MAX_DIM;
  let { width, height } = pngSize(png);
  if (Math.max(width, height) > maxDim) {
    try {
      await exec("sips", ["-Z", String(maxDim), path], ctx.signal);
      const scaled = await readFile(path);
      ({ width, height } = pngSize(scaled));
      png = scaled;
    } catch {
      // sips missing or failing is not fatal — keep the full-size PNG.
    }
  }
  await rm(path, { force: true });

  const hash = sha256(png);
  const key = `${ctx.chatId ?? 0}:${target ? target.app.toLowerCase() : "screen"}`;

  if (rememberFrame(key, hash)) {
    return {
      content: JSON.stringify({
        observed: label,
        state: "unchanged",
        note: "Identical to the previous observation; the image was not re-sent.",
      }),
      activity: { status: "done", query: label, unchanged: true },
    };
  }

  const thumb = await makeThumbnail(png);

  const screen = await getScreenInfo(ctx.signal);
  const scale =
    screen && screen.w > 0 ? Number((screen.w / width).toFixed(4)) : undefined;

  return {
    content: JSON.stringify({
      observed: label,
      state: "captured",
      width,
      height,
      screen: screen ?? undefined,
      scale,
      note:
        "PNG attached to this tool message as an image." +
        (scale
          ? ` Coordinates in the image are screen points × ${scale}. control_screen accepts space:"image" to convert for you.`
          : ""),
    }),
    resultImages: [png.toString("base64")],
    activity: {
      status: "done",
      query: label,
      images: thumb ? [thumb] : undefined,
      widget: thumb ? { kind: "image", images: [thumb] } : undefined,
    },
  };
}
