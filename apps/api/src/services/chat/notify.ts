import { notificationSummary } from "./notifyText.js";

/** Faster replies are already on the user's screen; a notification is noise. */
const NOTIFY_AFTER_MS = 2_000;
const PREVIEW_MAX_CHARS = 120;
const BODY_MAX_CHARS = 140;
/**
 * Under this the reply is shorter than a banner, so its own words already are
 * the summary — no reason to spend a model call and three seconds on it.
 */
const SUMMARY_SKIP_UNDER_CHARS = 160;
const TITLE = "Kotys";

export interface INotifyPayload {
  title: string;
  body: string;
  /** Present on a finished chat turn; reminders and pomodoro carry no chat. */
  chatId?: number;
}

export interface IMaybeNotifyInput {
  startedAt: number;
  content: string;
  chatId: number | null;
  emit: (payload: INotifyPayload) => void;
}

const flatten = (text: string): string =>
  text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^\s*(?:#{1,6}|>|\||[-*+])\s*/gm, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/\s+/g, " ")
    .trim();

const truncate = (text: string, max: number): string => {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");

  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
};

/**
 * The server always emits; each client decides whether to show it. Callers do
 * not await this: the turn has ended, but its `chat:done` frame still has to
 * reach the clients, and nothing should wait three seconds for a banner.
 */
export async function maybeNotify({
  startedAt,
  content,
  chatId,
  emit,
}: IMaybeNotifyInput): Promise<void> {
  if (Date.now() - startedAt <= NOTIFY_AFTER_MS) return;
  const text = flatten(content);
  const preview = truncate(text, PREVIEW_MAX_CHARS);
  let body = preview;

  if (text.length >= SUMMARY_SKIP_UNDER_CHARS) {
    try {
      const written = await notificationSummary(content, chatId);
      const summary =
        written === null ? "" : truncate(flatten(written), BODY_MAX_CHARS);
      if (summary) body = summary;
    } catch (err) {
      console.warn(
        "[notify] no summary, falling back to the reply's opening words:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  emit({
    title: TITLE,
    body: body || "New response ready",
    chatId: chatId ?? undefined,
  });
}
