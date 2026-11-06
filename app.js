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
const ui = { view: 'dashboard', branch: 'all', from: today(), to: today(), rep: null, live: null, audit: [], bk: [], bf: today(), bt: addDays(today(), 7), cust: { q: '', page: 1, rows: [], total: 0, tier: '' }, settings: null, picked: new Set() };
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
    else if (v === 'mgmt:customers') { const c = ui.cust; Object.assign(c, await api('GET', `/api/customers?q=${encodeURIComponent(c.q)}&page=${c.page}&tier=${c.tier}`)); }
    else if (v === 'activity') ui.audit = await api('GET', '/api/audit');
    else if (v === 'settings') ui.settings = await api('GET', '/api/settings');
    else if (v === 'bookings') ui.bk = await api('GET', `/api/bookings?from=${ui.bf}&to=${ui.bt}&branch=${ui.branch}`);
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
const ICONS = {
  grid: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4"/>', chart: '<path d="M3 3v18h18M7 15l4-4 3 3 6-7"/>',
  tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>', wallet: '<path d="M3 7a2 2 0 0 1 2-2h13v4"/><path d="M3 7v11a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2z"/><circle cx="17" cy="14" r="1"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>', doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12"/>', users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  building: '<path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h1M14 9h1M9 13h1M14 13h1M9 17h6"/>', key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M16 7l3 3M14 9l2 2"/>', activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  bottle: '<path d="M10 2h4M10 2v4l-2 3v11a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V9l-2-3V2"/>', armchair: '<path d="M5 11V7a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v4M3 13a2 2 0 0 1 4 0v3h10v-3a2 2 0 0 1 4 0v5H3zM6 21v-3M18 21v-3"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>', logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>'
};
const ic = n => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;
const REPORTS = [['sales', 'Sales Reports', 'coin'], ['items', 'Item Ranking', 'chart'], ['commissions', 'Commissions', 'tag'], ['payroll', 'Payroll', 'wallet'], ['attendance', 'Barber Attendance', 'clock'], ['tender', 'Tender Summary', 'card'], ['discounts', 'Discount Reports', 'tag'], ['cash', 'Cash Management', 'wallet'], ['readings', 'Sales Readings', 'doc']];
const MGMT = [['staff', 'Barbers / Staff', 'scissors'], ['chairs', 'Chairs', 'armchair'], ['categories', 'Categories', 'folder'], ['items', 'Services & Products', 'bottle'], ['discounts', 'Discounts', 'tag'], ['customers', 'Customers', 'users'], ['users', 'Users', 'key'], ['branches', 'Branches', 'building']];const title = () => ui.view === 'dashboard' ? 'Dashboard' : ui.view === 'settings' ? 'Settings' : ui.view === 'bookings' ? 'Bookings' : ui.view === 'activity' ? 'Activity' : ui.view.startsWith('rep:') ? REPORTS.find(r => r[0] === ui.view.slice(4))[1] : MGMT.find(m => m[0] === ui.view.slice(5))[1];

