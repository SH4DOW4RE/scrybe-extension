#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path
from xml.sax.saxutils import escape


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--version", required=True)
    parser.add_argument("--release-base-url", required=True)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--firefox-id", default="scrybe@shadoweb.fr")
    parser.add_argument("--chrome-extension-id", default="")
    parser.add_argument("--include-chrome", action="store_true")
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    release_base_url = args.release_base_url.rstrip("/")

    firefox_update = {
        "addons": {
            args.firefox_id: {
                "updates": [
                    {
                        "version": args.version,
                        "update_link": f"{release_base_url}/scrybe-firefox.xpi",
                    }
                ]
            }
        }
    }
    (out_dir / "firefox.json").write_text(
        json.dumps(firefox_update, indent=2) + "\n",
        encoding="utf-8",
    )

    if args.include_chrome:
        if not args.chrome_extension_id:
            raise SystemExit("--chrome-extension-id is required with --include-chrome")
        chrome_update = f"""<?xml version="1.0" encoding="UTF-8"?>
<gupdate xmlns="http://www.google.com/update2/response" protocol="2.0">
  <app appid="{escape(args.chrome_extension_id)}">
    <updatecheck codebase="{escape(release_base_url)}/scrybe-chrome.crx" version="{escape(args.version)}" />
  </app>
</gupdate>
"""
        (out_dir / "chrome.xml").write_text(chrome_update, encoding="utf-8")


if __name__ == "__main__":
    main()
