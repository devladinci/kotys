/**
 * Read-only classifier for bash commands. Copilot auto-approves the commands
 * this returns true for; everything else asks. Fails closed: compound
 * commands count only when every segment (`|`, `&&`, `||`, `;`) is read-only,
 * substitutions ($(), `…`, heredocs, process substitution) are never
 * classifiable, interpreters (`sed`, `awk`, `sh -c`, …) are excluded
 * wholesale, and any unrecognized verb, flag, or shape asks for approval.
 * Guarded verbs (`find`, `git branch`, `npm audit`, `sort`) are read-only in
 * most forms and write in a few; the write forms ask, the read forms pass.
 */

// Verbs that only read state or transform stdin→stdout.
const READ_ONLY_VERBS = new Set([
  "ls",
  "pwd",
  "cat",
  "bat",
  "head",
  "tail",
  "wc",
  "nl",
  "stat",
  "file",
  "tree",
  "du",
  "df",
  "basename",
  "dirname",
  "realpath",
  "readlink",
  "whoami",
  "id",
  "groups",
  "hostname",
  "uname",
  "uptime",
  "date",
  "cal",
  "tty",
  "arch",
  "nproc",
  "which",
  "whereis",
  "type",
  "printenv",
  "locale",
  "getconf",
  "sleep",
  "true",
  "false",
  "test",
  "seq",
  "grep",
  "egrep",
  "fgrep",
  "rg",
  "ag",
  "ack",
  "cut",
  "tr",
  "sort",
  "uniq",
  "tac",
  "rev",
  "column",
  "fold",
  "fmt",
  "paste",
  "join",
  "comm",
  "expand",
  "unexpand",
  "diff",
  "cmp",
  "strings",
  "od",
  "hexdump",
  "xxd",
  "base64",
  "base32",
  "jq",
  "sha256sum",
  "md5sum",
  "cksum",
  "numfmt",
  "echo",
  "printf",
  "find",
]);

// git subcommands that only read. Subcommands that are reads in some shapes
// and writes in others live in GIT_GUARDED_SUBS with per-shape rules.
const GIT_READ_SUBS = new Set([
  "status",
  "log",
  "show",
  "diff",
  "range-diff",
  "shortlog",
  "describe",
  "blame",
  "annotate",
  "rev-parse",
  "rev-list",
  "name-rev",
  "merge-base",
  "cherry",
  "whatchanged",
  "show-ref",
  "for-each-ref",
  "ls-files",
  "ls-tree",
  "ls-remote",
  "cat-file",
  "diff-tree",
  "diff-files",
  "diff-index",
  "count-objects",
  "verify-commit",
  "verify-tag",
  "check-ignore",
  "check-attr",
  "check-mailmap",
  "fsck",
  "version",
  "help",
  "grep",
  "var",
]);

// Subcommands whose read and write forms differ only by flags/subjects
type GitGuard = {
  flags: RegExp[];
  /** Subjects only count after a read flag — `git branch foo` creates. */
  subjectAfterFlag: boolean;
  /** Subjects over this cap mean a key/value write (git config). */
  maxSubjects?: number;
};

const GIT_LIST_FLAGS = [
  /^-a$/,
  /^-r$/,
  /^-v+$/,
  /^-l$/,
  /^--list$/,
  /^--all$/,
  /^--remotes$/,
  /^--show-current$/,
  /^--contains$/,
  /^--no-contains$/,
  /^--merged$/,
  /^--no-merged$/,
  /^--points-at$/,
  /^--sort/,
  /^--format/,
  /^--color/,
  /^--column/,
  /^-n$/,
];

