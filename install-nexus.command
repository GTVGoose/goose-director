#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Nexus — Build & Install
# Double-click this file in Finder to build and install Nexus on your Mac.
# Requires: Node.js (already installed), internet for first build only.
# ─────────────────────────────────────────────────────────────────────────────

set -e
cd "$(dirname "$0")"

# ── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; AMBER='\033[0;33m'
BLUE='\033[0;34m'; RESET='\033[0m'; BOLD='\033[1m'

log()  { echo -e "${BOLD}▸ $1${RESET}"; }
ok()   { echo -e "${GREEN}✓ $1${RESET}"; }
warn() { echo -e "${AMBER}⚠ $1${RESET}"; }
fail() { echo -e "${RED}✗ $1${RESET}"; exit 1; }

echo ""
echo -e "${BOLD}  NEXUS — Goose Director Console${RESET}"
echo -e "  Build + Install Script"
echo "  ─────────────────────────────────"
echo ""

# ── Step 1: Node check ────────────────────────────────────────────────────────
log "Checking Node.js..."
if ! command -v node &>/dev/null; then
  fail "Node.js not found. Install from https://nodejs.org (LTS) and re-run."
fi
ok "Node $(node --version) found"

# ── Step 2: Install / update deps ─────────────────────────────────────────────
log "Installing dependencies..."
npm install --silent
ok "Dependencies ready"

# ── Step 3: Build Vite (React → dist/) ────────────────────────────────────────
log "Building frontend..."
npm run build
ok "Frontend built → dist/"

# ── Step 4: Package Electron app ──────────────────────────────────────────────
log "Packaging Nexus.app (this takes ~30s)..."
npx electron-builder --mac --dir 2>&1 | grep -v "^\s*$" | tail -20
ok "App packaged"

# ── Step 5: Move to /Applications ─────────────────────────────────────────────
log "Installing to /Applications..."
# Quit any running Nexus instance first
pkill -f "Nexus" 2>/dev/null || true
sleep 1

APP_SRC=""
# electron-builder --dir outputs to dist-app/mac-arm64/Nexus.app (arm64)
# or dist-app/mac/Nexus.app (intel) or dist-app/mac-universal/...
for p in "dist-app/mac-arm64/Nexus.app" "dist-app/mac/Nexus.app" "dist-app/mac-universal/Nexus.app"; do
  [ -d "$p" ] && APP_SRC="$p" && break
done

if [ -z "$APP_SRC" ]; then
  fail "Could not find Nexus.app in dist-app/. Check build output above."
fi

# Remove old version if present
[ -d "/Applications/Nexus.app" ] && rm -rf "/Applications/Nexus.app"
cp -R "$APP_SRC" "/Applications/Nexus.app"
ok "Nexus.app installed to /Applications"

# ── Step 6: Ollama setup ──────────────────────────────────────────────────────
echo ""
log "Checking Ollama (local AI)..."

if command -v ollama &>/dev/null; then
  ok "Ollama is already installed ($(ollama --version 2>/dev/null | head -1))"
else
  warn "Ollama not found — opening download page..."
  open "https://ollama.com/download/mac"
  echo ""
  echo -e "  ${AMBER}Install Ollama from the page that just opened, then re-run this script${RESET}"
  echo -e "  ${AMBER}to pull the llama3.1:8b model.${RESET}"
  echo ""
  echo "  After installing Ollama, run this in your terminal:"
  echo "    ollama pull llama3.1:8b"
  echo ""
fi

if command -v ollama &>/dev/null; then
  log "Pulling llama3.1:8b (4.7 GB — may take a few minutes on first run)..."
  ollama pull llama3.1:8b
  ok "llama3.1:8b ready"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}  ✓ Nexus is installed.${RESET}"
echo ""
echo -e "  ${BOLD}To open:${RESET} Double-click Nexus.app in /Applications"
echo -e "  ${BOLD}Tray:${RESET}    Look for ⬡ in your menu bar while Nexus is running"
echo -e "  ${BOLD}To quit:${RESET} Click ⬡ → Quit Nexus (closing the window hides to tray)"
echo ""

# Offer to open Nexus now
read -p "  Open Nexus now? [y/N] " OPEN_NOW
if [[ "$OPEN_NOW" =~ ^[Yy]$ ]]; then
  open /Applications/Nexus.app
fi
