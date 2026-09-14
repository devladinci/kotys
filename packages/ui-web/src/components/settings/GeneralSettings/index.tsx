import type { ThemeMode } from "@kotys/core";
import { AppearanceSection } from "../AppearanceSection";
import { BackendSettings } from "../BackendSettings";
import { ProvidersSection } from "../ProvidersSection";
import { RunningModelsSection } from "../RunningModelsSection";

interface IGeneralSettingsProps {
  theme: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
}

export default function GeneralSettings({
  theme,
  onThemeChange,
}: IGeneralSettingsProps) {
  return (
    <div className="space-y-4">
      <ProvidersSection />
      <BackendSettings />
      <AppearanceSection theme={theme} onThemeChange={onThemeChange} />
      <RunningModelsSection />
    </div>
  );
}
