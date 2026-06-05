/* ══════════════════════════════════════════
   Tab switching
══════════════════════════════════════════ */
function showTab(id, el) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.sheet').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    el.classList.add('active');
    if (id === 'subscription') renderDetectedSubscriptions();
}

function detectSubscriptions() {
    if (ccTransactions.length === 0) return [];
    // Group transactions by simplified merchant name
    const groups = {};
    ccTransactions.filter(t => t.amount < 0 && !CC_EXCLUDE_FROM_SPEND.has(t.category))
        .forEach(t => {
            const key = t.desc.toLowerCase()
                .replace(/[^a-z0-9 ]/g, ' ')
                .split(/\s+/).slice(0, 3).join(' ')
                .trim();
            if (!groups[key]) groups[key] = [];
            groups[key].push(t);
        });

    const detected = [];
    Object.entries(groups).forEach(([key, txns]) => {
        if (txns.length < 2) return;
        txns.sort((a, b) => a.isoDate.localeCompare(b.isoDate));
        // Check if amounts are consistent (within 5%)
        const amounts = txns.map(t => -t.amount);
        const avgAmt  = amounts.reduce((s, a) => s + a, 0) / amounts.length;
        const allClose = amounts.every(a => Math.abs(a - avgAmt) / avgAmt < 0.05);
        if (!allClose) return;
        // Check if spacing is roughly monthly (25–40 days) or weekly (6–8 days)
        const gaps = [];
        for (let i = 1; i < txns.length; i++) {
            const days = (new Date(txns[i].isoDate) - new Date(txns[i-1].isoDate)) / 86400000;
            gaps.push(days);
        }
        const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
        const isMonthly = avgGap >= 25 && avgGap <= 40;
        const isWeekly  = avgGap >= 6  && avgGap <= 8;
        if (!isMonthly && !isWeekly) return;
        detected.push({
            name:      txns[txns.length - 1].desc,  // use most recent full name
            amount:    Math.round(avgAmt * 100) / 100,
            frequency: isMonthly ? 'monthly' : 'weekly',
            lastSeen:  txns[txns.length - 1].isoDate,
            count:     txns.length,
        });
    });
    return detected.sort((a, b) => b.amount - a.amount);
}

function renderDetectedSubscriptions() {
    const detected = detectSubscriptions();
    const el = document.getElementById('detectedSubsList');
    if (!el) return;
    if (detected.length === 0) {
        el.innerHTML = '<p class="sub-empty">No recurring charges detected yet (need 2+ months of data).</p>';
        return;
    }
    el.innerHTML = detected.map(s => `
        <div class="box-row" style="padding:3px 0; border-bottom:1px solid #f0f0f0;">
            <label style="flex:1;">${s.name}</label>
            <span style="color:#888; font-size:11px; margin-right:12px;">${s.frequency} · seen ${s.count}×</span>
            <span style="font-weight:bold;">$${fmt(s.amount, 2)}</span>
        </div>`).join('');
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
     ['Travel', 0], ['Utilities', 0], ['Entertainment', 0], ['Other', 0]]
    .forEach(([n, v]) => expenses.push({ id: ++expId, name: n, value: v }));
    renderExpenses();
}

function addExpense() {
    const newId = ++expId;
    expenses.push({ id: newId, name: '', value: 0 });
    _expensesDirty = true;
    renderExpenses();
    saveToStorage();
    renderExpenseSaveBtn();
    // Scroll to and focus the new row's name input
    const newInput = document.getElementById('edit-exp-name-' + newId);
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
    // Sync the other input (edit tab ↔ Monthly Ideal)
    const editEl  = document.getElementById('edit-exp-'  + id);
    const idealEl = document.getElementById('ideal-exp-' + id);
    if (editEl  && editEl  !== document.activeElement) editEl.value  = val;
    if (idealEl && idealEl !== document.activeElement) idealEl.value = val;
    calculate();
    saveToStorage(); // explicit save in addition to the one inside calculate()
}

