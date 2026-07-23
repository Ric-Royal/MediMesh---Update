#!/usr/bin/env sh
set -eu
. "$(dirname "$0")/_common.sh"

BACKUP=${1:-}
[ -n "$BACKUP" ] || { echo "Usage: $0 backups/medimesh-*.tar.enc" >&2; exit 2; }
case "$BACKUP" in /*) ;; *) BACKUP="$DEPLOY_DIR/$BACKUP" ;; esac
require_file "$BACKUP"
require_file "$BACKUP.sha256"
require_file "$DEPLOY_DIR/secrets/backup_passphrase"

sha256sum -c "$BACKUP.sha256"
VERIFY_DIR="$DEPLOY_DIR/backups/.verify-$$"
mkdir -p "$VERIFY_DIR"
trap 'rm -rf "$VERIFY_DIR"' EXIT INT TERM

openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 \
  -in "$BACKUP" -out "$VERIFY_DIR/archive.tar" -pass file:"$DEPLOY_DIR/secrets/backup_passphrase"
tar -xf "$VERIFY_DIR/archive.tar" -C "$VERIFY_DIR"
(cd "$VERIFY_DIR" && sha256sum -c manifest.sha256)
docker run --rm -v "$VERIFY_DIR:/verify:ro" "$POSTGRES_IMAGE" pg_restore --list /verify/database.dump >/dev/null
tar -tzf "$VERIFY_DIR/minio-data.tar.gz" >/dev/null

echo "Backup validation passed: encryption, checksums, PostgreSQL catalog and object archive are readable."
