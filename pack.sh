#!/usr/bin/env bash
# Pack the File by Tag add-on.
# Usage: ./pack.sh 1.2.0
# Sets "version" in manifest.json and writes dist/file-by-tag-<version>.xpi
set -euo pipefail

VERSION="${1:-}"
if [[ ! "$VERSION" =~ ^[0-9]+(\.[0-9]+){0,3}$ ]]; then
  echo "Usage: $0 <version>   (e.g. 1.2.0)" >&2
  exit 1
fi

cd "$(dirname "$0")"
command -v zip >/dev/null || { echo "zip is not installed" >&2; exit 1; }

# Update the version in manifest.json ("manifest_version" is left alone).
sed -i.bak -E 's/("version"[[:space:]]*:[[:space:]]*")[^"]*"/\1'"$VERSION"'"/' manifest.json
rm -f manifest.json.bak
grep -q "\"version\": \"$VERSION\"" manifest.json || { echo "Could not set version in manifest.json" >&2; exit 1; }

mkdir -p dist
OUT="dist/file-by-tag-$VERSION.xpi"
rm -f "$OUT"
zip -qr -X "$OUT" manifest.json background.js icons

echo "Packed $OUT"
unzip -l "$OUT"
