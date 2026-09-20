# personal-finance-tracker

[![Download for Linux](https://img.shields.io/badge/Download-Linux%20AppImage-blue?style=for-the-badge&logo=linux&logoColor=white)](https://github.com/avocado612/personal-finance-tracker/releases/latest)

A personal finance tracker: budget planning, live transaction sync via [Plaid](https://plaid.com), CSV statement import, and an AI Analyze tab for asking [Claude](https://www.anthropic.com/claude) questions about your own spending — packaged as a desktop app (Electron) that also runs as a plain local web server. Everything runs on your machine; nothing is hosted remotely.

This is personal software connected to real bank accounts. The steps below are written to keep your credentials and financial data from ending up somewhere they shouldn't.

## Before you start

- **This repo is private.** Only accounts you've explicitly added as collaborators can clone it. Don't make it public — it doesn't contain secrets (those are gitignored), but it's still your personal finance code.
- **Only clone it onto a computer you trust and control** — this app will hold real transaction history and (if you connect Plaid in production mode) bank access tokens. Don't run it on a shared or public machine.
- You'll need your own Plaid API credentials (see step 3) — the repo intentionally does not include anyone's `.env`, tokens, or transaction history. Each machine you run this on generates/stores its own.

## Requirements

- [Node.js](https://nodejs.org) 18+ and npm
- [`gh`](https://cli.github.com) (GitHub CLI) or an SSH key registered to the GitHub account this repo lives under — needed to clone a private repo
- [`mkcert`](https://github.com/FiloSottile/mkcert) — for local HTTPS (Plaid Link's OAuth flow requires it)
- A [Plaid developer account](https://dashboard.plaid.com/signup) (free) if you want live bank sync — CSV import works without one

## 1. Get the code

Clone over SSH or with the GitHub CLI (either authenticates you properly for a private repo — never download a private repo as a public "download ZIP" link, and never clone from a link someone sent you instead of the repo's own URL):

```bash
gh repo clone avocado612/personal-finance-tracker
# or
git clone git@github.com:avocado612/personal-finance-tracker.git
```

## 2. Install dependencies

```bash
cd personal-finance-tracker
npm install
```

`electron` needs to download its actual browser binary as part of installing (its postinstall script does this automatically). If you've configured npm to skip install scripts (`--ignore-scripts`, or a global policy that blocks them), you'll need to allow scripts for this install, or run `node node_modules/electron/install.js` afterward to fetch the binary manually.

## 3. Set up your Plaid credentials

All user data — credentials, tokens, transaction history, TLS certs — lives outside the repo, in `~/.finance-tracker/`, so it's never at risk of being committed or pushed by accident. Create your `.env` file there:

```bash
mkdir -p ~/.finance-tracker
cat > ~/.finance-tracker/.env <<'EOF'
PLAID_CLIENT_ID=your_client_id
PLAID_SECRET=your_secret
PLAID_ENV=sandbox
PORT=3001
EOF
```

Get `PLAID_CLIENT_ID`/`PLAID_SECRET` from your [Plaid dashboard](https://dashboard.plaid.com/team/keys). Start with `PLAID_ENV=sandbox` (fake test data, no real bank link) before switching to `production` (real banks, real transactions).

**Treat this `.env` file, and everything else in `~/.finance-tracker/`, like your online banking password.** Once you link a real bank, `.plaid_items.json` in that folder holds a live access token to your accounts. Don't commit it, don't paste its contents anywhere, don't sync that folder to a shared or public cloud drive.

## 4. Enable local HTTPS

Plaid Link's OAuth flow needs HTTPS, even locally:

```bash
mkcert -install          # one-time, trusts a local CA on your machine
cd ~/.finance-tracker && mkcert localhost
```

Without this, the app still runs over plain HTTP — fine for CSV-only use, but Plaid Link may not work correctly.

## 5. Run it

```bash
npm start          # opens the desktop app window
npm run server      # or: just the server, e.g. https://localhost:3001 in your own browser
```

## 6. (Optional) Set up AI Analyze

Open the **App Settings** tab in the running app and paste in a [Claude API key](https://console.anthropic.com/settings/keys) — it's validated and saved locally (`~/.finance-tracker/.env`) from there, no manual file editing needed. Nothing is hardcoded anywhere in this repo, since this app is meant to be run by anyone, each with their own key. The same tab also takes an optional GitHub token (a fine-grained personal access token with read access to this repo) if you want the "Check for Updates" button to work, since the repo is private.

## 7. Updating

If you installed the AppImage (rather than running from source), open **App Settings** in the running app and click **Check for Updates**. If a newer release exists, click **Download & Install**, wait for it to finish, then **Restart & Install** — the app replaces its own AppImage and relaunches. Nothing downloads or installs without those clicks; it never updates on its own in the background. This requires the GitHub token from step 6 (same one the update check itself uses).

Running from source instead? `git pull`, `npm install`, then `npm start` — no in-app update button involved.

## 8. (Optional) Build a standalone desktop app + launcher icon

```bash
npm run dist              # builds dist/Finance Tracker-*.AppImage (Linux)
npm run install-desktop   # copies it to ~/Applications/ so your app launcher can find it
```

On Arch/CachyOS you'll also need `sudo pacman -S fuse2` once, since AppImages require it.

## Where your data lives

Everything user-specific — Plaid tokens/history, CSV uploads, budget settings, TLS certs, `.env` — is in `~/.finance-tracker/`, not in this repo. That's the one folder worth backing up if you want to preserve your data; it's also the one folder to keep private.
