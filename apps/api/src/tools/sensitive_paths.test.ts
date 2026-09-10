import { describe, it, expect } from "vitest";
import { isSensitivePath } from "./sensitive_paths.js";
import { resolvePath } from "./paths.js";

const HOME = "/Users/testuser";
const at = (p: string) => resolvePath(p, HOME);

describe("isSensitivePath", () => {
  it("blocks credential and config paths under home", () => {
    for (const p of [
      "~/.ssh/id_rsa",
      "~/.ssh/authorized_keys",
      "~/.aws/credentials",
      "~/.gnupg/secring.gpg",
      "~/.netrc",
      "~/.zshrc",
      "~/.env",
      "~/.gitconfig",
      "~/.git-credentials",
      "~/.config/gh/hosts.yml",
    ]) {
      expect(isSensitivePath(at(p), HOME), p).toBe(true);
    }
  });

  it("blocks absolute system paths", () => {
    for (const p of [
      "/etc/hosts",
      "/usr/bin/env",
      "/System/Library",
      "/var/db",
    ])
      expect(isSensitivePath(p, HOME), p).toBe(true);
  });

  // macOS and Windows default to case-insensitive filesystems, so `~/.SSH`
  // opens the same file as `~/.ssh`. A case-sensitive denylist is no denylist.
  it("blocks case variants, since the filesystem ignores case", () => {
    for (const p of [
      "~/.SSH/authorized_keys",
      "~/.Ssh/id_rsa",
      "~/.AwS/credentials",
      "~/.ZSHRC",
    ]) {
      expect(isSensitivePath(at(p), HOME), p).toBe(true);
    }
    expect(isSensitivePath("/ETC/hosts", HOME)).toBe(true);
    expect(isSensitivePath("/Etc/passwd", HOME)).toBe(true);
  });

  it("blocks a differently-cased home prefix", () => {
    expect(isSensitivePath("/USERS/TESTUSER/.ssh/id_rsa", HOME)).toBe(true);
  });

  it("blocks traversal that lands back inside a denied directory", () => {
    expect(isSensitivePath(at("~/projects/../.ssh/id_rsa"), HOME)).toBe(true);
    expect(isSensitivePath(at("~/.ssh/../.ssh/config"), HOME)).toBe(true);
  });

  // The chat database is the only copy of every conversation, and ~/Library is
  // not covered by the "/Library" system entry.
  it("blocks the app's own data directory", () => {
    expect(
      isSensitivePath(at("~/Library/Application Support/Kotys/chat.db"), HOME),
    ).toBe(true);
    expect(
      isSensitivePath(at("~/Library/Keychains/login.keychain"), HOME),
    ).toBe(true);
  });

  it("allows ordinary project and document paths", () => {
    for (const p of [
      "~/Projects/testapp/src/index.ts",
      "~/Documents/notes.md",
      "~/Desktop/out.txt",
      // Near-misses that must not trip the prefix match.
      "~/.sshfs-config",
      "~/.environment",
      "~/sshkeys/note.txt",
    ]) {
      expect(isSensitivePath(at(p), HOME), p).toBe(false);
    }
    expect(isSensitivePath("/etcetera/file", HOME)).toBe(false);
  });
});
