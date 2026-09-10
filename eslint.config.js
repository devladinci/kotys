import js from "@eslint/js";
import importPlugin from "eslint-plugin-import";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.turbo/**",
      "**/.expo/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { import: importPlugin },
    settings: {
      "import/resolver": {
        typescript: { alwaysTryTypes: true },
        node: true,
      },
    },
    rules: {
      "import/no-restricted-paths": [
        "error",
        {
          zones: [
            {
              target: "./packages",
              from: "./apps",
              message:
                "packages/ must not import from apps/. Shared code belongs in a package.",
            },
            {
              target: "./packages/core",
              from: "./packages/ui-web",
              message:
                "packages/core must stay platform-free so React Native can import it.",
            },
            {
              target: "./packages/core",
              from: "./packages/db",
              message:
                "packages/core must stay platform-free so React Native can import it.",
            },
            {
              target: "./packages/ui-web",
              from: "./packages/db",
              message:
                "ui-web is a DOM package; db owns better-sqlite3. Wire types belong in contracts.",
            },
            {
              target: "./packages/contracts",
              from: "./packages",
              except: ["./contracts"],
              message: "contracts is the leaf package; it depends on nothing.",
            },
            {
              target: "./packages/contracts",
              from: "./apps",
              message: "contracts is the leaf package; it depends on nothing.",
            },
          ],
        },
      ],
      // Workspace packages are consumed as source or compiled via tsc; the
      // type-only import style is already enforced by verbatimModuleSyntax.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["**/*.test.*"],
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  jsxA11y.flatConfigs.recommended,
  {
    // Metro/babel config files are CommonJS by design — Expo scaffolds them
    // with require/module. Electron build-tooling scripts are plain Node.
    files: ["**/metro.config.js", "**/electron/*.mjs"],
    languageOptions: {
      globals: {
        require: "readonly",
        module: "writable",
        __dirname: "readonly",
        console: "readonly",
        process: "readonly",
      },
    },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
);
