import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { config } from "zod";
import { KotysProvider, useAppStore } from "@kotys/core";
import { App, desktopPlatform } from "@kotys/ui-web";
import "@kotys/ui-web/styles.css";

// The desktop CSP forbids eval-family calls (script-src 'self'). zod probes
// `new Function("")` on first parse otherwise, which Chromium reports as a
// securitypolicyviolation on every boot. jitless is zod's supported CSP mode;
// zod stores it on globalThis, so it applies to every zod copy in the bundle.
config({ jitless: true });

const params = new URLSearchParams(window.location.search);
const baseUrl = params.get("api") ?? "http://127.0.0.1:3017";

// Set the theme before React renders: the stylesheet's bare :root defaults
// to dark, so a missing data-theme attribute would flash dark on boot.
const storedTheme = localStorage.getItem("theme");
const theme =
  storedTheme === "light" || storedTheme === "dark"
    ? storedTheme
    : window.matchMedia?.("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
document.documentElement.dataset.theme = theme;

// The Electron main process injects the daemon's token via the query string;
// it's persisted so a restart still works if the file read ever races.
const queryToken = params.get("token");
if (queryToken) localStorage.setItem("kotys_token", queryToken);
const token = queryToken ?? localStorage.getItem("kotys_token") ?? "";

if (token) {
  // The Electron main process injects the token; if the daemon has since
  // regenerated it, hydrate fails with 401 and the app hangs otherwise.
  function AuthedRoot() {
    const unauthorized = useAppStore((s) => s.unauthorized);
    useEffect(() => {
      if (unauthorized) {
        localStorage.removeItem("kotys_token");
        location.reload();
      }
    }, [unauthorized]);
    return (
      <KotysProvider config={{ baseUrl, token }} platform={desktopPlatform}>
        <HashRouter>
          <App />
        </HashRouter>
      </KotysProvider>
    );
  }
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <AuthedRoot />
    </StrictMode>,
  );
} else {
  document.getElementById("root")!.innerHTML = `
    <form style="font:15px -apple-system,sans-serif;max-width:420px;margin:40vh auto 0" onsubmit="event.preventDefault();localStorage.setItem('kotys_token',this.token.value);location.reload()">
      <label for="token">API token (printed when the daemon starts)</label>
      <input id="token" name="token" type="password" autocomplete="off" style="width:100%;padding:8px;margin:8px 0" />
      <button style="padding:8px 16px">Connect</button>
    </form>`;
}
