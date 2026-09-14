#!/usr/bin/env bash
# Roda NO SEU MAC — cria vhost nginx isolado (não altera outros sites)
set -euo pipefail

DOMAIN="${1:-}"
if [ -z "$DOMAIN" ]; then
  echo "Uso: bash deploy/setup-nginx.sh dominio.com"
  exit 1
fi

VPS="${VPS:-root@80.78.28.126}"
APP_PORT="${APP_PORT:-8092}"
CONF_NAME="tiktokshop-${DOMAIN//./-}.conf"
LOCAL_CONF="$(cd "$(dirname "$0")" && pwd)/nginx-site.conf"
REMOTE_CONF="/etc/nginx/sites-available/$CONF_NAME"

sed "s/__DOMAIN__/$DOMAIN/g; s/__PORT__/$APP_PORT/g" "$LOCAL_CONF" > "/tmp/$CONF_NAME"

echo "-> Enviando nginx config ($CONF_NAME)"
scp "/tmp/$CONF_NAME" "$VPS:/tmp/$CONF_NAME"

ssh "$VPS" bash -s <<EOF
set -euo pipefail
mv "/tmp/$CONF_NAME" "$REMOTE_CONF"
ln -sf "$REMOTE_CONF" "/etc/nginx/sites-enabled/$CONF_NAME"
nginx -t
systemctl reload nginx
echo "Nginx OK — proxy $DOMAIN -> 127.0.0.1:$APP_PORT"
EOF

echo ""
echo "SSL (se ainda não tiver certificado):"
echo "  ssh $VPS 'certbot --nginx -d $DOMAIN -d www.$DOMAIN'"
