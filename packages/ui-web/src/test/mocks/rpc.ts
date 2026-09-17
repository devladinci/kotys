import { vi, type Mock } from "vitest";

/**
 * vi.fn() that resolves by default. The stores fire-and-forget writes with
 * `.catch(...)` — a bare vi.fn() returns undefined and the `.catch` would
 * throw synchronously, so every RPC mock must return a Promise.
 */
const fn = (resolves: unknown = null): Mock => vi.fn(async () => resolves);

/**
 * The full RPC surface the components and stores touch, as vi.fn()s arranged
 * in the same shape as the real RouterClient<AppRouter>. Tests import
 * `rpcMock` and set per-test behaviour with mockResolvedValue.
 */
export const rpcMock = {
  chats: {
    list: fn([]),
    listWithTopics: fn([]),
    create: fn(1),
    rename: fn(null),
    remove: fn(null),
    setTopics: fn(null),
    getTopics: fn([]),
    setSummary: fn(null),
    setModel: fn(null),
    search: fn([]),
  },
  messages: {
    list: fn([]),
    insert: fn(null),
    update: fn(null),
  },
  memories: {
    list: fn([]),
    update: fn(null),
    remove: fn(null),
    search: fn([]),
    forChat: fn([]),
  },
  todos: {
    list: fn([]),
    create: fn(1),
    update: fn(null),
    remove: fn(null),
    toggle: fn(null),
    reorder: fn({ ok: true }),
    chatAbout: fn({ chat_id: 9, prompt: "Let's work on this todo:" }),
  },
  pomodoro: {
    active: fn(null),
    sessions: fn([]),
    start: fn(null),
    pause: fn(null),
    resume: fn(null),
    stop: fn(null),
    skipBreak: fn(null),
  },
  settings: {
    get: fn({ key: "", value: null }),
    set: fn({ key: "", value: "" }),
  },
  tools: {
    list: fn([]),
  },
  skills: {
    list: fn([]),
    get: fn(null),
    create: fn({ ok: true }),
    update: fn({ ok: true }),
    remove: fn({ ok: true }),
    setEnabled: fn({ ok: true }),
  },
  mcp: {
    servers: fn([]),
    reconnect: fn([]),
  },
} as const;

export const rpc = rpcMock as unknown as Record<string, Record<string, Mock>>;

/** Call in beforeEach after vi.clearAllMocks() to reset the singletons. */
export async function initTestClients(): Promise<void> {
  // vi.mock replaces createRpcClient with () => rpcMock, so this wires both
  // getRpc() and the provider context to the mock.
  const { setClients } = await import("@kotys/core");
  setClients({ baseUrl: "http://test", token: "test-token" });
}
