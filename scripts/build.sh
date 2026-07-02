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

if [ "${UPDATE_BASE_URL:-}" ]; then
  python - "$DIST/chrome/manifest.json" "$DIST/firefox/manifest.json" "$UPDATE_BASE_URL" <<'PY'
import json
import sys

chrome_manifest, firefox_manifest, update_base_url = sys.argv[1:]
update_base_url = update_base_url.rstrip("/")

with open(chrome_manifest, "r", encoding="utf-8") as handle:
    chrome = json.load(handle)
chrome["update_url"] = f"{update_base_url}/chrome.xml"
with open(chrome_manifest, "w", encoding="utf-8") as handle:
    json.dump(chrome, handle, indent=2)
    handle.write("\n")

with open(firefox_manifest, "r", encoding="utf-8") as handle:
    firefox = json.load(handle)
firefox.setdefault("browser_specific_settings", {}).setdefault("gecko", {})[
    "update_url"
] = f"{update_base_url}/firefox.json"
with open(firefox_manifest, "w", encoding="utf-8") as handle:
    json.dump(firefox, handle, indent=2)
    handle.write("\n")
PY
fi

printf 'Built:\n  %s\n  %s\n' "$DIST/chrome" "$DIST/firefox"
