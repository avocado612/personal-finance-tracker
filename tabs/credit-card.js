/* ══════════════════════════════════════════
   CC Analytics — categories & keyword data
══════════════════════════════════════════ */
const DINING_CHAINS = [
    'five guys','shake shack','whataburger','wingstop','raising cane','culver',
    'sonic drive','sonic ','jack in the box','in-n-out','in n out','habit burger',
    'smashburger','fatburger','mooyah','backyard burger','del taco','del tac',
    'steak n shake','steak\'n shake','rally\'s','rallys','checkers ','hardee',
    'arby\'s','arbys','arby ','carl\'s jr','carls jr','bojangle','cookout','cook out',
    'zaxby','freddy\'s','freddys','slim chicken','whataburg',
    'raising cane','zaxby','bojangle','popeye','chick-fil','wingstop','slim chicken',
    'el pollo loco','pollo tropical',
    'papa john','papa murph','little caesar','round table pizza','jet\'s pizza','jet pizza',
    'hungry howie','sbarro','godfather pizza','cici\'s','cicis','zpizza','blaze pizza',
    'mod pizza','mod mkt','pieology',
    'chipotle','qdoba','moe\'s sw','moes sw','taco john','taco bueno','taco cabana',
    'baja fresh','del taco','tijuana flats','chronic tacos','freebirds',
    'jersey mike','jimmy john','firehouse sub','mcalister','which wich','schlotzsky',
    'quizno','blimpie','potbelly','portillo',
    'applebee','chili\'s','chilis','tgi friday','t.g.i.','red lobster','olive garden',
    'longhorn steakhouse','longhorn steak','outback steakhouse','outback ','texas roadhouse',
    'texas de brazil','denny\'s','dennys','ihop','cracker barrel','bob evans',
    'waffle house','buffalo wild wing','b-dubs','bdubs','red robin','ruby tuesday',
    'yard house','seasons 52','cheesecake factory','pf chang','p.f. chang',
    'benihana','golden corral','noodles & co','noodles and co','corner bakery',
    'jason\'s deli','jasons deli','cosi ','bonefish grill','first watch',
    'the melting pot','dave & buster','dave and buster','hooters','twin peaks',
    'panda express','pei wei','gen korean','boiling crab','yoshinoya','p.f. chang',
    'tim horton','dutch bros','caribou coffee','biggby','scooter\'s coffee','scooters coffee',
    'coffee bean','the coffee bean','tropical smoothie','jamba','smoothie king',
    'baskin-robbins','baskin robbins','cold stone','marble slab','ben & jerry',
    'dairy queen','oberweis','handel\'s','rita\'s italian','yogurtland','menchie',
    'auntie anne','cinnabon','wetzel','great american cookie','mrs fields',
    'nothing bundt','panera','einstein bagel','bruegger',
    'doordash','uber eat','ubereats','grubhub','postmates','caviar ','gopuff',
    'tst* ','sq *','toasttab','clover ','olo ','revel ',
];

