#!/usr/bin/env bash
#
# Self-update installer for the Kotys desktop dist.
#
# Replaces /Applications/Kotys.app with a freshly built release bundle and
# relaunches it - typically armed by the agent inside the very app being
# replaced. Two runs of this script cooperate:
#
#   arming run   kotys-install.sh [path-to-new-app]
#     Writes a launchd job for the acting run, bootstraps it into the user's
#     GUI domain, waits for the acting run's checks, prints the verdict and
#     exits (status 1 when the checks failed).
#
#   acting run   kotys-install.sh --acting <src> <label>
#     Runs as that launchd job, outside the app's process tree, so quitting
#     the app, the daemon's teardown or a process-group kill aimed at the
#     caller cannot stop it. Checks, waits, stages and verifies the new
#     bundle, quits the app, swaps the bundles with two renames and
#     relaunches. If the new version does not come up, it restores the
#     previous bundle and relaunches that instead.
#
# Environment hygiene: open(1) gives the launched app the caller's
# environment, which then reaches its daemon and every shell the agent runs -
# including the next arming run. So nothing the acting run carries may change
# how the relaunched app, or the next install, behaves:
#   - the acting run is selected by argv, never by an environment variable
#   - only KOTYS_INSTALL_* settings are forwarded to it, and it unsets them
#     before relaunching
#   - ELECTRON_RUN_AS_NODE is dropped: the daemon runs with it, the agent's
#     shells used to inherit it, and it makes the app binary run as plain
#     Node and exit immediately
#
# All logic lives in functions dispatched from the last lines, so bash has read
# the whole file before an install starts: editing or checking out this script
# mid-install cannot change a run in flight.
#
# Safety:
#   - every step is logged to ~/.kotys/kotys-install.log; the output of the
#     commands it runs goes to ~/.kotys/kotys-install.out
#   - the new bundle must pass `codesign --verify --deep --strict` before the
#     app is touched, and again once copied next to the installed bundle
#   - the app counts as up only when its main process runs and the daemon
#     port is listening; anything less rolls back, and so does a signal
#     arriving after the bundles were swapped
#   - loop guard: refuses to install the same build twice within
#     KOTYS_INSTALL_GUARD seconds; KOTYS_INSTALL_FORCE=1 overrides
#   - lock: refuses to run concurrently with another install
#
# Usage: kotys-install.sh [path-to-new-app]
# Env:
#   KOTYS_REPO_ROOT            repo checkout holding the built bundle
#                              (default: parent of this script's dir)
#   KOTYS_INSTALL_DELAY        seconds to wait before quitting the app (default 30)
#   KOTYS_INSTALL_DRY          1 = run the checks, then only log the actions
#   KOTYS_INSTALL_GUARD        loop-guard window in seconds (default 600)
#   KOTYS_INSTALL_FORCE        1 = bypass the loop guard
#   KOTYS_INSTALL_APP_NAME     app bundle name (default Kotys)
#   KOTYS_INSTALL_DEST_DIR     directory holding the installed app (default /Applications)
#   KOTYS_INSTALL_PORT         daemon port that proves the app is up
#                              (default $KOTYS_PORT, else 3017)
#   KOTYS_INSTALL_UP_TIMEOUT   seconds to wait for a relaunched app (default 45)
#   KOTYS_INSTALL_RUNTIME_DIR  log/state/lock directory (default ~/.kotys)

set -euo pipefail

LSREGISTER=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister

RUNTIME_DIR="${KOTYS_INSTALL_RUNTIME_DIR:-$HOME/.kotys}"
LOG="$RUNTIME_DIR/kotys-install.log"
OUT="$RUNTIME_DIR/kotys-install.out"
STATE="$RUNTIME_DIR/kotys-install.state"
LOCK="$RUNTIME_DIR/kotys-install.lock.d"
RUNS="$RUNTIME_DIR/install-runs"

log() {
  local line
  line="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
  printf '%s\n' "$line" >>"$LOG"
  printf '%s\n' "$line" >&2 || true
}

is_uint() {
  case "$1" in
    '' | *[!0-9]*) return 1 ;;
  esac
}

xml_escape() {
  printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'
}