function render() {
  const nav = document.getElementById('nav'), view = document.getElementById('view');
  if (!loggedIn) {
    nav.style.display = 'none';
    view.innerHTML = `<div class="online card"><img class="logo" src="/icon-192.png" alt=""><h2>${esc(S.shop)}</h2><p class="mute" style="text-align:center;margin:-6px 0 6px">Back office login</p><form data-form="login">
      <label>Username <span class="mute">(owner: iwanang blangko)</span></label><input name="username" autocapitalize="none" autocomplete="username">
      <label>Password</label><input type="password" name="password" autocomplete="current-password" required>
      <p id="err" style="color:var(--bad);min-height:20px">${esc(loadErr === 'Login required' ? '' : loadErr)}</p><button class="btn" style="width:100%;justify-content:center;padding:12px">Login</button></form></div>`;
    return;
  }
  if (S.me.role === 'cashier') {
    nav.style.display = 'none';
    view.innerHTML = `<div class="online card"><h2>Cashier account</h2><p>Naka-login ka bilang <b>${esc(S.me.name)}</b>. Ang back office na ito ay para sa admin. Gamitin ang cashier app para sa POS.</p><button class="btn" data-act="logout">Logout</button></div>`;
    return;
  }
  nav.style.display = '';
  const on = k => ui.view === k ? 'on' : '';
  nav.innerHTML = `<div class="brand"><img src="/icon-192.png" alt=""><div><h1>${esc(S.shop)}</h1><small>Back office · ${esc(S.me.name)}</small></div></div>
    <select id="branchsel"><option value="all">All branches</option>${S.branches.map(b => `<option value="${b.id}" ${ui.branch === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>
    <button class="${on('dashboard')}" data-view="dashboard">${ic('grid')}Dashboard</button>
    <button class="${on('bookings')}" data-view="bookings">${ic('calendar')}Bookings</button>
    <div class="navh">Reports</div>${REPORTS.map(([k, l, i]) => `<button class="${on('rep:' + k)}" data-view="rep:${k}">${ic(i)}${l}</button>`).join('')}
    <div class="navh">Management</div>${MGMT.map(([k, l, i]) => `<button class="${on('mgmt:' + k)}" data-view="mgmt:${k}">${ic(i)}${l}</button>`).join('')}
    <div class="navh">System</div><button class="${on('activity')}" data-view="activity">${ic('activity')}Activity</button>
    <button class="${on('settings')}" data-view="settings">${ic('gear')}Settings</button>
    <button data-act="logout" style="margin-top:auto;color:var(--bad)">${ic('logout')}Logout</button>`;  view.innerHTML = ui.view === 'dashboard' ? vDashboard() : ui.view === 'bookings' ? vBookings() : ui.view === 'settings' ? vSettings() : ui.view === 'activity' ? vActivity() : ui.view.startsWith('rep:') ? vReport() : vMgmt(ui.view.slice(5));
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
  staff: { cols: [['photo', ''], ['name', 'Name'], ['branchId', 'Branch', brName], ['chairId', 'Chair', chName], ['pct', 'Commission', v => v + '%'], ['allowance', 'Daily allowance', peso], ['active', 'Active', yn]], rows: () => S.staff,
    form: () => [['name', 'Name', 'text'], ['branchId', 'Branch', 'select', { opts: BR(), def: ui.branch !== 'all' ? ui.branch : S.branches[0]?.id }],
      ['chairId', 'Chair', 'select', { opts: [['', '— none —'], ...S.chairs.map(c => [c.id, chName(c.id)])], req: false }], ['pct', 'Commission %', 'number', { def: 50 }],
      ['allowance', 'Daily allowance (₱)', 'number', { def: 0, hint: 'guaranteed minimum per day worked' }], ['photo', 'Photo', 'photo', { req: false }], ['active', 'Active', 'select', { opts: [[1, 'Yes'], [0, 'No']] }]] },
  chairs: { cols: [['branchId', 'Branch', brName], ['name', 'Name'], ['sort', 'Order'], ['active', 'Active', yn]], rows: () => S.chairs,
    form: () => [['branchId', 'Branch', 'select', { opts: BR(), def: ui.branch !== 'all' ? ui.branch : S.branches[0]?.id }], ['name', 'Name', 'text'], ['sort', 'Order', 'number', { def: 1 }], ['active', 'Active', 'select', { opts: [[1, 'Yes'], [0, 'No']] }]] },
  categories: { cols: [['name', 'Name'], ['type', 'Type']], rows: () => S.categories,
    form: () => [['name', 'Name', 'text'], ['type', 'Type', 'select', { opts: [['service', 'Service'], ['product', 'Product']] }]] },
  items: { cols: [['photo', ''], ['name', 'Name'], ['categoryId', 'Category', catName], ['type', 'Type'], ['price', 'Price', peso], ['mins', 'Minutes'], ['bookable', 'Online', yn], ['apptOnly', 'Appt only', yn], ['active', 'Active', yn]], rows: () => S.items,
    form: () => [['name', 'Name', 'text'], ['categoryId', 'Category', 'select', { opts: S.categories.map(c => [c.id, `${c.name} (${c.type})`]) }], ['type', 'Type', 'select', { opts: [['service', 'Service'], ['product', 'Product']] }],
      ['price', 'Price (₱)', 'number'], ['mins', 'Minutes', 'number', { def: 30 }], ['photo', 'Photo', 'photo', { req: false }], ['bookable', 'Show on online booking', 'select', { opts: [[1, 'Yes'], [0, 'No']] }], ['apptOnly', 'Appointment only (not for walk-ins)', 'select', { opts: [[0, 'No'], [1, 'Yes']] }], ['active', 'Active', 'select', { opts: [[1, 'Yes'], [0, 'No']] }]] },
  discounts: { cols: [['name', 'Name'], ['kind', 'Kind'], ['value', 'Value'], ['active', 'Active', yn]], rows: () => S.discounts,
    form: () => [['name', 'Name', 'text'], ['kind', 'Kind', 'select', { opts: [['amount', 'Amount off (₱)'], ['percent', 'Percent off (%)']] }], ['value', 'Value', 'number'], ['active', 'Active', 'select', { opts: [[1, 'Yes'], [0, 'No']] }]] },
  users: { cols: [['name', 'Name'], ['username', 'Username'], ['role', 'Role'], ['branchId', 'Branch', v => v ? brName(v) : 'All'], ['active', 'Active', yn]], rows: () => S.users,
    form: () => [['name', 'Name', 'text'], ['username', 'Username', 'text'], ['pin', 'Cashier PIN', 'text', { req: false, hint: '6 digits, para sa cashier app; blangko = hindi babaguhin' }],
      ['password', 'Password', 'password', { req: false, hint: 'para sa admin; blangko = hindi babaguhin; min 6' }],
      ['role', 'Role', 'select', { opts: [['cashier', 'Cashier (POS, isang branch)'], ['admin', 'Admin (lahat ng branch)']] }], ['branchId', 'Branch', 'select', { opts: [['', '— all —'], ...BR()], req: false, hint: 'para sa cashier' }],
      ['active', 'Active', 'select', { opts: [[1, 'Yes'], [0, 'No']] }]] },
  branches: { cols: [['name', 'Name'], ['phone', 'Phone'], ['address', 'Address'], ['openTime', 'Opens'], ['closeTime', 'Closes'], ['graceMins', 'Grace (min)']], rows: () => S.branches,
    form: () => [['name', 'Name', 'text'], ['phone', 'Phone', 'text', { req: false }], ['address', 'Address', 'text', { req: false }], ['openTime', 'Opening time (late after this)', 'time', { def: '09:00' }], ['closeTime', 'Closing time (last booking ends by this)', 'time', { def: '21:00' }], ['graceMins', 'Grace minutes', 'number', { def: 10 }]] }
};
function vMgmt(kind) {
  if (kind === 'customers') return vCustomers();
  const m = M[kind];
  const rows = m.rows().filter(r => ui.branch === 'all' || !('branchId' in r) || r.branchId === ui.branch || kind === 'users' || kind === 'branches');
  return `<div class="row" style="justify-content:space-between;margin-bottom:14px"><h2 style="margin:0">${title()}</h2><button class="btn" data-act="edit" data-kind="${kind}">+ Add</button></div>
  <div class="card overflow"><table><tr>${m.cols.map(c => `<th>${c[1]}</th>`).join('')}<th></th></tr>
  ${rows.map(r => `<tr style="${r.active === 0 ? 'opacity:.5' : ''}">${m.cols.map(([k, , f]) => k === 'photo' ? `<td>${thumb(r)}</td>` : `<td>${esc(f ? f(r[k]) : r[k])}</td>`).join('')}<td><button class="btn ghost sm" data-act="edit" data-kind="${kind}" data-id="${r.id}">Edit</button> <button class="btn bad sm" data-act="del" data-kind="${kind}" data-id="${r.id}">Delete</button></td></tr>`).join('') || `<tr><td colspan="${m.cols.length + 1}" class="mute">Wala pa.</td></tr>`}</table></div>`;
}
const tierBadge = t => `<span class="tier ${t}">${esc(t)}</span>`;
function vCustomers() {
  const c = ui.cust, pages = Math.max(1, Math.ceil(c.total / 20));
  return `<div class="row between" style="margin-bottom:14px"><h2 style="margin:0">Customer Directory <span class="mute" style="font-size:14px">· ${c.total.toLocaleString('en-PH')}</span></h2>
    <div class="row"><input id="csearch" placeholder="Search name, phone, email, haircut" value="${esc(c.q)}" style="width:250px">
    <select id="tierf" style="width:150px"><option value="">All tiers</option>${[['member', 'Member (0–4)'], ['bronze', 'Bronze (5–15)'], ['silver', 'Silver (16–25)'], ['gold', 'Gold (26–50)'], ['vip', 'VIP (51+)']].map(([v, l]) => `<option value="${v}" ${c.tier === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <button class="btn" data-act="edit" data-kind="customers">+ Add</button>
    <label class="btn ghost" style="margin:0;cursor:pointer;color:var(--text);text-transform:none;letter-spacing:0;font-size:14px;font-weight:700">⬆ Import CSV<input type="file" id="csvfile" accept=".csv,text/csv" hidden></label></div></div>
  <p class="mute" style="margin:-6px 0 14px;font-size:13px">1 bayad na visit = 1 point · Member 0–4 · Bronze 5–15 · Silver 16–25 · Gold 26–50 · VIP 51+. Nasa directory lang ang may phone o email.</p>
  <div class="card overflow"><table><tr><th>Customer</th><th>Contact</th><th>Preferred haircut</th><th>Tier</th><th>Visits / points</th><th>Total spent</th><th>Last visit</th><th>Email promos</th><th></th></tr>
  ${c.rows.map(r => `<tr><td><b>${esc(r.name)}</b></td><td>${esc(r.phone)}${r.phone && r.email ? '<br>' : ''}<span class="mute">${esc(r.email)}</span></td><td>${esc(r.preferredCut)}</td><td>${tierBadge(r.tier)}</td><td><b>${r.visits}</b></td><td>${peso(r.spent)}</td><td class="mute">${r.lastVisit ? new Date(r.lastVisit).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</td>
    <td>${r.consent ? '<span style="color:var(--ok);font-weight:700">✔ Subscribed</span>' : '<span class="mute">—</span>'}</td><td><button class="btn ghost sm" data-act="edit" data-kind="customers" data-id="${r.id}">Edit</button></td></tr>`).join('') || '<tr><td colspan="9" class="mute">Wala pang customer sa directory.</td></tr>'}</table></div>
  <div class="row" style="margin-top:12px;justify-content:center"><button class="btn ghost sm" data-act="page" data-n="-1" ${c.page <= 1 ? 'disabled' : ''}>‹ Prev</button><span class="mute">Page ${c.page} / ${pages}</span><button class="btn ghost sm" data-act="page" data-n="1" ${c.page >= pages ? 'disabled' : ''}>Next ›</button></div>`;
}
function vSettings() {
  const s = ui.settings; if (!s) return '<p class="mute">Loading…</p>';
  const e = s.email;
  return `<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr))">
    <div class="card"><h3>Email (welcome at promos)</h3>
      <p style="margin:0 0 8px">${e.configured ? '<b style="color:var(--ok)">● Naka-set na ang email service</b>' : '<b style="color:var(--bad)">● Hindi pa naka-set</b>'}</p>
      <p class="mute" style="font-size:13px;margin:0 0 10px">${e.configured ? `Galing sa: <b>${esc(e.from)}</b><br>Link sa unsubscribe: ${esc(e.baseUrl)}` : 'Habang wala pa nito, naka-pila lang ang mga welcome email (hindi mawawala) at ipapadala kapag na-set na. Tingnan ang gabay sa chat para sa RESEND_API_KEY at EMAIL_FROM sa Railway Variables.'}</p>
      <label>Magpadala ng test email</label><div class="row" style="flex-wrap:nowrap"><input id="testto" type="email" placeholder="email mo" style="flex:1"><button class="btn" data-act="testmail">Send test</button></div></div>
    <div class="card"><h3>Loyalty tiers</h3><table><tr><th>Tier</th><th>Visits</th></tr>${[['Member', '0–4'], ['Bronze', '5–15'], ['Silver', '16–25'], ['Gold', '26–50'], ['VIP', '51+']].map(([n, r]) => `<tr><td>${tierBadge(n)}</td><td>${r}</td></tr>`).join('')}</table><p class="mute" style="font-size:12px;margin:10px 0 0">1 bayad na visit = 1 point. Awtomatikong kinukuwenta mula sa mga bayad na ticket.</p></div></div>
  <div class="card" style="margin-top:14px"><h3>Terms &amp; Conditions (lalabas sa ilalim ng fill-up form)</h3>
    <textarea id="termsta" rows="16" style="font-size:13px;line-height:1.5">${esc(s.terms)}</textarea>
    <p class="mute" style="font-size:12px">Draft lang ito. Ipa-review sa abogado o sa compliance officer para tiyaking sumusunod sa Data Privacy Act (RA 10173).</p>
    <div class="row"><button class="btn" data-act="saveterms">Save terms</button>${s.customTerms ? '<button class="btn ghost" data-act="resetterms">Ibalik sa default</button>' : ''}</div></div>
  <div class="card overflow" style="margin-top:14px"><h3>Mga email na ipinadala</h3><table><tr><th>When</th><th>To</th><th>Type</th><th>Status</th><th>Tries</th><th>Error</th></tr>
    ${s.log.map(l => `<tr><td>${new Date(l.createdAt).toLocaleString('en-PH')}</td><td>${esc(l.toAddr)}</td><td>${esc(l.kind)}</td><td><span class="tag ${l.status === 'sent' ? 'done' : l.status === 'pending' ? 'booked' : ''}">${esc(l.status)}</span></td><td>${l.attempts}</td><td class="mute">${esc(l.error)}</td></tr>`).join('') || '<tr><td colspan="6" class="mute">Wala pang email.</td></tr>'}</table></div>`;
}
function form(kind, id) {
  const m = M[kind] || { form: () => [['name', 'Full name', 'text'], ['phone', 'Mobile number', 'text', { req: false, hint: 'phone O email ang kailangan' }], ['email', 'Email', 'email', { req: false }], ['preferredCut', 'Preferred haircut', 'text', { req: false }], ['notes', 'Notes', 'textarea', { req: false }], ['consent', 'Email at promos', 'select', { opts: [[0, 'Hindi pumayag'], [1, 'Pumayag (Terms & Conditions)']] }]] };
  const o = id ? (kind === 'customers' ? ui.cust.rows.find(x => x.id === id) : m.rows().find(x => x.id === id)) : {};
  const input = ([n, l, t, x = {}]) => {
    const val = n === 'password' ? '' : (o[n] ?? x.def ?? '');
    const req = x.req === false ? '' : 'required';
    const ctl = t === 'photo' ? `<div class="photo"><div class="pv" id="pv">${val ? `<img src="${esc(val)}" alt="">` : 'No photo'}</div><div style="flex:1"><input type="file" accept="image/*" data-photo="${n}" style="padding:8px"><input type="hidden" name="${n}" value="${esc(val)}"><p class="mute" id="phmsg" style="margin:6px 0 0;font-size:12px">JPG o PNG. Awtomatikong liliitan.</p></div></div>`
      : t === 'textarea' ? `<textarea name="${n}">${esc(val)}</textarea>`
      : t === 'select' ? `<select name="${n}">${x.opts.map(([v, lab]) => `<option value="${esc(v)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(lab)}</option>`).join('')}</select>`
        : `<input name="${n}" type="${t}" value="${esc(val)}" ${req} ${t === 'number' ? 'step="any"' : ''} ${t === 'password' ? 'autocomplete="new-password"' : ''}>`;
    return `<label>${l}${x.hint ? ` <span class="mute">(${x.hint})</span>` : ''}</label>${ctl}`;
  };
  openModal(`<h2>${id ? 'Edit' : 'New'}</h2><form data-form="${kind}" data-id="${id || ''}">${m.form().map(input).join('')}<p id="err" style="color:var(--bad)"></p><div class="row"><button class="btn">Save</button><button type="button" class="btn ghost" data-act="close">Cancel</button></div></form>`);
}
const thumb = r => r.photo ? `<img class="th ${r.type ? 'sq' : ''}" src="${esc(r.photo)}" alt="" loading="lazy">` : `<span class="th ${r.type ? 'sq' : ''}">${esc(String(r.name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase())}</span>`;
async function resizeToJpeg(file, max = 640) {
  const bmp = await createImageBitmap(file), s = Math.min(1, max / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.82);
}
function vBookings() {
  const link = location.origin + '/book';
  const rows = ui.bk;
  return `<div class="card" style="margin-bottom:14px"><div class="row between"><div><h3 style="margin:0 0 4px">Online booking link</h3><b style="font-size:16px">${esc(link)}</b><div class="mute" style="font-size:12px">Ibigay sa customers (Facebook, Messenger, QR). Papasok ang booking sa POS ng branch.</div></div>
    <div class="row"><button class="btn" data-act="copylink">Copy link</button><a class="btn ghost" href="/book" target="_blank" style="text-decoration:none">Open</a></div></div></div>
  <div class="row" style="margin-bottom:14px;align-items:flex-end"><div><label>From</label><input type="date" id="bfrom" value="${ui.bf}"></div><div><label>To</label><input type="date" id="bto" value="${ui.bt}"></div></div>
  <div class="card overflow"><table><tr><th>Date</th><th>Time</th><th>Customer</th><th>Phone</th><th>Services</th><th>Barber</th><th>Branch</th><th>Source</th><th>Status</th><th></th></tr>
  ${rows.map(b => `<tr><td>${esc(b.date)}</td><td>${esc(b.time)}</td><td>${esc(b.customerName)}</td><td>${esc(b.phone)}</td><td>${b.items.map(i => esc(i.name)).join(', ')}</td><td>${thumb({ photo: b.staffPhoto, name: b.staffName })} ${esc(b.staffName)}</td><td>${esc(b.branchName)}</td><td>${b.source === 'online' ? 'Online' : 'Phone/POS'}</td>
    <td><span class="tag ${b.status === 'booked' ? 'booked' : b.status === 'arrived' ? 'done' : ''}">${esc(b.status)}</span></td><td>${b.status === 'booked' ? `<button class="btn bad sm" data-act="bkcancel" data-id="${b.id}">Cancel</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="10" class="mute">Walang booking sa panahong ito.</td></tr>'}</table></div>`;
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
  if (act === 'saveterms') { const v = document.getElementById('termsta').value; try { await api('PUT', '/api/settings', { terms: v }); alert('Na-save ang Terms & Conditions.'); await loadView(); render(); } catch (x) { alert(x.message); } return; }
  if (act === 'resetterms') { if (confirm('Ibalik ang default na Terms?')) { try { await api('PUT', '/api/settings', { terms: '' }); await loadView(); render(); } catch (x) { alert(x.message); } } return; }
  if (act === 'testmail') { const to = document.getElementById('testto').value.trim(); try { await api('POST', '/api/settings/test-email', { to }); alert('Naipadala na ang test email sa ' + to + '. Tingnan ang inbox (at spam).'); await loadView(); render(); } catch (x) { alert(x.message); } return; }
  if (act === 'copylink') { try { await navigator.clipboard.writeText(location.origin + '/book'); alert('Na-copy ang link!'); } catch (x) { prompt('Copy this link:', location.origin + '/book'); } return; }
  if (act === 'bkcancel') { if (confirm('I-cancel ang booking na ito?')) mut(() => api('PUT', `/api/bookings/${d.id}`, { status: 'cancelled' })); return; }
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
  if (t.id === 'tierf') { ui.cust.tier = t.value; ui.cust.page = 1; await loadView(); return render(); }
  if (t.id === 'bfrom' || t.id === 'bto') { if (t.id === 'bfrom') ui.bf = t.value || today(); else ui.bt = t.value || today(); await loadView(); return render(); }
  if (t.dataset.photo) {
    const file = t.files[0]; if (!file) return; const msg = document.getElementById('phmsg'); msg.textContent = 'Ina-upload…';
    try {
      const r = await api('POST', '/api/upload', { data: await resizeToJpeg(file) });
      t.parentElement.querySelector('input[type=hidden]').value = r.url; document.getElementById('pv').innerHTML = `<img src="${r.url}" alt="">`; msg.textContent = 'Na-upload na. I-click ang Save.';
    } catch (x) { msg.textContent = x.message; }
    return;
  }
  if (t.id === 'rfrom' || t.id === 'rto') { if (t.id === 'rfrom') ui.from = t.value || today(); else ui.to = t.value || today(); await loadView(); return render(); }
  if (t.dataset.pick) { t.checked ? ui.picked.add(t.dataset.pick) : ui.picked.delete(t.dataset.pick); return render(); }
  if (t.id === 'csvfile' && t.files[0]) {
    const rows = parseCSV(await t.files[0].text()); if (rows.length < 2) return alert('Walang laman ang CSV.');
    const head = rows[0].map(h => h.trim().toLowerCase()), idx = k => head.findIndex(h => h.includes(k));
    const ni = idx('name'), pi = idx('phone') >= 0 ? idx('phone') : idx('mobile'), ei = idx('email'), hi = idx('haircut') >= 0 ? idx('haircut') : idx('preferred');
    if (ni < 0) return alert('Kailangan ng column na "name" sa unang row ng CSV (phone o email ang kailangan; optional: haircut).');
    const data = rows.slice(1).map(r => ({ name: r[ni], phone: pi >= 0 ? r[pi] : '', email: ei >= 0 ? r[ei] : '', preferredCut: hi >= 0 ? r[hi] : '' }));
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
  for (const [k, v] of fd.entries()) { if (k === 'password' && !v) continue; o[k] = ['price', 'mins', 'pct', 'allowance', 'active', 'value', 'sort', 'graceMins', 'bookable', 'apptOnly', 'consent'].includes(k) ? +v : v; }
  run(() => id ? api('PUT', `/api/${kind}/${id}`, o) : api('POST', `/api/${kind}`, o), err);
});

load().then(() => setInterval(() => { if (loggedIn && !modal.open && ui.view === 'dashboard' && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) load(); }, 15000));
render();
