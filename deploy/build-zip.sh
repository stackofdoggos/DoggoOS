#!/bin/bash
# Builds milesOS-deploy.zip for cPanel upload to public_html/OS/
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/deploy/milesOS-deploy.zip"

cd "$ROOT"
rm -f "$OUT"
zip -r "$OUT" \
  index.html \
  style.css \
  script.js \
  notes.js \
  jpokemon.js \
  .htaccess \
  assets \
  jpokemon \
  -x "*.DS_Store" -x "deploy/*" -x "screenshots/*" -x ".git/*"

echo "Created $OUT ($(du -h "$OUT" | cut -f1))"
echo "Upload to cPanel: public_html/OS/ → Extract"
