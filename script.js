/* ══════════════════════════════════════════
   Tab switching
══════════════════════════════════════════ */
function showTab(id, el) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.sheet').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    el.classList.add('active');
    if (id === 'subscription') renderDetectedSubscriptions();
    if (id === 'monthly-real') renderMonthlyReal();
    if (id === 'income') { renderIncomeDocsList(); renderIncomeStatementRates(); }
    if (id === 'ai-analyze') aiInit();
    if (id === 'app-settings') appSettingsInit();
}

/* ══════════════════════════════════════════
   Monthly Real — Budget vs. Actual
══════════════════════════════════════════ */
let _realMonthOffset = 0; // 0 = current month, -1 = last month, etc.

function _realMonthKey(offset) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + offset);
    return d.toISOString().slice(0, 7); // "YYYY-MM"
}

function shiftRealMonth(dir) {
    _realMonthOffset += dir;
    // Don't allow going into the future
    if (_realMonthOffset > 0) _realMonthOffset = 0;
    renderMonthlyReal();
}

function renderMonthlyReal() {
    const monthKey = _realMonthKey(_realMonthOffset);
    const [year, mon] = monthKey.split('-');
    const label = new Date(parseInt(year), parseInt(mon) - 1, 1)
        .toLocaleString('en-US', { month: 'long', year: 'numeric' });

    const labelEl = document.getElementById('realMonthLabel');
    if (labelEl) labelEl.textContent = label;

    // Hide next-arrow if already at current month
    const nextBtn = document.querySelector('.real-nav-btn:last-of-type');
    if (nextBtn) nextBtn.style.visibility = _realMonthOffset >= 0 ? 'hidden' : 'visible';

    renderMonthlyRealIncome(monthKey);

    const body  = document.getElementById('realTableBody');
    const foot  = document.getElementById('realTableFoot');
    const noData = document.getElementById('realNoData');
    if (!body || !foot) return;

    // Compute actual spending per category for the chosen month from Plaid data
    const monthTxns = ccTransactions.filter(t =>
        t.isoDate && t.isoDate.startsWith(monthKey) &&
        t.amount < 0 &&
        !CC_EXCLUDE_FROM_SPEND.has(t.category)
    );

    const actualByCategory = {};
    monthTxns.forEach(t => {
        actualByCategory[t.category] = (actualByCategory[t.category] || 0) + (-t.amount);
    });

    if (ccTransactions.length === 0) {
        body.innerHTML = '';
        foot.innerHTML = '';
        if (noData) noData.style.display = '';
        return;
    }
    if (noData) noData.style.display = 'none';

    // Build unified category list (same order as Categories & Budgets in Edit tab)
    const builtInSet = new Set(CC_CATEGORY_NAMES);
    const expByName  = {};
    expenses.forEach(e => { if (e.name) expByName[e.name] = e; });

    const shownNames = new Set();
    const rows = [];

    // Built-in CC categories first (fixed order)
    CC_CATEGORY_NAMES.forEach(name => {
        const budget = expByName[name] ? expByName[name].value : 0;
        const actual = actualByCategory[name] || 0;
        rows.push({ name, budget, actual });
        shownNames.add(name);
    });

    // User-added categories (not built-in)
    expenses.forEach(e => {
        if (e.name && !shownNames.has(e.name)) {
            const actual = actualByCategory[e.name] || 0;
            rows.push({ name: e.name, budget: e.value, actual });
            shownNames.add(e.name);
        }
    });

    // Auto-detected subscriptions total
    const subActual = subscriptions.reduce((s, sub) => s + sub.value, 0);

    let totalBudget = 0, totalActual = 0;

    body.innerHTML = rows.map(({ name, budget, actual }) => {
        totalBudget += budget;
        totalActual += actual;
        const diff = budget - actual;
        const hasBudget = budget > 0;
        const hasActual = actual > 0;
        const diffColor = diff >= 0 ? '#27ae60' : '#c0392b';
        const diffSign  = diff >= 0 ? '+' : '';

        return `<tr class="real-row">
            <td class="real-td-cat">${name}</td>
            <td class="real-td-num real-budget">${hasBudget ? '$' + fmt(budget, 0) : '<span class="real-zero">—</span>'}</td>
            <td class="real-td-num real-actual">${hasActual ? '$' + fmt(actual, 0) : '<span class="real-zero">$0</span>'}</td>
            <td class="real-td-num real-diff" style="color:${hasBudget || hasActual ? diffColor : '#ccc'}">${hasBudget || hasActual ? diffSign + '$' + fmt(Math.abs(diff), 0) : '—'}</td>
        </tr>`;
    }).join('');

    const totalDiff  = totalBudget - totalActual;
    const totalColor = totalDiff >= 0 ? '#27ae60' : '#c0392b';
    const totalSign  = totalDiff >= 0 ? '+' : '';
    foot.innerHTML = `<tr class="real-foot-row">
        <td class="real-td-cat"><strong>Total</strong></td>
        <td class="real-td-num real-budget"><strong>$${fmt(totalBudget, 0)}</strong></td>
        <td class="real-td-num real-actual"><strong>$${fmt(totalActual, 0)}</strong></td>
        <td class="real-td-num real-diff" style="color:${totalColor};font-weight:700;">${totalSign}$${fmt(Math.abs(totalDiff), 0)}</td>
    </tr>`;
}

// Parses a US-style "M/D/YYYY" date string (as extracted from an income document) to a "YYYY-MM" key.
function _parseUSDateToMonthKey(dateStr) {
    if (!dateStr) return null;
    const m = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (!m) return null;
    let [, mo, , yr] = m;
    if (yr.length === 2) yr = '20' + yr;
    return `${yr}-${mo.padStart(2, '0')}`;
}

// Income actuals for the Monthly Real sheet — sourced from uploaded income documents only
// (independent of Plaid/CSV transactions, which explicitly exclude payroll/income categories).
function renderMonthlyRealIncome(monthKey) {
    const body   = document.getElementById('realIncomeTableBody');
    const noData = document.getElementById('realIncomeNoData');
    if (!body) return;

    const rows = [];
    ['paystub', 'bonus'].forEach(cat => {
        const doc = incomeDocs[cat];
        if (!doc) return;
        const dm = _parseUSDateToMonthKey(doc.fields.payDate);
        if (dm && dm !== monthKey) return;
        rows.push({
            label:    INCOME_DOC_LABELS[cat],
            amount:   doc.fields.grossPay,
            withheld: (doc.fields.fedWithheld || 0) + (doc.fields.stateWithheld || 0),
            fileName: doc.fileName,
        });
    });
    const rsu = incomeDocs.rsu;
    if (rsu) {
        const dm = _parseUSDateToMonthKey(rsu.fields.vestDate);
        if (!dm || dm === monthKey) {
            const amount = (rsu.fields.shares != null && rsu.fields.pricePerShare != null)
                ? rsu.fields.shares * rsu.fields.pricePerShare : null;
            rows.push({
                label:    INCOME_DOC_LABELS.rsu,
                amount,
                withheld: (rsu.fields.fedWithheld || 0) + (rsu.fields.stateWithheld || 0),
                fileName: rsu.fileName,
            });
        }
    }
    const w2 = incomeDocs.w2;
    if (w2) {
        rows.push({
            label:    INCOME_DOC_LABELS.w2 + ' (annual)',
            amount:   w2.fields.w2Box1,
            withheld: w2.fields.w2Box2,
            fileName: w2.fileName,
        });
    }

    if (rows.length === 0) {
        body.innerHTML = '';
        if (noData) noData.style.display = '';
        return;
    }
    if (noData) noData.style.display = 'none';

    body.innerHTML = rows.map(r => `<tr class="real-row">
        <td class="real-td-cat">${r.label}</td>
        <td class="real-td-num real-actual">${r.amount != null ? '$' + fmt(r.amount, 0) : '<span class="real-zero">—</span>'}</td>
        <td class="real-td-num">${r.withheld ? '$' + fmt(r.withheld, 0) : '<span class="real-zero">—</span>'}</td>
        <td class="real-td-cat" style="font-size:11px;color:#999;">${r.fileName}</td>
    </tr>`).join('');
}

function detectSubscriptions() {
    if (!ccTransactions.length) return [];
    // Group by exact description + exact amount (cents) + exact day of month
    const groups = {};
    ccTransactions
        .filter(t => t.amount < 0 && t.isoDate && t.isoDate.length >= 10)
        .forEach(t => {
            const day = t.isoDate.slice(8, 10);
            const key = `${t.desc}|||${Math.round(t.amount * 100)}|||${day}`;
            if (!groups[key]) groups[key] = {
                name:   t.desc,
                amount: -t.amount,
                day:    parseInt(day),
                months: new Set()
            };
            groups[key].months.add(t.isoDate.slice(0, 7));
        });
    return Object.values(groups)
        .filter(g => g.months.size >= 2)
        .sort((a, b) => b.amount - a.amount);
}

let _detectedSubs = [];

function renderDetectedSubscriptions() {
    const el = document.getElementById('detectedSubsList');
    if (!el) return;
    if (!ccTransactions.length) {
        el.innerHTML = '<p class="sub-empty">Sync your bank to auto-detect recurring charges.</p>';
        return;
    }
    const confirmedNames = new Set(subscriptions.map(s => s.name));
    _detectedSubs = detectSubscriptions().filter(g => !confirmedNames.has(g.name));
    if (!_detectedSubs.length) {
        el.innerHTML = '<p class="sub-empty">No new recurring charges detected.</p>';
        return;
    }
    el.innerHTML = _detectedSubs.map((g, i) => `
        <div class="sub-detect-row">
            <div class="sub-detect-info">
                <span class="sub-detect-name">${escapeHtml(g.name)}</span>
                <span class="sub-detect-meta">Day ${g.day} of month &nbsp;·&nbsp; ${g.months.size} months seen</span>
            </div>
            <div class="sub-detect-right">
                <span class="sub-detect-amt">$${fmt(g.amount, 2)}/mo</span>
                <button class="sub-confirm-btn" onclick="confirmSubscription(${i})">+ Confirm</button>
            </div>
        </div>`).join('');
}

function confirmSubscription(idx) {
    const g = _detectedSubs[idx];
    if (!g) return;
    subscriptions.push({ id: ++subId, name: g.name, value: g.amount });
    saveToStorage();
    renderSubscriptions();
    renderDetectedSubscriptions();
}

