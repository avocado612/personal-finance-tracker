const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ── User data directory ────────────────────────────────────────────────────
// All per-user state (Plaid tokens/history, CSVs, settings, TLS certs, .env
// credentials) lives in the user's home directory, not next to server.js.
// That's required once this runs as a packaged desktop app — the installed
// app bundle is read-only (and on .deb installs, owned by root) — and it's
// the right place for user data regardless. On first run this migrates any
// legacy files that used to sit next to server.js (how this repo worked
// before it became a desktop app) into the new location; originals are left
// in place, nothing is deleted.
// Overridable via FINANCE_DATA_DIR (e.g. to run multiple isolated instances
// side by side — different git worktrees each pointed at their own data dir
// and port). Must come from the shell env, not the .env file, since the .env
// file itself lives inside DATA_DIR.
const DATA_DIR = process.env.FINANCE_DATA_DIR || path.join(os.homedir(), '.finance-tracker');
fs.mkdirSync(DATA_DIR, { recursive: true });

function migrateLegacyFile(name) {
    const oldPath = path.join(__dirname, name);
    const newPath = path.join(DATA_DIR, name);
    if (!fs.existsSync(newPath) && fs.existsSync(oldPath)) {
        fs.copyFileSync(oldPath, newPath);
        console.log(`Migrated ${name} -> ${newPath}`);
    }
}
function migrateLegacyDir(name) {
    const oldPath = path.join(__dirname, name);
    const newPath = path.join(DATA_DIR, name);
    if (!fs.existsSync(newPath)) {
        if (fs.existsSync(oldPath)) {
            fs.cpSync(oldPath, newPath, { recursive: true });
            console.log(`Migrated ${name}/ -> ${newPath}`);
        } else {
            fs.mkdirSync(newPath, { recursive: true });
        }
    }
}
['.env', '.plaid_token', '.plaid_items.json', '.plaid_history.json', '.budget_settings.json', 'localhost.pem', 'localhost-key.pem']
    .forEach(migrateLegacyFile);
['.income_data'].forEach(migrateLegacyDir);

require('dotenv').config({ path: path.join(DATA_DIR, '.env') });
const express  = require('express');
const cors     = require('cors');
const https    = require('https');
const crypto   = require('crypto');
const { PlaidApi, PlaidEnvironments, Configuration } = require('plaid');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' })); // default 100kb is too small for income-doc PDF uploads
app.use(express.static(__dirname));   // serves index.html/script.js/styles.css (app assets, not user data)

const PORT        = process.env.PORT || 3001;
const TOKEN_FILE    = path.join(DATA_DIR, '.plaid_token');       // legacy single-token file (migrated on startup)
const ITEMS_FILE    = path.join(DATA_DIR, '.plaid_items.json');  // [{ item_id, access_token }, ...]
const HISTORY_FILE  = path.join(DATA_DIR, '.plaid_history.json');
const INCOME_DIR = path.join(DATA_DIR, '.income_data');
if (!fs.existsSync(INCOME_DIR)) fs.mkdirSync(INCOME_DIR);
const INCOME_CATEGORIES = ['paystub', 'w2', 'rsu', 'bonus'];
const SETTINGS_FILE = path.join(DATA_DIR, '.budget_settings.json');
const IS_PROD     = (process.env.PLAID_ENV || 'sandbox') === 'production';
const REDIRECT_URI = process.env.REDIRECT_URI || `https://localhost:${PORT}`;

// App Settings — version display + update check. GITHUB_TOKEN is optional
// (only needed for the update check, since the repo is private) and is
// entered through App Settings and stored in DATA_DIR/.env rather than
// being hardcoded — this app is meant to be run by other people, each
// with their own token.
let githubToken = process.env.GITHUB_TOKEN || null;
function setGithubToken(token) {
    githubToken = token || null;
}
// Read-only accessor so main.js (Electron main process) can hand the current
// token to electron-updater when checking/downloading a release — the repo
// is private, so the updater needs auth same as the update-check endpoint.
function getGithubToken() {
    return githubToken;
}
const APP_VERSION    = require('./package.json').version;
const GITHUB_REPO    = process.env.GITHUB_REPO || 'avocado612/personal-finance-tracker';
const CHANGELOG_FILE = path.join(__dirname, 'CHANGELOG.md');

