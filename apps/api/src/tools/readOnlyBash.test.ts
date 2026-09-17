import { describe, expect, it } from "vitest";
import { isReadOnlyBash } from "./readOnlyBash.js";

describe("isReadOnlyBash", () => {
  it("allows the inspection commands the read tools cover", () => {
    expect(isReadOnlyBash("find . -name '*.ts'")).toBe(true);
    expect(isReadOnlyBash("find src -type f -mtime -7")).toBe(true);
    expect(isReadOnlyBash("ls -la")).toBe(true);
    expect(isReadOnlyBash("cat README.md")).toBe(true);
    expect(isReadOnlyBash("grep -rn TODO src")).toBe(true);
    expect(isReadOnlyBash("rg 'useChat' packages")).toBe(true);
    expect(isReadOnlyBash("wc -l src/**/*.ts")).toBe(true);
    expect(isReadOnlyBash("file bin/main")).toBe(true);
  });

  it("allows read-only git subcommands", () => {
    expect(isReadOnlyBash("git status")).toBe(true);
    expect(isReadOnlyBash("git diff HEAD~1")).toBe(true);
    expect(isReadOnlyBash("git log --oneline -20")).toBe(true);
    expect(isReadOnlyBash("git ls-files apps")).toBe(true);
    expect(isReadOnlyBash("git blame src/index.ts")).toBe(true);
  });

  it("allows guarded git shapes in their read forms", () => {
    expect(isReadOnlyBash("git branch -a")).toBe(true);
    expect(isReadOnlyBash("git branch --list 'feat/*'")).toBe(true);
    expect(isReadOnlyBash("git tag -l v1.*")).toBe(true);
    expect(isReadOnlyBash("git remote -v")).toBe(true);
    expect(isReadOnlyBash("git stash list")).toBe(true);
    expect(isReadOnlyBash("git config --get user.name")).toBe(true);
    expect(isReadOnlyBash("git config user.name")).toBe(true);
  });

  it("asks on git writes that hide behind plausible reads", () => {
    expect(isReadOnlyBash("git submodule add https://x repo")).toBe(false);
    expect(isReadOnlyBash("git submodule update --init")).toBe(false);
    expect(isReadOnlyBash("git notes add -m note")).toBe(false);
    expect(isReadOnlyBash("git worktree add ../w x")).toBe(false);
  });

  it("allows guarded git reads with subjects after flags", () => {
    expect(isReadOnlyBash("git submodule status ui")).toBe(true);
    expect(isReadOnlyBash("git notes list")).toBe(true);
    expect(isReadOnlyBash("git notes show main")).toBe(true);
  });

  it("asks on guarded git write forms", () => {
    expect(isReadOnlyBash("git branch -D feat/x")).toBe(false);
    expect(isReadOnlyBash("git branch feat/new")).toBe(false); // creates
    expect(isReadOnlyBash("git tag -d v1.0")).toBe(false);
    expect(isReadOnlyBash("git tag v2.0")).toBe(false); // creates
    expect(isReadOnlyBash("git config user.name 'Vlado'")).toBe(false);
    expect(isReadOnlyBash("git remote add origin u")).toBe(false);
  });

  it("find's write modes ask while reads pass", () => {
    expect(isReadOnlyBash("find . -name '*.log' -delete")).toBe(false);
    expect(isReadOnlyBash("find . -name '*.ts' -exec wc -l {} +")).toBe(false);
    expect(isReadOnlyBash("find . -ok rm {} \\;")).toBe(false);
  });

  it("treats every pipeline/compound segment independently", () => {
    expect(isReadOnlyBash("git status && git diff --stat")).toBe(true);
    expect(isReadOnlyBash("find src -name '*.ts' | xargs wc -l")).toBe(false);
    expect(isReadOnlyBash("cat a.txt | sort | uniq -c")).toBe(true);
    expect(isReadOnlyBash("ls; rm file")).toBe(false);
    expect(isReadOnlyBash("echo ok || make build")).toBe(false);
  });

  it("holds back writers even when they look innocent", () => {
    expect(isReadOnlyBash("rm -rf build")).toBe(false);
    expect(isReadOnlyBash("touch newfile")).toBe(false);
    expect(isReadOnlyBash("mkdir -p a/b")).toBe(false);
    expect(isReadOnlyBash("npm install")).toBe(false);
    expect(isReadOnlyBash("npm audit fix")).toBe(false);
    expect(isReadOnlyBash("pnpm --fix audit")).toBe(false);
    expect(isReadOnlyBash("git push")).toBe(false);
    expect(isReadOnlyBash("git commit -m x")).toBe(false);
    expect(isReadOnlyBash("curl https://example.com")).toBe(false);
    expect(isReadOnlyBash("tee out.txt")).toBe(false);
    expect(isReadOnlyBash("sed -n 1p file")).toBe(false); // interpreter
  });

  it("rejects shell re-entry and substitution", () => {
    expect(isReadOnlyBash("sh -c 'ls'")).toBe(false);
    expect(isReadOnlyBash("sudo ls")).toBe(false);
    expect(isReadOnlyBash("env node -e 'x'")).toBe(false);
    expect(isReadOnlyBash("xargs ls")).toBe(false);
    expect(isReadOnlyBash("echo $(whoami)")).toBe(false);
    expect(isReadOnlyBash("cat `ls`")).toBe(false);
    expect(isReadOnlyBash("cat <(ls)")).toBe(false);
    expect(isReadOnlyBash("if true; then ls; fi")).toBe(false);
    expect(isReadOnlyBash("./script.sh")).toBe(false);
    expect(isReadOnlyBash("/bin/rm -rf /")).toBe(false);
    expect(isReadOnlyBash("ls > /tmp/out")).toBe(false); // real-file redirect
    expect(isReadOnlyBash("cat < /etc/passwd > out")).toBe(false);
  });

  it("permits discard redirections", () => {
    expect(isReadOnlyBash("find . -name '*.log' 2>/dev/null")).toBe(true);
    expect(isReadOnlyBash("grep -r foo . >/dev/null 2>&1")).toBe(true);
    expect(isReadOnlyBash("ls > /dev/null")).toBe(true);
    expect(isReadOnlyBash("ls >&2")).toBe(true);
  });

  it("allows input redirection but not writes through it", () => {
    expect(isReadOnlyBash("grep foo < notes.txt")).toBe(true);
  });

  it("allows env prefixes that only change locale or output", () => {
    expect(isReadOnlyBash("LC_ALL=C sort file.txt")).toBe(true);
    expect(isReadOnlyBash("LANG=C NO_COLOR=1 git status")).toBe(true);
    expect(isReadOnlyBash("NODE_ENV=dev node --version")).toBe(true);
  });

  it("asks when an env prefix could change what runs", () => {
    expect(
      isReadOnlyBash("GIT_SSH_COMMAND='touch x' git ls-remote git@h:a/b"),
    ).toBe(false);
    expect(isReadOnlyBash("GIT_EXTERNAL_DIFF='touch x' git diff")).toBe(false);
    expect(isReadOnlyBash("NODE_OPTIONS=--require=./x.js node --version")).toBe(
      false,
    );
    expect(isReadOnlyBash("PATH=. ls")).toBe(false);
    expect(isReadOnlyBash("PAGER=./x git log")).toBe(false);
    expect(isReadOnlyBash("FOO=1 BAR=2 git status")).toBe(false);
  });

  it("asks on read verbs whose flags run a program or write a file", () => {
    for (const command of [
      "rg --pre ./x needle",
      "rg --pre=./x needle",
      "ag --pager=./x needle",
      "bat --paging=always --pager='sh -c x' notes.md",
      "ack needle",
      "git diff --output=out.patch",
      "git log --output out.txt",
      "git grep -O needle",
      "git grep --open-files-in-pager=./x needle",
      "git ls-remote --upload-pack='touch x' .",
      "git ls-remote -u 'touch x' .",
      "uniq in.txt out.txt",
      "xxd in.bin out.hex",
      "tree -o out.txt",
      "base64 -i in.txt -o out.txt",
      "base64 --output=out.txt in.txt",
      "file -C -m magic",
      "go list -toolexec=./x ./...",
      "go list -exec ./x ./...",
    ]) {
      expect(isReadOnlyBash(command), command).toBe(false);
    }
  });

  it("still allows the plain forms of those verbs", () => {
    for (const command of [
      "rg --json needle",
      "ag needle src",
      "bat README.md",
      "git grep -n needle",
      "git ls-remote origin",
      "git status -u",
      "uniq -c sorted.txt",
      "xxd file.bin",
      "tree -L 2",
      "base64 -i in.txt",
      "file -b bin/main",
      "go list ./...",
    ]) {
      expect(isReadOnlyBash(command), command).toBe(true);
    }
  });

  it("allows package-manager reads, guarded shapes included", () => {
    expect(isReadOnlyBash("npm ls --depth=0")).toBe(true);
    expect(isReadOnlyBash("npm view react version")).toBe(true);
    expect(isReadOnlyBash("npm audit")).toBe(true);
    expect(isReadOnlyBash("npm audit --json")).toBe(true);
    expect(isReadOnlyBash("npm config get registry")).toBe(true);
    expect(isReadOnlyBash("npm pkg get name")).toBe(true);
    expect(isReadOnlyBash("pnpm store status")).toBe(true);
    expect(isReadOnlyBash("pip list --outdated")).toBe(true);
    expect(isReadOnlyBash("pip cache dir")).toBe(true);
    expect(isReadOnlyBash("go version")).toBe(true);
    expect(isReadOnlyBash("go mod graph")).toBe(true);
    expect(isReadOnlyBash("cargo tree")).toBe(true);
    expect(isReadOnlyBash("node --version")).toBe(true);
    expect(isReadOnlyBash("make --version")).toBe(true);
  });

  it("asks on pm write shapes", () => {
    expect(isReadOnlyBash("npm config set registry http://x")).toBe(false);
    expect(isReadOnlyBash("pip cache purge")).toBe(false);
    expect(isReadOnlyBash("go mod edit -module=x")).toBe(false);
    expect(isReadOnlyBash("go env -w GOFLAGS=-mod=mod")).toBe(false);
    expect(isReadOnlyBash("sort -o out.txt in.txt")).toBe(false);
    expect(isReadOnlyBash("shuf --output=f in.txt")).toBe(false);
  });

  it("fails closed on unparseable input", () => {
    expect(isReadOnlyBash("")).toBe(false);
    expect(isReadOnlyBash("cat 'unterminated")).toBe(false);
    expect(isReadOnlyBash("ls \\")).toBe(false);
    expect(isReadOnlyBash("ls &")).toBe(false);
    expect(isReadOnlyBash("ls;")).toBe(false);
  });
});
