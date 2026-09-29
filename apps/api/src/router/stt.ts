import type { ModelListing } from "@kotys/contracts";
import { getSetting } from "@kotys/db";
import {
  listEnabledSttConnectors,
  parseSttModelSetting,
  resolveSttConnector,
  STT_MODEL_SETTING,
} from "../services/stt/registry.js";
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

  /** Whether dictation can stream into the composer with the selected model. */
  capabilities: pub.handler(async () => {
    const ref = parseSttModelSetting(getSetting(STT_MODEL_SETTING));
    if (!ref) return { streaming: false };
    try {
      const connector = resolveSttConnector(ref);
      return {
        streaming: (await connector.supportsStreaming?.(ref.model)) === true,
      };
    } catch {
      return { streaming: false };
    }
  }),
};