/* ══════════════════════════════════════════
   Helpers
══════════════════════════════════════════ */
function fmt(n, dec = 0) {
    return n.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function getVal(id) { const el = document.getElementById(id); return el ? (parseFloat(el.value) || 0) : 0; }
function setEl(id, val) { const el = document.getElementById(id); if (el) el.innerText = val; }

/* ══════════════════════════════════════════
   Clock — California / Pacific time
══════════════════════════════════════════ */
function updateClock() {
    const now  = new Date();
    const date = now.toLocaleDateString('en-US', {
        timeZone: 'America/Los_Angeles', month: '2-digit', day: '2-digit', year: 'numeric'
    });
    const time = now.toLocaleTimeString('en-US', {
        timeZone: 'America/Los_Angeles', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
    });
    document.getElementById('sidebarClock').innerHTML = date + '<br>' + time + ' PT';
}
updateClock();
setInterval(updateClock, 1000);

/* ══════════════════════════════════════════
   Monthly Expenses
══════════════════════════════════════════ */
let expId = 0;
let expenses = [];
let _expensesDirty = false;

function initExpenses() {
    // Seed with fixed costs + all transaction categories so budget aligns with actual spending
    [['Rent', 0], ['Car Lease', 0],
     ['Groceries', 0], ['Dining Out', 0], ['Gas & Auto', 0],
     ['Shopping', 0], ['Subscriptions', 0], ['Health', 0],
     ['Travel', 0], ['Utilities', 0], ['Entertainment', 0], ['Tithing', 0], ['Other', 0]]
    .forEach(([n, v]) => expenses.push({ id: ++expId, name: n, value: v }));
    renderExpenses();
}

// One-time repair: a since-fixed bug could re-run the "auto-add missing builtin
// category" logic against a stale copy of `expenses`, silently creating duplicate
// rows with the same name (which then made budget lookups pick whichever
// duplicate happened to be last, so edits appeared to "not save"). Merge
// same-name duplicates (keeping the first row's id, folding in any nonzero
// value a duplicate picked up), and collapse repeated blank "in progress"
// rows left over from failed category-add attempts down to a single one.
function dedupeExpenses() {
    const seen = new Map();
    const result = [];
    const blanks = [];
    expenses.forEach(e => {
        const key = (e.name || '').trim().toLowerCase();
        if (!key) { blanks.push(e); return; }
        const existing = seen.get(key);
        if (!existing) { seen.set(key, e); result.push(e); }
        else if (!existing.value && e.value) { existing.value = e.value; }
    });
    const keepBlanks = blanks.filter(e => e.value);
    if (blanks.length > keepBlanks.length) keepBlanks.push(blanks.find(e => !e.value));
    expenses = [...result, ...keepBlanks];
}

function addExpense() {
    const newId = ++expId;
    expenses.push({ id: newId, name: '', value: 0 });
    _expensesDirty = true;
    renderExpenses();
    saveToStorage();
    renderExpenseSaveBtn();
    // Scroll to and focus the new category's name input
    const newInput = document.getElementById('cat-name-' + newId);
    if (newInput) {
        newInput.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        newInput.focus();
    }
}

function deleteExpense(id) {
    expenses = expenses.filter(e => e.id !== id);
    _expensesDirty = true;
    renderExpenses();
    saveToStorage();
    renderExpenseSaveBtn();
}

function setExpenseName(id, name) {
    const exp = expenses.find(e => e.id === id);
    if (exp) exp.name = name;
    const lbl = document.getElementById('exp-lbl-' + id);
    if (lbl) lbl.textContent = name || '(unnamed)';
    _expensesDirty = true;
    renderExpenseSaveBtn();
    saveToStorage();
}

function setExpenseValue(id, val) {
    const exp = expenses.find(e => e.id === id);
    if (exp) exp.value = parseFloat(val) || 0;
    // Sync the other inputs (categories card ↔ Monthly Ideal)
    const catEl   = document.getElementById('cat-budget-' + id);
    const idealEl = document.getElementById('ideal-exp-'  + id);
    if (catEl   && catEl   !== document.activeElement) catEl.value   = val;
    if (idealEl && idealEl !== document.activeElement) idealEl.value = val;
    calculate();
    renderMonthlyReal();
    saveToStorage();
}

function renderExpenses() {
    scheduleDrawFlowArrows();
    renderCategories();

    // Monthly Ideal — editable amounts (synced)
    const idealList = document.getElementById('idealExpenseList');
    if (idealList) idealList.innerHTML = expenses.map(e => `
        <div class="box-row">
            <label id="exp-lbl-${e.id}">${e.name || '(unnamed)'}</label>
            <span class="money-wrap">$<input class="val-input" type="number" id="ideal-exp-${e.id}"
                  value="${e.value}"
                  oninput="setExpenseValue(${e.id}, this.value)"
                  onchange="setExpenseValue(${e.id}, this.value)"></span>
        </div>
    `).join('');

    calculate();
}

function renderExpenseSaveBtn() {
    // No-op: categories are auto-saved, no separate save button needed
}

function saveExpenseCategories() {
    const builtIn = new Set(CC_CATEGORY_NAMES);
    expenses.forEach(e => {
        if (e.name && !categoryKeywords[e.name]) categoryKeywords[e.name] = [];
    });
    const currentUserNames = new Set(expenses.map(e => e.name).filter(n => n));
    Object.keys(categoryKeywords).forEach(cat => {
        if (!builtIn.has(cat) && !currentUserNames.has(cat) && categoryKeywords[cat].length === 0) {
            delete categoryKeywords[cat];
        }
    });
    saveToStorage();
    renderCategories();
    if (typeof ccTransactions !== 'undefined' && ccTransactions.length > 0) reCategorizeAll();
    _expensesDirty = false;
}

/* ══════════════════════════════════════════
   Ideal Savings Rows (Budget Flow panel)
══════════════════════════════════════════ */
let idealSavId   = 0;
let idealSavings = [];
let _flowPcts    = { exp: 0, save: 0, leftover: 0 };

function addIdealSaving() {
    idealSavings.push({ id: ++idealSavId, name: '', value: 0 });
    renderIdealSavings();
    calculate();
}

function deleteIdealSaving(id) {
    idealSavings = idealSavings.filter(s => s.id !== id);
    renderIdealSavings();
    calculate();
}

function setIdealSavingName(id, name) {
    const s = idealSavings.find(s => s.id === id);
    if (s) s.name = name;
    saveToStorage();
}

function setIdealSavingValue(id, val) {
    const s = idealSavings.find(s => s.id === id);
    if (s) s.value = parseFloat(val) || 0;
    calculate();
}

function renderIdealSavings() {
    scheduleDrawFlowArrows();
    const list = document.getElementById('idealSavingsList');
    if (!list) return;
    list.innerHTML = idealSavings.map(s => `
        <div class="box-row flow-saving-row">
            <input type="text" class="flow-saving-name" value="${(s.name || '').replace(/"/g, '&quot;')}"
                   placeholder="Account name"
                   oninput="setIdealSavingName(${s.id}, this.value)">
            <span class="money-wrap">$<input class="val-input" type="number" value="${s.value}"
                  oninput="setIdealSavingValue(${s.id}, this.value)"
                  onchange="setIdealSavingValue(${s.id}, this.value)"></span>
            <button class="del-btn" onclick="deleteIdealSaving(${s.id})">×</button>
        </div>
    `).join('');
}

/* ══════════════════════════════════════════
   Legacy tithing migration
   Tithing used to be its own "% of avg post-tax income" flow bucket (Edit tab
   rows, separate from Expenses). It's now just a normal expense category —
   'Tithing' in CC_CATEGORY_NAMES — so it can be budgeted, auto-categorized
   from real transactions, and compared in Monthly Real like any other
   category. This one-time migration seeds the new 'Tithing' expense budget
   from whatever the old % rows used to compute, so existing users don't see
   their budgeted tithe amount silently drop to $0.
══════════════════════════════════════════ */
function migrateLegacyTithing() {
    if (localStorage.getItem('fc_tithe_migrated')) return;
    localStorage.setItem('fc_tithe_migrated', '1');
    try {
        const savedRows = JSON.parse(localStorage.getItem('fc_tithings') || 'null');
        if (!savedRows || savedRows.length === 0) return;
        const pct = savedRows.reduce((s, t) => s + (t.pct || 0), 0);
        if (pct <= 0) return;
        const amt = Math.round(computeAvgPostTax() * (pct / 100) * 100) / 100;
        const entry = expenses.find(e => e.name === 'Tithing');
        if (entry && !entry.value && amt > 0) entry.value = amt;
    } catch (e) {}
}

/* ══════════════════════════════════════════
   Subscriptions
══════════════════════════════════════════ */
let subId = 0;
let subscriptions = [];

function initSubscriptions() {
    renderSubscriptions();
}

function deleteSubscription(id) {
    subscriptions = subscriptions.filter(s => s.id !== id);
    saveToStorage();
    renderSubscriptions();
    renderDetectedSubscriptions();
}

function setSubName(id, name) {
    const sub = subscriptions.find(s => s.id === id);
    if (sub) sub.name = name;
    const lbl = document.getElementById('sub-lbl-' + id);
    if (lbl) lbl.textContent = name || '(unnamed)';
    saveToStorage();
}

function setSubValue(id, val) {
    const sub = subscriptions.find(s => s.id === id);
    if (sub) sub.value = parseFloat(val) || 0;
    // Sync amount in Subscription_List tab
    const amtEl = document.getElementById('sub-amt-' + id);
    if (amtEl) amtEl.textContent = fmt(sub.value, 2);
    calculate();
}

function renderSubscriptions() {
    // Subscription_List tab — confirmed list with delete buttons
    const display = document.getElementById('subListDisplay');
    if (display) {
        display.innerHTML = subscriptions.length === 0
            ? '<p class="sub-empty">No confirmed subscriptions yet. Confirm from detected list below.</p>'
            : subscriptions.map(s => `
                <div class="box-row">
                    <label>${escapeHtml(s.name || '(unnamed)')}</label>
                    <span style="display:flex;align-items:center;gap:10px;">
                        <span>$${fmt(s.value, 2)}/mo</span>
                        <button class="del-btn" onclick="deleteSubscription(${s.id})" title="Remove">×</button>
                    </span>
                </div>`).join('');
    }
    calculate();
}

/* ══════════════════════════════════════════
   RSU vest months
══════════════════════════════════════════ */
let VEST_MONTHS = [2, 5, 8, 11]; // Feb, May, Aug, Nov — overridden by checkboxes in Edit tab

function getVestMonths() {
    const checked = document.querySelectorAll('.vest-chk:checked');
    if (checked.length === 0) return VEST_MONTHS; // fallback to default
    return [...checked].map(el => parseInt(el.value));
}

/* ══════════════════════════════════════════
   Progressive tax bracket tables — 2025
══════════════════════════════════════════ */
const TAX_CONFIG = {
    federal: {
        single: {
            stdDed:   15000,
            brackets: [[11925,0.10],[48475,0.12],[103350,0.22],[197300,0.24],[250525,0.32],[626350,0.35],[Infinity,0.37]],
        },
        mfj: {
            stdDed:   30000,
            brackets: [[23850,0.10],[96950,0.12],[206700,0.22],[394600,0.24],[501050,0.32],[751600,0.35],[Infinity,0.37]],
        },
    },
    california: {
        single: {
            stdDed:   5363,
            brackets: [[10756,0.01],[25499,0.02],[40245,0.04],[55866,0.06],[70606,0.08],[360659,0.093],[432787,0.103],[721314,0.113],[Infinity,0.123]],
        },
        mfj: {
            stdDed:   10726,
            brackets: [[21512,0.01],[50998,0.02],[80490,0.04],[111732,0.06],[141212,0.08],[721318,0.093],[865574,0.103],[Infinity,0.123]],
        },
    },
};
const SS_WAGE_BASE = 176100;  // 2025

function calcBracketTax(grossIncome, { stdDed, brackets }) {
    const taxable = Math.max(0, grossIncome - stdDed);
    let tax = 0, prev = 0;
    for (const [cap, rate] of brackets) {
        if (taxable <= prev) break;
        tax += (Math.min(taxable, cap) - prev) * rate;
        if (cap === Infinity) break;
        prev = cap;
    }
    return tax;
}

// Standalone avg-post-tax-income calc, mirroring the income/tax portion of calculate()
// below. Used only by migrateLegacyTithing() so it can run before the DOM/expenses
// state calculate() writes into is necessarily ready.
function computeAvgPostTax() {
    const base      = getVal('base');
    const refresher = getVal('refresher');
    const rsu       = getVal('rsu');
    const bonusPct  = getVal('bonusPct');
    const bonus     = base * (bonusPct / 100);
    const annual    = base + refresher + rsu + bonus;

    const filing  = document.getElementById('filingStatus')?.value || 'single';
    const chk     = id => { const el = document.getElementById(id); return el ? el.checked : true; };
    const fedCfg  = TAX_CONFIG.federal[filing];
    const caCfg   = TAX_CONFIG.california[filing];
    const medThreshold = filing === 'mfj' ? 250000 : 200000;

    const fedTax  = chk('chkFed')   ? calcBracketTax(annual, fedCfg) : 0;
    const caTax   = chk('chkState') ? calcBracketTax(annual, caCfg)  : 0;
    const ssTax   = chk('chkSS')    ? Math.min(annual, SS_WAGE_BASE) * 0.062 : 0;
    const medBase = chk('chkMed')   ? annual * 0.0145 : 0;
    const medAddl = chk('chkMed') && annual > medThreshold ? (annual - medThreshold) * 0.009 : 0;
    const medTax  = medBase + medAddl;
    const sdiTax  = chk('chkSDI')  ? annual * 0.011 : 0;

    const totalTax = fedTax + caTax + ssTax + medTax + sdiTax;
    const netRate  = annual > 0 ? 1 - totalTax / annual : 1;
    return annual * netRate / 12;
}

/* ══════════════════════════════════════════
   Main calculate
══════════════════════════════════════════ */
function calculate() {
    // ── Income ──
    const base      = getVal('base');
    const refresher = getVal('refresher');
    const rsu       = getVal('rsu');
    const bonusPct  = getVal('bonusPct');
    const bonus     = base * (bonusPct / 100);
    const annual    = base + refresher + rsu + bonus;

    document.querySelectorAll('.bonus-pct-lbl').forEach(el => el.innerText = bonusPct);
    setEl('baseDisplay',        fmt(base));
    setEl('refresherDisplay',   fmt(refresher));
    setEl('rsuDisplay',         fmt(rsu));
    setEl('bonusAnnualDisplay', fmt(bonus, 0));
    setEl('annualTotal',        '$' + fmt(annual));
    setEl('monthlyAvg',         '$' + fmt(annual / 12));
    // Post-tax monthly avg set after tax is computed (updated below)

    // ── Progressive Tax ──
    const filing  = document.getElementById('filingStatus')?.value || 'single';
    const chk     = id => { const el = document.getElementById(id); return el ? el.checked : true; };

    const fedCfg  = TAX_CONFIG.federal[filing];
    const caCfg   = TAX_CONFIG.california[filing];
    const medThreshold = filing === 'mfj' ? 250000 : 200000;

    const fedTax  = chk('chkFed')   ? calcBracketTax(annual, fedCfg) : 0;
    const caTax   = chk('chkState') ? calcBracketTax(annual, caCfg)  : 0;
    const ssTax   = chk('chkSS')    ? Math.min(annual, SS_WAGE_BASE) * 0.062 : 0;
    const medBase = chk('chkMed')   ? annual * 0.0145 : 0;
    const medAddl = chk('chkMed') && annual > medThreshold ? (annual - medThreshold) * 0.009 : 0;
    const medTax  = medBase + medAddl;
    const sdiTax  = chk('chkSDI')  ? annual * 0.011 : 0;

    const totalTax   = fedTax + caTax + ssTax + medTax + sdiTax;
    const effectiveR = annual > 0 ? totalTax / annual : 0;
    const netRate    = 1 - effectiveR;

    // Effective rates for display in Edit tab
    const fedEff  = annual > 0 ? fedTax / annual * 100 : 0;
    const caEff   = annual > 0 ? caTax  / annual * 100 : 0;
    const ssEff   = annual > 0 ? ssTax  / annual * 100 : 0;
    const medEff  = annual > 0 ? medTax / annual * 100 : 0;
    const sdiEff  = annual > 0 ? sdiTax / annual * 100 : 0;
    setEl('fedEffRate',   chk('chkFed')   ? `~${fmt(fedEff,  1)}% eff.` : '—');
    setEl('caEffRate',    chk('chkState') ? `~${fmt(caEff,   1)}% eff.` : '—');
    setEl('ssEffRate',    chk('chkSS')    ? `~${fmt(ssEff,   2)}%`      : '—');
    setEl('medEffRate',   chk('chkMed')   ? `~${fmt(medEff,  2)}%`      : '—');
    setEl('sdiEffRate',   chk('chkSDI')   ? `~${fmt(sdiEff,  2)}%`      : '—');
    setEl('totalEffRate', `~${fmt(effectiveR * 100, 1)}% total effective`);

    // Tax note shown on the main sheet tabs
    const taxParts = [];
    if (chk('chkFed'))   taxParts.push(`Fed ~${fmt(fedEff,1)}%`);
    if (chk('chkState')) taxParts.push(`CA ~${fmt(caEff,1)}%`);
    if (chk('chkSS'))    taxParts.push(`SS ${fmt(ssEff,2)}%`);
    if (chk('chkMed'))   taxParts.push(`Medicare ${fmt(medEff,2)}%`);
    if (chk('chkSDI'))   taxParts.push(`SDI ${fmt(sdiEff,2)}%`);
    const taxNote = taxParts.join('<br>');
    const noteEl1 = document.getElementById('taxRateNoteAnnual');
    const noteEl2 = document.getElementById('taxRateNoteMonthly');
    if (noteEl1) noteEl1.innerHTML = taxNote;
    if (noteEl2) noteEl2.innerHTML = taxNote;

    // PostTax Annual per source (prorated by effective rate)
    const baseTax      = base      * effectiveR;
    const refresherTax = refresher * effectiveR;
    const rsuTax       = rsu       * effectiveR;
    const bonusTax     = bonus     * effectiveR;

    setEl('postTaxAnnual',   fmt(annual * netRate,    0));
    setEl('baseTaxAmt',      fmt(baseTax,             0));
    setEl('baseNet',         fmt(base * netRate,      0));
    setEl('refresherTaxAmt', fmt(refresherTax,        0));
    setEl('refresherNet',    fmt(refresher * netRate, 0));
    setEl('rsuTaxAmt',       fmt(rsuTax,              0));
    setEl('rsuNet',          fmt(rsu * netRate,       0));
    setEl('bonusTaxAmt',     fmt(bonusTax,            0));
    setEl('bonusNet',        fmt(bonus * netRate,     0));
    setEl('totalTaxAmt',     fmt(totalTax,            0));

    // Post-tax monthly average (annual income * netRate / 12)
    setEl('monthlyAvgPostTax', '$' + fmt(annual * netRate / 12));

    // ── Pretax Monthly — RSU vest logic ──
    const vestMonths  = getVestMonths();
    const isVestMonth = vestMonths.includes(new Date().getMonth() + 1);
    const rsuVest1 = rsu / 4;
    const rsuVest2 = refresher / 4;
    const rsuM1    = isVestMonth ? rsuVest1 : 0;
    const rsuM2    = isVestMonth ? rsuVest2 : 0;

    const baseMonthly   = base / 12;
    const bonusMonthly  = bonus / 12;
    const preTaxMonthly = baseMonthly + rsuM1 + rsuM2 + bonusMonthly;

    setEl('baseMonthlyDisplay',  fmt(baseMonthly,   0));
    setEl('bonusMonthlyDisplay', fmt(bonusMonthly,  0));
    setEl('preTaxMonthlyTotal',  '$' + fmt(preTaxMonthly));

    const blue = 'color:#1558b0';
    const gray = 'color:#999';

    document.getElementById('rsu1MonthlyDisplay').innerHTML = isVestMonth
        ? `<span style="${blue}">$${fmt(rsuVest1)}</span>`
        : `<span style="${gray}">$0 (not vest month)</span>`;
    document.getElementById('rsu2MonthlyDisplay').innerHTML = isVestMonth
        ? `<span style="${blue}">$${fmt(rsuVest2)}</span>`
        : `<span style="${gray}">$0 (not vest month)</span>`;

    // ── PostTax Monthly per source ──
    const baseMonthlyTax  = baseMonthly  * effectiveR;
    const bonusMonthlyTax = bonusMonthly * effectiveR;
    const rsuM1Tax        = rsuM1 * effectiveR;
    const rsuM2Tax        = rsuM2 * effectiveR;
    const totalMonthlyTax = preTaxMonthly * effectiveR;

    setEl('postTaxMonthly',     fmt(preTaxMonthly * netRate, 0));
    setEl('baseMonthlyTax',     fmt(baseMonthlyTax,          0));
    setEl('baseMonthlyNet',     fmt(baseMonthly * netRate,   0));
    setEl('bonusMonthlyTax',    fmt(bonusMonthlyTax,         0));
    setEl('bonusMonthlyNet',    fmt(bonusMonthly * netRate,  0));
    setEl('totalMonthlyTaxAmt', fmt(totalMonthlyTax,         0));

    document.getElementById('rsu1MonthlyPostDisplay').innerHTML = isVestMonth
        ? `<span style="${blue}">−$${fmt(rsuM1Tax)} = $${fmt(rsuM1 * netRate)}</span>`
        : `<span style="${gray}">$0 (not vest month)</span>`;
    document.getElementById('rsu2MonthlyPostDisplay').innerHTML = isVestMonth
        ? `<span style="${blue}">−$${fmt(rsuM2Tax)} = $${fmt(rsuM2 * netRate)}</span>`
        : `<span style="${gray}">$0 (not vest month)</span>`;

    const avgPostTax = annual * netRate / 12;

    // ── Monthly Expenses total (regular, incl. Tithing budget + subscriptions) ──
    const regTotal = expenses.reduce((s, e) => s + e.value, 0);
    const subTotal = subscriptions.reduce((s, sub) => s + sub.value, 0);

    setEl('subTotalDisplay', fmt(subTotal, 2));
    setEl('expTotal',        fmt(regTotal + subTotal, 2));

    // Keep Subscription_List tab total in sync
    const subListTotalEl = document.getElementById('subListTotal');
    if (subListTotalEl) subListTotalEl.innerText = fmt(subTotal, 2);

    // ── Budget Flow panel (all based on avg post-tax for consistency) ──
    const savingsAmt  = idealSavings.reduce((s, r) => s + r.value, 0);
    const afterExp    = avgPostTax - (regTotal + subTotal);
    const leftover    = afterExp - savingsAmt;

    setEl('flowIncome',       fmt(annual * netRate / 12, 0));
    setEl('flowSavingsTotal', fmt(savingsAmt, 2));

    const leftoverEl = document.getElementById('flowLeftover');
    if (leftoverEl) {
        leftoverEl.textContent = (leftover < 0 ? '-$' : '$') + fmt(Math.abs(leftover), 0);
        leftoverEl.style.color = leftover >= 0 ? '#27ae60' : '#c0392b';
    }

    // Store percentages for arrow labels and pie chart
    if (avgPostTax > 0) {
        _flowPcts.exp      = (regTotal + subTotal) / avgPostTax * 100;
        _flowPcts.save     = savingsAmt / avgPostTax * 100;
        _flowPcts.leftover = leftover / avgPostTax * 100;
    } else {
        _flowPcts = { exp: 0, save: 0, leftover: 0 };
    }

    scheduleDrawFlowArrows();
    scheduleDrawIdealPie();
    renderIncomeStatementRates();
    saveToStorage();
}

/* ══════════════════════════════════════════
   CC Analytics — categories & analysis
══════════════════════════════════════════ */
// Comprehensive restaurant chain list — matched against transaction descriptions
const DINING_CHAINS = [
    // Burger / Fast Food
    'five guys','shake shack','whataburger','wingstop','raising cane','culver',
    'sonic drive','sonic ','jack in the box','in-n-out','in n out','habit burger',
    'smashburger','fatburger','mooyah','backyard burger','del taco','del tac',
    'steak n shake','steak\'n shake','rally\'s','rallys','checkers ','hardee',
    'arby\'s','arbys','arby ','carl\'s jr','carls jr','bojangle','cookout','cook out',
    'zaxby','freddy\'s','freddys','slim chicken','whataburg',
    // Chicken
    'raising cane','zaxby','bojangle','popeye','chick-fil','wingstop','slim chicken',
    'el pollo loco','pollo tropical',
    // Pizza
    'papa john','papa murph','little caesar','round table pizza','jet\'s pizza','jet pizza',
    'hungry howie','sbarro','godfather pizza','cici\'s','cicis','zpizza','blaze pizza',
    'mod pizza','mod mkt','pieology',
    // Mexican / Tex-Mex
    'chipotle','qdoba','moe\'s sw','moes sw','taco john','taco bueno','taco cabana',
    'baja fresh','del taco','tijuana flats','chronic tacos','freebirds',
    // Sandwich / Sub
    'jersey mike','jimmy john','firehouse sub','mcalister','which wich','schlotzsky',
    'quizno','blimpie','potbelly','portillo',
    // Casual Dining / Sit-Down
    'applebee','chili\'s','chilis','tgi friday','t.g.i.','red lobster','olive garden',
    'longhorn steakhouse','longhorn steak','outback steakhouse','outback ','texas roadhouse',
    'texas de brazil','denny\'s','dennys','ihop','cracker barrel','bob evans',
    'waffle house','buffalo wild wing','b-dubs','bdubs','red robin','ruby tuesday',
    'yard house','seasons 52','cheesecake factory','pf chang','p.f. chang',
    'benihana','golden corral','noodles & co','noodles and co','corner bakery',
    'jason\'s deli','jasons deli','cosi ','bonefish grill','first watch',
    'the melting pot','dave & buster','dave and buster','hooters','twin peaks',
    // Asian Chains
    'panda express','pei wei','gen korean','boiling crab','yoshinoya','p.f. chang',
    // Coffee / Bakery / Smoothie
    'tim horton','dutch bros','caribou coffee','biggby','scooter\'s coffee','scooters coffee',
    'coffee bean','the coffee bean','tropical smoothie','jamba','smoothie king',
    // Ice Cream / Dessert
    'baskin-robbins','baskin robbins','cold stone','marble slab','ben & jerry',
    'dairy queen','oberweis','handel\'s','rita\'s italian','yogurtland','menchie',
    // Bakery / Snacks
    'auntie anne','cinnabon','wetzel','great american cookie','mrs fields',
    'nothing bundt','panera','einstein bagel','bruegger',
    // Delivery Platforms (always dining)
    'doordash','uber eat','ubereats','grubhub','postmates','caviar ','gopuff',
    // POS system prefixes common at restaurants
    'tst* ','sq *','toasttab','clover ','olo ','revel ',
];

const CC_CATEGORIES = [
    { name: 'Groceries',     keywords: ['safeway','trader joe','wholefds','whole foods','kroger','heb ','costco','ralphs','vons','albertsons','sprouts','publix','99 ranch','h mart','grocery','supermarket','food 4 less','smart & final','winco','aldi','fresh market','weee','wee '] },
    { name: 'Dining Out',    keywords: ['starbucks','mcdonald','subway','pizza','burger','taco bell','wendys','chick-fil','panda','peet','dunkin','panera','restaurant','kitchen','eatery','grill','bistro','cafe','deli','bbq','ramen','sushi','thai food','lounge',...DINING_CHAINS] },
    { name: 'Gas & Auto',    keywords: ['shell oil','chevron','exxon','bp ','mobil','arco','circle k','marathon','speedway','sunoco','conoco',' gas ','fuel','jiffy lube','autozone','advance auto','pep boys','car wash','parking','dmv '] },
    { name: 'Shopping',      keywords: ['amazon','amzn','ebay','etsy','walmart','target','best buy','home depot','lowes','ikea','macy','nordstrom','zara','h&m','tjmaxx','tj maxx','marshalls','ross ','gap ','old navy','banana republic','wayfair','chewy','petco','petsmart','dollar tree','five below','nike','adidas','under armour','lululemon','uniqlo','shein','temu ','fashion nova','urban outfitter','free people','revolve'] },
    { name: 'Subscriptions', keywords: ['netflix','spotify','hulu','disney','youtube','apple.com/bill','google one','adobe','dropbox','microsoft','linkedin','amazon prime','audible','nytimes','wsj ','paramount','peacock','hbomax','espn ','crunchyroll','chatgpt','openai','claude'] },
    { name: 'Health',        keywords: ['cvs ','walgreens','rite aid','pharmacy','medical','dental','vision','optometry','urgent care','clinic','hospital','kaiser','blue shield','anthem','labcorp','quest diag','therapy','doctor'] },
    { name: 'Travel',        keywords: ['delta air','united air','southwest air','spirit air','american air','alaska air','frontier air','united.com','delta.com','aa.com','southwest.com','spirit.com','alaskaair.com','flyfrontier.com','jetblue','hotels.com','hotel','marriott','hilton','hyatt','airbnb','vrbo','expedia','booking.com','priceline','hertz','enterprise rent','national car','lyft','uber '] },
    { name: 'Utilities',     keywords: ['pg&e','pge ','sdge ','sce ','electric','water dept','at&t','verizon','t-mobile','comcast','xfinity','spectrum','cox comm','centurylink'] },
    { name: 'Entertainment', keywords: ['amc ','regal ','cinemark','ticketmaster','stubhub','steam ','playstation','xbox ','nintendo','twitch','patreon','eventbrite','bowling','golf','spa '] },
    { name: 'Transfers',     keywords: ['venmo','zelle','paypal','cash app','apple cash','transfer from','recurring transfer','online transfer','transfer credit','deposit from','payment from','mobile deposit'] },
    { name: 'Payment',       keywords: ['online payment','online pmt','e-payment','autopay','bill payment','web pmts','minimum payment'] },
];
const CC_EXCLUDE_FROM_SPEND = new Set(['Payment', 'Transfers']);

// Spending categories — a positive-amount transaction in these is a refund/return, not income
const SPENDING_CATS = new Set([
    'Groceries', 'Dining Out', 'Gas & Auto', 'Shopping',
    'Subscriptions', 'Health', 'Travel', 'Utilities', 'Entertainment', 'Tithing',
]);

// Keywords that signal a merchant refund even if the category wasn't auto-detected
const REFUND_KEYWORDS = [
    'refund', 'reversal', 'return credit', 'merchandise credit',
    'purchase return', 'credit adj', 'price adj', 'price match',
];

// Returns true if a positive-amount transaction is a store/merchant refund
// (not actual income like a paycheck, tax refund, or transfer from a person)
function isRefundTxn(t) {
    if (!t || t.amount <= 0) return false;
    // Strongest signal: a prior charge with the exact same description + cent amount.
    // Catches refunds in any category (incl. 'Other'), e.g. "a.saily London GB" +$34.99
    // cancelling an earlier −$34.99. Flagged by flagExactRefunds() after each merge.
    if (t._exactRefund) return true;
    // Plaid classifies credit card returns as TRANSFER_IN — treat them as refunds
    if (t.plaidCategory === 'TRANSFER_IN' && t.accountType === 'credit') return true;
    const d = (t.desc || '').toLowerCase();
    if (REFUND_KEYWORDS.some(kw => d.includes(kw))) return true;
    return SPENDING_CATS.has(t.category);
}

// Flags a positive transaction as a refund when an earlier charge exists with the
// exact same description (case-insensitive) and the exact same cent amount.
function flagExactRefunds() {
    const norm = s => (s || '').trim().toLowerCase();
    const chargeKeys = {};   // "desc|||cents" -> earliest charge isoDate
    ccTransactions.forEach(t => {
        if (t.amount < 0) {
            const key = norm(t.desc) + '|||' + Math.round(Math.abs(t.amount) * 100);
            if (!chargeKeys[key] || (t.isoDate && t.isoDate < chargeKeys[key])) {
                chargeKeys[key] = t.isoDate || '';
            }
        }
    });
    ccTransactions.forEach(t => {
        if (t.amount <= 0) { t._exactRefund = false; return; }
        const key = norm(t.desc) + '|||' + Math.round(t.amount * 100);
        const chargeDate = chargeKeys[key];
        // Match exists, and the charge is dated on/before the credit (a refund follows its charge)
        t._exactRefund = chargeDate !== undefined &&
            (!chargeDate || !t.isoDate || chargeDate <= t.isoDate);
    });
}

// Fixed color per expense category — consistent across all charts
const CATEGORY_COLORS = {
    'Groceries':     '#3d9970',
    'Dining Out':    '#e07b39',
    'Gas & Auto':    '#d94f4f',
    'Shopping':      '#3d85c8',
    'Subscriptions': '#8e44ad',
    'Health':        '#16a085',
    'Travel':        '#d4ac0d',
    'Utilities':     '#7b8ea8',
    'Entertainment': '#c0392b',
    'Tithing':       '#7b4fc8',
    'Transfers':     '#95a5a6',
    'Payment':       '#bdc3c7',
    'Other':         '#a67c52',
};

// Account color palette — assigned in first-seen order
const ACCT_PALETTE = ['#5b8dd9','#5cb85c','#e09f3e','#9b59b6','#1abc9c','#e74c3c','#ff7675','#00b894'];
const _acctColorCache = {};
let   _acctColorIdx   = 0;
function getAccountColor(name) {
    if (!name) return '#aaa';
    if (!_acctColorCache[name]) _acctColorCache[name] = ACCT_PALETTE[_acctColorIdx++ % ACCT_PALETTE.length];
    return _acctColorCache[name];
}

function detectColumns(headers) {
    const norm = s => s.toLowerCase().replace(/[^a-z]/g, '');
    const hs = headers.map(norm);
    return {
        dateIdx:   hs.findIndex(h => h === 'date' || h.startsWith('date')),
        amountIdx: hs.findIndex(h => h.includes('amount') || h === 'debit' || h === 'credit'),
        descIdx:   hs.findIndex(h => h.includes('desc') || h.includes('detail') || h.includes('memo') || h.includes('payee') || h.includes('name')),
    };
}

// Second-pass hints: business-type words found in merchant names that signal a category
const DESCRIPTION_HINTS = {
    'Dining Out':    ['cuisine','restaurant','eatery','kitchen','grill','bistro','cafe','deli','bbq','ramen','sushi','lounge','noodle','taqueria','cantina','trattoria','izakaya','chophouse','steakhouse','seafood','hibachi','dim sum','tapas','brasserie','boba','bubble tea','creamery','creperie','patisserie','gelateria','pizzeria','thai','chinese','japanese','korean','vietnamese','indian','mediterranean','mexican','italian','greek','peruvian','ethiopian','pho','curry','brunch','breakfast diner','waffle','pancake','bagel'],
    'Groceries':     ['market','produce','grocery','supermarket','fresh '],
    'Health':        ['fitness','gym ','yoga','pilates','wellness','chiropractic','physical therapy','optometry','dermatology','orthodont','dental','vision care'],
    'Shopping':      ['boutique','jewel','salon','barber','apparel','clothing','fashion','thrift','consignment'],
    'Entertainment': ['theater','theatre','museum','gallery','arcade','escape room','bowling','miniature golf','trampoline'],
    'Travel':        ['resort','inn ','lodge','suites','motel','hostel','flight','airport','airline','airlines'],
};

function ccCategorizeFull(description) {
    const r = _ccCategorizeRaw(description);
    // A deleted built-in category no longer classifies — fall back to 'Other'
    if (r.cat !== 'Other' && deletedCats.has(r.cat)) return { cat: 'Other', sub: null };
    return r;
}

// Per-transaction category pins — for cases where keyword-based rules are too broad
// (e.g. "ZELLE TO A ROOMMATE" is Rent most months but a one-off Gift another month).
// Keyed by date+description+amount so it only ever matches that exact transaction, and
// checked ahead of keyword rules in categorizeTxn() so a pin always wins over a bulk rule.
let txnOverrides = {}; // { 'isoDate|desc|amountCents': 'Category' or 'Category::Sub' }

function txnOverrideKey(isoDate, desc, amount) {
    return (isoDate || '') + '|' + (desc || '').trim().toLowerCase() + '|' + Math.round((amount || 0) * 100);
}

function categorizeTxn(desc, isoDate, amount) {
    const override = txnOverrides[txnOverrideKey(isoDate, desc, amount)];
    if (override) {
        if (override.includes('::')) { const [cat, sub] = override.split('::'); return { cat, sub }; }
        return { cat: override, sub: null };
    }
    return ccCategorizeFull(desc);
}

function _ccCategorizeRaw(description) {
    const d = description.toLowerCase();
    // 1. Sub-category keywords (most specific — sets both cat and sub)
    for (const [cat, subs] of Object.entries(subCategories)) {
        for (const sub of subs) {
            const kws = subCatKeywords[cat + '__' + sub] || [];
            if (kws.some(kw => kw && d.includes(kw))) return { cat, sub };
        }
    }
    // 2. User-defined category keywords
    for (const [cat, kws] of Object.entries(categoryKeywords)) {
        if (kws.some(kw => kw && d.includes(kw))) return { cat, sub: null };
    }
    // 3. Built-in keyword lists
    for (const cat of CC_CATEGORIES) {
        if (cat.keywords.some(kw => d.includes(kw))) return { cat: cat.name, sub: null };
    }
    // 4. Description-hint second pass
    for (const [cat, hints] of Object.entries(DESCRIPTION_HINTS)) {
        if (hints.some(h => d.includes(h))) return { cat, sub: null };
    }
    return { cat: 'Other', sub: null };
}

function ccCategorize(description) {
    return ccCategorizeFull(description).cat;
}

const CATEGORY_EMOJI = {
    'Groceries':     '🥦',
    'Dining Out':    '🍣',
    'Gas & Auto':    '⛽',
    'Shopping':      '🛍️',
    'Subscriptions': '📱',
    'Health':        '💊',
    'Travel':        '🏝️',
    'Utilities':     '💡',
    'Entertainment': '🎮',
    'Transfers':     '🔄',
    'Payment':       '💳',
    'Other':         '🪣',
};

function saveOpenDetails(bodyId) {
    const body = document.getElementById(bodyId);
    if (!body) return new Set();
    const open = new Set();
    body.querySelectorAll('.cat-detail').forEach(detail => {
        if (detail.style.display !== 'none') {
            const row   = detail.previousElementSibling;
            const nameEl = row && row.querySelector('.cat-name');
            if (nameEl) open.add(nameEl.textContent.trim());
        }
    });
    return open;
}

function restoreOpenDetails(bodyId, openSet) {
    if (!openSet.size) return;
    const body = document.getElementById(bodyId);
    if (!body) return;
    body.querySelectorAll('.cat-row').forEach(row => {
        const nameEl = row.querySelector('.cat-name');
        if (!nameEl || !openSet.has(nameEl.textContent.trim())) return;
        const btn = row.querySelector('.cat-expand-btn');
        const m   = btn && btn.getAttribute('onclick').match(/'(cd-[^']+)'/);
        if (!m) return;
        const detail = document.getElementById(m[1]);
        if (detail) { detail.style.display = 'block'; if (btn) btn.textContent = '▼'; }
    });
}

/* global state for CC analytics */
let ccTransactions    = [];
let ccSelectedMonthEl = null;
let ccSelectedMonthKey = null;
let ccRawRows          = [];
let ccDateColIdx       = 0;
// 'charged' = spending chart (default), 'received' = incoming transfers chart
let _chartMode = 'charged';
// 'date' = newest → oldest  |  'alpha' = A-Z grouped by description
let _rawSortMode = 'date';
// 'amount' = largest first (default)  |  'alpha' = A-Z by category name
let _catSortMode = 'amount';

// Source-split state: CSV is the baseline, Plaid adds newer transactions
let csvTransactions   = [];   // transactions parsed from CSV upload
let plaidTransactions = [];   // ALL transactions returned by Plaid (raw, unfiltered)
let plaidCoverStart   = null; // earliest ISO date of Plaid txns added after CSV ends

// Metadata for each uploaded CSV file — persisted alongside transactions
// Each entry: { accountName, fileName, uploadedAt (ISO string), count }
let csvUploadMeta = [];

// ── Deduplication helpers ────────────────────────────────────────────────────

// Normalise a description for fuzzy matching:
// lowercase, strip punctuation/numbers, split into words ≥ 3 chars
function descWords(desc) {
    return new Set(
        desc.toLowerCase()
            .replace(/[^a-z ]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length >= 3)
    );
}

// Returns true if two descriptions share at least one meaningful word
function descOverlap(a, b) {
    const wa = descWords(a);
    const wb = descWords(b);
    for (const w of wa) if (wb.has(w)) return true;
    return false;
}

// Returns true if t_plaid is already represented in csvGroup (same-date/amount bucket).
// When only one CSV transaction is in the bucket, we accept it as a duplicate even
// without description overlap (amounts on the same day rarely collide by accident).
// When multiple CSV transactions share the same date+amount, require description overlap
// to avoid falsely deduplicating distinct charges of equal value (e.g., two $4.99 subs).
function isDuplicate(tPlaid, csvGroup) {
    if (csvGroup.length === 0) return false;
    if (csvGroup.length === 1) return true;           // unique date+amount → same txn
    return csvGroup.some(c => descOverlap(tPlaid.desc, c.desc));
}

// ── Core merge ───────────────────────────────────────────────────────────────

