#!/usr/bin/env bash
# Uso na VPS ou CI (Linux/macOS): carrega .env.production e roda o build.
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -f .env.production ]]; then
  echo "Crie .env.production a partir de .env.production.example"
  exit 1
fi
set -a
# shellcheck source=/dev/null
source .env.production
set +a
npm ci
npm run build
echo "Pronto: dist/ — copie ou sirva com Nginx/Docker conforme deploy/README.md"