const GIT_GUARDED_SUBS: Record<string, GitGuard> = {
  branch: { flags: GIT_LIST_FLAGS, subjectAfterFlag: true },
  tag: { flags: GIT_LIST_FLAGS, subjectAfterFlag: true },
  remote: {
    flags: [/^-v$/, /^--verbose$/, /^show$/, /^get-url$/],
    subjectAfterFlag: true,
    maxSubjects: 1,
  },
  stash: {
    flags: [/^(list|show)$/],
    subjectAfterFlag: true,
    maxSubjects: 1,
  },
  config: {
    // one subject = the key being read (`git config user.name`), two = a
    // write (`git config user.name X`) — hence the cap, not subjectAfterFlag
    flags: [
      /^-l$/,
      /^--list$/,
      /^--get$/,
      /^--get-all$/,
      /^--get-regexp$/,
      /^--get-urlmatch/,
      /^--name-only$/,
    ],
    subjectAfterFlag: false,
    maxSubjects: 1,
  },
  worktree: { flags: [/^list$/], subjectAfterFlag: true, maxSubjects: 0 },
  submodule: { flags: [/^(status|summary)$/], subjectAfterFlag: true },
  notes: { flags: [/^(list|show)$/], subjectAfterFlag: true },
};

// <group> [verb]; "**" = the tail is free-form reads. `gh api` is excluded —
// its write methods/body flags hide too easily.
const GH_READ_SHAPES: Record<string, string[]> = {
  pr: ["list", "view", "status", "diff", "checks"],
  issue: ["list", "view", "status", "diff", "checks"],
  run: ["list", "view", "watch"],
  release: ["list", "view", "watch"],
  repo: ["list", "view"],
  workflow: ["list", "view"],
  gist: ["list", "view"],
  label: ["list"],
  variable: ["list"],
  secret: ["list"],
  ssh_key: ["list"],
  gpg_key: ["list"],
  alias: ["list"],
  extension: ["list"],
  search: ["**"],
  auth: ["status"],
  status: ["**"],
};

const PM_READ_SUBS: Record<string, string[]> = {
  npm: [
    "list",
    "ls",
    "view",
    "info",
    "show",
    "outdated",
    "search",
    "ping",
    "whoami",
    "root",
    "prefix",
    "bin",
    "why",
    "explain",
    "docs",
    "repo",
    "home",
    "fund",
    "doctor",
    "help",
    "--version",
    "audit",
    "pkg",
    "config",
  ],
  pnpm: [
    "list",
    "ls",
    "why",
    "outdated",
    "view",
    "info",
    "licenses",
    "root",
    "bin",
    "doctor",
    "help",
    "--version",
    "audit",
    "store",
    "config",
  ],
  yarn: [
    "list",
    "info",
    "why",
    "outdated",
    "licenses",
    "versions",
    "help",
    "--version",
    "config",
  ],
  bun: ["--version", "outdated"],
  pip: [
    "list",
    "show",
    "freeze",
    "check",
    "debug",
    "help",
    "--version",
    "config",
    "cache",
    "index",
  ],
  cargo: [
    "--version",
    "tree",
    "metadata",
    "search",
    "locate-project",
    "verify-project",
    "pkgid",
    "read-manifest",
    "help",
    "config",
  ],
  go: ["version", "doc", "list", "env", "mod", "help"],
  node: ["--version"],
  python: ["--version"],
  python3: ["--version"],
  rustc: ["--version", "--help"],
  rustup: ["show", "which", "--version"],
  make: ["--version", "-v", "-h", "--help"],
  just: ["--list", "-l", "--summary", "--show", "-s", "--version", "--help"],
};

// subcommand → read shapes for the words right after it; anything unlisted
// (`npm config set x y`, `npm audit fix`) asks.
const PM_GUARDED_SUBS: Record<string, Record<string, RegExp[]>> = {
  npm: {
    config: [/^get$/, /^list$/, /^ls$/],
    pkg: [/^get$/],
    audit: [/^$/, /^--json$/, /^--omit=/],
  },
  pnpm: {
    config: [/^get$/, /^list$/, /^ls$/],
    audit: [/^$/, /^--json$/],
    store: [/^status$/],
  },
  pip: {
    config: [/^list$/, /^get$/],
    cache: [/^list$/, /^info$/, /^dir$/],
    index: [/^versions$/],
  },
  cargo: {
    config: [/^get$/],
  },
  go: {
    mod: [/^graph$/, /^verify$/, /^why$/],
  },
  yarn: {
    config: [/^get$/, /^list$/],
  },
};

