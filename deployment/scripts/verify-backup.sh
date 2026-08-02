#!/usr/bin/env sh
set -eu
. "$(dirname "$0")/_common.sh"

BACKUP=${1:-}
[ -n "$BACKUP" ] || { echo "Usage: $0 backups/name.tar.age" >&2; exit 2; }
case "$BACKUP" in /*) ;; *) BACKUP="$DEPLOY_DIR/$BACKUP" ;; esac

for command in age minisign tar sha256sum mktemp; do
  require_command "$command"
done
require_file "$BACKUP"
require_file "$BACKUP.minisig"
[ -n "${BACKUP_AGE_IDENTITY_FILE:-}" ] || {
  echo "BACKUP_AGE_IDENTITY_FILE is required." >&2
  exit 2
}
require_file "$BACKUP_AGE_IDENTITY_FILE"
[ -n "${BACKUP_MINISIGN_PUBLIC_KEY:-}" ] || {
  echo "BACKUP_MINISIGN_PUBLIC_KEY is required." >&2
  exit 2
}
[ -n "${BACKUP_WORK_ROOT:-}" ] && [ -d "$BACKUP_WORK_ROOT" ] || {
  echo "BACKUP_WORK_ROOT must be an existing encrypted filesystem directory." >&2
  exit 2
}

minisign -Vm "$BACKUP" -x "$BACKUP.minisig" -P "$BACKUP_MINISIGN_PUBLIC_KEY"

VERIFY_DIR=$(mktemp -d "$BACKUP_WORK_ROOT/medimesh-verify.XXXXXX")
trap 'rm -rf "$VERIFY_DIR"' EXIT INT TERM
umask 077

age -d -i "$BACKUP_AGE_IDENTITY_FILE" -o "$VERIFY_DIR/bundle.tar" "$BACKUP"
tar -xf "$VERIFY_DIR/bundle.tar" -C "$VERIFY_DIR"
(cd "$VERIFY_DIR" && sha256sum -c manifest.sha256)
tar -tf "$VERIFY_DIR/payload.tar" >/dev/null

echo "Backup signature, authenticated encryption, manifest, and payload archive are valid."