# ------------------------------------------------------------------ arming run

# A finished job stays loaded until it is booted out, and the acting run
# cannot boot out its own job: launchd would SIGTERM it mid-cleanup. Jobs of
# earlier runs are removed here instead - but not young ones, which may belong
# to a concurrent arming run and simply not have started yet.
reap_finished_jobs() {
  local uid="$1" now pid label started
  now="$(date +%s)"
  launchctl list 2>/dev/null | while read -r pid _ label; do
    case "$label" in
      kotys-install.*) ;;
      *) continue ;;
    esac
    started="${label#kotys-install.}"
    started="${started%%.*}"
    if [ "$pid" != "-" ] || { is_uint "$started" && [ $((now - started)) -lt 300 ]; }; then
      continue
    fi
    launchctl bootout "gui/$uid/$label" >/dev/null 2>&1 || true
  done
}

write_job() {
  local label="$1" run_dir="$2" src="$3" name env_xml=""
  for name in $(compgen -e | grep '^KOTYS_INSTALL_' || true); do
    env_xml+="
    <key>$name</key><string>$(xml_escape "${!name}")</string>"
  done
  cat >"$run_dir/job.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key><array>
    <string>/bin/bash</string>
    <string>$(xml_escape "$SELF")</string>
    <string>--acting</string>
    <string>$(xml_escape "$src")</string>
    <string>$label</string>
  </array>
  <key>EnvironmentVariables</key><dict>$env_xml
  </dict>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$(xml_escape "$OUT")</string>
  <key>StandardErrorPath</key><string>$(xml_escape "$OUT")</string>
</dict></plist>
EOF
}

# Waits for the acting run's verdict. Returns 0 once it is armed (or already
# gone), exits 1 when its checks failed, returns 1 when it never reported.
await_acting_run() {
  local run_dir="$1" status=""
  for _ in $(seq 1 80); do
    status="$(cat "$run_dir/status" 2>/dev/null || true)"
    case "$status" in
      armed:*)
        echo "kotys-install:${status#armed:}"
        return 0
        ;;
      failed:*)
        echo "kotys-install:${status#failed:}" >&2
        exit 1
        ;;
    esac
    if [ ! -d "$run_dir" ]; then
      echo "kotys-install: the installer already finished; see $LOG"
      return 0
    fi
    sleep 0.25
  done
  if [ "$status" = started ]; then
    echo "kotys-install: the installer is still running its checks; see $LOG"
    return 0
  fi
  return 1
}

arm() {
  local repo_root src uid label run_dir
  repo_root="${KOTYS_REPO_ROOT:-$(cd "$(dirname "$SELF")/.." && pwd)}"
  src="${1:-$repo_root/release/mac-arm64/${KOTYS_INSTALL_APP_NAME:-Kotys}.app}"
  if [ ! -d "$src" ]; then
    echo "kotys-install: no app bundle at $src (build one with bin/dist)" >&2
    exit 1
  fi
  src="$(cd "$src" && pwd)"
  uid="$(id -u)"
  mkdir -p "$RUNS"
  reap_finished_jobs "$uid"

  label="kotys-install.$(date +%s).$$"
  run_dir="$RUNS/$label"
  mkdir "$run_dir"
  write_job "$label" "$run_dir" "$src"
  if launchctl bootstrap "gui/$uid" "$run_dir/job.plist" 2>>"$OUT"; then
    if await_acting_run "$run_dir"; then
      exit 0
    fi
    case "$(launchctl print "gui/$uid/$label" 2>/dev/null || true)" in
      *"state = running"*)
        echo "kotys-install: the installer started but has not reported yet; see $LOG"
        exit 0
        ;;
    esac
    launchctl bootout "gui/$uid/$label" >/dev/null 2>&1 || true
  fi
  rm -rf "$run_dir"

  # No launchd GUI domain (an SSH session, say), or the job never started:
  # detach with a double fork + setsid instead. From here the acting run
  # inherits this environment, so drop what the daemon injected into it.
  unset KOTYS_HOST KOTYS_PORT
  label="$label.fallback"
  run_dir="$RUNS/$label"
  mkdir "$run_dir"
  perl -e '
    use POSIX qw(setsid);
    my $out = shift @ARGV;
    exit 0 if fork;
    setsid();
    exit 0 if fork;
    open STDIN, "<", "/dev/null";
    open STDOUT, ">>", $out;
    open STDERR, ">&", \*STDOUT;
    exec { $ARGV[0] } @ARGV;
  ' "$OUT" /bin/bash "$SELF" --acting "$src" "$label"
  if await_acting_run "$run_dir"; then
    exit 0
  fi
  rm -rf "$run_dir"
  echo "kotys-install: the installer failed to start; see $OUT" >&2
  exit 1
}

