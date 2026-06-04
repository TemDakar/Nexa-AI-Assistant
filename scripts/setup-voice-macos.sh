#!/usr/bin/env bash
# Обёртка для macOS: делегирует в кроссплатформенный setup-voice.js
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec node "$ROOT/scripts/setup-voice.js"
