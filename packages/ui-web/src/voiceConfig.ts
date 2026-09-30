import { getConfig, requestSpeechSummary } from "@kotys/core";
import type { ReadAloudId } from "@saystack/react-web";

const daemonUrl = (path: string): string => `${getConfig().baseUrl}${path}`;

// saystack's voice routes, mounted on the daemon under /voice.
export const speechUrl = (): string => daemonUrl("/voice/speech");

export const dictationUrl = (): string =>
  daemonUrl("/voice/audio/transcriptions");

export const authHeaders = (): Record<string, string> => ({
  Authorization: `Bearer ${getConfig().token}`,
});

// Browsers can't set WS handshake headers, so the token rides in the query
// string, as on /ws.
export const dictationStreamUrl = (): string => {
  const { baseUrl, token } = getConfig();

  return `${baseUrl.replace(/^http/, "ws")}/voice/audio/transcriptions/realtime?token=${encodeURIComponent(token)}`;
};

export const summarizeReply = (
  id: ReadAloudId,
  _markdown: string,
  signal: AbortSignal,
): Promise<string | null> =>
  requestSpeechSummary(getConfig(), Number(id), signal);
