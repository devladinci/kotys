import path from "node:path";
import { promises as fs } from "node:fs";
import { LspClient } from "./client.js";
import {
  detectLspServer,
  languageIdFor,
  resolveCommandPath,
} from "./detect.js";
import type { LspServerConfig } from "./detect.js";
import type { LspDiagnostic, LspTextDocumentItem } from "./protocol.js";

const DIAGNOSTICS_TIMEOUT_MS = 8000;

export type LspDiagnosticsResult = {
  diagnostics: LspDiagnostic[];
  formatted: string;
};

export type LspManager = {
  getDiagnostics(filePath: string): Promise<LspDiagnosticsResult | null>;
  close(): void;
};

export function createLspManager(): LspManager {
  const clients = new Map<string, LspClient>();
  const configs = new Map<string, LspServerConfig>();
  const initPromises = new Map<string, Promise<LspClient | null>>();

  const resolveConfig = async (
    filePath: string,
  ): Promise<LspServerConfig | null> => {
    const detected = await detectLspServer(filePath);
    if (!detected) return null;

    const cached = configs.get(detected.rootUri);
    if (cached) return cached;

    const commandPath = await resolveCommandPath(detected);
    if (!commandPath) return null;

    const full = { ...detected, commandPath };
    configs.set(detected.rootUri, full);
    return full;
  };

  const resolveClient = async (
    config: LspServerConfig,
  ): Promise<LspClient | null> => {
    const key = config.rootUri;
    const existing = clients.get(key);
    if (existing) return existing;

    const inFlight = initPromises.get(key);
    if (inFlight) return inFlight;

    const promise = (async (): Promise<LspClient | null> => {
      const client = new LspClient(
        config.commandPath,
        config.args,
        config.rootUri,
      );
      try {
        await withTimeout(client.initialize(), DIAGNOSTICS_TIMEOUT_MS);
        clients.set(key, client);
        return client;
      } catch {
        client.shutdown();
        return null;
      }
    })();

    initPromises.set(key, promise);
    return promise;
  };

  const getDiagnostics = async (
    filePath: string,
  ): Promise<LspDiagnosticsResult | null> => {
    const config = await resolveConfig(filePath);
    if (!config) return null;
    const languageId = languageIdFor(filePath, config);
    if (!languageId) return null;
    const client = await resolveClient(config);
    if (!client) return null;

    const text = await fs.readFile(filePath, "utf-8");
    const item: LspTextDocumentItem = {
      uri: `file://${filePath}`,
      languageId,
      version: 1,
      text,
    };

    const diagnostics = await withTimeout(
      client.diagnostics(item),
      DIAGNOSTICS_TIMEOUT_MS,
    );

    if (diagnostics.length === 0) return null;

    return {
      diagnostics,
      formatted: formatDiagnostics(filePath, diagnostics),
    };
  };

  const close = (): void => {
    for (const client of clients.values()) {
      client.shutdown();
    }
    clients.clear();
  };

  return { getDiagnostics, close };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("LSP timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (reason) => {
        clearTimeout(timer);
        reject(reason);
      },
    );
  });
}

function formatDiagnostics(
  filePath: string,
  diagnostics: LspDiagnostic[],
): string {
  const lines = [
    `LSP diagnostics for ${path.basename(filePath)} (${diagnostics.length} issue${diagnostics.length === 1 ? "" : "s"}):`,
  ];
  for (const d of diagnostics) {
    const location = `${d.range.start.line + 1}:${d.range.start.character + 1}`;
    const severity = diagnosticLabel(d.severity);
    const code = d.code !== undefined ? ` [${d.code}]` : "";
    lines.push(`- ${location} ${severity}${code}: ${d.message}`);
  }
  return lines.join("\n");
}

function diagnosticLabel(severity?: number): string {
  if (severity === 1) return "Error";
  if (severity === 2) return "Warning";
  if (severity === 3) return "Info";
  if (severity === 4) return "Hint";
  return "Diagnostic";
}
