import type { ModelRef } from "@kotys/contracts";
import { getSetting } from "@kotys/db";
import { createOllamaConnector } from "./ollamaConnector.js";
import { createOpenAiCompatibleConnector } from "./openaiCompatibleConnector.js";
import type { LlmConnector } from "./types.js";

export type { LlmConnector } from "./types.js";
export type { ConnectorChatMessage } from "./types.js";

const DEFAULT_OMLX_HOST = "http://127.0.0.1:7777/v1";

const OMLX_ENABLED_KEY = "omlx_enabled";
const OMLX_HOST_KEY = "omlx_host";
const OMLX_API_KEY_KEY = "omlx_api_key";

/** oMLX on/off — shared by chat connectors and the STT service. */
export const omlxEnabled = (): boolean =>
  getSetting(OMLX_ENABLED_KEY) === "true";

export const omlxConfig = () => ({
  baseUrl: getSetting(OMLX_HOST_KEY) || DEFAULT_OMLX_HOST,
  apiKey: getSetting(OMLX_API_KEY_KEY) ?? "",
  provider: "omlx" as const,
  source: "local" as const,
});

/**
 * Connectors are stateless over their config, so they are built per call —
 * settings can change at runtime without restarts or cache invalidation.
 */
export function resolveConnector(ref: ModelRef): LlmConnector {
  if (ref.provider === "omlx") {
    return createOpenAiCompatibleConnector(omlxConfig());
  }
  // Ollama default is the local daemon: background ModelRef callers mean
  // "the local machine's models". Cloud chat resolves through
  // resolveOllamaConnector, where the caller states the source explicitly.
  return createOllamaConnector("local", getSetting("api_key") ?? "");
}

export function resolveOllamaConnector(
  source: "cloud" | "local",
): LlmConnector {
  return createOllamaConnector(source, getSetting("api_key") ?? "");
}

/**
 * Every enabled connector, for merged listing fan-out. Failure of one
 * provider must not take down the others (Promise.allSettled at the caller).
 */
export function listEnabledConnectors(): {
  provider: string;
  connector: LlmConnector;
}[] {
  const out: { provider: string; connector: LlmConnector }[] = [];
  const apiKey = getSetting("api_key") ?? "";
  out.push({
    provider: "ollama",
    connector: createOllamaConnector("cloud", apiKey),
  });
  out.push({
    provider: "ollama",
    connector: createOllamaConnector("local", apiKey),
  });
  if (omlxEnabled()) {
    out.push({
      provider: "omlx",
      connector: createOpenAiCompatibleConnector(omlxConfig()),
    });
  }
  return out;
}
