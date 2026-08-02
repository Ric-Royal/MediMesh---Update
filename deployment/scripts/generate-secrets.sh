#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
DEPLOY_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
SECRET_DIR="$DEPLOY_DIR/secrets"
mkdir -p "$SECRET_DIR"
umask 077

write_if_missing() {
  target="$SECRET_DIR/$1"
  value="$2"
  if [ ! -s "$target" ]; then
    printf '%s' "$value" > "$target"
  fi
  chmod 600 "$target"
}

touch_if_missing() {
  target="$SECRET_DIR/$1"
  if [ ! -e "$target" ]; then
    : > "$target"
  fi
  chmod 600 "$target"
}

command -v openssl >/dev/null 2>&1 || {
  echo "OpenSSL is required." >&2
  exit 1
}

write_if_missing jwt_secret "$(openssl rand -base64 48 | tr -d '\n')"
write_if_missing mfa_encryption_key "$(openssl rand -base64 32 | tr -d '\n')"
write_if_missing file_encryption_key "$(openssl rand -base64 32 | tr -d '\n')"
write_if_missing bootstrap_admin_password "Mm1!$(openssl rand -hex 12)"
write_if_missing mpesa_callback_token "$(openssl rand -hex 32)"

# These values must match services provisioned outside this Compose project.
for name in database_url database_ca redis_password minio_app_user minio_app_password; do
  touch_if_missing "$name"
done

for name in mpesa_consumer_key mpesa_consumer_secret mpesa_passkey mpesa_shortcode; do
  touch_if_missing "$name"
done

echo "Application-owned secrets are ready. Populate every external-service secret before installation."
