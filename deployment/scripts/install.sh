#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
DEPLOY_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)

for command in docker openssl curl; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "$command is required." >&2
    exit 1
  }
done
docker compose version >/dev/null

if [ ! -f "$DEPLOY_DIR/.env" ]; then
  cp "$DEPLOY_DIR/.env.example" "$DEPLOY_DIR/.env"
  echo "Created $DEPLOY_DIR/.env. Configure approved endpoints and digest-pinned images, then run again." >&2
  exit 2
fi

"$SCRIPT_DIR/generate-secrets.sh"
. "$SCRIPT_DIR/_common.sh"

case "$DOMAIN" in
  clinic.example.org|'') echo "Set a real DOMAIN in $DEPLOY_DIR/.env" >&2; exit 2 ;;
esac
case "$REDIS_URL" in
  rediss://*) ;;
  *) echo "REDIS_URL must use rediss://" >&2; exit 2 ;;
esac
case "$MINIO_ENDPOINT" in
  https://*) ;;
  *) echo "MINIO_ENDPOINT must use https://" >&2; exit 2 ;;
esac
for image in "$MEDIMESH_API_IMAGE" "$MEDIMESH_WEB_IMAGE" "$CLAMAV_IMAGE"; do
  case "$image" in
    *@sha256:????????????????????????????????????????????????????????????????) ;;
    *) echo "Release images must be pinned by a full sha256 digest." >&2; exit 2 ;;
  esac
done

for secret in \
  database_url database_ca redis_password minio_app_user minio_app_password \
  jwt_secret mfa_encryption_key file_encryption_key bootstrap_admin_password \
  mpesa_callback_token
do
  require_file "$DEPLOY_DIR/secrets/$secret"
  [ -s "$DEPLOY_DIR/secrets/$secret" ] || {
    echo "Populate deployment/secrets/$secret before installation." >&2
    exit 2
  }
done

compose config --quiet
compose pull
compose up -d --remove-orphans
"$SCRIPT_DIR/healthcheck.sh"

echo "Installation complete. Enroll the bootstrap administrator in MFA immediately."
