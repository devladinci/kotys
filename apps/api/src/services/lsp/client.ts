import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import type {
  LspDiagnostic,
  LspInitializeParams,
  LspInitializeResult,
  LspJsonRpcMessage,
  LspPublishDiagnosticsParams,
  LspServerCapabilities,
  LspTextDocumentItem,
} from "./protocol.js";

const CONTENT_LENGTH = "Content-Length: ";
const DEFAULT_TIMEOUT_MS = 5000;
export const DIAGNOSTICS_SETTLE_MS = 500;

type RequestHandler = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
};

type DiagnosticsWait = {
  uri: string;
  diagnostics: LspDiagnostic[];
  resolve: (value: LspDiagnostic[]) => void;
  deadline?: NodeJS.Timeout;
  settle?: NodeJS.Timeout;
};

function encodeMessage(msg: LspJsonRpcMessage): string {
  const body = JSON.stringify(msg);
  return `${CONTENT_LENGTH}${Buffer.byteLength(body, "utf-8")}\r\n\r\n${body}`;
}

function normalizeDiagnostics(diagnostics: LspDiagnostic[]): LspDiagnostic[] {
  return diagnostics.slice().sort((a, b) => {
    const sev = severityRank(a.severity, b.severity);
    if (sev !== 0) return sev;
    return a.message.localeCompare(b.message);
  });
}

function severityRank(a?: number, b?: number): number {
  const fallback = 4;
  return (a ?? fallback) - (b ?? fallback);
}

function hasStringMessage(value: unknown): value is { message?: string } {
  return typeof value === "object" && value !== null;
}

function isPublishDiagnosticsMessage(msg: LspJsonRpcMessage): msg is {
  jsonrpc: "2.0";
  method: "textDocument/publishDiagnostics";
  params: LspPublishDiagnosticsParams;
} {
  return (
    "method" in msg &&
    msg.method === "textDocument/publishDiagnostics" &&
    "params" in msg
  );
}

function asInitializeResult(value: unknown): LspInitializeResult {
  if (typeof value !== "object" || value === null) {
    throw new Error("initialize returned non-object");
  }
  const capabilities =
    (value as { capabilities?: LspServerCapabilities }).capabilities ?? {};
  return { capabilities };
}

export type LspClientState =
  "idle" | "initializing" | "ready" | "closed" | "error";

export class LspClient extends EventEmitter {
  private child: ChildProcess;
  private state: LspClientState = "idle";
  private pending = new Map<number | string, RequestHandler>();
  private buffer = "";
  private nextId = 1;
  private readonly rootUri: string;
  private capabilities: LspServerCapabilities = {};
  private diagnosticsWaits = new Set<DiagnosticsWait>();

