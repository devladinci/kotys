import { useEffect } from "react";
import type { NavigateFunction } from "react-router-dom";
import { useTodoStore } from "@kotys/core";
import { usePomodoroStore } from "@kotys/core";

export function focusComposer() {
  requestAnimationFrame(() => {
    document
      .querySelector<HTMLElement>('.komposer [contenteditable="true"]')
      ?.focus();
  });
}

interface UseKeyboardShortcutsProps {
  handleCreateChat: () => void | Promise<void>;
  navigate: NavigateFunction;
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
}

export function useKeyboardShortcuts({
  handleCreateChat,
  navigate,
  paletteOpen,
  setPaletteOpen,
}: UseKeyboardShortcutsProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const inField =
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement;
      if (mod && !e.shiftKey && e.key.toLowerCase() === "k") {
        // Works from fields too — the palette is a launcher, not an editor.
        e.preventDefault();
        setPaletteOpen(!paletteOpen);
      } else if (mod && e.shiftKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        const s = useTodoStore.getState();
        s.setSidebarOpen(!s.sidebarOpen);
      } else if (mod && e.key === "n") {
        e.preventDefault();
        void handleCreateChat();
      } else if (mod && e.key === "/") {
        e.preventDefault();
        focusComposer();
      } else if (mod && e.key === "f") {
        if (inField) return;
        e.preventDefault();
        (
          document.querySelector<HTMLInputElement>(
            'input[aria-label="Search chats"]',
          ) ?? undefined
        )?.focus();
      } else if (mod && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        const pomodoro = usePomodoroStore.getState();
        if (!useTodoStore.getState().sidebarOpen) {
          pomodoro.reveal();
        } else {
          pomodoro.setCollapsed(!pomodoro.collapsed);
        }
      } else if (mod && e.key === ",") {
        e.preventDefault();
        navigate("/settings");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleCreateChat, navigate, paletteOpen, setPaletteOpen]);
}