// Adds or updates a single KEY=value line in DATA_DIR/.env, preserving every
// other line as-is. Deliberately narrow (no quoting/escaping support) — only
// used for values we control the shape of (API keys: no newlines or `=`).
function upsertEnvVar(key, value) {
    const envPath = path.join(DATA_DIR, '.env');
    let lines = [];
    // Drop blank lines on read (not just at the end) — otherwise the blank
    // line produced by splitting a trailing "\n" lands in the *middle* of
    // the array as soon as a new line gets appended after it, and stays
    // there since later edits only ever trim from the end.
    try { lines = fs.readFileSync(envPath, 'utf8').split('\n').filter(l => l !== ''); } catch { lines = []; }
    const idx = lines.findIndex(l => l.startsWith(`${key}=`));
    const newLine = `${key}=${value}`;
    if (idx >= 0) lines[idx] = newLine;
    else lines.push(newLine);
    fs.writeFileSync(envPath, lines.join('\n') + '\n', 'utf8');
}

// Removes a KEY=value line entirely (used when clearing a saved key).
function removeEnvVar(key) {
    const envPath = path.join(DATA_DIR, '.env');
    let lines = [];
    try { lines = fs.readFileSync(envPath, 'utf8').split('\n').filter(l => l !== ''); } catch { return; }
    lines = lines.filter(l => !l.startsWith(`${key}=`));
    fs.writeFileSync(envPath, lines.length ? lines.join('\n') + '\n' : '', 'utf8');
}

// Compares two "1.2.3"-ish version strings (leading "v" tolerated). Returns
// negative if a<b, positive if a>b, 0 if equal. Numeric per-segment, so
// "1.10.0" correctly sorts after "1.9.0" (a plain string compare would not).
function compareVersions(a, b) {
    const pa = String(a).replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
    const pb = String(b).replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const diff = (pa[i] || 0) - (pb[i] || 0);
        if (diff !== 0) return diff;
    }
    return 0;
}

// Load mkcert certs if they exist (used for local HTTPS)
const CERT_FILE = path.join(DATA_DIR, 'localhost.pem');
const KEY_FILE  = path.join(DATA_DIR, 'localhost-key.pem');
const hasCerts  = fs.existsSync(CERT_FILE) && fs.existsSync(KEY_FILE);

const plaidConfig = new Configuration({
    basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
    baseOptions: {
        headers: {
            'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
            'PLAID-SECRET':    process.env.PLAID_SECRET,
        },
    },
});
const plaidClient = new PlaidApi(plaidConfig);

// ── Multi-bank item storage ───────────────────────────────────────────────────
function loadItems() {
    try { return JSON.parse(fs.readFileSync(ITEMS_FILE, 'utf8')); }
    catch { return []; }
}
function saveItems(items) {
    fs.writeFileSync(ITEMS_FILE, JSON.stringify(items), 'utf8');
}
function addItem(item_id, access_token) {
    const items = loadItems().filter(i => i.item_id !== item_id);
    items.push({ item_id, access_token });
    saveItems(items);
}
function removeItem(item_id) {
    const items = loadItems();
    const removed = items.find(i => i.item_id === item_id);
    saveItems(items.filter(i => i.item_id !== item_id));
    return removed;
}

// One-time migration: legacy single-token file → items array
async function migrateLegacyToken() {
    if (!fs.existsSync(TOKEN_FILE)) return;
    try {
        const access_token = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
        if (access_token) {
            const itemResp = await plaidClient.itemGet({ access_token });
            addItem(itemResp.data.item.item_id, access_token);
            console.log('Migrated legacy .plaid_token into .plaid_items.json');
        }
    } catch (err) {
        console.error('Legacy token migration failed:', err.response?.data || err.message);
    } finally {
        try { fs.unlinkSync(TOKEN_FILE); } catch {}
    }
}

function loadPlaidHistory() {
    try {
        const h = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
        if (!h.cursors) h.cursors = h.cursor ? { legacy: h.cursor } : {};
        if (!h.transactions) h.transactions = {};
        return h;
    } catch { return { cursors: {}, transactions: {} }; }
}
function savePlaidHistory(data) {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(data), 'utf8');
}

