/**
 * Public surface of the API package. Only *types* are re-exported here — the
 * client package imports these with `import type`, so no server code (hono,
 * better-sqlite3, ollama) ever reaches a client bundle.
 */
export type { AppRouter } from "./router/index.js";
export type { ClientMessage, ServerMessage } from "./ws/protocol.js";
