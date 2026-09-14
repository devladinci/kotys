#!/usr/bin/env bash
#
# Self-update installer for the Kotys desktop dist.
#
# Designed to be armed by the running app instance and survive its death:
# sleeps so the caller can exit, quits the installed app, swaps
# /Applications/Kotys.app with the freshly built release bundle, re-signs,
# relaunches, and cleans up the old copy.
#
# Detach strategy (this failed twice in real runs before landing here):
# the arming run re-launches itself as a launchd agent (bootstrap gui/$UID
# with RunAtLoad). launchd gives the acting run its own GUI session, which
# nothing in the app's process tree can kill - the app quit, a daemon
# teardown, or a process-group kill from the tool that armed the script all
# leave the acting run untouched. The two prior attempts (plain `disown`,
# then a perl double-fork + setsid) both died silently mid-flight in real
# installs; launchd-mediated runs are the only ones observed to always
# complete (5/5 clean installs). The acting run bootouts its own label on
# exit. If launchd is unavailable, falls back to a perl double-fork+setsid.
#
# Safety:
#   - every action is logged to kotys-install.log next to this script;
#     acting runs log their pid/ppid/pgid/session up front and trap
#     SIGTERM/HUP/INT, so a mid-flight death always leaves a trace
#   - loop guard: refuses to install the same bundle twice within
#     KOTYS_INSTALL_GUARD seconds (default 600); override with
#     KOTYS_INSTALL_FORCE=1
#   - pid lock: refuses to run concurrently with another instance
#
# Process detection uses `ps` with an anchored pattern, NOT pgrep -
# pgrep cannot see this app's main process (its comm is the full path),
# which causes false "app stopped" verdicts and swap-under-running-app.
#
# Usage: kotys-install.sh [path-to-new-app]
# Env:
#   KOTYS_REPO_ROOT      repo checkout holding the built bundle
#                        (default: parent of this script's dir)
#   KOTYS_INSTALL_DELAY  seconds to sleep before acting (default 30)
#   KOTYS_INSTALL_DRY    if set to 1, only log the actions
#   KOTYS_INSTALL_GUARD  loop-guard window in seconds (default 600)
#   KOTYS_INSTALL_FORCE  set to 1 to bypass the loop guard
#   KOTYS_INSTALL_APP_NAME  app bundle name to swap (default Kotys)

# SCRIPT_DIR is needed by the detach block below, so it comes first.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG="$SCRIPT_DIR/kotys-install.log"
STATE="$SCRIPT_DIR/.kotys-install.state"
LOCK="$SCRIPT_DIR/.kotys-install.lock"

if [ -z "${KOTYS_INSTALL_DETACHED:-}" ]; then
  export KOTYS_INSTALL_DETACHED=1
  UIX="$(id -u)"
  LABEL="kotys-install.$$"
  PLIST="$SCRIPT_DIR/.kotys-install-$$.plist"

  # Forward every KOTYS_* variable from the caller's env to the acting run,
  # plus the label and plist paths so it can clean up after itself.
  ENV_XML="    <key>KOTYS_INSTALL_DETACHED</key><string>1</string>"
  ENV_XML+=$'\n'"    <key>KOTYS_LAUNCH_LABEL</key><string>$LABEL</string>"
  ENV_XML+=$'\n'"    <key>KOTYS_INSTALL_PLIST</key><string>$PLIST</string>"
  for k in $(env | grep '^KOTYS_' | cut -d= -f1 || true); do
    case "$k" in
      KOTYS_INSTALL_DETACHED|KOTYS_LAUNCH_LABEL|KOTYS_INSTALL_PLIST) continue ;;
    esac
    v="${!k}"
    v="${v//&/&amp;}"; v="${v//</&lt;}"; v="${v//>/&gt;}"
    ENV_XML+=$'\n'"    <key>$k</key><string>$v</string>"
  done

  SELF="$(cd "$SCRIPT_DIR" && pwd)/$(basename "$0")"
  ARGS_XML=""
  for a in "$@"; do
    a="${a//&/&amp;}"; a="${a//</&lt;}"; a="${a//>/&gt;}"
    ARGS_XML+=$'\n'"    <string>$a</string>"
  done

  cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array>
    <string>/bin/bash</string>
    <string>$SELF</string>$ARGS_XML
  </array>
  <key>EnvironmentVariables</key><dict>
