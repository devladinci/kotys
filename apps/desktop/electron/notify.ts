import { Notification } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface INotifyRequest {
  title: string;
  body: string;
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
  const { title, body } = n as Partial<INotifyRequest>;

  return (
    typeof title === "string" &&
    typeof body === "string" &&
    title.length <= 200 &&
    body.length <= 2_000
  );
};

/**
 * A focused window means the reply is on screen in front of the user, so a
 * banner is noise. Returns whether one was shown.
 */
export const showNotification = (
  request: INotifyRequest,
  window: INotifyWindow | null,
): boolean => {
  if (window?.isFocused()) return false;
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
