import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { LspClient } from "./client.js";

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    spawn: vi.fn(),
  };
});

type EmitFn = (event: string, ...args: unknown[]) => void;

type FakeChild = {
  stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
  stdout: {
    setEncoding: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
  };
  stderr: { on: ReturnType<typeof vi.fn> };
  on: ReturnType<typeof vi.fn>;
  kill: ReturnType<typeof vi.fn>;
  killed: boolean;
  _emit: EmitFn;
};

function makeFakeChild(): FakeChild {
  const handlers = new Map<string, ((...args: unknown[]) => void)[]>();
  const fake: FakeChild = {
    stdin: { write: vi.fn(), end: vi.fn() },
    stdout: {
      setEncoding: vi.fn(),
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        handlers.set(event, [...(handlers.get(event) ?? []), cb]);
        return fake.stdout;
      }),
    },
    stderr: {
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        handlers.set(event, [...(handlers.get(event) ?? []), cb]);
        return fake.stderr;
      }),
    },
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      handlers.set(event, [...(handlers.get(event) ?? []), cb]);
      return fake;
    }),
    kill: vi.fn(),
    killed: false,
    _emit: (event, ...args) => {
      for (const cb of handlers.get(event) ?? []) {
        cb(...args);
      }
    },
  };
  return fake;
}

let fake: FakeChild;

beforeEach(() => {
  fake = makeFakeChild();
  vi.mocked(spawn).mockReturnValue(fake as unknown as ChildProcess);
});

afterEach(() => {
  vi.clearAllMocks();
});

function encodeMessage(msg: object): string {
  const body = JSON.stringify(msg);
  return `Content-Length: ${Buffer.byteLength(body, "utf-8")}\r\n\r\n${body}`;
}

function lastWrite(): string {
  const call = fake.stdin.write.mock.calls.at(-1);
  if (!call) return "";
  return String(call[0]);
}

describe("LspClient initialize", () => {
  it("sends initialize and resolves when the server responds", async () => {
    const client = new LspClient(
      "typescript-language-server",
      ["--stdio"],
      "file:///repo",
    );
    const promise = client.initialize();

    const written = lastWrite();
    expect(written).toContain('"method":"initialize"');
    expect(written).toContain('"rootUri":"file:///repo"');

    fake._emit(
      "data",
      encodeMessage({ jsonrpc: "2.0", id: 1, result: { capabilities: {} } }),
    );

    const result = await promise;
    expect(result.capabilities).toEqual({});
    expect(client.getState()).toBe("ready");
  });

  it("rejects on server error during initialize", async () => {
    const client = new LspClient(
      "typescript-language-server",
      ["--stdio"],
      "file:///repo",
    );
    const promise = client.initialize();

    fake._emit(
      "data",
      encodeMessage({
        jsonrpc: "2.0",
        id: 1,
        error: { message: "Server not initialized" },
      }),
    );

    await expect(promise).rejects.toThrow(/Server not initialized/);
    expect(client.getState()).toBe("idle");
  });

  it("rejects all pending when the child exits", async () => {
    const client = new LspClient(
      "typescript-language-server",
      ["--stdio"],
      "file:///repo",
    );
    const promise = client.initialize();
    fake._emit("close", 1);

    await expect(promise).rejects.toThrow(/exited/);
    expect(client.getState()).toBe("closed");
  });
});

describe("LspClient diagnostics", () => {
  it("pulls diagnostics via textDocument/diagnostic when supported", async () => {
    const client = new LspClient(
      "typescript-language-server",
      ["--stdio"],
      "file:///repo",
    );
    const initPromise = client.initialize();
    fake._emit(
      "data",
      encodeMessage({
        jsonrpc: "2.0",
        id: 1,
        result: { capabilities: { diagnosticProvider: true } },
      }),
    );
    await initPromise;

    const diagPromise = client.diagnostics("/repo/index.ts");
    expect(lastWrite()).toContain('"method":"textDocument/diagnostic"');

    fake._emit(
      "data",
      encodeMessage({
        jsonrpc: "2.0",
        id: 2,
        result: {
          items: [
            {
              range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 1 },
              },
              message: "err",
            },
          ],
        },
      }),
    );

    const diagnostics = await diagPromise;
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toBe("err");
  });

  it("falls back to publishDiagnostics when pull diagnostics are unsupported", async () => {
    const client = new LspClient(
      "typescript-language-server",
      ["--stdio"],
      "file:///repo",
    );
    const initPromise = client.initialize();
    fake._emit(
      "data",
      encodeMessage({ jsonrpc: "2.0", id: 1, result: { capabilities: {} } }),
    );
    await initPromise;

    const diagPromise = client.diagnostics("/repo/index.ts");
    fake._emit(
      "data",
      encodeMessage({
        jsonrpc: "2.0",
        method: "textDocument/publishDiagnostics",
        params: {
          uri: "file:///repo/index.ts",
          diagnostics: [
            {
              range: {
                start: { line: 1, character: 0 },
                end: { line: 1, character: 1 },
              },
              message: "warn",
            },
          ],
        },
      }),
    );

    const diagnostics = await diagPromise;
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toBe("warn");
  });

  it("orders diagnostics by severity then message", async () => {
    const client = new LspClient(
      "typescript-language-server",
      ["--stdio"],
      "file:///repo",
    );
    const initPromise = client.initialize();
    fake._emit(
      "data",
      encodeMessage({
        jsonrpc: "2.0",
        id: 1,
        result: { capabilities: { diagnosticProvider: true } },
      }),
    );
    await initPromise;

    const diagPromise = client.diagnostics("/repo/index.ts");
    fake._emit(
      "data",
      encodeMessage({
        jsonrpc: "2.0",
        id: 2,
        result: {
          items: [
            {
              range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 1 },
              },
              severity: 2,
              message: "b",
            },
            {
              range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 1 },
              },
              severity: 1,
              message: "a",
            },
            {
              range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 1 },
              },
              severity: 1,
              message: "c",
            },
          ],
        },
      }),
    );

    const diagnostics = await diagPromise;
    expect(diagnostics.map((d) => `${d.severity}:${d.message}`)).toEqual([
      "1:a",
      "1:c",
      "2:b",
    ]);
  });
});

describe("LspClient shutdown", () => {
  it("sends shutdown/exit and terminates the child", async () => {
    const client = new LspClient(
      "typescript-language-server",
      ["--stdio"],
      "file:///repo",
    );
    const initPromise = client.initialize();
    fake._emit(
      "data",
      encodeMessage({ jsonrpc: "2.0", id: 1, result: { capabilities: {} } }),
    );
    await initPromise;

    client.shutdown();
    expect(lastWrite()).toContain('"method":"exit"');
    expect(fake.stdin.end).toHaveBeenCalled();
  });
});
