import type { Hono } from "hono";
import { upgradeWebSocket } from "@hono/node-server";
import type { IConfig, ITtsAdapter, IValidationResult } from "@saystack/core";
import { validateConfig } from "@saystack/core";
import {
  createOmlxRealtimeSttAdapter,
  createOpenAiSttAdapter,
  createOpenAiTtsAdapter,
} from "@saystack/engine-openai-compatible";
import { createVoiceRoutes } from "@saystack/server";
import { isValidToken, requireAuth } from "./auth.js";
import { speechEngine } from "./services/speech.js";
import { loadReference } from "./services/tts/reference.js";

const VOICE_PREFIX = "/voice";

const REALTIME_PATH = `${VOICE_PREFIX}/audio/transcriptions/realtime`;

const TTS_MAX_TEXT = 2_000;

function voiceSettings(): IValidationResult {
  const stt = speechEngine("stt");
  const tts = speechEngine("tts");
  const config: IConfig = {
    languages: [],
    ...(stt ? { stt } : {}),
    ...(tts ? { tts } : {}),
  };

  // No model selected is not a broken setting: the routes answer NO_ADAPTER.
  return stt || tts ? validateConfig(config) : { ok: true, config };
}

/**
 * Every reply is read in the voice the user recorded, when there is one. The
 * voice only ever comes from that stored clip, never from the request.
 */
const withReference = (adapter: ITtsAdapter): ITtsAdapter => ({
  capabilities: adapter.capabilities,
  synthesize: async ({ refAudio: _audio, refText: _text, ...input }) => {
    const reference = await loadReference();
    return adapter.synthesize(
      reference
        ? { ...input, refAudio: reference.audio, refText: reference.text }
        : input,
    );
  },
});

/**
 * Dictation and read-aloud are saystack's routes, mounted under /voice. The
 * model comes from the stt_model / tts_model settings. Browsers can't set
 * WebSocket headers, so live dictation carries the token in the query
 * string and is checked by authorize instead of requireAuth.
 */
export function registerVoiceRoutes(app: Hono): void {
  app.use(`${VOICE_PREFIX}/*`, async (c, next) =>
    c.req.path === REALTIME_PATH ? next() : requireAuth()(c, next),
  );

  app.route(
    VOICE_PREFIX,
    createVoiceRoutes({
      getSettings: voiceSettings,
      createSttAdapter: (engine) => createOpenAiSttAdapter(engine),
      createTtsAdapter: (engine) =>
        withReference(createOpenAiTtsAdapter(engine)),
      realtime: {
        upgradeWebSocket,
        authorize: (c) => isValidToken(c.req.query("token")),
        createAdapter: (engine) => createOmlxRealtimeSttAdapter(engine),
      },
      maxTextChars: TTS_MAX_TEXT,
      // The app's own CORS and origin guard already cover every route.
      cors: false,
    }),
  );
}
