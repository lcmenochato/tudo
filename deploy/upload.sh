#!/usr/bin/env bash
# Roda NO SEU MAC — deploy isolado, não mexe nos outros projetos da VPS
set -euo pipefail

VPS="${VPS:-root@80.78.28.126}"
REMOTE="${REMOTE:-/var/www/tiktokshop}"
APP_PORT="${APP_PORT:-8092}"
PM2_NAME="${PM2_NAME:-tiktokshop}"
LOCAL="$(cd "$(dirname "$0")/.." && pwd)"
TAR="/tmp/tiktokshop-deploy.tar.gz"

echo "-> Empacotando ($LOCAL)"
export COPYFILE_DISABLE=1
tar czf "$TAR" -C "$LOCAL" \
  --exclude=.git \
  --exclude=.env \
  --exclude='__pycache__' \
  --exclude='*.pyc' \
  --exclude='*.log' \
  --exclude='._*' \
  --exclude='.DS_Store' \
  .

echo "-> Enviando para $VPS:$REMOTE"
scp "$TAR" "$VPS:/tmp/tiktokshop-deploy.tar.gz"

echo "-> Extraindo + PM2 ($PM2_NAME na porta $APP_PORT)"
ssh "$VPS" bash -s <<EOF
set -euo pipefail
mkdir -p "$REMOTE"
tar xzf /tmp/tiktokshop-deploy.tar.gz -C "$REMOTE"
cd "$REMOTE"

if [ ! -f .env ]; then
  cp .env.example .env
  echo "AVISO: .env criado a partir do exemplo — rode deploy/push-env.sh ou edite em $REMOTE/.env"
fi
grep -q '^PORT=' .env || echo "PORT=$APP_PORT" >> .env
grep -q '^HOST=' .env || echo 'HOST=127.0.0.1' >> .env
chmod 600 .env

pm2 delete "$PM2_NAME" 2>/dev/null || true
PORT=$APP_PORT HOST=127.0.0.1 pm2 start server.py \
  --name "$PM2_NAME" \
  --interpreter python3 \
  --cwd "$REMOTE"
pm2 save
pm2 status "$PM2_NAME"
ss -tlnp | grep ":$APP_PORT" || true
EOF

echo ""
echo "OK — app rodando em 127.0.0.1:$APP_PORT (só PM2 '$PM2_NAME' foi reiniciado)"
echo "Próximo passo (1x): bash deploy/setup-nginx.sh SEU_DOMINIO.com"