// ── Step 1: create a link_token ──────────────────────────────────────────────
app.post('/api/create_link_token', async (req, res) => {
    try {
        const params = {
            user:          { client_user_id: 'local-user' },
            client_name:   'Finance Tracker',
            products:      ['transactions'],
            country_codes: ['US'],
            language:      'en',
        };

        // Production needs a redirect_uri for banks that use OAuth (Wells Fargo does)
        if (IS_PROD) params.redirect_uri = REDIRECT_URI;

        // Re-linking an existing item (e.g. expired login) uses update mode with that item's token.
        // Connecting a NEW bank must NOT pass an existing access_token, or Plaid reopens that same item.
        if (req.body?.update_mode && req.body?.access_token) params.access_token = req.body.access_token;

        const response = await plaidClient.linkTokenCreate(params);
        res.json({ link_token: response.data.link_token });
    } catch (err) {
        console.error('create_link_token error:', err.response?.data || err.message);
        res.status(500).json({ error: err.response?.data?.error_message || err.message });
    }
});

// ── Step 2: exchange public_token → access_token ─────────────────────────────
app.post('/api/exchange_token', async (req, res) => {
    const { public_token } = req.body;
    try {
        const response = await plaidClient.itemPublicTokenExchange({ public_token });
        addItem(response.data.item_id, response.data.access_token);
        console.log('Access token saved. Item ID:', response.data.item_id);
        res.json({ ok: true, item_id: response.data.item_id });
    } catch (err) {
        console.error('exchange_token error:', err.response?.data || err.message);
        res.status(500).json({ error: err.response?.data?.error_message || err.message });
    }
});

// ── Step 3: fetch transactions (persistent accumulation via cursor) ───────────
app.get('/api/transactions', async (req, res) => {
    const items = loadItems();
    if (items.length === 0) return res.status(400).json({ error: 'No linked account. Connect your bank first.' });

    try {
        // 1. Get all accounts across every linked bank (Item)
        const acctMap = new Map();
        for (const item of items) {
            const accountsResp = await plaidClient.accountsGet({ access_token: item.access_token });
            accountsResp.data.accounts.forEach(a => acctMap.set(a.account_id, a));
        }
        const accounts = [...acctMap.values()];

        // Only spending accounts: credit cards + depository (checking/savings)
        const spendingIds = new Set(
            accounts
                .filter(a => a.type === 'credit' || a.type === 'depository')
                .map(a => a.account_id)
        );

        const accountSummary = accounts
            .filter(a => spendingIds.has(a.account_id))
            .map(a => ({ name: a.name, type: a.type, subtype: a.subtype, mask: a.mask }));

        console.log('Spending accounts:', accountSummary.map(a => `${a.name} (${a.subtype})`));

        // 2. Load persisted history; sync only new/modified transactions via cursor, per Item
        const history  = loadPlaidHistory();
        const txnMap   = new Map(Object.entries(history.transactions || {}));
        const prevSize = txnMap.size;
        const cursors  = history.cursors || {};

        for (const item of items) {
            let cursor  = cursors[item.item_id] || null;
            let hasMore = true;
            while (hasMore) {
                const params = { access_token: item.access_token };
                if (cursor) params.cursor = cursor;
                const resp = await plaidClient.transactionsSync(params);
                resp.data.added.forEach(t    => txnMap.set(t.transaction_id, t));
                resp.data.modified.forEach(t => txnMap.set(t.transaction_id, t));
                resp.data.removed.forEach(t  => txnMap.delete(t.transaction_id));
                hasMore = resp.data.has_more;
                cursor  = resp.data.next_cursor;
            }
            cursors[item.item_id] = cursor;
        }

        // 3. Persist updated history (keyed by transaction_id for dedup/update)
        savePlaidHistory({ cursors, transactions: Object.fromEntries(txnMap) });
        const newCount = txnMap.size - prevSize;
        console.log(`Plaid history: ${txnMap.size} total stored (+${newCount} new)`);

        // 4. Filter and format for client (no date window — return all history)
        const EXCLUDE_PLAID_CATS = new Set([
            'LOAN_PAYMENTS', 'TRANSFER_OUT', 'INCOME',
            // TRANSFER_IN intentionally omitted — credit card returns/refunds are classified
            // as TRANSFER_IN by Plaid and must come through.
        ]);
        const TRANSFER_PATTERNS = [
            /online transfer (to|from)/i,
            /recurring transfer (to|from)/i,
            /\bwire transfer\b/i,
            /\binternal transfer\b/i,
            /\baccount transfer\b/i,
            /web pmts/i,
            /direct deposit/i,
            /payroll/i,
            /\batm withdrawal\b/i,
        ];
        const isExcluded = name => TRANSFER_PATTERNS.some(p => p.test(name));
        // Zelle/Venmo are peer-to-peer payments, not internal account transfers — Plaid often
        // buckets them as TRANSFER_OUT, but a Zelle to a roommate for rent (etc.) is a real
        // expense. Let these through so the client can show and (optionally) categorize them,
        // instead of silently dropping them like actual account-to-account transfers.
        const isP2P = name => /\b(zelle|venmo)\b/i.test(name);

        const filtered = [...txnMap.values()].filter(t => {
            const acct = acctMap.get(t.account_id);
            if (!acct) return false;
            if (!spendingIds.has(t.account_id)) return false;
            if (!isP2P(t.name)) {
                if (EXCLUDE_PLAID_CATS.has(t.personal_finance_category?.primary)) return false;
                if (isExcluded(t.name)) return false;
            }
            // For depository: only include positive amounts (debits = money leaving account)
            if (acct.type === 'depository' && t.amount <= 0) return false;
            return true;
        });

        const rows = filtered.map(t => {
            const acct = acctMap.get(t.account_id);
            return {
                date:          t.date,
                description:   t.name,
                amount:        t.amount,
                category:      t.personal_finance_category?.primary || '',
                plaidCategory: t.personal_finance_category?.primary || '',
                accountName:   acct?.name || '',
                accountType:   acct?.type || '',
                accountSub:    acct?.subtype || '',
            };
        });

        console.log(`Returning ${rows.length} transactions (full history)`);
        res.json({ transactions: rows, count: rows.length, newCount, totalStored: txnMap.size, accounts: accountSummary });
    } catch (err) {
        console.error('transactions error:', err.response?.data || err.message);
        res.status(500).json({ error: err.response?.data?.error_message || err.message });
    }
});