# ------------------------------------------------------------------ acting run

set_status() {
  if [ -d "$RUN_DIR" ]; then
    printf '%s\n' "$1" >"$RUN_DIR/status.tmp"
    mv -f "$RUN_DIR/status.tmp" "$RUN_DIR/status"
  fi
}

fail() {
  log "error: $1"
  if [ "$PHASE" = checks ]; then
    set_status "failed: $1"
  fi
  exit 1
}

acquire_lock() {
  local holder=""
  for _ in $(seq 1 10); do
    if mkdir "$LOCK" 2>/dev/null; then
      echo $$ >"$LOCK/pid"
      HAVE_LOCK=1
      return 0
    fi
    holder="$(cat "$LOCK/pid" 2>/dev/null || true)"
    if [ -n "$holder" ]; then
      case "$(ps -o args= -p "$holder" 2>/dev/null || true)" in
        *kotys-install*) ;;
        *)
          log "removing stale lock of pid $holder"
          rm -rf "$LOCK"
          continue
          ;;
      esac
    fi
    sleep 0.3
  done
  fail "another install is running (pid ${holder:-unknown}); if none is, remove $LOCK"
}

# Prints why a bundle cannot be installed; prints nothing when it can.
bundle_problem() {
  if [ ! -x "$1/Contents/MacOS/$APP_NAME" ]; then
    echo "no executable Contents/MacOS/$APP_NAME"
  elif [ ! -f "$1/Contents/Resources/app.asar" ]; then
    echo "no Contents/Resources/app.asar"
  elif ! codesign --verify --deep --strict "$1" >>"$OUT" 2>&1; then
    echo "code signature does not verify (incomplete build, or modified after signing)"
  else
    return 0
  fi
  return 1
}

asar_key() {
  /usr/bin/stat -f '%m:%z' "$1/Contents/Resources/app.asar"
}

check_loop_guard() {
  local prev_key="" prev_ts="" now
  if [ "$FORCE" = 1 ] || [ ! -f "$STATE" ]; then
    return 0
  fi
  read -r prev_key prev_ts <"$STATE" || true
  now="$(date +%s)"
  if [ "$prev_key" = "$(asar_key "$SRC")" ] && is_uint "$prev_ts" &&
    [ $((now - prev_ts)) -lt "$GUARD" ]; then
    fail "loop guard: this build was installed $((now - prev_ts))s ago; refusing to reinstall it (KOTYS_INSTALL_FORCE=1 overrides)"
  fi
}

# Main process and daemon both run the app executable; helpers live elsewhere.
app_pids() {
  ps -axww -o pid=,comm= |
    awk -v exe="$EXE" '{ pid = $1; sub(/^ *[0-9]+ /, ""); if ($0 == exe) print pid }'
}

# The main process runs the executable without arguments; the daemon passes
# its script path.
main_running() {
  ps -axww -o args= | awk -v exe="$EXE" '$0 == exe { found = 1 } END { exit !found }'
}

port_listening() {
  [ -n "$(/usr/sbin/lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null)" ]
}

wait_app_gone() {
  local deadline=$(($(date +%s) + $1))
  while [ -n "$(app_pids)" ]; do
    if [ "$(date +%s)" -ge "$deadline" ]; then
      return 1
    fi
    sleep 0.5
  done
}

