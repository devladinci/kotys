import type { ModelListing } from "@kotys/contracts";
import { listEnabledSttConnectors } from "../services/stt/registry.js";
import { pub } from "./base.js";

/**
 * Merged STT listing across every enabled speech-to-text connector — same
 * allSettled merge pattern as the chat models router.
 */
export const sttRouter = {
  models: pub.handler(async () => {
    const connectors = listEnabledSttConnectors();
    const settled = await Promise.allSettled(
      connectors.map(({ connector }) => connector.listModels()),
    );
    const out: ModelListing[] = [];
    for (const result of settled) {
      if (result.status === "fulfilled") out.push(...result.value);
    }
    return out;
  }),
};