// After merging, rewrite t.month/t.mLabel on refunds so they appear in the
// purchase month everywhere (category panels, charts, totals) — not the refund arrival month.
function remapRefundMonths() {
    const charges = ccTransactions.filter(t =>
        !CC_EXCLUDE_FROM_SPEND.has(t.category) && t.amount < 0
    );
    ccTransactions.forEach(t => {
        if (!isRefundTxn(t)) return;
        const match = findMatchingCharge(t, charges);
        if (match && match.month !== t.month) {
            t.month  = match.month;
            t.mLabel = match.mLabel;
        }
    });
}

function mergeTxnSources() {
    // CSV data is now shown separately in the History (CSV Upload) tab.
    // The Expenses tab uses Plaid live data only.
    plaidCoverStart = plaidTransactions.length
        ? plaidTransactions.reduce((m, t) => (!m || t.isoDate < m ? t.isoDate : m), null)
        : null;

    ccTransactions = [...plaidTransactions]
        .sort((a, b) => b.isoDate.localeCompare(a.isoDate));

    flagExactRefunds();
    remapRefundMonths();
}

// Finds the original charge that a refund is canceling.
// Matches on: exact amount, same account (if known), charge before refund, within 180 days.
// Among candidates, prefers same category, then picks the most recent charge.
function findMatchingCharge(refund, charges) {
    const candidates = charges.filter(c => {
        if (Math.abs(-c.amount - refund.amount) > 25) return false;
        if (refund.accountName && c.accountName && refund.accountName !== c.accountName) return false;
        if (!c.isoDate || !refund.isoDate || c.isoDate >= refund.isoDate) return false;
        const daysDiff = (new Date(refund.isoDate) - new Date(c.isoDate)) / 86400000;
        return daysDiff <= 180;
    });
    if (!candidates.length) return null;
    const sameCat = candidates.filter(c => c.category === refund.category);
    const pool = sameCat.length ? sameCat : candidates;
    return pool.sort((a, b) => b.isoDate.localeCompare(a.isoDate))[0];
}

// Computes summary numbers from a transaction array.
// charges  = money spent (negative amounts, non-excluded categories)
// refunds  = store/merchant refunds (positive amounts in spending categories → reduce spending)
// received = true income (positive amounts that are NOT refunds)
// totalCharged = net spending (gross charges − refunds)
function computeSummary(txns) {
    const charges  = txns.filter(t => !CC_EXCLUDE_FROM_SPEND.has(t.category) && t.amount < 0);
    const allNonEx = txns.filter(t => !CC_EXCLUDE_FROM_SPEND.has(t.category)); // used by category charts
    const refunds  = txns.filter(t => isRefundTxn(t));
    const received = txns.filter(t => t.amount > 0 && !isRefundTxn(t));

    const grossCharged  = charges.reduce((s, t) => s - t.amount, 0);
    const totalRefunds  = refunds.reduce((s, t) => s + t.amount, 0);
    const totalCharged  = Math.max(0, grossCharged - totalRefunds); // net spending
    const totalReceived = received.reduce((s, t) => s + t.amount, 0);

    // Per-month breakdown
    const months = {};
    // Gross charges
    charges.forEach(t => {
        if (!months[t.month]) months[t.month] = { label: t.mLabel, total: 0, count: 0, received: 0 };
        months[t.month].total -= t.amount;
        months[t.month].count++;
    });
    // Refunds reduce monthly spending totals (t.month already remapped to purchase month by remapRefundMonths)
    refunds.forEach(t => {
        if (!months[t.month]) months[t.month] = { label: t.mLabel, total: 0, count: 0, received: 0 };
        months[t.month].total -= t.amount;
    });
    // True income per month (not refunds)
    received.forEach(t => {
        if (!t.month) return;
        if (!months[t.month]) months[t.month] = { label: t.mLabel, total: 0, count: 0, received: 0 };
        months[t.month].received = (months[t.month].received || 0) + t.amount;
    });

    // Always include the current calendar month so it appears even with no transactions yet
    const _now = new Date();
    const _currMonth = _now.toISOString().slice(0, 7);
    if (!months[_currMonth]) {
        months[_currMonth] = {
            label:    _now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
            total:    0,
            count:    0,
            received: 0,
        };
    }

    const sortedMonths = Object.entries(months).sort(([a],[b]) => b.localeCompare(a));
    const monthlyAvg   = sortedMonths.length ? totalCharged / sortedMonths.length : 0;
    return { charges, allNonEx, refunds, received, totalCharged, totalReceived, sortedMonths, monthlyAvg };
}

function updateSummaryCards({ charges, totalCharged, totalReceived, monthlyAvg }) {
    const el = document.getElementById('ccTotalCharged');  if (el) el.textContent = '$' + fmt(totalCharged, 2);
    const re = document.getElementById('ccTotalReceived'); if (re) re.textContent = '$' + fmt(totalReceived, 2);
    const tn = document.getElementById('ccTotalTxn');      if (tn) tn.textContent = charges.length + ' txns';
    const av = document.getElementById('ccMonthlyAvg');    if (av) av.textContent = '$' + fmt(monthlyAvg, 2);
}

function rebuildCCAnalyticsUI() {
    renderDetectedSubscriptions();
    renderMonthlyReal();
    if (ccTransactions.length === 0) return;
    // Reset mode to charged and reflect that in the card UI
    _chartMode = 'charged';
    document.querySelectorAll('.summary-card').forEach(el => el.classList.remove('summary-card-active'));
    const chargedCard = document.getElementById('card-charged');
    if (chargedCard) chargedCard.classList.add('summary-card-active');
    const { charges, allNonEx, totalCharged, totalReceived, sortedMonths, monthlyAvg } = computeSummary(ccTransactions);
    updateSummaryCards({ charges, totalCharged, totalReceived, monthlyAvg });
    document.getElementById('ccMonthlyBody').innerHTML    = renderMonthlyTable(sortedMonths, totalCharged, allNonEx, totalReceived);
    const el = document.getElementById('ccAnalytics');
    if (el) { el.style.display = 'flex'; el.style.flexDirection = 'column'; el.style.gap = '12px'; }
    const allDates = ccTransactions.map(t => t.isoDate).filter(Boolean).sort();
    if (allDates.length) {
        const fromEl   = document.getElementById('ccDateFrom');
        const toEl     = document.getElementById('ccDateTo');
        const todayISO = new Date().toISOString().slice(0, 10);
        // Expand from-date leftward so adding more accounts always shows all data
        if (fromEl && (!fromEl.value || allDates[0] < fromEl.value)) fromEl.value = allDates[0];
        // If Plaid data is present, always push to-date to today (live sync = current month visible)
        const newTo = plaidTransactions.length > 0 ? todayISO : allDates[allDates.length - 1];
        if (toEl && (!toEl.value || newTo > toEl.value)) toEl.value = newTo;
    }
    ccApplyDateFilter();
    renderUnifiedRawTable();
    renderTransferTriangle();
    renderRecentTransactions();
    renderZelleVenmoBox();
}

function toISO(s) {
    const p = s.split('/');
    return p.length === 3 ? `${p[2]}-${p[0].padStart(2,'0')}-${p[1].padStart(2,'0')}` : s;
}

// Determine the month key of the last CSV-only month (i.e. CSV cutover boundary)
function csvLastMonth() {
    if (!csvTransactions.length) return null;
    return csvTransactions
        .filter(t => t.isoDate)
        .reduce((m, t) => (t.isoDate > m ? t.isoDate : m), '').slice(0, 7);
}

// Builds the HTML for the Monthly Expenses table, inserting a Plaid boundary marker.
function renderMonthlyTable(sortedMonths, totalCharged, charges, totalReceived) {
    const lastCsvMonth = csvLastMonth();   // e.g. "2025-03"
    let dividerInserted = false;

    // Sum total received across all months shown
    const totalRcvd = sortedMonths.reduce((s, [, m]) => s + (m.received || 0), 0);

    const rows = sortedMonths.map(([key, m]) => {
        // Insert divider BEFORE the first Plaid-only month (newest month newer than CSV)
        let divider = '';
        if (!dividerInserted && plaidCoverStart && lastCsvMonth && key > lastCsvMonth) {
            // still in Plaid territory — nothing yet
        } else if (!dividerInserted && plaidCoverStart && lastCsvMonth && key <= lastCsvMonth) {
            const fmtDate = plaidCoverStart.slice(5,7) + '/' + plaidCoverStart.slice(0,4);
            divider = `<tr class="month-plaid-marker">
                <td colspan="4">⬆ Live (Plaid from ${fmtDate}) &nbsp;|&nbsp; Historical (CSV) ⬇</td>
            </tr>`;
            dividerInserted = true;
        }

        const isPlaidMonth = plaidCoverStart && lastCsvMonth && key > lastCsvMonth;
        const rowClass = `month-row${isPlaidMonth ? ' month-plaid' : ''}`;
        const rcvd = m.received || 0;
        // m.total is net (charges − refunds); can be negative if refunds exceed charges
        const spentDisplay = m.total >= 0
            ? `<span style="color:#c0392b;">$${fmt(m.total, 2)}</span>`
            : `<span style="color:#3d9970;" title="Net refunds this month">+$${fmt(-m.total, 2)}</span>`;

        return divider + `
            <tr class="${rowClass}" data-month="${key}" onclick="ccShowMonth('${key}', this)">
                <td>${key.slice(5,7)}/${key.slice(0,4)}${isPlaidMonth ? ' 🔵' : ''}</td>
                <td class="col-amt">${spentDisplay}</td>
                <td class="col-amt" style="color:#3d9970;">${rcvd > 0 ? '$' + fmt(rcvd, 2) : '—'}</td>
                <td class="col-pct">${m.count}</td>
            </tr>`;
    }).join('');

    // If all months are Plaid (no CSV loaded yet), add a header note
    const plaidOnlyNote = plaidCoverStart && !csvTransactions.length
        ? `<tr class="month-plaid-marker"><td colspan="4">🔵 Live data via Plaid</td></tr>` : '';

    return `<table class="analytics-table">
        <thead><tr>
            <th>Month</th>
            <th class="col-amt" style="color:#c0392b;">Spent</th>
            <th class="col-amt" style="color:#3d9970;">Received</th>
            <th class="col-pct">#</th>
        </tr></thead>
        <tbody>
            ${plaidOnlyNote}
            ${rows}
            <tr class="grand-total">
                <td>Total</td>
                <td class="col-amt" style="color:#c0392b;">$${fmt(totalCharged, 2)}</td>
                <td class="col-amt" style="color:#3d9970;">$${fmt(totalRcvd, 2)}</td>
                <td class="col-pct">${charges.length}</td>
            </tr>
        </tbody>
    </table>`;
}

function renderRecentTransactions() {
    const el = document.getElementById('recentTxnsBody');
    const countEl = document.getElementById('recentTxnsCount');
    if (!el) return;
    if (ccTransactions.length === 0) {
        el.innerHTML = '<p style="color:#999;font-size:13px;padding:12px;">No transactions loaded.</p>';
        if (countEl) countEl.textContent = '';
        return;
    }
    // ccTransactions is already sorted newest-first from mergeTxnSources.
    // The box itself is a fixed-height scroll area (see #recentTxnsBody in styles.css)
    // sized to roughly the old 20-row view — this cap just bounds DOM size, not what's visible.
    const RECENT_CAP = 300;
    const recent = ccTransactions.slice(0, RECENT_CAP);
    if (countEl) countEl.textContent = `showing ${recent.length} of ${ccTransactions.length}`;

    el.innerHTML = recent.map(t => {
        const isCredit = t.amount > 0;
        const amt = Math.abs(t.amount);
        const amtStr = (isCredit ? '+' : '−') + '$' + fmt(amt, 2);
        const amtColor = isCredit ? '#27ae60' : '#c0392b';
        const catColor = CATEGORY_COLORS[t.category] || '#888';
        const safeDesc = escapeHtml(t.desc);
        const acct = t.accountName ? `<span style="color:#aaa;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100px;">${escapeHtml(t.accountName)}</span>` : '';
        return `<div style="display:flex;align-items:center;gap:10px;padding:7px 14px;border-bottom:1px solid #f3f3f3;font-size:13px;">
            <span style="color:#999;font-size:11px;white-space:nowrap;min-width:74px;">${t.isoDate}</span>
            <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${safeDesc}">${safeDesc}</span>
            ${acct}
            <span style="font-size:11px;background:${catColor}18;color:${catColor};border-radius:3px;padding:1px 5px;white-space:nowrap;">${t.category}</span>
            <span style="font-weight:700;color:${amtColor};white-space:nowrap;min-width:68px;text-align:right;">${amtStr}</span>
        </div>`;
    }).join('');
}

// Zelle/Venmo are peer-to-peer payments that often stand in for a real expense (Zelling a
// roommate your half of rent, Venmo-ing someone back for dinner) but default-classify as
// "Transfers" and get excluded from spend totals like a real account-to-account transfer.
// This box surfaces them specifically so they can be found and, via the same classify
// dropdown used elsewhere, manually recategorized (e.g. into "Rent") to count as real spend.
function renderZelleVenmoRow(t, classifyOpts) {
    const isCredit = t.amount > 0;
    const amt = Math.abs(t.amount);
    const amtStr = (isCredit ? '+' : '−') + '$' + fmt(amt, 2);
    const amtColor = isCredit ? '#27ae60' : '#c0392b';
    const catColor = CATEGORY_COLORS[t.category] || '#888';
    const safeDesc = escapeHtml(t.desc);
    const acct = t.accountName ? `<span style="color:#aaa;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:90px;">${escapeHtml(t.accountName)}</span>` : '';
    // Same description, different real-world meaning is common for P2P payments (a Zelle to
    // your roommate might be Rent most months and a Gift another month) — default to pinning
    // just this one transaction, with an opt-in checkbox for the old "all matching" behavior.
    return `<div class="cat-detail-row" data-desc="${safeDesc}" data-iso="${t.isoDate||''}" data-amt="${t.amount}" style="padding:7px 14px;font-size:13px;">
        <span style="color:#999;font-size:11px;white-space:nowrap;min-width:74px;">${t.isoDate}</span>
        <div class="cat-desc-group" style="flex:1;min-width:0;">
            <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${safeDesc}">${safeDesc}</span>
            ${acct}
            <span style="font-size:11px;background:${catColor}18;color:${catColor};border-radius:3px;padding:1px 5px;white-space:nowrap;">${t.category}</span>
            <div class="cat-classify-wrap" onclick="event.stopPropagation()">
                <button class="cat-classify-btn" onclick="this.style.display='none';this.nextElementSibling.style.display='inline-flex'">Categorize</button>
                <span style="display:none;align-items:center;gap:5px;">
                    <select class="cat-classify-select" onchange="applyZelleVenmoCategory(this)">
                        <option value="">— move to —</option>${classifyOpts}
                    </select>
                    <label style="font-size:10px;color:#888;white-space:nowrap;display:flex;align-items:center;gap:2px;cursor:pointer;"
                           title="Also apply to every other transaction with this same description (instead of just this one)">
                        <input type="checkbox" class="zv-apply-all-chk" style="margin:0;">all matching
                    </label>
                </span>
                ${t.category !== 'Transfers' ? `<button class="cat-classify-btn" style="margin-left:4px;" title="Reset this transaction back to Transfers" onclick="resetZelleVenmoTxn(this)">↺</button>` : ''}
            </div>
        </div>
        <span style="font-weight:700;color:${amtColor};white-space:nowrap;min-width:68px;text-align:right;">${amtStr}</span>
    </div>`;
}

// Handles category selection from the Zelle/Venmo box. Defaults to pinning just the one
// transaction (via txnOverrides); the "all matching" checkbox opts into the shared
// keyword-based bulk rule (applyTxnCategory) used everywhere else in the app.
function applyZelleVenmoCategory(selectEl) {
    const val = selectEl.value;
    if (!val) return;
    const row = selectEl.closest('.cat-detail-row');
    const applyAll = row.querySelector('.zv-apply-all-chk')?.checked;

    if (applyAll) {
        applyTxnCategory(selectEl);
        return;
    }

    const desc = row.dataset.desc || '';
    const iso  = row.dataset.iso  || '';
    const amt  = parseFloat(row.dataset.amt) || 0;
    txnOverrides[txnOverrideKey(iso, desc, amt)] = val;
    reCategorizeAll();
    saveToStorage();
}

// Undo button for a single Zelle/Venmo row — pins it back to "Transfers" (the neutral
// default for P2P payments) regardless of whether it got moved by a per-transaction pin
// or a bulk "all matching" keyword rule. Only affects this one transaction; a bulk rule
// still keyword-matching other transactions is untouched (delete the keyword under the
// category's card on the Edit tab to remove the rule itself).
function resetZelleVenmoTxn(btn) {
    const row  = btn.closest('.cat-detail-row');
    const desc = row.dataset.desc || '';
    const iso  = row.dataset.iso  || '';
    const amt  = parseFloat(row.dataset.amt) || 0;
    txnOverrides[txnOverrideKey(iso, desc, amt)] = 'Transfers';
    reCategorizeAll();
    saveToStorage();
}

function renderZelleVenmoBox() {
    const box     = document.getElementById('zelleVenmoBox');
    const body    = document.getElementById('zelleVenmoBody');
    const countEl = document.getElementById('zelleVenmoCount');
    if (!box || !body) return;

    const matches = ccTransactions.filter(t => /\b(zelle|venmo)\b/i.test(t.desc || ''));
    if (matches.length === 0) { box.style.display = 'none'; return; }
    box.style.display = '';
    if (countEl) countEl.textContent = `showing ${Math.min(matches.length, 200)} of ${matches.length}`;

    const classifyOpts = buildClassifyOpts();
    body.innerHTML = matches.slice(0, 200).map(t => renderZelleVenmoRow(t, classifyOpts)).join('');
}

// Parse already-split rows (with header at [0]) into normalized transaction objects
// tagged with the given accountName. Returns array of transaction objects.
function parseCSVRows(rows, accountName) {
    if (!rows || rows.length < 2) return [];
    let { dateIdx, amountIdx, descIdx } = detectColumns(rows[0]);
    if (amountIdx === -1) {
        const s = rows[1];
        amountIdx = s.findIndex(c => /^-?\d+(\.\d+)?$/.test((c||'').trim()));
    }
    if (descIdx  === -1) descIdx  = rows[0].length - 1;
    if (dateIdx  === -1) dateIdx  = 0;

    return rows.slice(1).map(row => {
        const dateRaw = (row[dateIdx]  || '').trim();
        const amount  = parseFloat((row[amountIdx] || '').replace(/[$,]/g, '')) || 0;
        const desc    = (row[descIdx]  || row[row.length-1] || '').trim();
        if (amount === 0) return null;
        const iso = toISO(dateRaw);
        const d   = new Date(iso);
        const valid = !isNaN(d.getTime());
        const { cat, sub } = categorizeTxn(desc, valid ? iso : '', amount);
        return {
            date: dateRaw, isoDate: valid ? iso : '',
            amount, desc, valid,
            month:  valid ? iso.slice(0, 7) : 'Unknown',
            mLabel: valid ? d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'Unknown',
            category: cat, subCategory: sub,
            source: 'csv',
            accountName: accountName || '',
        };
    }).filter(Boolean);
}

function analyzeCSV(rows) {
    if (rows.length < 2) return;

    let { dateIdx, amountIdx, descIdx } = detectColumns(rows[0]);
    if (amountIdx === -1) {
        const s = rows[1];
        amountIdx = s.findIndex(c => /^-?\d+(\.\d+)?$/.test(c.trim()));
    }
    if (descIdx === -1) descIdx = rows[0].length - 1;
    if (dateIdx  === -1) dateIdx  = 0;

    const transactions = rows.slice(1).map(row => ({
        date:   (row[dateIdx]   || '').trim(),
        amount: parseFloat((row[amountIdx] || '').replace(/[$,]/g, '')) || 0,
        desc:   (row[descIdx]   || row[row.length - 1] || '').trim(),
    })).filter(t => t.amount !== 0);

    transactions.forEach(t => {
        const iso = toISO(t.date);
        const d   = new Date(iso);
        t.valid   = !isNaN(d.getTime());
        t.isoDate = t.valid ? iso : '';
        t.month   = t.valid ? iso.slice(0, 7) : 'Unknown';
        t.mLabel  = t.valid ? d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'Unknown';
        const { cat, sub } = categorizeTxn(t.desc, t.isoDate, t.amount);
        t.category    = cat;
        t.subCategory = sub;
        t.source      = 'csv';
    });
    const csvLabel = document.getElementById('csvAccountLabel')?.value.trim() || '';
    if (csvLabel) transactions.forEach(t => t.accountName = csvLabel);

    csvTransactions = transactions;
    mergeTxnSources();
    rebuildCCAnalyticsUI();
}

function niceAxisTicks(max, count = 4) {
    if (max <= 0) return [0];
    const rough = max / count;
    const mag   = Math.pow(10, Math.floor(Math.log10(rough)));
    const nice  = [1, 2, 2.5, 5, 10].find(f => f * mag >= rough) * mag;
    const ticks = [];
    for (let v = 0; v <= max * 1.001; v += nice) ticks.push(Math.round(v));
    return ticks;
}

function merchantKey(desc) {
    return desc.trim().split(/\s+/).slice(0, 5).join(' ').toLowerCase();
}

let _highlightTimer = null;
function highlightMerchant(key) {
    if (_highlightTimer) clearTimeout(_highlightTimer);
    document.querySelectorAll('.cat-detail-row.txn-highlight').forEach(el => el.classList.remove('txn-highlight'));
    document.querySelectorAll('.cat-detail-row').forEach(el => {
        if (el.dataset.mkey === key) el.classList.add('txn-highlight');
    });
    _highlightTimer = setTimeout(() => {
        document.querySelectorAll('.cat-detail-row.txn-highlight').forEach(el => el.classList.remove('txn-highlight'));
    }, 5000);
}

function applyTxnCategory(selectEl) {
    const val = selectEl.value;
    if (!val) return;
    const row  = selectEl.closest('.cat-detail-row');
    const desc = row.dataset.desc || '';
    const kw   = desc.trim().toLowerCase().split(/\s+/).slice(0, 2).join(' ');
    if (!kw) return;

    if (val.includes('::')) {
        // Sub-category: add to subCatKeywords
        const [cat, sub] = val.split('::');
        const key = cat + '__' + sub;
        if (!subCatKeywords[key]) subCatKeywords[key] = [];
        if (!subCatKeywords[key].includes(kw)) subCatKeywords[key].push(kw);
    } else {
        // Main category
        if (!categoryKeywords[val]) categoryKeywords[val] = [];
        if (!categoryKeywords[val].includes(kw)) categoryKeywords[val].push(kw);
    }
    reCategorizeAll();
    saveToStorage();
}

function toggleCatDetail(id, btn) {
    const el = document.getElementById(id);
    const open = el.style.display !== 'none';
    el.style.display = open ? 'none' : 'block';
    btn.textContent  = open ? '▶' : '▼';
}

function orderTxnsWithRefunds(txns) {
    const charges = txns.filter(t => t.amount <= 0).sort((a, b) => a.amount - b.amount);
    const refunds  = txns.filter(t => t.amount > 0);
    const used = new Set();
    const out  = [];
    charges.forEach(c => {
        out.push(c);
        const cKey = c.desc.toLowerCase().split(/\s+/).slice(0, 2).join(' ');
        refunds.forEach((r, ri) => {
            if (!used.has(ri)) {
                const rKey = r.desc.toLowerCase().split(/\s+/).slice(0, 2).join(' ');
                if (cKey === rKey) { out.push(r); used.add(ri); }
            }
        });
    });
    refunds.forEach((r, ri) => { if (!used.has(ri)) out.push(r); });
    return out;
}

/* ══════════════════════════════════════════
   Budget Flow — SVG Arrow Drawing
══════════════════════════════════════════ */
const FLOW_ARROWS = [
    { catId: 'flowCatExp',      color: '#d04040', width: 2.5, pctKey: 'exp'      },
    { catId: 'flowCatSave',     color: '#1a7a45', width: 2.0, pctKey: 'save'     },
    { catId: 'flowCatLeftover', color: '#888888', width: 1.5, pctKey: 'leftover' },
];

