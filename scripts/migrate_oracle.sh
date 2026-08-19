#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# migrate_oracle.sh — bootstrap the Distributed File Processing System on a
# fresh Oracle Cloud Always Free instance (Ampere A1, Ubuntu 22.04/24.04 ARM),
# taking over the Cloudflare named tunnel + production stack from the laptop.
#
# Run as root on the new VM:
#   sudo bash scripts/migrate_oracle.sh /home/ubuntu/dfp-oracle-bundle.tar.gz
#
# The bundle is produced by scripts/prepare_oracle_bundle.sh on the laptop
# (contains .env.production + the Cloudflare tunnel credentials). It is
# extracted into /opt/dfp, so the VM serves the SAME domain, API key, and
# Redis password as before — no DNS changes, no client-side key updates.
#
# After the VM is healthy you may stop the stack + tunnel on the laptop:
#   docker compose --env-file .env.production -f docker-compose.prod.yml down
#   systemctl --user stop dfp-tunnel.service dfp-prod.service
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

BUNDLE="${1:-/home/ubuntu/dfp-oracle-bundle.tar.gz}"
GIT_URL="${GIT_URL:-https://github.com/Shahriarin2garden/distributed-file-processor.git}"
APP_DIR="${APP_DIR:-/opt/dfp}"
TUNNEL_USER="${TUNNEL_USER:-root}"
CFG_DIR="${CFG_DIR:-/root/.cloudflared}"

[ -f "$BUNDLE" ] || { echo "✗ Bundle not found: $BUNDLE"; exit 1; }

echo "==> [1/6] Installing Docker Engine + Compose v2"

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

echo "==> [2/6] Installing cloudflared (named tunnel client)"

TMPD="$(mktemp -d)"
ARCH="$(dpkg --print-architecture)"
case "$ARCH" in
  amd64) CLOUD_ARCH="amd64" ;;
  arm64) CLOUD_ARCH="arm64" ;;
  *)     echo "✗ Unsupported arch: $ARCH"; exit 1 ;;
esac
curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${CLOUD_ARCH}.deb" -o "$TMPD/cloudflared.deb"
dpkg -i "$TMPD/cloudflared.deb" >/dev/null
rm -rf "$TMPD"

echo "==> [3/6] Cloning repository into ${APP_DIR}"

mkdir -p "${APP_DIR}"
git clone --depth 1 "${GIT_URL}" "${APP_DIR}" 2>/dev/null || (cd "${APP_DIR}" && git pull)

echo "==> [4/6] Restoring secrets + tunnel credentials from bundle"

mkdir -p "$CFG_DIR"
tar -xzf "$BUNDLE" -C /tmp
cp /tmp/secrets/.env.production "${APP_DIR}/.env.production"
TUNNEL_ID="$(cat /tmp/cloudflared/tunnel-id)"
cp "/tmp/cloudflared/${TUNNEL_ID}.json" "$CFG_DIR/${TUNNEL_ID}.json"
chmod 600 "$CFG_DIR/${TUNNEL_ID}.json"

# Ingress port must match API_PORT in .env.production (default 8000).
API_PORT="$(grep -E '^API_PORT=' "${APP_DIR}/.env.production" | cut -d= -f2)"
API_PORT="${API_PORT:-8000}"

cat > "$CFG_DIR/config.yml" <<EOF
tunnel: ${TUNNEL_ID}
credentials-file: ${CFG_DIR}/${TUNNEL_ID}.json
protocol: http2

ingress:
  - hostname: dfp.dfpsh.me
    service: http://localhost:${API_PORT}
  - service: http_status:404
EOF

echo "    tunnel: ${TUNNEL_ID}  ->  dfp.dfpsh.me (port ${API_PORT})"

echo "==> [5/6] Building + starting production stack (pulls ~4 GB)"

cd "${APP_DIR}"
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build

echo "==> [6/6] Installing tunnel as a system service"

if [ "$TUNNEL_USER" = "root" ]; then
  EXEC_USER=""
  RUN_AS_PREFIX=""
else
  EXEC_USER="User=${TUNNEL_USER}"
  RUN_AS_PREFIX="sudo -u ${TUNNEL_USER} "
fi

cat > /etc/systemd/system/dfp-tunnel.service <<EOF
[Unit]
Description=DFP Cloudflare named tunnel (dfp.dfpsh.me)
After=network-online.target docker.service
Wants=network-online.target
Requires=docker.service

[Service]
${EXEC_USER}
ExecStart=/usr/local/bin/cloudflared tunnel --config ${CFG_DIR}/config.yml run ${TUNNEL_ID}
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable dfp-tunnel.service >/dev/null 2>&1
systemctl start dfp-tunnel.service

echo "==> Verifying health (local)"

sleep 12
curl -fsS "http://localhost:${API_PORT}/health" && echo || \
  echo "    WARNING: not ready yet — check: docker compose --env-file .env.production -f docker-compose.prod.yml logs api"

echo ""
echo "── Done ─────────────────────────────────────────────────────────────"
echo "  Stack:   docker compose --env-file ${APP_DIR}/.env.production -f ${APP_DIR}/docker-compose.prod.yml ps"
echo "  Tunnel:  systemctl status dfp-tunnel.service"
echo "  Public:  https://dfp.dfpsh.me/health"
echo "  NOTE:    stop the laptop's stack + tunnel to make the VM the only origin:"
echo "             docker compose --env-file .env.production -f docker-compose.prod.yml down"
echo "             systemctl --user stop dfp-tunnel.service dfp-prod.service"
echo "──────────────────────────────────────────────────────────────────────"