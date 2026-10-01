import { referenceStatus, removeReference } from "../services/tts/reference.js";
import { listSpeechModelsOf } from "../services/speech.js";
import { pub } from "./base.js";

export const ttsRouter = {
  models: pub.handler(() => listSpeechModelsOf("tts")),

  reference: pub.handler(() => referenceStatus()),

  removeReference: pub.handler(async () => {
    await removeReference();

    return { ok: true as const };
  }),
};
