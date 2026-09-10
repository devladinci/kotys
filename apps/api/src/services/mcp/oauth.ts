import http from "node:http";
import crypto from "node:crypto";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientMetadata,
  OAuthClientInformationMixed,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { getSetting, setSetting } from "@kotys/db";
import { events } from "../events.js";

function tokenKey(serverName: string) {
  return `mcp_oauth_${serverName}`;
}

function loadTokens(serverName: string): OAuthTokens | undefined {
  const raw = getSetting(tokenKey(serverName));
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as OAuthTokens;
  } catch {
    return undefined;
  }
}

function saveTokens(serverName: string, tokens: OAuthTokens): void {
  setSetting(tokenKey(serverName), JSON.stringify(tokens));
}

function clientInfoKey(serverName: string) {
  return `mcp_oauth_client_${serverName}`;
}

function loadClientInfo(
  serverName: string,
): OAuthClientInformationMixed | undefined {
  const raw = getSetting(clientInfoKey(serverName));
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as OAuthClientInformationMixed;
  } catch {
    return undefined;
  }
}

function saveClientInfo(
  serverName: string,
  info: OAuthClientInformationMixed,
): void {
  setSetting(clientInfoKey(serverName), JSON.stringify(info));
}

type PendingAuth = {
  codeVerifier: string;
  state: string;
  resolve: (code: string | null) => void;
  server: http.Server;
};

const pendingAuths = new Map<string, PendingAuth>();
const OAUTH_CALLBACK_PORT = 3118;

export class KotysOAuthProvider implements OAuthClientProvider {
  private readonly serverName: string;
  private readonly clientIdVal: string | undefined;
  private readonly scopeVal: string | undefined;
  private stateVal: string;
  private readonly skipOAuth: boolean;

  constructor(
    serverName: string,
    opts?: {
      clientId?: string;
      scope?: string;
      skipOAuth?: boolean;
    },
  ) {
    this.serverName = serverName;
    this.clientIdVal = opts?.clientId;
    this.scopeVal = opts?.scope;
    this.stateVal = crypto.randomBytes(16).toString("hex");
    this.skipOAuth = opts?.skipOAuth ?? false;
  }

  get redirectUrl(): string {
    return `http://localhost:${OAUTH_CALLBACK_PORT}/callback`;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "Kotys",
      redirect_uris: [this.redirectUrl],
      grant_types: ["authorization_code", "refresh_token"],
      token_endpoint_auth_method: "none",
      response_types: ["code"],
      ...(this.scopeVal ? { scope: this.scopeVal } : {}),
    };
  }

  async state(): Promise<string> {
    return this.stateVal;
  }

  clientInformation(): OAuthClientInformationMixed | undefined {
    if (this.clientIdVal) return { client_id: this.clientIdVal };
    return loadClientInfo(this.serverName);
  }

  async saveClientInformation(
    info: OAuthClientInformationMixed,
  ): Promise<void> {
    if (this.clientIdVal) return;
    saveClientInfo(this.serverName, info);
  }

  tokens(): OAuthTokens | undefined {
    return loadTokens(this.serverName);
  }

  saveTokens(tokens: OAuthTokens): void {
    saveTokens(this.serverName, tokens);
  }

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    if (this.skipOAuth) {
      throw new Error(
        "MCP server requires authorization. Use Settings → MCP Servers → Reconnect to authenticate.",
      );
    }
    events.emitEvent("open-url", { url: authorizationUrl.toString() });
  }

  saveCodeVerifier(codeVerifier: string): void {
    const pending = pendingAuths.get(this.serverName);
    if (pending) pending.codeVerifier = codeVerifier;
  }

  codeVerifier(): string {
    const pending = pendingAuths.get(this.serverName);
    return pending?.codeVerifier ?? "";
  }

  async invalidateCredentials(): Promise<void> {
    setSetting(tokenKey(this.serverName), "");
    setSetting(clientInfoKey(this.serverName), "");
  }
}

export function startCallbackServer(
  serverName: string,
  expectedState: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const httpServer = http.createServer((req, res) => {
      const url = new URL(
        req.url ?? "",
        `http://localhost:${OAUTH_CALLBACK_PORT}`,
      );
      const code = url.searchParams.get("code");
      const returnedState = url.searchParams.get("state");
      if (code && returnedState === expectedState) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          "<html><body><h2>Authorization successful</h2><p>You can close this tab and return to Kotys.</p></body></html>",
        );
        const pending = pendingAuths.get(serverName);
        if (pending) pending.resolve(code);
      } else {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(
          "<html><body><h2>Authorization failed</h2><p>Invalid state. Try again.</p></body></html>",
        );
      }
    });
    httpServer.on("error", (err) => reject(err));
    httpServer.listen(OAUTH_CALLBACK_PORT, () => {
      pendingAuths.set(serverName, {
        codeVerifier: "",
        state: expectedState,
        resolve: (code) => resolve(code ?? ""),
        server: httpServer,
      });
    });
    setTimeout(() => {
      const pending = pendingAuths.get(serverName);
      if (pending) pending.resolve(null);
    }, 300_000);
  });
}

export function stopCallbackServer(serverName: string): void {
  const pending = pendingAuths.get(serverName);
  if (pending) {
    pendingAuths.delete(serverName);
  }
}
