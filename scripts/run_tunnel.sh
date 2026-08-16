#!/bin/bash
# Keep a Cloudflare quick tunnel to the production stack alive.
# Quick-tunnel URL changes on each restart; the current one is printed below.
#
#   ./scripts/run_tunnel.sh          # foreground
#   ./scripts/run_tunnel.sh --bg     # background, logs to /tmp/dfp-tunnel.log

set -euo pipefail

PORT="${TUNNEL_PORT:-8100}"
PROTOCOL="${TUNNEL_PROTOCOL:-http2}"   # http2 is far more stable than quic in WSL

BIN="${CLOUDFLARED_BIN:-$HOME/.local/bin/cloudflared}"
LOG="${TUNNEL_LOG:-/tmp/dfp-tunnel.log}"

if ! command -v "$BIN" >/dev/null 2>&1 && [ ! -x "$BIN" ]; then
  echo "cloudflared not found at $BIN — install from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
  exit 1
fi

start_bg() {
  setsid nohup "$BIN" tunnel --url "http://localhost:${PORT}" --protocol "$PROTOCOL" --no-autoupdate \
    > "$LOG" 2>&1 < /dev/null &
  disown
  echo "tunnel starting on :${PORT} (${PROTOCOL}) — log: $LOG"
  for i in $(seq 1 30); do
    sleep 1
    URL=$(grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" "$LOG" 2>/dev/null | head -1 || true)
    [ -n "$URL" ] && echo "LIVE URL: $URL" && return 0
  done
  echo "no URL yet — check $LOG"
  return 1
}

case "${1:-}" in
  --bg) start_bg ;;
  *) exec "$BIN" tunnel --url "http://localhost:${PORT}" --protocol "$PROTOCOL" --no-autoupdate ;;
esac