$ENV_XML
  </dict>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>/tmp/kotys-install-launchd.out</string>
  <key>StandardErrorPath</key><string>/tmp/kotys-install-launchd.err</string>
</dict></plist>
EOF

  if launchctl bootstrap "gui/$UIX" "$PLIST" 2>/dev/null; then
    # Confirm the acting run actually started (a bad plist or instant crash
    # would otherwise leave the arming run silently successful).
    for _ in 1 2 3; do
      sleep 1
      grep -q "label=$LABEL " "$LOG" 2>/dev/null && break
    done
    if grep -q "label=$LABEL " "$LOG" 2>/dev/null; then
      exit 0
    fi
    launchctl bootout "gui/$UIX/$LABEL" >/dev/null 2>&1 || true
    rm -f "$PLIST"
  elif launchctl load "$PLIST" 2>/dev/null; then
    sleep 3
    if grep -q "label=$LABEL " "$LOG" 2>/dev/null; then
      exit 0
    fi
    launchctl bootout "gui/$UIX/$LABEL" >/dev/null 2>&1 || true
    rm -f "$PLIST"
  fi

  # launchd unavailable: perl double-fork + setsid fallback.
  exec perl -e '
    use POSIX qw(setsid);
    fork and exit 0;
    POSIX::setsid();
    if (fork) { exit 0; }
    exec $ARGV[0], @ARGV[1 .. $#ARGV];
  ' "$SELF" "$@"
fi

set -euo pipefail

# Release any inherited caller pipes immediately: a bash-tool parent reads
# stdout until EOF and would otherwise hang for this run's whole lifetime.
exec >/tmp/kotys-install-launchd.out 2>&1 </dev/null

DELAY="${KOTYS_INSTALL_DELAY:-30}"
DRY="${KOTYS_INSTALL_DRY:-0}"
GUARD="${KOTYS_INSTALL_GUARD:-600}"
FORCE="${KOTYS_INSTALL_FORCE:-0}"

APP_NAME="${KOTYS_INSTALL_APP_NAME:-Kotys}"
DEST="/Applications/$APP_NAME.app"
OLD="/Applications/.$APP_NAME-old.$$"
SRC_DIR="${KOTYS_REPO_ROOT:-"$(cd "$SCRIPT_DIR/.." && pwd)"}/release/mac-arm64"
KILL_RE="^$DEST/Contents/MacOS/$APP_NAME"

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$LOG" >&2; }

# A signal (other than SIGKILL, which nothing can catch) always leaves a
# trace, so a mid-flight death is diagnosable from the log alone.
trap 'log "fatal: SIGTERM received (external kill); aborting"; exit 143' TERM
trap 'log "fatal: SIGHUP received (session hangup); aborting"; exit 129' HUP
trap 'log "fatal: SIGINT received; aborting"; exit 130' INT

if [ -n "${KOTYS_LAUNCH_LABEL:-}" ]; then
  log "acting run: pid=$$ ppid=$(ps -o ppid= -p $$ | tr -d ' ') pgid=$(ps -o pgid= -p $$ | tr -d ' ') sess=$(ps -o sess= -p $$ | tr -d ' ') label=$KOTYS_LAUNCH_LABEL "
else
  log "acting run: pid=$$ ppid=$(ps -o ppid= -p $$ | tr -d ' ') pgid=$(ps -o pgid= -p $$ | tr -d ' ') sess=$(ps -o sess= -p $$ | tr -d ' ') (no launchd label)"
fi

if [ -f "$LOCK" ] && kill -0 "$(cat "$LOCK" 2>/dev/null)" 2>/dev/null; then
  log "error: installer pid $(cat "$LOCK") still running, aborting"
  exit 1
fi
echo $$ > "$LOCK"
# NOTE: the acting run must NOT bootout its own launchd label on exit.
# launchd sends SIGTERM to job processes on bootout; racing the acting
# run's own exit path with that signal leaves the run dead before its
# final log line and cleanup (observed in test runs as a 'fatal: SIGTERM'
# pair and a leftover .<App>-old dir right after 'exec fallback'). Each
# acting run uses a unique label (kotys-install.$$), so the leftover job
# definition is inert and gets removed with the plist; nothing lingers.
cleanup() {
  rm -f "$LOCK"
  if [ -n "${KOTYS_INSTALL_PLIST:-}" ]; then
    rm -f "$KOTYS_INSTALL_PLIST"
  fi
}
trap cleanup EXIT

SRC="${1:-$SRC_DIR/$APP_NAME.app}"
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

# Stop the running app: graceful quit (with a timeout guard), then SIGKILL
# by PID, verified via ps.
osascript -e "tell application \"$APP_NAME\" to quit" >/dev/null 2>&1 &
OSA_PID=$!
for _ in 1 2 3 4 5; do
  kill -0 "$OSA_PID" 2>/dev/null || break
  sleep 1
done
kill "$OSA_PID" 2>/dev/null || true
wait "$OSA_PID" 2>/dev/null || true

for _ in $(seq 1 20); do
  kotys_running() { [ -n "$(ps -axww -o pid=,args= | awk -v re="$KILL_RE" '$2 ~ re {print $1}')" ]; }
  kotys_running || break
  sleep 1
done
if kotys_running; then
  log "app still running, sending SIGKILL by pid"
  ps -axww -o pid=,args= | awk -v re="$KILL_RE" '$2 ~ re {print $1}' | xargs kill -9 2>/dev/null || true
  sleep 2
fi
if kotys_running; then
  log "error: could not stop the running app, aborting (nothing was replaced)"
  exit 1
fi
log "old app stopped"

if [ -d "$DEST" ]; then
  mv "$DEST" "$OLD"
  log "old bundle moved aside"
else
  log "note: no existing bundle at $DEST (first install)"
fi
if ! cp -R "$SRC" "$DEST"; then
  log "error: copy failed, restoring old app"
  if [ -d "$OLD" ]; then
    mv "$OLD" "$DEST"
  fi
  exit 1
fi
log "new bundle installed at $DEST"

# Re-sign: TCC grants (Screen Recording etc.) key on the code identity; a
# broken or ad-hoc-shifted signature makes every permission grant useless.
log "re-sign: starting"
if codesign --force --deep --sign "Kotys Dev" "$DEST" >>"$LOG" 2>&1; then
  log "re-sign: ok"
else
  log "warning: re-sign failed (see codesign output above); permissions may need re-granting"
fi

# Re-register with LaunchServices so `open` resolves the new inode instead
# of a stale cache entry for the replaced bundle.
LSREG="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
if [ -x "$LSREG" ]; then
  "$LSREG" -f "$DEST" >/dev/null 2>&1 || true
  log "launch services re-registered"
fi

# Bring the app up: open, retry, then direct exec as a last resort.
bring_up() {
  log "relaunch: open attempt 1"
  if ! open "$DEST" 2>>"$LOG"; then
    log "relaunch: open exited nonzero"
  fi
  sleep 2
  for _ in $(seq 1 15); do
    if kotys_running; then
      log "relaunch: app detected (attempt 1)"
      return 0
    fi
    sleep 1
  done

  log "relaunch: not up after attempt 1, retrying"
  if ! open "$DEST" 2>>"$LOG"; then
    log "relaunch: open(2) exited nonzero"
  fi
  sleep 5
  for _ in $(seq 1 10); do
    if kotys_running; then
      log "relaunch: app detected (attempt 2)"
      return 0
    fi
    sleep 1
  done

  log "relaunch: still not up, re-register + open attempt 3"
  "$LSREG" -f "$DEST" >/dev/null 2>&1 || true
  if ! open "$DEST" 2>>"$LOG"; then
    log "relaunch: open(3) exited nonzero"
  fi
  sleep 5
  for _ in $(seq 1 10); do
    if kotys_running; then
      log "relaunch: app detected (attempt 3)"
      return 0
    fi
    sleep 1
  done

  log "relaunch: still not up, exec fallback"
  nohup "$DEST/Contents/MacOS/$APP_NAME" >>"$LOG" 2>&1 &
  sleep 3
  for _ in $(seq 1 10); do
    if kotys_running; then
      log "relaunch: app detected (exec fallback)"
      return 0
    fi
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
{
  echo "--- relaunch failure diagnostics $(date '+%Y-%m-%d %H:%M:%S') ---"
  ls -la "$DEST/Contents/MacOS" 2>&1
  codesign -dv "$DEST" 2>&1 | head -5
} >>"$LOG" 2>&1
exit 1