// `sort -o file` writes without any `>`, so it escapes the redirect policy.
const FILTER_WRITE_FLAGS = [/^-o$/, /^--output$/, /^-o[^-]/, /^--output=/];

const GO_ENV_WRITE_FLAGS = [/^-w$/, /^--write$/, /^-u$/, /^--unset$/];

const FIND_WRITE_FLAGS =
  /^-(delete|exec|execdir|ok|okdir|fls|fprint|fprint0|fprintf)/;

// writable-through-`>` targets that are actually discards or descriptor dups
const DISCARD_TARGETS = new Set([
  "/dev/null",
  "/dev/stdout",
  "/dev/stderr",
  "&1",
  "&2",
  "1",
  "2",
]);

const SHELL_KEYWORDS = new Set([
  "if",
  "then",
  "elif",
  "else",
  "fi",
  "for",
  "while",
  "until",
  "do",
  "done",
  "case",
  "esac",
  "function",
  "select",
  "time",
  "coproc",
  "{",
  "}",
  "[[",
  "]]",
]);

// verbs whose argument (or stdin) is another command
const EXEC_WORDS = new Set([
  "sudo",
  "doas",
  "su",
  "env",
  "xargs",
  "watch",
  "nohup",
  "stdbuf",
  "setsid",
  "script",
  "exec",
  "eval",
  "source",
  "builtin",
  "command",
  "timeout",
  "sh",
  "bash",
  "zsh",
  "fish",
  "dash",
  "ksh",
  "ash",
  "csh",
  "tcsh",
  "sed",
  "awk",
  "gawk",
  "mawk",
  "perl",
  "ruby",
  "php",
  "lua",
  "tee",
  "dd",
  "truncate",
  "sponge",
  "install",
  "ln",
  "cp",
  "mv",
  "rm",
  "npx",
  "curl",
  "wget",
]);

const isEnvPrefix = (word: string): boolean =>
  /^[A-Za-z_][A-Za-z0-9_]*=/.test(word);

type Token =
  | { kind: "word"; value: string }
  | { kind: "redirectIn"; target: string }
  | { kind: "redirectOut"; force: boolean; target: string };

/**
 * Tokenize one command segment into shell words, honoring quotes and
 * backslash escapes; redirections become structured tokens. Returns null on
 * anything ambiguous — substitutions, heredocs, process substitution,
 * unterminated quotes, control operators (the splitter owns those).
 */
