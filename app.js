// Brotherhood — admin back office (reports + management). The cashier/barber POS talks to the same API.
const peso = n => '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pad = n => String(n).padStart(2, '0');
const dstr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => dstr(new Date());
const addDays = (s, n) => { const d = new Date(s + 'T00:00'); d.setDate(d.getDate() + n); return dstr(d); };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ago = iso => { const m = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000)); return m < 60 ? m + ' min' : Math.floor(m / 60) + 'h ' + (m % 60) + 'm'; };

// ---------- state ----------
let S = { shop: 'Brotherhood', me: null, branches: [], chairs: [], staff: [], categories: [], items: [], discounts: [], users: [] };
let token = ''; try { token = localStorage.getItem('bp.token') || ''; } catch (e) { }
let loggedIn = false, loadErr = '';
const ui = { view: 'dashboard', branch: 'all', from: today(), to: today(), rep: null, live: null, audit: [], cust: { q: '', page: 1, rows: [], total: 0 }, picked: new Set() };
const modal = document.getElementById('modal');
const openModal = h => { modal.innerHTML = h; if (!modal.open) modal.showModal(); };
const closeModal = () => modal.close();

async function api(method, url, body) {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && url !== '/api/login') { loggedIn = false; token = ''; render(); throw new Error(j.error || 'Login required'); }
  if (!r.ok) throw new Error(j.error || 'Request failed');
  return j;
}
const qs = () => `from=${ui.from}&to=${ui.to}&branch=${ui.branch}`;
async function loadView() {
  const v = ui.view;
  try {
    if (v === 'dashboard') { [ui.live, ui.rep] = await Promise.all([api('GET', `/api/live?branch=${ui.branch}`), api('GET', `/api/reports/dashboard?branch=${ui.branch}`)]); }
    else if (v.startsWith('rep:')) ui.rep = await api('GET', `/api/reports/${v.slice(4)}?${qs()}`);
    else if (v === 'customers') { const c = ui.cust; Object.assign(c, await api('GET', `/api/customers?q=${encodeURIComponent(c.q)}&page=${c.page}`)); }
    else if (v === 'activity') ui.audit = await api('GET', '/api/audit');
  } catch (e) { if (loggedIn) alert(e.message); }
}
async function load(viewToo = true) {
  try { S = await api('GET', '/api/state'); loggedIn = true; loadErr = ''; if (viewToo && S.me?.role !== 'cashier') await loadView(); }
  catch (e) { loadErr = e.message; loggedIn = false; }
  if (!modal.open) render();
}
async function mut(fn, errEl) {
  try { await fn(); await load(); return true; }
  catch (e) { if (errEl) errEl.textContent = e.message; else alert(e.message); return false; }
}
function run(fn, errEl) { mut(fn, errEl).then(ok => { if (ok) { closeModal(); render(); } }); }
async function download(url, name) {
  try {
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) throw new Error('Download failed');
    const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = name; a.click();
  } catch (x) { alert(x.message); }
}

// ---------- lookups / formatting ----------
const brName = id => S.branches.find(b => b.id === id)?.name || '';
const chName = id => { const c = S.chairs.find(x => x.id === id); return c ? `${brName(c.branchId)} · ${c.name}` : ''; };
const catName = id => S.categories.find(c => c.id === id)?.name || '';
const fmtVal = (v, t) => t === 'peso' ? peso(v) : t === 'num' ? Number(v).toLocaleString('en-PH') : esc(v);

// ---------- navigation ----------
const REPORTS = [['sales', 'Sales Reports'], ['items', 'Item Ranking'], ['commissions', 'Commissions'], ['payroll', 'Payroll'], ['attendance', 'Barber Attendance'], ['tender', 'Tender Summary'], ['discounts', 'Discount Reports'], ['cash', 'Cash Management'], ['readings', 'Sales Readings']];
const MGMT = [['staff', 'Barbers / Staff'], ['chairs', 'Chairs'], ['categories', 'Categories'], ['items', 'Services & Products'], ['discounts', 'Discounts'], ['customers', 'Customers'], ['users', 'Users'], ['branches', 'Branches']];
const title = () => ui.view === 'dashboard' ? 'Dashboard' : ui.view === 'activity' ? 'Activity' : ui.view.startsWith('rep:') ? REPORTS.find(r => r[0] === ui.view.slice(4))[1] : MGMT.find(m => m[0] === ui.view.slice(5))[1];

