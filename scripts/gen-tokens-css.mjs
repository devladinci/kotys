import { palette } from "../packages/ui-tokens/dist/index.js";
import { writeFileSync } from "node:fs";

const lines = [];
for (const [mode, p] of Object.entries(palette)) {
  const selector =
    mode === "dark"
      ? ':root,\n:root[data-theme="dark"]'
      : ':root[data-theme="light"]';
  lines.push(`${selector} {`);
  for (const [key, value] of Object.entries(p)) {
    const varName = key
      .replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())
      .replace("surface2", "surface-2");
    lines.push(`  --${varName}: ${value};`);
  }
  lines.push("}");
}

const banner = `/* Generated from @kotys/ui-tokens by scripts/gen-tokens-css.mjs — edit the tokens, not this file. */\n`;
writeFileSync(
  new URL("../packages/ui-web/src/tokens.generated.css", import.meta.url),
  banner + lines.join("\n") + "\n",
);