function tokenize(segment: string): Token[] | null {
  const tokens: Token[] = [];
  let cur = "";
  let had = false;
  const flush = () => {
    if (had) {
      tokens.push({ kind: "word", value: cur });
      cur = "";
      had = false;
    }
  };
  let i = 0;
  while (i < segment.length) {
    const c = segment[i];
    if (c === "\\" && i + 1 >= segment.length) return null;
    if (c === "\\") {
      cur += segment[i + 1];
      had = true;
      i += 2;
      continue;
    }
    if (c === "'" || c === '"') {
      const quote = c;
      had = true;
      i += 1;
      while (i < segment.length && segment[i] !== quote) {
        if (quote === '"' && segment[i] === "\\") {
          if (i + 1 >= segment.length) return null;
          cur += segment[i + 1];
          i += 2;
          continue;
        }
        cur += segment[i];
        i += 1;
      }
      if (i >= segment.length) return null;
      i += 1;
      continue;
    }
    if (c === "$" || c === "`") return null;
    if (c === "<" && (segment[i + 1] === "(" || segment[i + 1] === "<")) {
      return null;
    }
    if (c === ">" && segment[i + 1] === "(") return null;
    if (c === "|" || c === ";" || c === "&") return null;
    if (c === " " || c === "\t") {
      flush();
      i += 1;
      continue;
    }
    if (c === "<" || c === ">") {
      flush();
      const isOut = c === ">";
      let j = i + 1;
      let force = false;
      // `2>&1`: the fd digit glues to the operator; drop the stray word.
      const last = tokens[tokens.length - 1];
      if (last?.kind === "word" && /^\d+$/.test(last.value)) {
        tokens.pop();
      }
      if (isOut && segment[j] === ">") j += 1;
      else if (isOut && segment[j] === "|") {
        force = true;
        j += 1;
      } else if (isOut && segment[j] === "&") {
        j += 1;
      } else if (!isOut && segment[j] === "&") {
        return null;
      }
      while (
        j < segment.length &&
        (segment[j] === " " || segment[j] === "\t")
      ) {
        j += 1;
      }
      if (j >= segment.length) return null;
      let target = "";
      while (
        j < segment.length &&
        segment[j] !== " " &&
        segment[j] !== "\t" &&
        segment[j] !== ";" &&
        segment[j] !== "\\" &&
        segment[j] !== "'" &&
        segment[j] !== '"'
      ) {
        target += segment[j];
        j += 1;
      }
      if (target === "") return null;
      tokens.push(
        isOut
          ? { kind: "redirectOut", force, target }
          : { kind: "redirectIn", target },
      );
      i = j;
      continue;
    }
    cur += c;
    had = true;
    i += 1;
  }
  flush();
  return tokens;
}

/**
 * Split into segments on `&&`, `||`, `;`, `|` and newlines, honoring quotes.
 * Null on unbalanced quotes, substitutions, or backgrounding.
 */
function splitTopLevel(command: string): string[] | null {
  const segments: string[] = [];
  let cur = "";
  let i = 0;
  while (i < command.length) {
    const c = command[i];
    if (c === "\\") {
      if (i + 1 >= command.length) return null;
      cur += c + command[i + 1];
      i += 2;
      continue;
    }
    if (c === "'" || c === '"') {
      const quote = c;
      cur += c;
      i += 1;
      while (i < command.length && command[i] !== quote) {
        if (quote === '"' && command[i] === "\\") {
          if (i + 1 >= command.length) return null;
          cur += command[i] + command[i + 1];
          i += 2;
          continue;
        }
        cur += command[i];
        i += 1;
      }
      if (i >= command.length) return null;
      cur += c;
      i += 1;
      continue;
    }
    if (c === "$" || c === "`") return null;
    if (c === "\n" || c === ";") {
      segments.push(cur);
      cur = "";
      i += 1;
      continue;
    }
    if (c === "|") {
      if (command[i + 1] === "|") {
        segments.push(cur);
        cur = "";
        i += 2;
        continue;
      }
      if (command[i + 1] === "&") return null; // |&
      segments.push(cur);
      cur = "";
      i += 1;
      continue;
    }
    if (c === "&") {
      if (command[i + 1] === "&") {
        segments.push(cur);
        cur = "";
        i += 2;
        continue;
      }
      // A lone `&` backgrounds. Glued to a redirect (`>&2`, `2>&1`) it is
      // redirect syntax — pass through for the tokenizer to judge.
      const prev = i === 0 ? " " : command[i - 1];
      const next = command[i + 1] ?? " ";
      const standalone =
        (prev === " " || prev === "\t") &&
        (next === " " || next === "\t" || next === ";");
      if (standalone) return null;
      cur += c;
      i += 1;
      continue;
    }
    cur += c;
    i += 1;
  }
  segments.push(cur);
  return segments;
}

