#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# prepare_oracle_bundle.sh — package secrets + tunnel credentials into a single
# tarball for migrating to an Oracle Cloud Always Free (Ampere A1 ARM) instance.
#
# Run on the CURRENT machine (the laptop running the stack):
#   ./scripts/prepare_oracle_bundle.sh
#
# Produces:  /tmp/dfp-oracle-bundle.tar.gz
# Transfer it to the new VM (run from the laptop, after provisioning):
#   scp -i ~/.ssh/your_key /tmp/dfp-oracle-bundle.tar.gz ubuntu@<vm-ip>:~
#
# The bundle contains ONLY what the VM needs to take over identically:
#   * .env.production          (same API key, Redis password, origins, ports)
#   * tunnel credentials JSON  (lets the VM run the SAME Cloudflare tunnel)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
TUNNEL_ID="08f228cc-496c-425d-9b90-eaf0a330f030"
CFG_DIR="${CLOUDFLARED_DIR:-$HOME/.cloudflared}"

[ -f "$REPO/.env.production" ] || { echo "✗ $REPO/.env.production not found"; exit 1; }
[ -f "$CFG_DIR/$TUNNEL_ID.json" ] || { echo "✗ tunnel credentials missing: $CFG_DIR/$TUNNEL_ID.json"; exit 1; }

STAGE="$(mktemp -d /tmp/dfp-bundle.XXXXXX)"
mkdir -p "$STAGE/secrets" "$STAGE/cloudflared"

cp "$REPO/.env.production" "$STAGE/secrets/.env.production"
cp "$CFG_DIR/$TUNNEL_ID.json" "$STAGE/cloudflared/$TUNNEL_ID.json"
echo "$TUNNEL_ID" > "$STAGE/cloudflared/tunnel-id"

tar -czf /tmp/dfp-oracle-bundle.tar.gz -C "$STAGE" secrets cloudflared
rm -rf "$STAGE"

echo "── Done ─────────────────────────────────────────────────────────────"
echo "  Bundle: /tmp/dfp-oracle-bundle.tar.gz"
echo "  Copy to VM:  scp -i <key> /tmp/dfp-oracle-bundle.tar.gz ubuntu@<vm-ip>:~"
echo "  Then on the VM (as root):  sudo bash scripts/migrate_oracle.sh \\"
echo "                                /home/ubuntu/dfp-oracle-bundle.tar.gz"
echo "──────────────────────────────────────────────────────────────────────"