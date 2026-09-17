import type { ThemeMode } from "@kotys/core";
import { AppearanceSection } from "./AppearanceSection";
import { ProvidersSection } from "./ProvidersSection";
import { RunningModelsSection } from "./RunningModelsSection";

interface IProps {
  theme: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
}

export default function GeneralSettings({ theme, onThemeChange }: IProps) {
  return (
    <div className="space-y-4">
      <ProvidersSection />
      <AppearanceSection theme={theme} onThemeChange={onThemeChange} />
      <RunningModelsSection />
    </div>
  );
}
