import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ToolDefinition, ToolArgs, ToolResult } from "@kotys/contracts";
import type { ToolContext } from "./types.js";

/**
 * computer_observe — a macOS screenshot as a vision input for the model.
 *
 * Two targets: the whole screen, or one app's frontmost window (`app`). Window
 * shots go through `screencapture -l<windowid>`, which grabs the window's own
 * surface — anything stacked on top of it stays out of the frame — and lets the
 * approval prompt name exactly what is about to be captured.
 *
 * Rakazo's unchanged-frame trick: the PNG bytes are hashed, and when the hash
 * matches the previous observation of the same target in this chat the image is
 * not re-sent — the model gets "(screen unchanged)" text only.
 *
 * Wiring: Kotys speaks the Ollama wire format, where images ride on the
 * message (ConnectorChatMessage.images), and the dispatcher builds tool
 * messages in one place (streamChat.ts) — so `resultImages` on ToolResult is
 * the only contract change needed.
 */

const DEFAULT_MAX_DIM = 1280;

/** Ignore the 1x1 and off-screen scratch windows apps keep around. */
const MIN_WINDOW_DIM = 60;

/** Last frame hash per chat+target, so repeat calls in the same chat dedupe. */
const frameHashes = new Map<string, string>();

export function isSameFrame(key: string, hash: string): boolean {
  return frameHashes.get(key) === hash;
}

export function rememberFrame(key: string, hash: string): void {
  // Bound the map: one entry per chat is enough, old chats can be evicted.
  if (frameHashes.size >= 64) {
    const oldest = frameHashes.keys().next().value;
    if (oldest !== undefined) frameHashes.delete(oldest);
  }
  frameHashes.set(key, hash);
}

export function resetFramesForTests(): void {
  frameHashes.clear();
}

// ─── Small process / format helpers ──────────────────────────────────────

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

/** Parse width/height from PNG bytes (IHDR, fixed offsets). */
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

/** Downscale a PNG file in place so its longest side fits maxDim. */
async function downscale(
  path: string,
  maxDim: number,
  signal: AbortSignal,
): Promise<void> {
  await exec("sips", ["-Z", String(maxDim), path], signal);
}

// ─── Window inventory ────────────────────────────────────────────────────

export type WindowInfo = {
  id: number;
  app: string;
  title: string;
  width: number;
  height: number;
};

/**
 * CoreGraphics' window list, reached through JXA's ObjC bridge so no helper
 * binary is needed. Layer 0 is the normal window layer — menu bar, Dock and
 * overlays live above it. The list comes back front-to-back, so the first hit
 * for an app is that app's frontmost window.
 *
 * kCGWindowOwnerName (the app) is readable without any permission;
 * kCGWindowName (the title) comes back empty without Screen Recording access,
 * which is why matching leans on the owner name.
 */
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
    width: Math.round(w.kCGWindowBounds.Width),
    height: Math.round(w.kCGWindowBounds.Height),
  })));
`;

async function listWindows(signal: AbortSignal): Promise<WindowInfo[]> {
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

/**
 * Resolve what the model typed to a window. Exact app name first, then prefix
 * and substring ("chrome" → "Google Chrome"), and only then the window title —
 * a model that says "the Kotys chat window" should still land somewhere sane.
 */
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

// ─── Definition ──────────────────────────────────────────────────────────

export const definition: ToolDefinition = {
  type: "function",
  category: "media",
  function: {
    name: "computer_observe",
    description:
      "Take a screenshot on macOS and see it as an image. " +
      "Without arguments it captures the whole screen; pass `app` to capture only that app's frontmost window, which is sharper and cheaper when the question is about one app. " +
      "Call this when the user asks what is on their screen, or when you need to verify something in the desktop UI. " +
      "If the target is identical to the previous observation, the answer comes back as unchanged without a new image. " +
      "After taking actions on the screen, call this again to see the result.",
    parameters: {
      type: "object",
      properties: {
        app: {
          type: "string",
          description:
            "Capture only this app's frontmost window, e.g. 'Safari', 'Xcode'. Omit to capture the whole screen. If the app has no open window the answer lists the apps that do.",
        },
        max_dim: {
          type: "integer",
          description:
            "Cap for the image's long side in pixels: 1280 (default) or 1600. Larger means more readable and more tokens.",
        },
      },
    },
  },
};

// ─── Executor ────────────────────────────────────────────────────────────

export async function execute(
  args: ToolArgs,
  ctx: ToolContext,
): Promise<ToolResult> {
  if (process.platform !== "darwin") {
    return {
      content: "computer_observe works on macOS only.",
      activity: { status: "error", error: "unsupported platform" },
    };
  }

  const appQuery = typeof args.app === "string" ? args.app.trim() : "";

  // Resolve the window before asking: the prompt can then name what will be
  // captured, and a bad app name costs the user no dialog at all.
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
      // No silent fall back to the full screen: the user would be approving a
      // capture of one app and getting everything else with it.
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

  // The screen may hold anything; every capture needs explicit consent.
  const approved = ctx.requestApproval
    ? await ctx.requestApproval({
        tool: "computer_observe",
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

  const path = join(tmpdir(), `kotys-observe-${Date.now()}.png`);

  let png: Buffer;
  try {
    // -o drops the drop shadow, which would otherwise pad the window with
    // transparent margin the model has to look past.
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
      // Retina captures are 2x; resample before sending to save tokens.
      await downscale(path, maxDim, ctx.signal);
      const scaled = await readFile(path);
      ({ width, height } = pngSize(scaled));
      png = scaled;
    } catch {
      // sips missing or failing is not fatal — keep the full-size PNG.
    }
  }
  await rm(path, { force: true });

  // Hash what the model actually sees (the post-downscale bytes), not the raw
  // capture — screencapture bakes metadata into each shot, so raw hashes
  // differ on every call even when the screen is identical. The target is part
  // of the key so a window shot never dedupes against a full-screen one.
  const hash = sha256(png);
  const key = `${ctx.chatId ?? 0}:${target ? target.app.toLowerCase() : "screen"}`;

  if (isSameFrame(key, hash)) {
    return {
      content: JSON.stringify({
        observed: label,
        state: "unchanged",
        note: "Identical to the previous observation; the image was not re-sent.",
      }),
      // The trailing "(unchanged)" is what toolDisplay reads to swap the icon.
      activity: { status: "done", query: `${label} (unchanged)` },
    };
  }
  rememberFrame(key, hash);

  return {
    content: JSON.stringify({
      observed: label,
      state: "captured",
      width,
      height,
      note: "PNG attached to this tool message as an image.",
    }),
    resultImages: [png.toString("base64")],
    activity: { status: "done", query: label },
  };
}
