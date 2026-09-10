import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // jsdom is needed for @testing-library/react's renderHook. This is a test
    // environment only — the package's tsconfig omits DOM from lib so stray
    // document references are compile errors in the actual source.
    environment: "jsdom",
  },
});
