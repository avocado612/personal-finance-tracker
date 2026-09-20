# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A personal finance tracker: a single-page vanilla JS frontend (no build step, no framework) backed by a small Express server that proxies Plaid (bank sync) and persists data to local JSON/CSV files. Everything runs locally. It ships as a desktop app (Electron) — see "Desktop app" below — but the Express server underneath can still be run standalone for development.

## Commands

- Install deps: `npm install`
- Run as the desktop app (dev): `npm start` (runs `electron .` — starts the server in-process and opens it in an app window)
- Run just the server (no Electron window, e.g. to hit the API directly or with `curl`): `npm run server` (runs `node server.js`)
  - Serves on `https://localhost:3001` if TLS certs are present in the data dir (see below), otherwise plain HTTP on the same port.
  - To enable HTTPS locally (needed for Plaid Link OAuth flows), run `mkcert localhost` inside `~/.finance-tracker/` (not the repo root — see "Desktop app").
- Build a distributable Linux app: `npm run dist` (runs `electron-builder`, produces an AppImage in `dist/`; `.deb` is not built — see below)
- No test suite, linter, or build step exists for the frontend in this repo.
- `.env` (in `~/.finance-tracker/`, not the repo) holds Plaid credentials (`PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`, `PORT`, `REDIRECT_URI`) — never print or commit its contents. `GITHUB_TOKEN` lives here too, but is optional and meant to be set from the **App Settings** tab in the running app, not hand-edited — see below.

## Desktop app

The app is packaged with Electron (`main.js` is the Electron entry point, set as `"main"` in `package.json`). `main.js` requires `server.js` and calls its exported `startServer()`, then points a `BrowserWindow` at the resulting URL — same server code path as running it standalone, just opened in its own window instead of a browser tab.

**User data directory**: `server.js` resolves a `DATA_DIR` at `~/.finance-tracker/` and stores everything user-specific there (Plaid tokens/history, CSVs, income docs, settings, TLS certs, `.env`) instead of next to `server.js`. This is required because a packaged app's install directory is read-only (and root-owned for `.deb`-style installs) — `__dirname`-relative writes would fail. On first run, `server.js` migrates any legacy files sitting next to it (how the repo worked before this was a desktop app) into `DATA_DIR`, copying rather than deleting the originals.

**Packaging**: `electron-builder` config lives in the `"build"` key of `package.json`; `build/icon.png` is the app icon (generated from `build/icon.svg`). Linux target is `AppImage` only — `.deb` was dropped because electron-builder's bundled `fpm` tool fails on this machine (`libcrypt.so.1` missing, a known break on distros that ship `libxcrypt` instead, e.g. Arch/CachyOS) and `.deb` isn't the native package format here anyway.

## Architecture

**Backend (`server.js`)** — a thin Express wrapper around the Plaid API, exporting `{ app, startServer }` (`startServer()` returns a Promise that resolves once listening — used by both the `node server.js` CLI entry point and `main.js`/Electron):
- `/api/create_link_token`, `/api/exchange_token` — Plaid Link handshake to obtain and store an access token (see `.plaid_items.json` under `DATA_DIR`).
- `/api/transactions` — syncs transactions via Plaid's cursor-based `transactionsSync`, accumulates them keyed by `transaction_id` in `.plaid_history.json` (never deletes across syncs, only adds/modifies/removes per Plaid's diff), then filters out transfers/income/loan-payment categories before returning spending transactions to the client.
- `/api/all-transactions` — same history, unfiltered, grouped by account (used for per-account drilldowns).
- `/api/accounts`, `/api/status`, `/api/unlink` — account metadata / link status / disconnect.
- `/api/app/*` — App Settings: `version`, `changelog` (parses `CHANGELOG.md`), `update-check` (queries the GitHub Releases API for `GITHUB_REPO`, needs `GITHUB_TOKEN` since the repo is private), and `github-token` (GET status / POST save+validate / DELETE clear — `upsertEnvVar`/`removeEnvVar` edit `DATA_DIR/.env` in place; also re-applied in-memory immediately via `setGithubToken`, no restart needed).
- State lives entirely in flat files under `DATA_DIR` (`.plaid_items.json`, `.plaid_history.json`, etc.) — there is no database.

**Frontend** — everything is one page (`index.html`) with all eight "sheets" (tabs) inlined as hidden/shown `<div class="sheet">` blocks, switched via `showTab()`. All behavior lives in the single `script.js` (no modules/bundler); `styles.css` holds all styling.

Important: **`tabs/*.html|css|js` is dead code** — an earlier attempt to split the app into per-tab files that was never wired up. `index.html` only loads `script.js` directly and none of the `tabs/` files are referenced anywhere. Don't assume edits there have any effect; make changes in `script.js`/`index.html`/`styles.css` instead. (Worth confirming with the user before deleting `tabs/`, since it hasn't been cleaned up yet.)

**AI Analyze and CSV upload were removed from this branch** (the one releases are built from) pending re-validation — they still exist, fully working, on the `feature/ai-analyze` and `feature/csv-upload` branches respectively, to be re-added later. Don't reintroduce them here without being asked; if working on either feature, do it on its own branch, not `electron-desktop-app`.

Within `script.js`, the sheets/features are:
- **Monthly Ideal** — budget planning: income (base/RSU/bonus/stock refresher) → tax calc (`calcBracketTax`, progressive federal/CA brackets) → expense/tithing/savings allocation, rendered as an SVG flow diagram (`drawFlowArrows`) and pie chart (`drawIdealPie`).
- **Monthly Real** (`renderMonthlyReal`) — budget vs. actual, sourced from live transaction data.
- **Expenses / Credit Card** (`credit-card` sheet) — the Plaid live-sync UI (`plaidConnect`, `plaidSync`, `plaidToggle`) plus analytics (category charts, monthly tables, transfer-flow triangle detection between accounts). Plaid-only — CSV upload was removed (see above).
- **Subscription_List** — user-defined recurring charges plus auto-detection of recurring charges from transaction history (`detectSubscriptions`).
- **App Settings** (`appSettingsInit` and the `app*` functions) — version/changelog display, update check, and the GitHub token UI (`appSaveGithubToken`/`appClearGithubToken`) that POSTs to `/api/app/*` instead of requiring users to hand-edit `.env`.
- **Edit** — the settings panel: income inputs, tax toggles, RSU vest months, tithing rates, and expense category definitions (each category has keyword rules used to auto-categorize transactions, see `ccCategorize`/`ccCategorizeFull`).

**Data flow**: Plaid transactions are deduplicated (`isDuplicate`, comparing description overlap and dates) and refund/charge pairs are matched (`findMatchingCharge`, `flagExactRefunds`) before being categorized and rendered across the analytics sheets (`mergeTxnSources` builds `ccTransactions` from Plaid history).

**Client-side persistence**: user-editable settings (expense categories, keywords, tithing rates, income inputs, ideal savings, subscriptions) are saved to `localStorage` (see the `saveToStorage`/`loadFromStorage` block, keys prefixed `fc_`), and mirrored to the server on a debounce via `/api/save-settings` into `.budget_settings.json`, restored via `/api/load-settings` on page load so this data survives localStorage being cleared. Transaction data itself comes from the server (Plaid history / CSV files), not localStorage.

## Working with Claude

- Before implementing a fix or feature, ask clarifying questions if the request or the root cause of a bug is ambiguous — don't guess silently and implement the first plausible theory.
