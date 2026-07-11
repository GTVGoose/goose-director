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
PIN=$(python3 -c "import json;print(json.load(open('goose.config.json')).get('voicePin',''))" 2>/dev/null || echo "")
if [ -z "$PIN" ] || [ "$PIN" = "1234" ]; then
  echo "✗ voicePin in goose.config.json is unset or still the factory '1234'."
  echo "  The mobile + voice APIs FAIL CLOSED until you set a real PIN (any 4-8 digits you'll remember)."
  echo "  Edit goose.config.json → \"voicePin\": \"<your pin>\"  then relaunch Nexus and re-run this."
  exit 1
fi
echo "✓ voicePin is set (non-default)"

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
