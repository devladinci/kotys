import { useAppStore, type ThemeMode } from "@kotys/core";
import GeneralSettings from "../components/settings/GeneralSettings";

export function GeneralRoute() {
  const { theme, setTheme } = useAppStore();

  const handleThemeChange = (mode: ThemeMode) => void setTheme(mode);

  return <GeneralSettings theme={theme} onThemeChange={handleThemeChange} />;
}
