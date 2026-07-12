#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# install-mini-nexus.command — put the Mini Nexus PWA on the phone.
#
# What it does (all reversible):
#   1. Checks Tailscale is installed + logged in, with MagicDNS/HTTPS hints.
#   2. Verifies a non-default voicePin is set (mobile APIs fail closed without
#      one — this is the PIN the phone app asks for).
#   3. Starts `tailscale serve` fronting the Nexus port over tailnet-only HTTPS
#      (auto Let's Encrypt cert, auto-renewed; NOT public — this is not Funnel).
#   4. Prints the install URL + phone steps.
#
# Run again any time; serve config is idempotent. Undo with:  tailscale serve reset
# ─────────────────────────────────────────────────────────────────────────────
set -e
cd "$(dirname "$0")"

PORT="${NEXUS_PORT:-3001}"
TS=/Applications/Tailscale.app/Contents/MacOS/Tailscale
command -v tailscale >/dev/null 2>&1 && TS=tailscale

echo "── Mini Nexus setup ──"

# 1. Tailscale present + up?
if ! "$TS" status >/dev/null 2>&1; then
  echo "✗ Tailscale isn't running or you're not logged in."
  echo "  Install/open Tailscale, log in, then re-run this. (install-tailscale.command exists in System Development.)"
  exit 1
fi
echo "✓ Tailscale is up"

# 2. Non-default PIN? (server refuses mobile requests otherwise)
#    The PIN is a secret → it lives in the Nexus .env as NEXUS_MOBILE_PIN,
#    alongside TELEGRAM_BOT_TOKEN / NOTIFY_SECRET — one file, not the many
#    goose.config.json copies. (Legacy config.voicePin still works as a
#    fallback, but .env is the recommended home.)
ENV_FILE="$HOME/Library/Application Support/Nexus/.env"
PIN=""
[ -f "$ENV_FILE" ] && PIN=$(grep -E '^NEXUS_MOBILE_PIN=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d ' ')
# fall back to a legacy config.voicePin if that's all that's set
if { [ -z "$PIN" ] || [ "$PIN" = "1234" ]; } && [ -f goose.config.json ]; then
  LEGACY=$(python3 -c "import json;print(json.load(open('goose.config.json')).get('voicePin',''))" 2>/dev/null || echo "")
  [ -n "$LEGACY" ] && [ "$LEGACY" != "1234" ] && PIN="$LEGACY"
fi
if [ -z "$PIN" ] || [ "$PIN" = "1234" ]; then
  echo "✗ No mobile PIN set (or it's still the factory '1234')."
  echo "  The mobile + voice APIs FAIL CLOSED until you set one. Pick any 4-8 digits, then:"
  echo ""
  echo "    echo 'NEXUS_MOBILE_PIN=<your pin>' >> \"$ENV_FILE\""
  echo ""
  echo "  Relaunch Nexus and re-run this. (This is the same .env that holds your bot token.)"
  read -r -p "  Set one now? Enter a PIN (or press Enter to skip): " NEWPIN
  if [ -n "$NEWPIN" ] && [ "$NEWPIN" != "1234" ]; then
    mkdir -p "$(dirname "$ENV_FILE")"
    echo "NEXUS_MOBILE_PIN=$NEWPIN" >> "$ENV_FILE"
    echo "  ✓ Written to $ENV_FILE — relaunch Nexus for it to take effect, then re-run this."
  fi
  exit 1
fi
echo "✓ Mobile PIN is set (non-default)"

# 3. Serve the Nexus origin over tailnet HTTPS. Proxies to loopback — the
#    server keeps its 127.0.0.1 bind. The server's own remote-access gateway
#    restricts proxied traffic to the mobile surface + PIN, so serving the
#    origin does NOT expose the desktop console APIs.
"$TS" serve --bg "$PORT" >/dev/null
HOST=$("$TS" status --json | python3 -c "import json,sys;print(json.load(sys.stdin)['Self']['DNSName'].rstrip('.'))")
echo "✓ tailscale serve → https://$HOST  (tailnet-only)"

cat <<EOF

── On the phone (one-time) ──
1. Install the Tailscale app, log in to the same tailnet, toggle the VPN ON.
2. Open Chrome at:  https://$HOST/m
   (needs internet the first time — Chrome mints the app package via Google)
3. Chrome menu ⋮ → "Add to Home screen" → Install.
4. Open "Nexus" from the home screen, enter your PIN. Done.

Notes:
- Deep links in Telegram pushes: set mobile.baseUrl in goose.config.json to
  https://$HOST  and relaunch Nexus.
- Optional extra lock: set mobile.tailscaleUser to your tailnet login (shown
  in Tailscale app) — mobile calls then also verify the tailnet identity.
- The Mac must be awake for live use; anything cached still reads offline,
  domain updates queue, and Telegram remains the always-delivered channel.
EOF
