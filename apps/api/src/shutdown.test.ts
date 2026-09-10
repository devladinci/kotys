import { createServer, type Server } from "node:http";
import {
  afterAll,
  afterEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import {
  installShutdownHandlers,
  registerHttpServer,
  resetShutdownStateForTests,
} from "./shutdown.js";

// The db package is the real built workspace package; mock it so the test can
// observe closeDatabase without touching an actual database.
vi.mock("@kotys/db", () => ({
  closeDatabase: vi.fn(),
}));

type ExitSpy = MockInstance<typeof process.exit>;

let exitSpy: ExitSpy | null = null;

async function listenOnRandomPort(): Promise<Server> {
  const server = createServer((_req, res) => {
    res.writeHead(200).end("ok");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server;
}

const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
  resetShutdownStateForTests();
});

afterAll(() => {
  exitSpy?.mockRestore();
});

async function withFakeExit<T>(fn: () => Promise<T>): Promise<ExitSpy> {
  const spy = vi
    .spyOn(process, "exit")
    .mockImplementation((() => undefined) as never);
  exitSpy = spy;
  try {
    await fn();
  } finally {
    // give the handler's async teardown a beat to call exit
    await new Promise((r) => setTimeout(r, 50));
  }
  return spy;
}

describe("shutdown handlers", () => {
  it("SIGINT closes the HTTP server and exits 0", async () => {
    const server = await listenOnRandomPort();
    registerHttpServer(server);
    const remove = installShutdownHandlers();
    cleanups.push(() => {
      remove();
      server.close();
    });

    const spy = await withFakeExit(async () => {
      process.emit("SIGINT");
      await new Promise((r) => setTimeout(r, 200));
    });

    expect(server.listening).toBe(false);
    expect(spy).toHaveBeenCalledWith(0);
  });

  it("SIGTERM also shuts down cleanly", async () => {
    const server = await listenOnRandomPort();
    registerHttpServer(server);
    const remove = installShutdownHandlers();
    cleanups.push(() => {
      remove();
      server.close();
    });

    const spy = await withFakeExit(async () => {
      process.emit("SIGTERM");
      await new Promise((r) => setTimeout(r, 200));
    });

    expect(server.listening).toBe(false);
    expect(spy).toHaveBeenCalledWith(0);
  });

  it("a second signal does not re-enter teardown", async () => {
    const remove = installShutdownHandlers();
    cleanups.push(remove);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    cleanups.push(() => logSpy.mockRestore());

    const spy = await withFakeExit(async () => {
      process.emit("SIGINT");
      process.emit("SIGINT");
      process.emit("SIGTERM");
      await new Promise((r) => setTimeout(r, 200));
    });

    const shutdownLogs = logSpy.mock.calls.filter((c) =>
      String(c[0]).includes("shutting down"),
    );
    expect(shutdownLogs).toHaveLength(1);
    expect(spy).toHaveBeenCalledWith(0);
  });

  it("closeDatabase is invoked during teardown", async () => {
    const dbMod = await import("@kotys/db");
    const remove = installShutdownHandlers();
    cleanups.push(remove);

    await withFakeExit(async () => {
      process.emit("SIGTERM");
      await new Promise((r) => setTimeout(r, 200));
    });

    expect(dbMod.closeDatabase).toHaveBeenCalled();
  });
});
