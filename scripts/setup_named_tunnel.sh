#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# setup_named_tunnel.sh — turn the random quick tunnel into a stable
# https://<sub>.<yourdomain> URL via a named Cloudflare tunnel.
#
# Prerequisites (do these once, they need your accounts):
#   1. Free domain:  https://www.name.com/github-students  (or nc.me/landing/github)
#   2. Cloudflare:   https://dash.cloudflare.com  — add the domain (free, no card)
#   3. Login to cloudflared (opens a browser):  cloudflared tunnel login
#
# Then run this script:
#   ./scripts/setup_named_tunnel.sh  myname  dev        # -> https://dfp.myname.dev
#   TUNNEL_NAME=dfp SUB=mydfp DOMAIN=example.dev ./scripts/setup_named_tunnel.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

TUNNEL_NAME="${TUNNEL_NAME:-dfp}"
SUB="${1:-dfp}"
DOMAIN="${2:-}"
PORT="${TUNNEL_PORT:-8100}"

BIN="${CLOUDFLARED_BIN:-$HOME/.local/bin/cloudflared}"
CFG="$HOME/.cloudflared/config.yml"
LOG_DIR="$HOME/.cloudflared"

if ! "$BIN" tunnel list >/dev/null 2>&1; then
  echo "✗ Not logged in. Run:  cloudflared tunnel login"
  echo "  (opens a browser; any Cloudflare account works, free tier is fine)"
  exit 1
fi

if [ -z "$DOMAIN" ]; then
  echo "Usage: $0 [subdomain] [domain]"
  echo "  or set SUB + DOMAIN env vars"
  echo "Example: $0 dfp myname dev   ->  https://dfp.myname.dev"
  exit 1
fi
FQDN="${SUB}.${DOMAIN}"

echo "==> Creating named tunnel '${TUNNEL_NAME}'"
"$BIN" tunnel create "$TUNNEL_NAME" 2>/dev/null || echo "    (tunnel may already exist)"

echo "==> Writing ${CFG}"
mkdir -p "$LOG_DIR"
cat > "$CFG" <<EOF
tunnel: ${TUNNEL_NAME}
credentials-file: $LOG_DIR/$TUNNEL_NAME.json

ingress:
  - hostname: ${FQDN}
    service: http://localhost:${PORT}
  - service: http_status:404
EOF

echo "==> Routing ${FQDN} -> tunnel"
"$BIN" tunnel route dns "$TUNNEL_NAME" "$FQDN" 2>&1 | tail -2 || \
  echo "    ✗ Could not auto-add DNS route. In Cloudflare dashboard, add a CNAME:"
  echo "      ${FQDN}  ->  ${TUNNEL_NAME}.cfargotunnel.com   (Proxied: on)"

echo "==> Starting named tunnel"
"$BIN" tunnel run --config "$CFG" "$TUNNEL_NAME" > "$LOG_DIR/tunnel.log" 2>&1 &
sleep 4

echo ""
echo "── Done ─────────────────────────────────────────────────────────────"
echo "  Stable URL:  https://${FQDN}"
echo "  Health:      https://${FQDN}/health"
echo "  Dashboard:   check your Cloudflare zone for the CNAME route"
echo "──────────────────────────────────────────────────────────────────────"
echo ""
echo "Next: make it survive reboots — run:  sudo ./scripts/install_tunnel_service.sh"