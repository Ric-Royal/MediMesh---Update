#!/usr/bin/env sh
set -eu
. "$(dirname "$0")/_common.sh"

BACKUP=${1:-}
OUTPUT_DIR=${2:-}
CONFIRM=${3:-}
[ -n "$BACKUP" ] && [ -n "$OUTPUT_DIR" ] || {
  echo "Usage: $0 backups/name.tar.age /empty/restore-directory --confirm-extract" >&2
  exit 2
}
[ "$CONFIRM" = "--confirm-extract" ] || {
  echo "Pass --confirm-extract after selecting an empty protected output directory." >&2
  exit 2
}
case "$BACKUP" in /*) ;; *) BACKUP="$DEPLOY_DIR/$BACKUP" ;; esac
[ -d "$OUTPUT_DIR" ] || { echo "Restore directory does not exist." >&2; exit 2; }
[ -z "$(find "$OUTPUT_DIR" -mindepth 1 -maxdepth 1 -print -quit)" ] || {
  echo "Restore directory must be empty." >&2
  exit 2
}

"$SCRIPT_DIR/verify-backup.sh" "$BACKUP"

RESTORE_DIR=$(mktemp -d "$BACKUP_WORK_ROOT/medimesh-restore.XXXXXX")
trap 'rm -rf "$RESTORE_DIR"' EXIT INT TERM
umask 077
age -d -i "$BACKUP_AGE_IDENTITY_FILE" -o "$RESTORE_DIR/bundle.tar" "$BACKUP"
tar -xf "$RESTORE_DIR/bundle.tar" -C "$RESTORE_DIR"
(cd "$RESTORE_DIR" && sha256sum -c manifest.sha256)
tar -xf "$RESTORE_DIR/payload.tar" -C "$OUTPUT_DIR"

echo "Verified provider export extracted. Restore it through the approved database and object-storage runbooks."
