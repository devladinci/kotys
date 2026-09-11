<p align="center">
  <img src="assets/kotys-256.png" width="120" alt="Kotys logo" />
</p>

<h1 align="center">Kotys</h1>

<p align="center">
  A private AI agent that runs on your own computer.<br />
  Your chats, files, and memories never leave your machine.
</p>

<p align="center">
  <a href="https://github.com/devladinci/kotys/actions/workflows/ci.yml"><img src="https://github.com/devladinci/kotys/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT license" /></a>
</p>

---

## What is Kotys?

Kotys is a chat app for [Ollama](https://ollama.com) models. But it is more
than chat: the model can use **tools**. It can read and write files, run shell
commands, search the web, remember things, and manage your tasks — with your
permission.

Kotys is one API and three clients:

- **Desktop** (Electron) — the main app
- **Mobile** (Expo) — your phone becomes a remote control for the agent on
  your computer
- **Web** (Vite) — a thin browser client

The API runs on your computer. The phone connects over your own network —
LAN or Tailscale. No cloud in the middle.

> ⚠️ **The agent runs shell commands and reads/writes files on your machine.**
> Kotys ships with a path denylist and loopback-only networking (see
> [SECURITY.md](SECURITY.md)), but it is not sandboxed. Read the threat model
> before running it outside your own machine.

## Why Kotys?

- **Local-first.** The model, the database, and the API all run on your
  machine. Nothing is sent anywhere unless you add a cloud tool yourself.
- **A real agent, not a chat box.** 24 built-in tools: shell, files, web
  search, memory, tasks, timers, and more. The model keeps calling them in a
  loop until the work is done, not once per message.
- **The daemon is the app.** A turn runs in the daemon, not in a window. A
  client that goes away does not stop it. The daemon finishes the reply and
  saves it, and a client whose connection dropped asks for the frames it
  missed as soon as it reconnects.
- **Any client can answer.** When a tool wants approval, the request goes to
  every connected client at once, so you approve from whichever one is in
  your hand. An unanswered request expires after 10 minutes and counts as a
  no, so a tool never hangs.
- **You decide how much it can do.** Three permission modes: **ask**,
  **copilot** (the default), and **autopilot**. In the first two the dialog
  names the tool, shows what will run and where, and flags a destructive
  command before anything runs. **autopilot** never asks and never shows an
  approval dialog.
- **Small context by default.** Seven built-in tools are always loaded. The
  rest of the built-ins, every MCP tool, and every skill sit in the prompt as
  a one-line entry until the model loads them with `mcp_load_tools` or
  `load_skill`. A server with 50 tools costs you a list, not 50 schemas.
- **Long chats keep going.** When the next request would crowd out room for
  the reply, Kotys summarizes the earlier turns and carries the summary
  forward. It happens on its own, before the request is sent.
- **Your phone talks to your computer.** The mobile app connects straight to
  your machine over LAN or Tailscale. It can send a message, approve a tool
  call, and read the answer.
- **It remembers you.** Kotys keeps a private memory across chats: who you
  are, how you like to work, what you are building. You can view, edit, or
  delete every memory.
- **MCP support.** Connect any Model Context Protocol server — local
  (`stdio`) or remote (`http`, with OAuth or static headers).
- **Skills.** Teach Kotys new tricks with a markdown file. A skill is
  instructions plus optional scripts. Kotys watches the skills folder, so a
  skill you add or remove shows up without a restart.
- **A codebase you can read.** Six packages, four apps, and the import rules
  between them checked by ESLint instead of left to convention. `contracts`
  depends on nothing but zod. `core` stays free of the DOM so React Native
  can import it.
- **Voice.** Talk instead of typing, with speech-to-text.

## How it works

Kotys runs as a daemon on your machine. The clients are windows onto it: they
send your message over a WebSocket and render what comes back. The turn
itself runs in the daemon: the model call, the tool loop, the approval
prompts. That is why any client can approve a tool call, and why a client
that goes away does not end the turn.

```
  desktop           web              mobile
  (Electron)        (Vite)           (Expo)
      |               |                 |
      +-------- WebSocket + RPC --------+
                      |
              kotys daemon (Hono)
       the turn runs here: model call,
         tool loop, approval prompts
                 |          |
              SQLite      Ollama
```

## Built-in tools

| Group  | Tools                                                                                        |
| ------ | -------------------------------------------------------------------------------------------- |
| Read   | `computer_observe`, `read_file`, `list`, `grep`                                              |
| Write  | `write_file`, `apply_patch`, `bash`                                                          |
| Web    | `web_search`, `web_fetch`                                                                    |
| Memory | `search_memories`, `create_memory`, `update_memory`, `delete_memory`                         |
| Tasks  | `create_todo`, `update_todo`, `complete_todo`, `list_todos`, `delete_todo`, `start_pomodoro` |
| Chats  | `list_chats`, `search_chats`, `get_chat`                                                     |
| Input  | `request_user_input` — asks you a question with a real form                                  |
| System | `current_datetime`                                                                           |

Every tool can be switched off in **Settings → Tooling**. MCP tool toggles
live under **Settings → MCP Servers**.

## Quick start

You need:

- Node.js 22+
- pnpm 10+
- [Ollama](https://ollama.com) running locally, or an Ollama Cloud API key

```bash
pnpm install
pnpm dev
```

This starts the API daemon, the desktop app, and the web client.

## Recipes

Short, practical how-tos live in [docs/recipes.md](docs/recipes.md):

- [Choose a model](docs/recipes.md#choose-a-model)
- [Connect your phone to your computer](docs/recipes.md#connect-your-phone-to-your-computer)
- [Start on your desk, finish on your phone](docs/recipes.md#start-on-your-desk-finish-on-your-phone)
- [Move around fast](docs/recipes.md#move-around-fast)
- [Talk instead of typing](docs/recipes.md#talk-instead-of-typing)
- [Turn tools on and off](docs/recipes.md#turn-tools-on-and-off)
- [Add an MCP server](docs/recipes.md#add-an-mcp-server)
- [Write your first skill](docs/recipes.md#write-your-first-skill)
- [Control what the agent can do](docs/recipes.md#control-what-the-agent-can-do)
- [Keep private files out of reach](docs/recipes.md#keep-private-files-out-of-reach)
- [Remember things between chats](docs/recipes.md#remember-things-between-chats)
- [Tasks, reminders, and focus](docs/recipes.md#tasks-reminders-and-focus)
- [When a chat gets long](docs/recipes.md#when-a-chat-gets-long)
- [See what the agent did](docs/recipes.md#see-what-the-agent-did)
- [Find things you talked about before](docs/recipes.md#find-things-you-talked-about-before)

## Architecture

```
packages/contracts   types, zod schemas, constants    -> every target
packages/client      typed API + WebSocket client     -> every target
packages/core        hooks + stores (platform-free)   -> every UI target
packages/db          SQLite schema and queries        -> api only
packages/ui-tokens   design tokens (colors, spacing) -> ui-web + mobile
packages/ui-web      React DOM components             -> desktop + web
apps/api             Hono server (standalone daemon)
apps/desktop         Electron shell
apps/web             Vite shell
apps/mobile          Expo + React Native
```

The layering is enforced by ESLint rules, not just by convention. See
[docs/architecture.md](docs/architecture.md) for the details, and
[CONTRIBUTING.md](CONTRIBUTING.md) before your first pull request.

## Status

Early, but used daily. The desktop app is the primary target; web and mobile
follow. Expect rough edges and breaking changes. Kotys is in feature freeze
while it is prepared for an open-source release: fixes and documentation for
now, no new features.

## License

MIT — see [LICENSE](LICENSE).
