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
const ui = { view: 'dashboard', branch: 'all', from: today(), to: today(), rep: null, live: null, audit: [], bk: [], bf: today(), bt: addDays(today(), 7), cust: { q: '', page: 1, rows: [], total: 0, tier: '' }, settings: null, rp: 'today', bp: 'week', reviews: [], picked: new Set() };
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
    else if (v === 'mgmt:customers') { const c = ui.cust; Object.assign(c, await api('GET', `/api/customers?q=${encodeURIComponent(c.q)}&page=${c.page}&tier=${c.tier}&branch=${ui.branch}`)); }
    else if (v === 'activity') ui.audit = await api('GET', '/api/audit');
    else if (v === 'settings') ui.settings = await api('GET', '/api/settings');
    else if (v === 'reviews') ui.reviews = await api('GET', '/api/reviews');
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
  star: '<path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>', logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>'
};
const ic = n => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;
const REPORTS = [['sales', 'Sales Reports', 'coin'], ['items', 'Item Ranking', 'chart'], ['commissions', 'Commissions', 'tag'], ['payroll', 'Payroll', 'wallet'], ['attendance', 'Barber Attendance', 'clock'], ['tender', 'Tender Summary', 'card'], ['discounts', 'Discount Reports', 'tag'], ['cash', 'Cash Management', 'wallet'], ['readings', 'Sales Readings', 'doc']];
const MGMT = [['staff', 'Barbers / Staff', 'scissors'], ['chairs', 'Chairs', 'armchair'], ['categories', 'Categories', 'folder'], ['items', 'Services & Products', 'bottle'], ['discounts', 'Discounts', 'tag'], ['customers', 'Customers', 'users'], ['users', 'Users', 'key'], ['branches', 'Branches', 'building']];const title = () => ui.view === 'dashboard' ? 'Dashboard' : ui.view === 'reviews' ? 'Reviews' : ui.view === 'settings' ? 'Settings' : ui.view === 'bookings' ? 'Bookings' : ui.view === 'activity' ? 'Activity' : ui.view.startsWith('rep:') ? REPORTS.find(r => r[0] === ui.view.slice(4))[1] : MGMT.find(m => m[0] === ui.view.slice(5))[1];

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
    view.innerHTML = `<div class="online card"><h2>Cashier account</h2><p>You are signed in as <b>${esc(S.me.name)}</b>. This back office is for admins. Use the cashier app (/pos) for the POS.</p><button class="btn" data-act="logout">Logout</button></div>`;
    return;
  }
  nav.style.display = '';
  const on = k => ui.view === k ? 'on' : '';
  nav.innerHTML = `<div class="brand"><img src="/icon-192.png" alt=""><div><h1>${esc(S.shop)}</h1><small>Back office · ${esc(S.me.name)}</small></div></div>
    <select id="branchsel"><option value="all">All branches</option>${S.branches.map(b => `<option value="${b.id}" ${ui.branch === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>
    <button class="${on('dashboard')}" data-view="dashboard">${ic('grid')}Dashboard</button>
    <button class="${on('bookings')}" data-view="bookings">${ic('calendar')}Bookings</button>
    <button class="${on('reviews')}" data-view="reviews">${ic('star')}Reviews</button>
    <div class="navh">Reports</div>${REPORTS.map(([k, l, i]) => `<button class="${on('rep:' + k)}" data-view="rep:${k}">${ic(i)}${l}</button>`).join('')}
    <div class="navh">Management</div>${MGMT.map(([k, l, i]) => `<button class="${on('mgmt:' + k)}" data-view="mgmt:${k}">${ic(i)}${l}</button>`).join('')}
    <div class="navh">System</div><button class="${on('activity')}" data-view="activity">${ic('activity')}Activity</button>
    <button class="${on('settings')}" data-view="settings">${ic('gear')}Settings</button>
    <button data-act="logout" style="margin-top:auto;color:var(--bad)">${ic('logout')}Logout</button>`;  view.innerHTML = ui.view === 'dashboard' ? vDashboard() : ui.view === 'bookings' ? vBookings() : ui.view === 'settings' ? vSettings() : ui.view === 'reviews' ? vReviews() : ui.view === 'activity' ? vActivity() : ui.view.startsWith('rep:') ? vReport() : vMgmt(ui.view.slice(5));
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
    ${t.rows.map((r, i) => `<tr>${sel ? `<td><input type="checkbox" data-pick="${t.ids[i]}" ${ui.picked.has(t.ids[i]) ? 'checked' : ''} style="width:auto"></td>` : ''}${r.map((v, j) => `<td>${fmtVal(v, t.cols[j][1])}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${t.cols.length}" class="mute">No data in this period.</td></tr>`}</table></div>`;
}
// Date range presets used by reports and bookings: Today, This week, This month, Custom range, All time
const PRESETS = [['today', 'Today'], ['week', 'This week'], ['month', 'This month'], ['custom', 'Custom range'], ['all', 'All time']];
function presetRange(p) {
  const t = today(), d = new Date(t + 'T00:00');
  if (p === 'today') return [t, t];
  if (p === 'week') { const s = addDays(t, -((d.getDay() + 6) % 7)); return [s, addDays(s, 6)]; }                // Monday to Sunday
  if (p === 'month') return [t.slice(0, 8) + '01', dstr(new Date(d.getFullYear(), d.getMonth() + 1, 0))];
  return ['2000-01-01', '2099-12-31'];
}
[ui.bf, ui.bt] = presetRange(ui.bp);
const rangeBar = (w, extra = '') => {
  const cur = w === 'r' ? ui.rp : ui.bp, a = w === 'r' ? ui.from : ui.bf, b = w === 'r' ? ui.to : ui.bt;
  return `<div class="row" style="margin-bottom:14px;align-items:flex-end"><div class="presets">${PRESETS.map(([k, l]) => `<button class="${cur === k ? 'on' : ''}" data-act="preset" data-w="${w}" data-p="${k}">${l}</button>`).join('')}</div>
    ${cur === 'custom' ? `<div><label>From</label><input type="date" id="${w}from" value="${a}"></div><div><label>To</label><input type="date" id="${w}to" value="${b}"></div>` : `<span class="mute">${cur === 'all' ? 'Everything' : a === b ? a : a + ' → ' + b}</span>`}${extra}</div>`;
};
const filterBar = extra => rangeBar('r', extra);
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
    ${l.queue.map(q => `<tr><td>#${String(q.no).padStart(3, '0')}</td><td>${esc(q.customer)}</td><td>${esc(q.branch)}</td><td>${esc(q.services)}</td><td><span class="tag ${q.status === 'in_chair' ? 'done' : 'booked'}">${q.status === 'in_chair' ? 'In Chair' : 'Waiting'}</span></td><td>${esc(q.barber)}</td><td>${ago(q.since)}</td></tr>`).join('') || '<tr><td colspan="7" class="mute">No customers on the floor right now.</td></tr>'}</table></div>` : '';
  return `<h2>Dashboard <span class="mute" style="font-size:14px">· ${ui.branch === 'all' ? 'All branches' : esc(brName(ui.branch))}</span></h2>${live}${r ? renderCards(r.cards) + r.tables.map(renderTable).join('') : ''}`;
}
const vActivity = () => `<div class="row" style="justify-content:space-between;margin-bottom:14px"><h2 style="margin:0">Activity</h2>${S.me.role === 'owner' ? '<button class="btn" data-act="backup">⬇ Download backup</button>' : ''}</div>
  <p class="mute">The server saves an automatic daily backup. Also download one now and then and keep it somewhere else (Google Drive, a flash drive).</p>
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
    form: () => [['name', 'Full name', 'text'], ['username', 'Username', 'text'],
      ['role', 'Role', 'select', { opts: [['cashier', 'Cashier (POS, one branch)'], ['barber', 'Barber (POS, limited, one branch)'], ['admin', 'Admin (all branches)']] }],
      ['branchId', 'Branch', 'select', { opts: [['', '— all —'], ...BR()], req: false, hint: 'required for cashier and barber' }],
      ['pin', 'PIN', 'text', { req: false, hint: '6 digits, for cashier and barber; blank = keep current' }],
      ['password', 'Password', 'password', { req: false, hint: 'admins only; blank = keep current; min 6' }],
      ['active', 'Active', 'select', { opts: [[1, 'Yes'], [0, 'No']] }]] },
  branches: { cols: [['photo', ''], ['name', 'Name'], ['phone', 'Phone'], ['address', 'Address'], ['openTime', 'Opens'], ['closeTime', 'Closes'], ['graceMins', 'Late grace (min)'], ['defaultPct', 'Default commission', v => v == null || v === '' ? '—' : v + '%']], rows: () => S.branches,
    form: () => [['name', 'Name', 'text'], ['photo', 'Branch photo (shown on the booking site)', 'photo', { req: false }], ['phone', 'Phone', 'text', { req: false }], ['address', 'Address', 'text', { req: false }],
      ['mapUrl', 'Google Maps link', 'text', { req: false, hint: 'optional, helps customers find the shop' }], ['openTime', 'Opening time', 'time', { def: '09:00' }], ['closeTime', 'Closing time', 'time', { def: '21:00' }],
      ['graceMins', 'Late grace period (minutes)', 'number', { def: 10 }], ['defaultPct', 'Default commission % for new barbers', 'number', { def: 40 }]] }};
function vMgmt(kind) {
  if (kind === 'customers') return vCustomers();
  const m = M[kind];
  const rows = m.rows().filter(r => ui.branch === 'all' || !('branchId' in r) || r.branchId === ui.branch || kind === 'users' || kind === 'branches');
  return `<div class="row" style="justify-content:space-between;margin-bottom:14px"><h2 style="margin:0">${title()}</h2><button class="btn" data-act="edit" data-kind="${kind}">+ Add</button></div>
  <div class="card overflow"><table><tr>${m.cols.map(c => `<th>${c[1]}</th>`).join('')}<th></th></tr>
  ${rows.map(r => `<tr style="${r.active === 0 ? 'opacity:.5' : ''}">${m.cols.map(([k, , f]) => k === 'photo' ? `<td>${thumb(r)}</td>` : `<td>${esc(f ? f(r[k]) : r[k])}</td>`).join('')}<td>${kind === 'users' ? `<button class="btn ghost sm" data-act="resetuser" data-id="${r.id}">Reset ${r.role === 'admin' ? 'password' : 'PIN'}</button> ` : ''}<button class="btn ghost sm" data-act="edit" data-kind="${kind}" data-id="${r.id}">Edit</button> <button class="btn bad sm" data-act="del" data-kind="${kind}" data-id="${r.id}">Delete</button></td></tr>`).join('') || `<tr><td colspan="${m.cols.length + 1}" class="mute">Nothing here yet.</td></tr>`}</table></div>`;
}
const tierBadge = t => `<span class="tier ${t}">${esc(t)}</span>`;
function vCustomers() {
  const c = ui.cust, pages = Math.max(1, Math.ceil(c.total / 20));
  const where = ui.branch === 'all' ? 'all branches' : esc(brName(ui.branch));
  return `<div class="row between" style="margin-bottom:14px"><h2 style="margin:0">Customer Directory <span class="mute" style="font-size:14px">· ${c.total.toLocaleString('en-PH')}</span></h2>
    <div class="row"><input id="csearch" placeholder="Search name, phone, email, haircut" value="${esc(c.q)}" style="width:250px">
    <select id="tierf" style="width:150px"><option value="">All tiers</option>${[['member', 'Member (0–4)'], ['bronze', 'Bronze (5–15)'], ['silver', 'Silver (16–25)'], ['gold', 'Gold (26–50)'], ['vip', 'VIP (51+)']].map(([v, l]) => `<option value="${v}" ${c.tier === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <button class="btn" data-act="edit" data-kind="customers">+ Add</button>
    <label class="btn ghost" style="margin:0;cursor:pointer;color:var(--text);text-transform:none;letter-spacing:0;font-size:14px;font-weight:700">⬆ Import CSV<input type="file" id="csvfile" accept=".csv,text/csv" hidden></label></div></div>
  <p class="mute" style="margin:-6px 0 14px;font-size:13px">Showing customers of <b>${where}</b> (change it with the branch picker on the left). Sorted by the most recent haircut, with the branch where it happened. 1 paid visit = 1 point · Member 0–4 · Bronze 5–15 · Silver 16–25 · Gold 26–50 · VIP 51+.</p>
  <div class="card overflow"><table><tr><th>Customer</th><th>Contact</th><th>Preferred haircut</th><th>Tier</th><th>Visits / points</th><th>Total spent</th><th>Last haircut</th><th>Branch</th><th>Email promos</th><th></th></tr>
  ${c.rows.map(r => `<tr><td><b>${esc(r.name)}</b></td><td>${esc(r.phone)}${r.phone && r.email ? '<br>' : ''}<span class="mute">${esc(r.email)}</span></td><td>${esc(r.preferredCut)}</td><td>${tierBadge(r.tier)}</td><td><b>${r.visits}</b></td><td>${peso(r.spent)}</td>
    <td>${r.lastVisit ? new Date(r.lastVisit).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) + '<br><span class="mute" style="font-size:12px">' + new Date(r.lastVisit).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }) + '</span>' : '<span class="mute">No visit yet</span>'}</td>
    <td>${esc(r.branchName) || '<span class="mute">—</span>'}</td><td>${r.consent ? '<span style="color:var(--ok);font-weight:700">✔ Subscribed</span>' : '<span class="mute">—</span>'}</td><td><button class="btn ghost sm" data-act="edit" data-kind="customers" data-id="${r.id}">Edit</button></td></tr>`).join('') || '<tr><td colspan="10" class="mute">No customers in the directory for this view.</td></tr>'}</table></div>
  <div class="row" style="margin-top:12px;justify-content:center"><button class="btn ghost sm" data-act="page" data-n="-1" ${c.page <= 1 ? 'disabled' : ''}>‹ Prev</button><span class="mute">Page ${c.page} / ${pages}</span><button class="btn ghost sm" data-act="page" data-n="1" ${c.page >= pages ? 'disabled' : ''}>Next ›</button></div>`;
}
const MOD_LABEL = { dashboard: 'Dashboard', pos: 'Point of Sale (create sales, take payments)', bookings: 'Bookings (appointments)', queue: 'Walk-in Queue (seat customers)', expenses: 'Expenses', attendance: 'Barber Attendance (time in / out, breaks)', reading: 'Sales Reading (shift, cash, Z-reading)' };
function vSettings() {
  const s = ui.settings; if (!s) return '<p class="mute">Loading…</p>';
  const e = s.email, owner = S.me.role === 'owner';
  return `<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr))">
    <div class="card"><h3>Email (welcome and promos)</h3>
      <p style="margin:0 0 8px">${e.configured ? '<b style="color:var(--ok)">● Email service is connected</b>' : '<b style="color:var(--bad)">● Email service is not connected yet</b>'}</p>
      <p class="mute" style="font-size:13px;margin:0 0 10px">${e.configured ? `Sending from: <b>${esc(e.from)}</b><br>Unsubscribe links point to: ${esc(e.baseUrl)}` : 'Until it is connected, welcome emails wait in the queue (nothing is lost) and are sent once it is set up. Add RESEND_API_KEY and EMAIL_FROM in the Railway variables.'}</p>
      <label>Send a test email</label><div class="row" style="flex-wrap:nowrap"><input id="testto" type="email" placeholder="your email" style="flex:1"><button class="btn" data-act="testmail">Send test</button></div></div>
    <div class="card"><h3>Loyalty tiers</h3><table><tr><th>Tier</th><th>Visits</th></tr>${[['Member', '0–4'], ['Bronze', '5–15'], ['Silver', '16–25'], ['Gold', '26–50'], ['VIP', '51+']].map(([n, r]) => `<tr><td>${tierBadge(n)}</td><td>${r}</td></tr>`).join('')}</table><p class="mute" style="font-size:12px;margin:10px 0 0">1 paid visit = 1 point, calculated automatically from paid tickets.</p></div></div>

  <div class="card overflow" style="margin-top:14px"><h3>Branch settings</h3>
    <p class="mute" style="font-size:13px;margin:0 0 10px"><b>Late grace period</b> = minutes after opening time before a barber is marked Late. <b>Commission</b> = the default rate for new barbers in that branch; <b>Apply to all barbers</b> sets every barber of the branch to that rate (you can still give one barber a different rate under Barbers / Staff).</p>
    <table><tr><th>Branch</th><th>Opens</th><th>Closes</th><th>Late grace (min)</th><th>Commission %</th><th></th></tr>
    ${S.branches.map(b => `<tr><td><b>${esc(b.name)}</b></td><td><input type="time" id="bs-${b.id}-open" value="${esc(b.openTime || '09:00')}" style="width:120px"></td><td><input type="time" id="bs-${b.id}-close" value="${esc(b.closeTime || '21:00')}" style="width:120px"></td>
      <td><input type="number" min="0" id="bs-${b.id}-grace" value="${b.graceMins ?? 10}" style="width:90px"></td><td><input type="number" min="0" max="100" step="any" id="bs-${b.id}-pct" value="${b.defaultPct ?? ''}" placeholder="40" style="width:90px"></td>
      <td><button class="btn sm" data-act="savebranch" data-id="${b.id}">Save</button> <button class="btn ghost sm" data-act="applycomm" data-id="${b.id}">Apply to all barbers</button></td></tr>`).join('')}</table></div>

  <div class="card" style="margin-top:14px"><h3>Booking site: branch pictures and contact details</h3>
    <p class="mute" style="font-size:13px;margin:0 0 12px">This is what customers see on your booking page (<b>${esc(location.origin)}/book</b>). Upload a picture of the shop front so people can find it, then add the phone number, address and a Google Maps link. Click <b>Save</b> on each branch.</p>
    <div class="notice" style="margin:0 0 12px;padding:12px;border:1px solid var(--line);border-radius:12px;background:#f7f7f8;font-size:13px"><b>Google reviews:</b> ${s.google && s.google.configured ? '<span style="color:var(--ok)">Live ratings are ON.</span> The booking site shows each branch\'s Google rating and latest reviews.' : 'Live ratings are OFF (no <code>GOOGLE_PLACES_API_KEY</code> set on the server). The booking site still shows <b>Read</b> and <b>Write a review</b> buttons that open Google.'}<br>Paste each branch's <b>Place ID</b> (find it with Google's "Place ID Finder") or its Google review link. Leave blank to hide the Google block for that branch.</div>
    <div class="bgrid">${S.branches.map(b => `<div class="binfo"><div class="row" style="flex-wrap:nowrap;gap:14px;align-items:flex-start">
      <div class="bpv" id="bp-${b.id}">${b.photo ? `<img src="${esc(b.photo)}" alt="">` : '<span>No picture yet</span>'}</div>
      <div style="flex:1;min-width:0"><b style="font:600 18px Oswald;text-transform:uppercase">${esc(b.name)}</b><label>Picture</label><input type="file" accept="image/*" data-bphoto="${b.id}" style="padding:8px"><small class="mute" id="bm-${b.id}">JPG or PNG. It is resized automatically. A wide photo of the shop front works best.</small></div></div>
      <label>Phone number</label><input id="bi-${b.id}-phone" value="${esc(b.phone || '')}" placeholder="09XX XXX XXXX">
      <label>Address</label><input id="bi-${b.id}-address" value="${esc(b.address || '')}" placeholder="Street, town, province">
      <label>Google Maps link (optional)</label><input id="bi-${b.id}-map" value="${esc(b.mapUrl || '')}" placeholder="https://maps.google.com/...">
      <label>Google Place ID (optional)</label><input id="bi-${b.id}-gpid" value="${esc(b.googlePlaceId || '')}" placeholder="ChIJ...">
      <label>Google reviews link (optional)</label><input id="bi-${b.id}-gurl" value="${esc(b.googleUrl || '')}" placeholder="https://g.page/r/.../review">
      <div class="row" style="margin-top:12px"><button class="btn sm" data-act="savebinfo" data-id="${b.id}">Save</button>${b.photo ? `<button class="btn ghost sm" data-act="rmbphoto" data-id="${b.id}">Remove picture</button>` : ''}<a class="btn ghost sm" href="/book" target="_blank" style="text-decoration:none">View booking site</a></div></div>`).join('')}</div></div>

  <div class="card overflow" style="margin-top:14px"><h3>Access: what each role can open in the POS</h3>
    <table><tr><th>Section</th><th>Cashier</th><th>Barber</th></tr>
    ${s.modules.map(m => `<tr><td>${esc(MOD_LABEL[m] || m)}</td>${['cashier', 'barber'].map(r => `<td><input type="checkbox" data-perm="${r}:${m}" ${s.perms[r].includes(m) ? 'checked' : ''} style="width:20px;height:20px;accent-color:#000"></td>`).join('')}</tr>`).join('')}</table>
    <p class="mute" style="font-size:12px;margin:10px 0">Owner and admin always have full access. Create barber and cashier logins under Management → Users. Changes apply right away.</p>
    <button class="btn" data-act="saveaccess">Save access</button></div>

  <div class="card" style="margin-top:14px"><h3>Terms &amp; Conditions (shown under the customer fill-up form)</h3>
    <textarea id="termsta" rows="16" style="font-size:13px;line-height:1.5">${esc(s.terms)}</textarea>
    <p class="mute" style="font-size:12px">This is only a draft. Have a lawyer or compliance officer review it so it follows the Data Privacy Act (RA 10173).</p>
    <div class="row"><button class="btn" data-act="saveterms">Save terms</button>${s.customTerms ? '<button class="btn ghost" data-act="resetterms">Restore default</button>' : ''}</div></div>

  <div class="card overflow" style="margin-top:14px"><h3>Emails sent</h3><table><tr><th>When</th><th>To</th><th>Type</th><th>Status</th><th>Tries</th><th>Error</th></tr>
    ${s.log.map(l => `<tr><td>${new Date(l.createdAt).toLocaleString('en-PH')}</td><td>${esc(l.toAddr)}</td><td>${esc(l.kind)}</td><td><span class="tag ${l.status === 'sent' ? 'done' : l.status === 'pending' ? 'booked' : ''}">${esc(l.status)}</span></td><td>${l.attempts}</td><td class="mute">${esc(l.error)}</td></tr>`).join('') || '<tr><td colspan="6" class="mute">No emails yet.</td></tr>'}</table></div>

  ${owner ? `<div class="card" style="margin-top:14px;border-color:#f2b8bf"><h3 style="color:var(--bad)">Reset data</h3>
    <p class="mute" style="font-size:13px;margin:0 0 10px">Use this to clear test data before going live. A backup copy is saved automatically before anything is deleted. Staff, services, branches, chairs, discounts and logins are never deleted.</p>
    ${[['sales', 'Sales and activity: tickets, payments, shifts, cash, Z-readings, attendance, payroll'], ['bookings', 'Bookings'], ['reviews', 'Reviews'], ['customers', 'Customer directory and email log']].map(([k, l]) => `<label class="chk" style="display:flex;gap:10px;align-items:center;text-transform:none;letter-spacing:0;font-size:14px;color:var(--text);font-weight:500"><input type="checkbox" id="rs-${k}" style="width:20px;height:20px;accent-color:#000">${l}</label>`).join('')}
    <label>Type RESET to confirm</label><div class="row" style="flex-wrap:nowrap"><input id="rs-confirm" placeholder="RESET" style="max-width:200px"><button class="btn bad" data-act="resetdata">Reset selected data</button></div></div>` : ''}`;
}
function vReviews() {
  const rows = ui.reviews, stars = n => '★'.repeat(n) + '☆'.repeat(5 - n);
  return `<h2>Reviews</h2><div class="grid">${S.branches.map(b => { const x = rows.filter(r => r.branchId === b.id); return `<div class="card stat"><span>${esc(b.name)}</span><b>${x.length ? (x.reduce((s, r) => s + r.rating, 0) / x.length).toFixed(1) + ' ★' : '—'}</b><small>${x.length} review${x.length === 1 ? '' : 's'}</small></div>`; }).join('')}</div>
  <p class="mute" style="margin:-6px 0 14px;font-size:13px">These appear on the public booking page. Delete anything inappropriate.</p>
  <div class="card overflow"><table><tr><th>Date</th><th>Branch</th><th>Barber</th><th>Rating</th><th>Customer</th><th>Comment</th><th></th></tr>
  ${rows.map(r => `<tr><td>${new Date(r.createdAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</td><td>${esc(r.branchName)}</td><td>${esc(r.staffName) || '<span class="mute">—</span>'}</td><td style="color:#c58a00;letter-spacing:1px">${stars(r.rating)}</td><td>${esc(r.name)}</td><td style="white-space:normal;min-width:240px">${esc(r.text)}</td><td><button class="btn bad sm" data-act="delreview" data-id="${r.id}">Delete</button></td></tr>`).join('') || '<tr><td colspan="7" class="mute">No reviews yet.</td></tr>'}</table></div>`;
}
function form(kind, id) {
  const m = M[kind] || { form: () => [['name', 'Full name', 'text'], ['phone', 'Mobile number', 'text', { req: false, hint: 'a phone number or an email is required' }], ['email', 'Email', 'email', { req: false }], ['preferredCut', 'Preferred haircut', 'text', { req: false }], ['notes', 'Notes', 'textarea', { req: false }], ['consent', 'Email and promos', 'select', { opts: [[0, 'Did not agree'], [1, 'Agreed (Terms & Conditions)']] }]] };
  const o = id ? (kind === 'customers' ? ui.cust.rows.find(x => x.id === id) : m.rows().find(x => x.id === id)) : {};
  const input = ([n, l, t, x = {}]) => {
    const val = n === 'password' ? '' : (o[n] ?? x.def ?? '');
    const req = x.req === false ? '' : 'required';
    const ctl = t === 'photo' ? `<div class="photo"><div class="pv" id="pv">${val ? `<img src="${esc(val)}" alt="">` : 'No photo'}</div><div style="flex:1"><input type="file" accept="image/*" data-photo="${n}" style="padding:8px"><input type="hidden" name="${n}" value="${esc(val)}"><p class="mute" id="phmsg" style="margin:6px 0 0;font-size:12px">JPG or PNG. It is resized automatically.</p></div></div>`
      : t === 'textarea' ? `<textarea name="${n}">${esc(val)}</textarea>`
      : t === 'select' ? `<select name="${n}">${x.opts.map(([v, lab]) => `<option value="${esc(v)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(lab)}</option>`).join('')}</select>`
        : `<input name="${n}" type="${t}" value="${esc(val)}" ${req} ${t === 'number' ? 'step="any"' : ''} ${t === 'password' ? 'autocomplete="new-password"' : ''}>`;
    return `<label>${l}${x.hint ? ` <span class="mute">(${x.hint})</span>` : ''}</label>${ctl}`;
  };
  openModal(`<h2>${id ? 'Edit' : 'New'}</h2><form data-form="${kind}" data-id="${id || ''}">${m.form().map(input).join('')}<p id="err" style="color:var(--bad)"></p><div class="row"><button class="btn">Save</button><button type="button" class="btn ghost" data-act="close">Cancel</button></div></form>`);
}
const thumb = r => r.photo ? `<img class="th ${(r.type || r.openTime) ? 'sq' : ''}" src="${esc(r.photo)}" alt="" loading="lazy">` : `<span class="th ${(r.type || r.openTime) ? 'sq' : ''}">${esc(String(r.name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase())}</span>`;
async function resizeToJpeg(file, max = 640) {
  const bmp = await createImageBitmap(file), s = Math.min(1, max / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.82);
}
function vBookings() {
  const link = location.origin + '/book';
  const rows = ui.bk;
  return `<div class="card" style="margin-bottom:14px"><div class="row between"><div><h3 style="margin:0 0 4px">Online booking link</h3><b style="font-size:16px">${esc(link)}</b><div class="mute" style="font-size:12px">Give this link to customers (Facebook, Messenger, QR code). Each booking goes straight to that branch's POS.</div></div>
    <div class="row"><button class="btn" data-act="copylink">Copy link</button><a class="btn ghost" href="/book" target="_blank" style="text-decoration:none">Open</a></div></div></div>
  ${rangeBar('b')}
  <div class="card overflow"><table><tr><th>Date</th><th>Time</th><th>Customer</th><th>Phone</th><th>Services</th><th>Barber</th><th>Branch</th><th>Source</th><th>Status</th><th></th></tr>
  ${rows.map(b => `<tr><td>${esc(b.date)}</td><td>${esc(b.time)}</td><td>${esc(b.customerName)}</td><td>${esc(b.phone)}</td><td>${b.items.map(i => esc(i.name)).join(', ')}</td><td>${thumb({ photo: b.staffPhoto, name: b.staffName })} ${esc(b.staffName)}</td><td>${esc(b.branchName)}</td><td>${b.source === 'online' ? 'Online' : 'Phone/POS'}</td>
    <td><span class="tag ${b.status === 'booked' ? 'booked' : b.status === 'arrived' ? 'done' : ''}">${esc(b.status)}</span></td><td>${b.status === 'booked' ? `<button class="btn bad sm" data-act="bkcancel" data-id="${b.id}">Cancel</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="10" class="mute">No bookings in this period.</td></tr>'}</table></div>`;
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
  if (act === 'del') { if (confirm('Are you sure?')) mut(async () => { const r = await api('DELETE', `/api/${d.kind}/${d.id}`); if (r.deactivated) alert('This record has history, so it was deactivated instead of deleted.'); }); return; }
  if (act === 'preset') { const [a, b] = presetRange(d.p); if (d.w === 'r') { ui.rp = d.p; if (d.p !== 'custom') { ui.from = a; ui.to = b; } } else { ui.bp = d.p; if (d.p !== 'custom') { ui.bf = a; ui.bt = b; } } await loadView(); return render(); }
  if (act === 'export') return download(`/api/reports/${d.name}?${qs()}&format=csv`, `${d.name}-${ui.from}_${ui.to}.csv`);
  if (act === 'delreview') { if (confirm('Delete this review? It will disappear from the booking site.')) mut(async () => { await api('DELETE', `/api/reviews/${d.id}`); await loadView(); }); return; }
  if (act === 'resetuser') {
    const u = S.users.find(x => x.id === d.id); if (!u || !confirm(`Reset the ${u.role === 'admin' ? 'password' : 'PIN'} of ${u.name}? Their current sign-in stops working immediately.`)) return;
    try { const r = await api('POST', `/api/users/${d.id}/reset`); openModal(`<h2>New ${r.pin ? 'PIN' : 'password'}</h2><p>For <b>${esc(u.name)}</b>. Write it down and give it to them now. It will not be shown again.</p><div style="font:700 34px Oswald,sans-serif;letter-spacing:6px;text-align:center;background:var(--s3);border-radius:14px;padding:16px;margin:10px 0 18px">${esc(r.pin || r.password)}</div><button class="btn" data-act="close">Done</button>`); } catch (x) { alert(x.message); }
    return;
  }
  if (act === 'savebinfo' || act === 'rmbphoto') {
    const v = k => document.getElementById(`bi-${d.id}-${k}`).value.trim(), body = { phone: v('phone'), address: v('address'), mapUrl: v('map'), googlePlaceId: v('gpid'), googleUrl: v('gurl') };
    if (act === 'rmbphoto') { if (!confirm('Remove this branch picture?')) return; body.photo = ''; } else if (ui.bphoto && ui.bphoto[d.id]) body.photo = ui.bphoto[d.id];
    try { await api('PUT', `/api/branches/${d.id}`, body); if (ui.bphoto) delete ui.bphoto[d.id]; await load(false); await loadView(); render(); alert(act === 'rmbphoto' ? 'Picture removed.' : 'Saved. The booking site now shows these details.'); } catch (x) { alert(x.message); }
    return;
  }
  if (act === 'savebranch') {
    const v = k => document.getElementById(`bs-${d.id}-${k}`).value, body = { openTime: v('open'), closeTime: v('close'), graceMins: +v('grace') || 0 }; if (v('pct') !== '') body.defaultPct = +v('pct');
    try { await api('PUT', `/api/branches/${d.id}`, body); await load(false); await loadView(); render(); alert('Saved.'); } catch (x) { alert(x.message); } return;
  }
  if (act === 'applycomm') {
    const raw = document.getElementById(`bs-${d.id}-pct`).value, b = S.branches.find(x => x.id === d.id), n = S.staff.filter(s => s.branchId === d.id).length;
    if (raw === '') return alert('Type the commission % first.');
    if (!confirm(`Set the commission of all ${n} barber${n === 1 ? '' : 's'} in ${b.name} to ${raw}%?`)) return;
    try { const r = await api('POST', `/api/branches/${d.id}/apply-commission`, { pct: +raw }); await load(false); await loadView(); render(); alert(`Updated ${r.updated} barber${r.updated === 1 ? '' : 's'}.`); } catch (x) { alert(x.message); } return;
  }
  if (act === 'saveaccess') {
    const perms = { cashier: [], barber: [] }; document.querySelectorAll('[data-perm]').forEach(c => { if (c.checked) { const [r, m] = c.dataset.perm.split(':'); perms[r].push(m); } });
    try { await api('PUT', '/api/settings', { perms }); await loadView(); render(); alert('Access saved.'); } catch (x) { alert(x.message); } return;
  }
  if (act === 'resetdata') {
    const g = k => document.getElementById('rs-' + k).checked, body = { confirm: document.getElementById('rs-confirm').value.trim(), sales: g('sales'), bookings: g('bookings'), reviews: g('reviews'), customers: g('customers') };
    if (!body.sales && !body.bookings && !body.reviews && !body.customers) return alert('Choose what to reset first.');
    if (body.confirm !== 'RESET') return alert('Type RESET (in capital letters) to confirm.');
    if (!confirm('This permanently deletes the selected data. A backup is saved first. Continue?')) return;
    try { const r = await api('POST', '/api/settings/reset', body); await load(); alert('Done. A backup was saved on the server (' + r.backup + ').\n' + Object.entries(r.deleted).map(([k, v]) => `${k}: ${v}`).join('\n')); } catch (x) { alert(x.message); } return;
  }
  if (act === 'saveterms') { const v = document.getElementById('termsta').value; try { await api('PUT', '/api/settings', { terms: v }); alert('Terms & Conditions saved.'); await loadView(); render(); } catch (x) { alert(x.message); } return; }
  if (act === 'resetterms') { if (confirm('Restore the default Terms?')) { try { await api('PUT', '/api/settings', { terms: '' }); await loadView(); render(); } catch (x) { alert(x.message); } } return; }
  if (act === 'testmail') { const to = document.getElementById('testto').value.trim(); try { await api('POST', '/api/settings/test-email', { to }); alert('Test email sent to ' + to + '. Check the inbox (and spam).'); await loadView(); render(); } catch (x) { alert(x.message); } return; }
  if (act === 'copylink') { try { await navigator.clipboard.writeText(location.origin + '/book'); alert('Link copied!'); } catch (x) { prompt('Copy this link:', location.origin + '/book'); } return; }
  if (act === 'bkcancel') { if (confirm('Cancel this booking?')) mut(() => api('PUT', `/api/bookings/${d.id}`, { status: 'cancelled' })); return; }
  if (act === 'backup') return download('/api/backup', `brotherhood-${today()}.db`);
  if (act === 'page') { ui.cust.page += +d.n; await loadView(); return render(); }
  if (act === 'paid') {
    if (!confirm(`Mark ${ui.picked.size} barber(s) as paid (all unpaid days up to ${ui.to})?`)) return;
    mut(() => api('POST', '/api/payroll/pay', { staffIds: [...ui.picked], to: ui.to })).then(() => ui.picked.clear());
  }
});
document.addEventListener('change', async e => {
  const t = e.target;
  if (t.id === 'branchsel') { ui.branch = t.value; render(); await loadView(); return render(); }
  if (t.id === 'tierf') { ui.cust.tier = t.value; ui.cust.page = 1; await loadView(); return render(); }
  if (t.id === 'bfrom' || t.id === 'bto') { if (t.id === 'bfrom') ui.bf = t.value || today(); else ui.bt = t.value || today(); await loadView(); return render(); }
  if (t.dataset.bphoto) {
    const file = t.files[0]; if (!file) return; const id = t.dataset.bphoto, msg = document.getElementById('bm-' + id); msg.textContent = 'Uploading…';
    try {
      const r = await api('POST', '/api/upload', { data: await resizeToJpeg(file, 1100) }); (ui.bphoto ||= {})[id] = r.url;
      document.getElementById('bp-' + id).innerHTML = `<img src="${r.url}" alt="">`; msg.textContent = 'Uploaded. Click Save to show it on the booking site.';
    } catch (x) { msg.textContent = x.message; }
    return;
  }
  if (t.dataset.photo) {
    const file = t.files[0]; if (!file) return; const msg = document.getElementById('phmsg'); msg.textContent = 'Uploading…';
    try {
      const r = await api('POST', '/api/upload', { data: await resizeToJpeg(file) });
      t.parentElement.querySelector('input[type=hidden]').value = r.url; document.getElementById('pv').innerHTML = `<img src="${r.url}" alt="">`; msg.textContent = 'Uploaded. Click Save.';
    } catch (x) { msg.textContent = x.message; }
    return;
  }
  if (t.id === 'rfrom' || t.id === 'rto') { if (t.id === 'rfrom') ui.from = t.value || today(); else ui.to = t.value || today(); await loadView(); return render(); }
  if (t.dataset.pick) { t.checked ? ui.picked.add(t.dataset.pick) : ui.picked.delete(t.dataset.pick); return render(); }
  if (t.id === 'csvfile' && t.files[0]) {
    const rows = parseCSV(await t.files[0].text()); if (rows.length < 2) return alert('The CSV is empty.');
    const head = rows[0].map(h => h.trim().toLowerCase()), idx = k => head.findIndex(h => h.includes(k));
    const ni = idx('name'), pi = idx('phone') >= 0 ? idx('phone') : idx('mobile'), ei = idx('email'), hi = idx('haircut') >= 0 ? idx('haircut') : idx('preferred');
    if (ni < 0) return alert('The first row of the CSV needs a "name" column (plus phone and/or email; optional: haircut).');
    const data = rows.slice(1).map(r => ({ name: r[ni], phone: pi >= 0 ? r[pi] : '', email: ei >= 0 ? r[ei] : '', preferredCut: hi >= 0 ? r[hi] : '' }));
    const brId = ui.branch !== 'all' ? ui.branch : '';
    if (!confirm(`Import ${data.length} customers${brId ? ' into ' + brName(brId) : ''}? Only rows with a phone number or email are added.`)) return;
    try { const r = await api('POST', '/api/customers/import', { rows: data, branchId: brId }); alert(`${r.added} added, ${r.skipped} skipped (duplicates, or no phone number / email).`); await load(); } catch (x) { alert(x.message); }
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
  for (const [k, v] of fd.entries()) { if (k === 'password' && !v) continue; o[k] = ['price', 'mins', 'pct', 'allowance', 'active', 'value', 'sort', 'graceMins', 'defaultPct', 'bookable', 'apptOnly', 'consent'].includes(k) ? +v : v; }
  run(() => id ? api('PUT', `/api/${kind}/${id}`, o) : api('POST', `/api/${kind}`, o), err);
});

load().then(() => setInterval(() => { if (loggedIn && !modal.open && ui.view === 'dashboard' && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) load(); }, 15000));
render();
