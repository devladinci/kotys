import { execFile, spawn } from "node:child_process";
import type { ToolDefinition, ToolArgs, ToolResult } from "@kotys/contracts";
import type { ToolContext } from "./types.js";
import {
  listWindows,
  pickWindow,
  getScreenInfo,
  imageToPoints,
  type WindowInfo,
} from "./capture_screen.js";

/**
 * control_screen — mouse and keyboard actions on macOS.
 *
 * Plain keys go through cliclick. Typing lands through the clipboard
 * (pbcopy + paste via hardware keycode): instant, layout-immune, and the only
 * path Chromium respects — Electron apps ignore synthetic unicode events that
 * carry modifiers, but honor `key code N using command down`.
 *
 * With `app`, coordinates are relative to that app's frontmost window and the
 * call runs through the tool's own consent channel (auto-approved in
 * autopilot, asked for in copilot). Without `app`, coordinates are absolute
 * screen coordinates and the call goes through the approval round-trip
 * directly, so even autopilot asks.
 */

const MAX_ACTIONS = 12;
const DEFAULT_SETTLE_MS = 350;
const MIN_SETTLE_MS = 50;
const MAX_SETTLE_MS = 2000;

const MODIFIERS = ["cmd", "alt", "ctrl", "shift", "fn"] as const;
type Modifier = (typeof MODIFIERS)[number];

export type ControlAction =
  | { op: "click"; x: number; y: number }
  | { op: "type"; text: string }
  | { op: "key"; key: string; modifiers?: Modifier[] }
  | { op: "wait"; ms: number };

type CoordinateSpace = "points" | "image";

const KNOWN_KEYS = new Set([
  "return",
  "esc",
  "space",
  "tab",
  "delete",
  "fwd-delete",
  "home",
  "end",
  "page-up",
  "page-down",
  "arrow-up",
  "arrow-down",
  "arrow-left",
  "arrow-right",
  "enter",
  "fn",
]);

function isModifier(value: unknown): value is Modifier {
  return (
    typeof value === "string" &&
    (MODIFIERS as readonly string[]).includes(value)
  );
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function validateActions(raw: unknown): {
  actions?: ControlAction[];
  error?: string;
} {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: "`actions` must be a non-empty array." };
  }
  if (raw.length > MAX_ACTIONS) {
    return { error: `At most ${MAX_ACTIONS} actions per call.` };
  }
  const actions: ControlAction[] = [];
  for (const item of raw) {
    const a = (item ?? {}) as Record<string, unknown>;
    if (a.op === "click") {
      if (!isNonNegativeInt(a.x) || !isNonNegativeInt(a.y)) {
        return {
          error:
            "click needs integer `x` and `y` (pixels in the target window).",
        };
      }
      actions.push({ op: "click", x: a.x, y: a.y });
    } else if (a.op === "type") {
      if (
        typeof a.text !== "string" ||
        a.text.length === 0 ||
        a.text.length > 2000
      ) {
        return { error: "type needs non-empty `text` (up to 2000 chars)." };
      }
      actions.push({ op: "type", text: a.text });
    } else if (a.op === "key") {
      if (
        typeof a.key !== "string" ||
        a.key.length > 20 ||
        !/^[a-z0-9][a-z0-9-]{0,19}$/.test(a.key)
      ) {
        return {
          error:
            "key needs a cliclick key name like `return`, `esc`, `space`, `arrow-down`, `f5`, or a single character.",
        };
      }
      const modifiers = a.modifiers ?? [];
      if (!Array.isArray(modifiers) || !modifiers.every(isModifier)) {
        return {
          error: `modifiers must be a subset of: ${MODIFIERS.join(", ")}.`,
        };
      }
      const key = a.key.toLowerCase();
      actions.push(
        modifiers.length > 0
          ? { op: "key", key, modifiers: modifiers as Modifier[] }
          : { op: "key", key },
      );
    } else if (a.op === "wait") {
      if (!isNonNegativeInt(a.ms) || a.ms < MIN_SETTLE_MS || a.ms > 5000) {
        return {
          error: `wait needs \`ms\` between ${MIN_SETTLE_MS} and 5000.`,
        };
      }
      actions.push({ op: "wait", ms: a.ms });
    } else {
      return { error: `Unknown action op: ${JSON.stringify(a.op)}.` };
    }
  }
  return { actions };
}

