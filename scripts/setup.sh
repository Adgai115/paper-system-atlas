#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js was not found. Install Node.js 20 or newer." >&2
  exit 1
fi

npm ci
npm run build
node dist/src/cli.js doctor
