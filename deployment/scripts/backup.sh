#!/usr/bin/env sh
set -eu
. "$(dirname "$0")/_common.sh"

require_command docker
require_command openssl
require_command tar
require_command sha256sum
require_file "$DEPLOY_DIR/secrets/backup_passphrase"

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
WORK_DIR="$DEPLOY_DIR/backups/.work-$STAMP"
ARCHIVE="$DEPLOY_DIR/backups/medimesh-$STAMP.tar"
ENCRYPTED="$ARCHIVE.enc"
mkdir -p "$WORK_DIR"
trap 'rm -rf "$WORK_DIR" "$ARCHIVE"' EXIT INT TERM

compose exec -T postgres sh -c 'PGPASSWORD=$(cat /run/secrets/postgres_password) pg_dump -U medimesh -d medimesh --format=custom --no-owner --no-acl' > "$WORK_DIR/database.dump"

PROJECT_NAME=${COMPOSE_PROJECT_NAME:-medimesh-clinic}
docker run --rm \
  -v "${PROJECT_NAME}_minio_data:/source:ro" \
  -v "$WORK_DIR:/backup" \
  "$BACKUP_HELPER_IMAGE" \
  tar -czf /backup/minio-data.tar.gz -C /source .

cp "$DEPLOY_DIR/.env" "$WORK_DIR/deployment.env"
(cd "$WORK_DIR" && sha256sum database.dump minio-data.tar.gz deployment.env > manifest.sha256)
tar -cf "$ARCHIVE" -C "$WORK_DIR" .
openssl enc -aes-256-cbc -salt -pbkdf2 -iter 600000 \
  -in "$ARCHIVE" -out "$ENCRYPTED" -pass file:"$DEPLOY_DIR/secrets/backup_passphrase"
sha256sum "$ENCRYPTED" > "$ENCRYPTED.sha256"

echo "Encrypted backup created: $ENCRYPTED"
"$SCRIPT_DIR/verify-backup.sh" "$ENCRYPTED"
