#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <input-document> <outdir> [additional compose options]" >&2
  exit 2
fi

INPUT_DOCUMENT="$1"
OUT_DIR="$2"
shift 2

if [[ ! -f dist/src/cli.js ]]; then
  npm run build
fi

node dist/src/cli.js compose \
  --input "$INPUT_DOCUMENT" \
  --outdir "$OUT_DIR" \
  "$@"