export function describeActions(actions: ControlAction[]): string {
  return actions
    .map((a) => {
      if (a.op === "click") return `click(${a.x},${a.y})`;
      if (a.op === "type")
        return `type(${JSON.stringify(a.text.slice(0, 24))})`;
      if (a.op === "key") {
        return `key(${[...(a.modifiers ?? []), a.key].join("+")})`;
      }
      return `wait(${a.ms}ms)`;
    })
    .join(" → ");
}

function exec(cmd: string, args: string[], signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 15_000, signal }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function copyToClipboard(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("pbcopy");
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`pbcopy exited with ${code}`));
    });
    child.stdin.end(text);
  });
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new Error("aborted"));
      },
      { once: true },
    );
  });
}

async function runCliclick(
  commands: string[],
  signal: AbortSignal,
): Promise<void> {
  try {
    await exec("cliclick", ["-w", "20", ...commands], signal);
  } catch (err) {
    if (
      (err as NodeJS.ErrnoException).code === "ENOENT" ||
      (err instanceof Error && err.message.includes("ENOENT"))
    ) {
      throw new Error(
        "cliclick is not installed. Install it with `brew install cliclick`.",
      );
    }
    throw new Error(
      `cliclick failed (${err instanceof Error ? err.message : String(err)}). ` +
        "If nothing happened, grant Accessibility permission to the app running Kotys " +
        "(System Settings → Privacy & Security → Accessibility).",
    );
  }
}

export function keyCommands(action: ControlAction & { op: "key" }): string[] {
  const isSpecial =
    KNOWN_KEYS.has(action.key) ||
    /^f\d{1,2}$/.test(action.key) ||
    /^num-/.test(action.key) ||
    /^arrow-/.test(action.key);
  return isSpecial ? [`kp:${action.key}`] : [`t:${action.key}`];
}

// Hardware keycodes (kVK_*): Chromium ignores synthetic unicode events that
// carry modifiers, but honors keydown on the physical key.
const KEYCODES: Record<string, number> = {
  a: 0,
  s: 1,
  d: 2,
  f: 3,
  h: 4,
  g: 5,
  z: 6,
  x: 7,
  c: 8,
  v: 9,
  b: 11,
  q: 12,
  w: 13,
  e: 14,
  r: 15,
  y: 16,
  t: 17,
  o: 31,
  u: 32,
  p: 35,
  i: 34,
  n: 45,
  m: 46,
  j: 38,
  k: 40,
  l: 37,
  "0": 29,
  "1": 18,
  "2": 19,
  "3": 20,
  "4": 21,
  "5": 23,
  "6": 22,
  "7": 26,
  "8": 28,
  "9": 25,
};

const MODIFIER_FLAGS: Record<Modifier, string> = {
  cmd: "command down",
  alt: "option down",
  ctrl: "control down",
  shift: "shift down",
  fn: "fn down",
};

async function runOsa(script: string, signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = execFile(
      "osascript",
      ["-e", script],
      { timeout: 10_000 },
      (err) => {
        if (err) reject(err);
        else resolve();
      },
    );
    signal.addEventListener("abort", () => child.kill(), { once: true });
  });
}

