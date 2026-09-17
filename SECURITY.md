# Security Policy

Kotys runs a local agent that can execute shell commands, read and write
files, and make network requests on your machine. This document describes
what protects you, and — just as important — what does not.

## The trust model in one paragraph

Kotys runs entirely on your machine, under your user account, with your
privileges. There is no cloud component: chat data lives in a local SQLite
database, and model traffic goes to Ollama (local or cloud, your choice).
The agent is **not sandboxed**. The safeguards described below are
guardrails against accidents and common attack vectors, not a security
boundary. If you would not hand a stranger a terminal on your machine,
treat every prompt you paste into the chat with the same care.

## What the agent can do

- Execute shell commands (`bash`), including anything your user can do.
- Read and write files (`read_file`, `write_file`, `apply_patch`).
- Fetch web pages and search the web (`web_fetch`, `web_search`).
- Capture the screen (`capture_screen`) if granted macOS permissions.
- Click or type on screen apps (`control_screen`) if granted Accessibility permissions. Window-scoped only, unless approved.

## Guardrails

### Tool-level path denylist

File tools and shell commands refuse a denylist of sensitive paths,
compared case-insensitively against real-resolved paths:

- System locations: `/etc`, `/usr`, `/bin`, `/sbin`, `/var`, `/System`,
  `/Library`, `/private/etc`, `/private/var`, `/boot`, `/dev`, `/proc`,
  `/sys`.
- In the home directory: `.ssh`, `.aws`, `.gnupg`, `.docker`, `.kube`,
  git/npm/netrc credentials, shell rc files, `.env`, the macOS keychain,
  and Kotys' own database directory.

This protects against the common accidents (deleting system files, dumping
`~/.ssh/id_rsa` into a chat). It is **not** a sandbox: the agent can still
read any file you can read, and a shell command can reach the network.

### Network surface

- The desktop app's daemon binds to `0.0.0.0` (all interfaces) by default so
  a paired phone works from any network; `KOTYS_HOST` narrows the bind (e.g.
  `127.0.0.1`, a Tailscale IP). The bind address is not the security
  boundary — the token below is.
- Every RPC call requires a bearer token: 32 random bytes, generated on
  first run, persisted in a `0600` file beside the database, compared with
  a timing-safe comparison.
- HTTP requests must pass an Origin check: the configured allowlist
  (`KOTYS_ALLOWED_ORIGINS`, which includes the desktop app's `app://kotys`)
  plus loopback origins (`localhost`/`127.0.0.1`/`::1`, any port). On a
  wildcard bind, http(s) origins are additionally accepted only when their
  host is **one of this machine's own addresses** (LAN, Tailscale, IPv6, via
  `os.networkInterfaces()`) or **one of its own names** (hostname, mDNS
  `.local`, MagicDNS name, Expo dev tunnels `*.exp.direct`). Other devices
  on the same network — a café captive portal, a neighboring laptop, another
  tailnet node, a Tailscale Funnel page on `*.ts.net` — are rejected. The
  same function answers for the CORS middleware and the request guard, so
  they cannot drift. This is a DNS-rebinding defense: a rebound page
  presents its own (attacker) hostname as Origin, which matches neither the
  allowlist nor the machine's own addresses, and CORS preflights fail.
  Browser access from a host that is not this machine requires adding that
  origin to `KOTYS_ALLOWED_ORIGINS` explicitly.
- WebSockets authenticate via the same token passed as a query parameter.
  Browsers cannot set custom headers on WebSocket connections, which is
  why the query string is used; the Origin check still applies to the
  handshake.

## Known limits (read this part)

- A shell command is a shell command. The denylist checks paths, but the
  agent can run `curl`, `git`, or any other program, and can read any
  file not on the denylist. Anything you paste into the chat — logs,
  stack traces, web page content fetched by tools — is model input and
  can influence what the agent does (prompt injection). The guardrails
  reduce blast radius; they do not eliminate it.
- Loopback binding means "other machines cannot connect directly." It
  does not protect against other local processes or a browser with a
  matching Origin — hence the token.
- If you expose the API beyond loopback (custom `KOTYS_HOST`), you leave
  the tested configuration entirely. Do not do this on an untrusted
  network.

## Reporting a vulnerability

Please do not open a public issue for security problems. Use GitHub's
private security advisory feature, or email the maintainer directly
(see the repository profile). Include a description, reproduction steps,
and affected commit if known.