function gitRead(words: string[]): boolean {
  const gsub = words[0];
  if (gsub === undefined) return false;
  if (GIT_READ_SUBS.has(gsub)) return true;
  const guard = GIT_GUARDED_SUBS[gsub];
  if (!guard) return false;
  const args = words.slice(1);
  if (args.length === 0) return true;
  let seenFlag = false;
  let subjects = 0;
  for (const a of args) {
    if (guard.flags.some((re) => re.test(a))) {
      seenFlag = true;
      continue;
    }
    if (a.startsWith("-")) return false; // unknown flag
    if (guard.subjectAfterFlag && !seenFlag) return false;
    subjects += 1;
    if (guard.maxSubjects !== undefined && subjects > guard.maxSubjects) {
      return false;
    }
  }
  return true;
}

function ghRead(words: string[]): boolean {
  if (words.length === 0) return false;
  const group = words[0];
  const readVerbs = GH_READ_SHAPES[group];
  if (!readVerbs) return false;
  if (readVerbs[0] === "**") return true;
  const verb = words[1];
  if (verb === undefined) return false; // `gh pr` alone is ambiguous
  return readVerbs.includes(verb);
}

const pmSet = (verb: string): string[] | undefined =>
  PM_READ_SUBS[verb === "pip3" ? "pip" : verb];

const pmGuarded = (verb: string): Record<string, RegExp[]> | undefined =>
  PM_GUARDED_SUBS[verb === "pip3" ? "pip" : verb];

function pmRead(verb: string, words: string[]): boolean {
  const subs = pmSet(verb);
  if (!subs) return false;
  const psub = words[0];
  if (psub === undefined) return false; // bare `make` builds
  if (!subs.includes(psub)) return false;
  if (psub === "help" || psub.startsWith("--version")) return true;
  const shapes = pmGuarded(verb)?.[psub];
  if (!shapes) return true;
  // For guarded shapes the first word must be a listed read form, and later
  // flags must match too — anything else asks.
  const args = words.slice(1);
  if (args.length === 0) return true;
  if (!shapes.some((re) => re.test(args[0]))) return false;
  return args
    .slice(1)
    .every((a) => !a.startsWith("-") || shapes.some((re) => re.test(a)));
}

function classifySegment(segmentRaw: string): boolean {
  const segment = segmentRaw.trim();
  if (segment === "") return false;
  const tokens = tokenize(segment);
  if (!tokens) return false;

  for (const t of tokens) {
    if (t.kind === "redirectOut" && !DISCARD_TARGETS.has(t.target)) {
      return false;
    }
  }

  let i = 0;
  for (;;) {
    const t = tokens[i];
    if (t?.kind === "word" && isEnvPrefix(t.value)) {
      i += 1;
      continue;
    }
    break;
  }
  if (i >= tokens.length) return false; // env assignment only
  const first = tokens[i];
  if (first.kind !== "word") return false;
  const verb = first.value;
  if (SHELL_KEYWORDS.has(verb)) return false;
  if (EXEC_WORDS.has(verb)) return false;
  if (verb.includes("/")) return false; // bare PATH verbs only
  const words = tokens
    .slice(i + 1)
    .filter((t) => t.kind === "word")
    .map((t) => t.value);

  if (verb === "find") {
    return words.every((a) => !FIND_WRITE_FLAGS.test(a));
  }
  if (verb === "sort" || verb === "shuf") {
    return words.every((a) => !FILTER_WRITE_FLAGS.some((re) => re.test(a)));
  }
  if (verb === "go" && words[0] === "env") {
    return !words
      .slice(1)
      .some((a) => GO_ENV_WRITE_FLAGS.some((re) => re.test(a)));
  }
  if (READ_ONLY_VERBS.has(verb)) return true;
  if (verb === "git") return gitRead(words);
  if (verb === "gh") return ghRead(words);
  return pmRead(verb, words);
}

/** True when every segment only reads; anything unrecognized is false. */
export function isReadOnlyBash(command: string): boolean {
  const segments = splitTopLevel(command);
  if (!segments) return false;
  return segments.every((seg) => classifySegment(seg));
}
