/* ══════════════════════════════════════════
   Monthly Expenses
══════════════════════════════════════════ */
let expId = 0;
let expenses = [];

function initExpenses() {
    [['Rent', 0], ['Car Lease', 0], ['Groceries', 0],
     ['Dine-out', 0], ['Miscellaneous', 0], ['Presents', 0]]
    .forEach(([n, v]) => expenses.push({ id: ++expId, name: n, value: v }));
    renderExpenses();
}

function addExpense() {
    expenses.push({ id: ++expId, name: '', value: 0 });
    renderExpenses();
    calculate();
}

function deleteExpense(id) {
    expenses = expenses.filter(e => e.id !== id);
    renderExpenses();
    calculate();
}

function setExpenseName(id, name) {
    const exp = expenses.find(e => e.id === id);
    if (exp) exp.name = name;
    const lbl = document.getElementById('exp-lbl-' + id);
    if (lbl) lbl.textContent = name || '(unnamed)';
    saveToStorage();
}

function setExpenseValue(id, val) {
    const exp = expenses.find(e => e.id === id);
    if (exp) exp.value = parseFloat(val) || 0;
    const editEl  = document.getElementById('edit-exp-'  + id);
    const idealEl = document.getElementById('ideal-exp-' + id);
    if (editEl  && editEl  !== document.activeElement) editEl.value  = val;
    if (idealEl && idealEl !== document.activeElement) idealEl.value = val;
    calculate();
}

function renderExpenses() {
    const editList = document.getElementById('editExpenseList');
    if (editList) {
        editList.innerHTML = expenses.map(e => `
            <div class="edit-row">
                <input type="text" class="name-input" value="${e.name}"
                       oninput="setExpenseName(${e.id}, this.value)" placeholder="Expense name">
                <span class="money-wrap">$<input class="val-input" type="number" id="edit-exp-${e.id}"
                      value="${e.value}" oninput="setExpenseValue(${e.id}, this.value)"></span>
                <button class="del-btn" onclick="deleteExpense(${e.id})">×</button>
            </div>
        `).join('');
    }

    const idealList = document.getElementById('idealExpenseList');
    if (idealList) {
        idealList.innerHTML = expenses.map(e => `
            <div class="box-row">
                <label id="exp-lbl-${e.id}">${e.name || '(unnamed)'}</label>
                <span class="money-wrap">$<input class="val-input" type="number" id="ideal-exp-${e.id}"
                      value="${e.value}" oninput="setExpenseValue(${e.id}, this.value)"></span>
            </div>
        `).join('');
    }

    calculate();
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
    const amtEl = document.getElementById('sub-amt-' + id);
    if (amtEl) amtEl.textContent = fmt(sub.value, 2);
    calculate();
}

function renderSubscriptions() {
    const total = subscriptions.reduce((s, sub) => s + sub.value, 0);

    const editList = document.getElementById('editSubList');
    if (editList) {
        editList.innerHTML = subscriptions.length === 0
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
    }

    const subDisplay = document.getElementById('subListDisplay');
    if (subDisplay) {
        subDisplay.innerHTML = subscriptions.length === 0
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
    }

    calculate();
}

