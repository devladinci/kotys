import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import electron from "vite-plugin-electron/simple";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    electron({
      main: {
        entry: "electron/main.ts",
        onstart(args) {
          // Start Electron only after Vite's dev server is up.
          args.startup();
        },
      },
      // The simple API's preload defaults are load-bearing: sandboxed
      // renderers reject ESM preloads, so this must stay CJS. Only the
      // output filename is pinned (to .js) since package type is "module".
      preload: {
        input: "electron/preload.ts",
        vite: {
          build: {
            rollupOptions: {
              output: { entryFileNames: "[name].js" },
            },
          },
        },
      },
    }),
  ],
});
