import type { ReactNode } from "react";
import { KotysProvider, type Platform } from "@kotys/core";

/**
 * Minimal Platform for tests: every method is a spy-friendly no-op.
 */
const webTestPlatform: Platform = {
  scrollToMessage: () => {},
  prefersDark: () => false,
  openExternal: () => {},
  notify: () => {},
};

export function KotysProviderForTest({ children }: { children: ReactNode }) {
  return (
    <KotysProvider
      config={{ baseUrl: "http://test", token: "" }}
      platform={webTestPlatform}
    >
      {children}
    </KotysProvider>
  );
}
