#!/usr/bin/env bash
#
# Self-update installer for the Kotys desktop dist.
#
# Designed to be armed by the running app instance and survive its death:
# sleeps so the caller can exit, quits the installed app, swaps
# /Applications/Kotys.app with the freshly built release bundle, relaunches,
# and cleans up the old copy.
#
# Safety:
#   - every action is logged to kotys-install.log next to this script
#   - loop guard: refuses to install the same bundle twice within
#     KOTYS_INSTALL_GUARD seconds (default 600) - breaks launchd respawn
#     cycles; override with KOTYS_INSTALL_FORCE=1
#   - pid lock: refuses to run concurrently with another instance
#   - self-bootout: pass the launchd label via KOTYS_LAUNCH_LABEL and the
#     script removes its own job on exit
#
# Process detection uses `ps` with an anchored pattern, NOT pgrep -
# pgrep cannot see this app's main process (its comm is the full path),
# which causes false "app stopped" verdicts and swap-under-running-app.
#
# Usage: kotys-install.sh [path-to-new-app]
# Env:
#   KOTYS_REPO_ROOT     repo checkout holding the built bundle
#                       (default: parent of this script's repo dir)
#   KOTYS_INSTALL_DELAY seconds to sleep before acting (default 30)
#   KOTYS_INSTALL_DRY   if set to 1, only log the actions
#   KOTYS_INSTALL_GUARD loop-guard window in seconds (default 600)
#   KOTYS_INSTALL_FORCE set to 1 to bypass the loop guard
#   KOTYS_LAUNCH_LABEL  launchd label to boot out on exit (optional)
#
# Self-detach FIRST, before anything else: armed runs start as children of
# the app's own process tree, and the quit step below would take this script
# down with the app (observed as a silent mid-flight death that way).
# Re-exec in a detached session so the app's death cannot kill the installer.
# Guard/FORCE/SRC env vars are forwarded; re-exec happens at most once.
if [ -z "${KOTYS_INSTALL_DETACHED:-}" ]; then
  export KOTYS_INSTALL_DETACHED=1
  if command -v setsid >/dev/null 2>&1; then
    exec setsid "$0" "$@"
  else
    exec bash -c 'disown; exec "$@"' _ "$0" "$@"
  fi
fi

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG="$SCRIPT_DIR/kotys-install.log"
STATE="$SCRIPT_DIR/.kotys-install.state"
LOCK="$SCRIPT_DIR/.kotys-install.lock"

DELAY="${KOTYS_INSTALL_DELAY:-30}"
DRY="${KOTYS_INSTALL_DRY:-0}"
GUARD="${KOTYS_INSTALL_GUARD:-600}"
FORCE="${KOTYS_INSTALL_FORCE:-0}"

APP_NAME="Kotys"
DEST="/Applications/$APP_NAME.app"
OLD="/Applications/.$APP_NAME-old.$$"
SRC_DIR="${KOTYS_REPO_ROOT:-"$(cd "$SCRIPT_DIR/.." && pwd)"}/release/mac-arm64"
KILL_RE="^$DEST/Contents/MacOS/$APP_NAME"

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$LOG" >&2; }

kotys_pids() { ps -axww -o pid=,args= | awk -v re="$KILL_RE" '$2 ~ re {print $1}'; }

kotys_running() { [ -n "$(kotys_pids)" ]; }

if [ -f "$LOCK" ] && kill -0 "$(cat "$LOCK" 2>/dev/null)" 2>/dev/null; then
  log "error: installer pid $(cat "$LOCK") still running, aborting"
  exit 1
fi
echo $$ > "$LOCK"
cleanup() {
  rm -f "$LOCK"
  if [ -n "${KOTYS_LAUNCH_LABEL:-}" ]; then
    launchctl bootout "gui/$(id -u)/$KOTYS_LAUNCH_LABEL" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

SRC="${1:-$SRC_DIR/Kotys.app}"
if [ ! -d "$SRC" ] || [ ! -x "$SRC/Contents/MacOS/$APP_NAME" ] || [ ! -f "$SRC/Contents/Resources/app.asar" ]; then
  log "error: no valid bundle at '$SRC'"
  exit 1
fi
log "installer started (pid $$, src=$SRC, delay=${DELAY}s, dry=${DRY})"

# Loop guard: the acting run records the bundle before acting, so any
# respawn for the same bundle inside the window aborts immediately.
KEY="$(stat -f '%m:%z' "$SRC/Contents/MacOS/$APP_NAME")"
if [ -f "$STATE" ] && [ "$FORCE" != "1" ]; then
  read -r PREV_KEY PREV_TS < "$STATE"
  NOW="$(date +%s)"
  if [ "$PREV_KEY" = "$KEY" ] && [ $((NOW - PREV_TS)) -lt "$GUARD" ]; then
    log "loop guard: same bundle installed $((NOW - PREV_TS))s ago, refusing to reinstall (KOTYS_INSTALL_FORCE=1 to override)"
    exit 1
  fi
fi

log "sleeping ${DELAY}s before install"
sleep "$DELAY"

if [ "$DRY" = "1" ]; then
  log "dry-run: would quit $DEST, replace with $SRC, relaunch"
  exit 0
fi

printf '%s %s\n' "$KEY" "$(date +%s)" > "$STATE"

# Stop the running app: graceful quit, then SIGKILL by PID, verified via ps.
osascript -e "tell application \"$APP_NAME\" to quit" 2>/dev/null || true
for _ in $(seq 1 20); do
  kotys_running || break
  sleep 1
done
if kotys_running; then
  log "app still running, sending SIGKILL by pid"
  kotys_pids | xargs kill -9 2>/dev/null || true
  sleep 2
fi
if kotys_running; then
  log "error: could not stop the running app, aborting (nothing was replaced)"
  exit 1
fi
log "old app stopped"

mv "$DEST" "$OLD"
if ! cp -R "$SRC" "$DEST"; then
  log "error: copy failed, restoring old app"
  mv "$OLD" "$DEST"
  exit 1
fi
log "new bundle installed at $DEST"

# Re-sign: TCC grants (Screen Recording etc.) key on the code identity; a
# broken or ad-hoc-shifted signature makes every permission grant useless.
if ! codesign --force --deep --sign "Kotys Dev" "$DEST" >/dev/null 2>&1; then
  log "warning: re-sign failed, permissions may need re-granting"
fi

# Bring the app up: open, retry, then direct exec as a last resort.
bring_up() {
  open "$DEST" || true
  sleep 2
  for _ in $(seq 1 15); do
    kotys_running && return 0
    sleep 1
  done
  log "app not up after first open, retrying"
  open "$DEST" || true
  sleep 5
  for _ in $(seq 1 10); do
    kotys_running && return 0
    sleep 1
  done
  log "still not up, exec fallback"
  nohup "$DEST/Contents/MacOS/$APP_NAME" >/dev/null 2>&1 &
  sleep 3
  for _ in $(seq 1 10); do
    kotys_running && return 0
    sleep 1
  done
  return 1
}

if bring_up; then
  log "install complete"
  rm -rf "$OLD"
  exit 0
fi

log "error: app failed to relaunch; old copy kept at $OLD (relaunch manually: open $DEST)"
exit 1