// ── Status / unlink ──────────────────────────────────────────────────────────
app.get('/api/status', (req, res) => {
    const items = loadItems();
    res.json({ linked: items.length > 0, count: items.length, env: process.env.PLAID_ENV || 'sandbox' });
});

// Returns one entry per linked bank (Item), each with its own accounts + institution name
app.get('/api/accounts', async (req, res) => {
    const items = loadItems();
    if (items.length === 0) return res.json({ items: [] });

    const results = await Promise.all(items.map(async item => {
        try {
            const resp = await plaidClient.accountsGet({ access_token: item.access_token });
            const accounts = resp.data.accounts.map(a => ({
                name:       a.name,
                type:       a.type,
                subtype:    a.subtype,
                mask:       a.mask,
                balance:    a.balances?.current,
                available:  a.balances?.available,
            }));

            // Fetch institution name (e.g. "Wells Fargo")
            let institution = null;
            try {
                const itemResp = await plaidClient.itemGet({ access_token: item.access_token });
                const instId   = itemResp.data.item.institution_id;
                if (instId) {
                    const instResp = await plaidClient.institutionsGetById({
                        institution_id: instId,
                        country_codes:  ['US'],
                    });
                    institution = instResp.data.institution.name;
                }
            } catch (instErr) {
                console.warn('institution lookup skipped:', instErr.message);
            }

            return { itemId: item.item_id, institution, accounts };
        } catch (err) {
            console.error(`accounts error for item ${item.item_id}:`, err.response?.data || err.message);
            return { itemId: item.item_id, institution: null, accounts: [], error: err.message };
        }
    }));

    res.json({ items: results });
});

// Disconnects one linked bank (Item) without touching the others
app.post('/api/unlink', async (req, res) => {
    const { itemId } = req.body || {};
    if (!itemId) return res.status(400).json({ error: 'itemId is required' });

    const removed = removeItem(itemId);
    if (!removed) return res.status(404).json({ error: 'No such linked item' });

    try {
        // Drop that item's transactions from history so they don't linger unsynced
        const accountsResp = await plaidClient.accountsGet({ access_token: removed.access_token });
        const removedAcctIds = new Set(accountsResp.data.accounts.map(a => a.account_id));

        const history = loadPlaidHistory();
        for (const [txnId, t] of Object.entries(history.transactions)) {
            if (removedAcctIds.has(t.account_id)) delete history.transactions[txnId];
        }
        delete history.cursors[itemId];
        savePlaidHistory(history);
    } catch (err) {
        console.warn('unlink cleanup skipped:', err.response?.data || err.message);
    }

    try { await plaidClient.itemRemove({ access_token: removed.access_token }); }
    catch (err) { console.warn('itemRemove skipped:', err.response?.data || err.message); }

    res.json({ ok: true });
});