function renderExpenses() {
    const editList = document.getElementById('editExpenseList');
    if (editList) editList.innerHTML = expenses.map(e => `
        <div class="edit-row" id="exp-row-${e.id}">
            <input type="text" class="name-input" id="edit-exp-name-${e.id}"
                   value="${e.name.replace(/"/g,'&quot;')}"
                   oninput="setExpenseName(${e.id}, this.value)"
                   placeholder="Expense name">
            <button class="del-btn" onclick="deleteExpense(${e.id})">×</button>
        </div>
    `).join('');

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
    const area = document.getElementById('expenseSaveBtnArea');
    if (!area) return;
    if (_expensesDirty) {
        area.innerHTML = `<button class="save-cats-btn" onclick="saveExpenseCategories()">💾 Save Categories</button>`;
    } else {
        area.innerHTML = `<span class="save-cats-ok" style="display:none"></span>`;
    }
}

function saveExpenseCategories() {
    // Ensure every user-defined expense name has an entry in categoryKeywords
    // so it appears in the classify dropdown and the keywords editor.
    const builtIn = new Set(CC_CATEGORY_NAMES);
    expenses.forEach(e => {
        if (e.name && !builtIn.has(e.name)) {
            if (!categoryKeywords[e.name]) categoryKeywords[e.name] = [];
        }
    });
    // Remove stale user keys that no longer match any expense and have no keywords
    const currentUserNames = new Set(expenses.map(e => e.name).filter(n => n));
    Object.keys(categoryKeywords).forEach(cat => {
        if (!builtIn.has(cat) && !currentUserNames.has(cat) && categoryKeywords[cat].length === 0) {
            delete categoryKeywords[cat];
        }
    });
    saveToStorage();
    renderCustomKeywords();
    if (typeof ccTransactions !== 'undefined' && ccTransactions.length > 0) reCategorizeAll();
    _expensesDirty = false;
    const area = document.getElementById('expenseSaveBtnArea');
    if (area) {
        area.innerHTML = `<span style="color:#27ae60;font-size:12px;font-weight:600;">✓ Saved</span>`;
        setTimeout(() => { area.innerHTML = ''; }, 2000);
    }
}

/* ══════════════════════════════════════════
   Subscriptions
══════════════════════════════════════════ */
let subId = 0;
let subscriptions = [];

function initSubscriptions() {
    renderSubscriptions();
}

function addSubscription() {
    subscriptions.push({ id: ++subId, name: '', value: 0 });
    renderSubscriptions();
    calculate();
}

