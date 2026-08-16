#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy_vps.sh — bootstrap a fresh Oracle Cloud Always Free instance (or any
# Ubuntu 22.04/24.04 VM) to run the Distributed File Processing System.
#
# Run as root (or with sudo) on a brand-new instance:
#
#   sudo bash scripts/deploy_vps.sh
#
# What it does:
#   1. Installs Docker Engine + Compose v2 (official repos)
#   2. Clones the repo
#   3. Creates .env.production with random secrets (edit ALLOWED_ORIGINS after)
#   4. `make prod-up` — builds and starts the hardened production stack
#   5. Prints the API key + health check
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

GIT_URL="${GIT_URL:-https://github.com/Shahriarin2garden/distributed-file-processor.git}"
APP_DIR="${APP_DIR:-/opt/dfp}"
DOMAIN="${DOMAIN:-your-app-domain.example.com}"

echo "==> [1/5] Installing Docker Engine + Compose v2"

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg >/dev/null

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

. /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" > /etc/apt/sources.list.d/docker.list

apt-get update -qq
apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin >/dev/null
systemctl enable --now docker >/dev/null 2>&1

echo "==> [2/5] Cloning repository into ${APP_DIR}"

mkdir -p "${APP_DIR}"
git clone --depth 1 "${GIT_URL}" "${APP_DIR}" 2>/dev/null || (cd "${APP_DIR}" && git pull)

cd "${APP_DIR}"

echo "==> [3/5] Generating .env.production"

if [ ! -f .env.production ]; then
  cp .env.production.example .env.production
  sed -i "s|^API_KEY_SECRET=.*|API_KEY_SECRET=$(openssl rand -hex 32)|" .env.production
  sed -i "s|^REDIS_PASSWORD=.*|REDIS_PASSWORD=$(openssl rand -hex 16)|" .env.production
  sed -i "s|^ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=https://${DOMAIN}|" .env.production
  echo "    .env.production created with random secrets"
else
  echo "    .env.production already exists — leaving it untouched"
fi

echo "==> [4/5] Building + starting production stack (this pulls ~4 GB)"

docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build

echo "==> [5/5] Verifying health"

sleep 10
curl -fsS http://localhost:8000/health && echo || echo "    WARNING: health check not ready yet — check: docker compose --env-file .env.production -f docker-compose.prod.yml logs api"

API_KEY="$(grep '^API_KEY_SECRET=' .env.production | cut -d= -f2)"
echo ""
echo "── Done ─────────────────────────────────────────────────────────────"
echo "  Health:   http://localhost:8000/health"
echo "  API key:  ${API_KEY}"
echo "  Next:     point a reverse proxy (Caddy) at :8000 and set"
echo "            ALLOWED_ORIGINS to your real domain, then edit .env.production"
echo "            and run: docker compose --env-file .env.production -f docker-compose.prod.yml up -d"
echo "  Caddy:    see DEPLOYMENT.md §4 for a TLS example"
echo "──────────────────────────────────────────────────────────────────────"