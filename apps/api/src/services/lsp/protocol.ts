type LspPosition = {
  line: number;
  character: number;
};

type LspRange = {
  start: LspPosition;
  end: LspPosition;
};

export type LspDiagnostic = {
  range: LspRange;
  severity?: 1 | 2 | 3 | 4;
  code?: string | number;
  source?: string;
  message: string;
};

export type LspTextDocumentItem = {
  uri: string;
  languageId: string;
  version: number;
  text: string;
};

type LspClientCapabilities = {
  textDocument?: {
    diagnostic?: {
      dynamicRegistration?: boolean;
    };
    publishDiagnostics?: {
      relatedInformation?: boolean;
    };
  };
};

export type LspServerCapabilities = {
  diagnosticProvider?: boolean | { interFileDependencies?: boolean };
  textDocumentSync?: number | { openClose?: boolean; change?: number };
};

export type LspInitializeParams = {
  processId: number;
  rootUri: string | null;
  capabilities: LspClientCapabilities;
};

export type LspInitializeResult = {
  capabilities: LspServerCapabilities;
};

export type LspPublishDiagnosticsParams = {
  uri: string;
  diagnostics: LspDiagnostic[];
};

export type LspJsonRpcMessage =
  | { jsonrpc: "2.0"; id?: number | string; method: string; params?: unknown }
  | { jsonrpc: "2.0"; id: number | string; result?: unknown; error?: unknown }
  | { jsonrpc: "2.0" };
