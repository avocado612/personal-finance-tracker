# Changelog

## v1.1.0 - 2026-08-18
- AI Analyze tab — chat with Claude about your own spending, backed by real transaction data (not guesses). Supports multiple independent chat sessions you can create, switch between, rename, and delete — one per topic, like tabs in a terminal multiplexer.
- App Settings tab — app version, a "Check for Updates" button, this changelog, and a place to add your Claude API key and GitHub token without editing files by hand.

## v1.0.0 - 2026-08-16
- Packaged the app as an Electron desktop app (`npm start` opens a window; `npm run dist` builds a Linux AppImage).
- Moved all user data (Plaid tokens/history, CSVs, settings, TLS certs, `.env`) out of the repo folder and into `~/.finance-tracker/`, with automatic one-time migration from the old location.
- Added a desktop launcher (`.desktop` entry + app icon) and an `npm run install-desktop` helper to update it after rebuilding.
- Added a README with safe setup instructions and a download badge linking to GitHub Releases.
