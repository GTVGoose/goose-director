#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# install-mini-nexus.command — put the Mini Nexus PWA on the phone.
#
# What it does (all reversible):
#   1. Finds the Tailscale CLI (App Store, Homebrew, or standalone) and checks
#      you're logged in — with MagicDNS/HTTPS hints if the cert can't issue.
#   2. Verifies a non-default mobile PIN is set (NEXUS_MOBILE_PIN in the Nexus
#      .env; the APIs fail closed without one). Offers to set it for you.
#   3. Starts `tailscale serve` fronting the Nexus port over tailnet-only HTTPS
#      (auto Let's Encrypt cert, auto-renewed; NOT public — this is not Funnel).
#   4. Prints the install URL + phone steps.
#
# Deliberately NOT `set -e` — this is an interactive setup helper, so each step
# reports its own problem and exits with a clear message instead of dying silent.
# Run again any time; serve config is idempotent. Undo with:  tailscale serve reset
# ─────────────────────────────────────────────────────────────────────────────
cd "$(dirname "$0")" || exit 1

PORT="${NEXUS_PORT:-3001}"

echo "── Mini Nexus setup ──"

# 1. Locate the Tailscale CLI. Different installs put it in different places;
#    the Mac App Store build in particular keeps it sandboxed until you enable
#    the CLI from its menu bar, so a bare `tailscale` often isn't on PATH.
TS=""
for cand in \
  tailscale \
  /Applications/Tailscale.app/Contents/MacOS/Tailscale \
  /opt/homebrew/bin/tailscale \
  /usr/local/bin/tailscale \
  "$HOME/.local/bin/tailscale"
do
  if command -v "$cand" >/dev/null 2>&1 || [ -x "$cand" ]; then TS="$cand"; break; fi
done

if [ -z "$TS" ]; then
  echo "✗ Couldn't find the Tailscale command-line tool."
  echo "  Tailscale may still be installed as an app — but this script needs its CLI."
  echo "  • App Store version: open Tailscale, menu-bar icon → 'Install CLI…', then re-run."
  echo "  • Or install the standalone: https://tailscale.com/download/macos"
  echo "  • Homebrew: brew install tailscale"
  exit 1
fi
echo "✓ Found Tailscale CLI: $TS"

# Logged in / running?
if ! "$TS" status >/dev/null 2>&1; then
  STATUS_ERR="$("$TS" status 2>&1 | head -1)"
  echo "✗ Tailscale isn't ready: ${STATUS_ERR:-not running or not logged in}"
  echo "  Open the Tailscale app, log in, make sure it's connected, then re-run this."
  exit 1
fi
echo "✓ Tailscale is up"

# 2. Non-default PIN? (server refuses mobile requests otherwise)
#    The PIN is a secret → NEXUS_MOBILE_PIN in the Nexus .env, alongside
#    TELEGRAM_BOT_TOKEN / NOTIFY_SECRET — one file, not the many
#    goose.config.json copies. (Legacy config.voicePin still works as a fallback.)
ENV_FILE="$HOME/Library/Application Support/Nexus/.env"
PIN=""
if [ -f "$ENV_FILE" ]; then
  PIN="$(grep -E '^NEXUS_MOBILE_PIN=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d ' ')"
fi
# fall back to a legacy config.voicePin if that's all that's set
if { [ -z "$PIN" ] || [ "$PIN" = "1234" ]; } && [ -f goose.config.json ]; then
  LEGACY="$(python3 -c "import json;print(json.load(open('goose.config.json')).get('voicePin',''))" 2>/dev/null)"
  if [ -n "$LEGACY" ] && [ "$LEGACY" != "1234" ]; then PIN="$LEGACY"; fi
fi
if [ -z "$PIN" ] || [ "$PIN" = "1234" ]; then
  echo "✗ No mobile PIN set (or it's still the factory '1234')."
  echo "  The mobile + voice APIs FAIL CLOSED until you set one. Pick any 4-8 digits."
  printf "  Set one now? Enter a PIN (or press Enter to skip): "
  read -r NEWPIN
  if [ -n "$NEWPIN" ] && [ "$NEWPIN" != "1234" ]; then
    mkdir -p "$(dirname "$ENV_FILE")"
    echo "NEXUS_MOBILE_PIN=$NEWPIN" >> "$ENV_FILE"
    echo "  ✓ Written to: $ENV_FILE"
    echo "  → Relaunch Nexus so it picks up the PIN, then re-run this script."
  else
    echo "  Skipped. Add it yourself with:"
    echo "    echo 'NEXUS_MOBILE_PIN=<your pin>' >> \"$ENV_FILE\""
  fi
  exit 1
fi
echo "✓ Mobile PIN is set (non-default)"

# 3. Serve the Nexus origin over tailnet HTTPS. Proxies to loopback — the
#    server keeps its 127.0.0.1 bind. The server's own remote-access gateway
#    restricts proxied traffic to the mobile surface + PIN, so serving the
#    origin does NOT expose the desktop console APIs.
if ! SERVE_ERR="$("$TS" serve --bg "$PORT" 2>&1)"; then
  echo "✗ 'tailscale serve' failed:"
  echo "  ${SERVE_ERR:-unknown error}"
  echo "  Most common cause: HTTPS certs / MagicDNS aren't enabled for your tailnet."
  echo "  Enable both in the admin console (https://login.tailscale.com/admin/dns),"
  echo "  then re-run. If serve needs elevated rights, try: sudo $TS serve --bg $PORT"
  exit 1
fi

HOST="$("$TS" status --json 2>/dev/null | python3 -c "import json,sys
try:
    print(json.load(sys.stdin)['Self']['DNSName'].rstrip('.'))
except Exception:
    pass" 2>/dev/null)"
if [ -z "$HOST" ]; then
  echo "✓ tailscale serve is running on port $PORT (tailnet-only),"
  echo "  but couldn't auto-read your MagicDNS name. Find it in the Tailscale app"
  echo "  (this Mac's name, ending in .ts.net) and open  https://<that-name>/m  on the phone."
  exit 0
fi
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
