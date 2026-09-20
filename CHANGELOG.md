# Changelog

## v1.3.0 - 2026-09-20
- Removed the AI Analyze tab and CSV upload (History) tab from the shipped app, pending re-validation — both still exist on the `feature/ai-analyze` and `feature/csv-upload` branches and may return later. The Claude API key section in App Settings was removed along with AI Analyze (GitHub token / update checks are unaffected).
- Expenses/Monthly Real now run on Plaid data only — the Plaid/CSV boundary marker in the monthly table is gone since there's no CSV data to draw a boundary against.

## v1.2.0 - 2026-09-19
- In-app updates — App Settings' "Check for Updates" now downloads and installs the new AppImage in place via electron-updater, instead of just linking to the GitHub release. Fully manual: nothing downloads or installs without you clicking "Download & Install" and then "Restart & Install" yourself.
- The app version now shows at the bottom of the sidebar, not just in App Settings.

## v1.1.0 - 2026-08-18
- AI Analyze tab — chat with Claude about your own spending, backed by real transaction data (not guesses). Supports multiple independent chat sessions you can create, switch between, rename, and delete — one per topic, like tabs in a terminal multiplexer.
- App Settings tab — app version, a "Check for Updates" button, this changelog, and a place to add your Claude API key and GitHub token without editing files by hand.

## v1.0.0 - 2026-08-16
- Packaged the app as an Electron desktop app (`npm start` opens a window; `npm run dist` builds a Linux AppImage).
- Moved all user data (Plaid tokens/history, CSVs, settings, TLS certs, `.env`) out of the repo folder and into `~/.finance-tracker/`, with automatic one-time migration from the old location.
- Added a desktop launcher (`.desktop` entry + app icon) and an `npm run install-desktop` helper to update it after rebuilding.
- Added a README with safe setup instructions and a download badge linking to GitHub Releases.