const CC_CATEGORIES = [
    { name: 'Groceries',     keywords: ['safeway','trader joe','wholefds','whole foods','kroger','heb ','costco','ralphs','vons','albertsons','sprouts','publix','99 ranch','h mart','grocery','supermarket','food 4 less','smart & final','winco','aldi','fresh market','weee','wee '] },
    { name: 'Dining Out',    keywords: ['starbucks','mcdonald','subway','pizza','burger','taco bell','wendys','chick-fil','panda','peet','dunkin','panera','restaurant','kitchen','eatery','grill','bistro','cafe','deli','bbq','ramen','sushi','thai food','lounge',...DINING_CHAINS] },
    { name: 'Gas & Auto',    keywords: ['shell oil','chevron','exxon','bp ','mobil','arco','circle k','marathon','speedway','sunoco','conoco',' gas ','fuel','jiffy lube','autozone','advance auto','pep boys','car wash','parking','dmv '] },
    { name: 'Shopping',      keywords: ['amazon','amzn','ebay','etsy','walmart','target','best buy','home depot','lowes','ikea','macy','nordstrom','zara','h&m','tjmaxx','tj maxx','marshalls','ross ','gap ','old navy','banana republic','wayfair','chewy','petco','petsmart','dollar tree','five below','nike','adidas','under armour','lululemon','uniqlo','shein','temu ','fashion nova','urban outfitter','free people','revolve'] },
    { name: 'Subscriptions', keywords: ['netflix','spotify','hulu','disney','youtube','apple.com/bill','google one','adobe','dropbox','microsoft','linkedin','amazon prime','audible','nytimes','wsj ','paramount','peacock','hbomax','espn ','crunchyroll','chatgpt','openai','claude'] },
    { name: 'Health',        keywords: ['cvs ','walgreens','rite aid','pharmacy','medical','dental','vision','optometry','urgent care','clinic','hospital','kaiser','blue shield','anthem','labcorp','quest diag','therapy','doctor'] },
    { name: 'Travel',        keywords: ['delta air','united air','southwest air','spirit air','american air','alaska air','frontier air','hotel','marriott','hilton','hyatt','airbnb','vrbo','expedia','booking.com','priceline','hertz','enterprise rent','national car','lyft','uber '] },
    { name: 'Utilities',     keywords: ['pg&e','pge ','sdge ','sce ','electric','water dept','at&t','verizon','t-mobile','comcast','xfinity','spectrum','cox comm','centurylink'] },
    { name: 'Entertainment', keywords: ['amc ','regal ','cinemark','ticketmaster','stubhub','steam ','playstation','xbox ','nintendo','twitch','patreon','eventbrite','bowling','golf','spa '] },
    { name: 'Transfers',     keywords: ['venmo','zelle','paypal','cash app','apple cash'] },
    { name: 'Payment',       keywords: ['online payment','online pmt','e-payment','autopay','bill payment'] },
];
const CC_EXCLUDE_FROM_SPEND = new Set(['Payment']);

const CC_CATEGORY_NAMES = [
    'Groceries','Dining Out','Gas & Auto','Shopping','Subscriptions',
    'Health','Travel','Utilities','Entertainment','Transfers','Other'
];

const DESCRIPTION_HINTS = {
    'Dining Out':    ['cuisine','restaurant','eatery','kitchen','grill','bistro','cafe','deli','bbq','ramen','sushi','lounge','noodle','taqueria','cantina','trattoria','izakaya','chophouse','steakhouse','seafood','hibachi','dim sum','tapas','brasserie','boba','bubble tea','creamery','creperie','patisserie','gelateria','pizzeria','thai','chinese','japanese','korean','vietnamese','indian','mediterranean','mexican','italian','greek','peruvian','ethiopian','pho','curry','brunch','breakfast diner','waffle','pancake','bagel'],
    'Groceries':     ['market','produce','grocery','supermarket','fresh '],
    'Health':        ['fitness','gym ','yoga','pilates','wellness','chiropractic','physical therapy','optometry','dermatology','orthodont','dental','vision care'],
    'Shopping':      ['boutique','jewel','salon','barber','apparel','clothing','fashion','thrift','consignment'],
    'Entertainment': ['theater','theatre','museum','gallery','arcade','escape room','bowling','miniature golf','trampoline'],
    'Travel':        ['resort','inn ','lodge','suites','motel','hostel','flight','airport','airline'],
};

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

let categoryKeywords = {};
let subCategories    = {};
let subCatKeywords   = {};

/* ══════════════════════════════════════════
   Categorization
══════════════════════════════════════════ */
function detectColumns(headers) {
    const norm = s => s.toLowerCase().replace(/[^a-z]/g, '');
    const hs = headers.map(norm);
    return {
        dateIdx:   hs.findIndex(h => h === 'date' || h.startsWith('date')),
        amountIdx: hs.findIndex(h => h.includes('amount') || h === 'debit' || h === 'credit'),
        descIdx:   hs.findIndex(h => h.includes('desc') || h.includes('detail') || h.includes('memo') || h.includes('payee') || h.includes('name')),
    };
}

function ccCategorizeFull(description) {
    const d = description.toLowerCase();
    for (const [cat, subs] of Object.entries(subCategories)) {
        for (const sub of subs) {
            const kws = subCatKeywords[cat + '__' + sub] || [];
            if (kws.some(kw => kw && d.includes(kw))) return { cat, sub };
        }
    }
    for (const [cat, kws] of Object.entries(categoryKeywords)) {
        if (kws.some(kw => kw && d.includes(kw))) return { cat, sub: null };
    }
    for (const cat of CC_CATEGORIES) {
        if (cat.keywords.some(kw => d.includes(kw))) return { cat: cat.name, sub: null };
    }
    for (const [cat, hints] of Object.entries(DESCRIPTION_HINTS)) {
        if (hints.some(h => d.includes(h))) return { cat, sub: null };
    }
    return { cat: 'Other', sub: null };
}

