/**
 * Copies better-sqlite3 into dist-electron/node_modules. The daemon bundle
 * marks it external (native binding), and the packaged app has no
 * node_modules — without this copy the daemon dies on MODULE_NOT_FOUND and
 * the app reports a startup timeout.
 */
import { cpSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
// Resolved through @kotys/db's context: not a desktop-app dependency.
const require = createRequire(
  path.join(here, "..", "..", "..", "packages", "db", "package.json"),
);

let pkg;
try {
  pkg = path.dirname(require.resolve("better-sqlite3/package.json"));
} catch {
  console.error("copy-sqlite: cannot resolve better-sqlite3");
  process.exit(1);
}

const dest = path.join(
  here,
  "..",
  "dist-electron",
  "node_modules",
  "better-sqlite3",
);
mkdirSync(path.dirname(dest), { recursive: true });
// Dereference: pnpm's node_modules is a symlink tree; the copy must be real.
cpSync(pkg, dest, { recursive: true, dereference: true });
console.log(`copy-sqlite: ${pkg} -> ${path.relative(process.cwd(), dest)}`);