/* ══════════════════════════════════════════
   RSU vest months
══════════════════════════════════════════ */
const VEST_MONTHS = [2, 5, 8, 11]; // Feb, May, Aug, Nov

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

    // ── Tax ──
    const taxRate = (getVal('taxFed') + getVal('taxState') + getVal('taxSS') + getVal('taxMed')) / 100;
    const netRate = 1 - taxRate;

    const baseTax      = base      * taxRate;
    const refresherTax = refresher * taxRate;
    const rsuTax       = rsu       * taxRate;
    const bonusTax     = bonus     * taxRate;
    const totalTax     = baseTax + refresherTax + rsuTax + bonusTax;

    setEl('postTaxAnnual', fmt(annual * netRate, 0));
    const taxNote = `Fed ${getVal('taxFed')}%<br>CA ${getVal('taxState')}%<br>SS ${getVal('taxSS')}%`;
    const noteAnnual   = document.getElementById('taxRateNoteAnnual');
    const noteMonthly  = document.getElementById('taxRateNoteMonthly');
    if (noteAnnual)  noteAnnual.innerHTML  = taxNote;
    if (noteMonthly) noteMonthly.innerHTML = taxNote;
    setEl('baseTaxAmt',      fmt(baseTax,             0));
    setEl('baseNet',         fmt(base * netRate,      0));
    setEl('refresherTaxAmt', fmt(refresherTax,        0));
    setEl('refresherNet',    fmt(refresher * netRate, 0));
    setEl('rsuTaxAmt',       fmt(rsuTax,              0));
    setEl('rsuNet',          fmt(rsu * netRate,       0));
    setEl('bonusTaxAmt',     fmt(bonusTax,            0));
    setEl('bonusNet',        fmt(bonus * netRate,     0));
    setEl('totalTaxAmt',     fmt(totalTax,            0));

    // ── Pretax Monthly — RSU vest logic ──
    const isVestMonth = VEST_MONTHS.includes(new Date().getMonth() + 1);
    const rsuVest1 = rsu / 4;
    const rsuVest2 = refresher / 4;
    const rsuM1    = isVestMonth ? rsuVest1 : 0;
    const rsuM2    = isVestMonth ? rsuVest2 : 0;

    const baseMonthly   = base / 12;
    const bonusMonthly  = bonus / 12;
    const preTaxMonthly = baseMonthly + rsuM1 + rsuM2 + bonusMonthly;

    setEl('baseMonthlyDisplay',  fmt(baseMonthly,  0));
    setEl('bonusMonthlyDisplay', fmt(bonusMonthly, 0));
    setEl('preTaxMonthlyTotal',  '$' + fmt(preTaxMonthly));

    const blue = 'color:#1558b0';
    const gray = 'color:#999';

    const rsu1M = document.getElementById('rsu1MonthlyDisplay');
    const rsu2M = document.getElementById('rsu2MonthlyDisplay');
    if (rsu1M) rsu1M.innerHTML = isVestMonth
        ? `<span style="${blue}">$${fmt(rsuVest1)}</span>`
        : `<span style="${gray}">$0 (not vest month)</span>`;
    if (rsu2M) rsu2M.innerHTML = isVestMonth
        ? `<span style="${blue}">$${fmt(rsuVest2)}</span>`
        : `<span style="${gray}">$0 (not vest month)</span>`;

    // ── PostTax Monthly per source ──
    const baseMonthlyTax  = baseMonthly  * taxRate;
    const bonusMonthlyTax = bonusMonthly * taxRate;
    const rsuM1Tax        = rsuM1 * taxRate;
    const rsuM2Tax        = rsuM2 * taxRate;
    const totalMonthlyTax = preTaxMonthly * taxRate;

    setEl('postTaxMonthly',     fmt(preTaxMonthly * netRate, 0));
    setEl('baseMonthlyTax',     fmt(baseMonthlyTax,          0));
    setEl('baseMonthlyNet',     fmt(baseMonthly * netRate,   0));
    setEl('bonusMonthlyTax',    fmt(bonusMonthlyTax,         0));
    setEl('bonusMonthlyNet',    fmt(bonusMonthly * netRate,  0));
    setEl('totalMonthlyTaxAmt', fmt(totalMonthlyTax,         0));

    const rsu1MP = document.getElementById('rsu1MonthlyPostDisplay');
    const rsu2MP = document.getElementById('rsu2MonthlyPostDisplay');
    if (rsu1MP) rsu1MP.innerHTML = isVestMonth
        ? `<span style="${blue}">−$${fmt(rsuM1Tax)} = $${fmt(rsuM1 * netRate)}</span>`
        : `<span style="${gray}">$0 (not vest month)</span>`;
    if (rsu2MP) rsu2MP.innerHTML = isVestMonth
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

    const subListTotalEl = document.getElementById('subListTotal');
    if (subListTotalEl) subListTotalEl.innerText = fmt(subTotal, 2);

    saveToStorage();
}
