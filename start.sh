#!/usr/bin/env bash
# WaBro backend starter — kills any stale process on port 3002, then starts fresh.
set -e

PORT="${PORT:-3002}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/backend"

echo "[WaBro] Freeing port ${PORT}..."
fuser -k "${PORT}/tcp" 2>/dev/null || true
sleep 1

echo "[WaBro] Starting server..."
cd "$DIR"
exec node server.js
