import { useEffect } from "react";
import { useAppStore } from "@kotys/core";

function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches === true
  );
}

function resolve(mode: "system" | "light" | "dark"): "light" | "dark" {
  if (mode === "system") return systemPrefersDark() ? "dark" : "light";
  return mode;
}

export function useTheme() {
  const { theme, resolvedTheme, setTheme, setResolvedTheme } = useAppStore();

  useEffect(() => {
    const next = resolve(theme);
    setResolvedTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", theme);
    } catch {
      /* SSR or privacy mode */
    }
  }, [theme, setResolvedTheme]);

  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const handler = () => {
      const next: "light" | "dark" = mq.matches ? "dark" : "light";
      setResolvedTheme(next);
      document.documentElement.setAttribute("data-theme", next);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme, setResolvedTheme]);

  return { theme, resolvedTheme, setTheme };
}
