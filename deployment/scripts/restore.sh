#!/usr/bin/env sh
set -eu
. "$(dirname "$0")/_common.sh"

BACKUP=${1:-}
CONFIRM=${2:-}
[ -n "$BACKUP" ] || { echo "Usage: $0 backups/medimesh-*.tar.enc --confirm-destroy-current-data" >&2; exit 2; }
[ "$CONFIRM" = "--confirm-destroy-current-data" ] || { echo "Restore replaces the current database and object storage. Pass --confirm-destroy-current-data." >&2; exit 2; }
case "$BACKUP" in /*) ;; *) BACKUP="$DEPLOY_DIR/$BACKUP" ;; esac
"$SCRIPT_DIR/verify-backup.sh" "$BACKUP"

RESTORE_DIR="$DEPLOY_DIR/restore-work/restore-$$"
mkdir -p "$RESTORE_DIR"
trap 'rm -rf "$RESTORE_DIR"' EXIT INT TERM
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 \
  -in "$BACKUP" -out "$RESTORE_DIR/archive.tar" -pass file:"$DEPLOY_DIR/secrets/backup_passphrase"
tar -xf "$RESTORE_DIR/archive.tar" -C "$RESTORE_DIR"

compose stop patient-api web-app
compose cp "$RESTORE_DIR/database.dump" postgres:/tmp/medimesh-restore.dump
compose exec -T postgres sh -c 'PGPASSWORD=$(cat /run/secrets/postgres_password) pg_restore -U medimesh -d medimesh --clean --if-exists --no-owner --no-acl /tmp/medimesh-restore.dump'

PROJECT_NAME=${COMPOSE_PROJECT_NAME:-medimesh-clinic}
docker run --rm \
  -v "${PROJECT_NAME}_minio_data:/target" \
  -v "$RESTORE_DIR:/restore:ro" \
  "$BACKUP_HELPER_IMAGE" \
  sh -c 'find /target -mindepth 1 -maxdepth 1 -exec rm -rf {} + && tar -xzf /restore/minio-data.tar.gz -C /target'

compose up -d patient-api web-app
"$SCRIPT_DIR/healthcheck.sh"
echo "Restore completed and the application passed its health check."
