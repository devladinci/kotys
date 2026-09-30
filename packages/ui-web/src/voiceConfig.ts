import { getConfig, requestSpeechSummary } from "@kotys/core";
import type { ReadAloudId } from "@saystack/react-web";

export const daemonUrl = (path: string): string =>
  `${getConfig().baseUrl}${path}`;

export const authHeaders = (): Record<string, string> => ({
  Authorization: `Bearer ${getConfig().token}`,
});

// Browsers can't set WS handshake headers, so the token rides in the query
// string, as on /ws.
export const dictationStreamUrl = (): string => {
  const { baseUrl, token } = getConfig();

  return `${baseUrl.replace(/^http/, "ws")}/stt/stream?token=${encodeURIComponent(token)}`;
};

export const summarizeReply = (
  id: ReadAloudId,
  _markdown: string,
  signal: AbortSignal,
): Promise<string | null> =>
  requestSpeechSummary(getConfig(), Number(id), signal);
