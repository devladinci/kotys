#!/usr/bin/env bash
# Snapshot the live Kotys database with VACUUM INTO (safe while the daemon
# has it open in WAL mode). Verifies the copy with integrity_check and a
# size comparison before reporting success.
set -euo pipefail

DB_PATH="${KOTYS_DB_PATH:-$HOME/Library/Application Support/Kotys/chat.db}"
BACKUP_DIR="$HOME/Library/Application Support/Kotys/backups"
STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="$BACKUP_DIR/chat-$STAMP.db"

mkdir -p "$BACKUP_DIR"

src_size=$(stat -f%z "$DB_PATH")
sqlite3 "$DB_PATH" "VACUUM INTO '$DEST';"

copy_size=$(stat -f%z "$DEST")
if [ "$copy_size" -eq 0 ] || [ "$copy_size" -lt $((src_size / 4)) ]; then
  echo "backup looks truncated ($src_size -> $copy_size); removing $DEST" >&2
  rm -f "$DEST"
  exit 1
fi

result=$(sqlite3 "$DEST" "PRAGMA integrity_check;")
if [ "$result" != "ok" ]; then
  echo "integrity_check failed on $DEST: $result" >&2
  exit 1
fi

# Keep the last 10 snapshots.
ls -t "$BACKUP_DIR"/chat-*.db 2>/dev/null | tail -n +11 | xargs rm -f 2>/dev/null || true

echo "backup ok: $DEST ($copy_size bytes, source $src_size bytes)"