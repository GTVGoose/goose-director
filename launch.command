#!/bin/bash
# Goose Director — launch script
# Double-click this file to start the app.
# First run: installs dependencies (~1 min). After that, opens instantly.

set -e
cd "$(dirname "$0")"

# Check for Node
if ! command -v node &> /dev/null; then
  osascript -e 'display alert "Node.js not found" message "Please install Node.js from nodejs.org (LTS version), then double-click this file again." as critical'
  open "https://nodejs.org"
  exit 1
fi

echo "Node $(node --version) found."

# Install deps if needed
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies (first run only)..."
  npm install
fi

echo "Starting Goose Director..."
npm run electron-dev
