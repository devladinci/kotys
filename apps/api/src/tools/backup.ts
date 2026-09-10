import { promises as fs } from "node:fs";

/**
 * Copies the file to .bak and verifies the copy by comparing file sizes.
 * Throws if the backup is incomplete — the caller must not proceed with the
 * overwrite if this fails, since a bad backup means we can't recover.
 */
export async function verifiedBackup(resolved: string): Promise<string> {
  const bak = `${resolved}.bak`;
  const originalSize = (await fs.stat(resolved)).size;
  await fs.copyFile(resolved, bak);
  const bakSize = (await fs.stat(bak)).size;
  if (bakSize !== originalSize) {
    await fs.unlink(bak).catch(() => {});
    throw new Error(
      `backup verification failed: size mismatch (${originalSize} → ${bakSize})`,
    );
  }
  return bak;
}