function drawFlowArrows() {
    const svg     = document.getElementById('flowSvg');
    const income  = document.getElementById('flowNodeIncome');
    const wrap    = document.querySelector('.flow-horiz-wrap');
    if (!svg || !income || !wrap) return;

    const wRect = wrap.getBoundingClientRect();
    if (wRect.width === 0) return;

    svg.setAttribute('width',  wRect.width);
    svg.setAttribute('height', wRect.height);

    const iRect  = income.getBoundingClientRect();
    const startX = iRect.right  - wRect.left;
    const startY = iRect.top + iRect.height / 2 - wRect.top;

    let defsHtml = '<defs>';
    FLOW_ARROWS.forEach(({ catId, color }) => {
        defsHtml += `<marker id="ah-${catId}" markerWidth="7" markerHeight="7"
            refX="5" refY="3.5" orient="auto">
            <polygon points="0 0, 7 3.5, 0 7" fill="${color}" opacity="0.85"/>
          </marker>`;
    });
    defsHtml += '</defs>';

    let pathsHtml = '';
    FLOW_ARROWS.forEach(({ catId, color, width, pctKey }) => {
        const box = document.getElementById(catId);
        if (!box) return;
        const bRect = box.getBoundingClientRect();
        const endX  = bRect.left   - wRect.left;
        const endY  = bRect.top + bRect.height / 2 - wRect.top;

        const midX = startX + (endX - startX) * 0.55;
        const d = `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;

        pathsHtml += `<path d="${d}" stroke="${color}" stroke-width="${width}"
            fill="none" opacity="0.75" marker-end="url(#ah-${catId})"/>`;

        // Percentage label at ~40% along the bezier curve
        const t = 0.4;
        const mt = 1 - t;
        const P0x = startX, P0y = startY;
        const P1x = midX,   P1y = startY;
        const P2x = midX,   P2y = endY;
        const P3x = endX,   P3y = endY;
        const lx = mt*mt*mt*P0x + 3*mt*mt*t*P1x + 3*mt*t*t*P2x + t*t*t*P3x;
        const ly = mt*mt*mt*P0y + 3*mt*mt*t*P1y + 3*mt*t*t*P2y + t*t*t*P3y;

        const pct = _flowPcts[pctKey] || 0;
        if (pct >= 0.5) {
            pathsHtml += `<text x="${lx}" y="${ly - 7}"
                text-anchor="middle" font-size="11" font-weight="700"
                fill="${color}" stroke="#fff" stroke-width="2.5" paint-order="stroke"
                opacity="0.95">${pct.toFixed(1)}%</text>`;
        }
    });

    svg.innerHTML = defsHtml + pathsHtml;
}

function scheduleDrawFlowArrows() {
    requestAnimationFrame(drawFlowArrows);
}

window.addEventListener('resize', () => { scheduleDrawFlowArrows(); scheduleDrawIdealPie(); });

/* ── Ideal Pie Chart ── */
function _piePoint(cx, cy, r, angleDeg) {
    const rad = (angleDeg - 90) * Math.PI / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function drawIdealPie() {
    const svg = document.getElementById('idealPieSvg');
    const legend = document.getElementById('idealPieLegend');
    if (!svg) return;

    const cx = 160, cy = 160, r = 142;
    const raw = [
        { label: 'Expenses', pct: _flowPcts.exp,                        color: '#d04040' },
        { label: 'Savings',  pct: _flowPcts.save,                       color: '#1a7a45' },
        { label: 'Left Over', pct: Math.max(0, _flowPcts.leftover),     color: '#888888' },
    ];
    const segments = raw.filter(s => s.pct > 0.2);
    const total = segments.reduce((s, x) => s + x.pct, 0);

    if (total < 0.5) {
        svg.innerHTML = `<text x="160" y="165" text-anchor="middle" font-size="14" fill="#bbb">No data</text>`;
        if (legend) legend.innerHTML = '';
        return;
    }

    let html = '';
    let angle = 0;
    segments.forEach(seg => {
        const sweep = (seg.pct / total) * 360;
        const endAngle = angle + sweep;
        const start = _piePoint(cx, cy, r, angle);
        const end   = _piePoint(cx, cy, r, endAngle - 0.3);
        const large = sweep > 180 ? 1 : 0;
        const d = `M ${cx} ${cy} L ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)} Z`;
        html += `<path d="${d}" fill="${seg.color}" opacity="0.88" stroke="#fff" stroke-width="2"/>`;

        // % label inside slice (only if slice is large enough)
        if (sweep > 20) {
            const mid = _piePoint(cx, cy, r * 0.62, angle + sweep / 2);
            html += `<text x="${mid.x.toFixed(1)}" y="${mid.y.toFixed(1)}"
                text-anchor="middle" dominant-baseline="middle"
                font-size="18" font-weight="700" fill="#fff"
                stroke="#0005" stroke-width="2" paint-order="stroke">${seg.pct.toFixed(1)}%</text>`;
        }
        angle = endAngle;
    });

    svg.innerHTML = html;

    if (legend) {
        legend.innerHTML = segments.map(s => `
            <div class="pie-legend-row">
                <span class="pie-legend-dot" style="background:${s.color}"></span>
                <span class="pie-legend-name">${s.label}</span>
                <span class="pie-legend-pct">${s.pct.toFixed(1)}%</span>
            </div>`).join('');
    }
}

function scheduleDrawIdealPie() {
    requestAnimationFrame(drawIdealPie);
}

/* ══════════════════════════════════════════
   Similar Transactions Sidebar
══════════════════════════════════════════ */
const KEYWORD_NOISE = new Set([
    'CHARGE','PURCHASE','PAYMENT','ONLINE','INC','LLC','COM','NET','ORG','WWW',
    'HTTP','HTTPS','THE','AND','FOR','FROM','SVC','SERVICE','SERVICES','INTL',
    'INTERNATIONAL','ACH','PMT','TST','SP','SQ','BILL','BILLING','AUTO','PAY',
    'AUTOPAY','DEBIT','CREDIT','TRANSFER','BANK','POS','PIN','VISA','CARD',
    'BUS','TICKET','TICKETS','MKTPL','MKTP','DIGITAL','MOBILE','APP','APPS',
]);

function extractKeywords(desc) {
    const tokens = desc.toUpperCase().split(/[\s\.\*\-\/\,\&\+\(\)\[\]\_\#\@\!\?]+/);
    const seen = new Set();
    return tokens.filter(token => {
        if (!token || token.length < 3) return false;
        if (/\d/.test(token)) return false;          // any digit = reference/code, not a keyword
        if (KEYWORD_NOISE.has(token)) return false;
        if (seen.has(token)) return false;
        seen.add(token);
        return true;
    });
}

let _similarKeywords   = [];
let _similarAllMatches = [];

function _renderSimilarRows(list) {
    document.getElementById('txnSimilarBody').innerHTML = list.length === 0
        ? '<p style="color:#aaa; padding:16px; font-size:13px;">No matching transactions found.</p>'
        : list.map(t => {
            const isCharge = t.amount < 0;
            const amtStr   = isCharge ? `-$${fmt(-t.amount, 2)}` : `+$${fmt(t.amount, 2)}`;
            const amtColor = isCharge ? '#c0392b' : '#27ae60';
            const d = t.isoDate || t.date || '';
            const dateStr = d.length >= 10 ? `${d.slice(5,7)}/${d.slice(8,10)}/${d.slice(2,4)}` : d;
            const acctColor = t.accountName ? getAccountColor(t.accountName) : '#aaa';
            const acctBadge = t.accountName
                ? `<span style="background:${acctColor};color:#fff;font-size:10px;padding:1px 5px;border-radius:3px;flex-shrink:0;white-space:nowrap;">${escapeHtml(t.accountName.split(' ').map(w=>w[0]).join('').slice(0,3).toUpperCase())}</span>`
                : '';
            const catLabel = t.category
                ? `<span style="font-size:10px;color:#aaa;">${escapeHtml(t.category)}</span>`
                : '';
            const safeDesc = escapeHtml(t.desc || '');
            return `<div class="txn-similar-row">
                <span class="txn-similar-row-date">${dateStr}</span>
                <span>${acctBadge}</span>
                <span class="txn-similar-row-desc" title="${safeDesc}">
                    ${safeDesc || '—'}<br>${catLabel}
                </span>
                <span class="txn-similar-row-amt" style="color:${amtColor}">${amtStr}</span>
            </div>`;
        }).join('');
}

function _updateSimilarCount(list) {
    const totalSpent    = list.filter(t => t.amount < 0).reduce((s, t) => s - t.amount, 0);
    const totalReceived = list.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const parts = [];
    if (totalSpent    > 0) parts.push(`$${fmt(totalSpent, 2)} spent`);
    if (totalReceived > 0) parts.push(`$${fmt(totalReceived, 2)} received`);
    document.getElementById('txnSimilarCount').textContent =
        `${list.length} transaction${list.length !== 1 ? 's' : ''}` +
        (parts.length ? ' · ' + parts.join(' · ') : '');
}

function filterSimilarByKw(filter, el) {
    document.querySelectorAll('.sim-kw-chip').forEach(c => c.classList.remove('sim-kw-active'));
    el.classList.add('sim-kw-active');

    let filtered;
    if (filter === 'all') {
        filtered = _similarAllMatches;
    } else if (filter === 'phrase') {
        const phrase = _similarKeywords.join(' ');
        filtered = _similarAllMatches.filter(t => (t.desc || '').toUpperCase().includes(phrase));
    } else {
        const kw = _similarKeywords[filter];
        filtered = _similarAllMatches.filter(t => (t.desc || '').toUpperCase().includes(kw));
    }

    _updateSimilarCount(filtered);
    _renderSimilarRows(filtered);
}

function openSimilarTxns(desc) {
    const keywords = extractKeywords(desc);
    if (!keywords.length) return;
    _similarKeywords = keywords;

    // Search Plaid + CSV, deduplicated
    const seen = new Set();
    const all  = [...ccTransactions, ...csvTransactions];
    _similarAllMatches = all.filter(t => {
        const key = `${t.isoDate}|${Math.round((t.amount || 0) * 100)}|${(t.desc || '').slice(0, 30)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        const d = (t.desc || '').toUpperCase();
        return keywords.some(kw => d.includes(kw));
    }).sort((a, b) => (b.isoDate || '').localeCompare(a.isoDate || ''));

    // Keyword filter chips
    const allChip    = `<button class="sim-kw-chip sim-kw-active" onclick="filterSimilarByKw('all',this)">ALL</button>`;
    const kwChips    = keywords.map((kw, i) =>
        `<button class="sim-kw-chip" onclick="filterSimilarByKw(${i},this)">${kw}</button>`
    ).join('');
    const phraseChip = keywords.length > 1
        ? `<button class="sim-kw-chip sim-kw-phrase" onclick="filterSimilarByKw('phrase',this)">${keywords.join(' ')}</button>`
        : '';
    document.getElementById('txnSimilarKeywords').innerHTML = allChip + kwChips + phraseChip;

    _updateSimilarCount(_similarAllMatches);
    _renderSimilarRows(_similarAllMatches);

    document.getElementById('txnSimilarSidebar').classList.add('open');
    document.getElementById('txnSimilarOverlay').classList.add('open');
}

function closeSimilarTxns() {
    document.getElementById('txnSimilarSidebar').classList.remove('open');
    document.getElementById('txnSimilarOverlay').classList.remove('open');
}

function renderTxnRow(t, catName, classifyOpts) {
    const dateLabel = t.isoDate
        ? t.isoDate.slice(5,7) + '/' + t.isoDate.slice(8,10) + '/' + t.isoDate.slice(2,4)
        : t.date;
    const mkey     = merchantKey(t.desc);
    const isRefund = t.amount > 0;
    const amtLabel = isRefund ? `+$${fmt(t.amount, 2)}` : `$${fmt(-t.amount, 2)}`;
    const amtClass = isRefund ? 'cat-detail-amt refund-amt' : 'cat-detail-amt';
    const safeDesc = escapeHtml(t.desc);
    const btnLabel = catName === 'Other' ? 'Categorize' : '↗';
    const classify = `
        <div class="cat-classify-wrap" onclick="event.stopPropagation()">
            <button class="cat-classify-btn"
                    onclick="this.style.display='none';this.nextElementSibling.style.display=''
                    ">${btnLabel}</button>
            <select class="cat-classify-select" style="display:none" onchange="applyTxnCategory(this)">
                <option value="">— move to —</option>${classifyOpts}
            </select>
        </div>`;
    const sourceClass = t.source === 'plaid' ? ' txn-plaid' : '';
    const acctColor  = t.accountName ? getAccountColor(t.accountName) : '';
    const acctBadge  = t.accountName
        ? `<span class="acct-txn-badge" style="background:${acctColor};" title="${escapeHtml(t.accountName)}">${escapeHtml(t.accountName.split(' ').map(w=>w[0]).join('').slice(0,3).toUpperCase())}</span>`
        : (t.source === 'plaid' ? '<span class="plaid-badge">🔵</span>' : '');
    const sourceBadge = acctBadge;
    const similarBtn = `<button class="cat-similar-btn" onclick="event.stopPropagation();openSimilarTxns(this.dataset.desc)" data-desc="${safeDesc}" title="Find similar transactions">≡</button>`;
    return `<div class="cat-detail-row${sourceClass}" data-mkey="${mkey}" data-desc="${safeDesc}" onclick="highlightMerchant(this.dataset.mkey)">
        <span class="cat-detail-date">${dateLabel}</span>
        <div class="cat-desc-group">
            ${sourceBadge}<span class="cat-detail-desc" title="${safeDesc}">${safeDesc}</span>
            ${classify}${similarBtn}
        </div>
        <span class="${amtClass}">${amtLabel}</span>
    </div>`;
}

function buildStackedBar(txns, totalAmt, axisMax, catName) {
    if (totalAmt <= 0) return '';
    const barWidthPct = Math.max(0, totalAmt / axisMax * 100);

    // Group spending by account name
    const byAcct = {};
    txns.forEach(t => {
        if (t.amount >= 0) return; // skip refunds
        const key = t.accountName || (t.source === 'plaid' ? 'Live' : 'CSV');
        byAcct[key] = (byAcct[key] || 0) - t.amount;
    });

    const acctEntries = Object.entries(byAcct).sort(([,a],[,b]) => b - a);

    if (acctEntries.length <= 1) {
        // Single account — CSS handles the diagonal/gradient fill via data-cat.
        // Account color shown as a 2px inset border on top of the pattern.
        const acctColor = getAccountColor(acctEntries[0]?.[0] || '');
        return `<div class="cat-bar-fill" data-cat="${catName}"
            style="width:${barWidthPct}%; box-shadow: inset 0 0 0 2px ${acctColor};"
            title="${acctEntries[0]?.[0] || ''}: $${fmt(totalAmt,2)}"></div>`;
    }

    // Multiple accounts — parent div carries the category pattern (via data-cat CSS).
    // Each transparent segment overlays a 4px bottom strip in the account's color,
    // separated by thin white dividers so segments are visible.
    const segments = acctEntries.map(([acctName, acctAmt]) => {
        const segPct    = acctAmt / totalAmt * 100;
        const acctColor = getAccountColor(acctName);
        return `<div class="acct-seg"
            style="width:${segPct}%; background:transparent;
                   box-shadow: inset 0 -4px 0 0 ${acctColor};
                   border-right: 1px solid rgba(255,255,255,0.5);"
            title="${acctName}: $${fmt(acctAmt,2)}"></div>`;
    }).join('');

    return `<div class="cat-bar-fill cat-bar-stacked" data-cat="${catName}" style="width:${barWidthPct}%; display:flex;">
        ${segments}
    </div>`;
}

// Classify-dropdown options (built-in categories + sub-categories + user expense categories) —
// shared by the category-chart detail rows and the Zelle/Venmo box.
function buildClassifyOpts() {
    const allClassifyCats = [
        ...CC_CATEGORY_NAMES.filter(n => n !== 'Other' && !deletedCats.has(n)),
        ...getUserExpenseCategories(),
    ];
    return allClassifyCats.map(cat => {
        const subs = subCategories[cat] || [];
        if (subs.length === 0) return `<option value="${cat}">${cat}</option>`;
        return `<optgroup label="${cat}">
            <option value="${cat}">${cat} (general)</option>
            ${subs.map(s => `<option value="${cat}::${s}">${cat} → ${s}</option>`).join('')}
        </optgroup>`;
    }).join('');
}

function buildCatChart(charges, chartId, sortOverride) {
    const total   = charges.reduce((s, t) => s - t.amount, 0);
    const cats    = {};
    const catTxns = {};
    charges.forEach(t => {
        cats[t.category]    = (cats[t.category]    || 0) - t.amount;
        catTxns[t.category] = catTxns[t.category]  || [];
        catTxns[t.category].push(t);
    });
    const effectiveSort = sortOverride || _catSortMode;
    const sorted  = effectiveSort === 'alpha'
        ? Object.entries(cats).sort(([a], [b]) => a.localeCompare(b))
        : Object.entries(cats).sort(([,a], [,b]) => b - a);
    const maxAmt  = Math.max(...sorted.map(([,a]) => a), 1);
    const ticks   = niceAxisTicks(maxAmt);
    const axisMax = ticks[ticks.length - 1] || maxAmt;

    const classifyOpts = buildClassifyOpts();

    const rows = sorted.map(([name, amt], i) => {
        const detailId = `cd-${chartId}-${i}`;
        const ordered  = orderTxnsWithRefunds(catTxns[name] || []);
        const catSubs  = subCategories[name] || [];

        let detailHtml;
        if (catSubs.length > 0) {
            // Group by sub-category
            const grouped = {};
            ordered.forEach(t => {
                const g = t.subCategory || '';
                if (!grouped[g]) grouped[g] = [];
                grouped[g].push(t);
            });
            const sections = [];
            catSubs.forEach(sub => {
                if (!grouped[sub]) return;
                sections.push(`<div class="sub-cat-header">${sub}</div>`
                    + grouped[sub].map(t => renderTxnRow(t, name, classifyOpts)).join(''));
            });
            if (grouped['']) {
                if (sections.length) sections.push('<div class="sub-cat-header sub-cat-other">Other</div>');
                sections.push(grouped[''].map(t => renderTxnRow(t, name, classifyOpts)).join(''));
            }
            detailHtml = sections.join('');
        } else {
            detailHtml = ordered.map(t => renderTxnRow(t, name, classifyOpts)).join('');
        }

        const emoji = CATEGORY_EMOJI[name] || '';
        return `
        <div class="cat-row">
            <button class="cat-expand-btn" onclick="toggleCatDetail('${detailId}', this)">▶</button>
            <span class="cat-name" title="${name}">${name}</span>
            <div class="cat-bar-track">
                ${buildStackedBar(catTxns[name] || [], amt, axisMax, name)}
            </div>
            <span class="cat-emoji">${emoji}</span>
            <span class="cat-dollar">$${fmt(amt, 0)}</span>
            <span class="cat-pct-lbl">${total > 0 ? fmt(amt / total * 100, 1) : 0}%</span>
        </div>
        <div class="cat-detail" id="${detailId}" style="display:none;">${detailHtml}</div>`;
    }).join('');

    const tickHtml = ticks.map(v =>
        `<span style="left:${v / axisMax * 100}%">$${fmt(v, 0)}</span>`).join('');

    return `
        <div class="cat-chart">
            ${rows}
            <div class="cat-axis-row">
                <div class="cat-axis-spacer"></div>
                <div class="cat-axis-ticks">${tickHtml}</div>
                <span style="min-width:18px"></span>
                <span style="min-width:58px"></span>
                <span style="min-width:34px"></span>
            </div>
            <div class="cat-total-row"><span>Total</span><span>$${fmt(total, 2)}</span></div>
        </div>
        `;
}

function ccRenderCategories(charges) {
    document.getElementById('ccCategoryBody').innerHTML = buildCatChart(charges, 'r');
}

function ccRenderMonthCategories(charges) {
    document.getElementById('ccMonthCategoryBody').innerHTML = buildCatChart(charges, 'm');
}

// Returns transactions for the month chart, respecting current _chartMode (charged vs received)
function _getMonthChartTxns(monthKey) {
    if (_chartMode === 'received') {
        return ccTransactions
            .filter(t => t.month === monthKey && t.amount > 0 && !isRefundTxn(t))
            .map(t => ({ ...t, amount: -t.amount }));
    }
    return ccTransactions.filter(t => t.month === monthKey && !CC_EXCLUDE_FROM_SPEND.has(t.category));
}

// Updates the month category box title label
function _setMonthCatTitle(monthKey) {
    const anyTxn = ccTransactions.find(t => t.month === monthKey);
    const label  = anyTxn ? anyTxn.mLabel : monthKey;
    const suffix = _chartMode === 'received' ? ' · Received' : '';
    document.getElementById('ccMonthCatTitle').textContent = label + suffix;
}

function setCatSort(mode) {
    _catSortMode = mode;
    // Keep both dropdowns in sync
    document.querySelectorAll('.cat-sort-select').forEach(el => el.value = mode);
    // Re-render range chart
    ccApplyDateFilter();
    // Re-render month chart if a month is selected
    if (ccSelectedMonthKey) ccRenderMonthCategories(_getMonthChartTxns(ccSelectedMonthKey));
}

function ccShowMonth(monthKey, rowEl) {
    if (ccSelectedMonthKey === monthKey) {
        // Deselect — revert everything to "all time"
        ccSelectedMonthEl?.classList.remove('month-row-active');
        ccSelectedMonthEl  = null;
        ccSelectedMonthKey = null;
        document.getElementById('ccMonthCatTitle').textContent = 'Month';
        document.getElementById('ccMonthCategoryBody').innerHTML =
            '<p class="sub-empty" style="padding:8px 0;">← Click a month to see its breakdown</p>';
        renderTransferTriangle();  // revert triangle to all time
        return;
    }
    if (ccSelectedMonthEl) ccSelectedMonthEl.classList.remove('month-row-active');
    ccSelectedMonthEl  = rowEl;
    ccSelectedMonthKey = monthKey;
    rowEl.classList.add('month-row-active');

    _setMonthCatTitle(monthKey);
    ccRenderMonthCategories(_getMonthChartTxns(monthKey));
    renderTransferTriangle(monthKey);  // filter triangle to this month
}

function ccShowAllCategories() {
    if (ccSelectedMonthEl) { ccSelectedMonthEl.classList.remove('month-row-active'); ccSelectedMonthEl = null; }
    ccSelectedMonthKey = null;
    ccApplyDateFilter();
    renderTransferTriangle();  // revert triangle to all time
}

function setCcDateToToday() {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
    document.getElementById('ccDateTo').value = today;
    ccApplyDateFilter();
}

function setSummaryMode(mode) {
    // Toggle off if clicking the same card again
    if (_chartMode === mode) mode = 'charged';
    _chartMode = mode;

    // Highlight the active card
    document.querySelectorAll('.summary-card').forEach(el => el.classList.remove('summary-card-active'));
    const activeId = mode === 'received' ? 'card-received' : 'card-charged';
    const card = document.getElementById(activeId);
    if (card) card.classList.add('summary-card-active');

    ccApplyDateFilter();
    // If a month is already selected, also re-render that chart under the new mode
    if (ccSelectedMonthKey) {
        _setMonthCatTitle(ccSelectedMonthKey);
        ccRenderMonthCategories(_getMonthChartTxns(ccSelectedMonthKey));
    }
}

function ccApplyDateFilter() {
    const from = document.getElementById('ccDateFrom').value;
    const to   = document.getElementById('ccDateTo').value;

    if (_chartMode === 'received') {
        // Show true income only — exclude store refunds so they don't inflate "Total Received"
        const filtered = ccTransactions.filter(t =>
            t.amount > 0 &&
            !isRefundTxn(t) &&
            (!from || t.isoDate >= from) &&
            (!to   || t.isoDate <= to));
        // Negate so buildCatChart's `s - t.amount` produces positive totals
        ccRenderCategories(filtered.map(t => ({ ...t, amount: -t.amount })));
    } else {
        // Default: charged — all non-excluded transactions (spending + refunds offset)
        const filtered = ccTransactions.filter(t =>
            !CC_EXCLUDE_FROM_SPEND.has(t.category) &&
            (!from || t.isoDate >= from) &&
            (!to   || t.isoDate <= to));
        ccRenderCategories(filtered);
    }
}

function reCategorizeAll() {
    if (ccTransactions.length === 0) return;
    // Re-categorize source arrays so source labels survive the merge
    csvTransactions.forEach(t => { const { cat, sub } = categorizeTxn(t.desc, t.isoDate, t.amount); t.category = cat; t.subCategory = sub; });
    plaidTransactions.forEach(t => { const { cat, sub } = categorizeTxn(t.desc, t.isoDate, t.amount); t.category = cat; t.subCategory = sub; });
    mergeTxnSources();

    const { charges, allNonEx, totalCharged, totalReceived, sortedMonths, monthlyAvg } = computeSummary(ccTransactions);
    updateSummaryCards({ charges, totalCharged, totalReceived, monthlyAvg });
    document.getElementById('ccMonthlyBody').innerHTML = renderMonthlyTable(sortedMonths, totalCharged, allNonEx, totalReceived);

    if (ccSelectedMonthKey) {
        const newEl = document.querySelector(`.month-row[data-month="${ccSelectedMonthKey}"]`);
        if (newEl) {
            ccSelectedMonthEl = newEl;
            newEl.classList.add('month-row-active');
            const mc = _getMonthChartTxns(ccSelectedMonthKey);
            const openM = saveOpenDetails('ccMonthCategoryBody');
            ccRenderMonthCategories(mc);
            restoreOpenDetails('ccMonthCategoryBody', openM);
        } else { ccSelectedMonthEl = null; ccSelectedMonthKey = null; }
    }

    const openR = saveOpenDetails('ccCategoryBody');
    ccApplyDateFilter();
    restoreOpenDetails('ccCategoryBody', openR);
    renderUnifiedRawTable();
    renderRecentTransactions();
    renderZelleVenmoBox();
    renderCsvHistory();
}

/* ══════════════════════════════════════════
   Persistence — localStorage
══════════════════════════════════════════ */
const PERSIST_INPUTS = ['base','refresher','rsu','bonusPct','incomeCity'];
const PERSIST_CHECKS  = ['chkFed','chkState','chkSS','chkMed','chkSDI'];
const PERSIST_SELECTS = ['filingStatus','incomeState'];

let _loadingFromStorage = false;

function saveToStorage() {
    if (_loadingFromStorage) return;
    try {
        localStorage.setItem('fc_expenses',      JSON.stringify(expenses));
        localStorage.setItem('fc_subs',          JSON.stringify(subscriptions));
        localStorage.setItem('fc_ideal_savings', JSON.stringify(idealSavings));
        localStorage.setItem('fc_keywords',    JSON.stringify(categoryKeywords));
        localStorage.setItem('fc_subCats',     JSON.stringify(subCategories));
        localStorage.setItem('fc_subCatKws',   JSON.stringify(subCatKeywords));
        localStorage.setItem('fc_deletedCats', JSON.stringify([...deletedCats]));
        localStorage.setItem('fc_categoryRenames', JSON.stringify(categoryRenames));
        localStorage.setItem('fc_txnOverrides', JSON.stringify(txnOverrides));
        localStorage.setItem('fc_incomeDocs', JSON.stringify(incomeDocs));
        // CSV data is session-only — not saved to localStorage
        // Current month is always fetched live; only cache previous months
        const _currMonth = new Date().toISOString().slice(0, 7);
        const _toCache = plaidTransactions.filter(t => (t.isoDate || t.date || '').slice(0, 7) < _currMonth);
        if (_toCache.length > 0) localStorage.setItem('fc_plaidTxns', JSON.stringify(_toCache));
        const vals = {};
        PERSIST_INPUTS.forEach(id => { const el = document.getElementById(id); if (el) vals[id] = el.value; });
        PERSIST_CHECKS.forEach(id  => { const el = document.getElementById(id); if (el) vals[id] = el.checked ? '1' : '0'; });
        PERSIST_SELECTS.forEach(id => { const el = document.getElementById(id); if (el) vals[id] = el.value; });
        // Vest month checkboxes — store as comma-separated checked values
        const vestChecked = [...document.querySelectorAll('.vest-chk:checked')].map(el => el.value).join(',');
        vals['vestMonths'] = vestChecked;
        localStorage.setItem('fc_inputs', JSON.stringify(vals));
    } catch(e) {}
    scheduleServerSettingsSave();
}

