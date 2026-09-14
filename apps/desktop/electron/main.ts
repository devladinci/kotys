import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeTheme,
  net,
  Notification,
  protocol,
  session,
  shell,
} from "electron";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DB_PATH } from "@kotys/db/config";
import {
  isBackendMode,
  OWN_BACKEND,
  parseConnectCode,
  type BackendConfig,
} from "./backendConfig";
import { currentBindHost, ensureDaemon, stopDaemon } from "./daemon";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let win: BrowserWindow | null = null;

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    // "standard" makes Chromium send Origin: app://kotys — which the API allowlists.
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

const DIST_DIR = path.join(__dirname, "../dist");

async function serveRenderer(request: Request): Promise<Response> {
  const { pathname } = new URL(request.url);
  const rel = decodeURIComponent(pathname).replace(/^\/+/, "");
  const target = path.normalize(path.join(DIST_DIR, rel || "index.html"));
  if (!target.startsWith(DIST_DIR + path.sep) && target !== DIST_DIR) {
    return new Response("forbidden", { status: 403 });
  }
  return net.fetch(pathToFileURL(target).toString());
}

/**
 * The daemon writes its token to a 0600 file beside the database on every
 * start. Reading it here means the desktop app just works — no copy-pasting
 * a token into a form on your own machine.
 */
function readToken(): string {
  try {
    return readFileSync(
      path.join(path.dirname(DB_PATH), "token"),
      "utf8",
    ).trim();
  } catch {
    return "";
  }
}

/**
 * backend.json lives beside the token file: the one setting that must be
 * readable before any daemon exists (the daemon's own database cannot hold
 * the decision of whether to start that daemon). Written via IPC from the
 * settings UI; missing or malformed file means "own", the historical default.
 */
function backendConfigPath(): string {
  return path.join(path.dirname(DB_PATH), "backend.json");
}

function readBackendConfig(): BackendConfig {
  try {
    const parsed: unknown = JSON.parse(
      readFileSync(backendConfigPath(), "utf8"),
    );
    return isBackendMode(parsed) ? { mode: parsed } : OWN_BACKEND;
  } catch {
    return OWN_BACKEND;
  }
}

function writeBackendConfig(config: BackendConfig): void {
  writeFileSync(backendConfigPath(), JSON.stringify(config, null, 2) + "\n", {
    encoding: "utf8",
    mode: 0o600,
  });
}

/**
 * Content-Security-Policy as a response header instead of a meta tag: the
 * daemon URL isn't known until ensureDaemon returns — loopback, or a
 * Tailscale IP that CSP has no wildcard grammar for — so the exact origins
 * are injected here once known.
 */
function applyCsp(apiBase: string): void {
  const api = apiBase.replace(/\/$/, "");
  const [wsScheme, apiHost] = api.startsWith("https")
    ? ["wss:", new URL(api).host]
    : ["ws:", new URL(api).host];
  const connectSrc = [
    "'self'",
    "http://127.0.0.1:*",
    "ws://127.0.0.1:*",
    api,
    `${wsScheme}//${apiHost}`,
  ].join(" ");
  // Dev needs 'unsafe-inline' (Vite React preamble); packaged builds stay strict.
  const dev = process.env.VITE_DEV_SERVER_URL;
  const scriptSrc = dev ? "'self' 'unsafe-inline'" : "'self'";
  const csp = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    `connect-src ${connectSrc}`,
  ].join("; ");

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (details.resourceType === "mainFrame") {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "Content-Security-Policy": [csp],
        },
      });
    } else {
      callback({});
    }
  });
}

