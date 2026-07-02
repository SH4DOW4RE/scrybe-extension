#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


TOKEN_URL = "https://oauth2.googleapis.com/token"
API_BASE = "https://chromewebstore.googleapis.com"
UPLOAD_BASE = "https://chromewebstore.googleapis.com/upload"


def main() -> None:
    parser = argparse.ArgumentParser(description="Upload and publish a Chrome Web Store extension update.")
    parser.add_argument("--zip", required=True, type=Path)
    parser.add_argument("--publisher-id", required=True)
    parser.add_argument("--extension-id", required=True)
    parser.add_argument("--client-id", required=True)
    parser.add_argument("--client-secret", required=True)
    parser.add_argument("--refresh-token", required=True)
    args = parser.parse_args()

    if not args.zip.is_file():
        raise SystemExit(f"Package not found: {args.zip}")

    access_token = refresh_access_token(
        client_id=args.client_id,
        client_secret=args.client_secret,
        refresh_token=args.refresh_token,
    )
    upload_result = upload_package(
        access_token=access_token,
        publisher_id=args.publisher_id,
        extension_id=args.extension_id,
        package_path=args.zip,
    )
    print(f"Chrome Web Store upload state: {upload_result.get('uploadState', 'unknown')}")

    publish_result = publish_item(
        access_token=access_token,
        publisher_id=args.publisher_id,
        extension_id=args.extension_id,
    )
    print(f"Chrome Web Store publish status: {publish_result.get('status', publish_result)}")


def refresh_access_token(*, client_id: str, client_secret: str, refresh_token: str) -> str:
    body = urllib.parse.urlencode(
        {
            "client_id": client_id,
            "client_secret": client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        }
    ).encode("utf-8")
    response = request_json(
        TOKEN_URL,
        data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    token = response.get("access_token")
    if not token:
        raise SystemExit("Google OAuth response did not include an access_token.")
    return token


def upload_package(*, access_token: str, publisher_id: str, extension_id: str, package_path: Path) -> dict:
    url = f"{UPLOAD_BASE}/v2/publishers/{publisher_id}/items/{extension_id}:upload"
    data = package_path.read_bytes()
    return request_json(
        url,
        data=data,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/zip",
        },
    )


def publish_item(*, access_token: str, publisher_id: str, extension_id: str) -> dict:
    url = f"{API_BASE}/v2/publishers/{publisher_id}/items/{extension_id}:publish"
    return request_json(
        url,
        data=b"",
        headers={"Authorization": f"Bearer {access_token}"},
    )


def request_json(url: str, *, data: bytes, headers: dict[str, str]) -> dict:
    request = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            payload = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        payload = exc.read().decode("utf-8", errors="replace")
        print(f"Request failed: {url}", file=sys.stderr)
        print(payload, file=sys.stderr)
        raise SystemExit(exc.code) from exc
    return json.loads(payload or "{}")


if __name__ == "__main__":
    main()
