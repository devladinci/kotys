import path from "node:path";
import os from "node:os";

/**
 * Where Kotys keeps its database.
 *
 * Kotys owns its own file under its own application-support directory — never
 * a path shared with any other chat app. Importing existing history is an
 * explicit, one-time copy — never a shared handle.
 *
 * Override with KOTYS_DB_PATH. The Electron app passes one; the standalone
 * daemon falls back to the per-platform default below.
 */
function defaultDbDir(): string {
  const home = os.homedir();
  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", "Kotys");
  }
  if (process.platform === "win32") {
    return path.join(
      process.env.APPDATA ?? path.join(home, "AppData", "Roaming"),
      "Kotys",
    );
  }
  return path.join(
    process.env.XDG_DATA_HOME ?? path.join(home, ".local", "share"),
    "kotys",
  );
}

export const DB_PATH =
  process.env.KOTYS_DB_PATH ?? path.join(defaultDbDir(), "chat.db");