// ── All transactions per account (unfiltered — for the per-account dropdown) ─
app.get('/api/all-transactions', async (req, res) => {
    const items = loadItems();
    if (items.length === 0) return res.json({ byAccount: {} });
    try {
        const acctMap = new Map();
        for (const item of items) {
            const accountsResp = await plaidClient.accountsGet({ access_token: item.access_token });
            accountsResp.data.accounts.forEach(a => acctMap.set(a.account_id, a));
        }

        const history = loadPlaidHistory();
        const byAccount = {};

        Object.values(history.transactions || {}).forEach(t => {
            const acct = acctMap.get(t.account_id);
            if (!acct) return;
            const name = acct.name;
            if (!byAccount[name]) byAccount[name] = [];
            byAccount[name].push({
                isoDate: t.date,
                desc:    t.name,
                amount:  -t.amount,   // flip to internal convention: negative=out, positive=in
            });
        });

        // Sort each account newest-first
        Object.values(byAccount).forEach(arr =>
            arr.sort((a, b) => b.isoDate.localeCompare(a.isoDate))
        );

        res.json({ byAccount });
    } catch (err) {
        console.error('all-transactions error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── Income document persistence (per category: paystub/w2/rsu/bonus) ────────
app.post('/api/save-income-doc', (req, res) => {
    try {
        const { category, record } = req.body;
        if (!INCOME_CATEGORIES.includes(category))
            return res.status(400).json({ error: 'Invalid category' });
        if (!record || typeof record !== 'object')
            return res.status(400).json({ error: 'No record provided' });
        const filePath = path.join(INCOME_DIR, `${category}.json`);
        fs.writeFileSync(filePath, JSON.stringify(record), 'utf8');
        console.log(`Income doc saved [${category}]: ${record.fileName || ''}`);
        res.json({ ok: true, category });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/load-income-docs', (req, res) => {
    try {
        const docs = {};
        for (const category of INCOME_CATEGORIES) {
            const filePath = path.join(INCOME_DIR, `${category}.json`);
            docs[category] = fs.existsSync(filePath)
                ? JSON.parse(fs.readFileSync(filePath, 'utf8'))
                : null;
        }
        res.json({ docs });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/delete-income-doc/:category', (req, res) => {
    try {
        const { category } = req.params;
        if (!INCOME_CATEGORIES.includes(category))
            return res.status(400).json({ error: 'Invalid category' });
        const filePath = path.join(INCOME_DIR, `${category}.json`);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Budget settings persistence (Monthly Ideal expenses, subs, savings, etc.) ─
// Client-side localStorage alone can be lost (browser data clearing, private
// browsing, switching browsers/devices, http vs https origin change). This
// mirrors that state to disk so it survives all of those.
app.post('/api/save-settings', (req, res) => {
    try {
        const settings = req.body;
        if (!settings || typeof settings !== 'object')
            return res.status(400).json({ error: 'No settings provided' });
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings), 'utf8');
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/load-settings', (req, res) => {
    try {
        const settings = fs.existsSync(SETTINGS_FILE)
            ? JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'))
            : null;
        res.json({ settings });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── App Settings ────────────────────────────────────────────────────────────
app.get('/api/app/version', (req, res) => {
    res.json({ version: APP_VERSION });
});

// Parses the "## vX.Y.Z - date" + "- item" CHANGELOG.md format into
// [{ version, date, items: [...] }], newest entry first (as written).
function parseChangelog(text) {
    const entries = [];
    let current = null;
    for (const raw of text.split('\n')) {
        const line = raw.trim();
        if (line.startsWith('## ')) {
            const heading = line.slice(3).trim();
            const [version, ...rest] = heading.split(' - ');
            current = { version: (version || '').trim(), date: rest.join(' - ').trim(), items: [] };
            entries.push(current);
        } else if (line.startsWith('- ') && current) {
            current.items.push(line.slice(2).trim());
        }
    }
    return entries;
}

app.get('/api/app/changelog', (req, res) => {
    try {
        const text = fs.existsSync(CHANGELOG_FILE) ? fs.readFileSync(CHANGELOG_FILE, 'utf8') : '';
        res.json({ entries: parseChangelog(text) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/app/update-check', async (req, res) => {
    if (!githubToken) {
        return res.status(400).json({ error: 'No GitHub token set — add one in App Settings to enable update checks.' });
    }
    try {
        const resp = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
            headers: {
                'Authorization':          `Bearer ${githubToken}`,
                'Accept':                 'application/vnd.github+json',
                'X-GitHub-Api-Version':   '2022-11-28',
                'User-Agent':             'finance-tracker-app',
            },
        });
        if (!resp.ok) {
            const body = await resp.json().catch(() => ({}));
            const hint = resp.status === 401 ? ' — check your GitHub token' : resp.status === 404 ? ' — no releases found (or the token can\'t see this repo)' : '';
            return res.status(502).json({ error: `GitHub API error (${resp.status})${hint}: ${body.message || resp.statusText}` });
        }
        const release = await resp.json();
        const latestVersion = (release.tag_name || '').trim();
        res.json({
            currentVersion:  APP_VERSION,
            latestVersion,
            updateAvailable: latestVersion ? compareVersions(latestVersion, APP_VERSION) > 0 : false,
            releaseUrl:      release.html_url || null,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Credential status endpoint never echoes the stored value back — write-only,
// same as the Plaid pattern elsewhere in this file.
app.get('/api/app/github-token-status', (req, res) => {
    res.json({ configured: !!githubToken });
});

app.post('/api/app/github-token', async (req, res) => {
    const token = ((req.body && req.body.token) || '').trim();
    if (!token) return res.status(400).json({ error: 'token is required' });
    try {
        const resp = await fetch(`https://api.github.com/repos/${GITHUB_REPO}`, {
            headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json', 'User-Agent': 'finance-tracker-app' },
        });
        if (resp.status === 401) return res.status(400).json({ error: 'That token was rejected by GitHub — double-check it and try again.' });
        if (resp.status === 404) return res.status(400).json({ error: `Token doesn't have access to ${GITHUB_REPO}.` });
        // Other statuses (network hiccup, GitHub 5xx) — don't block saving on those.
    } catch (err) {
        // Network error validating — save anyway, the update-check endpoint will surface a clearer error later if it's actually bad.
    }
    try {
        upsertEnvVar('GITHUB_TOKEN', token);
        setGithubToken(token);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/app/github-token', (req, res) => {
    try {
        removeEnvVar('GITHUB_TOKEN');
        setGithubToken(null);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── OAuth redirect handler (production Wells Fargo flow) ─────────────────────
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Starts the HTTP(S) server and resolves once it's listening. Used both by the
// `node server.js` CLI entry point below and by the Electron main process
// (main.js), which needs to know the URL to open once the server is ready.
function startServer() {
    return migrateLegacyToken().then(() => {
        return new Promise((resolve) => {
            if (hasCerts) {
                const httpsOptions = {
                    key:  fs.readFileSync(KEY_FILE),
                    cert: fs.readFileSync(CERT_FILE),
                };
                const server = https.createServer(httpsOptions, app).listen(PORT, () => {
                    console.log(`\nFinance server (HTTPS): https://localhost:${PORT}`);
                    console.log(`Environment:            ${process.env.PLAID_ENV || 'sandbox'}`);
                    if (IS_PROD) console.log(`Redirect URI:           ${REDIRECT_URI}`);
                    resolve({ protocol: 'https', port: PORT, server });
                });
            } else {
                const server = app.listen(PORT, () => {
                    console.log(`\nFinance server (HTTP): http://localhost:${PORT}`);
                    console.log(`Environment:           ${process.env.PLAID_ENV || 'sandbox'}`);
                    console.log(`Run 'mkcert localhost' in ${DATA_DIR} to enable HTTPS for production.`);
                    resolve({ protocol: 'http', port: PORT, server });
                });
            }
        });
    });
}

// Only auto-start when run directly (`node server.js` / `npm run server`).
// When required from main.js (Electron), the caller starts it explicitly.
if (require.main === module) {
    startServer();
}

module.exports = { app, startServer, getGithubToken, APP_VERSION, GITHUB_REPO };
