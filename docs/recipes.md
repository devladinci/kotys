# Recipes

Short how-tos for everyday things in Kotys. If you want the big picture, read
[architecture.md](architecture.md) first.

- [Connect your phone to your computer](#connect-your-phone-to-your-computer)
- [Turn tools on and off](#turn-tools-on-and-off)
- [Add an MCP server](#add-an-mcp-server)
- [Write your first skill](#write-your-first-skill)
- [Control what the agent can do](#control-what-the-agent-can-do)
- [Keep private files out of reach](#keep-private-files-out-of-reach)
- [Remember things between chats](#remember-things-between-chats)
- [Tasks, reminders, and focus](#tasks-reminders-and-focus)

## Connect your phone to your computer

The phone app is a remote control for the agent on your computer. The
connection is direct: phone → your computer, over your own network. Nothing
goes through a cloud.

**With Tailscale (recommended).** Tailscale gives your devices private IP
addresses that work from anywhere, not just your home Wi-Fi.

1. Install [Tailscale](https://tailscale.com) on your computer and your phone,
   and sign in with the same account.
2. Start Kotys wider than loopback so the phone can reach it:

   ```bash
   KOTYS_HOST=0.0.0.0 pnpm dev
   ```

   The terminal prints a pairing hint with your Tailscale IP, something like
   `phone pairing (tailscale): http://100.x.y.z:3017`.

3. Open the Kotys mobile app, point it at that address, and paste the pairing
   token. The token lives in
   `~/Library/Application Support/Kotys/token` on your computer.

**On your home Wi-Fi.** Same steps, but use the LAN IP the terminal prints
(`192.168.x.x`). Your phone must be on the same network. If it does not
connect, check that your router does not block traffic between devices.

**Security notes.** Every client needs the bearer token, which is checked
with a timing-safe comparison. The API also checks the browser `Origin`
header, which blocks DNS-rebinding attacks. Still, `KOTYS_HOST=0.0.0.0`
listens on every network interface — do it only on networks you trust. Read
[SECURITY.md](../SECURITY.md) before opening the port.

## Turn tools on and off

Every built-in tool can be switched off, and MCP tools too. A switched-off
tool is removed from the model's schema, so the model cannot call it at all —
it does not just get a refusal.

1. Open **Settings → Tools**.
2. Flip the switch next to a tool. The change applies to new messages; a
   reply that is already running is not interrupted.
3. The header shows how many tools are enabled, for example `20/24 enabled`.

MCP tools have their own switches. Open **Settings → MCP Servers**, expand a
server to see its tools, and toggle them one by one.

You do not need to be strict: the dangerous tools (`bash`, `write_file`,
`apply_patch`) already ask for your approval before they run. The toggles are
for keeping the model focused, or for going fully read-only by switching off
the write tools.

## Add an MCP server

Kotys speaks the [Model Context Protocol](https://modelcontextprotocol.io), so
it can use tools from other programs: databases, browsers, issue trackers,
anything with an MCP server.

1. Open **Settings → MCP Servers** and click **+**.
2. Fill in the server:

   - **Local server (`stdio`)** — a program Kotys starts and talks to over
     stdin/stdout. You need a name, a command, and optional args and env, for
     example command `npx` with args `["-y", "@modelcontextprotocol/server-memory"]`.
   - **Remote server (`http`)** — a URL. Supports OAuth (client id) or static
     headers, for example `https://mcp.example.com/mcp`.

3. Save. The server shows a status chip: **connected**, **disconnected**, or
   **error**. Fix problems from the error text shown under the server.

4. **You do not need to load every tool.** Kotys does smart loading:

   - When you connect a server, the model sees only a short index — server
     names plus one-line descriptions, not the full tool list.
   - When a task needs a tool, the model calls `mcp_load_tools`, and Kotys
     loads the best-matching tools for that request, ranked by relevance.
   - `current_datetime` is always loaded.

   This is why a server with 50 tools does not flood the model's context.

5. Toggles: expand the server in settings and switch off tools you never use.

To reconnect a server after fixing a config error, restart the daemon or use
the reconnect button in the settings panel.

## Write your first skill

A skill is a folder with a `SKILL.md` file: instructions the agent reads when
the task needs them. Skills live in `~/.kotys/skills/` (change this with the
`KOTYS_SKILLS_DIR` env var). You can also create and edit skills in
**Settings → Skills**.

**Example: a code-review skill.**

```
~/.kotys/skills/
└── code-review/
    ├── SKILL.md
    └── checklist.md        # extra files are fine
```

`SKILL.md` needs YAML frontmatter with a name and a description, then the
instructions in the body:

```markdown
---
name: code-review
description: Review a git diff for bugs, security problems, and style.
---

# Code review

When asked to review code:

1. Run `git diff` to see the changes.
2. Check the diff for: correctness bugs, missing error handling,
   security issues, and style problems.
3. Read `checklist.md` next to this file for the full checklist.
4. Give the verdict as a short list: must-fix, should-fix, nit.
```

**How Kotys uses skills:**

- Kotys keeps only a short index of your skills in the model's context (name +
  description). The full text is loaded on demand via a `load_skill` tool call,
  so ten skills cost almost nothing until one is needed.
- The `name` must be lowercase letters, numbers, and hyphens (1–64 chars), for
  example `code-review` or `pdf2txt`. The `description` is what makes the
  model pick the skill, so write it like a promise: what the skill is for.
- Extra files next to `SKILL.md` — scripts, templates, references — are all
  available; the body just needs to tell the model to read them.
- A skill is a normal folder on disk. Edit `SKILL.md` in any editor; Kotys
  picks up changes automatically.
- You can put a skill in the chat manually with `/name` if the model does not
  pick it.

**Ideas to try:** a writing style guide, a deploy checklist, a "how I want
commit messages" skill, a data-cleanup script with instructions on when to
run it.

## Control what the agent can do

The permission ladder is in the chat composer (the mode selector). Three
levels:

| Mode          | What happens                                                                                             |
| ------------- | -------------------------------------------------------------------------------------------------------- |
| **ask**       | Confirms **every** tool call, even safe reads. Use it with a new model, or when you do not trust a task. |
| **copilot**   | The default. Reads run freely; anything that writes (`bash`, `write_file`, `apply_patch`) asks first.    |
| **autopilot** | Never asks. Only for fully trusted, repetitive tasks.                                                    |

When a tool asks for approval, you get a dialog with exactly what will run —
the command, the working directory, and a preview. The dialog can be answered
from any connected client (yes, your phone can approve things), and it
expires after 10 minutes: the tool is treated as denied, not left hanging.

Destructive commands are flagged in the dialog. The path denylist is enforced
before approval is even requested, so you will never be asked to approve
something the tool will refuse.

## Keep private files out of reach

Kotys's file tools refuse to touch a list of sensitive paths. The check runs
on the **resolved** path (symlinks and `..` tricks do not bypass it) and is
case-insensitive (`.SSH` is blocked the same as `.ssh`).

Blocked in your home directory: `.ssh`, `.aws`, `.gnupg`, `.docker`, `.kube`,
`.npmrc`, `.netrc`, git credentials and config, shell rc files (`.zshrc`,
`.bash_profile`, …), `.env` files, the macOS keychain, and Kotys's own data
folder. Blocked on the system: `/etc`, `/usr`, `/bin`, `/sbin`, `/var`,
`/System`, `/Library`, `/boot`, `/dev`, `/proc`, `/sys`.

A few practical notes:

- `~/.kotys/skills` is deliberately **not** blocked — skills are allowed to
  bundle scripts for the agent to run.
- The denylist is checked by the file tools (`read_file`, `write_file`,
  `list`, `grep`, `apply_patch`).
- **Honest limits:** `bash` is a real shell. A shell command can read any file
  your user can read, so the denylist does not fence in the shell the same
  way. This is why Kotys asks before running shell commands, and why you
  should read them. For the full threat model, see [SECURITY.md](../SECURITY.md).

## Remember things between chats

Kotys keeps a small private memory and carries it into every chat. Two ways
it grows:

- **Ask.** "Remember that I prefer tabs over spaces." Kotys saves a memory.
- **Automatic.** When Kotys notices something durable — who you are, how you
  work, what you are building — it saves it on its own, quietly.

Four memory types: **user** (who you are), **preference** (how you like
things), **project** (what you are working on), **fact** (anything else).

Manage everything in **Settings → Memory**: search, read, edit, delete. If a
memory is wrong or old, delete it — the model only knows what is in there.

Tips:

- Keep memories small and current. One fact per memory is easier to maintain
  than one giant "about me".
- Tell Kotys to forget things explicitly: "Delete the memory about X."
- Memories are plain text in your local database. They never leave your
  machine.

## Tasks, reminders, and focus

Kotys has a small built-in task system, and it can work with it in chat.

- "Add a task to call the bank on Friday" → `create_todo` with a due date.
- "What's on my plate?" → `list_todos`, sorted.
- "Mark the invoice task done" → `complete_todo`.
- "Start a 25-minute focus timer for the report" → `start_pomodoro`.

Tasks live in the side panel and in **Settings**. You can also create a task
from a chat message without interrupting the conversation — ask Kotys to
"turn this into a task".

Reminders fire even if you are not talking to the agent; the daemon runs on
its own and will notify you.

## See also

- [SECURITY.md](../SECURITY.md) — the threat model, read before exposing the
  port
- [architecture.md](architecture.md) — how the monorepo fits together
- [CONTRIBUTING.md](../CONTRIBUTING.md) — how to build and test locally
