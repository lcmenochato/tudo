#!/usr/bin/env bash
# Roda NA VPS — preenche .env de produção (não sobrescreve se já existir)
set -euo pipefail

REMOTE="${REMOTE:-/var/www/tiktokshop}"
ENV_FILE="$REMOTE/.env"

if [ -f "$ENV_FILE" ]; then
  echo ".env já existe em $ENV_FILE — edite manualmente se precisar"
  exit 0
fi

cp "$REMOTE/.env.example" "$ENV_FILE"
chmod 600 "$ENV_FILE"
echo "Criado $ENV_FILE — preencha:"
echo "  PANDAPAY_API_KEY"
echo "  TIKTOK_ACCESS_TOKEN"
echo "  TIKTOK_PIXEL_ID"
echo "  PORT=8092"
echo "  HOST=127.0.0.1"