function deleteSubscription(id) {
    subscriptions = subscriptions.filter(s => s.id !== id);
    renderSubscriptions();
    calculate();
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
    const total = subscriptions.reduce((s, sub) => s + sub.value, 0);

    // Edit tab — name + amount input + delete
    document.getElementById('editSubList').innerHTML = subscriptions.length === 0
        ? '<p class="sub-empty">No subscriptions yet.</p>'
        : subscriptions.map(s => `
            <div class="edit-row">
                <input type="text" class="name-input" value="${s.name}"
                       oninput="setSubName(${s.id}, this.value)" placeholder="Service name">
                <span class="money-wrap">$<input class="val-input" type="number" value="${s.value}"
                      oninput="setSubValue(${s.id}, this.value)"></span>
                <button class="del-btn" onclick="deleteSubscription(${s.id})">×</button>
            </div>
        `).join('');

    // Subscription_List tab — read-only display
    document.getElementById('subListDisplay').innerHTML = subscriptions.length === 0
        ? '<p class="sub-empty">No subscriptions yet. Add them in the Edit tab.</p>'
        : subscriptions.map(s => `
            <div class="box-row">
                <label id="sub-lbl-${s.id}">${s.name || '(unnamed)'}</label>
                <span>$<span id="sub-amt-${s.id}">${fmt(s.value, 2)}</span></span>
            </div>
        `).join('') + `
            <div class="box-row total-row">
                <label>Total</label>
                <span>$<span id="subListTotal">${fmt(total, 2)}</span></span>
            </div>`;

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

    // ── Tithing ──
    const cPct = getVal('titheChurchPct') / 100;
    const tPct = getVal('titheTCBCPct')   / 100;
    const iPct = getVal('titheIVPct')      / 100;
    const kPct = getVal('titheKccPct')     / 100;
    const totalTithePct = (cPct + tPct + iPct + kPct) * 100;

    setEl('churchPctDisp',     getVal('titheChurchPct'));
    setEl('tcbcPctDisp',       getVal('titheTCBCPct'));
    setEl('ivPctDisp',         getVal('titheIVPct'));
    setEl('kccPctDisp',        getVal('titheKccPct'));
    setEl('titheTotalPctDisp', fmt(totalTithePct, 1));
    setEl('titheChurch',       fmt(preTaxMonthly * cPct, 2));
    setEl('titheTCBC',         fmt(preTaxMonthly * tPct, 2));
    setEl('titheIV',           fmt(preTaxMonthly * iPct, 2));
    setEl('titheKcc',          fmt(preTaxMonthly * kPct, 2));
    setEl('titheTotal',        fmt(preTaxMonthly * (cPct + tPct + iPct + kPct), 2));

    // ── Monthly Expenses total (regular + subscriptions) ──
    const regTotal = expenses.reduce((s, e) => s + e.value, 0);
    const subTotal = subscriptions.reduce((s, sub) => s + sub.value, 0);

    setEl('subTotalDisplay', fmt(subTotal, 2));
    setEl('expTotal',        fmt(regTotal + subTotal, 2));

    // Keep Subscription_List tab total in sync
    const subListTotalEl = document.getElementById('subListTotal');
    if (subListTotalEl) subListTotalEl.innerText = fmt(subTotal, 2);

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
    'Subscriptions', 'Health', 'Travel', 'Utilities', 'Entertainment',
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
    // Plaid classifies credit card returns as TRANSFER_IN — treat them as refunds
    if (t.plaidCategory === 'TRANSFER_IN' && t.accountType === 'credit') return true;
    const d = (t.desc || '').toLowerCase();
    if (REFUND_KEYWORDS.some(kw => d.includes(kw))) return true;
    return SPENDING_CATS.has(t.category);
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

function mergeTxnSources() {
    // Build a lookup: "YYYY-MM-DD|cents" → [csvTxn, ...]
    // cents = Math.round(amount * 100) so floating-point rounding doesn't matter
    const csvIndex = new Map();
    csvTransactions.forEach(t => {
        const key = `${t.isoDate}|${Math.round(t.amount * 100)}`;
        if (!csvIndex.has(key)) csvIndex.set(key, []);
        csvIndex.get(key).push(t);
    });

    // Keep only Plaid transactions not already in the CSV
    const uniquePlaid = plaidTransactions.filter(pt => {
        const key     = `${pt.isoDate}|${Math.round(pt.amount * 100)}`;
        const bucket  = csvIndex.get(key) || [];
        return !isDuplicate(pt, bucket);
    });

    // plaidCoverStart = earliest date of a Plaid-unique transaction
    plaidCoverStart = uniquePlaid.length
        ? uniquePlaid.reduce((m, t) => (!m || t.isoDate < m ? t.isoDate : m), null)
        : null;

    // Merge CSV (full history) + deduplicated Plaid, sort newest-first
    ccTransactions = [...csvTransactions, ...uniquePlaid]
        .sort((a, b) => b.isoDate.localeCompare(a.isoDate));
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
    // Refunds reduce monthly spending totals (t.amount > 0 so -t.amount is negative)
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
    // ccTransactions is already sorted newest-first from mergeTxnSources
    const recent = ccTransactions.slice(0, 20);
    if (countEl) countEl.textContent = `showing ${recent.length} of ${ccTransactions.length}`;

    el.innerHTML = recent.map(t => {
        const isCredit = t.amount > 0;
        const amt = Math.abs(t.amount);
        const amtStr = (isCredit ? '+' : '−') + '$' + fmt(amt, 2);
        const amtColor = isCredit ? '#27ae60' : '#c0392b';
        const catColor = CATEGORY_COLORS[t.category] || '#888';
        const acct = t.accountName ? `<span style="color:#aaa;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100px;">${t.accountName}</span>` : '';
        return `<div style="display:flex;align-items:center;gap:10px;padding:7px 14px;border-bottom:1px solid #f3f3f3;font-size:13px;">
            <span style="color:#999;font-size:11px;white-space:nowrap;min-width:74px;">${t.isoDate}</span>
            <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${t.desc}">${t.desc}</span>
            ${acct}
            <span style="font-size:11px;background:${catColor}18;color:${catColor};border-radius:3px;padding:1px 5px;white-space:nowrap;">${t.category}</span>
            <span style="font-weight:700;color:${amtColor};white-space:nowrap;min-width:68px;text-align:right;">${amtStr}</span>
        </div>`;
    }).join('');
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
        const { cat, sub } = ccCategorizeFull(desc);
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
        const { cat, sub } = ccCategorizeFull(t.desc);
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

function renderTxnRow(t, catName, classifyOpts) {
    const dateLabel = t.isoDate
        ? t.isoDate.slice(5,7) + '/' + t.isoDate.slice(8,10) + '/' + t.isoDate.slice(2,4)
        : t.date;
    const mkey     = merchantKey(t.desc);
    const isRefund = t.amount > 0;
    const amtLabel = isRefund ? `+$${fmt(t.amount, 2)}` : `$${fmt(-t.amount, 2)}`;
    const amtClass = isRefund ? 'cat-detail-amt refund-amt' : 'cat-detail-amt';
    const safeDesc = t.desc.replace(/&/g,'&amp;').replace(/"/g,'&quot;');
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
        ? `<span class="acct-txn-badge" style="background:${acctColor};" title="${t.accountName}">${t.accountName.split(' ').map(w=>w[0]).join('').slice(0,3).toUpperCase()}</span>`
        : (t.source === 'plaid' ? '<span class="plaid-badge">🔵</span>' : '');
    const sourceBadge = acctBadge;
    return `<div class="cat-detail-row${sourceClass}" data-mkey="${mkey}" data-desc="${safeDesc}" onclick="highlightMerchant(this.dataset.mkey)">
        <span class="cat-detail-date">${dateLabel}</span>
        <div class="cat-desc-group">
            ${sourceBadge}<span class="cat-detail-desc" title="${t.desc}">${t.desc}</span>
            ${classify}
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

function buildCatChart(charges, chartId) {
    const total   = charges.reduce((s, t) => s - t.amount, 0);
    const cats    = {};
    const catTxns = {};
    charges.forEach(t => {
        cats[t.category]    = (cats[t.category]    || 0) - t.amount;
        catTxns[t.category] = catTxns[t.category]  || [];
        catTxns[t.category].push(t);
    });
    const sorted  = _catSortMode === 'alpha'
        ? Object.entries(cats).sort(([a], [b]) => a.localeCompare(b))
        : Object.entries(cats).sort(([,a], [,b]) => b - a);
    const maxAmt  = Math.max(...sorted.map(([,a]) => a), 1);
    const ticks   = niceAxisTicks(maxAmt);
    const axisMax = ticks[ticks.length - 1] || maxAmt;

    // Build classify dropdown options (built-in categories + sub-categories + user expense categories)
    const _allClassifyCats = [
        ...CC_CATEGORY_NAMES.filter(n => n !== 'Other'),
        ...getUserExpenseCategories(),
    ];
    const classifyOpts = _allClassifyCats.map(cat => {
        const subs = subCategories[cat] || [];
        if (subs.length === 0) return `<option value="${cat}">${cat}</option>`;
        return `<optgroup label="${cat}">
            <option value="${cat}">${cat} (general)</option>
            ${subs.map(s => `<option value="${cat}::${s}">${cat} → ${s}</option>`).join('')}
        </optgroup>`;
    }).join('');

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
    csvTransactions.forEach(t => { const { cat, sub } = ccCategorizeFull(t.desc); t.category = cat; t.subCategory = sub; });
    plaidTransactions.forEach(t => { const { cat, sub } = ccCategorizeFull(t.desc); t.category = cat; t.subCategory = sub; });
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
}

/* ══════════════════════════════════════════
   Persistence — localStorage
══════════════════════════════════════════ */
const PERSIST_INPUTS = ['base','refresher','rsu','bonusPct',
    'titheChurchPct','titheTCBCPct','titheIVPct','titheKccPct'];
const PERSIST_CHECKS  = ['chkFed','chkState','chkSS','chkMed','chkSDI'];
const PERSIST_SELECTS = ['filingStatus'];

let _loadingFromStorage = false;

function saveToStorage() {
    if (_loadingFromStorage) return;
    try {
        localStorage.setItem('fc_expenses',    JSON.stringify(expenses));
        localStorage.setItem('fc_subs',        JSON.stringify(subscriptions));
        localStorage.setItem('fc_keywords',    JSON.stringify(categoryKeywords));
        localStorage.setItem('fc_subCats',     JSON.stringify(subCategories));
        localStorage.setItem('fc_subCatKws',   JSON.stringify(subCatKeywords));
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
}

function loadFromStorage() {
    _loadingFromStorage = true;

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
            CC_CATEGORY_NAMES.forEach(n => { if (!categoryKeywords[n]) categoryKeywords[n] = []; });
        } else {
            CC_CATEGORY_NAMES.forEach(n => categoryKeywords[n] = []);
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
        CC_CATEGORY_NAMES.forEach(n => { if (!subCategories[n]) subCategories[n] = []; });
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

    _loadingFromStorage = false;
    calculate();

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
                groupRow = `<tr class="raw-alpha-group"><td colspan="5">${letter}</td></tr>`;
            }
            const baseCls = rowIdx++ % 2 === 0 ? 'csv-month-a' : 'csv-month-b';
            const amt      = t.amount < 0
                ? `-$${fmt(-t.amount, 2)}`
                : `<span style="color:#2a7a2a">+$${fmt(t.amount, 2)}</span>`;
            const srcLabel = t.source === 'plaid'
                ? '<span style="color:#1a6fa8; font-weight:bold;">🔵 Plaid</span>'
                : '<span style="color:#888;">📄 CSV</span>';
            return groupRow + `<tr class="${baseCls}">
                <td>${t.isoDate || t.date}</td>
                <td>${t.desc}</td>
                <td style="text-align:right; white-space:nowrap;">${amt}</td>
                <td>${srcLabel}</td>
                <td class="csv-cat-cell">${t.category || ''}</td>
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
                <td>${t.isoDate || t.date}</td>
                <td>${t.desc}</td>
                <td style="text-align:right; white-space:nowrap;">${amt}</td>
                <td>${srcLabel}</td>
                <td class="csv-cat-cell">${t.category || ''}</td>
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
        mergeTxnSources();
        rebuildCCAnalyticsUI();

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
    mergeTxnSources();
    document.getElementById('csvFileInput').value = '';
    document.getElementById('csvAccountLabel').value = '';
    document.getElementById('csvStatus').textContent = '';
    document.getElementById('csvHead').innerHTML = '';
    document.getElementById('csvBody').innerHTML = '';
    document.getElementById('csvTable').style.display = 'none';
    document.getElementById('csvEmpty').style.display = '';
    document.getElementById('ccAnalytics').style.display = 'none';
    if (ccSelectedMonthEl) { ccSelectedMonthEl.classList.remove('month-row-active'); ccSelectedMonthEl = null; }
    ccTransactions = [];
    csvUploadMeta  = [];
    updateLoadedAccountsList();
}

/* ══════════════════════════════════════════
   Custom category keywords — per-category columns
══════════════════════════════════════════ */
const CC_CATEGORY_NAMES = [
    'Groceries','Dining Out','Gas & Auto','Shopping','Subscriptions',
    'Health','Travel','Utilities','Entertainment','Transfers','Other'
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

function renderCustomKeywords() {
    const container = document.getElementById('editCustomKeywords');
    if (!container) return;
    const allCategoryNames = [...CC_CATEGORY_NAMES, ...getUserExpenseCategories()];
    container.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:flex-start;">
        ${allCategoryNames.map(cat => {
            const safe = cat.replace(/[^a-zA-Z0-9]/g, '_');
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
            return `<div class="kw-col">
                <div class="kw-col-title">${cat}</div>
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
    mergeTxnSources();
    if (ccTransactions.length > 0) {
        rebuildCCAnalyticsUI();
    } else {
        const el = document.getElementById('ccAnalytics');
        if (el) el.style.display = 'none';
    }
    updateLoadedAccountsList();
}

// Save current csvTransactions + metadata to localStorage for fast restore on next page load
function saveCsvTransactionsLocal() {
    try {
        localStorage.setItem('fc_csvTxns',  JSON.stringify(csvTransactions));
        localStorage.setItem('fc_csvMeta',  JSON.stringify(csvUploadMeta));
    } catch(e) {}
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
        mergeTxnSources();

        // Rebuild the full CC UI if analytics section is visible
        rebuildCCAnalyticsUI();

        // Populate localStorage for fast next-load (store parsed transactions)
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

let _plaidLinked = false;

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
    const btn = document.getElementById('plaidToggleBtn');
    if (linked) {
        btn.textContent = '⏹ Unsync Bank';
        btn.style.color = '#b00';
    } else {
        btn.textContent = 'Connect Bank';
        btn.style.color = '';
    }
}

// Single toggle: connect if unlinked, unlink if linked
async function plaidToggle() {
    if (_plaidLinked) {
        await plaidUnlink();
    } else {
        await plaidConnect();
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

function showPlaidAccounts(accounts, institution) {
    const box  = document.getElementById('plaidAccountsInBox');
    const list = document.getElementById('plaidAccountsList');
    if (!box || !list) return;
    if (!accounts || accounts.length === 0) { box.style.display = 'none'; return; }
    box.style.display = '';

    // Institution header (e.g. "Wells Fargo")
    const instEl = document.getElementById('plaidInstitutionName');
    if (instEl) instEl.textContent = institution || 'Live Accounts';

    const TYPE_ICON = { credit: '💳', checking: '🏦', savings: '🏦', depository: '🏦' };
    list.innerHTML = accounts.map(a => {
        const color    = getAccountColor(a.name);
        const icon     = TYPE_ICON[a.subtype] || TYPE_ICON[a.type] || '🏦';
        const sub      = a.subtype || a.type || '';
        const maskStr  = a.mask ? `····${a.mask}` : '';
        const balStr   = a.balance != null ? `$${fmt(a.balance, 2)}` : '';
        const availStr = (a.available != null && a.available !== a.balance)
            ? ` <span style="color:#888;">(avail $${fmt(a.available,2)})</span>` : '';
        return `<div class="acct-badge" style="border-left: 4px solid ${color}; display:flex; align-items:center; gap:8px; justify-content:space-between;">
            <span style="display:flex; align-items:center; gap:6px;">
                <span style="font-size:15px;">${icon}</span>
                <strong style="font-size:13px;">${a.name || '—'}</strong>
                <span style="color:#aaa; font-size:11px;">${sub ? `(${sub})` : ''} ${maskStr}</span>
            </span>
            <span style="font-size:12px; font-weight:600; color:#1a3a6e; white-space:nowrap;">${balStr}${availStr}</span>
        </div>`;
    }).join('');
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
            const { cat, sub } = ccCategorizeFull(t.description);
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
        saveToStorage();

        // Fetch account details (with balances + institution name) separately — more reliable than inline summary
        try {
            const acctRes  = await fetch(`${PLAID_SERVER}/api/accounts`);
            const acctData = await acctRes.json();
            if (acctData.accounts && acctData.accounts.length > 0) {
                showPlaidAccounts(acctData.accounts, acctData.institution);
            }
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

async function plaidUnlink() {
    if (!confirm('Disconnect Wells Fargo? Live sync will stop (CSV data stays).')) return;
    await fetch(`${PLAID_SERVER}/api/unlink`, { method: 'POST' });
    // Clear Plaid transactions from memory and storage
    plaidTransactions = [];
    plaidCoverStart   = null;
    localStorage.removeItem('fc_plaidTxns');
    mergeTxnSources();  // ccTransactions reverts to CSV-only
    setPlaidUI(false);
    document.getElementById('plaidStatus').textContent = 'Bank disconnected';
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
   Init
══════════════════════════════════════════ */
loadFromStorage();
