#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

OUT_DIR="outputs/visual-regression"
FORMATS="svg,png,excalidraw"
for argument in "$@"; do
  case "$argument" in
    --include-gif) FORMATS="svg,png,gif,excalidraw" ;;
    --outdir=*) OUT_DIR="${argument#*=}" ;;
    *) echo "Unknown argument: $argument" >&2; exit 2 ;;
  esac
done

npm run build
for layout in layered lanes radial; do
  node dist/src/cli.js render \
    --spec examples/intelligent-collaboration.json \
    --outdir "$OUT_DIR" \
    --basename "intelligent-collaboration-$layout" \
    --layout "$layout" \
    --formats "$FORMATS" \
    --verify
done
