import { listSpeechModelsOf } from "../services/speech.js";
import { pub } from "./base.js";

export const sttRouter = {
  models: pub.handler(() => listSpeechModelsOf("stt")),
};