// Mirrors the localStorage budget settings (Monthly Ideal expenses, subs, savings,
// category keywords) to the server so they survive localStorage being
// cleared, a browser/device switch, or the http/https origin changing.
let _serverSaveTimer = null;
function scheduleServerSettingsSave() {
    if (_loadingFromStorage) return;
    clearTimeout(_serverSaveTimer);
    _serverSaveTimer = setTimeout(saveSettingsToServer, 1000);
}

async function saveSettingsToServer() {
    try {
        const payload = {
            expenses, subscriptions, idealSavings,
            categoryKeywords, subCategories, subCatKeywords,
            deletedCats: [...deletedCats],
            categoryRenames,
            txnOverrides,
            inputs: JSON.parse(localStorage.getItem('fc_inputs') || '{}'),
        };
        await fetch(`${PLAID_SERVER}/api/save-settings`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(payload),
        });
    } catch (e) {}
}

async function loadSettingsFromServer() {
    try {
        const res  = await fetch(`${PLAID_SERVER}/api/load-settings`);
        const data = await res.json();
        const s = data && data.settings;
        if (!s) return;
        const map = {
            fc_expenses: s.expenses, fc_subs: s.subscriptions, fc_ideal_savings: s.idealSavings,
            // fc_tithings: no longer written, but still read back for migrateLegacyTithing()
            // against servers that still have an old settings save with this field.
            fc_tithings: s.tithings, fc_keywords: s.categoryKeywords, fc_subCats: s.subCategories,
            fc_subCatKws: s.subCatKeywords, fc_deletedCats: s.deletedCats, fc_inputs: s.inputs,
            fc_categoryRenames: s.categoryRenames, fc_txnOverrides: s.txnOverrides,
        };
        Object.entries(map).forEach(([k, v]) => { if (v !== undefined) localStorage.setItem(k, JSON.stringify(v)); });
        loadFromStorage();
    } catch (e) {}
}

let _dedupeChangedOnLoad = false;

function loadFromStorage() {
    _loadingFromStorage = true;

    // 0. Deleted built-in categories (loaded first so later seeding can skip them)
    try {
        const savedDel = JSON.parse(localStorage.getItem('fc_deletedCats') || '[]');
        deletedCats = new Set(savedDel);
    } catch(e) { deletedCats = new Set(); }

    // 0b. Built-in category renames — replay against the fresh hardcoded identity
    // tables before anything (keyword seeding, activeBuiltins()) reads them.
    try {
        categoryRenames = JSON.parse(localStorage.getItem('fc_categoryRenames') || '{}');
    } catch(e) { categoryRenames = {}; }
    applyPersistedCategoryRenames();

    // 0c. Per-transaction category pins — must load before anything categorizes a
    // transaction (CSV parse, cached Plaid restore) so pins are already in effect.
    try {
        txnOverrides = JSON.parse(localStorage.getItem('fc_txnOverrides') || '{}');
    } catch(e) { txnOverrides = {}; }

    // 1. Numeric inputs first so calculate() picks up correct values
    try {
        const vals = JSON.parse(localStorage.getItem('fc_inputs') || 'null');
        if (vals) {
            PERSIST_INPUTS.forEach(id => { const el = document.getElementById(id); if (el && vals[id] != null) el.value = vals[id]; });
            PERSIST_CHECKS.forEach(id  => { const el = document.getElementById(id); if (el && vals[id] != null) el.checked = vals[id] !== '0'; });
            PERSIST_SELECTS.forEach(id => { const el = document.getElementById(id); if (el && vals[id] != null) el.value = vals[id]; });
            // Restore vest month checkboxes
            if (vals['vestMonths'] != null) {
                const savedVest = new Set(vals['vestMonths'].split(',').filter(Boolean));
                document.querySelectorAll('.vest-chk').forEach(el => { el.checked = savedVest.has(el.value); });
            }
        }
    } catch(e) {}

    // 2. Category keywords
    try {
        const saved = JSON.parse(localStorage.getItem('fc_keywords') || 'null');
        if (saved) {
            categoryKeywords = saved;
            CC_CATEGORY_NAMES.forEach(n => { if (!deletedCats.has(n) && !categoryKeywords[n]) categoryKeywords[n] = []; });
        } else {
            CC_CATEGORY_NAMES.forEach(n => { if (!deletedCats.has(n)) categoryKeywords[n] = []; });
            [['weee','Groceries'],['stussy','Shopping'],['nike','Shopping'],
             ['rainbow garden','Dining Out'],['northern cuisine','Dining Out'],
             ['bangkok thai','Dining Out'],['mid summer','Dining Out']
            ].forEach(([kw, cat]) => categoryKeywords[cat].push(kw));
        }
    } catch(e) { CC_CATEGORY_NAMES.forEach(n => categoryKeywords[n] = []); }

    // Sub-categories
    try {
        const savedSC = JSON.parse(localStorage.getItem('fc_subCats') || 'null');
        subCategories = savedSC || {};
        if (!savedSC) {
            // Seed defaults: Shopping gets three sub-categories
            subCategories['Shopping'] = ['Technology', 'Sports', 'Fashion'];
        }
        CC_CATEGORY_NAMES.forEach(n => { if (!deletedCats.has(n) && !subCategories[n]) subCategories[n] = []; });
    } catch(e) { CC_CATEGORY_NAMES.forEach(n => subCategories[n] = []); }

    try {
        subCatKeywords = JSON.parse(localStorage.getItem('fc_subCatKws') || '{}');
    } catch(e) { subCatKeywords = {}; }

    renderCustomKeywords();

    // 3. Expenses
    try {
        const saved = JSON.parse(localStorage.getItem('fc_expenses') || 'null');
        if (saved && saved.length > 0) {
            expenses = saved;
            expId = expenses.reduce((m, e) => Math.max(m, e.id), 0);

            // Migration: normalize expense names that should match built-in CC categories
            const NAME_MIGRATIONS = { 'Dine-out': 'Dining Out', 'dine-out': 'Dining Out', 'Dine Out': 'Dining Out' };
            let migrated = false;
            expenses.forEach(e => {
                if (NAME_MIGRATIONS[e.name]) {
                    e.name = NAME_MIGRATIONS[e.name];
                    migrated = true;
                }
            });
            if (migrated) {
                // Clean up stale keyword entries left behind by the old names
                Object.keys(NAME_MIGRATIONS).forEach(old => { delete categoryKeywords[old]; });
            }

            const preDedupeCount = expenses.length;
            dedupeExpenses();
            if (expenses.length !== preDedupeCount) _dedupeChangedOnLoad = true;

            renderExpenses();
        } else { initExpenses(); }
    } catch(e) { initExpenses(); }

    // 4. Subscriptions
    try {
        const saved = JSON.parse(localStorage.getItem('fc_subs') || 'null');
        if (saved && saved.length > 0) {
            subscriptions = saved;
            subId = subscriptions.reduce((m, s) => Math.max(m, s.id), 0);
            renderSubscriptions();
        } else { initSubscriptions(); }
    } catch(e) { initSubscriptions(); }

    // 5. Ideal Savings rows
    try {
        const saved = JSON.parse(localStorage.getItem('fc_ideal_savings') || 'null');
        if (saved && saved.length > 0) {
            idealSavings = saved;
            idealSavId = idealSavings.reduce((m, s) => Math.max(m, s.id), 0);
        }
    } catch(e) {}
    renderIdealSavings();

    // 6. Legacy tithing migration (one-time; see migrateLegacyTithing())
    migrateLegacyTithing();

    // 7. Income documents (paystub/W-2/RSU/bonus) — server is the source of truth,
    // this local cache just avoids a blank flash before loadIncomeDocsFromServer() resolves
    try {
        const saved = JSON.parse(localStorage.getItem('fc_incomeDocs') || 'null');
        if (saved) incomeDocs = { paystub: null, w2: null, rsu: null, bonus: null, ...saved };
    } catch(e) {}
    renderIncomeDocsList();

    _loadingFromStorage = false;
    calculate();

    if (_dedupeChangedOnLoad) { _dedupeChangedOnLoad = false; saveToStorage(); }

    // CSV data is session-only — never auto-restored. User must re-upload each session.
    // Purge any leftover CSV keys from older versions so they don't cause phantom data.
    localStorage.removeItem('fc_csvTxns');
    localStorage.removeItem('fc_csvMeta');
    localStorage.removeItem('fc_csvRows');

    // 6. Restore Plaid transactions and re-merge
    try {
        const savedPlaid = JSON.parse(localStorage.getItem('fc_plaidTxns') || 'null');
        if (savedPlaid && savedPlaid.length > 0) {
            plaidTransactions = savedPlaid;
            mergeTxnSources();
            // Re-build the CC analytics UI
            if (ccTransactions.length > 0) {
                rebuildCCAnalyticsUI();
                const allIsoDates2 = ccTransactions.map(t => t.isoDate).filter(Boolean).sort();
                if (allIsoDates2.length) {
                    const toEl = document.getElementById('ccDateTo');
                    if (!toEl.value || allIsoDates2[allIsoDates2.length-1] > toEl.value)
                        toEl.value = allIsoDates2[allIsoDates2.length-1];
                }
                const plaidStatusEl = document.getElementById('plaidStatus');
                if (plaidStatusEl && plaidCoverStart)
                    plaidStatusEl.textContent = `Plaid live from ${plaidCoverStart.slice(5,7)}/${plaidCoverStart.slice(0,4)}`;
            }
        }
    } catch(e) {}

    saveToStorage();
}

function setRawSort(mode) {
    _rawSortMode = mode;
    renderUnifiedRawTable();
}

// Unified raw table — renders every transaction in ccTransactions (CSV + Plaid)
function renderUnifiedRawTable() {
    const head  = document.getElementById('csvHead');
    const body  = document.getElementById('csvBody');
    const table = document.getElementById('csvTable');
    const empty = document.getElementById('csvEmpty');
    if (!head || !body) return;

    if (ccTransactions.length === 0) {
        table.style.display = 'none';
        if (empty) empty.style.display = '';
        return;
    }

    // Filter by search query if one is set
    const searchQ = (document.getElementById('txnSearchInput')?.value || '').trim().toLowerCase();
    let txns = searchQ
        ? ccTransactions.filter(t =>
            t.desc.toLowerCase().includes(searchQ) ||
            (t.category || '').toLowerCase().includes(searchQ) ||
            (t.accountName || '').toLowerCase().includes(searchQ) ||
            (t.isoDate || '').includes(searchQ))
        : [...ccTransactions];

    const countEl = document.getElementById('txnSearchCount');
    if (countEl) countEl.textContent = searchQ ? `${txns.length} of ${ccTransactions.length} transactions` : '';

    // Sort a copy — never mutate ccTransactions
    if (_rawSortMode === 'alpha') {
        txns.sort((a, b) => a.desc.localeCompare(b.desc, undefined, { sensitivity: 'base' }));
    }
    // else: keep date order (ccTransactions is already newest-first)

    head.innerHTML = '<tr><th>Date</th><th>Description</th><th style="text-align:right">Amount</th><th>Source</th><th>Category</th></tr>';

    if (_rawSortMode === 'alpha') {
        // Alphabetical mode — group rows under a letter header
        let curLetter = null, rowIdx = 0;
        body.innerHTML = txns.map(t => {
            const letter = (t.desc[0] || '?').toUpperCase();
            let groupRow = '';
            if (letter !== curLetter) {
                curLetter = letter;
                rowIdx = 0;
                groupRow = `<tr class="raw-alpha-group"><td colspan="5">${escapeHtml(letter)}</td></tr>`;
            }
            const baseCls = rowIdx++ % 2 === 0 ? 'csv-month-a' : 'csv-month-b';
            const amt      = t.amount < 0
                ? `-$${fmt(-t.amount, 2)}`
                : `<span style="color:#2a7a2a">+$${fmt(t.amount, 2)}</span>`;
            const srcLabel = t.source === 'plaid'
                ? '<span style="color:#1a6fa8; font-weight:bold;">🔵 Plaid</span>'
                : '<span style="color:#888;">📄 CSV</span>';
            return groupRow + `<tr class="${baseCls}">
                <td>${escapeHtml(t.isoDate || t.date)}</td>
                <td>${escapeHtml(t.desc)}</td>
                <td style="text-align:right; white-space:nowrap;">${amt}</td>
                <td>${srcLabel}</td>
                <td class="csv-cat-cell">${escapeHtml(t.category || '')}</td>
            </tr>`;
        }).join('');
    } else {
        // Date mode — alternate shading by month
        let curMonth = null, toggle = false;
        body.innerHTML = txns.map(t => {
            if (t.month !== curMonth) { curMonth = t.month; toggle = !toggle; }
            const baseCls = t.source === 'plaid'
                ? 'raw-plaid-row'
                : (toggle ? 'csv-month-a' : 'csv-month-b');
            const amt      = t.amount < 0
                ? `-$${fmt(-t.amount, 2)}`
                : `<span style="color:#2a7a2a">+$${fmt(t.amount, 2)}</span>`;
            const srcLabel = t.source === 'plaid'
                ? '<span style="color:#1a6fa8; font-weight:bold;">🔵 Plaid</span>'
                : '<span style="color:#888;">📄 CSV</span>';
            return `<tr class="${baseCls}">
                <td>${escapeHtml(t.isoDate || t.date)}</td>
                <td>${escapeHtml(t.desc)}</td>
                <td style="text-align:right; white-space:nowrap;">${amt}</td>
                <td>${srcLabel}</td>
                <td class="csv-cat-cell">${escapeHtml(t.category || '')}</td>
            </tr>`;
        }).join('');
    }

    table.style.display = 'table';
    if (empty) empty.style.display = 'none';
}

function renderCCTable(rows, catByRow, dateColIdx) {
    const head  = document.getElementById('csvHead');
    const body  = document.getElementById('csvBody');
    const table = document.getElementById('csvTable');
    const empty = document.getElementById('csvEmpty');

    head.innerHTML = '<tr>' + [...rows[0], 'Category'].map(h => `<th>${h}</th>`).join('') + '</tr>';

    let curMonth = null, toggle = false;
    body.innerHTML = rows.slice(1).map((row, i) => {
        const dateStr  = (row[dateColIdx] || '').trim();
        const monthKey = dateStr ? toISO(dateStr).slice(0, 7) : '';
        if (monthKey && monthKey !== curMonth) { curMonth = monthKey; toggle = !toggle; }
        const cls = monthKey ? (toggle ? 'csv-month-a' : 'csv-month-b') : (i % 2 === 0 ? 'csv-even' : 'csv-odd');
        return `<tr class="${cls}">` +
            row.map(c => `<td>${c ?? ''}</td>`).join('') +
            `<td class="csv-cat-cell">${catByRow[i] || ''}</td></tr>`;
    }).join('');

    table.style.display = 'table';
    empty.style.display = 'none';
}

/* ══════════════════════════════════════════
   CSV Upload — Credit-Card tab
══════════════════════════════════════════ */
function loadCSV(input) {
    const file = input.files[0];
    if (!file) return;
    document.getElementById('csvStatus').textContent = 'Loading…';

    const reader = new FileReader();
    reader.onload = function(e) {
        const rows = parseCSV(e.target.result);
        if (rows.length === 0) {
            document.getElementById('csvStatus').textContent = 'File appears empty.';
            return;
        }
        const label = document.getElementById('csvAccountLabel')?.value.trim() || 'CSV';

        // Replace any existing data for this account name, then append new rows.
        // This means uploading a second file keeps all other accounts intact.
        csvTransactions = csvTransactions.filter(t => t.accountName !== label);
        const newTxns = parseCSVRows(rows, label);
        csvTransactions = csvTransactions.concat(newTxns);
        csvTransactions.sort((a, b) => b.isoDate.localeCompare(a.isoDate));
        renderCsvHistory();

        // Record file metadata (replace existing entry for this account if re-uploaded)
        csvUploadMeta = csvUploadMeta.filter(m => m.accountName !== label);
        csvUploadMeta.push({
            accountName: label,
            fileName:    file.name,
            uploadedAt:  new Date().toISOString(),
            count:       newTxns.length,
        });

        document.getElementById('csvStatus').textContent = '';
        // Reset inputs so the next account can be uploaded immediately
        input.value = '';
        document.getElementById('csvAccountLabel').value = '';
        updateLoadedAccountsList();
    };
    reader.readAsText(file);
}

function parseCSV(text) {
    const lines = text.trim().split('\n');
    return lines.map(line => {
        const row = [];
        let cur = '', inQuote = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') { inQuote = !inQuote; }
            else if (ch === ',' && !inQuote) { row.push(cur.trim()); cur = ''; }
            else { cur += ch; }
        }
        row.push(cur.trim());
        return row;
    });
}

function renderCSVTable(rows) {
    const head = document.getElementById('csvHead');
    const body = document.getElementById('csvBody');
    const empty = document.getElementById('csvEmpty');
    const table = document.getElementById('csvTable');

    const headers = rows[0];
    head.innerHTML = '<tr>' + headers.map(h => `<th>${h}</th>`).join('') + '</tr>';

    body.innerHTML = rows.slice(1).map((row, i) =>
        '<tr class="' + (i % 2 === 0 ? 'csv-even' : 'csv-odd') + '">' +
        headers.map((_, c) => `<td>${row[c] ?? ''}</td>`).join('') +
        '</tr>'
    ).join('');

    table.style.display = 'table';
    empty.style.display = 'none';
}

function clearCSV() {
    if (!confirm('Remove all uploaded CSV accounts?')) return;
    csvTransactions = [];
    csvUploadMeta  = [];
    document.getElementById('csvFileInput').value = '';
    document.getElementById('csvAccountLabel').value = '';
    document.getElementById('csvStatus').textContent = '';
    updateLoadedAccountsList();
    renderCsvHistory();
}

/* ══════════════════════════════════════════
   Income Documents — PDF upload (paystub / W-2 / RSU vest / bonus)
══════════════════════════════════════════ */
let incomeDocs = { paystub: null, w2: null, rsu: null, bonus: null };
let _pendingIncomeDoc = null;

const INCOME_DOC_LABELS = { paystub: 'Paystub', w2: 'W-2', rsu: 'RSU Vest', bonus: 'Bonus' };
const INCOME_FIELD_LABELS = {
    grossPay: 'Gross Pay', fedWithheld: 'Federal Tax Withheld', stateWithheld: 'State Tax Withheld',
    cityWithheld: 'City/Local Tax Withheld', payDate: 'Pay Date',
    w2Box1: 'Box 1 — Wages', w2Box2: 'Box 2 — Federal Tax Withheld', w2Box17: 'Box 17 — State Tax Withheld', w2State: 'State (from W-2)',
    shares: 'Shares Vested', pricePerShare: 'Price per Share', vestDate: 'Vest Date',
};
const INCOME_TEXT_FIELDS = new Set(['payDate', 'vestDate', 'w2State']);

function loadIncomePdf(input) {
    const file = input.files[0];
    if (!file) return;
    const statusEl = document.getElementById('incomeParseStatus');
    if (statusEl) statusEl.textContent = 'Reading PDF…';

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            if (!window.pdfjsLib) throw new Error('PDF library not loaded');
            const pdf = await window.pdfjsLib.getDocument({ data: e.target.result }).promise;
            let fullText = '';
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const content = await page.getTextContent();
                fullText += content.items.map(it => it.str).join(' ') + '\n';
            }
            const override = document.getElementById('incomeDocTypeOverride')?.value || 'auto';
            const docType = override !== 'auto' ? override : classifyIncomeDoc(fullText);
            const fields = extractIncomeFields(fullText, docType);
            _pendingIncomeDoc = { category: docType, fileName: file.name, rawText: fullText.slice(0, 4000), fields };
            renderIncomeReviewForm();
            if (statusEl) statusEl.textContent = `Detected: ${INCOME_DOC_LABELS[docType] || docType}. Review the fields below and confirm.`;
        } catch (err) {
            if (statusEl) statusEl.textContent = 'Could not read PDF: ' + err.message;
        }
    };
    reader.readAsArrayBuffer(file);
}

function classifyIncomeDoc(text) {
    const t = text.toLowerCase();
    const kw = {
        paystub: ['pay period', 'pay date', 'earnings statement', 'ytd gross', 'net pay', ' hours '],
        w2: ['w-2', 'wage and tax statement', 'box 1', 'box 2', 'employer identification number', ' ein '],
        rsu: ['rsu', 'restricted stock', 'vest date', 'shares released', 'vesting', 'stock plan'],
        bonus: ['bonus payment', 'discretionary bonus', 'spot bonus', ' bonus '],
    };
    const scores = { paystub: 0, w2: 0, rsu: 0, bonus: 0 };
    for (const cat in kw) kw[cat].forEach(k => { if (t.includes(k)) scores[cat]++; });
    // A paystub that merely mentions "bonus" YTD shouldn't be misread as a bonus document
    if (scores.paystub > 0 && scores.bonus > 0 && scores.paystub >= scores.bonus) scores.bonus = 0;
    let best = 'paystub', bestScore = 0;
    for (const cat in scores) { if (scores[cat] > bestScore) { bestScore = scores[cat]; best = cat; } }
    return best;
}

// Grabs the last capture group (always the numeric one, by convention below) from the first matching pattern
function _grabAmount(text, patterns) {
    for (const re of patterns) {
        const m = text.match(re);
        if (m) {
            const val = parseFloat(m[m.length - 1].replace(/,/g, ''));
            if (!isNaN(val)) return val;
        }
    }
    return null;
}

function _grabDate(text) {
    const m = text.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
    return m ? m[1] : '';
}

function extractIncomeFields(text, docType) {
    const money = '\\$?\\s*([\\d,]+\\.\\d{2})';
    const fedRe   = [new RegExp('federal\\s*(income\\s*)?tax(es)?[:\\s]*' + money, 'i')];
    const stateRe = [new RegExp('state\\s*(income\\s*)?tax(es)?[:\\s]*' + money, 'i')];

    if (docType === 'w2') {
        return {
            w2Box1:  _grabAmount(text, [new RegExp('1\\s*wages.{0,40}?' + money, 'is')]),
            w2Box2:  _grabAmount(text, [new RegExp('2\\s*federal.{0,40}?' + money, 'is')]),
            w2Box17: _grabAmount(text, [new RegExp('17\\s*state.{0,40}?' + money, 'is')]),
            w2State: (text.match(/\b([A-Z]{2})\b\s+\d{2}-?\d{7}/) || [])[1] || '',
        };
    }
    if (docType === 'rsu') {
        return {
            shares:        _grabAmount(text, [new RegExp('shares?\\s*(released|vested)[:\\s]*([\\d,]+)', 'i')]),
            pricePerShare: _grabAmount(text, [new RegExp('(fair market value|price per share)[:\\s]*' + money, 'i')]),
            vestDate:      _grabDate(text),
            fedWithheld:   _grabAmount(text, fedRe),
            stateWithheld: _grabAmount(text, stateRe),
        };
    }
    if (docType === 'bonus') {
        return {
            grossPay:      _grabAmount(text, [new RegExp('(gross\\s*)?bonus\\s*(amount|pay)?[:\\s]*' + money, 'i')]),
            fedWithheld:   _grabAmount(text, fedRe),
            stateWithheld: _grabAmount(text, stateRe),
            payDate:       _grabDate(text),
        };
    }
    // paystub (default)
    return {
        grossPay:      _grabAmount(text, [new RegExp('gross\\s*pay[:\\s]*' + money, 'i'), new RegExp('total\\s*gross[:\\s]*' + money, 'i')]),
        fedWithheld:   _grabAmount(text, fedRe),
        stateWithheld: _grabAmount(text, stateRe),
        cityWithheld:  _grabAmount(text, [new RegExp('(city|local)\\s*tax[:\\s]*' + money, 'i')]),
        payDate:       _grabDate(text),
    };
}

function renderIncomeReviewForm() {
    const box  = document.getElementById('incomeReviewBox');
    const form = document.getElementById('incomeReviewForm');
    const preview = document.getElementById('incomeRawTextPreview');
    if (!_pendingIncomeDoc || !box || !form) return;

    const catOptions = Object.keys(INCOME_DOC_LABELS).map(c =>
        `<option value="${c}" ${c === _pendingIncomeDoc.category ? 'selected' : ''}>${INCOME_DOC_LABELS[c]}</option>`).join('');

    const fieldRows = Object.keys(_pendingIncomeDoc.fields).map(key => {
        const label = INCOME_FIELD_LABELS[key] || key;
        const val = _pendingIncomeDoc.fields[key];
        const isText = INCOME_TEXT_FIELDS.has(key);
        return `<div class="box-row"><label>${label}</label>
            <span class="${isText ? '' : 'money-wrap'}">${isText ? '' : '$'}<input class="val-input" type="${isText ? 'text' : 'number'}" id="incomeField_${key}" value="${val ?? ''}"></span></div>`;
    }).join('');

    form.innerHTML = `<div class="box-row"><label>Document Type</label>
        <select id="incomeReviewCategory" onchange="renderIncomeReviewFieldsForCategory()" style="font-size:13px;border:1px solid #bbb;padding:3px 8px;font-family:Arial,sans-serif;background:#fff;">${catOptions}</select></div>` + fieldRows;

    if (preview) preview.value = _pendingIncomeDoc.rawText || '';
    box.style.display = '';
}

// If the user overrides the detected category in the review form, re-extract fields for the new category
function renderIncomeReviewFieldsForCategory() {
    if (!_pendingIncomeDoc) return;
    const sel = document.getElementById('incomeReviewCategory');
    const newCategory = sel ? sel.value : _pendingIncomeDoc.category;
    if (newCategory === _pendingIncomeDoc.category) return;
    _pendingIncomeDoc.category = newCategory;
    _pendingIncomeDoc.fields = extractIncomeFields(_pendingIncomeDoc.rawText, newCategory);
    renderIncomeReviewForm();
}

