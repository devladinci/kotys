import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { DIAGNOSTICS_SETTLE_MS, LspClient } from "./client.js";
import type { LspDiagnostic, LspServerCapabilities } from "./protocol.js";

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

function lastSent(): unknown {
  return JSON.parse(lastWrite().split("\r\n\r\n")[1]);
}

const URI = "file:///repo/index.ts";

const ITEM = {
  uri: URI,
  languageId: "typescript",
  version: 1,
  text: "const x: number = 'oops';\n",
};

const TYPE_ERROR = "Type 'string' is not assignable to type 'number'.";

function diagnostic(
  message: string,
  severity?: LspDiagnostic["severity"],
): LspDiagnostic {
  return {
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
    severity,
    message,
  };
}

function publish(uri: string, diagnostics: LspDiagnostic[]): void {
  fake._emit(
    "data",
    encodeMessage({
      jsonrpc: "2.0",
      method: "textDocument/publishDiagnostics",
      params: { uri, diagnostics },
    }),
  );
}

async function startClient(
  capabilities: LspServerCapabilities = {},
): Promise<LspClient> {
  const client = new LspClient(
    "typescript-language-server",
    ["--stdio"],
    "file:///repo",
  );
  const initPromise = client.initialize();
  fake._emit(
    "data",
    encodeMessage({ jsonrpc: "2.0", id: 1, result: { capabilities } }),
  );
  await initPromise;
  return client;
}

function messages(diagnostics: LspDiagnostic[]): string[] {
  return diagnostics.map((d) => d.message);
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

  it("rejects without throwing when the server fails to start", async () => {
    const client = new LspClient(
      "typescript-language-server",
      ["--stdio"],
      "file:///repo",
    );
    const promise = client.initialize();

    expect(() => fake._emit("error", new Error("spawn EACCES"))).not.toThrow();

    await expect(promise).rejects.toThrow(/EACCES/);
    expect(client.getState()).toBe("error");
  });
});

describe("LspClient diagnostics", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("pulls diagnostics via textDocument/diagnostic when supported", async () => {
    const client = await startClient({ diagnosticProvider: true });

    const diagPromise = client.diagnostics(ITEM);
    expect(lastWrite()).toContain('"method":"textDocument/diagnostic"');
    fake._emit(
      "data",
      encodeMessage({
        jsonrpc: "2.0",
        id: 2,
        result: { items: [diagnostic("err")] },
      }),
    );

    expect(messages(await diagPromise)).toEqual(["err"]);
  });

  it("keeps pulling diagnostics after a failed pull", async () => {
    const client = await startClient({ diagnosticProvider: true });
    const first = client.diagnostics(ITEM);
    fake._emit(
      "data",
      encodeMessage({
        jsonrpc: "2.0",
        id: 2,
        error: { code: -32603, message: "busy" },
      }),
    );
    await vi.runAllTimersAsync();
    await first;

    const second = client.diagnostics(ITEM);
    expect(lastWrite()).toContain('"method":"textDocument/diagnostic"');
    fake._emit(
      "data",
      encodeMessage({
        jsonrpc: "2.0",
        id: 3,
        result: { items: [diagnostic(TYPE_ERROR, 1)] },
      }),
    );

    expect(messages(await second)).toEqual([TYPE_ERROR]);
  });

  it("falls back to publishDiagnostics when pull diagnostics are unsupported", async () => {
    const client = await startClient();

    const diagPromise = client.diagnostics(ITEM);
    publish(URI, [diagnostic("warn")]);
    await vi.advanceTimersByTimeAsync(DIAGNOSTICS_SETTLE_MS);

    expect(messages(await diagPromise)).toEqual(["warn"]);
  });

  it("keeps listening after an empty publish for the diagnostics that follow", async () => {
    const client = await startClient();
    let isAnswered = false;

    const diagPromise = client.diagnostics(ITEM).then((diagnostics) => {
      isAnswered = true;
      return diagnostics;
    });
    publish(URI, []);
    await vi.advanceTimersByTimeAsync(DIAGNOSTICS_SETTLE_MS - 1);
    expect(isAnswered).toBe(false);
    publish(URI, [diagnostic(TYPE_ERROR, 1)]);
    await vi.advanceTimersByTimeAsync(DIAGNOSTICS_SETTLE_MS);

    expect(messages(await diagPromise)).toEqual([TYPE_ERROR]);
  });

  it("does not answer a new check with an earlier check's diagnostics", async () => {
    const client = await startClient();
    const first = client.diagnostics(ITEM);
    publish(URI, [diagnostic(TYPE_ERROR, 1)]);
    await vi.advanceTimersByTimeAsync(DIAGNOSTICS_SETTLE_MS);
    await first;
    let isAnswered = false;

    const second = client
      .diagnostics({ ...ITEM, text: "const x: number = 1;\n" })
      .then((diagnostics) => {
        isAnswered = true;
        return diagnostics;
      });
    await vi.advanceTimersByTimeAsync(DIAGNOSTICS_SETTLE_MS);
    expect(isAnswered).toBe(false);
    publish(URI, []);
    await vi.advanceTimersByTimeAsync(DIAGNOSTICS_SETTLE_MS);

    expect(await second).toEqual([]);
  });

  it("ignores diagnostics published for other files", async () => {
    const client = await startClient();

    const diagPromise = client.diagnostics(ITEM);
    publish("file:///repo/tsconfig.json", [diagnostic("elsewhere")]);
    publish(URI, [diagnostic("here")]);
    await vi.advanceTimersByTimeAsync(DIAGNOSTICS_SETTLE_MS);

    expect(messages(await diagPromise)).toEqual(["here"]);
  });

  it("answers with no diagnostics when the server never publishes", async () => {
    const client = await startClient();

    const diagPromise = client.diagnostics(ITEM);
    await vi.runAllTimersAsync();

    expect(await diagPromise).toEqual([]);
  });

  it("answers with the last publish when the server exits mid-check", async () => {
    const client = await startClient();

    const diagPromise = client.diagnostics(ITEM);
    publish(URI, [diagnostic(TYPE_ERROR, 1)]);
    fake._emit("close", 1);

    expect(messages(await diagPromise)).toEqual([TYPE_ERROR]);
  });

  it("opens the document for the check and closes it afterwards", async () => {
    const client = await startClient();

    const diagPromise = client.diagnostics(ITEM);
    expect(lastSent()).toEqual({
      jsonrpc: "2.0",
      method: "textDocument/didOpen",
      params: { textDocument: ITEM },
    });
    publish(URI, []);
    await vi.advanceTimersByTimeAsync(DIAGNOSTICS_SETTLE_MS);
    await diagPromise;

    expect(lastSent()).toEqual({
      jsonrpc: "2.0",
      method: "textDocument/didClose",
      params: { textDocument: { uri: URI } },
    });
  });

  it("orders diagnostics by severity then message", async () => {
    const client = await startClient({ diagnosticProvider: true });

    const diagPromise = client.diagnostics(ITEM);
    fake._emit(
      "data",
      encodeMessage({
        jsonrpc: "2.0",
        id: 2,
        result: {
          items: [diagnostic("b", 2), diagnostic("a", 1), diagnostic("c", 1)],
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
    const client = await startClient();

    client.shutdown();
    expect(lastWrite()).toContain('"method":"exit"');
    expect(fake.stdin.end).toHaveBeenCalled();
  });
});
