# Recipes

Short how-tos for everyday things in Kotys. If you want the big picture, read
[architecture.md](architecture.md) first.

- [Choose a model](#choose-a-model)
- [Connect your phone to your computer](#connect-your-phone-to-your-computer)
- [Start on your desk, finish on your phone](#start-on-your-desk-finish-on-your-phone)
- [Move around fast](#move-around-fast)
- [Talk instead of typing](#talk-instead-of-typing)
- [Turn tools on and off](#turn-tools-on-and-off)
- [Add an MCP server](#add-an-mcp-server)
- [Write your first skill](#write-your-first-skill)
- [Control what the agent can do](#control-what-the-agent-can-do)
- [Keep private files out of reach](#keep-private-files-out-of-reach)
- [Remember things between chats](#remember-things-between-chats)
- [Tasks, reminders, and focus](#tasks-reminders-and-focus)
- [When a chat gets long](#when-a-chat-gets-long)
- [See what the agent did](#see-what-the-agent-did)
- [Find things you talked about before](#find-things-you-talked-about-before)

## Choose a model

Kotys does not ship a model of its own. It lists what your providers have
and lets you pick one per chat.

**Where the list comes from.** Kotys asks every enabled provider for its
models and merges the answers. Ollama is always asked twice: the local
daemon on `http://localhost:11434`, and Ollama Cloud on `https://ollama.com`.
An OpenAI-compatible server is asked too, if you turned one on. One provider
failing does not blank the picker. The others still list. The last list is
cached, so the picker opens filled in and refreshes in the background.

**Telling them apart.** The picker sits under the message box, in the same
strip as the mode selector. Every row carries a badge on the right:

| Badge   | Where it runs                            |
| ------- | ---------------------------------------- |
| `LOCAL` | Your own Ollama daemon                   |
| `CLOUD` | Ollama Cloud                             |
| `OMLX`  | The OpenAI-compatible server you enabled |

Small icons on the same row say what the model can do: an eye for vision
(images), a wrench for tool calling, a brain for thinking. The search box at
the top filters by name. If you see `No models available`, the merged list
came back empty. Check that Ollama is running, and that you have pulled a
model. On the phone the picker opens as a sheet with the same badges.

**A hosted model needs a key.** Ollama Cloud models work only once you save
an API key in **Settings → General**, under **Providers**. Until you do, a
chat on a cloud model shows `Set API key in settings...` in the composer.
Keys are stored in the local SQLite database and are never sent back to the
UI.

The same section has an **oMLX** checkbox. Turn it on. Leave the server URL
blank to use `http://127.0.0.1:7777/v1`, or type your own. Its models then
appear with the `OMLX` badge.

**Per chat, and the default.** Every chat remembers its own model. Picking a
model does two things: it switches the chat you have open, and it becomes
the default for chats you create later. On the welcome screen, with no chat
open, only the default changes.

The shipped default is `kimi-k2.7-code`, an Ollama Cloud model. Pick
anything else once and Kotys keeps your choice instead.

**Context length.** Kotys reads each model's context length from the
provider while it lists models, and the token badge under the composer
counts against that number. Models from your local Ollama daemon are capped
at 32,768 tokens, because a local model claims its whole KV cache at load
time whether the conversation fills it or not. Cloud models and oMLX models
keep the window their server reports. When no window is reported, the count
falls back to 262,144. A refreshed listing writes the new window into chats
you already have, so a window that moves provider-side reaches an old chat
without re-picking the model.

**Thinking effort.** When the chat's model reports the thinking capability, a
brain selector appears next to the model picker: `off`, `low`, `medium`,
`high`, `max`, from no reasoning to maximum reasoning. It starts at
`medium`. It is one app-wide setting, not one per chat.

**Loading and unloading a local model.** **Settings → General** lists the
local models Ollama is holding in memory right now, each with the memory it
uses and how long until it expires. **Stop** unloads one. The refresh button
re-reads the list. This list is in the desktop and web apps. The phone
settings screen does not have it.

## Connect your phone to your computer

The phone app is a remote control for the agent on your computer. The
connection is direct: phone → your computer, over your own network. Nothing
goes through a cloud.

**With Tailscale (recommended).** Tailscale gives your devices private IP
addresses that work from anywhere, not just your home Wi-Fi.

1. Install [Tailscale](https://tailscale.com) on your computer and your phone,
   and sign in with the same account.
2. Start Kotys. The daemon binds `0.0.0.0` by default, so the phone can
   reach it on any interface. The pairing hint comes from the `bin/dev`
   wrapper, which starts the desktop stack, not from `pnpm dev`:

   ```bash
   bin/dev
   ```

   The terminal prints a pairing hint with your Tailscale IP, something like
   `phone pairing (tailscale, works from any network): http://100.x.y.z:3017`,
   then the path to your token. Prefer the Tailscale URL — it works from any
   network, not just your home Wi-Fi.

3. Open the Kotys mobile app, point it at that address, and paste the pairing
   token. The token sits next to the database: on macOS
   `~/Library/Application Support/Kotys/token`, on Linux
   `~/.local/share/kotys/token` (or under `$XDG_DATA_HOME`), on Windows
   `%APPDATA%\Kotys\token`. Set `KOTYS_DB_PATH` and it moves with the
   database.

**On your home Wi-Fi.** Same steps, but use the LAN IP the terminal prints
(`192.168.x.x`). Your phone must be on the same network. If it does not
connect, check that your router does not block traffic between devices.
`bin/dev` only reads that LAN address on macOS; elsewhere, read it off your
own network settings.

**Security notes.** Every client needs the bearer token, which is checked
with a timing-safe comparison. The API also checks the browser `Origin`
header, which blocks DNS-rebinding attacks. Still, `KOTYS_HOST=0.0.0.0`
listens on every network interface — do it only on networks you trust. Read
[SECURITY.md](../SECURITY.md) before opening the port.

## Start on your desk, finish on your phone

The window you are looking at does not produce the reply. Your client sends
one message over the WebSocket, and the daemon takes it from there. It calls
the model, runs the tools, and saves the answer. Every connected client
watches the same turn. That is what lets you start something on your Mac and
finish it on your phone.

If your phone cannot reach the daemon yet, start with
[Connect your phone to your computer](#connect-your-phone-to-your-computer).

**Closing a window does not stop the turn.** The daemon writes the reply to
the database while it runs: it rewrites the assistant message about once a
second, and it saves the finished reply itself, even when the client that
asked for it is gone. A client going away cancels nothing. Only two things
stop a running turn: the stop button in the client that started it, and
stopping the daemon.

**Quitting is not the same as closing.** The desktop app starts the daemon
when none is running, and stops that daemon when you quit the app. Closing
the window is not quitting. On macOS the app stays alive with no windows, and
so does the daemon. On Windows and Linux, closing the last window quits the
app, which stops the daemon the app started, and the turn with it. If a
daemon was already running when the app started, the app attached to it
instead, and quitting leaves it running. Set `KOTYS_KEEP_DAEMON=1` to keep a
daemon the app started alive after a quit.

**Rejoining a stream in progress.** Every stream frame carries a sequence
number, and each client remembers the highest number it has seen per request.
When the socket comes back, the client sends `chat:resume` with that number
and the daemon replays every frame after it. Clients also ping every 15
seconds and reconnect on their own. The phone app checks its socket whenever
you bring it back to the foreground and reconnects at once if it went stale.
So a reply that finished generating while the phone was in your pocket is
still there when you look.

The replay buffer is not infinite. It holds the last 4000 frames of a turn,
and it is dropped 10 minutes after the turn ends. When the buffer is gone the
daemon rebuilds a final frame from the saved message instead, so a client
never sits on a spinner waiting for an answer that already happened. That
final frame carries the whole reply rather than a delta, so dropped frames do
not leave holes in the text.

**Watching from a second client.** Open the same chat somewhere else and you
see the turn as it happens, even though that client did not start it. Stream
frames go to every client, and a client showing that chat applies them. On
top of that the daemon sends a progress pulse once a second, so a client that
joined halfway through pulls that one message fresh and catches up.

Leaving a chat and coming back does not lose your place. When the view is
rebuilt, the client asks the daemon which stream is still live in that chat
and takes its own stream back over, so the stop button returns instead of a
send button over a reply that is still being written.

**Approvals go to every client, and the first answer wins.** When a tool
needs your consent, the daemon broadcasts the request to every connected
client with the same detail: the tool, the command, the working directory,
whether it matches a destructive pattern, and the hostname of the machine it
will run on. The phone sheet shows that hostname under **Runs on**. Any
client can answer. The moment one does, the daemon retracts the request from
all the others and their dialogs close by themselves. A late second answer is
ignored.

An unanswered request expires after 10 minutes and counts as a denial, so a
tool never hangs waiting for someone who went to lunch. Stopping the turn
also retracts the dialog and denies the tool.

**The request is sent once.** It reaches the clients connected at that
moment. A phone that is asleep, or an iOS app that has been backgrounded, has
no socket, so it does not get the request, and there is nothing to catch up
on afterwards: pending approvals are not replayed on reconnect. To answer
from the phone, have the app open when the tool asks.

**Reminders come from the daemon.** The reminder scheduler runs in the
daemon, not in a client. It sweeps for due reminders five seconds after
startup and every minute after that, and marks each task as reminded so it
fires once. Nothing is lost while the daemon is down: the next sweep still
finds the reminder. More than three at once collapse into a single summary.

Delivery is a broadcast like everything else. The desktop and web clients
turn it into a system notification. Every connected client reloads its task
list and brings the task into view. If nothing is connected when a reminder
fires, the task is still marked as reminded, so what you get is the task
waiting in your list rather than a notification.

**A worked example.**

1. On the desktop, send the long task in **copilot** mode. The daemon starts
   the turn and the reply begins to appear.
2. Lock the Mac and leave the app running. The turn keeps going, and the
   daemon keeps writing the reply to the database.
3. Pick up your phone, open Kotys, and open the same chat. The reply is there
   up to wherever it has reached, and it keeps growing while you watch.
4. The model wants to run a shell command. The approval sheet appears on the
   phone with the command, the directory, and the name of the Mac it will run
   on. Tap **Approve**. A destructive command needs a second tap. The dialog
   on the desktop closes by itself.
5. Put the phone away. Its socket drops. The turn does not.
6. Open the app again later. It reconnects, replays whatever it missed, and
   shows the finished reply. Past the 10-minute buffer window it loads the
   saved message instead. Either way you read the same answer.

When a turn takes more than two seconds, the daemon also sends a notification
carrying the first 120 characters of the reply. So an unlocked Mac tells you
the answer is ready while you are doing something else.

**Honest limits:**

- A client that is not connected when a tool asks for approval never sees
  that request, and nothing replays it later.
- The system notification for reminders and finished replies comes from the
  desktop and web clients. The phone app does not raise one.
- You can watch a turn and answer its approvals from any client, but the stop
  button belongs to the client that started it.
- Quitting the desktop app stops the daemon it started, and a stopped daemon
  stops the turn with it.

## Move around fast

Kotys is built for the keyboard. The shortcuts and the command palette work
in the desktop app and the web client, which share one interface. The phone
app has its own layout, with its own version of the `/` menu.

**The shortcuts.** Kotys accepts Command or Ctrl for every one of these, so
press Ctrl on Windows and Linux where the table says ⌘. The hints printed in
the app are hard-coded to the macOS symbols: ⌘ is Command, ⇧ is Shift.

| Keys    | What it does                                                       |
| ------- | ------------------------------------------------------------------ |
| **⌘K**  | Open or close the command palette. Works while you are typing.     |
| **⌘N**  | Create a chat, open it, and put the cursor in the composer.        |
| **⌘/**  | Put the cursor in the composer.                                    |
| **⌘F**  | Put the cursor in the chat search box in the left sidebar.         |
| **⌘,**  | Open settings.                                                     |
| **⌘⇧T** | Show or hide the side panel that holds tasks and the focus timer.  |
| **⌘⇧P** | Show the focus timer. Folds and unfolds it when the panel is open. |

Two notes on ⌘F. It is ignored while the cursor is in a plain text box, such
as the search field itself, so it does not fight the browser's own find. The
message composer is not one of those, so ⌘F still jumps to the search box
from there. And it needs the left sidebar to be visible, since that is where
the search box lives.

Escape has one more job. In settings it takes you back to the chat you came
from, or to the welcome screen if you have not opened one.

In the composer, Enter sends the message and Shift+Enter starts a new line.

**The command palette.** ⌘K opens one box with two kinds of result. Type to
filter, arrow keys to move, Enter to run, Escape to close.

The commands are:

- **New chat**
- **Switch to dark theme**, or **Switch to light theme** when you are already
  in the dark one
- **Toggle tasks side panel**
- **Show focus timer**
- **Open settings**

Under the commands come up to eight of your chats, filtered by title against
what you typed. Enter jumps to one.

**The `/` menu in the composer.** Type `/` as the first character of a
message and a menu of your skills opens. Keep typing to filter it. The filter
matches the skill name and the description, so a word from either one finds
the skill.

- ↑ and ↓ move, **Enter** or **Tab** picks the highlighted skill, and
  **Escape** dismisses the menu. Clicking a row picks it too.
- Each row shows `/name`, the argument hint if the skill declares one with
  `argument-hint` in its frontmatter, and the description.
- Picking inserts the plain text `/name` into the composer and keeps anything
  you already typed after it. Nothing is sent yet.
- Enter picks the highlighted skill instead of sending. Press Enter again to
  send. If your filter matches nothing, Enter sends.
- A skill with `user-invocable: false` in its frontmatter never shows up here.
  Those are for the model to pick.

When you send `/name some args`, Kotys looks the skill up and sends its body
in place of the bare command. In that body `$ARGUMENTS` and `$0` become the
whole argument string, and `$1` to `$9` become the arguments split on
whitespace. A position you did not supply becomes an empty string. The
message is stored as the `/name some args` line plus the filled-in body, so
the instructions are still there on later turns.

A `/name` Kotys does not recognize is sent exactly as you typed it, arguments
and all. The model reads it and can tell you the skill does not exist.

**The settings sections.** ⌘, opens settings and Escape leaves. The rail on
the left holds seven sections: **General**, **Tooling**, **MCP Servers**,
**Skills**, **Memory**, **Pomodoro**, and **Voice**. Three of them carry a
count: **MCP Servers** shows how many servers are connected, **Skills** how
many are enabled, and **Memory** how many memories you have.

**In the tasks panel.** With the panel open, press `N` to open the new task
form, unless you are typing somewhere already or a dialog is up. With a task
row focused, Enter marks it done or undone, `E` edits it, `Delete` deletes
it, and `C` starts a chat about it. The divider between the panel and the
chat takes focus too: ← and → resize the panel a step at a time, and a
double-click resets the width.

## Talk instead of typing

Kotys can take a spoken message instead of a typed one. It is optional, and
it is off until you set it up: no transcription model is selected out of the
box, and holding the mic before then only produces an error.

**What you need.** Speech-to-text is not built into Kotys. Kotys sends the
recording to the daemon, and the daemon uploads it to an OpenAI-compatible
server that serves `/audio/transcriptions`. oMLX is the server this is
written against. You run that server yourself and load a speech-to-text model
on it. Kotys never starts it for you.

**Set it up** from the desktop or web app:

1. Open **Settings → General**. Under **Providers**, tick **oMLX**.
2. Put the server's `/v1` address in **Server URL**. The placeholder shows the
   default, `http://127.0.0.1:7777/v1`, and an empty box means that address.
3. Open **Settings → Voice** and choose a model under **Transcription
   model**. Pick **None** to turn dictation off again.

The picker only lists speech-to-text models. Kotys asks the server for
`/models/status` and keeps the models whose `engine_type` is `audio_stt`. A
server without that endpoint falls back to `/models`, keeping the names that
look like audio models (`whisper`, `parakeet`, `asr`, and a few more). If
oMLX is off, or the server is not running, the list comes back empty and the
screen tells you there are no models.

**On the desktop.** The mic sits at the left end of the composer row, before
the attach-images button. Hold it down to record. The icon becomes a red dot
while it listens, and the app asks for the microphone the first time. Release
to send the audio to the daemon; the button pulses while the text comes back.

The transcript is sent as a chat message as soon as it arrives. It does not
land in the composer for you to edit first, and the composer is cleared. If
the press is cancelled instead of released, the recording is dropped and
nothing is uploaded. A press too short to capture any audio is refused before
the upload, with "Recording was too short".

**On the phone.** Same gesture: hold the mic in the composer row, and release
to transcribe. The first use asks for microphone permission, and a refusal
shows up as a "Voice input failed" alert. While you hold, the message
placeholder counts the seconds; it says "Transcribing…" while the text comes
back. The transcript is sent as its own message, and whatever you had typed
stays in the box.

The phone does not do the work. The audio goes to the daemon on your
computer over the connection you already paired, and the daemon talks to
oMLX. Pick the model in **Settings → Voice** on the phone if you like: it is
one setting, stored once on the daemon, shared by every client.

On iOS the recording is 16 kHz mono wav. On Android it is AAC in an mp4
container, which is not verified against the transcription model.

**When it does not work.** The mic button is always there, even with nothing
configured, so failures show up on release:

- No model selected: the API refuses with "No speech-to-text model selected".
  The desktop shows that message under the composer for a few seconds. The
  phone shows a "Voice input failed" alert with the status code instead of
  the message.
- oMLX turned off, or the server unreachable: transcription fails. On the
  desktop and the web you get the error text from the server. On the phone
  you get the status code only.
- Recordings are capped at 25 MB, and an empty recording is rejected.

Dictation uses the same bearer token as the rest of the API, so a phone that
is already paired needs nothing extra.

## Turn tools on and off

Every built-in tool can be switched off, and MCP tools too. A switched-off
tool is removed from the model's schema, so the model cannot call it at all —
it does not just get a refusal.

1. Open **Settings → Tooling**.
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
   - A small set of built-in tools is always loaded, `current_datetime` among
     them.

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
- A skill is a normal folder on disk. Edit `SKILL.md` in any editor. Kotys
  watches the skills folder, so a skill you add or remove shows up without a
  restart.
- You can put a skill in the chat manually with `/name` if the model does not
  pick it.

**Ideas to try:** a writing style guide, a deploy checklist, a "how I want
commit messages" skill, a data-cleanup script with instructions on when to
run it.

## Control what the agent can do

The permission ladder is in the chat composer (the mode selector). Three
levels:

| Mode          | What happens                                                                                                                                         |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ask**       | Asks before every tool call, reads included, except for the cases below.                                                                             |
| **copilot**   | The default. Asks before `write_file`, `apply_patch`, `capture_screen`, `control_screen` (macOS only), and any `bash` command that is not read-only. |
| **autopilot** | Never asks, for any tool. Only for fully trusted, repetitive tasks. One exception: `control_screen` without `app` still asks.                        |

Two things run without asking, whatever the mode:

- **Read-only shell commands.** `bash` classifies the command before it asks.
  If every segment only reads (`ls`, `cat`, `grep`, `git status`, `npm list`
  and similar), it runs with no dialog. The classifier fails closed: an
  unknown verb or flag, a command substitution, or a redirect that writes to
  a file all send the command to the dialog.
- **The memory and task tools that write.** `create_memory`, `update_memory`,
  `delete_memory`, `create_todo`, `update_todo`, `complete_todo`,
  `delete_todo` and `start_pomodoro` write to Kotys's own database and never
  raise a dialog, not even in **ask**. `search_memories` and `list_todos` are
  not on that list. In **ask** they ask like any other read.

When a tool asks for approval, you get a dialog with exactly what will run —
the command, the working directory, and a preview. The dialog can be answered
from any connected client (yes, your phone can approve things), and it
expires after 10 minutes: the tool is treated as denied, not left hanging.

Destructive commands are flagged in the dialog. `write_file` and
`apply_patch` check the path denylist before they ask, so a write to a
blocked path is refused without a dialog. The read tools work the other way
round: in **ask** mode `read_file`, `list` and `grep` go through approval
first and check the denylist when they run, so you can approve a read that
the tool then refuses.

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
- **Honest limits:** `bash` never consults the denylist. Only the file tools
  check it, so a shell command can read any file your user can read. On top
  of that, a command the read-only classifier accepts runs with no dialog,
  and `cat ~/.ssh/id_rsa` is one of those. The denylist keeps the file tools
  off those paths. It does nothing for the shell. If you need it to hold,
  switch `bash` off in **Settings → Tooling**. For the full threat model, see
  [SECURITY.md](../SECURITY.md).

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

## When a chat gets long

Kotys watches the size of the next request. When the conversation will not
fit, the older part of it is summarized before the message goes out. Each
turn also has budgets, so a long tool loop ends with an answer instead of an
error.

**The token badge.** Under the composer, at the right end of the row with the
model selector, there is a small ring with a percentage. On the phone the
same reading is a pie icon in the chat header. Hover it on desktop and web
for the numbers behind the percentage, for example `48.2k / 262k (18%)`. On
the phone, tap it: a **Context usage** sheet shows the same numbers as
`18% · 48.2k of 262k`. The ring is the accent color up to 75%, amber from
75%, and red from 90%.

The percentage is the projected size of your next request as a share of the
model's full context window. It is not a pure guess. It starts from the
prompt size the provider reported for the last turn, which covers the system
prompt, the tool schemas, and images, then adds an estimate of about four
characters per token for everything said since.

**Compaction runs on its own.** Before a message is sent, Kotys projects the
request. If the projection is over the usable window, the older part of the
chat is summarized first and the request is rebuilt around the summary. The
usable window is the full window less room for a reply: 20,000 tokens, or a
quarter of the window when that is smaller. A 262,144-token window is usable
to 242,144. A local Ollama model is capped at 32,768 tokens whatever it
advertises, because it reserves its whole KV cache in memory when it loads,
so it compacts at 24,576. If the summary cannot be written, the message is
sent anyway with the context as it stands.

**What the summary keeps.** The summary is a short Markdown document with
four sections, always in this order:

- **Topic** — what the conversation is about, in a sentence or two.
- **Important Details** — facts, constraints, preferences, decisions, and the
  reason for them.
- **Current State** — what has been discussed or resolved so far.
- **Open Threads** — unanswered questions, and what you still want.

Empty sections stay, marked `(none)`. Names, numbers, code identifiers and
URLs are copied exactly, and the summary is written in the language of the
chat. It is capped at 2,048 tokens, or a quarter of the window when that is
smaller, and written by the chat's own model at temperature 0 with a fixed
seed.

Automatic compaction does not touch the newest turns. It keeps the tail of
the conversation verbatim, up to 8,000 tokens of it (a quarter of the window
when that is smaller), and always the newest turn, even when that turn on its
own busts the budget. Everything older is folded into the summary, which then
travels in the system message under "Summary of the earlier conversation".
The chat records how far the summary reaches, so the turns it replaced are
not sent again. A later compaction updates that summary instead of starting
over: still-true details are kept, stale ones dropped, new ones merged in.

**Compact when you want to.** Hover the badge on desktop and web, or tap it
on the phone, then press **Compact now**. A manual compaction is forced: it
keeps nothing verbatim and folds every turn since the last summary in. On
desktop and web a **Context compacted** chip appears above the composer, and
clicking it shows the summary that was written. If nothing is left to fold
since the last summary, the chip reads
`Nothing to compact — conversation is short`. If the summary call fails, it
reads `Compaction failed — try again`.

**Budgets for one turn.** A turn can run many tool rounds. Three budgets keep
it from running forever:

| Budget           | Limit              | What it counts                   |
| ---------------- | ------------------ | -------------------------------- |
| Tool rounds      | 200                | Rounds that ended in a tool call |
| Tool output      | 200,000 characters | Everything the tools returned    |
| Context headroom | 8,000 tokens free  | The peak prompt size this turn   |

When one of them is hit, the tools are taken away and the model is asked for
one last text-only round: what it accomplished, what is still incomplete, and
what it would do next. The reason is named in that prompt, so the answer can
say which budget ran out. Kotys also warns the model before the last allowed
round, so the turn ends as a summary and not a cut-off. Your next message
carries on from there.

The context budget watches the prompt size the provider reports during the
turn, and it measures against the full window, not the compaction threshold.
It is the last guard before the provider would reject the request outright.

Old tool output does not pile up either. When the conversation is rebuilt for
the next request, only the most recent tool results are replayed to the
model, up to 6,000 tokens of them. The older ones drop out.

**The same call twice.** Within one reply, Kotys remembers which read tools
the model has called and with which arguments. If the same call comes back,
the tool does not run again: the model is told it already made that exact
call and should reuse the result. Key order in the arguments does not matter,
values do. Nine deterministic reads are covered: `read_file`, `list`, `grep`,
`web_fetch`, `web_search`, `search_memories`, `list_chats`, `search_chats`,
and `get_chat`. Writes and anything with a side effect are never
deduplicated. In **ask** mode a repeat is not put to you for approval,
because nothing is going to run.

## See what the agent did

Every answer that used tools carries a record of how it got there. You can
watch it while the turn runs, and read it back afterwards.

**The timeline.** Under an assistant message that called tools sits a thin
strip. Each tool call is one segment, colored by family: reads, writes,
shell, web, memory, tasks, chats, MCP. The stretches where the model was
generating get their own segments, marked with a sparkle: the thinking before
the first call, and each gap between calls. Segment width follows time, so
the strip is a picture of where the turn went. Model stretches are compressed
on purpose, so a long think does not swallow the rest.

While the turn runs, the strip grows and the numbers tick about twice a
second.

| Segment          | How it looks                                          |
| ---------------- | ----------------------------------------------------- |
| Running call     | Pulses, and keeps growing until the call returns.     |
| Finished call    | Solid. Its width is how long the call took.           |
| Failed call      | Red. The detail card says `failed` and shows why.     |
| Model generating | A muted segment with a sparkle icon. Not a tool call. |

**Inspecting one call.** Point at a segment and a card appears next to it. It
names the call in plain words, such as `Read …/kit.tsx` or
`Searched the web for "ollama tool calling"`. Under that come the MCP server
tag when the call came from a server, the arguments that were recorded
(server, query, url, file), the results the tool returned, the error text if
it failed, and the duration. Segments are buttons, so **Tab** reaches the
same card without a mouse.

**The line under the strip** counts the turn:
`12 tools · 1m 04s total · 8.3s in tools`. The total covers the whole turn,
model time included. "In tools" adds up the calls alone. The difference
between the two is the time the model spent generating.

**Long turns.** The strip holds 15 calls at a time. Past that it pages and
scrolls sideways, and the line adds `(showing last 15)`. It follows the
newest call on its own, unless you scroll back, and then it stays where you
put it. The mouse wheel scrolls it.

**Folding it away.** Once the turn is finished, the row above the strip
(`12 tools · 1m 04s`) collapses it, and a click brings it back. A collapsed
strip with earlier calls says `(+9 earlier)`. While the turn is still running
the strip stays open.

**On the phone.** The mobile app shows the same trace as a list, not a strip.
Tap `4 tools · 6.1s in tools` to expand it into one row per call, each with
an icon, the label, the server, the duration, and the error.

**Other cards in the chat.** The timeline is not the only thing a turn can
leave behind. On the phone you get the skill chip and the form card; the rest
of this list is desktop and web.

- **Task cards.** `create_todo`, `update_todo`, `complete_todo` and
  `delete_todo` each leave a card with the title, description, status,
  priority, due date, and reminder. It is a snapshot of the task at that
  moment, not a live view.
- **Skill chips.** A skill invocation collapses to one small chip with the
  skill name, instead of printing the whole instruction block.
- **Diagrams and small widgets.** An `svg` or `html` fenced block renders as a
  preview. A toolbar under it flips between the preview and the source, and
  copies the source. HTML runs inside a sandboxed frame.
- **Code blocks.** Hover a code block and a copy button appears in its corner.

**The form the agent can ask you to fill.** `request_user_input` is the tool
that asks you a question with a real form instead of a sentence. The form
takes the composer's place at the bottom of the chat, and the conversation
waits.

- Between 1 and 4 fields. A choice field is single-select with 2 to 6
  options. A text field is one line, or a box when the model asks for one.
- Fields are required unless the model marks them optional, and **Submit**
  stays disabled until the required ones are filled. **Enter** submits from a
  single-line field. A text box needs **Cmd/Ctrl+Enter**, so plain **Enter**
  still makes a newline.
- The model writes the button labels. They default to **Submit** and
  **Cancel**.
- The question goes to every connected client at once, so you can answer it
  from your phone. The first answer wins, and the form drops everywhere else.
- The form waits 15 minutes. After that the tool reports that you did not
  answer, and the turn carries on. **Cancel** does the same, immediately.
  Stopping the turn takes the form away.
- One question at a time. If the model asks a second one while the first is
  open, the second call fails with `another input request is pending` and
  shows up red in the timeline.

Answered or not, the form stays in the transcript as a card: every field with
what you chose, or `No answer` in its place.

**The analytics view.** On the desktop and web clients, click **Analytics**
at the bottom of the sidebar. The phone app does not have this view. The
welcome screen also carries a small strip with your chats, messages and
tokens, and clicking it opens the same view. A refresh button sits in the
header.

- **Four cards.** Messages (and how many are yours), output tokens, chats,
  tool calls (and how many distinct tools were used).
- **Activity.** One bar per day for the last 30 days. Switch the bars between
  **Messages** and **Tokens**, and point at a bar for that day's number. The
  message bars count both sides of the conversation.
- **Models.** Every model you have used, ranked by how many messages it
  wrote, with its provider, its output tokens, and whether it ran locally or
  in the cloud.
- **Built-in tools.** Ranked by number of calls, with the failure count in red
  and the average duration per call. Under the list, a line names the
  built-in tools that have never been called.
- **MCP tools.** The same rows, grouped by the server they came from.

**What the tokens count.** Every token number in this view is output only:
what the models generated, summed over your assistant messages. Nothing here
counts the tokens sent to the model, and there is no cost estimate.

**What the counts cover.** The numbers come from the messages in your local
database: every chat, all time. The activity chart is the only part with a
window. Delete a chat and its messages go with it, so the totals drop. The
tool rows are read back from the trace saved on each message, the same trace
the timeline draws.

## Find things you talked about before

Every chat is kept in a local database. You can search it yourself from the
sidebar, and the agent can search it too. `list_chats`, `search_chats`, and
`get_chat` are ordinary tools, so you can ask a question in plain language
and let the model go looking.

**How chats get their titles.** A new chat is called "New chat" until you
send the first message. Then Kotys asks the model for a name, and asks again
once the reply is finished so the title can use both sides of the exchange.
It asks for at most six words. If nothing usable comes back, the title is the
first 60 characters of your message. Rename a chat any time: hover the row in
the sidebar and click the pencil.

**How chats get their topics.** After the first reply, Kotys tags the chat
with one to three topics. Topics are short and lowercase, one or two words.
Before tagging, Kotys shows the model the topics you already use (the 40 most
common ones) and asks it to reuse one when it fits, so the tag list stays
small instead of growing forever. Each topic gets a colored dot in the
sidebar, and the same topic always gets the same color. Tagging runs on the
model the chat is using, and only while the chat still has no topics.

**Searching from the sidebar.** The box at the top of the sidebar searches
message text, not titles. Press **⌘F** (or **Ctrl+F**) to jump to it.

- The match is case-insensitive.
- Your query is split into words, up to five. Every word has to appear in the
  same message.
- Words match as substrings, so `deploy` also finds `deployment`.
- You get the 30 newest matches.

Each result shows the chat title and a snippet with your first word
highlighted. Click one and Kotys opens that chat, scrolls to that message,
and highlights it for a moment. The phone app has the same search box and
runs the same query.

**Pinning.** Hover a chat in the sidebar and click the pin to keep it in a
**Pinned** section above the Today, Yesterday, This Week, This Month, and
Earlier groups. Click the pin again to unpin. On the phone, press and hold a
chat row for **Pin**, **Rename**, and **Delete**. That menu is iOS only.

Pins are stored in the database as a setting, not in the client, so the same
chats are pinned on every client that connects to your daemon.

**Asking the agent instead.** Try:

- "What did we settle on for the database migration? Look through my old
  chats."
- "List my chats about react."
- "Find the chat where I worked out the nginx config and show me the config
  again."

What the model gets:

- `search_chats` takes a query and returns matching messages with the chat id,
  the chat title, the role, the time, and a snippet. It runs the same search
  as the sidebar box.
- `list_chats` returns your chats, most recently updated first, with title,
  topics, model, and last-updated time. It stops at 50 and says when it did.
  An optional `topic` argument keeps only chats whose topic contains that
  text.
- `get_chat` reads one chat by id and returns its title, model, topics,
  summary, and messages, newest first. It returns 50 messages by default and
  200 at most, with `offset` for paging through a long chat.

All three only read. In **copilot**, the default, they run without asking. In
**ask** you approve each call. Switch any of them off in
**Settings → Tooling**.

**Where the database lives.** One plain SQLite file:

- macOS: `~/Library/Application Support/Kotys/chat.db`
- Linux: `~/.local/share/kotys/chat.db` (or under `$XDG_DATA_HOME`)
- Windows: `%APPDATA%\Kotys\chat.db`

Set `KOTYS_DB_PATH` to put it somewhere else. Kotys creates the folder `0700`
and tightens an existing database file to `0600` when it opens it. It runs
the database in WAL mode, so `chat.db-wal` and `chat.db-shm` sit next to it.
Any SQLite client can open it.

To take a backup while the daemon is running, use `scripts/backup-db.sh`. It
snapshots the file with `VACUUM INTO`, which is safe on an open WAL database,
then compares the copy against the source size and deletes it if it looks
truncated. After that it runs `PRAGMA integrity_check` on the copy and stops
with an error if that fails, leaving the file for you to look at. Snapshots
go to `~/Library/Application Support/Kotys/backups/chat-<timestamp>.db`, and
the last 10 are kept. It reads `KOTYS_DB_PATH` if you set one. The script is
written for macOS: the backup folder and the `stat` flags are macOS ones.

## See also

- [SECURITY.md](../SECURITY.md) — the threat model, read before exposing the
  port
- [architecture.md](architecture.md) — how the monorepo fits together
- [CONTRIBUTING.md](../CONTRIBUTING.md) — how to build and test locally