function confirmIncomeDoc() {
    if (!_pendingIncomeDoc) return;
    const categorySel = document.getElementById('incomeReviewCategory');
    const category = categorySel ? categorySel.value : _pendingIncomeDoc.category;

    const fields = {};
    Object.keys(_pendingIncomeDoc.fields).forEach(key => {
        const el = document.getElementById('incomeField_' + key);
        if (!el) return;
        fields[key] = INCOME_TEXT_FIELDS.has(key) ? el.value : (el.value === '' ? null : parseFloat(el.value));
    });

    const record = {
        category,
        fileName: _pendingIncomeDoc.fileName,
        uploadedAt: new Date().toISOString(),
        fields,
        rawTextExcerpt: (_pendingIncomeDoc.rawText || '').slice(0, 2000),
    };

    incomeDocs[category] = record;
    saveIncomeDocToServer(category, record);
    saveToStorage();
    cancelIncomeReview();
    renderIncomeDocsList();
    renderIncomeStatementRates();
    if (document.getElementById('monthly-real')?.classList.contains('active')) renderMonthlyReal();
}

function cancelIncomeReview() {
    _pendingIncomeDoc = null;
    const box = document.getElementById('incomeReviewBox');
    if (box) box.style.display = 'none';
    const input = document.getElementById('incomeFileInput');
    if (input) input.value = '';
    const status = document.getElementById('incomeParseStatus');
    if (status) status.textContent = '';
}

function renderIncomeDocsList() {
    const el = document.getElementById('incomeDocsList');
    if (!el) return;
    el.innerHTML = Object.keys(INCOME_DOC_LABELS).map(cat => {
        const doc = incomeDocs[cat];
        if (!doc) {
            return `<div class="box-row"><label>${INCOME_DOC_LABELS[cat]}</label><span style="color:#aaa;">No document uploaded yet</span></div>`;
        }
        const gross = doc.fields.grossPay ?? doc.fields.w2Box1 ?? null;
        const grossStr = gross != null ? `$${fmt(gross, 0)} — ` : '';
        const when = new Date(doc.uploadedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        return `<div class="box-row"><label>${INCOME_DOC_LABELS[cat]}</label>
            <span>${grossStr}updated ${when} from <em>${doc.fileName}</em>
            <button class="cat-expand-btn" style="margin-left:8px;font-size:11px;width:auto;" onclick="deleteIncomeDoc('${cat}')">Remove</button></span></div>`;
    }).join('');
}

function deleteIncomeDoc(category) {
    if (!confirm(`Remove the saved ${INCOME_DOC_LABELS[category]} document?`)) return;
    incomeDocs[category] = null;
    saveToStorage();
    renderIncomeDocsList();
    renderIncomeStatementRates();
    fetch(`${PLAID_SERVER}/api/delete-income-doc/${category}`, { method: 'DELETE' }).catch(() => {});
    if (document.getElementById('monthly-real')?.classList.contains('active')) renderMonthlyReal();
}

function renderIncomeStatementRates() {
    let fedGross = 0, fedWithheld = 0, stateGross = 0, stateWithheld = 0;
    Object.values(incomeDocs).forEach(doc => {
        if (!doc) return;
        const f = doc.fields;
        const gross = f.grossPay ?? f.w2Box1 ?? ((f.shares != null && f.pricePerShare != null) ? f.shares * f.pricePerShare : null);
        const fed   = f.fedWithheld ?? f.w2Box2 ?? null;
        const state = f.stateWithheld ?? f.w2Box17 ?? null;
        if (gross != null && fed   != null) { fedGross   += gross; fedWithheld   += fed; }
        if (gross != null && state != null) { stateGross += gross; stateWithheld += state; }
    });

    const fedActualEl   = document.getElementById('fedEffRateActual');
    const stateActualEl = document.getElementById('stateEffRateActual');
    if (fedActualEl) fedActualEl.textContent = fedGross > 0 ? `~${fmt(fedWithheld / fedGross * 100, 1)}% (from income statement)` : '';
    if (stateActualEl) {
        const state = document.getElementById('incomeState')?.value || '';
        const city  = document.getElementById('incomeCity')?.value.trim() || '';
        const label = [state, city].filter(Boolean).join(' - ');
        stateActualEl.textContent = stateGross > 0 ? `~${fmt(stateWithheld / stateGross * 100, 1)}% (from income statement${label ? ', ' + label : ''})` : '';
    }
    renderIncomeBracket();
}

function getMarginalBracket(annualGross, filingStatus) {
    const cfg = TAX_CONFIG.federal[filingStatus] || TAX_CONFIG.federal.single;
    const taxable = Math.max(0, annualGross - cfg.stdDed);
    for (const [cap, rate] of cfg.brackets) {
        if (taxable <= cap) return rate;
    }
    return cfg.brackets[cfg.brackets.length - 1][1];
}

function renderIncomeBracket() {
    const el = document.getElementById('incomeBracketBody');
    if (!el) return;
    const w2 = incomeDocs.w2;
    const annualGross = (w2 && w2.fields.w2Box1 != null)
        ? w2.fields.w2Box1
        : (getVal('base') + getVal('refresher') + getVal('rsu') + getVal('base') * (getVal('bonusPct') / 100));
    const filing = document.getElementById('filingStatus')?.value || 'single';
    const rate = getMarginalBracket(annualGross, filing);
    const source = (w2 && w2.fields.w2Box1 != null) ? 'your uploaded W-2' : 'the income entered on the Edit tab';
    el.innerHTML = `Based on an estimated annual income of $${fmt(annualGross, 0)} (from ${source}), you are in the <strong>${fmt(rate * 100, 0)}%</strong> federal marginal tax bracket.`;
}

async function saveIncomeDocToServer(category, record) {
    try {
        await fetch(`${PLAID_SERVER}/api/save-income-doc`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ category, record }),
        });
    } catch (e) {}
}

async function loadIncomeDocsFromServer() {
    try {
        const res  = await fetch(`${PLAID_SERVER}/api/load-income-docs`);
        const data = await res.json();
        if (!data.docs) return;
        incomeDocs = { paystub: null, w2: null, rsu: null, bonus: null, ...data.docs };
        saveToStorage();
        renderIncomeDocsList();
        renderIncomeStatementRates();
        if (document.getElementById('monthly-real')?.classList.contains('active')) renderMonthlyReal();
    } catch (e) {}
}

/* ══════════════════════════════════════════
   Custom category keywords — per-category columns
══════════════════════════════════════════ */
const CC_CATEGORY_NAMES = [
    'Groceries','Dining Out','Gas & Auto','Shopping','Subscriptions',
    'Health','Travel','Utilities','Entertainment','Tithing','Transfers','Other'
];

// Returns expense category names the user created that aren't already a built-in category
function getUserExpenseCategories() {
    const builtIn = new Set(CC_CATEGORY_NAMES);
    const seen = new Set();
    const result = [];
    expenses.forEach(e => {
        if (e.name && !builtIn.has(e.name) && !seen.has(e.name)) {
            seen.add(e.name);
            result.push(e.name);
        }
    });
    // Also include any persisted user-category keywords that aren't built-in
    Object.keys(categoryKeywords).forEach(cat => {
        if (!builtIn.has(cat) && !seen.has(cat)) {
            seen.add(cat);
            result.push(cat);
        }
    });
    return result;
}

let categoryKeywords = {};  // { 'Groceries': ['weee', ...], 'Dining Out': [...], ... }
let subCategories    = {};  // { 'Shopping': ['Technology', 'Sports', 'Fashion'], ... }
let subCatKeywords   = {};  // { 'Shopping__Technology': ['apple', 'best buy'], ... }
let deletedCats      = new Set();  // built-in categories the user removed — excluded from classify + cards
let categoryRenames  = {}; // { originalBuiltinName: currentDisplayName } — user renames of built-in categories

// Renames a built-in category's identity in the hardcoded lookup tables that aren't
// otherwise persisted via localStorage (CC_CATEGORY_NAMES/CC_CATEGORIES/DESCRIPTION_HINTS/
// CATEGORY_COLORS). Used both for a live rename and to replay persisted renames against
// the pristine hardcoded defaults on every page load (since those consts reset on reload).
function renameCategoryIdentity(oldName, newName) {
    const nameIdx = CC_CATEGORY_NAMES.indexOf(oldName);
    if (nameIdx !== -1) CC_CATEGORY_NAMES[nameIdx] = newName;
    const ccDef = CC_CATEGORIES.find(c => c.name === oldName);
    if (ccDef) ccDef.name = newName;
    if (DESCRIPTION_HINTS[oldName]) {
        DESCRIPTION_HINTS[newName] = DESCRIPTION_HINTS[oldName];
        delete DESCRIPTION_HINTS[oldName];
    }
    if (CATEGORY_COLORS[oldName]) {
        CATEGORY_COLORS[newName] = CATEGORY_COLORS[oldName];
        delete CATEGORY_COLORS[oldName];
    }
}

// Replays every persisted rename against the fresh (hardcoded-default) identity tables —
// must run early on every load, before anything reads CC_CATEGORY_NAMES/activeBuiltins().
function applyPersistedCategoryRenames() {
    Object.entries(categoryRenames).forEach(([origName, currentName]) => {
        if (origName !== currentName) renameCategoryIdentity(origName, currentName);
    });
}

// Commits a rename of a category (built-in or custom) typed into the Edit tab. Rekeys
// every structure keyed by category name so keywords/sub-categories/budget/auto-detection
// all follow the new name, then reclassifies transactions so the change shows up everywhere
// (Monthly Real, charts, badges) immediately instead of just cosmetically relabeling.
const _catRenameTimers = new WeakMap();

// Debounced auto-commit while typing — fires ~900ms after the user pauses. Restores
// focus/cursor afterward since the commit re-renders the input into a fresh DOM node.
function scheduleCategoryRename(inputEl) {
    clearTimeout(_catRenameTimers.get(inputEl));
    _catRenameTimers.set(inputEl, setTimeout(() => {
        const hadFocus = document.activeElement === inputEl;
        commitCategoryRename(inputEl.dataset.origName, parseInt(inputEl.dataset.expId, 10), inputEl.value);
        if (hadFocus) {
            const fresh = document.getElementById(inputEl.id);
            if (fresh) { fresh.focus(); const p = fresh.value.length; fresh.setSelectionRange(p, p); }
        }
    }, 900));
}

// Immediate commit on blur/Enter — cancels any pending debounce so it doesn't double-fire.
function flushCategoryRename(inputEl) {
    clearTimeout(_catRenameTimers.get(inputEl));
    commitCategoryRename(inputEl.dataset.origName, parseInt(inputEl.dataset.expId, 10), inputEl.value);
}

function commitCategoryRename(oldName, id, newName) {
    newName = (newName || '').trim();
    if (!newName || newName === oldName) { renderCategories(); return; }

    const collision = expenses.some(e => e.id !== id && e.name && e.name.toLowerCase() === newName.toLowerCase());
    if (collision) { alert(`"${newName}" is already a category name.`); renderCategories(); return; }

    renameCategoryIdentity(oldName, newName);

    if (categoryKeywords[oldName]) { categoryKeywords[newName] = categoryKeywords[oldName]; delete categoryKeywords[oldName]; }
    if (subCategories[oldName])    { subCategories[newName]    = subCategories[oldName];    delete subCategories[oldName]; }
    Object.keys(subCatKeywords).forEach(key => {
        if (key.startsWith(oldName + '__')) {
            subCatKeywords[newName + '__' + key.slice(oldName.length + 2)] = subCatKeywords[key];
            delete subCatKeywords[key];
        }
    });
    if (deletedCats.has(oldName)) { deletedCats.delete(oldName); deletedCats.add(newName); }

    const exp = expenses.find(e => e.id === id);
    if (exp) exp.name = newName;

    // Track by original identity so re-renaming an already-renamed category updates
    // the same entry instead of chaining (Gas & Auto -> Charging -> EV Charging).
    // Harmless no-op for custom (non-built-in) categories, which don't need identity replay.
    const origName = Object.keys(categoryRenames).find(k => categoryRenames[k] === oldName) || oldName;
    categoryRenames[origName] = newName;

    renderExpenses();
    if (typeof ccTransactions !== 'undefined' && ccTransactions.length > 0) reCategorizeAll();
    if (document.getElementById('monthly-real')?.classList.contains('active')) renderMonthlyReal();
    saveToStorage();
}

// Built-in category names still active (not deleted by the user)
function activeBuiltins() {
    return CC_CATEGORY_NAMES.filter(n => !deletedCats.has(n));
}

// Removes a category card entirely: its budget row, keywords, sub-categories, and
// (for built-ins) its auto-categorization. Affected transactions fall back to 'Other'.
function deleteCategory(name, id) {
    if (CC_CATEGORY_NAMES.includes(name)) deletedCats.add(name);
    if (id != null) expenses = expenses.filter(e => e.id !== id);
    else            expenses = expenses.filter(e => e.name !== name);
    delete categoryKeywords[name];
    (subCategories[name] || []).forEach(sub => delete subCatKeywords[name + '__' + sub]);
    delete subCategories[name];
    _expensesDirty = true;
    renderExpenses();          // re-renders cards + Monthly Ideal list + calculate()
    saveToStorage();
    if (typeof ccTransactions !== 'undefined' && ccTransactions.length > 0) reCategorizeAll();
}

// Alias kept for any legacy call paths
function renderCustomKeywords() { renderCategories(); }

