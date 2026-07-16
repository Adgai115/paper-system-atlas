#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

OUT_DIR="${1:-outputs}"
BASE_NAME="${2:-intelligent-collaboration}"
FORMATS="${3:-svg,png,jpg,gif,excalidraw}"

if [[ ! -f dist/src/cli.js ]]; then
  npm run build
fi

node dist/src/cli.js render \
  --spec examples/intelligent-collaboration.json \
  --outdir "$OUT_DIR" \
  --basename "$BASE_NAME" \
  --formats "$FORMATS" \
  --verify
