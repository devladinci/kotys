# Contributing

## Setup

```bash
bin/setup
bin/dev
```

`bin/dev` starts the whole stack — the desktop app spawns the API daemon
itself. Requires Node 22+, pnpm 10+, and Ollama running locally (or an
Ollama Cloud key).

## Before opening a PR

```bash
pnpm lint && pnpm typecheck && pnpm test
```

## Where code goes

Read `docs/architecture.md` first — the package boundaries are enforced by
lint, and a PR that puts a hook in `ui-web` or a component in `core` will fail
CI. The short version: logic in `core`, DOM in `ui-web`, types in `contracts`.

## Adding a tool

One file in `apps/api/src/tools/`, exporting `definition` and `execute`, then
one line in `tools/index.ts`. Anything touching the filesystem or shell must
request approval through `ctx.requestApproval`.