function renderCategories() {
    const container = document.getElementById('editCategories');
    if (!container) return;

    const builtins = activeBuiltins();

    // Ensure every active built-in CC category has an expense entry (creates it at $0 if missing)
    const expByName = {};
    expenses.forEach(e => { if (e.name) expByName[e.name] = e; });
    builtins.forEach(name => {
        if (!expByName[name]) {
            const newE = { id: ++expId, name, value: 0 };
            expenses.push(newE);
            expByName[name] = newE;
        }
    });

    // Order: active built-in CC categories first (fixed order), then user-added extras
    const shownNames = new Set();
    const ordered = [];
    builtins.forEach(name => {
        ordered.push({ name, expense: expByName[name], isBuiltIn: true });
        shownNames.add(name);
    });
    expenses.forEach(e => {
        // Custom categories are shown even with a blank name (not just already-named
        // ones) so a newly-added category actually has a card with a rename box —
        // otherwise there's no way to ever give it a name in the first place.
        if (builtins.includes(e.name)) return;
        if (e.name && shownNames.has(e.name)) return;
        ordered.push({ name: e.name, expense: e, isBuiltIn: false });
        if (e.name) shownNames.add(e.name);
    });

    container.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:flex-start;">
        ${ordered.map(({ name: cat, expense: e, isBuiltIn }) => {
            const safe = cat ? cat.replace(/[^a-zA-Z0-9]/g, '_') : ('_blank' + e.id);
            const esc  = cat.replace(/'/g, "\\'");
            const kws  = categoryKeywords[cat] || [];
            const subs = subCategories[cat]    || [];

            const subHtml = subs.map(sub => {
                const subSafe = sub.replace(/[^a-zA-Z0-9]/g, '_');
                const subEsc  = sub.replace(/'/g, "\\'");
                const subKws  = subCatKeywords[cat + '__' + sub] || [];
                return `<div class="sub-cat-edit-group">
                    <div class="sub-cat-edit-title">
                        <span>${sub}</span>
                        <button class="del-btn" onclick="deleteSubCategory('${esc}','${subEsc}')">×</button>
                    </div>
                    ${subKws.map((kw, i) => `<div class="kw-item" style="padding-left:6px;">
                        <span>${kw}</span>
                        <button class="del-btn" onclick="deleteSubCatKeyword('${esc}','${subEsc}',${i})">×</button>
                    </div>`).join('')}
                    <div class="kw-add-row">
                        <input type="text" id="skwInput_${safe}__${subSafe}" placeholder="add…"
                               onkeydown="if(event.key==='Enter')addSubCatKeyword('${esc}','${subEsc}')">
                        <button class="add-btn" style="margin-top:0;padding:2px 6px;font-size:12px;"
                                onclick="addSubCatKeyword('${esc}','${subEsc}')">+</button>
                    </div>
                </div>`;
            }).join('');

            // Renaming auto-commits ~1s after typing stops (like every other field in this
            // app), not just on blur — a built-in rename rekeys keywords/sub-categories and
            // reclassifies transactions, too heavy to run on every character, but requiring
            // an explicit blur/click-away with no visible confirmation reads as broken.
            const catAttr = cat.replace(/"/g,'&quot;');
            const titleHtml = `<div class="kw-col-title kw-col-title-user">
                       <input type="text" class="cat-name-input" id="cat-name-${e.id}"
                              value="${catAttr}" data-orig-name="${catAttr}" data-exp-id="${e.id}"
                              oninput="setExpenseName(${e.id}, this.value); scheduleCategoryRename(this)"
                              onblur="flushCategoryRename(this)"
                              onkeydown="if(event.key==='Enter')this.blur();"
                              placeholder="Category name">
                       <button class="del-btn" onclick="deleteCategory('${esc}', ${e.id})" title="Remove category">×</button>
                   </div>`;

            return `<div class="kw-col">
                ${titleHtml}
                ${kws.map((kw, i) => `<div class="kw-item">
                    <span>${kw}</span>
                    <button class="del-btn" onclick="deleteCustomKeyword('${esc}',${i})">×</button>
                </div>`).join('')}
                <div class="kw-add-row">
                    <input type="text" id="kwInput_${safe}" placeholder="add keyword…"
                           onkeydown="if(event.key==='Enter')addCustomKeyword('${esc}')">
                    <button class="add-btn" style="margin-top:0;padding:2px 6px;font-size:12px;"
                            onclick="addCustomKeyword('${esc}')">+</button>
                </div>
                ${subHtml ? `<div class="sub-cats-divider">Sub-categories</div>${subHtml}` : ''}
                <div class="kw-add-row" style="margin-top:4px;">
                    <input type="text" id="newSubInput_${safe}" placeholder="new sub-cat…"
                           onkeydown="if(event.key==='Enter')addSubCategory('${esc}')">
                    <button class="add-btn" style="margin-top:0;padding:2px 4px;font-size:11px;"
                            onclick="addSubCategory('${esc}')">+Sub</button>
                </div>
            </div>`;
        }).join('')}
    </div>`;
}

function addCustomKeyword(cat) {
    const safe  = cat.replace(/[^a-zA-Z0-9]/g, '_');
    const input = document.getElementById('kwInput_' + safe);
    if (!input) return;
    const kw = input.value.trim().toLowerCase();
    if (!kw) return;
    if (!categoryKeywords[cat]) categoryKeywords[cat] = [];
    if (!categoryKeywords[cat].includes(kw)) categoryKeywords[cat].push(kw);
    renderCustomKeywords();
    reCategorizeAll();
    saveToStorage();
    const fresh = document.getElementById('kwInput_' + safe);
    if (fresh) fresh.focus();
}

function deleteCustomKeyword(cat, idx) {
    if (categoryKeywords[cat]) categoryKeywords[cat].splice(idx, 1);
    renderCustomKeywords();
    reCategorizeAll();
    saveToStorage();
}

function addSubCategory(cat) {
    const safe  = cat.replace(/[^a-zA-Z0-9]/g, '_');
    const input = document.getElementById('newSubInput_' + safe);
    if (!input) return;
    const sub = input.value.trim();
    if (!sub) return;
    if (!subCategories[cat]) subCategories[cat] = [];
    if (!subCategories[cat].includes(sub)) subCategories[cat].push(sub);
    renderCustomKeywords();
    saveToStorage();
    const fresh = document.getElementById('newSubInput_' + safe);
    if (fresh) fresh.focus();
}

function deleteSubCategory(cat, sub) {
    if (subCategories[cat]) subCategories[cat] = subCategories[cat].filter(s => s !== sub);
    delete subCatKeywords[cat + '__' + sub];
    renderCustomKeywords();
    reCategorizeAll();
    saveToStorage();
}

function addSubCatKeyword(cat, sub) {
    const safe    = cat.replace(/[^a-zA-Z0-9]/g, '_');
    const subSafe = sub.replace(/[^a-zA-Z0-9]/g, '_');
    const input   = document.getElementById('skwInput_' + safe + '__' + subSafe);
    if (!input) return;
    const kw = input.value.trim().toLowerCase();
    if (!kw) return;
    const key = cat + '__' + sub;
    if (!subCatKeywords[key]) subCatKeywords[key] = [];
    if (!subCatKeywords[key].includes(kw)) subCatKeywords[key].push(kw);
    renderCustomKeywords();
    reCategorizeAll();
    saveToStorage();
    const fresh = document.getElementById('skwInput_' + safe + '__' + subSafe);
    if (fresh) fresh.focus();
}

function deleteSubCatKeyword(cat, sub, idx) {
    const key = cat + '__' + sub;
    if (subCatKeywords[key]) subCatKeywords[key].splice(idx, 1);
    renderCustomKeywords();
    reCategorizeAll();
    saveToStorage();
}


/* ══════════════════════════════════════════
   CSV Server Persistence
══════════════════════════════════════════ */
function updateLoadedAccountsList() {
    const el = document.getElementById('loadedAccountsList');
    if (!el) return;
    if (csvUploadMeta.length === 0) { el.innerHTML = ''; return; }

    // Count actual transactions per account (in case of re-merge changes)
    const txnCounts = new Map();
    csvTransactions.forEach(t => {
        if (t.accountName) txnCounts.set(t.accountName, (txnCounts.get(t.accountName) || 0) + 1);
    });

    el.innerHTML = csvUploadMeta.map(m => {
        const color    = getAccountColor(m.accountName);
        const safeName = m.accountName.replace(/'/g, "\\'");
        const cnt      = txnCounts.get(m.accountName) || m.count || 0;
        const dateStr  = new Date(m.uploadedAt).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
            timeZone: 'America/Los_Angeles',
        });
        return `
        <div style="display:flex;align-items:center;gap:10px;padding:5px 10px;margin-bottom:3px;background:#fafafa;border-left:3px solid ${color};border-radius:3px;">
            <span style="font-size:12px;font-weight:700;color:${color};min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:140px;" title="${m.accountName}">${m.accountName}</span>
            <span style="font-size:11px;color:#888;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${m.fileName}">${m.fileName}</span>
            <span style="font-size:11px;color:#aaa;white-space:nowrap;">${dateStr}</span>
            <span style="font-size:11px;color:#666;white-space:nowrap;">${cnt.toLocaleString()} rows</span>
            <button onclick="deleteCsvAccount('${safeName}')" title="Remove ${m.accountName}" style="background:none;border:none;color:#bbb;cursor:pointer;font-size:16px;line-height:1;padding:0 2px;flex-shrink:0;" onmouseover="this.style.color='#c00'" onmouseout="this.style.color='#bbb'">×</button>
        </div>`;
    }).join('');
}

function deleteCsvAccount(name) {
    csvTransactions = csvTransactions.filter(t => t.accountName !== name);
    csvUploadMeta   = csvUploadMeta.filter(m => m.accountName !== name);
    updateLoadedAccountsList();
    renderCsvHistory();
}

// Save current csvTransactions + metadata to localStorage for fast restore on next page load
function saveCsvTransactionsLocal() {
    try {
        localStorage.setItem('fc_csvTxns',  JSON.stringify(csvTransactions));
        localStorage.setItem('fc_csvMeta',  JSON.stringify(csvUploadMeta));
    } catch(e) {}
}

/* ══════════════════════════════════════════
   History (CSV Upload) tab rendering
══════════════════════════════════════════ */
let _csvHistCatSort = 'amount';

function setCsvHistCatSort(val) {
    _csvHistCatSort = val;
    csvHistApplyCatFilter();
}

function csvHistApplyCatFilter() {
    const from = document.getElementById('csvHistDateFrom')?.value;
    const to   = document.getElementById('csvHistDateTo')?.value;
    const filtered = csvTransactions.filter(t =>
        !CC_EXCLUDE_FROM_SPEND.has(t.category) &&
        (!from || t.isoDate >= from) &&
        (!to   || t.isoDate <= to)
    );
    const el = document.getElementById('csvHistCategoryBody');
    if (el) el.innerHTML = buildCatChart(filtered, 'h', _csvHistCatSort);
}

function renderCsvMonthlyTable(sortedMonths, totalCharged) {
    const totalRcvd = sortedMonths.reduce((s, [, m]) => s + (m.received || 0), 0);
    const rows = sortedMonths.map(([key, m]) => {
        const rcvd = m.received || 0;
        const spentDisplay = m.total >= 0
            ? `<span style="color:#c0392b;">$${fmt(m.total, 2)}</span>`
            : `<span style="color:#3d9970;" title="Net refunds">+$${fmt(-m.total, 2)}</span>`;
        return `<tr class="month-row" style="cursor:default;">
            <td>${key.slice(5,7)}/${key.slice(0,4)}</td>
            <td class="col-amt">${spentDisplay}</td>
            <td class="col-amt" style="color:#3d9970;">${rcvd > 0 ? '$' + fmt(rcvd, 2) : '—'}</td>
            <td class="col-pct">${m.count}</td>
        </tr>`;
    }).join('');
    return `<table class="analytics-table">
        <thead><tr>
            <th>Month</th>
            <th class="col-amt" style="color:#c0392b;">Spent</th>
            <th class="col-amt" style="color:#3d9970;">Received</th>
            <th class="col-pct">#</th>
        </tr></thead>
        <tbody>
            ${rows}
            <tr class="grand-total">
                <td>Total</td>
                <td class="col-amt" style="color:#c0392b;">$${fmt(totalCharged, 2)}</td>
                <td class="col-amt" style="color:#3d9970;">$${fmt(totalRcvd, 2)}</td>
                <td></td>
            </tr>
        </tbody>
    </table>`;
}

function renderCsvHistory() {
    const analyticsEl = document.getElementById('csvHistAnalytics');
    const rawBoxEl    = document.getElementById('histCsvPreviewBox');
    if (!analyticsEl) return;

    if (!csvTransactions || csvTransactions.length === 0) {
        analyticsEl.style.display = 'none';
        if (rawBoxEl) rawBoxEl.style.display = 'none';
        return;
    }

    const { charges, allNonEx, totalCharged, totalReceived, sortedMonths, monthlyAvg } = computeSummary(csvTransactions);

    const setH = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setH('csvHistCharged',  '$' + fmt(totalCharged,  2));
    setH('csvHistReceived', '$' + fmt(totalReceived, 2));
    setH('csvHistTxns',     csvTransactions.length + ' txns');
    setH('csvHistAvg',      '$' + fmt(monthlyAvg,    2));

    const monthBody = document.getElementById('csvHistMonthlyBody');
    if (monthBody) monthBody.innerHTML = renderCsvMonthlyTable(sortedMonths, totalCharged);

    // Set date range defaults for category chart
    const fromEl = document.getElementById('csvHistDateFrom');
    const toEl   = document.getElementById('csvHistDateTo');
    if (fromEl && !fromEl.value) {
        const allDates = csvTransactions.map(t => t.isoDate).filter(Boolean).sort();
        if (allDates.length) {
            fromEl.value = allDates[0];
            toEl.value   = allDates[allDates.length - 1];
        }
    }

    csvHistApplyCatFilter();
    renderCsvHistRawTable();

    analyticsEl.style.display = '';
    if (rawBoxEl) rawBoxEl.style.display = '';
}

function renderCsvHistRawTable() {
    const head  = document.getElementById('histCsvHead');
    const body  = document.getElementById('histCsvBody');
    const table = document.getElementById('histCsvTable');
    const empty = document.getElementById('histCsvEmpty');
    if (!head || !body) return;

    if (!csvTransactions.length) {
        if (table) table.style.display = 'none';
        if (empty) empty.style.display = '';
        return;
    }

    const searchQ = (document.getElementById('histCsvSearchInput')?.value || '').trim().toLowerCase();
    let txns = searchQ
        ? csvTransactions.filter(t =>
            (t.desc || '').toLowerCase().includes(searchQ) ||
            (t.category || '').toLowerCase().includes(searchQ) ||
            (t.accountName || '').toLowerCase().includes(searchQ) ||
            (t.isoDate || '').includes(searchQ))
        : [...csvTransactions];

    const countEl = document.getElementById('histCsvSearchCount');
    if (countEl) countEl.textContent = searchQ ? `${txns.length} of ${csvTransactions.length} transactions` : '';

    head.innerHTML = `<tr>
        <th>Date</th><th>Description</th><th>Amount</th><th>Category</th><th>Account</th>
    </tr>`;
    body.innerHTML = txns.map((t, i) => {
        const isPos  = t.amount > 0;
        const amtStr = isPos
            ? `<span style="color:#27ae60;">+$${fmt(t.amount, 2)}</span>`
            : `$${fmt(-t.amount, 2)}`;
        return `<tr class="${i % 2 === 0 ? 'csv-even' : 'csv-odd'}">
            <td>${t.isoDate || t.date || ''}</td>
            <td>${t.desc || ''}</td>
            <td style="white-space:nowrap;">${amtStr}</td>
            <td>${t.category || ''}</td>
            <td>${t.accountName || ''}</td>
        </tr>`;
    }).join('');

    if (table) table.style.display = 'table';
    if (empty) empty.style.display = 'none';
}

function toggleHistCsvRaw() {
    const content = document.getElementById('histCsvRawContent');
    const btn     = document.getElementById('histCsvRawToggleBtn');
    if (!content) return;
    const isHidden = content.style.display === 'none';
    content.style.display = isHidden ? '' : 'none';
    if (btn) btn.textContent = isHidden ? '▼ Hide' : '▶ Show';
    if (isHidden) renderCsvHistRawTable();
}

async function saveCsvToServer(rows, accountName) {
    try {
        await fetch(`${PLAID_SERVER}/api/save-csv`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ rows, accountName: accountName || 'CSV' }),
        });
    } catch (e) {}
}

async function loadCsvFromServer() {
    try {
        const res  = await fetch(`${PLAID_SERVER}/api/load-csv`);
        const data = await res.json();
        if (!data.accounts || data.accounts.length === 0) return;

        // Clear existing CSV transactions before re-loading all
        csvTransactions = [];
        csvUploadMeta   = [];

        data.accounts.forEach(({ accountName, rows }) => {
            if (!rows || rows.length < 2) return;
            const parsed = parseCSVRows(rows, accountName);
            csvTransactions = csvTransactions.concat(parsed);
            // Rebuild metadata — no filename available, mark as "server restore"
            csvUploadMeta.push({
                accountName,
                fileName:   'restored from server',
                uploadedAt: new Date().toISOString(),
                count:      parsed.length,
            });
        });

        if (csvTransactions.length === 0) return;

        // Sort newest-first
        csvTransactions.sort((a, b) => b.isoDate.localeCompare(a.isoDate));
        renderCsvHistory();
        saveCsvTransactionsLocal();

        const totalRows = data.accounts.reduce((s, a) => s + (a.rows.length - 1), 0);
        const statusEl = document.getElementById('csvStatus');
        if (statusEl) statusEl.textContent = `${totalRows} rows restored (${data.accounts.length} account${data.accounts.length !== 1 ? 's' : ''})`;
        updateLoadedAccountsList();
    } catch (e) {}
}

/* ══════════════════════════════════════════
   Plaid Bank Sync
══════════════════════════════════════════ */
// Use HTTPS when served over HTTPS (production), HTTP for sandbox file:// access
const PLAID_SERVER = window.location.protocol === 'https:' ? 'https://localhost:3001' : 'http://localhost:3001';

let _plaidLinked        = false;
let _plaidAccounts      = [];   // flattened accounts across all linked banks, cached from last showPlaidAccounts call
let _plaidAllByAccount  = {};   // unfiltered txns per account name, from /api/all-transactions

async function plaidCheckStatus() {
    try {
        const res = await fetch(`${PLAID_SERVER}/api/status`);
        const data = await res.json();
        setPlaidUI(data.linked);
        // Auto-sync on page load if already connected
        if (data.linked) plaidSync();
    } catch {
        document.getElementById('plaidStatus').textContent = '(Start server.js to enable bank sync)';
    }
}

function setPlaidUI(linked) {
    _plaidLinked = linked;
    const btn    = document.getElementById('plaidToggleBtn');
    const addBtn = document.getElementById('plaidAddBankBtn');
    if (linked) {
        btn.style.display = 'none';
        if (addBtn) addBtn.style.display = '';
    } else {
        btn.textContent    = 'Connect Bank';
        btn.style.color    = '';
        btn.style.display  = '';
        if (addBtn) addBtn.style.display = 'none';
    }
}

async function plaidConnect() {
    const statusEl = document.getElementById('plaidStatus');
    statusEl.textContent = 'Opening Plaid Link…';
    try {
        const res = await fetch(`${PLAID_SERVER}/api/create_link_token`, { method: 'POST' });
        const { link_token, error } = await res.json();
        if (error) { statusEl.textContent = 'Error: ' + error; return; }

        // Store link_token so we can re-initialize after an OAuth redirect (Wells Fargo production)
        sessionStorage.setItem('plaid_link_token', link_token);

        const handler = Plaid.create({
            token: link_token,
            // receivedRedirectUri is set when returning from a WF OAuth redirect
            ...(window._plaidOAuthRedirectUri ? { receivedRedirectUri: window._plaidOAuthRedirectUri } : {}),
            onSuccess: async (public_token) => {
                sessionStorage.removeItem('plaid_link_token');
                statusEl.textContent = 'Linking account…';
                const ex = await fetch(`${PLAID_SERVER}/api/exchange_token`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ public_token }),
                });
                const exData = await ex.json();
                if (exData.error) { statusEl.textContent = 'Error: ' + exData.error; return; }
                setPlaidUI(true);
                plaidSync();
            },
            onExit: (err) => {
                if (err) statusEl.textContent = 'Plaid error: ' + (err.display_message || err.error_message);
                else statusEl.textContent = '';
            },
        });
        handler.open();
    } catch (e) {
        statusEl.textContent = 'Cannot reach server — is server.js running?';
    }
}

// Called on page load to resume a Wells Fargo OAuth redirect mid-flow
function plaidResumeOAuthIfNeeded() {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('oauth_state_id')) return;   // not an OAuth redirect

    const savedToken = sessionStorage.getItem('plaid_link_token');
    if (!savedToken) return;   // no saved token — can't resume

    // Pass the full current URL as receivedRedirectUri and re-open Link
    window._plaidOAuthRedirectUri = window.location.href;
    document.getElementById('plaidStatus').textContent = 'Completing Wells Fargo login…';
    plaidConnect();
}

// items: [{ itemId, institution, accounts }, ...] — one entry per linked bank
function showPlaidAccounts(items) {
    const box  = document.getElementById('plaidAccountsInBox');
    const list = document.getElementById('plaidAccountsList');
    if (!box || !list) return;
    const nonEmptyItems = (items || []).filter(it => it.accounts && it.accounts.length > 0);
    if (nonEmptyItems.length === 0) { box.style.display = 'none'; return; }
    box.style.display = '';

    // Flatten for toggleAcctPanel's index-based lookup, but render grouped by institution
    _plaidAccounts = [];
    const TYPE_ICON = { credit: '💳', checking: '🏦', savings: '🏦', depository: '🏦' };

    list.innerHTML = nonEmptyItems.map(item => {
        const acctsHtml = item.accounts.map(a => {
            const idx      = _plaidAccounts.push(a) - 1;
            const color    = getAccountColor(a.name);
            const icon     = TYPE_ICON[a.subtype] || TYPE_ICON[a.type] || '🏦';
            const sub      = a.subtype || a.type || '';
            const maskStr  = a.mask ? `····${a.mask}` : '';
            const balStr   = a.balance != null ? `$${fmt(a.balance, 2)}` : '';
            const availStr = (a.available != null && a.available !== a.balance)
                ? ` <span style="color:#888;">(avail $${fmt(a.available,2)})</span>` : '';
            return `<div>
                <div class="acct-badge" style="border-left: 4px solid ${color}; cursor:pointer;"
                     onclick="toggleAcctPanel(${idx})">
                    <span style="display:flex; align-items:center; gap:6px; flex:1; min-width:0;">
                        <span style="font-size:15px;">${icon}</span>
                        <strong style="font-size:13px;">${escapeHtml(a.name || '—')}</strong>
                        <span style="color:#aaa; font-size:11px;">${sub ? `(${escapeHtml(sub)})` : ''} ${escapeHtml(maskStr)}</span>
                    </span>
                    <span style="font-size:12px; font-weight:600; color:#1a3a6e; white-space:nowrap;">${balStr}${availStr}</span>
                    <span id="acct-arrow-${idx}" style="font-size:9px; color:#aaa; margin-left:4px; flex-shrink:0;">▶</span>
                </div>
                <div id="acct-panel-${idx}" class="acct-txn-panel" style="display:none;"></div>
            </div>`;
        }).join('');

        return `<div>
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:3px;">
                <span style="font-size:11px; color:#888; font-weight:600; text-transform:uppercase; letter-spacing:.5px;">
                    🏛 ${escapeHtml(item.institution || 'Live Accounts')}
                </span>
                <span onclick="plaidUnlinkItem(${escapeHtml(JSON.stringify(item.itemId))}, ${escapeHtml(JSON.stringify(item.institution || 'this bank'))})"
                      style="font-size:11px; color:#b00; cursor:pointer;">✕ Disconnect</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:2px;">${acctsHtml}</div>
        </div>`;
    }).join('');
}

function toggleAcctPanel(idx) {
    const panel = document.getElementById(`acct-panel-${idx}`);
    const arrow = document.getElementById(`acct-arrow-${idx}`);
    if (!panel) return;

    if (panel.style.display !== 'none') {
        panel.style.display = 'none';
        if (arrow) arrow.textContent = '▶';
        return;
    }

    const a = _plaidAccounts[idx];
    if (!a) return;

    // Use unfiltered all-transactions if available; fall back to spending-only plaidTransactions
    const raw = (_plaidAllByAccount[a.name] || []);
    const txns = raw.length > 0
        ? raw  // already sorted newest-first by server
        : plaidTransactions
            .filter(t => t.accountName === a.name)
            .sort((x, y) => (y.isoDate || y.date || '').localeCompare(x.isoDate || x.date || ''));

    if (txns.length === 0) {
        panel.innerHTML = '<div style="padding:5px 12px; color:#aaa; font-size:12px; font-style:italic;">No transactions loaded for this account.</div>';
        panel.style.display = '';
        if (arrow) arrow.textContent = '▼';
        return;
    }

    // Build rows with running balance (start from current balance, work backwards in time)
    // credit card: balance_before = balance_after + our_amount  (charge is negative, reduces owed)
    // depository:  balance_before = balance_after - our_amount  (charge is negative, increases prior balance)
    const isCredit = a.type === 'credit';
    let runBal = a.balance;

    const rows = txns.map(t => {
        const balAfter = runBal;
        if (runBal != null) {
            runBal = isCredit ? runBal + t.amount : runBal - t.amount;
        }

        const d = t.isoDate || t.date || '';
        const dateStr = d.length >= 10
            ? `${d.slice(5,7)}/${d.slice(8,10)}/${d.slice(2,4)}`
            : d;
        const isCharge = t.amount < 0;
        const amtStr   = isCharge ? `-$${fmt(-t.amount, 2)}` : `+$${fmt(t.amount, 2)}`;
        const amtColor = isCharge ? '#c00' : '#2a7a2a';
        const balStr   = balAfter != null ? `$${fmt(balAfter, 2)}` : '—';
        const desc     = escapeHtml(t.desc || t.description || '—');

        return `<div class="acct-txn-row">
            <span class="acct-txn-date">${dateStr}</span>
            <span class="acct-txn-desc" title="${desc}">${desc}</span>
            <span class="acct-txn-amt" style="color:${amtColor}">${amtStr}</span>
            <span class="acct-txn-bal">${balStr}</span>
        </div>`;
    }).join('');

    panel.innerHTML = `
        ${rows}`;
    panel.style.display = '';
    if (arrow) arrow.textContent = '▼';
}

async function plaidSync() {
    const statusEl = document.getElementById('plaidStatus');
    statusEl.textContent = 'Syncing…';
    try {
        const res = await fetch(`${PLAID_SERVER}/api/transactions`);
        const data = await res.json();
        if (data.error) { statusEl.textContent = 'Sync error: ' + data.error; return; }

        // Convert Plaid response into normalized transaction objects (same shape as CSV transactions).
        // Plaid: positive amount = debit (money out). Internal convention: negative = charge (matches WF CSV).
        plaidTransactions = data.transactions.map(t => {
            const isoDate = t.date;
            const d = new Date(isoDate);
            const amount = -t.amount;
            const { cat, sub } = categorizeTxn(t.description, isoDate, amount);
            return {
                date:          t.date,
                isoDate,
                amount,
                desc:          t.description,
                valid:         true,
                month:         isoDate.slice(0, 7),
                mLabel:        d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
                category:      cat,
                subCategory:   sub,
                source:        'plaid',
                plaidCategory: t.plaidCategory || '',
                accountName:   t.accountName || '',
                accountType:   t.accountType || '',
                accountSub:    t.accountSub  || '',
            };
        });

        mergeTxnSources();

        // Rebuild full CC analytics UI
        const { charges, allNonEx, totalCharged, totalReceived, sortedMonths, monthlyAvg } = computeSummary(ccTransactions);
        updateSummaryCards({ charges, totalCharged, totalReceived, monthlyAvg });
        document.getElementById('ccMonthlyBody').innerHTML = renderMonthlyTable(sortedMonths, totalCharged, allNonEx, totalReceived);

        // Extend date range to cover all transactions; always push ccDateTo to today since Plaid is live
        const todayISO = new Date().toISOString().slice(0, 10);
        const allIsoDates = ccTransactions.map(t => t.isoDate).filter(Boolean).sort();
        if (allIsoDates.length) {
            const fromEl = document.getElementById('ccDateFrom');
            const toEl   = document.getElementById('ccDateTo');
            if (!fromEl.value) fromEl.value = allIsoDates[0];
            toEl.value = todayISO;  // always extend to today after a live sync
        }

        const el = document.getElementById('ccAnalytics');
        el.style.display       = 'flex';
        el.style.flexDirection = 'column';
        el.style.gap           = '12px';

        ccApplyDateFilter();
        renderUnifiedRawTable();
        renderTransferTriangle();
        renderRecentTransactions();
        renderZelleVenmoBox();
        saveToStorage();

        // Fetch account details (with balances + institution name) separately — more reliable than inline summary
        try {
            const acctRes  = await fetch(`${PLAID_SERVER}/api/accounts`);
            const acctData = await acctRes.json();
            if (acctData.items && acctData.items.length > 0) {
                showPlaidAccounts(acctData.items);
            }
        } catch (_) {}

        // Fetch ALL transactions per account (unfiltered — for the per-account dropdown)
        try {
            const allRes  = await fetch(`${PLAID_SERVER}/api/all-transactions`);
            const allData = await allRes.json();
            if (allData.byAccount) _plaidAllByAccount = allData.byAccount;
        } catch (_) {}

        const csvEndStr = csvTransactions.length
            ? ` · CSV ends ${csvLastMonth()?.slice(5,7)}/${csvLastMonth()?.slice(0,4)}`
            : '';
        const newStr = (data.newCount != null && data.newCount > 0) ? ` (+${data.newCount} new)` : '';
        statusEl.textContent = `${data.count} txns${newStr}${csvEndStr}`;

        // Show last-synced timestamp with timezone abbreviation
        const syncTime = new Date();
        const syncTZ   = syncTime.toLocaleTimeString('en-US', {
            timeZone: 'America/Los_Angeles', timeZoneName: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
        }); // e.g. "3:42 PM PDT"
        const syncLabel = syncTime.toLocaleDateString('en-US', {
            timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', year: 'numeric',
        }) + ' at ' + syncTZ;
        const syncSpan = document.getElementById('plaidLastSync');
        const syncRow  = document.getElementById('plaidLastSyncRow');
        if (syncSpan) syncSpan.textContent = syncLabel;
        if (syncRow)  syncRow.style.display = '';
    } catch (e) {
        statusEl.textContent = 'Cannot reach server — is server.js running?';
    }
}

async function plaidUnlinkItem(itemId, institutionName) {
    if (!confirm(`Disconnect ${institutionName}? Live sync will stop for this bank (CSV data stays).`)) return;
    await fetch(`${PLAID_SERVER}/api/unlink`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ itemId }),
    });

    // Clear cached Plaid transactions in memory/storage; re-sync remaining linked banks (if any)
    plaidTransactions = [];
    plaidCoverStart   = null;
    localStorage.removeItem('fc_plaidTxns');

    const statusRes  = await fetch(`${PLAID_SERVER}/api/status`);
    const statusData = await statusRes.json();
    setPlaidUI(statusData.linked);

    if (statusData.linked) {
        plaidSync();
    } else {
        mergeTxnSources();  // ccTransactions reverts to CSV-only
        const box = document.getElementById('plaidAccountsInBox');
        if (box) box.style.display = 'none';
        document.getElementById('plaidStatus').textContent = `${institutionName} disconnected`;
    }
}

function toggleRawData() {
    const content  = document.getElementById('rawDataContent');
    const btn      = document.getElementById('rawDataToggleBtn');
    const sortSel  = document.getElementById('rawSortSelect');
    const open     = content.style.display !== 'none';
    content.style.display  = open ? 'none' : 'block';
    if (sortSel) sortSel.style.display = open ? 'none' : '';
    btn.textContent = open ? '▶ Show' : '▼ Hide';
}

// Resume WF OAuth redirect if we were sent back mid-flow (production only)
plaidResumeOAuthIfNeeded();
// Check bank link status on load — auto-syncs if already connected
plaidCheckStatus();


/* ══════════════════════════════════════════
   Account Transfer Flow Triangle
══════════════════════════════════════════ */

// Map account to Savings / Checking / Credit node type
function getAcctNodeType(accountName, accountSub, accountType) {
    const n = (accountName || '').toLowerCase();
    const s = (accountSub  || '').toLowerCase();
    const t = (accountType || '').toLowerCase();
    if (s === 'savings' || n.includes('saving')) return 'savings';
    if (s === 'checking' || n.includes('checking')) return 'checking';
    if (t === 'credit' || s === 'credit card' || n.includes('visa') || n.includes('mastercard')
            || n.includes('autograph') || n.includes('active cash')) return 'credit';
    return null;
}

// Parse destination node type from transfer description
function parseDestNodeType(desc) {
    const d = (desc || '').toLowerCase();
    if (/saving/i.test(d)) return 'savings';
    if (/checking|everyday checking/i.test(d)) return 'checking';
    if (/visa|autograph|active cash|credit card|mastercard/i.test(d)) return 'credit';
    return null;
}

// Aggregate inter-account transfer flows: { "checking→credit": 1234.56, ... }
function detectTransferFlows(txns) {
    const flows = {};
    txns.forEach(t => {
        if (t.amount >= 0) return;  // only outgoing (debit) transfers
        const d = t.desc || '';
        if (!/online transfer/i.test(d) && !/recurring transfer (to|from)/i.test(d)) return;
        const srcType  = getAcctNodeType(t.accountName, t.accountSub, t.accountType);
        const destType = parseDestNodeType(d);
        if (!srcType || !destType || srcType === destType) return;
        const key = `${srcType}→${destType}`;
        flows[key] = (flows[key] || 0) + Math.abs(t.amount);
    });
    return flows;
}

// Render the triangle SVG with arrow flows
function buildTriangleSVG(flows, uid = '') {
    const W = 420, H = 320;
    const nodes = {
        savings:  { x: 210, y: 55,  label: 'Savings',     emoji: '🏦' },
        checking: { x: 70,  y: 275, label: 'Checking',    emoji: '💵' },
        credit:   { x: 350, y: 275, label: 'Credit Card', emoji: '💳' },
    };
    const nodeR = 40;
    const fmtAmt = v => v >= 1000 ? '$' + (v / 1000).toFixed(1) + 'k' : '$' + Math.round(v);

    // Track bidirectional pairs so we can offset overlapping arrows
    const bidiCount = {};
    for (const key of Object.keys(flows)) {
        const [a, b] = key.split('→');
        const pk = [a, b].sort().join('|');
        bidiCount[pk] = (bidiCount[pk] || 0) + 1;
    }
    const pairIdx = {};

    let lines = '', labels = '', circles = '';

    for (const [key, total] of Object.entries(flows)) {
        const [from, to] = key.split('→');
        const nf = nodes[from], nt = nodes[to];
        if (!nf || !nt) continue;

        const pk = [from, to].sort().join('|');
        const isBidi = (bidiCount[pk] || 0) > 1;
        if (pairIdx[pk] === undefined) pairIdx[pk] = 0;
        const side  = isBidi ? (pairIdx[pk] === 0 ? 1 : -1) : 0;
        pairIdx[pk]++;

        const dx = nt.x - nf.x, dy = nt.y - nf.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const ux = dx / dist, uy = dy / dist;
        const offX = -uy * side * 18, offY = ux * side * 18;

        const x1 = (nf.x + ux * nodeR + offX).toFixed(1);
        const y1 = (nf.y + uy * nodeR + offY).toFixed(1);
        const x2 = (nt.x - ux * (nodeR + 8) + offX).toFixed(1);
        const y2 = (nt.y - uy * (nodeR + 8) + offY).toFixed(1);
        const mx = ((+x1 + +x2) / 2).toFixed(1);
        const my = ((+y1 + +y2) / 2).toFixed(1);

        lines += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"
            stroke="#3d85c8" stroke-width="2.5" marker-end="url(#tfArrow${uid})"/>`;
        labels += `<rect x="${(+mx - 30).toFixed(1)}" y="${(+my - 11).toFixed(1)}"
            width="60" height="20" rx="4" fill="white" stroke="#d0d8e8" stroke-width="1"/>
            <text x="${mx}" y="${(+my + 5).toFixed(1)}" text-anchor="middle"
            font-size="12" font-family="Arial,sans-serif" font-weight="600" fill="#1a3a6e">${fmtAmt(total)}</text>`;
    }

    for (const [key, n] of Object.entries(nodes)) {
        const active = Object.keys(flows).some(k => k.startsWith(key + '→') || k.endsWith('→' + key));
        circles += `<circle cx="${n.x}" cy="${n.y}" r="${nodeR}"
            fill="${active ? '#eef3fb' : '#f5f5f5'}"
            stroke="${active ? '#3d85c8' : '#ccc'}" stroke-width="${active ? 2.5 : 1.5}"/>
            <text x="${n.x}" y="${n.y - 7}" text-anchor="middle" font-size="20">${n.emoji}</text>
            <text x="${n.x}" y="${n.y + 15}" text-anchor="middle"
            font-size="11" font-family="Arial,sans-serif" font-weight="bold"
            fill="${active ? '#1a3a6e' : '#aaa'}">${n.label}</text>`;
    }

    // uid keeps marker IDs unique when two SVGs appear on the same page simultaneously
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"
        style="max-width:440px; width:100%; display:block; margin:0 auto;">
        <defs>
            <marker id="tfArrow${uid}" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                <polygon points="0 0,8 3,0 6" fill="#3d85c8"/>
            </marker>
        </defs>
        ${lines}${labels}${circles}
    </svg>`;
}

function renderTransferTriangle(monthKey) {
    const box  = document.getElementById('transferFlowBox');
    const body = document.getElementById('transferFlowBody');
    if (!box || !body) return;

    // All-time flows (always computed — right panel)
    const totalFlows = detectTransferFlows(ccTransactions);
    if (Object.keys(totalFlows).length === 0) { box.style.display = 'none'; return; }
    box.style.display = '';

    // Monthly flows (left panel, only when a month is selected)
    const monthFlows = monthKey
        ? detectTransferFlows(ccTransactions.filter(t => t.month === monthKey))
        : null;

    const fmtDollar = v => '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const nodeLabels = { savings: 'Savings', checking: 'Checking', credit: 'Credit Card' };

    function flowList(flows) {
        return Object.entries(flows).map(([key, total]) => {
            const [from, to] = key.split('→');
            return `<div style="display:flex; align-items:center; gap:5px; margin:2px 0; font-size:12px; flex-wrap:wrap;">
                <span style="font-weight:600; color:#3d85c8;">${nodeLabels[from] || from}</span>
                <span style="color:#ccc;">→</span>
                <span style="font-weight:600; color:#3d85c8;">${nodeLabels[to] || to}</span>
                <span style="font-weight:bold; color:#1a3a6e;">${fmtDollar(total)}</span>
            </div>`;
        }).join('');
    }

    // Month label for left panel
    const monthLabel = monthKey
        ? (() => { const t = ccTransactions.find(x => x.month === monthKey); return t ? t.mLabel : monthKey; })()
        : null;

    // Left panel — current month (only when a month row is selected)
    const leftPanel = monthKey ? `
        <div style="flex:1; min-width:0; padding:4px 14px 6px 12px; border-right:1px solid #e8e8e8;">
            <div style="font-size:10px; font-weight:700; color:#888; text-transform:uppercase; letter-spacing:.6px; margin-bottom:2px;">
                📅 ${monthLabel}
            </div>
            ${Object.keys(monthFlows).length > 0
                ? buildTriangleSVG(monthFlows, '-m') + `<div style="margin-top:4px;">${flowList(monthFlows)}</div>`
                : `<div style="padding:40px 0; text-align:center; color:#bbb; font-size:12px;">No transfers this month</div>`
            }
        </div>` : '';

    // Right panel — all time (always shown)
    const rightPanel = `
        <div style="flex:1; min-width:0; padding:4px 12px 6px ${monthKey ? '14px' : '12px'};">
            <div style="font-size:10px; font-weight:700; color:#888; text-transform:uppercase; letter-spacing:.6px; margin-bottom:2px;">
                All Time
            </div>
            ${buildTriangleSVG(totalFlows, '-a')}
            <div style="margin-top:4px;">${flowList(totalFlows)}</div>
        </div>`;

    body.innerHTML = `
        <div style="display:flex; align-items:flex-start; gap:0;">
            ${leftPanel}
            ${rightPanel}
        </div>
        <p style="font-size:11px; color:#aaa; margin:0 12px 8px; padding-top:4px; border-top:1px solid #f0f0f0; line-height:1.5;">
            Transfers between your own accounts — excluded from expense totals.
        </p>`;
}


/* ══════════════════════════════════════════
   AI Analyze
   Multiple independent chat sessions (tmux-style: create/switch/rename/
   delete), each backed by /api/ai/chats/* on the server, which proxies
   Claude and persists full message history to ~/.finance-tracker/.ai_chats.json.
══════════════════════════════════════════ */
let aiChats         = [];   // [{id, title, createdAt, updatedAt}] — sidebar list
let aiActiveChatId  = null;
let aiActiveMessages = [];  // raw Anthropic content-block messages for the open chat
let aiSending        = false;

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}

// Distinct from aiRenderMessages() showing an *open* chat with no messages yet
// ("Ask a question below to get started.") — this is for when no chat is
// selected at all, so the input row is hidden and there's nothing to ask into.
function aiClearActiveChat() {
    aiActiveChatId   = null;
    aiActiveMessages = [];
    const conv = document.getElementById('aiConversation');
    if (conv) conv.innerHTML = '<div class="ai-empty-state">Select a chat, or start a new one, to ask about your spending.</div>';
    const inputRow = document.getElementById('aiInputRow');
    if (inputRow) inputRow.style.display = 'none';
}

async function aiInit() {
    const list = document.getElementById('aiChatList');
    try {
        const res  = await fetch(`${PLAID_SERVER}/api/ai/chats`);
        const data = await res.json();
        aiChats = data.chats || [];
    } catch (e) {
        if (list) list.innerHTML = `<div class="ai-chat-empty">Couldn't reach the server.</div>`;
        return;
    }
    aiRenderChatList();
    // If the previously-open chat got deleted (e.g. from elsewhere), fall back to the empty state.
    if (aiActiveChatId && !aiChats.some(c => c.id === aiActiveChatId)) {
        aiClearActiveChat();
    }
}

function aiRenderChatList() {
    const list = document.getElementById('aiChatList');
    if (!list) return;
    if (aiChats.length === 0) {
        list.innerHTML = '<div class="ai-chat-empty">No chats yet — start one above.</div>';
        return;
    }
    list.innerHTML = aiChats.map(c => `
        <div class="ai-chat-item${c.id === aiActiveChatId ? ' active' : ''}" onclick="aiSwitchChat('${c.id}')">
            <span class="ai-chat-item-title" spellcheck="false" ondblclick="aiStartRename(event, '${c.id}')">${escapeHtml(c.title || 'New Chat')}</span>
            <button class="ai-chat-del-btn" onclick="aiDeleteChat(event, '${c.id}')" title="Delete chat">×</button>
        </div>`).join('');
}

function aiStartRename(event, id) {
    event.stopPropagation(); // don't let the dblclick's bubble also fire the row's switch-chat click
    const span = event.target;
    span.contentEditable = 'true';
    span.focus();
    // Select just the span's own text. document.execCommand('selectAll') was
    // tried here first but selects the whole page, not just this element —
    // the Range/Selection API is the reliable, properly-scoped way to do this.
    const range = document.createRange();
    range.selectNodeContents(span);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    const original = aiChats.find(c => c.id === id)?.title || '';
    const commit = () => {
        span.removeEventListener('blur', commit);
        span.removeEventListener('keydown', onKeydown);
        span.contentEditable = 'false';
        const newTitle = span.textContent.trim();
        if (newTitle && newTitle !== original) aiRenameChat(id, newTitle);
        else aiRenderChatList(); // revert to the stored title if left blank/unchanged
    };
    const onKeydown = (e) => {
        if (e.key === 'Enter')  { e.preventDefault(); span.blur(); }
        if (e.key === 'Escape') { e.preventDefault(); span.textContent = original; span.blur(); }
    };
    span.addEventListener('blur', commit);
    span.addEventListener('keydown', onKeydown);
}

async function aiRenameChat(id, title) {
    try {
        const res  = await fetch(`${PLAID_SERVER}/api/ai/chats/${id}`, {
            method:  'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ title }),
        });
        const data = await res.json();
        const c = aiChats.find(x => x.id === id);
        if (c && data.chat) c.title = data.chat.title;
    } catch (e) {}
    aiRenderChatList();
}

async function aiDeleteChat(event, id) {
    event.stopPropagation(); // don't also trigger the row's switch-chat click
    const chat = aiChats.find(c => c.id === id);
    if (!confirm(`Delete "${chat ? chat.title : 'this chat'}"? This can't be undone.`)) return;
    try { await fetch(`${PLAID_SERVER}/api/ai/chats/${id}`, { method: 'DELETE' }); } catch (e) {}
    aiChats = aiChats.filter(c => c.id !== id);
    if (aiActiveChatId === id) aiClearActiveChat();
    aiRenderChatList();
}

async function aiCreateChat() {
    try {
        const res  = await fetch(`${PLAID_SERVER}/api/ai/chats`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({}),
        });
        const data = await res.json();
        if (!data.chat) throw new Error(data.error || 'Could not create chat');
        aiChats.unshift(data.chat);
        aiRenderChatList();
        await aiSwitchChat(data.chat.id);
        document.getElementById('aiInputBox')?.focus();
    } catch (e) {
        alert('Could not create a new chat: ' + e.message);
    }
}

