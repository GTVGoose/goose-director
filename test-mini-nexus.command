#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# test-mini-nexus.command — one double-click to run the Mini Nexus for testing.
#
# Does the whole dance so you don't juggle terminals:
#   1. cd into this repo (wherever it lives) and, if the tree is clean, pull the
#      latest of this branch so you get the newest build.
#   2. Resolve the dev port from your Nexus .env (NEXUS_PORT, else 3001).
#   3. Make sure a non-default NEXUS_MOBILE_PIN is set — prompt for one if not.
#   4. Find the Tailscale CLI, and `tailscale serve` the port over tailnet HTTPS.
#   5. npm install (quick if cached) + npm run build (bundles the /m PWA).
#   6. Free the port if something's already on it, then run the server here in
#      the foreground. Leave this window open while you test; Ctrl+C stops it.
#
# The phone URL is printed in a banner before the server starts.
# Undo Tailscale exposure any time with:  tailscale serve reset
# ─────────────────────────────────────────────────────────────────────────────
cd "$(dirname "$0")" || { echo "Can't find the repo folder."; exit 1; }
REPO="$(pwd)"
BRANCH="claude/android-nexus-telegram-integration-70fsfl"
NEXUS_ENV="$HOME/Library/Application Support/Nexus/.env"

echo "── Mini Nexus test launcher ──"
echo "  repo: $REPO"

# ── 1. Pull latest, but ONLY if nothing is uncommitted (never clobber edits) ──
if git rev-parse --git-dir >/dev/null 2>&1; then
  CUR="$(git branch --show-current 2>/dev/null)"
  if [ "$CUR" != "$BRANCH" ]; then
    echo "  ⚠ You're on '$CUR', not the Mini Nexus branch."
    echo "    Switch with:  git stash && git checkout $BRANCH"
    echo "    (stash is reversible: git stash pop). Continuing on '$CUR' for now."
  elif git diff --quiet && git diff --cached --quiet; then
    echo "  Pulling latest of $BRANCH…"
    git pull --ff-only origin "$BRANCH" 2>/dev/null && echo "  ✓ up to date" || echo "  (couldn't fast-forward — continuing with what you have)"
  else
    echo "  (local edits present — skipping pull so nothing is overwritten)"
  fi
fi

# ── 2. Resolve the port the server will bind (matches how node reads .env) ──
PORT="${NEXUS_PORT:-}"
for f in "$NEXUS_ENV" "$REPO/.env"; do
  if [ -z "$PORT" ] && [ -f "$f" ]; then
    PORT="$(grep -E '^NEXUS_PORT=' "$f" | tail -1 | cut -d= -f2- | tr -d ' ')"
  fi
done
PORT="${PORT:-3001}"
export NEXUS_PORT="$PORT"
echo "  port: $PORT"

# ── 3. Mobile PIN present and non-default? (server fails closed otherwise) ──
PIN=""
[ -f "$NEXUS_ENV" ] && PIN="$(grep -E '^NEXUS_MOBILE_PIN=' "$NEXUS_ENV" | tail -1 | cut -d= -f2- | tr -d ' ')"
if { [ -z "$PIN" ] || [ "$PIN" = "1234" ]; } && [ -f goose.config.json ]; then
  LEGACY="$(python3 -c "import json;print(json.load(open('goose.config.json')).get('voicePin',''))" 2>/dev/null)"
  if [ -n "$LEGACY" ] && [ "$LEGACY" != "1234" ]; then PIN="$LEGACY"; fi
fi
if [ -z "$PIN" ] || [ "$PIN" = "1234" ]; then
  echo ""
  echo "  No mobile PIN set yet — this is what the phone app asks for."
  printf "  Choose a PIN (4-8 digits/letters, not 1234): "
  read -r NEWPIN
  if [ -z "$NEWPIN" ] || [ "$NEWPIN" = "1234" ]; then
    echo "  ✗ Need a non-default PIN. Re-run when ready."; exit 1
  fi
  mkdir -p "$(dirname "$NEXUS_ENV")"
  echo "NEXUS_MOBILE_PIN=$NEWPIN" >> "$NEXUS_ENV"
  PIN="$NEWPIN"
  echo "  ✓ Saved to $NEXUS_ENV"
fi
echo "  ✓ mobile PIN is set"

# ── 4. Tailscale serve (tailnet-only HTTPS in front of the port) ──
TS=""
for cand in tailscale /Applications/Tailscale.app/Contents/MacOS/Tailscale /opt/homebrew/bin/tailscale /usr/local/bin/tailscale "$HOME/.local/bin/tailscale"; do
  if command -v "$cand" >/dev/null 2>&1 || [ -x "$cand" ]; then TS="$cand"; break; fi
done
HOST=""
if [ -z "$TS" ]; then
  echo "  ⚠ Tailscale CLI not found — the server will still run locally, but the"
  echo "    phone can't reach it until Tailscale is set up. Enable its CLI"
  echo "    (Tailscale menu-bar → 'Install CLI…') or: brew install tailscale"
elif ! "$TS" status >/dev/null 2>&1; then
  echo "  ⚠ Tailscale isn't logged in / connected — open the app and sign in."
else
  if "$TS" serve --bg "$PORT" >/dev/null 2>&1; then
    HOST="$("$TS" status --json 2>/dev/null | python3 -c "import json,sys
try: print(json.load(sys.stdin)['Self']['DNSName'].rstrip('.'))
except Exception: pass" 2>/dev/null)"
    echo "  ✓ tailscale serve → https://${HOST:-<your-mac>.ts.net} (tailnet-only)"
  else
    echo "  ⚠ 'tailscale serve' failed — usually MagicDNS/HTTPS not enabled."
    echo "    Enable both at https://login.tailscale.com/admin/dns then re-run."
  fi
fi

# ── 5. Deps + build the /m PWA bundle ──
echo "  Installing deps + building (first time is the slow one)…"
npm install >/dev/null 2>&1 || { echo "  ✗ npm install failed — run it manually to see why."; exit 1; }
npm run build >/dev/null 2>&1 || { echo "  ✗ build failed — run 'npm run build' to see the error."; exit 1; }
echo "  ✓ built"

# ── 6. Free the port, then run the server here ──
EXIST="$(lsof -ti "tcp:$PORT" 2>/dev/null)"
if [ -n "$EXIST" ]; then
  echo "  Stopping the process already on port $PORT…"
  kill $EXIST 2>/dev/null; sleep 1
fi

cat <<EOF

──────────────────────────────────────────────────────────────
  ON YOUR PHONE (Tailscale VPN ON), open Chrome to:

      https://${HOST:-<your-mac-name>.ts.net}/m

  then Chrome ⋮ menu → "Add to Home screen".  PIN: the one above.
──────────────────────────────────────────────────────────────

  Starting the server now. Keep this window open while you test.
  Press Ctrl+C here to stop.

EOF

exec npm run server