export const definition: ToolDefinition = {
  type: "function",
  category: "write",
  function: {
    name: "control_screen",
    description:
      "Perform mouse and keyboard actions on macOS: click, type, key, wait — several in one call. " +
      "Pair with capture_screen: capture first, act on coordinates read from that capture, then re-capture to verify. " +
      "With `app`, coordinates are relative to that app's frontmost window (recommended — safer, and can auto-run in autopilot). " +
      "Without `app`, coordinates are absolute screen coordinates and the user is always asked. " +
      "For web pages prefer the browser tools; use this for native apps such as Simulator, Finder or Xcode.",
    parameters: {
      type: "object",
      properties: {
        actions: {
          type: "array",
          maxItems: MAX_ACTIONS,
          description:
            'Ordered actions, e.g. [{"op":"click","x":120,"y":80},{"op":"type","text":"hello"},{"op":"key","key":"return"}.',
          items: {
            type: "object",
            properties: {
              op: {
                type: "string",
                enum: ["click", "type", "key", "wait"],
                description:
                  "click = left click at x/y; type = paste text via clipboard; key = press a key or chord; wait = pause.",
              },
              x: {
                type: "integer",
                description:
                  "Pixel x, relative to the target window (or the screen).",
              },
              y: {
                type: "integer",
                description:
                  "Pixel y, relative to the target window (or the screen).",
              },
              text: { type: "string", description: "Text to paste (op=type)." },
              key: {
                type: "string",
                description:
                  "Key name for op=key: return, esc, space, tab, delete, fwd-delete, arrow-up/down/left/right, f1…f16, or a single character.",
              },
              modifiers: {
                type: "array",
                items: { type: "string", enum: [...MODIFIERS] },
                description:
                  "Modifier keys held while pressing `key` (op=key): cmd, alt, ctrl, shift, fn.",
              },
              ms: {
                type: "integer",
                description: "Milliseconds to wait, 50–5000 (op=wait).",
              },
            },
            required: ["op"],
          },
        },
        app: {
          type: "string",
          description:
            "App whose frontmost window the coordinates are relative to (e.g. 'Simulator'). Window-scoped control can auto-run in autopilot. Omit for absolute screen coordinates — that always asks.",
        },
        settle_ms: {
          type: "integer",
          description: `Milliseconds to wait after each action, ${MIN_SETTLE_MS}–${MAX_SETTLE_MS} (default ${DEFAULT_SETTLE_MS}). Raise for slow apps.`,
        },
        space: {
          type: "string",
          enum: ["points", "image"],
          description:
            'Coordinate space of click x/y: "points" (screen or window points, default) or "image" (pixels of the last capture_screen image — converted for you using its reported screen size and scale).',
        },
        verify: {
          type: "boolean",
          description:
            "When true, the response includes a fresh capture_screen screenshot of the target after the actions, saving a separate capture round-trip.",
        },
      },
      required: ["actions"],
    },
  },
};

async function resolveTarget(
  appQuery: string,
  ctx: ToolContext,
): Promise<{ target: WindowInfo | null; error?: ToolResult }> {
  if (!appQuery) {
    return { target: null };
  }
  let windows: WindowInfo[];
  try {
    windows = await listWindows(ctx.signal);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      target: null,
      error: {
        content: `Error: could not list windows (${msg}).`,
        activity: { status: "error", error: msg },
      },
    };
  }
  const target = pickWindow(windows, appQuery);
  if (!target) {
    return {
      target: null,
      error: {
        content: JSON.stringify({
          error: `No open window found for app ${JSON.stringify(appQuery)}.`,
          open_apps: [...new Set(windows.map((w) => w.app))].slice(0, 20),
          note: "Retry with one of open_apps, or run capture_screen with app=list.",
        }),
        activity: { status: "error", error: "no matching window" },
      },
    };
  }
  return { target };
}

