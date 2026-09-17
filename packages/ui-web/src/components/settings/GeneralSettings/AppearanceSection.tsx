import { Monitor, Moon, Sun } from "lucide-react";
import type { ThemeMode } from "@kotys/core";

interface IProps {
  theme: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
}

const THEME_OPTIONS = [
  { mode: "system", label: "System", Icon: Monitor },
  { mode: "light", label: "Light", Icon: Sun },
  { mode: "dark", label: "Dark", Icon: Moon },
] as const;

export function AppearanceSection({ theme, onThemeChange }: IProps) {
  return (
    <section className="bg-surface border border-border rounded-xl p-5">
      <h2 className="text-base font-semibold mb-1">Appearance</h2>
      <p className="text-xs text-text-muted mb-4">
        Theme follows your system by default.
      </p>
      <div className="flex gap-2">
        {THEME_OPTIONS.map(({ mode, label, Icon }) => (
          <button
            key={mode}
            type="button"
            onClick={() => onThemeChange(mode)}
            aria-pressed={theme === mode}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition ${
              theme === mode
                ? "border-accent text-accent bg-surface-2"
                : "border-border text-text-muted hover:text-text hover:bg-surface-2"
            }`}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>
      <p className="text-xs text-text-muted mt-2">
        System follows your OS appearance, switching light during the day and
        dark at night.
      </p>
    </section>
  );
}
