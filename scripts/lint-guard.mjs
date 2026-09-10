import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const RULE = "import/no-restricted-paths";

// [relative file path, import specifier it violates a zone with]
// Relative specifiers are anchored at packages/<pkg>/src/ — check the depth.
// The db zones intentionally use relative source paths: @kotys/db types only
// exist after a build (dist/), and the guard must fire on a clean checkout.
const fixtures = [
  // zone: packages must not import from apps
  [
    "packages/core/src/__lintguard_fixture.apps.ts",
    "../../../apps/api/src/index",
  ],
  // zone: core must not import ui-web (platform-free)
  ["packages/core/src/__lintguard_fixture.uiweb.ts", "../../ui-web/src/index"],
  // zone: core must not import db (platform-free)
  ["packages/core/src/__lintguard_fixture.db.ts", "../../db/src/index"],
  // zone: contracts is a leaf — no package deps
  ["packages/contracts/src/__lintguard_fixture.db.ts", "../../db/src/index"],
  // zone: contracts is a leaf — no app deps
  [
    "packages/contracts/src/__lintguard_fixture.apps.ts",
    "../../../apps/api/src/index",
  ],
  // zone: ui-web must not import db (DOM package vs native module)
  ["packages/ui-web/src/__lintguard_fixture.db.ts", "../../db/src/index"],
];

const root = process.cwd();
const created = [];
let failed = false;

try {
  for (const [rel, spec] of fixtures) {
    const abs = path.join(root, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(
      abs,
      `// lint-guard fixture, safe to delete\nimport type { UnknownRecord } from "${spec}";\nexport type Fixture = UnknownRecord;\n`,
    );
    created.push(abs);
  }

  const res = spawnSync(
    "npx",
    [
      "eslint",
      "--format",
      "json",
      "--no-warn-ignored",
      ...fixtures.map(([rel]) => rel),
    ],
    { cwd: root, encoding: "utf8", shell: process.platform === "win32" },
  );

  if (res.error || (res.status !== 0 && !res.stdout)) {
    console.error("lint-guard: eslint did not run:", res.stderr || res.error);
    process.exit(1);
  }

  const reports = JSON.parse(res.stdout);
  for (const [rel] of fixtures) {
    const report = reports.find((r) =>
      r.filePath.endsWith(path.normalize(rel)),
    );
    const hits = (report?.messages ?? []).filter((m) => m.ruleId === RULE);
    if (hits.length === 0) {
      console.error(`lint-guard: ZONE DID NOT FIRE for ${rel}`);
      failed = true;
    } else {
      console.log(
        `lint-guard: ok  ${rel}  (${hits.length} violation${hits.length > 1 ? "s" : ""})`,
      );
    }
  }
} finally {
  for (const abs of created) {
    rmSync(abs, { force: true });
  }
}

if (failed) {
  console.error(
    "lint-guard: layering rules are inert — check eslint.config.js settings['import/resolver'] and the zones.",
  );
  process.exit(1);
}
console.log("lint-guard: all zones enforced.");