async function aiSwitchChat(id) {
    if (aiSending) return; // don't abandon an in-flight stream's UI
    aiActiveChatId = id;
    aiRenderChatList();
    const conv = document.getElementById('aiConversation');
    conv.innerHTML = '<div class="ai-typing">Loading…</div>';
    document.getElementById('aiInputRow').style.display = 'none';
    try {
        const res  = await fetch(`${PLAID_SERVER}/api/ai/chats/${id}`);
        const data = await res.json();
        if (!data.chat) throw new Error(data.error || 'Chat not found');
        aiActiveMessages = data.chat.messages || [];
    } catch (e) {
        conv.innerHTML = `<div class="ai-msg ai-msg-error">Couldn't load this chat: ${escapeHtml(e.message)}</div>`;
        return;
    }
    aiRenderMessages();
    document.getElementById('aiInputRow').style.display = '';
}

// Flattens an Anthropic content-block array (or plain string) down to its text.
function aiExtractText(content) {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    return content.filter(b => b && b.type === 'text').map(b => b.text).join('\n\n');
}

function aiToolLabel(name, input) {
    input = input || {};
    if (name === 'get_transactions') {
        const parts = [];
        if (input.category) parts.push(input.category);
        if (input.startDate || input.endDate) parts.push(`${input.startDate || '…'} → ${input.endDate || '…'}`);
        return 'transactions' + (parts.length ? ' (' + parts.join(', ') + ')' : '');
    }
    if (name === 'get_category_totals') {
        return 'category totals' + (input.startDate || input.endDate ? ` (${input.startDate || '…'} → ${input.endDate || '…'})` : '');
    }
    if (name === 'list_subscriptions') return 'subscriptions';
    return name;
}

function aiRenderMessages() {
    const conv = document.getElementById('aiConversation');
    if (!conv) return;
    let html = '';
    aiActiveMessages.forEach(msg => {
        if (msg.role === 'user') {
            // A "user" turn that's actually just tool_result blocks is internal
            // plumbing (the server feeding tool output back), not something the user typed.
            const isToolResultTurn = Array.isArray(msg.content) && msg.content.length > 0 &&
                msg.content.every(b => b && b.type === 'tool_result');
            if (isToolResultTurn) return;
            const text = aiExtractText(msg.content);
            if (text.trim()) html += `<div class="ai-msg ai-msg-user">${escapeHtml(text)}</div>`;
            return;
        }
        if (msg.role === 'assistant') {
            if (Array.isArray(msg.content)) {
                msg.content.filter(b => b && b.type === 'tool_use').forEach(b => {
                    html += `<div class="ai-tool-note">🔎 Checked: ${escapeHtml(aiToolLabel(b.name, b.input))}</div>`;
                });
            }
            const text = aiExtractText(msg.content);
            if (text.trim()) html += `<div class="ai-msg ai-msg-assistant">${escapeHtml(text)}</div>`;
        }
    });
    conv.innerHTML = html || '<div class="ai-empty-state">Ask a question below to get started.</div>';
    conv.scrollTop = conv.scrollHeight;
}

// Same shape ccTransactions/subscriptions already have for Monthly Real —
// reused as-is so categorization logic stays in one place (here), while the
// server's AI tools just filter/aggregate this snapshot instead of Plaid data directly.
function aiBuildSnapshot() {
    return {
        transactions: ccTransactions.map(t => ({
            isoDate: t.isoDate, desc: t.desc, amount: t.amount,
            category: t.category, subCategory: t.subCategory || null, accountName: t.accountName || '',
        })),
        subscriptions: subscriptions.map(s => ({ name: s.name, value: s.value })),
        excludeFromSpend: [...CC_EXCLUDE_FROM_SPEND],
    };
}

function aiHandleInputKeydown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        aiSendMessage();
    }
}

async function aiSendMessage() {
    if (aiSending || !aiActiveChatId) return;
    const box = document.getElementById('aiInputBox');
    const text = box.value.trim();
    if (!text) return;

    aiSending = true;
    box.value = '';
    box.disabled = true;
    const sendBtn    = document.getElementById('aiSendBtn');
    const newChatBtn = document.querySelector('.ai-new-chat-btn');
    sendBtn.disabled = true;
    if (newChatBtn) newChatBtn.disabled = true;

    const conv = document.getElementById('aiConversation');
    const emptyState = conv.querySelector('.ai-empty-state');
    if (emptyState) emptyState.remove();

    const userBubble = document.createElement('div');
    userBubble.className = 'ai-msg ai-msg-user';
    userBubble.textContent = text;
    conv.appendChild(userBubble);

    const typingEl = document.createElement('div');
    typingEl.className = 'ai-typing';
    typingEl.textContent = 'Thinking…';
    conv.appendChild(typingEl);
    conv.scrollTop = conv.scrollHeight;

    let streamBubble = null;
    let streamedText = '';
    let hadError = false;
    const chatId = aiActiveChatId;

    try {
        const res = await fetch(`${PLAID_SERVER}/api/ai/chats/${chatId}/messages`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ message: text, snapshot: aiBuildSnapshot() }),
        });
        if (!res.ok || !res.body) {
            let errMsg = `Request failed (${res.status})`;
            try { const errData = await res.json(); if (errData.error) errMsg = errData.error; } catch (_) {}
            throw new Error(errMsg);
        }

        const reader  = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            let idx;
            while ((idx = buf.indexOf('\n\n')) !== -1) {
                const chunk = buf.slice(0, idx);
                buf = buf.slice(idx + 2);
                const line = chunk.split('\n').find(l => l.startsWith('data: '));
                if (!line) continue;
                let payload;
                try { payload = JSON.parse(line.slice(6)); } catch (_) { continue; }

                if (payload.type === 'title') {
                    const c = aiChats.find(x => x.id === chatId);
                    if (c && c.title !== payload.title) { c.title = payload.title; aiRenderChatList(); }
                } else if (payload.type === 'tool_use') {
                    if (typingEl.isConnected) typingEl.textContent = 'Checking ' + aiToolLabel(payload.name, payload.input) + '…';
                } else if (payload.type === 'text') {
                    if (typingEl.isConnected) typingEl.remove();
                    if (!streamBubble) {
                        streamBubble = document.createElement('div');
                        streamBubble.className = 'ai-msg ai-msg-assistant';
                        conv.appendChild(streamBubble);
                    }
                    streamedText += payload.text;
                    streamBubble.textContent = streamedText;
                    conv.scrollTop = conv.scrollHeight;
                } else if (payload.type === 'error') {
                    hadError = true;
                    if (typingEl.isConnected) typingEl.remove();
                    const errBubble = document.createElement('div');
                    errBubble.className = 'ai-msg ai-msg-error';
                    errBubble.textContent = payload.message || 'Something went wrong.';
                    conv.appendChild(errBubble);
                    conv.scrollTop = conv.scrollHeight;
                }
                // 'done' needs no handling here — the chat is re-fetched below regardless.
            }
        }
    } catch (err) {
        hadError = true;
        if (typingEl.isConnected) typingEl.remove();
        const errBubble = document.createElement('div');
        errBubble.className = 'ai-msg ai-msg-error';
        errBubble.textContent = err.message || 'Something went wrong.';
        conv.appendChild(errBubble);
    }

    aiSending = false;
    box.disabled = false;
    sendBtn.disabled = false;
    if (newChatBtn) newChatBtn.disabled = false;

    if (hadError) {
        // Nothing was persisted server-side on failure (see server.js — every
        // error path returns before touching chat.messages), so re-fetching
        // would just wipe the error/user bubbles above with an empty history.
        // Restore the text instead so the user can retry without retyping.
        box.value = text;
        box.focus();
        return;
    }
    box.focus();

    // Re-fetch the canonical persisted chat rather than reconstructing the
    // exact content-block structure (tool_use turns, etc.) client-side.
    if (aiActiveChatId === chatId) {
        try {
            const res  = await fetch(`${PLAID_SERVER}/api/ai/chats/${chatId}`);
            const data = await res.json();
            if (data.chat) {
                aiActiveMessages = data.chat.messages || [];
                aiRenderMessages();
            }
        } catch (_) {}
        const c = aiChats.find(x => x.id === chatId);
        if (c) { c.updatedAt = new Date().toISOString(); aiRenderChatList(); }
    }
}

/* ══════════════════════════════════════════
   App Settings
══════════════════════════════════════════ */
async function appSettingsInit() {
    try {
        const res  = await fetch(`${PLAID_SERVER}/api/app/version`);
        const data = await res.json();
        document.getElementById('appVersion').textContent = data.version ? 'v' + data.version : '—';
    } catch (e) {
        document.getElementById('appVersion').textContent = '—';
    }

    try {
        const res  = await fetch(`${PLAID_SERVER}/api/app/changelog`);
        const data = await res.json();
        appRenderChangelog(data.entries || []);
    } catch (e) {
        document.getElementById('appChangelog').innerHTML = '<p class="as-empty">Couldn\'t load the changelog.</p>';
    }

    // Reset any stale update-check result from a previous visit to this tab.
    appResetUpdateUI();

    await appRefreshAnthropicStatus();
    await appRefreshGithubStatus();
}

function appResetUpdateUI() {
    const status = document.getElementById('appUpdateStatus');
    status.textContent = '';
    status.className = 'as-status-text';
    document.getElementById('appUpdateBtn').disabled = false;
    document.getElementById('appUpdateDownloadBtn').style.display = 'none';
    document.getElementById('appUpdateRestartBtn').style.display = 'none';
    document.getElementById('appUpdateProgressWrap').style.display = 'none';
    document.getElementById('appUpdateProgressBar').style.width = '0%';
}

function appRenderChangelog(entries) {
    const el = document.getElementById('appChangelog');
    if (!entries.length) { el.innerHTML = '<p class="as-empty">No changelog available.</p>'; return; }
    el.innerHTML = entries.map(e => `
        <div class="as-changelog-entry">
            <div class="as-changelog-heading">
                <span class="as-changelog-version">${escapeHtml(e.version)}</span>
                <span class="as-changelog-date">${escapeHtml(e.date)}</span>
            </div>
            <ul class="as-changelog-items">${e.items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
        </div>`).join('');
}

// Desktop app builds (Electron) expose window.electronUpdater via preload.js
// and can download + install a release in place through electron-updater.
// A plain browser tab (`npm run server`, no Electron) has no installer to run,
// so it falls back to the old behavior: check GitHub and link to the release.
function appInElectron() {
    return typeof window.electronUpdater !== 'undefined';
}

async function appCheckForUpdates() {
    const btn    = document.getElementById('appUpdateBtn');
    const status = document.getElementById('appUpdateStatus');
    appResetUpdateUI();
    btn.disabled = true;
    status.className = 'as-status-text';
    status.textContent = 'Checking…';

    if (appInElectron()) {
        // Result arrives asynchronously via the 'available'/'not-available'/
        // 'error' events — appHandleUpdaterEvent (wired once at page load)
        // takes it from there.
        const result = await window.electronUpdater.checkForUpdates();
        if (!result.ok) {
            status.className = 'as-status-text as-err';
            status.textContent = result.error || 'Update check failed';
            btn.disabled = false;
        }
        return;
    }

    try {
        const res  = await fetch(`${PLAID_SERVER}/api/app/update-check`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Update check failed');
        if (data.updateAvailable) {
            status.className = 'as-status-text as-warn';
            status.innerHTML = `New version available: <strong>${escapeHtml(data.latestVersion)}</strong>` +
                (data.releaseUrl ? ` — <a href="${escapeHtml(data.releaseUrl)}" target="_blank" rel="noopener">View Release</a>` : '');
        } else {
            status.className = 'as-status-text as-ok';
            status.textContent = `You're up to date (v${data.currentVersion}).`;
        }
    } catch (e) {
        status.className = 'as-status-text as-err';
        status.textContent = e.message;
    }
    btn.disabled = false;
}

async function appDownloadUpdate() {
    const downloadBtn = document.getElementById('appUpdateDownloadBtn');
    const status       = document.getElementById('appUpdateStatus');
    downloadBtn.disabled = true;
    document.getElementById('appUpdateProgressWrap').style.display = '';
    status.className = 'as-status-text';
    status.textContent = 'Downloading…';
    const result = await window.electronUpdater.downloadUpdate();
    if (!result.ok) {
        status.className = 'as-status-text as-err';
        status.textContent = result.error || 'Download failed';
        downloadBtn.disabled = false;
    }
}

function appInstallUpdate() {
    window.electronUpdater.quitAndInstall();
}

// Subscribes once (at page load) to the update lifecycle events relayed from
// main.js. Safe to receive events while the App Settings tab isn't open —
// they just update elements that happen to be hidden until you switch to it.
function appWireUpdaterEvents() {
    if (!appInElectron()) return;
    window.electronUpdater.onEvent(appHandleUpdaterEvent);
}

function appHandleUpdaterEvent(payload) {
    const btn          = document.getElementById('appUpdateBtn');
    const downloadBtn  = document.getElementById('appUpdateDownloadBtn');
    const restartBtn   = document.getElementById('appUpdateRestartBtn');
    const status       = document.getElementById('appUpdateStatus');
    const progressWrap = document.getElementById('appUpdateProgressWrap');
    const progressBar  = document.getElementById('appUpdateProgressBar');

    switch (payload.type) {
        case 'checking':
            status.className = 'as-status-text';
            status.textContent = 'Checking…';
            break;
        case 'available':
            btn.disabled = false;
            status.className = 'as-status-text as-warn';
            status.textContent = `New version available: v${payload.version}`;
            downloadBtn.style.display = '';
            downloadBtn.disabled = false;
            break;
        case 'not-available':
            btn.disabled = false;
            status.className = 'as-status-text as-ok';
            status.textContent = `You're up to date (v${payload.version}).`;
            break;
        case 'progress':
            progressWrap.style.display = '';
            progressBar.style.width = `${Math.round(payload.percent)}%`;
            status.className = 'as-status-text';
            status.textContent = `Downloading… ${Math.round(payload.percent)}%`;
            break;
        case 'downloaded':
            progressWrap.style.display = 'none';
            downloadBtn.style.display = 'none';
            restartBtn.style.display = '';
            status.className = 'as-status-text as-ok';
            status.textContent = `v${payload.version} downloaded — restart to install.`;
            break;
        case 'error':
            btn.disabled = false;
            downloadBtn.disabled = false;
            status.className = 'as-status-text as-err';
            status.textContent = payload.message || 'Update error';
            break;
    }
}

async function appLoadSidebarVersion() {
    try {
        const res  = await fetch(`${PLAID_SERVER}/api/app/version`);
        const data = await res.json();
        document.getElementById('sidebarVersion').textContent = data.version ? 'v' + data.version : '';
    } catch (e) {
        document.getElementById('sidebarVersion').textContent = '';
    }
}

// ── Claude API key ───────────────────────────────────────────────────────────
async function appRefreshAnthropicStatus() {
    const statusEl = document.getElementById('appAnthropicStatus');
    const clearBtn = document.getElementById('appAnthropicClearBtn');
    try {
        const res  = await fetch(`${PLAID_SERVER}/api/app/anthropic-key-status`);
        const data = await res.json();
        if (data.configured) {
            statusEl.textContent = 'Key configured';
            statusEl.className = 'as-status-text as-ok';
            clearBtn.style.display = '';
        } else {
            statusEl.textContent = 'No key set';
            statusEl.className = 'as-status-text as-warn';
            clearBtn.style.display = 'none';
        }
    } catch (e) {
        statusEl.textContent = 'Unknown';
        statusEl.className = 'as-status-text';
    }
}

async function appSaveAnthropicKey() {
    const input = document.getElementById('appAnthropicKeyInput');
    const msg   = document.getElementById('appAnthropicMsg');
    const key   = input.value.trim();
    if (!key) return;
    msg.textContent = 'Validating…';
    msg.className = 'as-msg';
    try {
        const res  = await fetch(`${PLAID_SERVER}/api/app/anthropic-key`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ apiKey: key }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not save key');
        input.value = ''; // never leave the secret sitting in the field once saved
        msg.textContent = 'Saved.';
        msg.className = 'as-msg as-ok';
        await appRefreshAnthropicStatus();
    } catch (e) {
        msg.textContent = e.message;
        msg.className = 'as-msg as-err';
    }
}

async function appClearAnthropicKey() {
    if (!confirm('Remove the saved Claude API key? AI Analyze will stop working until you add a new one.')) return;
    try { await fetch(`${PLAID_SERVER}/api/app/anthropic-key`, { method: 'DELETE' }); } catch (e) {}
    await appRefreshAnthropicStatus();
    document.getElementById('appAnthropicMsg').textContent = '';
}

// ── GitHub token ──────────────────────────────────────────────────────────────
async function appRefreshGithubStatus() {
    const statusEl = document.getElementById('appGithubStatus');
    const clearBtn = document.getElementById('appGithubClearBtn');
    try {
        const res  = await fetch(`${PLAID_SERVER}/api/app/github-token-status`);
        const data = await res.json();
        if (data.configured) {
            statusEl.textContent = 'Token configured';
            statusEl.className = 'as-status-text as-ok';
            clearBtn.style.display = '';
        } else {
            statusEl.textContent = 'Not set';
            statusEl.className = 'as-status-text';
            clearBtn.style.display = 'none';
        }
    } catch (e) {
        statusEl.textContent = 'Unknown';
        statusEl.className = 'as-status-text';
    }
}

async function appSaveGithubToken() {
    const input = document.getElementById('appGithubKeyInput');
    const msg   = document.getElementById('appGithubMsg');
    const token = input.value.trim();
    if (!token) return;
    msg.textContent = 'Validating…';
    msg.className = 'as-msg';
    try {
        const res  = await fetch(`${PLAID_SERVER}/api/app/github-token`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ token }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not save token');
        input.value = '';
        msg.textContent = 'Saved.';
        msg.className = 'as-msg as-ok';
        await appRefreshGithubStatus();
    } catch (e) {
        msg.textContent = e.message;
        msg.className = 'as-msg as-err';
    }
}

async function appClearGithubToken() {
    if (!confirm('Remove the saved GitHub token? Update checks will stop working until you add a new one.')) return;
    try { await fetch(`${PLAID_SERVER}/api/app/github-token`, { method: 'DELETE' }); } catch (e) {}
    await appRefreshGithubStatus();
    document.getElementById('appGithubMsg').textContent = '';
}

/* ══════════════════════════════════════════
   Init
══════════════════════════════════════════ */
loadFromStorage();
loadIncomeDocsFromServer();
loadSettingsFromServer();
appLoadSidebarVersion();
appWireUpdaterEvents();
