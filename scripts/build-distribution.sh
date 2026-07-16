#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

OUT_DIR="${1:-dist-package}"
mkdir -p "$OUT_DIR"

npm run check
npm pack --pack-destination "$OUT_DIR"

if command -v zip >/dev/null 2>&1; then
  (
    cd skill/build-animated-system-maps
    zip -q -r "$ROOT/$OUT_DIR/build-animated-system-maps-skill.zip" .
  )
else
  echo "zip is not installed; npm package was created, skill ZIP was skipped." >&2
fi
