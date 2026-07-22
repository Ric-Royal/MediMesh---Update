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

require_openssl() {
  command -v openssl >/dev/null 2>&1 || { echo "OpenSSL is required." >&2; exit 1; }
}
require_openssl

POSTGRES_PASSWORD=$(openssl rand -hex 24)
write_if_missing postgres_password "$POSTGRES_PASSWORD"
POSTGRES_PASSWORD=$(cat "$SECRET_DIR/postgres_password")
write_if_missing database_url "postgresql://medimesh:${POSTGRES_PASSWORD}@postgres:5432/medimesh"
write_if_missing redis_password "$(openssl rand -hex 24)"
write_if_missing minio_user "medimesh-storage"
write_if_missing minio_password "$(openssl rand -hex 32)"
write_if_missing jwt_secret "$(openssl rand -base64 48 | tr -d '\n')"
write_if_missing mfa_encryption_key "$(openssl rand -base64 32 | tr -d '\n')"
write_if_missing bootstrap_admin_password "Mm1!$(openssl rand -hex 12)"
write_if_missing mpesa_callback_token "$(openssl rand -hex 32)"
write_if_missing backup_passphrase "$(openssl rand -base64 48 | tr -d '\n')"

for name in mpesa_consumer_key mpesa_consumer_secret mpesa_passkey mpesa_shortcode; do
  target="$SECRET_DIR/$name"
  if [ ! -e "$target" ]; then : > "$target"; fi
  chmod 600 "$target"
done

echo "Secrets are ready in $SECRET_DIR. Store the backup/MFA keys in the approved password vault."
