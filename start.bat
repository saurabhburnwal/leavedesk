@echo off
REM One-command launcher for Windows: checks Node, installs dependencies, builds the UI and starts the app.
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22.13+ is required. Install it from https://nodejs.org ^(or run: docker compose up --build^)
  pause
  exit /b 1
)
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)"
if errorlevel 1 (
  echo Node.js 22.13+ is required. Please update Node or run: docker compose up --build
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies ^(first run only^)...
  call npm install --no-audit --no-fund
)
if not exist client\node_modules (
  call npm install --prefix client --no-audit --no-fund
)

call npm start
