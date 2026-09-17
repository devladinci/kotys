import { describe, it, expect, beforeAll, afterAll } from "vitest";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { resolvePath, realResolvedPath } from "./paths.js";
import { isSensitivePath, isSensitiveTarget } from "./sensitive_paths.js";

const HOME = "/Users/testuser";

describe("resolvePath", () => {
  it("expands ~ against homedir", () => {
    expect(resolvePath("~/notes.md", HOME)).toBe("/Users/testuser/notes.md");
    // The separator after ~ must be dropped, or resolve() treats the rest as
    // absolute and discards home entirely.
    expect(resolvePath("~/Projects/a", HOME)).toBe(
      "/Users/testuser/Projects/a",
    );
  });

  it("resolves relative paths against homedir, not cwd", () => {
    expect(resolvePath("notes.md", HOME)).toBe("/Users/testuser/notes.md");
  });

  it("keeps absolute paths and normalizes traversal", () => {
    expect(resolvePath("/tmp/x/../y", HOME)).toBe("/tmp/y");
  });

  it("trims surrounding whitespace", () => {
    expect(resolvePath("  ~/a.txt  ", HOME)).toBe("/Users/testuser/a.txt");
  });
});

describe("realResolvedPath", () => {
  let root: string;

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "paths-test-"));
    await fs.mkdir(path.join(root, "secrets"));
    await fs.writeFile(path.join(root, "secrets", "key"), "s3cret");
    await fs.symlink(path.join(root, "secrets"), path.join(root, "innocent"));
  });

  afterAll(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("resolves a symlinked directory in the middle of the path", async () => {
    const viaLink = path.join(root, "innocent", "key");
    const real = await realResolvedPath(viaLink);
    expect(real).toBe(await fs.realpath(path.join(root, "secrets", "key")));
  });

  it("resolves through a link even when the target file does not exist yet", async () => {
    const viaLink = path.join(root, "innocent", "brand-new.txt");
    const real = await realResolvedPath(viaLink);
    expect(path.dirname(real)).toBe(
      await fs.realpath(path.join(root, "secrets")),
    );
    expect(path.basename(real)).toBe("brand-new.txt");
  });

  it("walks up past several missing segments", async () => {
    const deep = path.join(root, "innocent", "a", "b", "c.txt");
    const real = await realResolvedPath(deep);
    expect(real).toBe(
      path.join(
        await fs.realpath(path.join(root, "secrets")),
        "a",
        "b",
        "c.txt",
      ),
    );
  });

  it("gives up on a symlink loop without hanging", async () => {
    await fs.symlink(path.join(root, "loop-b"), path.join(root, "loop-a"));
    await fs.symlink(path.join(root, "loop-a"), path.join(root, "loop-b"));
    const real = await realResolvedPath(path.join(root, "loop-a"));
    expect(typeof real).toBe("string");
  });

  it("returns the input unchanged when nothing on the path exists", async () => {
    const nowhere = "/definitely/not/here/file.txt";
    expect(await realResolvedPath(nowhere)).toBe(nowhere);
  });

  // The point of the whole helper: a link into a protected directory must not
  // launder the path past the denylist.
  //
  // The fake home lives under /tmp rather than os.tmpdir(): on macOS the latter
  // is /var/folders/..., and /var is denied outright, which would mask exactly
  // the distinction being tested. /tmp is itself a symlink to /private/tmp,
  // which is what makes it a good stand-in for a symlinked home.
  it("exposes a symlink that points into a denied directory", async () => {
    const home = await fs.mkdtemp(path.join("/tmp", "home-"));
    try {
      await fs.mkdir(path.join(home, ".ssh"));
      await fs.symlink(path.join(home, ".ssh"), path.join(home, "notes"));

      const lexical = resolvePath("notes/authorized_keys", home);
      // The literal path betrays nothing.
      expect(isSensitivePath(lexical, home)).toBe(false);
      // Following the link does, even though home is reached via /tmp and the
      // real target sits under /private/tmp.
      expect(await isSensitiveTarget(lexical, home)).toBe(true);
    } finally {
      await fs.rm(home, { recursive: true, force: true });
    }
  });

  it("exposes a file symlink whose own name looks harmless", async () => {
    const home = await fs.mkdtemp(path.join("/tmp", "home-"));
    try {
      await fs.mkdir(path.join(home, ".ssh"));
      await fs.writeFile(path.join(home, ".ssh", "id_rsa"), "key");
      await fs.mkdir(path.join(home, "repo"));
      await fs.symlink("../.ssh/id_rsa", path.join(home, "repo", "notes.txt"));
      await fs.symlink("../.ssh", path.join(home, "repo", "more"));

      expect(
        await isSensitiveTarget(resolvePath("repo/notes.txt", home), home),
      ).toBe(true);
      expect(
        await isSensitiveTarget(resolvePath("repo/more", home), home),
      ).toBe(true);
    } finally {
      await fs.rm(home, { recursive: true, force: true });
    }
  });

  it("exposes a dangling symlink into a denied directory", async () => {
    const home = await fs.mkdtemp(path.join("/tmp", "home-"));
    try {
      await fs.mkdir(path.join(home, ".ssh"));
      await fs.symlink(
        path.join(home, ".ssh", "authorized_keys"),
        path.join(home, "keys.txt"),
      );

      expect(await isSensitiveTarget(resolvePath("keys.txt", home), home)).toBe(
        true,
      );
    } finally {
      await fs.rm(home, { recursive: true, force: true });
    }
  });

  it("still allows an ordinary file in the same home", async () => {
    const home = await fs.mkdtemp(path.join("/tmp", "home-"));
    try {
      const ok = resolvePath("notes/todo.md", home);
      expect(await isSensitiveTarget(ok, home)).toBe(false);
    } finally {
      await fs.rm(home, { recursive: true, force: true });
    }
  });
});
