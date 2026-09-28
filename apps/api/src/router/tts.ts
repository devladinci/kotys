import { referenceStatus, removeReference } from "../services/tts/reference.js";
import { listEnabledTtsConnectors } from "../services/tts/registry.js";
import { pub } from "./base.js";

export const ttsRouter = {
  models: pub.handler(async () => {
    const settled = await Promise.allSettled(
      listEnabledTtsConnectors().map(({ connector }) => connector.listModels()),
    );

    return settled.flatMap((result) =>
      result.status === "fulfilled" ? result.value : [],
    );
  }),

  reference: pub.handler(() => referenceStatus()),

  removeReference: pub.handler(async () => {
    await removeReference();

    return { ok: true as const };
  }),
};
