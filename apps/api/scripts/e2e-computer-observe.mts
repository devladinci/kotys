/**
 * Real end-to-end run of the computer_observe tool.
 * Run from apps/api:  npx tsx scripts/e2e-computer-observe.mts
 */
import os from "node:os";
import {
  execute,
  resetFramesForTests,
  pngSize,
} from "../src/tools/computer_observe.js";
import type { ToolContext } from "../src/tools/types.js";

const results: Array<{ label: string; ok: boolean; detail: string }> = [];
function report(label: string, ok: boolean, detail: string): void {
  results.push({ label, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
}

function ctx(chatId: number, approved = true): ToolContext {
  return {
    ollama: undefined as any,
    homedir: os.homedir(),
    chatId,
    chatTopics: [],
    signal: new AbortController().signal,
    requestApproval: approved ? async () => true : async () => false,
  };
}

async function main(): Promise<void> {
  resetFramesForTests();
  console.log("== E2E: computer_observe ==");

  // 1. User declines → declined text, no images
  const d = await execute({}, ctx(42, false));
  report(
    "declined",
    !d.resultImages && /declined|Continue without/i.test(d.content),
    `content: ${d.content.slice(0, 80)}`,
  );

  // 2. Real capture — images attached
  const r1 = await execute({}, ctx(42));
  const imgs1 = r1.resultImages ?? [];
  const ok1 =
    r1.activity.status === "done" &&
    imgs1.length === 1 &&
    imgs1[0].startsWith("iVBOR");
  report(
    "real capture",
    ok1,
    `images: ${imgs1.length}, ${(imgs1[0]?.length / 1024) | 0} KB base64, content: ${r1.content}`,
  );

  if (!ok1) {
    console.error("\nCannot continue without a first real capture.");
    process.exit(1);
  }

  // 3. Unchanged repeat — text only, no image
  const r2 = await execute({}, ctx(42));
  report(
    "unchanged repeat",
    r2.activity.status === "done" &&
      !(r2.resultImages ?? []).length &&
      /unchanged/i.test(r2.content),
    `images: ${(r2.resultImages ?? []).length}, content: ${r2.content}`,
  );

  // 4. Fresh chat id → captures again
  const r3 = await execute({}, ctx(43));
  report(
    "fresh chat captures",
    r3.activity.status === "done" && (r3.resultImages ?? []).length === 1,
    `images: ${(r3.resultImages ?? []).length}`,
  );

  // 5. Screen actually changed between captures? Report only.
  if (r3.resultImages?.[0] && r1.resultImages?.[0]) {
    const a = pngSize(Buffer.from(r1.resultImages[0], "base64"));
    const b = pngSize(Buffer.from(r3.resultImages[0], "base64"));
    console.log(
      `dims: r1=${a.width}x${a.height}, r3=${b ? `${b.width}x${b.height}` : "n/a"}`,
    );
  }

  // 6. max_dim: 1600 accepted, invalid values fall back to 1280
  const r4 = await execute({ max_dim: 1600 }, ctx(44));
  const dims = r4.resultImages?.[0]
    ? pngSize(Buffer.from(r4.resultImages[0], "base64"))
    : null;
  report(
    "max_dim 1600 respected",
    !!dims && Math.max(dims.width, dims.height) <= 1600,
    dims ? `${dims.width}x${dims.height}` : "no image",
  );

  const failed = results.filter((r) => !r.ok);
  console.log("\n---");
  if (failed.length > 0) {
    console.error(`${failed.length} FAILED`);
    process.exit(1);
  }
  console.log("ALL E2E CHECKS PASSED");
}

main().catch((e: unknown) => {
  console.error("E2E failed:", e);
  process.exit(1);
});
