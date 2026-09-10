# Architecture

Kotys is one API and three clients.

## Packages

| Package            | Contains                            | Imported by     |
| ------------------ | ----------------------------------- | --------------- |
| `@kotys/contracts` | types, zod schemas, constants       | everything      |
| `@kotys/client`    | typed RPC client, WebSocket client  | every UI target |
| `@kotys/core`      | hooks, stores — no DOM, no Electron | every UI target |
| `@kotys/db`        | SQLite schema, migrations, queries  | api only        |
| `@kotys/ui-tokens` | colors, spacing, type scale         | ui-web, mobile  |
| `@kotys/ui-web`    | React DOM components                | desktop, web    |

## Apps

| App              | What it is                                            |
| ---------------- | ----------------------------------------------------- |
| `@kotys/api`     | Hono daemon — the backend, runs standalone            |
| `@kotys/desktop` | Electron window that spawns or attaches to the daemon |
| `@kotys/web`     | Vite app against the same daemon                      |
| `@kotys/mobile`  | Expo app — a thin client over your network            |

## Rules

1. Nothing in `packages/` imports from `apps/`.
2. `@kotys/core` never imports `@kotys/ui-web` — it must stay importable by
   React Native.
3. `@kotys/contracts` depends on nothing but zod.

Enforced by `import/no-restricted-paths` in `eslint.config.js`.

## Why components aren't shared with mobile

They can't be — React DOM components don't render in React Native. What _is_
shared is everything else: types, API access, hooks, stores, and design tokens.
In the app this was ported from, all four stores and 10 of 13 hooks already had
zero DOM references, which is what makes the mobile client mostly a UI exercise.

## Security model

The API exposes `bash`, `write_file`, and `apply_patch`. It is therefore:

- bound to `127.0.0.1` by default,
- authenticated with a bearer token generated on first run,
- protected by an `Origin` allowlist (the DNS-rebinding defence — "localhost
  only" is not on its own a security property),
- unable to serve secret settings back over the wire.

For phone access, put it on a Tailscale address rather than opening a port.