# SIGTERM is a graceful quit for Electron (before-quit runs and stops the
# daemon) and, unlike an Apple Event, needs no Automation permission.
stop_app() {
  local pids
  pids="$(app_pids)"
  if [ -z "$pids" ]; then
    log "$APP_NAME is not running"
    return 0
  fi
  log "quitting $APP_NAME (pids $(echo $pids))"
  kill -TERM $pids 2>/dev/null || true
  if wait_app_gone 20; then
    log "$APP_NAME stopped"
    return 0
  fi
  pids="$(app_pids)"
  log "$APP_NAME still running 20s after SIGTERM, sending SIGKILL (pids $(echo $pids))"
  kill -KILL $pids 2>/dev/null || true
  if wait_app_gone 5; then
    log "$APP_NAME stopped"
    return 0
  fi
  return 1
}

# Up means the main process runs and the daemon port is listening, and both
# still hold a moment later. The process alone proves little: when the daemon
# fails to start, the app sits on an error dialog.
wait_app_up() {
  local deadline=$(($(date +%s) + $1))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    if main_running && port_listening; then
      sleep 3
      if main_running && port_listening; then
        return 0
      fi
    fi
    sleep 1
  done
  return 1
}

relaunch() {
  local what="$1" attempt
  for attempt in 1 2; do
    log "relaunching $what (attempt $attempt)"
    open "$DEST" >>"$OUT" 2>&1 || log "open exited nonzero"
    if wait_app_up "$UP_TIMEOUT"; then
      log "$what is up"
      return 0
    fi
    log "$what is not up after ${UP_TIMEOUT}s"
    stop_app || true
    "$LSREGISTER" -f "$DEST" >/dev/null 2>&1 || true
  done
  return 1
}

log_diagnostics() {
  {
    echo "--- relaunch diagnostics $(date '+%Y-%m-%d %H:%M:%S') ---"
    echo "app processes:"
    ps -axww -o pid=,args= | awk -v exe="$EXE" 'index($0, exe)'
    echo "listening on port $PORT:"
    /usr/sbin/lsof -nP -iTCP:"$PORT" -sTCP:LISTEN || true
    codesign -dv "$DEST" || true
  } >>"$LOG" 2>&1
}

# Puts the previous bundle back and brings it up. $1 is "wait" to verify the
# relaunch, or "nowait" when a signal leaves no time for that.
rollback() {
  PHASE=rollback
  log "rolling back to the previous version"
  stop_app || log "rollback: could not stop the new version"
  if [ -d "$OLD" ]; then
    rm -rf "$DEST"
    if ! mv "$OLD" "$DEST"; then
      log "rollback: could not move $OLD back to $DEST; restore it by hand"
      return 1
    fi
    "$LSREGISTER" -f "$DEST" >/dev/null 2>&1 || true
  elif [ -n "$SWAPPED" ]; then
    log "rollback: no previous version to restore (first install); leaving $DEST in place"
    return 1
  fi
  if [ "$1" = nowait ]; then
    open "$DEST" >>"$OUT" 2>&1 || true
    log "rollback: previous version restored and opened"
  elif relaunch "the previous version"; then
    log "rollback complete"
  else
    log "rollback: the previous version did not come up either; open $DEST by hand"
  fi
}

on_signal() {
  SIGNALED="$1"
  log "received SIG$1 during phase '$PHASE'"
  exit "$2"
}

on_exit() {
  local code=$?
  set +e
  trap '' TERM HUP INT
  case "$PHASE" in
    checks)
      # Give the arming run a moment to read the verdict.
      if [ "$code" -ne 0 ]; then
        sleep 1
      fi
      ;;
    stopping)
      # The previous bundle is untouched; bring it back if it went down.
      if [ -z "$(app_pids)" ] && [ -d "$DEST" ]; then
        open "$DEST" >>"$OUT" 2>&1
        log "reopened the untouched previous version"
      fi
      ;;
    swapping | relaunching)
      if [ -n "$SIGNALED" ]; then
        rollback nowait
      else
        rollback wait
      fi
      code=1
      ;;
  esac
  if [ -n "$STAGE" ]; then
    rm -rf "$STAGE"
  fi
  if [ -n "$HAVE_LOCK" ]; then
    rm -rf "$LOCK"
  fi
  rm -rf "$RUN_DIR"
  exit "$code"
}

