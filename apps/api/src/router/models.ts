import type { ModelListing } from "@kotys/contracts";
import { refreshModels } from "@kotys/db";
import { listEnabledConnectors } from "../services/llm/registry.js";
import { pub } from "./base.js";

/**
 * Merged listing across every enabled connector. One provider failing
 * (Ollama down, oMLX key wrong) must not blank the picker — same
 * allSettled merge pattern as the old cloud+local handler.
 */
export const modelsRouter = {
  list: pub.handler(async () => {
    const connectors = listEnabledConnectors();
    const settled = await Promise.allSettled(
      connectors.map(({ connector }) => connector.listModels()),
    );
    const out: ModelListing[] = [];
    for (const result of settled) {
      if (result.status === "fulfilled") out.push(...result.value);
    }
    // Fresh listings arrive nowhere else. Silent: chats pick the new window up
    // on their next fetch, which is not worth waking every client over.
    refreshModels(out);
    return out;
  }),
};
