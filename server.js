require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const fs       = require('fs');
const path     = require('path');
const https    = require('https');
const { PlaidApi, PlaidEnvironments, Configuration } = require('plaid');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.static('.'));   // serves index.html at http://localhost:3001

const PORT        = process.env.PORT || 3001;
const TOKEN_FILE    = path.join(__dirname, '.plaid_token');
const HISTORY_FILE  = path.join(__dirname, '.plaid_history.json');
const CSV_DIR = path.join(__dirname, '.csv_data');
if (!fs.existsSync(CSV_DIR)) fs.mkdirSync(CSV_DIR);
const IS_PROD     = (process.env.PLAID_ENV || 'sandbox') === 'production';
const REDIRECT_URI = process.env.REDIRECT_URI || `https://localhost:${PORT}`;

// Load mkcert certs if they exist (used for local HTTPS)
const CERT_FILE = path.join(__dirname, 'localhost.pem');
const KEY_FILE  = path.join(__dirname, 'localhost-key.pem');
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

function loadAccessToken() {
    try { return fs.readFileSync(TOKEN_FILE, 'utf8').trim(); } catch { return null; }
}
function saveAccessToken(token) {
    fs.writeFileSync(TOKEN_FILE, token, 'utf8');
}

function loadPlaidHistory() {
    try { return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')); }
    catch { return { cursor: null, transactions: {} }; }
}
function savePlaidHistory(data) {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(data), 'utf8');
}
function clearPlaidHistory() {
    try { fs.unlinkSync(HISTORY_FILE); } catch {}
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

        // If re-linking an existing item, pass the access token for update mode
        const existing = req.body?.access_token || loadAccessToken();
        if (existing && req.body?.update_mode) params.access_token = existing;

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
        saveAccessToken(response.data.access_token);
        console.log('Access token saved. Item ID:', response.data.item_id);
        res.json({ ok: true });
    } catch (err) {
        console.error('exchange_token error:', err.response?.data || err.message);
        res.status(500).json({ error: err.response?.data?.error_message || err.message });
    }
});

// ── Step 3: fetch transactions (persistent accumulation via cursor) ───────────
app.get('/api/transactions', async (req, res) => {
    const access_token = loadAccessToken();
    if (!access_token) return res.status(400).json({ error: 'No linked account. Connect your bank first.' });

    try {
        // 1. Get all accounts
        const accountsResp = await plaidClient.accountsGet({ access_token });
        const accounts = accountsResp.data.accounts;
        const acctMap  = new Map(accounts.map(a => [a.account_id, a]));

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

        // 2. Load persisted history; sync only new/modified transactions via cursor
        const history = loadPlaidHistory();
        const txnMap  = new Map(Object.entries(history.transactions || {}));
        const prevSize = txnMap.size;
        let cursor  = history.cursor || null;
        let hasMore = true;
        while (hasMore) {
            const params = { access_token };
            if (cursor) params.cursor = cursor;
            const resp = await plaidClient.transactionsSync(params);
            resp.data.added.forEach(t    => txnMap.set(t.transaction_id, t));
            resp.data.modified.forEach(t => txnMap.set(t.transaction_id, t));
            resp.data.removed.forEach(t  => txnMap.delete(t.transaction_id));
            hasMore = resp.data.has_more;
            cursor  = resp.data.next_cursor;
        }

        // 3. Persist updated history (keyed by transaction_id for dedup/update)
        savePlaidHistory({ cursor, transactions: Object.fromEntries(txnMap) });
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
            /zelle (to|from)/i,
            /\bwire transfer\b/i,
            /\binternal transfer\b/i,
            /\baccount transfer\b/i,
            /web pmts/i,
            /direct deposit/i,
            /payroll/i,
            /\batm withdrawal\b/i,
        ];
        const isExcluded = name => TRANSFER_PATTERNS.some(p => p.test(name));

        const filtered = [...txnMap.values()].filter(t => {
            const acct = acctMap.get(t.account_id);
            if (!acct) return false;
            if (!spendingIds.has(t.account_id)) return false;
            if (EXCLUDE_PLAID_CATS.has(t.personal_finance_category?.primary)) return false;
            if (isExcluded(t.name)) return false;
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
    const token = loadAccessToken();
    res.json({ linked: !!token, env: process.env.PLAID_ENV || 'sandbox' });
});

app.get('/api/accounts', async (req, res) => {
    const access_token = loadAccessToken();
    if (!access_token) return res.json({ accounts: [] });
    try {
        const resp = await plaidClient.accountsGet({ access_token });
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
            const itemResp = await plaidClient.itemGet({ access_token });
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

        res.json({ accounts, institution });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/unlink', (req, res) => {
    try { fs.unlinkSync(TOKEN_FILE); } catch {}
    clearPlaidHistory();
    res.json({ ok: true });
});

// ── All transactions per account (unfiltered — for the per-account dropdown) ─
app.get('/api/all-transactions', async (req, res) => {
    const access_token = loadAccessToken();
    if (!access_token) return res.json({ byAccount: {} });
    try {
        const accountsResp = await plaidClient.accountsGet({ access_token });
        const acctMap = new Map(accountsResp.data.accounts.map(a => [a.account_id, a]));

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

// ── CSV persistence (per account) ────────────────────────────────────────────
app.post('/api/save-csv', (req, res) => {
    try {
        const { rows, accountName } = req.body;
        if (!Array.isArray(rows) || rows.length === 0)
            return res.status(400).json({ error: 'No rows provided' });
        const safeName = (accountName || 'default').replace(/[^a-zA-Z0-9_\- ]/g, '_');
        const filePath = path.join(CSV_DIR, `${safeName}.json`);
        fs.writeFileSync(filePath, JSON.stringify({ accountName: accountName || 'CSV', rows }), 'utf8');
        console.log(`CSV saved [${safeName}]: ${rows.length - 1} rows`);
        res.json({ ok: true, count: rows.length - 1, accountName });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/load-csv', (req, res) => {
    try {
        const files = fs.readdirSync(CSV_DIR).filter(f => f.endsWith('.json'));
        const all = files.map(f => {
            const data = JSON.parse(fs.readFileSync(path.join(CSV_DIR, f), 'utf8'));
            return { accountName: data.accountName, rows: data.rows };
        });
        console.log(`CSV load: ${all.length} account(s), ${all.reduce((s,a) => s + a.rows.length - 1, 0)} total rows`);
        res.json({ accounts: all });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/delete-csv/:accountName', (req, res) => {
    try {
        const safeName = req.params.accountName.replace(/[^a-zA-Z0-9_\- ]/g, '_');
        const filePath = path.join(CSV_DIR, `${safeName}.json`);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── OAuth redirect handler (production Wells Fargo flow) ─────────────────────
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

if (hasCerts) {
    const httpsOptions = {
        key:  fs.readFileSync(KEY_FILE),
        cert: fs.readFileSync(CERT_FILE),
    };
    https.createServer(httpsOptions, app).listen(PORT, () => {
        console.log(`\nFinance server (HTTPS): https://localhost:${PORT}`);
        console.log(`Environment:            ${process.env.PLAID_ENV || 'sandbox'}`);
        if (IS_PROD) console.log(`Redirect URI:           ${REDIRECT_URI}`);
    });
} else {
    app.listen(PORT, () => {
        console.log(`\nFinance server (HTTP): http://localhost:${PORT}`);
        console.log(`Environment:           ${process.env.PLAID_ENV || 'sandbox'}`);
        console.log(`Run 'mkcert localhost' in this folder to enable HTTPS for production.`);
    });
}
