import { Notification } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface INotifyRequest {
  title: string;
  body: string;
  /** Present on a finished chat turn; reminders and pomodoro carry no chat. */
  chatId?: number;
}

export interface INotifyWindow {
  isFocused: () => boolean;
}

/** ESM main process: `__dirname` does not exist here. */
const ICON_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../build/icon.png",
);

/**
 * The renderer's payload crosses the trust boundary into the main process:
 * shape-check and cap it before it reaches the OS notification.
 */
export const plausibleNotify = (n: unknown): n is INotifyRequest => {
  if (typeof n !== "object" || n === null) return false;
  const { title, body, chatId } = n as Partial<INotifyRequest>;

  return (
    typeof title === "string" &&
    typeof body === "string" &&
    (chatId === undefined || typeof chatId === "number") &&
    title.length <= 200 &&
    body.length <= 2_000
  );
};

/**
 * The second line of defence for `win.isFocused()` drifting from
 * `document.hasFocus()`; it may only drop notifications that carry a chatId,
 * since reminders and pomodoro must arrive either way. Returns whether a banner
 * was shown.
 */
export const showNotification = (
  request: INotifyRequest,
  window: INotifyWindow | null,
): boolean => {
  if (request.chatId !== undefined && window?.isFocused()) return false;
  if (!Notification.isSupported()) return false;

  // macOS already stamps notifications with the app bundle icon; passing
  // `icon` as well makes it render a second time as a large attachment on
  // the banner. Only non-Mac platforms need the explicit icon.
  new Notification({
    title: request.title,
    body: request.body,
    ...(process.platform === "darwin" ? {} : { icon: ICON_PATH }),
  }).show();

  return true;
};