export async function execute(
  args: ToolArgs,
  ctx: ToolContext,
): Promise<ToolResult> {
  if (process.platform !== "darwin") {
    return {
      content: "control_screen works on macOS only.",
      activity: { status: "error", error: "unsupported platform" },
    };
  }

  const validated = validateActions(args.actions);
  if (validated.error || !validated.actions) {
    return {
      content: `Error: ${validated.error ?? "invalid actions"}`,
      activity: {
        status: "error",
        error: validated.error ?? "invalid actions",
      },
    };
  }
  const actions = validated.actions;

  const appQuery = typeof args.app === "string" ? args.app.trim() : "";
  const resolved = await resolveTarget(appQuery, ctx);
  if (resolved.error) return resolved.error;

  const target = resolved.target;

  if (!target) {
    const approved = ctx.requestApproval
      ? await ctx.requestApproval({
          tool: "control_screen",
          preview:
            `Actions on the whole screen: ${describeActions(actions)}.\n` +
            "No window scope — actions can land anywhere.",
        })
      : false;
    if (!approved) {
      return {
        content:
          "User declined the screen-control request. Continue without it.",
        activity: { status: "error", error: "declined" },
      };
    }
  }

  const label = target ? target.app : "the screen";
  const settleMs =
    isNonNegativeInt(args.settle_ms) && args.settle_ms >= MIN_SETTLE_MS
      ? Math.min(args.settle_ms, MAX_SETTLE_MS)
      : DEFAULT_SETTLE_MS;

  const space: CoordinateSpace = args.space === "image" ? "image" : "points";
  const doVerify = args.verify === true;
  let imageGeom: {
    width: number;
    height: number;
    w: number;
    h: number;
  } | null = null;

  if (space === "image") {
    if (!target) {
      return {
        content:
          'Error: space:"image" with absolute coordinates needs screen size, which comes from a capture_screen of the whole screen. Capture first, then pass its reported `screen` and `scale` via a window-scoped call or retry with space:"points".',
        activity: {
          status: "error",
          error: "space=image requires a prior full-screen capture",
        },
      };
    }
    const screen = await getScreenInfo(ctx.signal);
    if (!screen) {
      return {
        content:
          'Error: could not read the display size, so image coordinates cannot be converted. Retry with space:"points".',
        activity: {
          status: "error",
          error: "screen size unavailable",
        },
      };
    }
    imageGeom = {
      width: screen.w,
      height: screen.h,
      w: target.width,
      h: target.height,
    };
  }

  const toLocal = (x: number, y: number): { x: number; y: number } => {
    if (space === "image") {
      const p = imageToPoints(x, y, imageGeom!);
      return { x: p.x, y: p.y };
    }
    return { x, y };
  };

  try {
    for (const action of actions) {
      if (action.op === "wait") {
        await delay(action.ms, ctx.signal);
      } else if (action.op === "type") {
        await copyToClipboard(action.text);
        await runOsa(
          'tell application "System Events" to key code 9 using command down',
          ctx.signal,
        );
      } else if (action.op === "click") {
        const local = toLocal(action.x, action.y);
        const x = target ? target.x + local.x : local.x;
        const y = target ? target.y + local.y : local.y;
        await runCliclick([`c:${x},${y}`], ctx.signal);
      } else if (action.op === "key" && action.modifiers?.length) {
        const mods = action.modifiers
          .map((m) => MODIFIER_FLAGS[m])
          .join(" using ");
        const key = KEYCODES[action.key];
        const script =
          key === undefined
            ? `tell application "System Events" to keystroke "${action.key}" using {${mods}}`
            : `tell application "System Events" to key code ${key} using {${mods}}`;
        await runOsa(script, ctx.signal);
      } else {
        await runCliclick(keyCommands(action), ctx.signal);
      }
      if (action.op !== "wait") await delay(settleMs, ctx.signal);
    }
  } catch (err) {
    if (err instanceof Error && err.message === "aborted") throw err;
    const msg = err instanceof Error ? err.message : String(err);
    return {
      content: `Error: ${msg}`,
      activity: { status: "error", error: msg },
    };
  }

  const base = {
    acted_on: label,
    done: actions.length,
    actions: describeActions(actions),
  };

  if (doVerify) {
    const verified = await captureForVerify(target, ctx);
    return {
      content: JSON.stringify({
        ...base,
        verify: verified ? "captured" : "unavailable",
        note: verified
          ? "Fresh capture attached; check it before acting further."
          : "Actions ran, but the follow-up capture failed — call capture_screen to verify.",
      }),
      resultImages: verified?.resultImages,
      activity: {
        status: "done",
        query: `${describeActions(actions)} in ${label}`,
        images: verified?.activity.images,
        widget: verified?.activity.widget,
        unchanged: verified?.activity.unchanged,
      },
    };
  }

  return {
    content: JSON.stringify({
      ...base,
      note: "Verify the result with capture_screen before acting further.",
    }),
    activity: {
      status: "done",
      query: `${describeActions(actions)} in ${label}`,
    },
  };
}

async function captureForVerify(
  target: WindowInfo | null,
  ctx: ToolContext,
): Promise<ToolResult | null> {
  const { execute: runCapture } = await import("./capture_screen.js");
  const res = await runCapture(target ? { app: target.app } : {}, ctx);
  if (res.activity.status === "error") return null;
  return res;
}