  constructor(command: string, args: string[], rootUri: string) {
    super();
    this.rootUri = rootUri;
    this.child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });

    this.child.on("error", (err) => {
      this.state = "error";
      this.rejectAll(err);
      this.emit("error", err);
    });

    this.child.on("close", (code) => {
      this.state = "closed";
      this.rejectAll(new Error(`LSP server exited (${code ?? "unknown"})`));
      this.emit("close", code);
    });

    this.child.stdout?.setEncoding("utf-8");
    this.child.stdout?.on("data", (chunk: string) => this.onData(chunk));

    this.child.stderr?.on("data", (chunk: Buffer | string) => {
      const text = Buffer.isBuffer(chunk) ? chunk.toString("utf-8") : chunk;
      this.emit("stderr", text.trim());
    });
  }

  getState(): LspClientState {
    return this.state;
  }

  async initialize(): Promise<LspInitializeResult> {
    if (this.state !== "idle") {
      throw new Error(`LSP client not idle (${this.state})`);
    }
    this.state = "initializing";
    const params: LspInitializeParams = {
      processId: process.pid,
      rootUri: this.rootUri,
      capabilities: {
        textDocument: {
          diagnostic: { dynamicRegistration: false },
          publishDiagnostics: { relatedInformation: false },
        },
      },
    };
    const raw = await this.request("initialize", params, DEFAULT_TIMEOUT_MS);
    const result = asInitializeResult(raw);
    this.capabilities = result.capabilities;
    this.notify("initialized", {});
    this.state = "ready";
    this.emit("ready", result);
    return result;
  }

  async diagnostics(item: LspTextDocumentItem): Promise<LspDiagnostic[]> {
    if (this.state !== "ready") return [];
    this.notify("textDocument/didOpen", { textDocument: item });
    try {
      return normalizeDiagnostics(await this.collectDiagnostics(item.uri));
    } finally {
      this.notify("textDocument/didClose", { textDocument: { uri: item.uri } });
    }
  }

  shutdown(): void {
    if (this.state === "closed" || this.state === "error") return;
    try {
      this.notify("shutdown", {});
      this.notify("exit", {});
    } catch {
      // Child may already be gone.
    }
    this.child.stdin?.end();
    setTimeout(() => {
      if (!this.child.killed) this.child.kill("SIGTERM");
    }, 500);
    this.state = "closed";
  }

  private notify(method: string, params: unknown): void {
    if (this.state === "closed" || this.state === "error") return;
    const msg: LspJsonRpcMessage = { jsonrpc: "2.0", method, params };
    this.child.stdin?.write(encodeMessage(msg));
  }

  private request(
    method: string,
    params: unknown,
    timeoutMs: number,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (this.state === "closed" || this.state === "error") {
        reject(new Error("LSP client is closed"));
        return;
      }
      const id = this.nextId++;
      const msg: LspJsonRpcMessage = { jsonrpc: "2.0", id, method, params };
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`LSP request ${method} timed out`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (reason) => {
          clearTimeout(timer);
          reject(reason);
        },
      });
      this.child.stdin?.write(encodeMessage(msg));
    });
  }

  private async collectDiagnostics(uri: string): Promise<LspDiagnostic[]> {
    if (this.capabilities.diagnosticProvider) {
      try {
        const raw = await this.request(
          "textDocument/diagnostic",
          { textDocument: { uri } },
          DEFAULT_TIMEOUT_MS,
        );
        return extractDiagnosticItems(raw);
      } catch {
        // Fall through to the publishDiagnostics wait path.
      }
    }
    return this.waitForPublishedDiagnostics(uri);
  }

  private waitForPublishedDiagnostics(uri: string): Promise<LspDiagnostic[]> {
    return new Promise((resolve) => {
      const wait: DiagnosticsWait = { uri, diagnostics: [], resolve };
      wait.deadline = setTimeout(
        () => this.finishDiagnosticsWait(wait),
        DEFAULT_TIMEOUT_MS,
      );
      this.diagnosticsWaits.add(wait);
    });
  }

  private finishDiagnosticsWait(wait: DiagnosticsWait): void {
    clearTimeout(wait.deadline);
    clearTimeout(wait.settle);
    this.diagnosticsWaits.delete(wait);
    wait.resolve(wait.diagnostics);
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    for (;;) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) return;
      const header = this.buffer.slice(0, headerEnd);
      const lengthMatch = header.match(/Content-Length:\s*(\d+)/i);
      if (!lengthMatch) {
        this.buffer = this.buffer.slice(headerEnd + 4);
        continue;
      }
      const length = Number(lengthMatch[1]);
      const messageStart = headerEnd + 4;
      if (this.buffer.length < messageStart + length) return;
      const body = this.buffer.slice(messageStart, messageStart + length);
      this.buffer = this.buffer.slice(messageStart + length);
      this.handleMessage(body);
    }
  }

  private handleMessage(body: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      return;
    }
    const msg = asLspMessage(parsed);

    if ("id" in msg && msg.id !== undefined) {
      if ("result" in msg || "error" in msg) {
        const handler = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if ("error" in msg && msg.error !== undefined) {
          const text =
            typeof msg.error === "string"
              ? msg.error
              : hasStringMessage(msg.error)
                ? (msg.error.message ?? JSON.stringify(msg.error))
                : JSON.stringify(msg.error);
          this.state = "idle";
          handler?.reject(new Error(text));
        } else {
          handler?.resolve("result" in msg ? msg.result : undefined);
        }
      }
      return;
    }

    if (isPublishDiagnosticsMessage(msg)) {
      for (const wait of this.diagnosticsWaits) {
        if (wait.uri !== msg.params.uri) continue;
        wait.diagnostics = msg.params.diagnostics ?? [];
        clearTimeout(wait.settle);
        wait.settle = setTimeout(
          () => this.finishDiagnosticsWait(wait),
          DIAGNOSTICS_SETTLE_MS,
        );
      }
    }
  }

  private rejectAll(reason: Error): void {
    for (const handler of this.pending.values()) {
      handler.reject(reason);
    }
    this.pending.clear();
    for (const wait of this.diagnosticsWaits) {
      this.finishDiagnosticsWait(wait);
    }
  }
}

function extractDiagnosticItems(value: unknown): LspDiagnostic[] {
  if (typeof value !== "object" || value === null) return [];
  const parsed = value as { items?: unknown };
  if (!Array.isArray(parsed.items)) return [];
  return parsed.items.filter(isDiagnostic);
}

function isDiagnostic(value: unknown): value is LspDiagnostic {
  if (typeof value !== "object" || value === null) return false;
  const d = value as { message?: unknown; range?: unknown };
  return typeof d.message === "string" && isRange(d.range);
}

function isRange(value: unknown): value is { start: unknown; end: unknown } {
  if (typeof value !== "object" || value === null) return false;
  const r = value as { start?: unknown; end?: unknown };
  return isPosition(r.start) && isPosition(r.end);
}

function isPosition(
  value: unknown,
): value is { line: number; character: number } {
  if (typeof value !== "object" || value === null) return false;
  const p = value as { line?: unknown; character?: unknown };
  return typeof p.line === "number" && typeof p.character === "number";
}

function asLspMessage(value: unknown): LspJsonRpcMessage {
  if (typeof value !== "object" || value === null) return { jsonrpc: "2.0" };
  const msg = value as {
    jsonrpc?: unknown;
    id?: unknown;
    method?: unknown;
    params?: unknown;
    result?: unknown;
    error?: unknown;
  };
  if (msg.jsonrpc !== "2.0") return { jsonrpc: "2.0" };
  const id =
    typeof msg.id === "number" || typeof msg.id === "string"
      ? msg.id
      : undefined;
  if (id !== undefined) {
    return { jsonrpc: "2.0", id, result: msg.result, error: msg.error };
  }
  if (typeof msg.method === "string") {
    return { jsonrpc: "2.0", method: msg.method, params: msg.params };
  }
  return { jsonrpc: "2.0" };
}
