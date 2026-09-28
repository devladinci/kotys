import type { ModelListing } from "@kotys/contracts";
import { listEnabledTtsConnectors } from "../services/tts/registry.js";
import { pub } from "./base.js";

/**
 * Merged TTS listing across every enabled text-to-speech connector — same
 * allSettled merge pattern as the chat models router.
 */
export const ttsRouter = {
  models: pub.handler(async () => {
    const connectors = listEnabledTtsConnectors();
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
