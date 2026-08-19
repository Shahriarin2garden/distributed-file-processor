#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# install_tunnel_service.sh — install a systemd service that starts the
# production stack + named tunnel automatically on boot (WSL2 + systemd).
#
#   sudo ./scripts/install_tunnel_service.sh
#
# Installs:
#   dfp-tunnel.service   -> runs the named Cloudflare tunnel as a service
#   dfp-prod.service     -> docker compose up the production stack on boot
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root:  sudo $0"
  exit 1
fi

REPO="/home/hp/Distributed File Processing System"
USER_HOME="/home/hp"
CLOUDFLARED="$USER_HOME/.local/bin/cloudflared"

[ -f "$USER_HOME/.cloudflared/config.yml" ] || {
  echo "✗ No named-tunnel config at $USER_HOME/.cloudflared/config.yml"
  echo "  Run scripts/setup_named_tunnel.sh first."
  exit 1
}

echo "==> Installing dfp-prod.service"
cat > /etc/systemd/system/dfp-prod.service <<EOF
[Unit]
Description=DFP production stack (docker compose)
After=network-online.target docker.service
Wants=network-online.target
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${REPO}
ExecStart=/usr/bin/docker compose --env-file ${REPO}/.env.production -f ${REPO}/docker-compose.prod.yml up -d
ExecStop=/usr/bin/docker compose --env-file ${REPO}/.env.production -f ${REPO}/docker-compose.prod.yml down
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

echo "==> Installing dfp-tunnel.service"
cat > /etc/systemd/system/dfp-tunnel.service <<EOF
[Unit]
Description=DFP Cloudflare named tunnel
After=network-online.target dfp-prod.service
Wants=network-online.target
Requires=dfp-prod.service

[Service]
User=hp
ExecStart=${CLOUDFLARED} tunnel --config ${USER_HOME}/.cloudflared/config.yml run dfp
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable dfp-prod.service dfp-tunnel.service
echo "==> Starting services"
systemctl start dfp-prod.service
systemctl start dfp-tunnel.service

echo "── Done ─────────────────────────────────────────────────────────────"
echo "  Stack:   systemctl status dfp-prod.service"
echo "  Tunnel:  systemctl status dfp-tunnel.service"
echo "  Logs:    journalctl -u dfp-tunnel.service -f"
echo "──────────────────────────────────────────────────────────────────────"