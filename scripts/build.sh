#!/usr/bin/env sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
DIST="$ROOT/dist"

rm -rf "$DIST"
mkdir -p "$DIST/chrome" "$DIST/firefox"

copy_common() {
  target="$1"
  mkdir -p "$target/src"
  cp -R "$ROOT/src/." "$target/src/"
  cp -R "$ROOT/icons" "$target/icons"
  cp "$ROOT/README.md" "$target/README.md"
}

copy_common "$DIST/chrome"
cp "$ROOT/manifest.chrome.json" "$DIST/chrome/manifest.json"

copy_common "$DIST/firefox"
cp "$ROOT/manifest.firefox.json" "$DIST/firefox/manifest.json"

printf 'Built:\n  %s\n  %s\n' "$DIST/chrome" "$DIST/firefox"
