# Scrybe Extension

Cross-browser WebExtension for Scrybe.

## Load locally

1. Start the backend: `flask --app scrybe.app run` from `../backend`.
2. Build browser-specific extension folders: `sh scripts/build.sh`.
3. Firefox: open `about:debugging#/runtime/this-firefox`, choose “Load Temporary Add-on”, and select `dist/firefox/manifest.json`.
4. Chrome/Chromium: open `chrome://extensions`, enable developer mode, and load `dist/chrome`.

The default backend URL is `http://127.0.0.1:5000`. Change it in the popup Settings tab.

## Release builds and updates

The GitHub workflow at `.github/workflows/release-extension.yml` runs on pushes to `main`.
It validates JavaScript and manifests, builds Chrome and Firefox folders, packages release artifacts, submits Chrome/Firefox store updates when credentials are available, and creates or updates a GitHub Release.

Chrome Web Store handles automatic updates for the Chrome version after each submitted version is approved by Google. Firefox Add-ons handles automatic updates for the Firefox version after each submitted version is approved by Mozilla.

GitHub Releases include packaged zip artifacts for manual/testing use:

- Chrome: `.zip`
- Firefox: `.zip`

## Security model

The extension creates and stores a random AES-GCM master key locally. Bookmarks and history are encrypted before sync. Pairing uses a short-lived backend code to move the master key to another browser as encrypted bootstrap material.