async function createWindow() {
  let base: string;
  try {
    base = await ensureDaemon(readBackendConfig());
  } catch (err) {
    const detail = String(err);
    // The user chose "connect" and the remote is down: offer the way out
    // explicitly, and make clear that the alternative shows this Mac's own
    // (separate) database — never present a fallback as the same data.
    if (detail.includes("refusing to start a local daemon")) {
      const choice = await dialog.showMessageBox({
        type: "error",
        title: "Kotys",
        message: "Can't reach the backend instance",
        detail:
          detail +
          "\n\nUse this Mac's own daemon instead? That shows this Mac's " +
          "own (separate) database — your shared data lives wherever the " +
          "other instance runs.",
        buttons: ["Retry", "Use this Mac's own daemon", "Quit"],
        defaultId: 0,
        cancelId: 2,
      });
      if (choice.response === 0) return createWindow();
      if (choice.response === 1) {
        writeBackendConfig(OWN_BACKEND);
        return createWindow();
      }
      app.quit();
      return;
    }
    console.error("[desktop] failed to start daemon:", err);
    dialog.showErrorBox("Kotys daemon failed to start", detail);
    app.quit();
    return;
  }
  // In connect mode the remote daemon has its own pairing token; the local
  // token file belongs to a daemon that isn't ours and would 401 on every
  // call. The connect config's token is the one the remote daemon issued.
  const mode = readBackendConfig().mode;
  const token =
    mode.kind === "connect" ? mode.token : readToken();

  applyCsp(base);

  win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    icon: path.join(__dirname, "../build/icon.png"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  // The renderer shows remote content only in sandboxed widget frames; a
  // top-level navigation away from the app can only be an attack or a bug.
  const ALLOWED_NAV = /^(app:\/\/kotys|https?:\/\/(127\.0\.0\.1|localhost))/;
  win.webContents.on("will-navigate", (e, url) => {
    if (!ALLOWED_NAV.test(url)) e.preventDefault();
  });

  const query: Record<string, string> = { api: base };
  if (token) query.token = token;

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    await win.loadURL(`${devUrl}?${new URLSearchParams(query)}`);
  } else {
    const params = new URLSearchParams(query);
    await win.loadURL(`app://kotys/index.html?${params}`);
  }
}

app.setName("Kotys");

app.whenReady().then(() => {
  nativeTheme.themeSource = "system";
  ipcMain.on("notify", (_e, n: { title: string; body: string }) => {
    // The payload crosses the trust boundary from the renderer: shape-check
    // and cap it before it reaches the OS notification.
    if (
      !n ||
      typeof n.title !== "string" ||
      typeof n.body !== "string" ||
      n.title.length > 200 ||
      n.body.length > 2000
    ) {
      return;
    }
    if (Notification.isSupported()) {
      // macOS already stamps notifications with the app bundle icon; passing
      // `icon` as well makes it render a second time as a large attachment on
      // the banner. Only non-Mac platforms need the explicit icon.
      new Notification({
        title: n.title,
        body: n.body,
        ...(process.platform === "darwin"
          ? {}
          : { icon: path.join(__dirname, "../build/icon.png") }),
      }).show();
    }
  });
  /**
   * Backend-mode IPC. The renderer only writes what the user picked; all
   * validation happens through isBackendMode/parseConnectCode before
   * anything touches disk, and restarts go through the same createWindow
   * path as a fresh launch.
   */
  ipcMain.handle("backend:get", () => readBackendConfig());
  ipcMain.handle("backend:set", (_e, raw: unknown) => {
    let config: BackendConfig;
    if (
      raw &&
      typeof raw === "object" &&
      (raw as Record<string, unknown>).kind === "own"
    ) {
      config = OWN_BACKEND;
    } else if (
      raw &&
      typeof raw === "object" &&
      typeof (raw as Record<string, unknown>).connectCode === "string"
    ) {
      const mode = parseConnectCode(
        (raw as Record<string, unknown>).connectCode as string,
      );
      if (!mode) throw new Error("Invalid connect code — use host|token");
      config = { mode };
    } else if (isBackendMode(raw)) {
      config = { mode: raw };
    } else {
      throw new Error("Invalid backend mode");
    }
    writeBackendConfig(config);
    return readBackendConfig();
  });
  ipcMain.handle("backend:restart", async () => {
    // Release the local daemon only if we own one; attach sessions hold no
    // handle, and a remote daemon is never ours to stop.
    await stopDaemon();
    if (win) {
      win.destroy();
      win = null;
    }
    await createWindow();
  });
  // For the server machine's settings UI: `<tailscale-or-bind-host>|<token>`
  // to paste into another machine's connect field. The token file is
  // rewritten by the daemon on every start, so the code never goes stale
  // while the daemon runs.
  ipcMain.handle("backend:connectCode", async () => {
    const host = await currentBindHost();
    const token = readToken();
    return { host, code: token ? `${host}|${token}` : "" };
  });
  if (!process.env.VITE_DEV_SERVER_URL) {
    protocol.handle("app", serveRenderer);
  }
  createWindow().catch((err) => {
    console.error("[desktop] failed to start daemon:", err);
    dialog.showErrorBox("Kotys daemon failed to start", String(err));
    app.quit();
  });
  app.on("activate", () => {
    if (!BrowserWindow.getAllWindows().length) void createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// A quit that leaves a server holding the database is a surprise.
app.on("before-quit", () => {
  if (process.env.KOTYS_KEEP_DAEMON !== "1") void stopDaemon();
});
