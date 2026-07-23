#!/bin/bash
# Re-sign the ad-hoc Nexus build with SEALED resources, then install.
# Do NOT strip quarantine with `xattr` on an unsigned app — that makes the
# bundle look TAMPERED and upgrades Gatekeeper's verdict to the scary
# "will damage your computer / malware" dialog. A deep ad-hoc re-sign seals
# resources so it reads as a normal "unidentified developer" instead.
# Permanent fix remains Developer-ID signing + notarization (needs Apple acct).
set -euo pipefail
APP="$(cd "$(dirname "$0")" && pwd)/dist-app/mac-arm64/Nexus.app"
[ -d "$APP" ] || { echo "No build at $APP — run: CSC_IDENTITY_AUTO_DISCOVERY=false npm run package"; exit 1; }
osascript -e 'tell application "Nexus" to quit' 2>/dev/null || true; sleep 1; pkill -x Nexus 2>/dev/null || true; sleep 1
codesign --force --deep --sign - "$APP"
codesign --verify --deep --strict "$APP" && echo "✓ sealed + valid"
[ -d /Applications/Nexus.app ] && rm -rf /Applications/Nexus.app
ditto "$APP" /Applications/Nexus.app     # ditto preserves the signature; no xattr strip
echo "✓ installed. First launch: if macOS says 'unidentified developer', right-click Nexus.app → Open."
open /Applications/Nexus.app
