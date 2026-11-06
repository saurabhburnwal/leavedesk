#!/usr/bin/env bash
# One-command launcher for Linux / macOS: checks Node, installs dependencies, builds the UI and starts the app.
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 22.13+ is required. Install it from https://nodejs.org (or run: docker compose up --build)"
  exit 1
fi
if ! node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)"; then
  echo "Node.js 22.13+ is required (found $(node -v)). Update Node or run: docker compose up --build"
  exit 1
fi

if [ ! -d node_modules ] || [ ! -d client/node_modules ]; then
  echo "Installing dependencies (first run only)..."
  npm install --no-audit --no-fund
fi

npm start
