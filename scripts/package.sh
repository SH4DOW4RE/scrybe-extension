#!/usr/bin/env sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
PACKAGES="$ROOT/packages"
VERSION=$(python - "$ROOT/manifest.chrome.json" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    print(json.load(handle)["version"])
PY
)

rm -rf "$PACKAGES"
mkdir -p "$PACKAGES"

python - "$ROOT/dist/chrome" "$PACKAGES/scrybe-chrome-$VERSION.zip" <<'PY'
from pathlib import Path
import sys
import zipfile

source = Path(sys.argv[1])
target = Path(sys.argv[2])
with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(source.rglob("*")):
        if path.is_file():
            archive.write(path, path.relative_to(source).as_posix())
PY
cp "$PACKAGES/scrybe-chrome-$VERSION.zip" "$PACKAGES/scrybe-chrome.zip"

python - "$ROOT/dist/firefox" "$PACKAGES/scrybe-firefox-$VERSION.zip" <<'PY'
from pathlib import Path
import sys
import zipfile

source = Path(sys.argv[1])
target = Path(sys.argv[2])
with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(source.rglob("*")):
        if path.is_file():
            archive.write(path, path.relative_to(source).as_posix())
PY
cp "$PACKAGES/scrybe-firefox-$VERSION.zip" "$PACKAGES/scrybe-firefox.zip"

printf 'VERSION=%s\n' "$VERSION" > "$PACKAGES/build.env"
printf 'Packaged extension version %s:\n' "$VERSION"
find "$PACKAGES" -maxdepth 1 -type f -print | sort
