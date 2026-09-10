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
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DB_PATH } from "@kotys/db/config";
import { ensureDaemon, stopDaemon } from "./daemon";

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
  const base = await ensureDaemon();
  const token = readToken();
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