function render() {
  const nav = document.getElementById('nav'), view = document.getElementById('view');
  if (!loggedIn) {
    nav.style.display = 'none';
    view.innerHTML = `<div class="online card"><h2>✂ ${esc(S.shop)} login</h2><form data-form="login">
      <label>Username <span class="mute">(owner: iwanang blangko)</span></label><input name="username" autocapitalize="none" autocomplete="username">
      <label>Password</label><input type="password" name="password" autocomplete="current-password" required>
      <p id="err" style="color:var(--bad)">${esc(loadErr === 'Login required' ? '' : loadErr)}</p><button class="btn">Login</button></form></div>`;
    return;
  }
  if (S.me.role === 'cashier') {
    nav.style.display = 'none';
    view.innerHTML = `<div class="online card"><h2>Cashier account</h2><p>Naka-login ka bilang <b>${esc(S.me.name)}</b>. Ang back office na ito ay para sa admin. Gamitin ang cashier app para sa POS.</p><button class="btn" data-act="logout">Logout</button></div>`;
    return;
  }
  nav.style.display = '';
  const on = k => ui.view === k ? 'on' : '';
  nav.innerHTML = `<h1>✂ ${esc(S.shop)}</h1>
    <select id="branchsel" style="margin:0 0 8px"><option value="all">All branches</option>${S.branches.map(b => `<option value="${b.id}" ${ui.branch === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>
    <button class="${on('dashboard')}" data-view="dashboard">Dashboard</button>
    <div class="navh">Reports</div>${REPORTS.map(([k, l]) => `<button class="${on('rep:' + k)}" data-view="rep:${k}">${l}</button>`).join('')}
    <div class="navh">Management</div>${MGMT.map(([k, l]) => `<button class="${on('mgmt:' + k)}" data-view="mgmt:${k}">${l}</button>`).join('')}
    <div class="navh"></div><button class="${on('activity')}" data-view="activity">Activity</button>
    <button data-act="logout" style="margin-top:auto">Logout</button>`;
  view.innerHTML = ui.view === 'dashboard' ? vDashboard() : ui.view === 'activity' ? vActivity() : ui.view.startsWith('rep:') ? vReport() : vMgmt(ui.view.slice(5));
}

// ---------- report rendering ----------
function renderCards(cards) {
  return `<div class="grid">${cards.map(c => `<div class="card stat"><span>${esc(c.label)}</span><b>${fmtVal(c.value, c.t)}</b>${c.sub ? `<small class="mute">${esc(c.sub)}</small>` : ''}</div>`).join('')}</div>`;
}
function renderTable(t) {
  const sel = t.selectable;
  return `<div class="card overflow" style="margin-bottom:14px"><div class="row" style="justify-content:space-between;margin-bottom:8px"><h3 style="margin:0">${esc(t.title)}</h3>
    ${sel ? `<button class="btn sm" data-act="paid" ${ui.picked.size ? '' : 'disabled'}>✔ Mark as paid (${ui.picked.size})</button>` : ''}</div>
    <table><tr>${sel ? '<th></th>' : ''}${t.cols.map(c => `<th>${esc(c[0])}</th>`).join('')}</tr>
    ${t.rows.map((r, i) => `<tr>${sel ? `<td><input type="checkbox" data-pick="${t.ids[i]}" ${ui.picked.has(t.ids[i]) ? 'checked' : ''} style="width:auto"></td>` : ''}${r.map((v, j) => `<td>${fmtVal(v, t.cols[j][1])}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${t.cols.length}" class="mute">Walang data sa panahong ito.</td></tr>`}</table></div>`;
}
const filterBar = (extra = '') => `<div class="row" style="margin-bottom:14px;align-items:flex-end">
  <div><label>From</label><input type="date" id="rfrom" value="${ui.from}"></div><div><label>To</label><input type="date" id="rto" value="${ui.to}"></div>
  <button class="btn ghost sm" data-act="range" data-r="today">Today</button><button class="btn ghost sm" data-act="range" data-r="7">7 days</button><button class="btn ghost sm" data-act="range" data-r="month">This month</button>${extra}</div>`;

function vReport() {
  const name = ui.view.slice(4), r = ui.rep;
  const exp = `<button class="btn ghost sm" data-act="export" data-name="${name}">⬇ Export CSV</button>`;
  return `<h2>${title()} <span class="mute" style="font-size:14px">· ${ui.branch === 'all' ? 'All branches' : esc(brName(ui.branch))}</span></h2>${filterBar(exp)}${r ? renderCards(r.cards) + r.tables.map(renderTable).join('') : '<p class="mute">Loading…</p>'}`;
}
function vDashboard() {
  const l = ui.live, r = ui.rep;
  const live = l ? `<h3 style="margin:0 0 8px"><span style="color:var(--ok)">●</span> Live floor</h3><div class="grid">
    <div class="card stat"><span>Barbers on duty</span><b>${l.onDuty}</b><small class="mute">${l.available} available · ${l.cutting} cutting</small></div>
    <div class="card stat"><span>Waiting in queue</span><b>${l.waiting}</b><small class="mute">${l.waiting ? 'Longest wait ' + l.longestWaitMin + ' min' : 'Nobody is waiting'}</small></div>
    <div class="card stat"><span>In the chair</span><b>${l.cutting}</b><small class="mute">Walk-ins being served now</small></div></div>
    <div class="card overflow" style="margin-bottom:14px"><h3>Live walk-in floor queue</h3><table><tr><th>Ticket</th><th>Customer</th><th>Branch</th><th>Services</th><th>Status</th><th>Barber</th><th>Time</th></tr>
    ${l.queue.map(q => `<tr><td>#${String(q.no).padStart(3, '0')}</td><td>${esc(q.customer)}</td><td>${esc(q.branch)}</td><td>${esc(q.services)}</td><td><span class="tag ${q.status === 'in_chair' ? 'done' : 'booked'}">${q.status === 'in_chair' ? 'In Chair' : 'Waiting'}</span></td><td>${esc(q.barber)}</td><td>${ago(q.since)}</td></tr>`).join('') || '<tr><td colspan="7" class="mute">Walang customer sa floor ngayon.</td></tr>'}</table></div>` : '';
  return `<h2>Dashboard <span class="mute" style="font-size:14px">· ${ui.branch === 'all' ? 'All branches' : esc(brName(ui.branch))}</span></h2>${live}${r ? renderCards(r.cards) + r.tables.map(renderTable).join('') : ''}`;
}
const vActivity = () => `<div class="row" style="justify-content:space-between;margin-bottom:14px"><h2 style="margin:0">Activity</h2>${S.me.role === 'owner' ? '<button class="btn" data-act="backup">⬇ Download backup</button>' : ''}</div>
  <p class="mute">May awtomatikong daily backup sa server. I-download din ito paminsan-minsan at itago sa ibang lugar (Google Drive, flash drive).</p>
  <div class="card overflow"><table><tr><th>When</th><th>Who</th><th>Action</th><th>What</th><th>Detail</th></tr>
  ${ui.audit.map(r => `<tr><td>${new Date(r.ts).toLocaleString('en-PH')}</td><td>${esc(r.who)}</td><td>${esc(r.action)}</td><td>${esc(r.entity)}</td><td class="mute">${esc(r.detail)}</td></tr>`).join('')}</table></div>`;

// ---------- management ----------
const yn = v => v === 0 ? 'No' : 'Yes';
const BR = () => S.branches.map(b => [b.id, b.name]);
const M = {
  staff: { cols: [['name', 'Name'], ['branchId', 'Branch', brName], ['chairId', 'Chair', chName], ['pct', 'Commission', v => v + '%'], ['allowance', 'Daily allowance', peso], ['active', 'Active', yn]], rows: () => S.staff,
    form: () => [['name', 'Name', 'text'], ['branchId', 'Branch', 'select', { opts: BR(), def: ui.branch !== 'all' ? ui.branch : S.branches[0]?.id }],
      ['chairId', 'Chair', 'select', { opts: [['', '— none —'], ...S.chairs.map(c => [c.id, chName(c.id)])], req: false }], ['pct', 'Commission %', 'number', { def: 50 }],
      ['allowance', 'Daily allowance (₱)', 'number', { def: 0, hint: 'guaranteed minimum per day worked' }], ['active', 'Active', 'select', { opts: [[1, 'Yes'], [0, 'No']] }]] },
  chairs: { cols: [['branchId', 'Branch', brName], ['name', 'Name'], ['sort', 'Order'], ['active', 'Active', yn]], rows: () => S.chairs,
    form: () => [['branchId', 'Branch', 'select', { opts: BR(), def: ui.branch !== 'all' ? ui.branch : S.branches[0]?.id }], ['name', 'Name', 'text'], ['sort', 'Order', 'number', { def: 1 }], ['active', 'Active', 'select', { opts: [[1, 'Yes'], [0, 'No']] }]] },
  categories: { cols: [['name', 'Name'], ['type', 'Type']], rows: () => S.categories,
    form: () => [['name', 'Name', 'text'], ['type', 'Type', 'select', { opts: [['service', 'Service'], ['product', 'Product']] }]] },
  items: { cols: [['name', 'Name'], ['categoryId', 'Category', catName], ['type', 'Type'], ['price', 'Price', peso], ['mins', 'Minutes'], ['active', 'Active', yn]], rows: () => S.items,
    form: () => [['name', 'Name', 'text'], ['categoryId', 'Category', 'select', { opts: S.categories.map(c => [c.id, `${c.name} (${c.type})`]) }], ['type', 'Type', 'select', { opts: [['service', 'Service'], ['product', 'Product']] }],
      ['price', 'Price (₱)', 'number'], ['mins', 'Minutes', 'number', { def: 30 }], ['active', 'Active', 'select', { opts: [[1, 'Yes'], [0, 'No']] }]] },
  discounts: { cols: [['name', 'Name'], ['kind', 'Kind'], ['value', 'Value'], ['active', 'Active', yn]], rows: () => S.discounts,
    form: () => [['name', 'Name', 'text'], ['kind', 'Kind', 'select', { opts: [['amount', 'Amount off (₱)'], ['percent', 'Percent off (%)']] }], ['value', 'Value', 'number'], ['active', 'Active', 'select', { opts: [[1, 'Yes'], [0, 'No']] }]] },
  users: { cols: [['name', 'Name'], ['username', 'Username'], ['role', 'Role'], ['branchId', 'Branch', v => v ? brName(v) : 'All'], ['active', 'Active', yn]], rows: () => S.users,
    form: () => [['name', 'Name', 'text'], ['username', 'Username', 'text'], ['password', 'Password', 'password', { req: false, hint: 'blangko = hindi babaguhin; min 6' }],
      ['role', 'Role', 'select', { opts: [['cashier', 'Cashier (POS, isang branch)'], ['admin', 'Admin (lahat ng branch)']] }], ['branchId', 'Branch', 'select', { opts: [['', '— all —'], ...BR()], req: false, hint: 'para sa cashier' }],
      ['active', 'Active', 'select', { opts: [[1, 'Yes'], [0, 'No']] }]] },
  branches: { cols: [['name', 'Name'], ['phone', 'Phone'], ['address', 'Address'], ['openTime', 'Opens'], ['graceMins', 'Grace (min)']], rows: () => S.branches,
    form: () => [['name', 'Name', 'text'], ['phone', 'Phone', 'text', { req: false }], ['address', 'Address', 'text', { req: false }], ['openTime', 'Opening time (late after this)', 'time', { def: '09:00' }], ['graceMins', 'Grace minutes', 'number', { def: 10 }]] }
};
function vMgmt(kind) {
  if (kind === 'customers') return vCustomers();
  const m = M[kind];
  const rows = m.rows().filter(r => ui.branch === 'all' || !('branchId' in r) || r.branchId === ui.branch || kind === 'users' || kind === 'branches');
  return `<div class="row" style="justify-content:space-between;margin-bottom:14px"><h2 style="margin:0">${title()}</h2><button class="btn" data-act="edit" data-kind="${kind}">+ Add</button></div>
  <div class="card overflow"><table><tr>${m.cols.map(c => `<th>${c[1]}</th>`).join('')}<th></th></tr>
  ${rows.map(r => `<tr style="${r.active === 0 ? 'opacity:.5' : ''}">${m.cols.map(([k, , f]) => `<td>${esc(f ? f(r[k]) : r[k])}</td>`).join('')}<td><button class="btn ghost sm" data-act="edit" data-kind="${kind}" data-id="${r.id}">Edit</button> <button class="btn bad sm" data-act="del" data-kind="${kind}" data-id="${r.id}">Delete</button></td></tr>`).join('') || `<tr><td colspan="${m.cols.length + 1}" class="mute">Wala pa.</td></tr>`}</table></div>`;
}
function vCustomers() {
  const c = ui.cust, pages = Math.max(1, Math.ceil(c.total / 20));
  return `<div class="row" style="justify-content:space-between;margin-bottom:14px"><h2 style="margin:0">Customers <span class="mute" style="font-size:14px">· ${c.total.toLocaleString('en-PH')}</span></h2>
    <div class="row"><input id="csearch" placeholder="Search name, phone, email" value="${esc(c.q)}" style="width:240px"><button class="btn" data-act="edit" data-kind="customers">+ Add</button>
    <label class="btn ghost" style="margin:0;cursor:pointer;color:var(--text)">⬆ Import CSV<input type="file" id="csvfile" accept=".csv,text/csv" hidden></label></div></div>
  <div class="card overflow"><table><tr><th>Name</th><th>Phone</th><th>Email</th><th>Notes</th><th></th></tr>
  ${c.rows.map(r => `<tr><td>${esc(r.name)}</td><td>${esc(r.phone)}</td><td>${esc(r.email)}</td><td class="mute">${esc(r.notes)}</td><td><button class="btn ghost sm" data-act="edit" data-kind="customers" data-id="${r.id}">Edit</button></td></tr>`).join('')}</table></div>
  <div class="row" style="margin-top:12px;justify-content:center"><button class="btn ghost sm" data-act="page" data-n="-1" ${c.page <= 1 ? 'disabled' : ''}>‹ Prev</button><span class="mute">Page ${c.page} / ${pages}</span><button class="btn ghost sm" data-act="page" data-n="1" ${c.page >= pages ? 'disabled' : ''}>Next ›</button></div>`;
}
function form(kind, id) {
  const m = M[kind] || { form: () => [['name', 'Name', 'text'], ['phone', 'Phone', 'text', { req: false }], ['email', 'Email', 'email', { req: false }], ['notes', 'Notes / preferred cut', 'textarea', { req: false }]] };
  const o = id ? (kind === 'customers' ? ui.cust.rows.find(x => x.id === id) : m.rows().find(x => x.id === id)) : {};
  const input = ([n, l, t, x = {}]) => {
    const val = n === 'password' ? '' : (o[n] ?? x.def ?? '');
    const req = x.req === false ? '' : 'required';
    const ctl = t === 'textarea' ? `<textarea name="${n}">${esc(val)}</textarea>`
      : t === 'select' ? `<select name="${n}">${x.opts.map(([v, lab]) => `<option value="${esc(v)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(lab)}</option>`).join('')}</select>`
        : `<input name="${n}" type="${t}" value="${esc(val)}" ${req} ${t === 'number' ? 'step="any"' : ''} ${t === 'password' ? 'autocomplete="new-password"' : ''}>`;
    return `<label>${l}${x.hint ? ` <span class="mute">(${x.hint})</span>` : ''}</label>${ctl}`;
  };
  openModal(`<h2>${id ? 'Edit' : 'New'}</h2><form data-form="${kind}" data-id="${id || ''}">${m.form().map(input).join('')}<p id="err" style="color:var(--bad)"></p><div class="row"><button class="btn">Save</button><button type="button" class="btn ghost" data-act="close">Cancel</button></div></form>`);
}
function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some(x => x.trim())) rows.push(row); row = []; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

// ---------- events ----------
document.addEventListener('click', async e => {
  const nb = e.target.closest('[data-view]');
  if (nb) { ui.view = nb.dataset.view; ui.picked.clear(); if (ui.view === 'mgmt:customers') ui.cust.page = 1; render(); await loadView(); return render(); }
  const el = e.target.closest('[data-act]'); if (!el || el.disabled) return;
  const d = el.dataset, act = d.act;
  if (act === 'close') return closeModal();
  if (act === 'logout') { token = ''; try { localStorage.removeItem('bp.token'); } catch (x) { } loggedIn = false; return render(); }
  if (act === 'edit') return form(d.kind, d.id);
  if (act === 'del') { if (confirm('Sigurado ka?')) mut(async () => { const r = await api('DELETE', `/api/${d.kind}/${d.id}`); if (r.deactivated) alert('May history na ito kaya na-deactivate na lang (hindi nabura).'); }); return; }
  if (act === 'range') { const t = today(); ui.to = t; ui.from = d.r === 'today' ? t : d.r === '7' ? addDays(t, -6) : t.slice(0, 8) + '01'; await loadView(); return render(); }
  if (act === 'export') return download(`/api/reports/${d.name}?${qs()}&format=csv`, `${d.name}-${ui.from}_${ui.to}.csv`);
  if (act === 'backup') return download('/api/backup', `brotherhood-${today()}.db`);
  if (act === 'page') { ui.cust.page += +d.n; await loadView(); return render(); }
  if (act === 'paid') {
    if (!confirm(`I-mark as paid ang ${ui.picked.size} barber (lahat ng unpaid days hanggang ${ui.to})?`)) return;
    mut(() => api('POST', '/api/payroll/pay', { staffIds: [...ui.picked], to: ui.to })).then(() => ui.picked.clear());
  }
});
document.addEventListener('change', async e => {
  const t = e.target;
  if (t.id === 'branchsel') { ui.branch = t.value; render(); await loadView(); return render(); }
  if (t.id === 'rfrom' || t.id === 'rto') { if (t.id === 'rfrom') ui.from = t.value || today(); else ui.to = t.value || today(); await loadView(); return render(); }
  if (t.dataset.pick) { t.checked ? ui.picked.add(t.dataset.pick) : ui.picked.delete(t.dataset.pick); return render(); }
  if (t.id === 'csvfile' && t.files[0]) {
    const rows = parseCSV(await t.files[0].text()); if (rows.length < 2) return alert('Walang laman ang CSV.');
    const head = rows[0].map(h => h.trim().toLowerCase()), idx = k => head.findIndex(h => h.includes(k));
    const ni = idx('name'), pi = idx('phone') >= 0 ? idx('phone') : idx('mobile'), ei = idx('email');
    if (ni < 0) return alert('Kailangan ng column na "name" sa unang row ng CSV (optional: phone, email).');
    const data = rows.slice(1).map(r => ({ name: r[ni], phone: pi >= 0 ? r[pi] : '', email: ei >= 0 ? r[ei] : '' }));
    if (!confirm(`I-import ang ${data.length} na customer?`)) return;
    try { const r = await api('POST', '/api/customers/import', { rows: data }); alert(`${r.added} ang nadagdag, ${r.skipped} ang nilaktawan (duplicate/walang pangalan).`); await load(); } catch (x) { alert(x.message); }
  }
});
let searchTimer;
document.addEventListener('input', e => {
  if (e.target.id === 'csearch') { ui.cust.q = e.target.value; ui.cust.page = 1; clearTimeout(searchTimer); searchTimer = setTimeout(async () => { await loadView(); const p = e.target.selectionStart; render(); const s = document.getElementById('csearch'); s.focus(); s.setSelectionRange(p, p); }, 300); }
});
document.addEventListener('submit', e => {
  const f = e.target; if (!f.dataset.form) return; e.preventDefault();
  const fd = new FormData(f), kind = f.dataset.form, id = f.dataset.id, err = f.querySelector('#err');
  if (kind === 'login') {
    api('POST', '/api/login', { username: fd.get('username'), password: fd.get('password') })
      .then(j => { token = j.token; try { localStorage.setItem('bp.token', token); } catch (x) { } return load(); }).catch(x => { if (err) err.textContent = x.message; });
    return;
  }
  const o = {};
  for (const [k, v] of fd.entries()) { if (k === 'password' && !v) continue; o[k] = ['price', 'mins', 'pct', 'allowance', 'active', 'value', 'sort', 'graceMins'].includes(k) ? +v : v; }
  run(() => id ? api('PUT', `/api/${kind}/${id}`, o) : api('POST', `/api/${kind}`, o), err);
});

load().then(() => setInterval(() => { if (loggedIn && !modal.open && ui.view === 'dashboard' && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) load(); }, 15000));
render();
