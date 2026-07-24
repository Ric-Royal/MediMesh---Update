#!/usr/bin/env sh
set -eu
. "$(dirname "$0")/_common.sh"

SOURCE_DIR=${1:-}
BACKUP_NAME=${2:-}
[ -n "$SOURCE_DIR" ] && [ -d "$SOURCE_DIR" ] || {
  echo "Usage: $0 /path/to/provider-export backup-name" >&2
  exit 2
}
case "$BACKUP_NAME" in
  ''|*[!0-9A-Za-z._-]*) echo "Backup name must contain only letters, numbers, dot, underscore, or hyphen." >&2; exit 2 ;;
esac

for command in age minisign tar sha256sum mktemp; do
  require_command "$command"
done
[ -n "${BACKUP_AGE_RECIPIENT:-}" ] || { echo "BACKUP_AGE_RECIPIENT is required." >&2; exit 2; }
[ -n "${BACKUP_KEY_VERSION:-}" ] || { echo "BACKUP_KEY_VERSION is required." >&2; exit 2; }
[ -n "${BACKUP_MINISIGN_SECRET_KEY_FILE:-}" ] || {
  echo "BACKUP_MINISIGN_SECRET_KEY_FILE is required." >&2
  exit 2
}
require_file "$BACKUP_MINISIGN_SECRET_KEY_FILE"
[ -n "${BACKUP_WORK_ROOT:-}" ] && [ -d "$BACKUP_WORK_ROOT" ] || {
  echo "BACKUP_WORK_ROOT must be an existing encrypted filesystem directory." >&2
  exit 2
}

OUTPUT_DIR="$DEPLOY_DIR/backups"
OUTPUT="$OUTPUT_DIR/$BACKUP_NAME.tar.age"
mkdir -p "$OUTPUT_DIR"
[ ! -e "$OUTPUT" ] || { echo "Backup already exists: $OUTPUT" >&2; exit 2; }

WORK_DIR=$(mktemp -d "$BACKUP_WORK_ROOT/medimesh-backup.XXXXXX")
trap 'rm -rf "$WORK_DIR"' EXIT INT TERM
umask 077

tar -cf "$WORK_DIR/payload.tar" -C "$SOURCE_DIR" .
(
  cd "$WORK_DIR"
  sha256sum payload.tar > manifest.sha256
  {
    echo "format=medimesh-backup-v2"
    echo "created_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "key_version=$BACKUP_KEY_VERSION"
    echo "source_name=$(basename "$SOURCE_DIR")"
  } > manifest.properties
  tar -cf bundle.tar manifest.properties manifest.sha256 payload.tar
)

age -r "$BACKUP_AGE_RECIPIENT" -o "$OUTPUT" "$WORK_DIR/bundle.tar"
minisign -S \
  -s "$BACKUP_MINISIGN_SECRET_KEY_FILE" \
  -m "$OUTPUT" \
  -x "$OUTPUT.minisig" \
  -t "MediMesh backup; key-version=$BACKUP_KEY_VERSION"

echo "Authenticated, signed backup created: $OUTPUT"
