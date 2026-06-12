#!/usr/bin/env bash
# Deploy na VPS (Nginx servindo /var/www/attivos/public).
# Execute na VPS: bash scripts/deploy-vps.sh
set -euo pipefail

cd /var/www/attivos

git pull origin main
npm install
npm run build

rm -rf /var/www/attivos/public/*
cp -r dist/* /var/www/attivos/public/

systemctl reload nginx

echo "Deploy concluído: $(date -Is)"
