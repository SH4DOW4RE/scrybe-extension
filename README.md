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
It validates JavaScript and manifests, builds Chrome and Firefox folders, packages release artifacts, creates or updates a GitHub Release, and publishes update manifests through GitHub Pages.

Firefox self-hosted updates use `updates/firefox.json` and the release `.xpi`. For production Firefox, use a signed XPI. The workflow signs it automatically when these repository secrets are set:

- `AMO_JWT_ISSUER`
- `AMO_JWT_SECRET`

For a public Firefox Add-ons listing, create API credentials in the Firefox Add-ons Developer Hub and set:

- repository secret `AMO_JWT_ISSUER`: the AMO API key / JWT issuer.
- repository secret `AMO_JWT_SECRET`: the AMO API secret / JWT secret.
- repository variable `FIREFOX_RELEASE_CHANNEL`: set to `listed`.

When `FIREFOX_RELEASE_CHANNEL` is `listed`, the workflow submits the Firefox build to addons.mozilla.org using `amo-metadata.json` and removes the self-hosted Firefox `update_url` before signing. Firefox Add-ons then handles automatic updates after Mozilla review.

When `FIREFOX_RELEASE_CHANNEL` is unset or set to `unlisted`, the workflow creates a signed self-hosted XPI and publishes the `updates/firefox.json` manifest through GitHub Pages.

Chrome self-hosted updates require a `.crx`, not a zip. To enable Chrome auto-updates, set:

- repository secret `CHROME_CRX_PRIVATE_KEY_B64`: base64-encoded Chrome extension private key PEM.
- repository variable `CHROME_EXTENSION_ID`: the extension ID produced from that private key.

Without those values, the workflow still builds and releases the Chrome zip, but it cannot generate a valid Chrome auto-update manifest.

## Security model

The extension creates and stores a random AES-GCM master key locally. Bookmarks and history are encrypted before sync. Pairing uses a short-lived backend code to move the master key to another browser as encrypted bootstrap material.
