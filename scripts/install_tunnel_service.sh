#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# install_tunnel_service.sh — install systemd services that start the
# production stack + named tunnel automatically on boot (WSL2 + systemd).
#
# Two modes:
#
#   ./scripts/install_tunnel_service.sh        # user services (no sudo) — PREFERRED
#   sudo ./scripts/install_tunnel_service.sh   # system services (root)
#
# User mode installs:
#   ~/.config/systemd/user/dfp-tunnel.service -> named tunnel
#   ~/.config/systemd/user/dfp-prod.service   -> docker compose up the stack
#   loginctl enable-linger                    -> survives reboot, no login needed
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO="/home/hp/Distributed File Processing System"
USER_HOME="/home/hp"
CLOUDFLARED="$USER_HOME/.local/bin/cloudflared"
TUNNEL_ID="08f228cc-496c-425d-9b90-eaf0a330f030"

[ -f "$USER_HOME/.cloudflared/config.yml" ] || {
  echo "✗ No named-tunnel config at $USER_HOME/.cloudflared/config.yml"
  echo "  Run scripts/setup_named_tunnel.sh first."
  exit 1
}

# ── User-level mode (no sudo) ───────────────────────────────────────────────
if [ "$(id -u)" -ne 0 ]; then
  export XDG_RUNTIME_DIR="/run/user/$(id -u)"

  echo "==> Installing user service dfp-prod.service"
  cat > "$USER_HOME/.config/systemd/user/dfp-prod.service" <<EOF
[Unit]
Description=DFP production stack (docker compose)
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${REPO}
ExecStart=/usr/bin/docker compose --env-file ${REPO}/.env.production -f ${REPO}/docker-compose.prod.yml up -d
ExecStop=/usr/bin/docker compose --env-file ${REPO}/.env.production -f ${REPO}/docker-compose.prod.yml down
Restart=on-failure

[Install]
WantedBy=default.target
EOF

  echo "==> Installing user service dfp-tunnel.service"
  cat > "$USER_HOME/.config/systemd/user/dfp-tunnel.service" <<EOF
[Unit]
Description=DFP Cloudflare named tunnel
After=network-online.target dfp-prod.service
Wants=network-online.target

[Service]
ExecStart=${CLOUDFLARED} tunnel --config ${USER_HOME}/.cloudflared/config.yml run ${TUNNEL_ID}
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
EOF

  systemctl --user daemon-reload
  systemctl --user enable dfp-prod.service dfp-tunnel.service
  echo "==> Starting services"
  systemctl --user start dfp-prod.service 2>/dev/null || true
  systemctl --user start dfp-tunnel.service
  echo "==> Enabling linger (services survive reboot without login)"
  loginctl enable-linger "$(id -un)"

  echo "── Done ─────────────────────────────────────────────────────────────"
  echo "  Stack:   systemctl --user status dfp-prod.service"
  echo "  Tunnel:  systemctl --user status dfp-tunnel.service"
  echo "  Logs:    journalctl --user -u dfp-tunnel.service -f"
  echo "──────────────────────────────────────────────────────────────────────"
  exit 0
fi

# ── System-level mode (sudo) ────────────────────────────────────────────────
echo "==> Installing dfp-prod.service (system)"
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

echo "==> Installing dfp-tunnel.service (system)"
cat > /etc/systemd/system/dfp-tunnel.service <<EOF
[Unit]
Description=DFP Cloudflare named tunnel
After=network-online.target dfp-prod.service
Wants=network-online.target
Requires=dfp-prod.service

[Service]
User=hp
ExecStart=${CLOUDFLARED} tunnel --config ${USER_HOME}/.cloudflared/config.yml run ${TUNNEL_ID}
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable dfp-prod.service dfp-tunnel.service
systemctl start dfp-prod.service
systemctl start dfp-tunnel.service

echo "── Done ─────────────────────────────────────────────────────────────"
echo "  Stack:   systemctl status dfp-prod.service"
echo "  Tunnel:  systemctl status dfp-tunnel.service"
echo "  Logs:    journalctl -u dfp-tunnel.service -f"
echo "──────────────────────────────────────────────────────────────────────"