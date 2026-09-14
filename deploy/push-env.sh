#!/usr/bin/env bash
# Envia .env local para a VPS (não vai no tarball por segurança)
set -euo pipefail

VPS="${VPS:-root@80.78.28.126}"
REMOTE="${REMOTE:-/var/www/tiktokshop}"
LOCAL="$(cd "$(dirname "$0")/.." && pwd)"

if [ ! -f "$LOCAL/.env" ]; then
  echo "Arquivo $LOCAL/.env não encontrado"
  exit 1
fi

scp "$LOCAL/.env" "$VPS:$REMOTE/.env"
ssh "$VPS" "chmod 600 $REMOTE/.env && pm2 restart tiktokshop 2>/dev/null || true"
echo "OK — .env enviado e app reiniciado"