function ccCategorize(description) {
    return ccCategorizeFull(description).cat;
}

/* ══════════════════════════════════════════
   CC Analytics global state
══════════════════════════════════════════ */
let ccTransactions    = [];
let ccSelectedMonthEl = null;
let ccSelectedMonthKey = null;
let ccRawRows          = [];
let ccDateColIdx       = 0;

function toISO(s) {
    const p = s.split('/');
    return p.length === 3 ? `${p[2]}-${p[0].padStart(2,'0')}-${p[1].padStart(2,'0')}` : s;
}

/* ══════════════════════════════════════════
   Detail / expand helpers
══════════════════════════════════════════ */
function saveOpenDetails(bodyId) {
    const body = document.getElementById(bodyId);
    if (!body) return new Set();
    const open = new Set();
    body.querySelectorAll('.cat-detail').forEach(detail => {
        if (detail.style.display !== 'none') {
            const row    = detail.previousElementSibling;
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

function toggleCatDetail(id, btn) {
    const el   = document.getElementById(id);
    const open = el.style.display !== 'none';
    el.style.display = open ? 'none' : 'block';
    btn.textContent  = open ? '▶' : '▼';
}

function merchantKey(desc) {
    return desc.trim().split(/\s+/).slice(0, 5).join(' ').toLowerCase();
}

/* ══════════════════════════════════════════
   Transaction categorize action
══════════════════════════════════════════ */
function applyTxnCategory(selectEl) {
    const val = selectEl.value;
    if (!val) return;
    const row  = selectEl.closest('.cat-detail-row');
    const desc = row.dataset.desc || '';
    const kw   = desc.trim().toLowerCase().split(/\s+/).slice(0, 2).join(' ');
    if (!kw) return;

    if (val.includes('::')) {
        const [cat, sub] = val.split('::');
        const key = cat + '__' + sub;
        if (!subCatKeywords[key]) subCatKeywords[key] = [];
        if (!subCatKeywords[key].includes(kw)) subCatKeywords[key].push(kw);
    } else {
        if (!categoryKeywords[val]) categoryKeywords[val] = [];
        if (!categoryKeywords[val].includes(kw)) categoryKeywords[val].push(kw);
    }
    reCategorizeAll();
    saveToStorage();
}

/* ══════════════════════════════════════════
   Rendering helpers
══════════════════════════════════════════ */
function niceAxisTicks(max, count = 4) {
    if (max <= 0) return [0];
    const rough = max / count;
    const mag   = Math.pow(10, Math.floor(Math.log10(rough)));
    const nice  = [1, 2, 2.5, 5, 10].find(f => f * mag >= rough) * mag;
    const ticks = [];
    for (let v = 0; v <= max * 1.001; v += nice) ticks.push(Math.round(v));
    return ticks;
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
    return `<div class="cat-detail-row" data-mkey="${mkey}" data-desc="${safeDesc}" onclick="highlightMerchant(this.dataset.mkey)">
        <span class="cat-detail-date">${dateLabel}</span>
        <div class="cat-desc-group">
            <span class="cat-detail-desc" title="${t.desc}">${t.desc}</span>
            ${classify}
        </div>
        <span class="${amtClass}">${amtLabel}</span>
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
    const sorted  = Object.entries(cats).sort(([,a], [,b]) => b - a);
    const maxAmt  = Math.max(...sorted.map(([,a]) => a), 1);
    const ticks   = niceAxisTicks(maxAmt);
    const axisMax = ticks[ticks.length - 1] || maxAmt;

    const classifyOpts = CC_CATEGORY_NAMES.filter(n => n !== 'Other').map(cat => {
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
                <div class="cat-bar-fill" data-cat="${name}" style="width:${Math.max(0, amt / axisMax * 100)}%"></div>
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

/* ══════════════════════════════════════════
   CC month / date filter rendering
══════════════════════════════════════════ */
function ccRenderCategories(charges) {
    document.getElementById('ccCategoryBody').innerHTML = buildCatChart(charges, 'r');
}

function ccRenderMonthCategories(charges) {
    document.getElementById('ccMonthCategoryBody').innerHTML = buildCatChart(charges, 'm');
}

function ccShowMonth(monthKey, rowEl) {
    if (ccSelectedMonthKey === monthKey) {
        ccSelectedMonthEl?.classList.remove('month-row-active');
        ccSelectedMonthEl  = null;
        ccSelectedMonthKey = null;
        document.getElementById('ccMonthCatTitle').textContent = 'Month';
        document.getElementById('ccMonthCategoryBody').innerHTML =
            '<p class="sub-empty" style="padding:8px 0;">← Click a month to see its breakdown</p>';
        return;
    }
    if (ccSelectedMonthEl) ccSelectedMonthEl.classList.remove('month-row-active');
    ccSelectedMonthEl  = rowEl;
    ccSelectedMonthKey = monthKey;
    rowEl.classList.add('month-row-active');

    const monthCharges = ccTransactions.filter(t =>
        t.month === monthKey && !CC_EXCLUDE_FROM_SPEND.has(t.category));
    const label = monthCharges.length ? monthCharges[0].mLabel : monthKey;
    document.getElementById('ccMonthCatTitle').textContent = label;
    ccRenderMonthCategories(monthCharges);
}

function ccShowAllCategories() {
    if (ccSelectedMonthEl) { ccSelectedMonthEl.classList.remove('month-row-active'); ccSelectedMonthEl = null; }
    ccSelectedMonthKey = null;
    ccApplyDateFilter();
}

function setCcDateToToday() {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
    document.getElementById('ccDateTo').value = today;
    ccApplyDateFilter();
}

function ccApplyDateFilter() {
    const from = document.getElementById('ccDateFrom').value;
    const to   = document.getElementById('ccDateTo').value;
    const filtered = ccTransactions.filter(t =>
        !CC_EXCLUDE_FROM_SPEND.has(t.category) &&
        (!from || t.isoDate >= from) &&
        (!to   || t.isoDate <= to));
    ccRenderCategories(filtered);
}

function reCategorizeAll() {
    if (ccTransactions.length === 0) return;
    ccTransactions.forEach(t => { const { cat, sub } = ccCategorizeFull(t.desc); t.category = cat; t.subCategory = sub; });

    const charges      = ccTransactions.filter(t => !CC_EXCLUDE_FROM_SPEND.has(t.category));
    const totalCharged = charges.reduce((s, t) => s - t.amount, 0);
    const months = {};
    charges.forEach(t => {
        if (!months[t.month]) months[t.month] = { label: t.mLabel, total: 0, count: 0 };
        months[t.month].total -= t.amount;
        months[t.month].count++;
    });
    const sortedMonths = Object.entries(months).sort(([a], [b]) => b.localeCompare(a));
    const monthlyAvg   = sortedMonths.length ? totalCharged / sortedMonths.length : 0;

    document.getElementById('ccTotalCharged').textContent = '$' + fmt(totalCharged, 2);
    document.getElementById('ccTotalTxn').textContent     = charges.length + ' txns';
    document.getElementById('ccMonthlyAvg').textContent   = '$' + fmt(monthlyAvg, 2);

    document.getElementById('ccMonthlyBody').innerHTML = `
        <table class="analytics-table">
            <thead><tr><th>Month</th><th class="col-amt">Spent</th><th class="col-pct">#</th></tr></thead>
            <tbody>
                ${sortedMonths.map(([key, m]) => `
                    <tr class="month-row" data-month="${key}" onclick="ccShowMonth('${key}', this)">
                        <td>${key.slice(5,7)}/${key.slice(0,4)}</td>
                        <td class="col-amt">$${fmt(m.total, 2)}</td>
                        <td class="col-pct">${m.count}</td>
                    </tr>`).join('')}
                <tr class="grand-total">
                    <td>Total</td><td class="col-amt">$${fmt(totalCharged, 2)}</td>
                    <td class="col-pct">${charges.length}</td>
                </tr>
            </tbody>
        </table>`;

    if (ccSelectedMonthKey) {
        const newEl = document.querySelector(`.month-row[data-month="${ccSelectedMonthKey}"]`);
        if (newEl) {
            ccSelectedMonthEl = newEl;
            newEl.classList.add('month-row-active');
            const mc = ccTransactions.filter(t =>
                t.month === ccSelectedMonthKey && !CC_EXCLUDE_FROM_SPEND.has(t.category));
            const openM = saveOpenDetails('ccMonthCategoryBody');
            ccRenderMonthCategories(mc);
            restoreOpenDetails('ccMonthCategoryBody', openM);
        } else { ccSelectedMonthEl = null; ccSelectedMonthKey = null; }
    }

    const openR = saveOpenDetails('ccCategoryBody');
    ccApplyDateFilter();
    restoreOpenDetails('ccCategoryBody', openR);
    if (ccRawRows.length > 0) renderCCTable(ccRawRows, ccTransactions.map(t => t.category), ccDateColIdx);
}

/* ══════════════════════════════════════════
   CSV analysis
══════════════════════════════════════════ */
function analyzeCSV(rows) {
    if (rows.length < 2) return;

    let { dateIdx, amountIdx, descIdx } = detectColumns(rows[0]);
    if (amountIdx === -1) {
        const s = rows[1];
        amountIdx = s.findIndex(c => /^-?\d+(\.\d+)?$/.test(c.trim()));
    }
    if (descIdx  === -1) descIdx  = rows[0].length - 1;
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
    });

    ccTransactions = transactions;
    ccRawRows      = rows;
    ccDateColIdx   = dateIdx;

    const charges      = transactions.filter(t => !CC_EXCLUDE_FROM_SPEND.has(t.category));
    const totalCharged = charges.reduce((s, t) => s - t.amount, 0);

    const months = {};
    charges.forEach(t => {
        if (!months[t.month]) months[t.month] = { label: t.mLabel, total: 0, count: 0 };
        months[t.month].total -= t.amount;
        months[t.month].count++;
    });
    const sortedMonths = Object.entries(months).sort(([a], [b]) => b.localeCompare(a));
    const monthlyAvg   = sortedMonths.length ? totalCharged / sortedMonths.length : 0;

    const isoDates = charges.map(t => t.isoDate).filter(Boolean).sort();
    if (isoDates.length) {
        document.getElementById('ccDateFrom').value = isoDates[0];
        document.getElementById('ccDateTo').value   = isoDates[isoDates.length - 1];
    }

    document.getElementById('ccTotalCharged').textContent = '$' + fmt(totalCharged, 2);
    document.getElementById('ccTotalTxn').textContent     = charges.length + ' txns';
    document.getElementById('ccMonthlyAvg').textContent   = '$' + fmt(monthlyAvg, 2);

    document.getElementById('ccMonthlyBody').innerHTML = `
        <table class="analytics-table">
            <thead><tr><th>Month</th><th class="col-amt">Spent</th><th class="col-pct">#</th></tr></thead>
            <tbody>
                ${sortedMonths.map(([key, m]) => `
                    <tr class="month-row" data-month="${key}" onclick="ccShowMonth('${key}', this)">
                        <td>${key.slice(5,7)}/${key.slice(0,4)}</td>
                        <td class="col-amt">$${fmt(m.total, 2)}</td>
                        <td class="col-pct">${m.count}</td>
                    </tr>
                `).join('')}
                <tr class="grand-total">
                    <td>Total</td>
                    <td class="col-amt">$${fmt(totalCharged, 2)}</td>
                    <td class="col-pct">${charges.length}</td>
                </tr>
            </tbody>
        </table>`;

    ccRenderCategories(charges);
    renderCCTable(rows, transactions.map(t => t.category), dateIdx);

    const el = document.getElementById('ccAnalytics');
    el.style.display       = 'flex';
    el.style.flexDirection = 'column';
    el.style.gap           = '12px';
}

/* ══════════════════════════════════════════
   CSV Upload
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
        analyzeCSV(rows);
        document.getElementById('csvStatus').textContent =
            `${rows.length - 1} rows · ${rows[0].length} columns · "${file.name}"`;
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

function clearCSV() {
    document.getElementById('csvFileInput').value = '';
    document.getElementById('csvStatus').textContent = '';
    document.getElementById('csvHead').innerHTML = '';
    document.getElementById('csvBody').innerHTML = '';
    document.getElementById('csvTable').style.display = 'none';
    document.getElementById('csvEmpty').style.display = '';
    document.getElementById('ccAnalytics').style.display = 'none';
    if (ccSelectedMonthEl) { ccSelectedMonthEl.classList.remove('month-row-active'); ccSelectedMonthEl = null; }
    ccTransactions = [];
}

/* ══════════════════════════════════════════
   Custom category keywords
══════════════════════════════════════════ */
function renderCustomKeywords() {
    const container = document.getElementById('editCustomKeywords');
    if (!container) return;
    container.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:flex-start;">
        ${CC_CATEGORY_NAMES.map(cat => {
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