act() {
  local name problem
  SRC="$1"
  LABEL="$2"
  RUN_DIR="$RUNS/$LABEL"
  PHASE=checks
  STAGE=""
  OLD=""
  HAVE_LOCK=""
  SIGNALED=""
  SWAPPED=""
  mkdir -p "$RUNTIME_DIR"
  trap on_exit EXIT
  trap 'on_signal TERM 143' TERM
  trap 'on_signal HUP 129' HUP
  trap 'on_signal INT 130' INT
  set_status started

  DELAY="${KOTYS_INSTALL_DELAY:-30}"
  DRY="${KOTYS_INSTALL_DRY:-0}"
  GUARD="${KOTYS_INSTALL_GUARD:-600}"
  FORCE="${KOTYS_INSTALL_FORCE:-0}"
  APP_NAME="${KOTYS_INSTALL_APP_NAME:-Kotys}"
  DEST_DIR="${KOTYS_INSTALL_DEST_DIR:-/Applications}"
  PORT="${KOTYS_INSTALL_PORT:-${KOTYS_PORT:-3017}}"
  UP_TIMEOUT="${KOTYS_INSTALL_UP_TIMEOUT:-45}"
  # open(1) hands this environment to the relaunched app: the installer's
  # own settings end here.
  for name in $(compgen -e | grep '^KOTYS_INSTALL_' || true); do
    unset "$name"
  done

  DEST="$DEST_DIR/$APP_NAME.app"
  EXE="$DEST/Contents/MacOS/$APP_NAME"
  STAGE="$DEST_DIR/.$APP_NAME-new.$$"
  OLD="$DEST_DIR/.$APP_NAME-old.$$"

  log "acting run: pid=$$ ppid=$PPID label=$LABEL src=$SRC delay=${DELAY}s dry=$DRY"
  for name in DELAY GUARD PORT UP_TIMEOUT; do
    is_uint "${!name}" || fail "KOTYS_INSTALL_$name must be a whole number, got '${!name}'"
  done
  acquire_lock
  problem="$(bundle_problem "$SRC")" || fail "cannot install $SRC: $problem"
  check_loop_guard

  if [ "$DRY" = 1 ]; then
    set_status "armed: dry run - checks passed for $SRC, nothing will change (log: $LOG)"
  else
    set_status "armed: $APP_NAME quits in ${DELAY}s, then installs $SRC and relaunches (log: $LOG)"
  fi
  PHASE=waiting
  log "checks passed; waiting ${DELAY}s"
  sleep "$DELAY" &
  wait $!

  if [ "$DRY" = 1 ]; then
    log "dry run: would stage $SRC, quit $APP_NAME, swap it into $DEST and relaunch"
    PHASE=done
    exit 0
  fi

  PHASE=staging
  rm -rf "$STAGE"
  ditto "$SRC" "$STAGE" >>"$OUT" 2>&1 || fail "could not copy $SRC to $STAGE"
  problem="$(bundle_problem "$STAGE")" || fail "the staged copy cannot be installed: $problem"
  printf '%s %s\n' "$(asar_key "$STAGE")" "$(date +%s)" >"$STATE"
  log "new bundle staged and verified"

  PHASE=stopping
  stop_app || fail "could not stop $APP_NAME; nothing was replaced"
  if port_listening; then
    log "warning: port $PORT is still in use; the relaunched app will attach to whatever holds it"
  fi

  PHASE=swapping
  if [ -d "$DEST" ]; then
    mv "$DEST" "$OLD"
  fi
  mv "$STAGE" "$DEST"
  SWAPPED=1
  "$LSREGISTER" -f "$DEST" >/dev/null 2>&1 || true
  log "new bundle swapped in"

  PHASE=relaunching
  if relaunch "the new version"; then
    PHASE=done
    rm -rf "$OLD"
    log "install complete"
    exit 0
  fi
  log_diagnostics
  rollback wait
  exit 1
}

SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"

# Never wanted by anything this script starts (see the header).
unset ELECTRON_RUN_AS_NODE

if [ "${1:-}" = --acting ]; then
  if [ $# -ne 3 ]; then
    echo "usage: $0 --acting <src> <label>" >&2
    exit 2
  fi
  act "$2" "$3"
else
  arm "$@"
fi
