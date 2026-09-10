import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { KotysProvider, useAppStore } from "@kotys/core";
import { App, webPlatform } from "@kotys/ui-web";
import "@kotys/ui-web/styles.css";

const BASE = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:3017";

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

function Root() {
  const [storedToken, setStoredToken] = useState(
    () => localStorage.getItem("kotys_token") ?? "",
  );
  // The daemon rejected the stored token: treat it as absent so the login
  // form shows. Derived during render — no state effect needed.
  const unauthorized = useAppStore((s) => s.unauthorized);
  const token = unauthorized ? "" : storedToken;

  if (!token) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const value = new FormData(e.currentTarget).get("token") as string;
          localStorage.setItem("kotys_token", value);
          // Allow the fresh token's hydrate to run instead of the old 401 flag.
          useAppStore.getState().resetAuth();
          setStoredToken(value);
        }}
      >
        <label htmlFor="token">
          API token (printed when the daemon starts)
        </label>
        <input id="token" name="token" type="password" autoComplete="off" />
        <button type="submit">Connect</button>
      </form>
    );
  }

  return (
    <KotysProvider config={{ baseUrl: BASE, token }} platform={webPlatform}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </KotysProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
