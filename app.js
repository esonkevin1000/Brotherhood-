// Brotherhood — admin back office (reports + management). The Brotherhood app (front desk and barbers) talks to the same API.
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
// partner shops log in with their shop code; Brotherhood leaves it blank
let orgCode = ''; try { orgCode = localStorage.getItem('bp.org') || ''; } catch (e) { }
const masterToken = () => { try { return localStorage.getItem('bp.master') || ''; } catch (e) { return ''; } };
let loggedIn = false, loadErr = '';
const ui = { navQ: '', pg: {}, view: 'dashboard', branch: 'all', from: today(), to: today(), rep: null, live: null, audit: [], bk: [], bf: today(), bt: addDays(today(), 7), cust: { q: '', page: 1, rows: [], total: 0, tier: '' }, settings: null, rp: 'today', reviews: [], picked: new Set(), navClosed: new Set((() => { try { return JSON.parse(localStorage.getItem('navClosed') || '[]'); } catch { return []; } })()) };
const modal = document.getElementById('modal');
const openModal = h => { modal.innerHTML = h; if (!modal.open) modal.showModal(); };
const closeModal = () => modal.close();

async function api(method, url, body) {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(!token && orgCode && (url === '/api/login' || url === '/api/public/login-hint') ? { 'x-org': orgCode } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && url !== '/api/login') { loggedIn = false; token = ''; render(); throw new Error(j.error || 'Login required'); }
  if (!r.ok) throw new Error(j.error || 'Request failed');
  return j;
}
const qs = () => `from=${ui.from}&to=${ui.to}&branch=${ui.branch}`;
async function loadView() {
  const v = ui.view;
  try {
    if (v === 'dashboard') { api('GET', `/api/checklists?from=${today()}&to=${today()}&branch=${ui.branch}`).then(r => { ui.chkToday = r; if (ui.view === 'dashboard' && !modal.open) render(); }).catch(() => { }); [ui.live, ui.rep] = await Promise.all([api('GET', `/api/live?branch=${ui.branch}`), api('GET', `/api/reports/dashboard?branch=${ui.branch}`)]); }
    else if (v.startsWith('rep:')) ui.rep = await api('GET', `/api/reports/${v.slice(4)}?${qs()}`);
    else if (v === 'mgmt:customers') { const c = ui.cust; Object.assign(c, await api('GET', `/api/customers?q=${encodeURIComponent(c.q)}&page=${c.page}&tier=${c.tier}&branch=${ui.branch}`)); }
    else if (v === 'leave') ui.leave = await api('GET', `/api/leaves?branch=${ui.branch}&status=${ui.lstatus || ''}`);
    else if (v === 'chk') { [ui.chk, ui.chkTpl] = await Promise.all([api('GET', `/api/checklists?${qs()}`), api('GET', '/api/checklists/template')]); }
    else if (v === 'slip') { [ui.slip, ui.adj] = await Promise.all([api('GET', `/api/payslips?${qs()}`), api('GET', '/api/adjustments')]); }
    else if (v === 'prob') ui.prob = await api('GET', `/api/problems?branch=${ui.branch}&status=${ui.pstatus || ''}`);
    else if (v === 'att') ui.att = await api('GET', `/api/attendance/log?${qs()}&flagged=${ui.aflag ? 1 : 0}`);
    else if (v === 'sched') [ui.sched, ui.svcs] = ui.branch === 'all' ? [null, null] : await Promise.all([api('GET', `/api/schedules?branch=${ui.branch}`), api('GET', `/api/staff-services?branch=${ui.branch}`)]);
    else if (v === 'adv') ui.adv = await api('GET', `/api/advances?branch=${ui.branch}&status=${ui.astatus || ''}`);
    else if (v === 'exp') ui.exp = await api('GET', `/api/expense-claims?${qs()}&status=${ui.estatus || ''}&category=${encodeURIComponent(ui.ecat || '')}`);
    else if (v === 'remit') ui.remit = await api('GET', `/api/remittances?${qs()}&status=${ui.rstatus || ''}`);
    else if (v === 'activity') ui.audit = await api('GET', '/api/audit');
    else if (v === 'settings') { ui.settings = await api('GET', '/api/settings'); ui.devices = await api('GET', '/api/devices').catch(() => []); ui.orgs = S.me?.role === 'owner' && !S.org ? await api('GET', '/api/orgs').catch(() => []) : null; ui.plans = ui.orgs ? await api('GET', '/api/orgs/plans').catch(() => null) : null; }
    else if (v === 'reviews') ui.reviews = await api('GET', '/api/reviews');
    else if (v === 'mkt') ui.mkt = await api('GET', '/api/marketing');
    else if (v === 'bookings') ui.bk = await api('GET', `/api/bookings?${qs()}`);
  } catch (e) { if (loggedIn) alert(e.message); }
}
async function load(viewToo = true) {
  try { S = await api('GET', '/api/state'); loggedIn = true; loadErr = '';
    if (isMgr()) { if (!S.branches.some(b => b.id === ui.branch)) ui.branch = S.branches[0]?.id || 'all'; if (MANAGER_HIDE.has(ui.view)) ui.view = 'dashboard'; } if (viewToo && S.me?.role !== 'cashier') await loadView(); }
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
const isMgr = () => S.me?.role === 'manager';
// pages a branch manager does not get: shop-wide settings, prices, marketing, reviews, barbers, chairs, branches, equipment
const MANAGER_HIDE = new Set(['reviews', 'mkt', 'mgmt:items', 'mgmt:categories', 'mgmt:discounts', 'mgmt:staff', 'mgmt:equipment', 'mgmt:branches', 'mgmt:chairs', 'settings', 'activity']);
const brName = id => S.branches.find(b => b.id === id)?.name || '';
const chName = id => { const c = S.chairs.find(x => x.id === id); return c ? `${brName(c.branchId)} · ${c.name}` : ''; };
const catName = id => S.categories.find(c => c.id === id)?.name || '';
const fmtVal = (v, t) => t === 'days' ? '<a href="#" data-act="paydays" data-id="' + esc(String(v).split('~')[1]) + '">' + esc(String(v).split('~')[0]) + ' · View days</a>' : t === 'idlink' ? (v ? (String(v) === 'MISSING' ? '<b style="color:var(--bad)">MISSING</b>' : '<a href="#" data-act="viewid" data-id="' + esc(String(v).split('~')[1]) + '">' + esc(String(v).split('~')[0]) + ' · View ID</a>') : '') : t === 'peso' ? peso(v) : t === 'num' ? Number(v).toLocaleString('en-PH') : esc(v);

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
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>', logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>'
};
const ic = n => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;
const REPORTS = [['sales', 'Sales Reports', 'coin'], ['items', 'Item Ranking', 'chart'], ['commissions', 'Commissions', 'tag'], ['payroll', 'Payroll', 'wallet'], ['attendance', 'Barber Attendance', 'clock'], ['tender', 'Payment Methods', 'card'], ['discounts', 'Discount Reports', 'tag'], ['cash', 'Cash Management', 'wallet'], ['readings', 'Sales Readings', 'doc'], ['scorecard', 'Barber Scorecard', 'star'], ['accountability', 'Cash Accountability', 'coin']];
const MGMT = [['staff', 'Barbers / Staff', 'scissors'], ['chairs', 'Chairs', 'armchair'], ['categories', 'Categories', 'folder'], ['items', 'Services & Products', 'bottle'], ['discounts', 'Discounts', 'tag'], ['customers', 'Customers', 'users'], ['users', 'Users', 'key'], ['branches', 'Branches', 'building'], ['equipment', 'Equipment & Maintenance', 'gear']];const title = () => ui.view === 'dashboard' ? 'Dashboard' : ui.view === 'mkt' ? 'Email Marketing' : ui.view === 'reviews' ? 'Reviews' : ui.view === 'settings' ? 'Settings' : ui.view === 'bookings' ? 'Bookings' : ui.view === 'activity' ? 'Activity' : ui.view === 'remit' ? 'Daily Sales Remittance' : ui.view === 'exp' ? 'Expenses & Receipts' : ui.view === 'adv' ? 'Release Pay' : ui.view === 'att' ? 'Attendance & Timekeeping' : ui.view === 'prob' ? 'Problem Reports' : ui.view === 'leave' ? 'Leave Requests' : ui.view === 'chk' ? 'Daily Checklists' : ui.view === 'slip' ? 'Payslips' : ui.view === 'inbox' ? 'Inbox' : ui.view.startsWith('rep:') ? REPORTS.find(r => r[0] === ui.view.slice(4))[1] : MGMT.find(m => m[0] === ui.view.slice(5))[1];

const inboxOpts = () => ({ token: () => token, isAdmin: true, meId: S.me ? S.me.id : 'owner' });
const render = (() => { const base = renderBase; return function () { base(); const h = document.getElementById('inbox-host'); if (h && window.Inbox && loggedIn) Inbox.mount(h, inboxOpts()); }; })();
function renderBase() {
  const nav = document.getElementById('nav'), view = document.getElementById('view');
  document.getElementById('mtop').hidden = true;
  if (!loggedIn) {
    nav.style.display = 'none';
    view.innerHTML = `<div class="online card"><img class="logo" src="/logo.png?v=b" alt=""><h2>${esc(S.shop)}</h2><p class="mute" style="text-align:center;margin:-6px 0 6px">Back office login</p><form data-form="login">
      <label>Username ${ui.ownerNamed ? '' : '<span class="mute">(owner: leave blank)</span>'}</label><input name="username" autocapitalize="none" autocomplete="username">
      <label>Password</label><input type="password" name="password" autocomplete="current-password" required>
      <label>Shop code <span class="mute">(partner shops only)</span></label><input name="org" autocapitalize="none" autocomplete="organization" value="${esc(orgCode)}" placeholder="Leave blank for Brotherhood">
      <p id="err" style="color:var(--bad);min-height:20px">${esc(loadErr === 'Login required' ? '' : loadErr)}</p><button class="btn" style="width:100%;justify-content:center;padding:12px">Login</button></form></div>`;
    return;
  }
  if (S.me.role === 'cashier') {
    nav.style.display = 'none';
    view.innerHTML = `<div class="online card"><h2>Cashier account</h2><p>You are signed in as <b>${esc(S.me.name)}</b>. This back office is for admins. Use the Brotherhood app instead: <a href="/member#/pro">open Pro tools</a> (Today and Tools).</p><button class="btn" data-act="logout">Logout</button></div>`;
    return;
  }
  nav.style.display = '';
  const on = k => ui.view === k ? 'on' : '';
  nav.innerHTML = `<div class="brand"><img src="/logo.png?v=b" alt=""><div><h1>${esc(S.shop)}</h1><small>Back office · ${esc(S.me.name)}</small></div></div>
    <button data-act="bell" style="background:${ui.notif && ui.notif.total ? '#fff1f2' : ''};color:${ui.notif && ui.notif.total ? '#e5384a' : ''};font-weight:700">🔔 Notifications${ui.notif && ui.notif.total ? ` <span class="tag" style="color:#fff;background:#e5384a;margin-left:auto">${ui.notif.total}</span>` : ''}</button>
    <input id="navq" type="search" placeholder="Search pages…" autocomplete="off" value="${esc(ui.navQ || '')}">
    <div id="navgroups">${navGroups(on)}</div>
    <button data-act="logout" style="margin-top:auto;color:var(--bad)">${ic('logout')}Logout</button>`;
  document.getElementById('mtop').hidden = false; document.getElementById('mtitle').textContent = (nav.querySelector('button.on')?.textContent || S.shop).replace(/\s+\d+$/, '').trim(); const mb = document.getElementById('mbell'); if (mb) { mb.textContent = ui.notif && ui.notif.total ? '🔔 ' + ui.notif.total : '🔔'; mb.style.color = ui.notif && ui.notif.total ? '#e5384a' : ''; }
  view.innerHTML = secretBar() + orgBar() + branchBar() + (ui.view === 'dashboard' ? vDashboard() : ui.view === 'bookings' ? vBookings() : ui.view === 'settings' ? vSettings() : ui.view === 'mkt' ? vMkt() : ui.view === 'reviews' ? vReviews() : ui.view === 'remit' ? vRemit() : ui.view === 'exp' ? vExp() : ui.view === 'adv' ? vAdv() : ui.view === 'sched' ? vSched() : ui.view === 'att' ? vAtt() : ui.view === 'prob' ? vProb() : ui.view === 'leave' ? vLeave() : ui.view === 'chk' ? vChk() : ui.view === 'slip' ? vSlip() : ui.view === 'inbox' ? vInbox() : ui.view === 'activity' ? vActivity() : ui.view.startsWith('rep:') ? vReport() : vMgmt(ui.view.slice(5)));
  paginateTables();
}
// Branch picker shown at the top of every page (not only in the side menu), so it is one tap on phones too
const DATE_VIEWS = ['bookings', 'chk', 'slip', 'att', 'exp', 'remit'];
function branchBar() {
  if (['settings', 'activity', 'inbox', 'mkt'].includes(ui.view)) return '';
  const dated = DATE_VIEWS.includes(ui.view) || ui.view.startsWith('rep:');
  const date = dated ? `<label for="dpreset" style="margin-left:8px">Date</label><select id="dpreset">${PRESETS.map(([k, l]) => `<option value="${k}" ${ui.rp === k ? 'selected' : ''}>${l}</option>`).join('')}</select>${ui.rp === 'custom' ? `<input type="date" id="rfrom" value="${ui.from}"><span class="mute">to</span><input type="date" id="rto" value="${ui.to}">` : `<span class="mute">${ui.rp === 'all' ? 'Everything' : ui.from === ui.to ? ui.from : ui.from + ' → ' + ui.to}</span>`}` : '';
  return `<div class="pagebar"><label for="branchsel2">Branch</label><select id="branchsel2">${isMgr() ? '' : '<option value="all">All branches</option>'}${S.branches.map(b => `<option value="${b.id}" ${ui.branch === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>${date}</div>`;
}

// ---------- long tables, page by page ----------
// Every table in the back office with more than 15 rows is shown in pages (15 / 30 / 50 / 100 per page). It works on the finished screen, so each list gets it without extra code.
function paginateTables() {
  document.querySelectorAll('#view .pager').forEach(p => p.remove());
  document.querySelectorAll('#view table').forEach((tb, idx) => {
    if (tb.hasAttribute('data-nopg')) return;
    const rows = [...tb.querySelectorAll('tr')].filter(r => !r.querySelector('th')), key = ui.view + '#' + idx;
    const st = ui.pg[key] ||= { p: 1, n: 15 }, total = rows.length;
    if (total <= 15 && st.n === 15) { rows.forEach(r => { r.style.display = ''; }); return; }
    const pages = Math.max(1, Math.ceil(total / st.n)); if (st.p > pages) st.p = pages; const from = (st.p - 1) * st.n, to = Math.min(total, from + st.n);
    rows.forEach((r, i) => { r.style.display = i >= from && i < to ? '' : 'none'; });
    if (total <= 15) { return; }
    const bar = document.createElement('div'); bar.className = 'pager';
    bar.innerHTML = `<span class="mute">Showing ${from + 1}–${to} of ${total}</span><div class="pgb"><button class="btn ghost sm" data-pgk="${key}" data-pgd="-1" ${st.p <= 1 ? 'disabled' : ''}>‹ Prev</button><span>Page ${st.p} of ${pages}</span><button class="btn ghost sm" data-pgk="${key}" data-pgd="1" ${st.p >= pages ? 'disabled' : ''}>Next ›</button></div><select data-pgn="${key}" aria-label="Rows per page">${[15, 30, 50, 100].map(n => `<option value="${n}" ${st.n === n ? 'selected' : ''}>${n} per page</option>`).join('')}</select>`;
    tb.parentNode.insertBefore(bar, tb.nextSibling);
  });
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
const PRESETS = [['today', 'Today'], ['week', 'This week'], ['month', 'This month'], ['all', 'All time'], ['custom', 'Custom range']];
function presetRange(p) {
  const t = today(), d = new Date(t + 'T00:00');
  if (p === 'today') return [t, t];
  if (p === 'week') { const s = addDays(t, -((d.getDay() + 6) % 7)); return [s, addDays(s, 6)]; }                // Monday to Sunday
  if (p === 'month') return [t.slice(0, 8) + '01', dstr(new Date(d.getFullYear(), d.getMonth() + 1, 0))];
  return ['2000-01-01', '2099-12-31'];
}

// The date range now lives in the bar at the top of the page (see pageBar); pages only keep their own extra buttons/filters here
const filterBar = extra => extra ? `<div class="row" style="margin-bottom:14px;align-items:flex-end">${extra}</div>` : '';
function vReport() {
  const name = ui.view.slice(4), r = ui.rep;
  const exp = `<button class="btn ghost sm" data-act="export" data-name="${name}">⬇ Export CSV</button>`;
  return `<h2>${title()} <span class="mute" style="font-size:14px">· ${ui.branch === 'all' ? 'All branches' : esc(brName(ui.branch))}</span></h2>${filterBar(exp)}${r ? renderCards(r.cards) + r.tables.map(renderTable).join('') : '<p class="mute">Loading…</p>'}`;
}
const NAVG = [
  ['Overview', [['dashboard', 'Dashboard', 'grid']]],
  ['Booking & Calendar', [['bookings', 'Bookings', 'calendar'], ['reviews', 'Reviews', 'star']]],
  ['Marketing', [['mkt', 'Email Marketing', 'mail']]],
  ['Sales & Services', [['rep:sales'], ['rep:tender'], ['rep:discounts'], ['mgmt:items'], ['mgmt:categories'], ['mgmt:discounts'], ['mgmt:customers']]],
  ['Attendance & Timekeeping', [['att', 'Attendance', 'clock'], ['rep:attendance']]],
  ['Release Pay & Payroll', [['adv', 'Release Pay', 'tag'], ['rep:payroll'], ['rep:commissions'], ['slip', 'Payslips', 'doc']]],
  ['Expenses & Receipts', [['exp', 'Expenses & Receipts', 'wallet']]],
  ['Daily Sales Remittance', [['remit', 'Daily Remittance', 'coin']]],
  ['Employees & Performance', [['mgmt:staff'], ['sched', 'Barber Hours', 'clock'], ['rep:scorecard'], ['leave', 'Leave Requests', 'calendar']]],
  ['Inbox & Communications', [['inbox', 'Inbox', 'users']]],
  ['Problem Reports', [['prob', 'Problem Reports', 'gear']]],
  ['Daily Checklists', [['chk', 'Checklists', 'doc']]],
  ['Maintenance', [['mgmt:equipment']]],
  ['Branch Management', [['mgmt:branches'], ['mgmt:chairs'], ['mgmt:users']]],
  ['Reports & Analytics', [['rep:items'], ['rep:accountability']]],
  ['Settings & Permissions', [['settings', 'Settings', 'gear'], ['activity', 'Activity', 'activity']]]
];
// ---------- notifications: red badges, the bell, a banner and desktop alerts ----------
const notifCount = v => (ui.notif && ui.notif.items.find(i => i.view === v) || {}).count || 0;
const badge = v => notifCount(v) ? ` <span class="tag" style="color:#fff;background:#e5384a;margin-left:auto">${notifCount(v)}</span>` : '';
function bellModal() {
  const n = ui.notif || { total: 0, items: [] };
  openModal(`<h2 style="margin-top:0">Notifications</h2>${n.items.length ? n.items.map(i => `<button class="btn ghost" style="width:100%;justify-content:space-between;margin-bottom:8px" data-view="${i.view}"><span>${i.count} ${esc(i.label)}</span><span class="tag" style="color:#fff;background:#e5384a">${i.count}</span></button>`).join('') : '<p class="mute">You are all caught up. Nothing needs your attention.</p>'}
    ${'Notification' in window && Notification.permission === 'default' ? '<button class="btn sm" data-act="allownotif" style="margin-top:6px">🔔 Also alert me on this device</button>' : ''}<br><br><button class="btn ghost" data-act="close">Close</button>`);
}
let notifPrev = -1;
async function pollNotif(first) {
  if (!loggedIn) return;
  try {
    const n = await api('GET', '/api/notifications'), was = notifPrev; ui.notif = n; ui.inUnread = (n.items.find(i => i.key === 'inbox') || {}).count || 0;
    document.title = (n.total ? '(' + n.total + ') ' : '') + 'Brotherhood';
    if (!first && was >= 0 && n.total > was) {
      const fresh = n.items.slice(0, 3).map(i => i.count + ' ' + i.label).join(' · ');
      const b = document.getElementById('notice') || Object.assign(document.body.appendChild(document.createElement('div')), { id: 'notice' });
      b.style.cssText = 'position:fixed;top:12px;right:12px;left:12px;max-width:420px;margin-left:auto;z-index:99999;background:#000;color:#fff;border-radius:14px;padding:12px 16px;box-shadow:0 12px 40px rgba(0,0,0,.4);cursor:pointer;font-weight:600';
      b.innerHTML = '🔔 You have new notifications<br><span style="font-weight:400;font-size:13px">' + esc(fresh) + '</span>'; b.onclick = () => { b.remove(); bellModal(); }; clearTimeout(b._t); b._t = setTimeout(() => b.remove(), 9000);
      if ('Notification' in window && Notification.permission === 'granted' && document.hidden) new Notification('Brotherhood: new notification', { body: fresh });
    }
    notifPrev = n.total; if (!modal.open && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName) && ui.view !== 'inbox') render();
  } catch (e) { }
}
function navGroups(on = k => (ui.view === k ? 'on' : '')) {
  const q = String(ui.navQ || '').trim().toLowerCase();
  const out = NAVG.map(([h, list]) => {
    const items = list.map(([v, l, i]) => {
      if (!l) { const k = v.slice(v.indexOf(':') + 1), r = (v.startsWith('rep:') ? REPORTS : MGMT).find(x => x[0] === k); if (!r) return null; l = r[1]; i = r[2]; }
      return { v, l, i };
    }).filter(Boolean).filter(x => !(isMgr() && MANAGER_HIDE.has(x.v)));
    const shown = q ? (h.toLowerCase().includes(q) ? items : items.filter(x => x.l.toLowerCase().includes(q))) : items;
    if (!shown.length) return '';
    const closed = !q && ui.navClosed.has(h), cnt = list.reduce((a, [v]) => a + (notifCount(v) || 0), 0);
    const body = shown.map(x => `<button class="${on(x.v)}" data-view="${x.v}" style="width:100%">${ic(x.i)}${x.l.replace('&', '&amp;')}${badge(x.v)}</button>`).join('');
    return `<div class="navh" data-grp="${esc(h)}"><span class="car">${closed ? '▸' : '▾'}</span>${h.replace('&', '&amp;')}${closed && cnt ? `<span class="tag" style="color:#fff;background:#e5384a;margin-left:auto">${cnt}</span>` : ''}</div>` + (closed ? '' : body);
  }).join('');
  return out || '<p class="mute" style="padding:8px 12px;font-size:13px">No page found. Try another word.</p>';
}
function vLeave() {
  const r = ui.leave, st = ui.lstatus || '';
  const tag = s => ({ PENDING: ['#b26a00', 'rgba(245,166,35,.16)'], APPROVED: ['var(--ok)', 'rgba(62,207,142,.13)'], REJECTED: ['var(--bad)', 'rgba(255,93,108,.13)'] }[s]);
  return `<h2>Leave Requests <span class="mute" style="font-size:14px">· ${ui.branch === 'all' ? 'All branches' : esc(brName(ui.branch))}</span></h2><div class="row" style="margin-bottom:14px"><select id="lstatus" style="width:auto"><option value="">All statuses</option>${['PENDING', 'APPROVED', 'REJECTED'].map(s => `<option ${st === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
  ${r ? `<div class="card overflow"><table><tr><th>Employee</th><th>Branch</th><th>Type</th><th>From</th><th>To</th><th>Reason</th><th>Filed by</th><th>Status</th><th></th></tr>
  ${r.rows.map(x => { const [c, bg] = tag(x.status); return `<tr><td><b>${esc(x.staffName)}</b></td><td>${esc(x.branchName)}</td><td>${esc(x.type)}</td><td>${esc(x.from_date)}</td><td>${esc(x.to_date)}</td><td style="white-space:normal;min-width:150px">${esc(x.reason)}</td><td>${esc(x.requestedBy)}</td><td><span class="tag" style="color:${c};background:${bg}">${x.status}</span>${x.reviewNote ? `<br><span class="mute" style="font-size:11px">${esc(x.reviewNote)}</span>` : ''}</td>
    <td>${x.status === 'PENDING' ? `<button class="btn sm" data-act="lvreview" data-a="approve" data-id="${x.id}">Approve</button> <button class="btn bad sm" data-act="lvreview" data-a="reject" data-id="${x.id}">Reject</button>` : ''}</td></tr>`; }).join('') || '<tr><td colspan="9" class="mute">No leave requests.</td></tr>'}</table></div>` : '<p class="mute">Loading…</p>'}`;
}
function vChk() {
  const r = ui.chk, t = ui.chkTpl;
  return `<h2>Daily Checklists <span class="mute" style="font-size:14px">· ${ui.branch === 'all' ? 'All branches' : esc(brName(ui.branch))}</span></h2>${filterBar('')}
  ${r ? `<div class="grid"><div class="card stat"><span>Submitted</span><b>${r.rows.length}</b></div><div class="card stat"><span>Not submitted</span><b style="color:${r.missing.length ? 'var(--bad)' : 'var(--ok)'}">${r.missing.length}</b></div></div>
  <div class="card overflow"><table><tr><th>Date</th><th>Branch</th><th>Checklist</th><th>Done</th><th>By</th><th>Not done / notes</th></tr>
  ${r.rows.map(x => `<tr><td>${esc(x.date)}</td><td>${esc(x.branchName)}</td><td style="text-transform:capitalize">${esc(x.kind)}</td><td><b style="color:${x.done === x.total ? 'var(--ok)' : '#b26a00'}">${x.done}/${x.total}</b></td><td>${esc(x.submittedBy)}</td><td style="white-space:normal;min-width:220px">${x.items.filter(i => !i.done).map(i => `<div>✗ ${esc(i.text)}<br><span class="mute" style="font-size:12px">${esc(i.note)}</span></div>`).join('') || '<span class="mute">All tasks done</span>'}</td></tr>`).join('') || '<tr><td colspan="6" class="mute">No checklists in this period.</td></tr>'}</table></div>
  ${r.missing.length ? `<div class="card overflow" style="margin-top:14px"><h3>Not submitted</h3><table><tr><th>Date</th><th>Branch</th><th>Checklist</th></tr>${r.missing.slice(0, 150).map(x => `<tr><td>${esc(x.date)}</td><td>${esc(x.branchName)}</td><td style="text-transform:capitalize">${esc(x.kind)}</td></tr>`).join('')}</table></div>` : ''}` : '<p class="mute">Loading…</p>'}
  ${t ? `<div class="card" style="margin-top:14px"><h3>Checklist tasks</h3><p class="mute" style="font-size:13px;margin:0 0 8px">One task per line. Cashiers see these every day.</p><div class="grid"><div><label>Opening</label><textarea id="chk-open" rows="7">${esc(t.opening.join('\n'))}</textarea></div><div><label>Closing</label><textarea id="chk-close" rows="7">${esc(t.closing.join('\n'))}</textarea></div></div><button class="btn sm" data-act="chksave">Save tasks</button></div>` : ''}`;
}
function payslipHtml(x) {
  const row = (l, v, b, c) => `<tr><td${c ? ` style="color:${c}"` : ''}>${l}</td><td style="text-align:right">${b ? '<b>' + v + '</b>' : v}</td></tr>`, hd = t => `<tr><td colspan="2" style="padding-top:12px"><b>${t}</b></td></tr>`;
  const adv = x.advanceItems, ded = x.deductionItems, cats = ['Cash advance', 'Partial salary release', 'Other authorized deduction'];
  return `<div style="text-align:center"><img src="/logo.png?v=b" width="76" style="border-radius:50%"><h2 style="margin:6px 0 0">BROTHERHOOD BARBER</h2><div>PAYSLIP</div></div><hr>
    <p><b>${esc(x.staffName)}</b><br>${esc(x.branchName)}<br>Pay period: ${esc(x.period)} (${x.days.length} day${x.days.length > 1 ? 's' : ''})<br>Paid on ${esc(x.paidAt.slice(0, 10))}</p>
    <table style="width:100%;border-collapse:collapse">
    ${hd('EARNINGS')}${x.dayItems.map(d => row('Commission · ' + esc(d.date), peso(d.commission))).join('')}${x.topup ? row('Daily allowance top-up', peso(x.topup)) : ''}${x.lunch ? row('Free lunch allowance', peso(x.lunch)) : ''}${x.earningItems.map(e => row(esc(e.kind) + ': ' + esc(e.note), peso(e.amount))).join('')}${row('GROSS EARNINGS', peso(x.gross), 1)}
    ${hd('DEDUCTIONS')}${adv.map(a => row(esc(a.label), '−' + peso(a.amount), 0, '#b00')).join('')}${ded.map(a => row(esc(a.label), '−' + peso(a.amount), 0, '#b00')).join('')}${!adv.length && !ded.length ? row('None', peso(0)) : ''}${row('TOTAL DEDUCTIONS', '−' + peso(x.totalDeductions), 1)}
    <tr><td colspan="2"><hr></td></tr>${row('NET SALARY', peso(x.net), 1)}</table>
    <p style="font-size:11px;color:#666;margin-top:20px">Prepared by ${esc(x.paidBy || '')}. Deductions were authorized in writing by the employee.</p>`;
}
function vSlip() {
  const r = ui.slip, adj = ui.adj;
  return `<h2>Payslips <span class="mute" style="font-size:14px">· ${ui.branch === 'all' ? 'All branches' : esc(brName(ui.branch))}</span></h2>${filterBar(`<button class="btn sm" data-act="addadj">＋ Bonus / incentive / other earning</button>`)}
  <p class="mute" style="font-size:13px">A payslip is created every time you mark a barber as paid in Payroll, and every one is kept here. Barbers can see their own in the POS app when their login is linked to their barber profile (Users).</p>
  ${adj && adj.rows.some(a => !a.payrollDate) ? `<div class="card" style="margin-bottom:14px"><h3>Waiting for the next payroll</h3>${adj.rows.filter(a => !a.payrollDate).map(a => `<div class="row" style="justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line)"><span><b>${esc(a.staffName)}</b> · ${esc(a.kind)} · ${esc(a.note)} <span class="mute">(${esc(a.date)})</span></span><span><b>${peso(a.amount)}</b> <button class="btn ghost sm" data-act="rmadj" data-id="${a.id}">Remove</button></span></div>`).join('')}</div>` : ''}
  ${r ? `<div class="card overflow"><table><tr><th>Paid on</th><th>Employee</th><th>Branch</th><th>Period</th><th>Commission</th><th>Top-up</th><th>Bonuses</th><th>Gross</th><th>Deductions</th><th>Net salary</th><th></th></tr>
  ${r.rows.map((x, i) => `<tr><td>${esc(x.paidAt.slice(0, 10))}</td><td><b>${esc(x.staffName)}</b></td><td>${esc(x.branchName)}</td><td>${esc(x.period)}</td><td>${peso(x.commission)}</td><td>${peso(x.topup + (x.lunch || 0))}</td><td>${peso(x.bonus)}</td><td>${peso(x.gross)}</td><td>${peso(x.totalDeductions)}</td><td><b>${peso(x.net)}</b></td><td><button class="btn ghost sm" data-act="slipview" data-i="${i}">View / print</button></td></tr>`).join('') || '<tr><td colspan="11" class="mute">No payroll paid in this period.</td></tr>'}</table></div>` : '<p class="mute">Loading…</p>'}`;
}
function vChkToday() {
  const c = ui.chkToday; if (!c) return '';
  const open = c.rows.flatMap(r => r.items.filter(i => !i.done).map(i => ({ br: r.branchName, kind: r.kind, text: i.text, note: i.note })));
  if (!c.missing.length && !open.length) return '<div class="card" style="margin-bottom:14px"><b style="color:var(--ok)">✔ All branch checklists are complete today.</b></div>';
  return `<div class="card" style="margin-bottom:14px;border-color:#f1d98a"><h3 style="color:#b26a00">Incomplete checklists today</h3>${c.missing.length ? `<p style="margin:0 0 6px"><b>Not submitted:</b> ${c.missing.map(m => esc(m.branchName) + ' (' + m.kind + ')').join(', ')}</p>` : ''}${open.length ? `<p style="margin:6px 0 2px"><b>Tasks not done:</b></p>${open.map(o => `<div style="padding:3px 0">✗ <b>${esc(o.br)}</b> · ${esc(o.kind)}: ${esc(o.text)} <span class="mute">${esc(o.note)}</span></div>`).join('')}` : ''}<button class="btn ghost sm" data-view="chk" style="margin-top:8px">Open checklists</button></div>`;
}
function vProb() {
  const r = ui.prob, st = ui.pstatus || '', FLOW = ['SUBMITTED', 'ACKNOWLEDGED', 'IN PROGRESS', 'RESOLVED', 'CLOSED'];
  const tag = s => ({ SUBMITTED: ['#b26a00', 'rgba(245,166,35,.16)'], ACKNOWLEDGED: ['#2b7de9', 'rgba(90,167,255,.13)'], 'IN PROGRESS': ['#7c4dff', 'rgba(181,140,255,.14)'], RESOLVED: ['var(--ok)', 'rgba(62,207,142,.13)'], CLOSED: ['#6b6b76', '#ececef'] }[s]);
  const pr = p => ({ Urgent: 'var(--bad)', High: '#b26a00' }[p] || 'inherit');
  const sel = `<select id="pstatus" style="width:auto"><option value="">All statuses</option>${FLOW.map(s => `<option ${st === s ? 'selected' : ''}>${s}</option>`).join('')}</select>`;
  return `<h2>Problem Reports <span class="mute" style="font-size:14px">· ${ui.branch === 'all' ? 'All branches' : esc(brName(ui.branch))}</span></h2><div class="row" style="margin-bottom:14px">${sel}</div>
  ${r ? `<div class="grid"><div class="card stat"><span>Open reports</span><b>${r.open}</b></div><div class="card stat"><span>Urgent / High</span><b style="color:var(--bad)">${r.rows.filter(x => ['Urgent', 'High'].includes(x.priority) && x.status !== 'CLOSED' && x.status !== 'RESOLVED').length}</b></div></div>
  <div class="card overflow"><table><tr><th>Date</th><th>Branch</th><th>Category</th><th>Priority</th><th>Description</th><th>Photos</th><th>By</th><th>Assigned</th><th>Status</th><th></th></tr>
  ${r.rows.map(x => { const [c, bg] = tag(x.status), nx = FLOW[FLOW.indexOf(x.status) + 1]; return `<tr><td>${esc(x.createdAt.slice(0, 10))}</td><td>${esc(x.branchName)}</td><td>${esc(x.category)}</td><td style="color:${pr(x.priority)};font-weight:700">${esc(x.priority)}</td><td style="white-space:normal;min-width:200px">${esc(x.description)}${x.comments.length ? `<br><span class="mute" style="font-size:11px">${x.comments.length} comment${x.comments.length > 1 ? 's' : ''}</span>` : ''}</td>
    <td>${x.photos.length ? `<a href="#" data-act="viewfiles" data-ids="${x.photos.join(',')}">${x.photos.length} photo${x.photos.length > 1 ? 's' : ''}</a>` : '—'}</td><td>${esc(x.submittedBy)}</td><td>${esc(x.assignedTo) || '—'}</td><td><span class="tag" style="color:${c};background:${bg}">${x.status}</span></td>
    <td style="white-space:normal;min-width:230px"><button class="btn ghost sm" data-act="probhist" data-id="${x.id}">Details</button> ${nx ? `<button class="btn sm" data-act="probnext" data-id="${x.id}" data-to="${nx}">${{ ACKNOWLEDGED: 'Acknowledge', 'IN PROGRESS': 'Start work', RESOLVED: 'Mark resolved', CLOSED: 'Close' }[nx]}</button>` : ''} <button class="btn ghost sm" data-act="probassign" data-id="${x.id}">Assign</button> <button class="btn ghost sm" data-act="probcomment" data-id="${x.id}">Comment</button></td></tr>`; }).join('') || '<tr><td colspan="10" class="mute">No problem reports.</td></tr>'}</table></div>` : '<p class="mute">Loading…</p>'}`;
}
function vInbox() { return '<h2>Inbox</h2><div id="inbox-host"></div>'; }
function vAtt() {
  const r = ui.att, fl = !!ui.aflag, hm = iso => iso ? new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }) : '—', mm = n => n ? (n >= 60 ? Math.floor(n / 60) + 'h ' + (n % 60) + 'm' : n + 'm') : '—';
  const extra = `<label class="chk" style="display:flex;gap:8px;align-items:center;text-transform:none;letter-spacing:0;font-size:14px;color:var(--text);font-weight:500;margin:0"><input type="checkbox" id="aflag" ${fl ? 'checked' : ''} style="width:20px;height:20px;accent-color:#000">Flagged only</label><button class="btn ghost sm" data-act="attcsv">⬇ Export CSV</button>`;
  return `<h2>Attendance &amp; Timekeeping <span class="mute" style="font-size:14px">· ${ui.branch === 'all' ? 'All branches' : esc(brName(ui.branch))}</span></h2>${filterBar(extra)}
  ${r ? `<div class="grid"><div class="card stat"><span>Records</span><b>${r.totals.records}</b></div><div class="card stat"><span>Late</span><b>${r.totals.late}</b><small class="mute">${mm(r.totals.lateMins)} total</small></div><div class="card stat"><span>Undertime</span><b>${mm(r.totals.undertimeMins)}</b></div><div class="card stat"><span>Overtime</span><b>${mm(r.totals.overtimeMins)}</b></div>
    <div class="card stat"><span>Flagged for review</span><b style="color:${r.totals.flagged ? 'var(--bad)' : 'var(--ok)'}">${r.totals.flagged}</b></div><div class="card stat"><span>Synced from offline</span><b>${r.totals.offline}</b></div><div class="card stat"><span>No time-in (absent)</span><b>${r.totals.absences}</b></div></div>
  <div class="card overflow"><table><tr><th>Date</th><th>Barber</th><th>Branch</th><th>Time in</th><th>Time out</th><th>Worked</th><th>Late</th><th>Undertime</th><th>Overtime</th><th>Selfies</th><th>Review</th><th></th></tr>
  ${r.rows.map(a => `<tr><td>${esc(a.date)}</td><td><b>${esc(a.staffName)}</b></td><td>${esc(a.branchName)}</td><td>${hm(a.timeIn)}${a.offline ? ' <span class="tag">offline</span>' : ''}${a.deviceIn && a.receivedIn ? `<br><span class="mute" style="font-size:11px">server got it ${hm(a.receivedIn)}</span>` : ''}</td><td>${hm(a.timeOut)}</td><td>${a.workedMins != null ? mm(a.workedMins) : '<span class="mute">on duty</span>'}</td>
    <td style="color:${a.lateMins ? 'var(--bad)' : ''}">${mm(a.lateMins)}</td><td>${mm(a.undertimeMins)}</td><td>${mm(a.overtimeMins)}</td>
    <td>${a.inPhoto ? `<a href="#" data-act="viewfiles" data-ids="${a.inPhoto}${a.outPhoto ? ',' + a.outPhoto : ''}">View${a.outPhoto ? ' in/out' : ''}</a>` : '<span class="mute">none</span>'}${a.geoIn ? `<br><a href="https://maps.google.com/?q=${a.geoIn.lat},${a.geoIn.lng}" target="_blank" rel="noopener" style="font-size:11px">📍 location</a>` : ''}</td>
    <td style="white-space:normal;min-width:170px">${a.flagged ? `<span class="tag" style="color:var(--bad);background:rgba(255,93,108,.13)">FLAGGED</span><br><span class="mute" style="font-size:11px">${esc(a.flagReason)}</span>` : ''}${a.corrected ? `<span class="tag">corrected</span> <a href="#" data-act="atthist" data-id="${a.id}" style="font-size:11px">history</a>` : ''}</td>
    <td><button class="btn ghost sm" data-act="attfix" data-id="${a.id}">Correct</button></td></tr>`).join('') || '<tr><td colspan="12" class="mute">No attendance records in this period.</td></tr>'}</table></div>
  ${r.absences.length ? `<div class="card overflow" style="margin-top:14px"><h3>No time-in recorded (possible absences)</h3><table><tr><th>Date</th><th>Barber</th><th>Branch</th></tr>${r.absences.slice(0, 200).map(x => `<tr><td>${esc(x.date)}</td><td>${esc(x.staffName)}</td><td>${esc(x.branchName)}</td></tr>`).join('')}</table></div>` : ''}` : '<p class="mute">Loading…</p>'}`;
}
// ---------- barber weekly hours (T13) ----------
const WDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function vSched() {
  const head = '<h2>Barber Hours</h2><p class="mute" style="font-size:13px;margin:-4px 0 12px">Set when each barber works. Leave a day empty to use the branch opening hours, tick Off for a day off, or enter a start and end time. Online booking follows these hours (and approved leave and blocked times) in branches on the new booking system (Settings).</p>';
  if (ui.branch === 'all') return head + '<div class="card">Pick a branch above.</div>';
  if (!ui.sched) return head + '<p class="mute">Loading…</p>';
  const cell = (d, wd) => { const off = d === 'off', c = d && d !== 'off' ? d : { start: '', end: '' };
    return `<td style="min-width:104px"><label style="display:flex;gap:6px;align-items:center;text-transform:none;letter-spacing:0;font-weight:500;margin:0 0 4px"><input type="checkbox" data-off data-wd="${wd}" ${off ? 'checked' : ''} style="width:16px;height:16px">Off</label><input type="time" data-a data-wd="${wd}" value="${esc(c.start)}" aria-label="${WDAYS[wd]} start" style="display:block;margin-bottom:4px;width:100px;min-width:0;padding:5px"><input type="time" data-z data-wd="${wd}" value="${esc(c.end)}" aria-label="${WDAYS[wd]} end" style="display:block;width:100px;min-width:0;padding:5px"></td>`; };
  return head + `<div class="card overflow"><div style="overflow-x:auto"><table><tr><th>Barber</th>${WDAYS.map(d => `<th>${d}</th>`).join('')}<th></th></tr>${ui.sched.map(r => `<tr data-sid="${esc(r.staffId)}"><td><b>${esc(r.name)}</b></td>${r.days.map(cell).join('')}<td style="white-space:nowrap"><button class="btn sm" data-act="schedsave" data-id="${esc(r.staffId)}">Save</button> <button class="btn ghost sm" data-act="schedclear" data-id="${esc(r.staffId)}">Branch hours</button></td></tr>`).join('') || '<tr><td colspan="9" class="mute">No barbers in this branch.</td></tr>'}</table></div></div>` + vSvcs();
}
// which services each barber does (T14): none ticked = every service
function vSvcs() {
  const svcs = S.items.filter(i => i.type === 'service' && i.active !== 0); if (!ui.svcs || !svcs.length) return '';
  return `<h3 style="margin-top:22px">Services each barber does</h3><p class="mute" style="font-size:13px;margin:-4px 0 10px">Leave all unticked if a barber does every service. In branches on the new booking system, customers only see a barber for services ticked here.</p>
  <div class="card overflow"><table><tr><th>Barber</th><th>Services</th><th></th></tr>${ui.svcs.map(r => `<tr data-sid="${esc(r.staffId)}"><td><b>${esc(r.name)}</b><div class="mute" style="font-size:12px">${r.itemIds.length ? r.itemIds.length + ' selected' : 'every service'}</div></td><td><div class="row" style="flex-wrap:wrap;gap:4px 14px">${svcs.map(s => `<label style="display:flex;gap:6px;align-items:center;text-transform:none;letter-spacing:0;font-weight:500;margin:0"><input type="checkbox" data-svc value="${esc(s.id)}" ${r.itemIds.includes(s.id) ? 'checked' : ''} style="width:16px;height:16px">${esc(s.name)}</label>`).join('')}</div></td><td><button class="btn sm" data-act="svcsave" data-id="${esc(r.staffId)}">Save</button></td></tr>`).join('')}</table></div>`;
}
function vAdv() {
  const r = ui.adv, st = ui.astatus || '';
  const tag = s => ({ REQUESTED: ['#b26a00', 'rgba(245,166,35,.16)'], APPROVED: ['#2b7de9', 'rgba(90,167,255,.13)'], RELEASED: ['var(--ok)', 'rgba(62,207,142,.13)'], REJECTED: ['var(--bad)', 'rgba(255,93,108,.13)'], CANCELLED: ['#6b6b76', '#ececef'] }[s]);
  const sel = `<select id="astatus" style="width:auto"><option value="">All statuses</option>${['REQUESTED', 'APPROVED', 'RELEASED', 'REJECTED', 'CANCELLED'].map(s => `<option ${st === s ? 'selected' : ''}>${s}</option>`).join('')}</select>`;
  return `<h2>Release Pay &amp; Cash Advances <span class="mute" style="font-size:14px">· ${ui.branch === 'all' ? 'All branches' : esc(brName(ui.branch))}</span></h2><div class="row" style="margin-bottom:14px">${sel}</div>
  ${r ? `<div class="grid"><div class="card stat"><span>Outstanding balance</span><b>${peso(r.outstanding)}</b><small class="mute">Scheduled to be deducted in payroll</small></div><div class="card stat"><span>Waiting for approval</span><b>${r.rows.filter(a => a.status === 'REQUESTED').length}</b></div><div class="card stat"><span>To release</span><b>${r.rows.filter(a => a.status === 'APPROVED').length}</b></div></div>
  <div class="card overflow"><table><tr><th>Date</th><th>Employee</th><th>Branch</th><th>Type</th><th>Requested</th><th>Approved</th><th>Released</th><th>Installments</th><th>Balance</th><th>Reason</th><th>Status</th><th></th></tr>
  ${r.rows.map(a => { const [c, bg] = tag(a.status); return `<tr><td>${esc(a.createdAt.slice(0, 10))}</td><td><b>${esc(a.staffName)}</b><br><span class="mute" style="font-size:11px">by ${esc(a.requestedBy)}</span></td><td>${esc(a.branchName)}</td><td>${esc(a.type)}</td><td>${peso(a.amount)}</td><td>${a.approvedAmt ? peso(a.approvedAmt) : '—'}</td><td>${a.releasedAmt ? peso(a.releasedAmt) + '<br><span class="mute" style="font-size:11px">' + esc(a.method) + '</span>' : '—'}</td><td>${a.installments}</td><td><b>${a.status === 'RELEASED' ? peso(a.balance) : '—'}</b></td>
    <td style="white-space:normal;min-width:150px">${esc(a.reason)}</td><td><span class="tag" style="color:${c};background:${bg}">${a.status}</span></td>
    <td style="white-space:normal;min-width:220px"><button class="btn ghost sm" data-act="advhist" data-id="${a.id}">Details</button> ${a.proofId ? `<button class="btn ghost sm" data-act="viewfiles" data-ids="${a.proofId}">Proof</button>` : ''} ${a.status === 'REQUESTED' ? `<button class="btn sm" data-act="advapprove" data-id="${a.id}">Approve</button> <button class="btn bad sm" data-act="advreject" data-id="${a.id}">Reject</button>` : ''}${a.status === 'APPROVED' ? `<button class="btn sm" data-act="advrelease" data-id="${a.id}">Release</button> <button class="btn ghost sm" data-act="advcancel" data-id="${a.id}">Cancel</button>` : ''}</td></tr>`; }).join('') || '<tr><td colspan="12" class="mute">No requests yet.</td></tr>'}</table></div>
  <p class="mute" style="font-size:12.5px;margin-top:10px">Released amounts are deducted automatically in <b>Payroll</b> when you mark a barber as paid, one installment per payroll, and never below zero pay. Deductions need the employee's written authorization.</p>` : '<p class="mute">Loading…</p>'}`;
}
function vExp() {
  const r = ui.exp, st = ui.estatus || '', ct = ui.ecat || '', cats = ['Supplies', 'Utilities', 'Repairs & Maintenance', 'Food & Meals', 'Transportation', 'Marketing', 'Equipment', 'Staff Welfare', 'Other'];
  const tag = s => ({ PENDING: ['#b26a00', 'rgba(245,166,35,.16)'], APPROVED: ['var(--ok)', 'rgba(62,207,142,.13)'], REJECTED: ['var(--bad)', 'rgba(255,93,108,.13)'] }[s]);
  const sel = `<select id="estatus" style="width:auto"><option value="">All statuses</option>${['PENDING', 'APPROVED', 'REJECTED'].map(s => `<option ${st === s ? 'selected' : ''}>${s}</option>`).join('')}</select> <select id="ecat" style="width:auto"><option value="">All categories</option>${cats.map(c => `<option ${ct === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select> <button class="btn ghost sm" data-act="expcsv">⬇ Export CSV</button>`;
  return `<h2>Expenses &amp; Receipts <span class="mute" style="font-size:14px">· ${ui.branch === 'all' ? 'All branches' : esc(brName(ui.branch))}</span></h2>${filterBar(sel)}
  ${r ? `<div class="grid"><div class="card stat"><span>Total (not rejected)</span><b>${peso(r.total)}</b></div><div class="card stat"><span>Entries</span><b>${r.count}</b></div><div class="card stat"><span>Without receipt</span><b style="color:${r.noReceipt ? 'var(--bad)' : 'var(--ok)'}">${r.noReceipt}</b></div></div>
  <div class="card" style="margin-bottom:14px"><h3>By category</h3>${Object.entries(r.byCategory).map(([k, v]) => `<span class="tag" style="margin:0 8px 6px 0">${esc(k)}: ${peso(v)}</span>`).join('') || '<span class="mute">No data in this period.</span>'}</div>
  <div class="card overflow"><table><tr><th>Date</th><th>Branch</th><th>Category</th><th>Description</th><th>Amount</th><th>Payment</th><th>Receipt</th><th>Submitted by</th><th>Status</th><th></th></tr>
  ${r.rows.map(x => { const [c, bg] = tag(x.status); return `<tr><td>${esc(x.date)}</td><td>${esc(x.branchName)}</td><td>${esc(x.category)}</td><td style="white-space:normal;min-width:160px">${esc(x.description)}</td><td><b>${peso(x.amount)}</b></td><td>${esc(x.method)}</td>
    <td>${x.noReceipt ? `<span class="tag" style="color:var(--bad);background:rgba(255,93,108,.13)">NO RECEIPT</span><br><span class="mute" style="font-size:11px;white-space:normal">${esc(x.noReceiptReason)}</span>` : `<a href="#" data-act="viewfiles" data-ids="${x.receipts.join(',')}">${x.receipts.length} photo${x.receipts.length > 1 ? 's' : ''}</a>`}</td>
    <td>${esc(x.submittedBy)}</td><td><span class="tag" style="color:${c};background:${bg}">${x.status}</span>${x.reviewNote ? `<br><span class="mute" style="font-size:11px">${esc(x.reviewNote)}</span>` : ''}</td>
    <td style="white-space:normal;min-width:170px"><button class="btn ghost sm" data-act="exphist" data-id="${x.id}">History</button> ${x.status === 'PENDING' ? `<button class="btn sm" data-act="expreview" data-a="approve" data-id="${x.id}">Approve</button> <button class="btn bad sm" data-act="expreview" data-a="reject" data-id="${x.id}">Reject</button>` : ''}</td></tr>`; }).join('') || '<tr><td colspan="10" class="mute">No expenses in this period.</td></tr>'}</table></div>` : '<p class="mute">Loading…</p>'}`;
}
function vRemit() {
  const r = ui.remit, st = ui.rstatus || '';
  const tag = s => ({ PENDING: ['#b26a00', 'rgba(245,166,35,.16)'], VERIFIED: ['var(--ok)', 'rgba(62,207,142,.13)'], FLAGGED: ['var(--bad)', 'rgba(255,93,108,.13)'], REJECTED: ['#6b6b76', '#ececef'] }[s]);
  const sel = `<select id="rstatus" style="width:auto"><option value="">All statuses</option>${['PENDING', 'FLAGGED', 'VERIFIED', 'REJECTED'].map(s => `<option ${st === s ? 'selected' : ''}>${s}</option>`).join('')}</select>`;
  return `<h2>Daily Sales Remittance <span class="mute" style="font-size:14px">· ${ui.branch === 'all' ? 'All branches' : esc(brName(ui.branch))}</span></h2>${filterBar(sel)}
  ${r ? `<div class="grid"><div class="card stat"><span>Submissions</span><b>${r.totals.count}</b></div><div class="card stat"><span>Expected</span><b>${peso(r.totals.expected)}</b></div><div class="card stat"><span>Remitted</span><b>${peso(r.totals.actual)}</b></div><div class="card stat"><span>Net difference</span><b style="color:${Math.abs(r.totals.variance) >= 1 ? 'var(--bad)' : 'var(--ok)'}">${peso(r.totals.variance)}</b></div></div>
  <div class="card overflow"><table><tr><th>Date</th><th>Branch</th><th>Services</th><th>Cash</th><th>GCash</th><th>Maya</th><th>Other</th><th>Cash expenses</th><th>Expected</th><th>Remitted</th><th>Difference</th><th>Responsible</th><th>Status</th><th>Proof</th><th></th></tr>
  ${r.rows.map(x => { const [c, bg] = tag(x.status); return `<tr><td>${esc(x.date)}</td><td>${esc(x.branchName)}</td><td>${peso(x.posSales)}</td><td>${peso(x.cashSales)}</td><td>${peso(x.gcashSales)}</td><td>${peso(x.mayaSales)}</td><td>${peso(x.otherSales)}</td><td>${peso(x.cashExpenses)}</td><td><b>${peso(x.expected)}</b></td><td><b>${peso(x.actual)}</b></td>
    <td style="color:${Math.abs(x.variance) >= 1 ? 'var(--bad)' : 'var(--ok)'};font-weight:700">${x.variance > 0 ? '+' : ''}${peso(x.variance)}</td><td>${esc(x.responsible)}<br><span class="mute" style="font-size:11px">by ${esc(x.submittedBy)}</span></td>
    <td><span class="tag" style="color:${c};background:${bg}">${x.status}</span></td><td><a href="#" data-act="viewfile" data-id="${x.proofId}">View photo</a></td>
    <td style="white-space:normal;min-width:190px"><button class="btn ghost sm" data-act="rmhist" data-id="${x.id}">History</button> ${x.status !== 'VERIFIED' ? `<button class="btn sm" data-act="rmreview" data-a="verify" data-id="${x.id}">Verify</button>` : ''} ${x.status === 'PENDING' || x.status === 'FLAGGED' ? `<button class="btn ghost sm" data-act="rmreview" data-a="flag" data-id="${x.id}">Flag</button> <button class="btn bad sm" data-act="rmreview" data-a="reject" data-id="${x.id}">Reject</button>` : ''}</td></tr>`; }).join('') || '<tr><td colspan="15" class="mute">No remittances in this period.</td></tr>'}</table></div>` : '<p class="mute">Loading…</p>'}`;
}
function vDashboard() {
  const l = ui.live, r = ui.rep;
  const live = l ? `<h3 style="margin:0 0 8px"><span style="color:var(--ok)">●</span> Live floor</h3><div class="grid">
    <div class="card stat"><span>Barbers on duty</span><b>${l.onDuty}</b><small class="mute">${l.available} available · ${l.cutting} cutting</small></div>
    <div class="card stat"><span>Waiting in queue</span><b>${l.waiting}</b><small class="mute">${l.waiting ? 'Longest wait ' + l.longestWaitMin + ' min' : 'Nobody is waiting'}</small></div>
    <div class="card stat"><span>In the chair</span><b>${l.cutting}</b><small class="mute">Walk-ins being served now</small></div></div>
    <div class="card overflow" style="margin-bottom:14px"><h3>Live walk-in floor queue</h3><table><tr><th>Ticket</th><th>Customer</th><th>Branch</th><th>Services</th><th>Status</th><th>Barber</th><th>Time</th></tr>
    ${l.queue.map(q => `<tr><td>#${String(q.no).padStart(3, '0')}</td><td>${esc(q.customer)}</td><td>${esc(q.branch)}</td><td>${esc(q.services)}</td><td><span class="tag ${q.status === 'in_chair' ? 'done' : 'booked'}">${q.status === 'in_chair' ? 'In Chair' : 'Waiting'}</span></td><td>${esc(q.barber)}</td><td>${ago(q.since)}</td></tr>`).join('') || '<tr><td colspan="7" class="mute">No customers on the floor right now.</td></tr>'}</table></div>` : '';
  return `<h2>Dashboard <span class="mute" style="font-size:14px">· ${ui.branch === 'all' ? 'All branches' : esc(brName(ui.branch))}</span></h2>${vChkToday()}${live}${r ? renderCards(r.cards) + r.tables.map(renderTable).join('') : ''}`;
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
  equipment: { cols: [['branchId', 'Branch', brName], ['name', 'Equipment'], ['category', 'Type'], ['serial', 'Serial / tag'], ['status', 'Status'], ['lastService', 'Last service'], ['nextService', 'Next service due'], ['active', 'Active', yn]], rows: () => S.equipment || [],
    form: () => [['branchId', 'Branch', 'select', { opts: BR(), def: ui.branch !== 'all' ? ui.branch : S.branches[0]?.id }], ['name', 'Equipment name', 'text'], ['category', 'Type (e.g. Clippers, Chair, Aircon)', 'text', { req: false }], ['serial', 'Serial number or tag', 'text', { req: false }],
      ['status', 'Condition', 'select', { opts: [['OK', 'OK'], ['Needs service', 'Needs service'], ['Under repair', 'Under repair'], ['Retired', 'Retired']] }], ['lastService', 'Last service date', 'date', { req: false }], ['nextService', 'Next service due', 'date', { req: false }], ['notes', 'Notes', 'text', { req: false }], ['active', 'Active', 'select', { opts: [[1, 'Yes'], [0, 'No']] }]] },
  chairs: { cols: [['branchId', 'Branch', brName], ['name', 'Name'], ['sort', 'Order'], ['active', 'Active', yn]], rows: () => S.chairs,
    form: () => [['branchId', 'Branch', 'select', { opts: BR(), def: ui.branch !== 'all' ? ui.branch : S.branches[0]?.id }], ['name', 'Name', 'text'], ['sort', 'Order', 'number', { def: 1 }], ['active', 'Active', 'select', { opts: [[1, 'Yes'], [0, 'No']] }]] },
  categories: { cols: [['name', 'Name'], ['type', 'Type']], rows: () => S.categories,
    form: () => [['name', 'Name', 'text'], ['type', 'Type', 'select', { opts: [['service', 'Service'], ['product', 'Product']] }]] },
  items: { cols: [['photo', ''], ['name', 'Name'], ['categoryId', 'Category', catName], ['type', 'Type'], ['price', 'Price', peso], ['mins', 'Minutes'], ['bookable', 'Online', yn], ['apptOnly', 'Appt only', yn], ['commission', 'Barber commission / pc', v => v ? peso(v) : ''], ['needId', 'Needs ID', yn], ['active', 'Active', yn]], rows: () => S.items,
    form: () => [['name', 'Name', 'text'], ['categoryId', 'Category', 'select', { opts: S.categories.map(c => [c.id, `${c.name} (${c.type})`]) }], ['type', 'Type', 'select', { opts: [['service', 'Service'], ['product', 'Product']] }],
      ['price', 'Price (₱)', 'number'], ['commission', 'Barber commission per piece sold (₱, products only)', 'number', { def: 100 }], ['mins', 'Minutes', 'number', { def: 30 }], ['photo', 'Photo', 'photo', { req: false }], ['bookable', 'Show on online booking', 'select', { opts: [[1, 'Yes'], [0, 'No']] }], ['apptOnly', 'Appointment only (not for walk-ins)', 'select', { opts: [[0, 'No'], [1, 'Yes']] }], ['needId', 'Requires a photo of the customer ID (Senior / PWD / Student)', 'select', { opts: [[0, 'No'], [1, 'Yes']] }], ['active', 'Active', 'select', { opts: [[1, 'Yes'], [0, 'No']] }]] },
  discounts: { cols: [['name', 'Name'], ['kind', 'Kind'], ['value', 'Value'], ['active', 'Active', yn]], rows: () => S.discounts,
    form: () => [['name', 'Name', 'text'], ['kind', 'Kind', 'select', { opts: [['amount', 'Amount off (₱)'], ['percent', 'Percent off (%)']] }], ['value', 'Value', 'number'], ['active', 'Active', 'select', { opts: [[1, 'Yes'], [0, 'No']] }]] },
  users: { cols: [['name', 'Name'], ['username', 'Username'], ['role', 'Role'], ['branchLabel', 'Branch'], ['active', 'Active', yn]], rows: () => S.users.map(u => ({ ...u, branchLabel: u.role === 'manager' ? (u.branchIds || []).map(brName).join(', ') : u.branchId ? brName(u.branchId) : 'All' })),
    form: () => [['name', 'Full name', 'text'], ['username', 'Username', 'text'],
      ['role', 'Role', 'select', { opts: [['cashier', 'Front desk (one branch)'], ['barber', 'Barber (one branch)'], ...(isMgr() ? [] : [['manager', 'Manager (the branches ticked below)'], ['admin', 'Admin (all branches)']]), ...(S.me?.role === 'owner' ? [['owner', 'Owner (everything; own password, no PIN)']] : [])] }],
      ['branchId', 'Branch', 'select', { opts: isMgr() ? BR() : [['', '— all —'], ...BR()], req: false, hint: 'required for cashier and barber' }],
      ...(isMgr() ? [] : [['branchIds', 'Branches this manager runs', 'checks', { opts: BR(), req: false, hint: 'managers only' }]]),
      ['staffId', 'Linked barber profile', 'select', { opts: [['', '— not linked —'], ...S.staff.map(s => [s.id, s.name + ' · ' + brName(s.branchId)])], req: false, hint: 'Link a barber login to their profile so they can see their own performance and payslips' }],
      ...(isMgr() ? [] : [['pin', 'PIN', 'text', { req: false, hint: '6 digits, for cashier and barber; blank = keep current' }],
      ['password', 'Password', 'password', { req: false, hint: 'owners, admins and managers; blank = keep current; at least 6 characters (owners: 10)' }]]),
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
  ${rows.map(r => `<tr style="${r.active === 0 ? 'opacity:.5' : ''}">${m.cols.map(([k, , f]) => k === 'photo' ? `<td>${thumb(r)}</td>` : `<td>${esc(f ? f(r[k]) : r[k])}</td>`).join('')}<td>${kind === 'users' ? `<button class="btn ghost sm" data-act="resetuser" data-id="${r.id}">Reset ${['admin', 'owner', 'manager'].includes(r.role) ? 'password' : 'PIN'}</button> ` : ''}<button class="btn ghost sm" data-act="edit" data-kind="${kind}" data-id="${r.id}">Edit</button> <button class="btn bad sm" data-act="del" data-kind="${kind}" data-id="${r.id}">Delete</button></td></tr>`).join('') || `<tr><td colspan="${m.cols.length + 1}" class="mute">Nothing here yet.</td></tr>`}</table></div>`;
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
  <div class="card overflow"><table data-nopg><tr><th>Customer</th><th>Contact</th><th>Preferred haircut</th><th>Tier</th><th>Visits / points</th><th>Total spent</th><th>Last haircut</th><th>Branch</th><th>Email promos</th><th></th></tr>
  ${c.rows.map(r => `<tr><td><b>${esc(r.name)}</b></td><td>${esc(r.phone)}${r.phone && r.email ? '<br>' : ''}<span class="mute">${esc(r.email)}</span></td><td>${esc(r.preferredCut)}</td><td>${tierBadge(r.tier)}</td><td><b>${r.visits}</b></td><td>${peso(r.spent)}</td>
    <td>${r.lastVisit ? new Date(r.lastVisit).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) + '<br><span class="mute" style="font-size:12px">' + new Date(r.lastVisit).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }) + '</span>' : '<span class="mute">No visit yet</span>'}</td>
    <td>${esc(r.branchName) || '<span class="mute">—</span>'}</td><td>${r.consent ? '<span style="color:var(--ok);font-weight:700">✔ Subscribed</span>' : '<span class="mute">—</span>'}</td><td><button class="btn ghost sm" data-act="edit" data-kind="customers" data-id="${r.id}">Edit</button></td></tr>`).join('') || '<tr><td colspan="10" class="mute">No customers in the directory for this view.</td></tr>'}</table></div>
  <div class="row" style="margin-top:12px;justify-content:center"><button class="btn ghost sm" data-act="page" data-n="-1" ${c.page <= 1 ? 'disabled' : ''}>‹ Prev</button><span class="mute">Page ${c.page} / ${pages}</span><button class="btn ghost sm" data-act="page" data-n="1" ${c.page >= pages ? 'disabled' : ''}>Next ›</button></div>`;
}
const MOD_LABEL = { dashboard: 'Dashboard', pos: 'Front desk: walk-ins and finished services', bookings: 'Bookings (appointments)', queue: 'Walk-in line (start customers)', expenses: 'Expenses', attendance: 'Barber Attendance (time in / out, breaks)', reading: 'Old POS cash drawer (no longer used)', customers: 'Customer Directory (look up points and tiers)' };
// red notice for the owner and admins when the live server's login settings are weak (decision D-22)
function secretBar() {
  const w = S.secretWarnings || []; if (!w.length) return '';
  return `<div class="card" role="alert" style="margin-bottom:12px;border-color:#f2b8bf;background:#fff1f2"><b style="color:var(--bad)">Login security settings need attention</b><ul style="margin:6px 0 0;padding-left:18px;font-size:13px">${w.map(x => `<li>${esc(x)}</li>`).join('')}</ul><p class="mute" style="font-size:12px;margin:6px 0 0">Only the owner and admins see this. The app keeps working in the meantime.</p></div>`;
}
// partner shop banner, and the Brotherhood owner's list of partner shops
function orgBar() {
  if (!S.org) return '';
  return `<div class="card row" style="margin-bottom:12px;align-items:center;gap:10px;border-color:#c7d7fe;background:#f3f6ff"><span style="font-size:20px">🤝</span><div style="flex:1;min-width:180px"><b>${esc(S.org.name)}</b> <span class="mute">· partner shop · code <b>${esc(S.org.code)}</b></span><div class="mute" style="font-size:12px">${masterToken() ? 'You are viewing this partner shop as the Brotherhood owner. Its data is separate from Brotherhood.' : 'Your data is private to your shop.'}</div>${planLine(S.org)}</div>${masterToken() ? '<button class="btn sm" data-act="leaveorg">Back to Brotherhood</button>' : ''}</div>`;
}
function partnersCard() {
  if (S.org || S.me.role !== 'owner') return '';
  const rows = ui.orgs || [];
  return `<div class="card overflow" style="margin-bottom:14px"><h3>Partner shops</h3>
    <p class="mute" style="font-size:13px;margin:0 0 10px">Other barbershops that use the system. Each partner has its <b>own separate data</b>: they never see Brotherhood's sales, staff or customers, and you never mix their numbers into yours. They log in with their <b>shop code</b>, their owner username and password.</p>
    ${rows.length ? `<table><tr><th>Shop</th><th>Code</th><th>Owner</th><th>Branches</th><th>Barbers</th><th>Services (30 days)</th><th>Plan</th><th></th></tr>${rows.map(o => `<tr><td><b>${esc(o.name)}</b></td><td>${esc(o.code)}</td><td>${esc(o.ownerName || o.ownerUser)}<br><span class="mute" style="font-size:12px">${esc(o.email || '')}${o.phone ? ' · ' + esc(o.phone) : ''}</span></td><td>${o.branches}</td><td>${o.barbers}</td><td>${peso(o.sales30)}</td><td>${planTag(o.status)}${o.source === 'signup' ? '<br><span class="mute" style="font-size:11px">signed up ' + esc(String(o.createdAt).slice(0, 10)) + '</span>' : ''}</td>
      <td style="white-space:nowrap"><button class="btn sm" data-mk="bill" data-id="${o.id}">Plan &amp; payments</button> <button class="btn ghost sm" data-act="orgenter" data-id="${o.id}">Open back office</button> <button class="btn ghost sm" data-act="orgreset" data-id="${o.id}">New password</button> <button class="btn ghost sm" data-act="orgpause" data-id="${o.id}" data-on="${o.active ? 0 : 1}">${o.active ? 'Pause' : 'Resume'}</button></td></tr>`).join('')}</table>` : '<p class="mute">No partner shops yet.</p>'}
    ${plansEditor()}
    <h4 style="margin:16px 0 6px">Add a partner shop</h4>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px">
      <div><label>Shop name</label><input id="og-name" placeholder="e.g. Kingsman Cuts"></div>
      <div><label>Shop code (for login)</label><input id="og-code" placeholder="e.g. kingsman" autocapitalize="none"></div>
      <div><label>First branch name</label><input id="og-branch" placeholder="e.g. Calamba"></div>
      <div><label>Owner username</label><input id="og-user" placeholder="e.g. juan" autocapitalize="none" autocomplete="off"></div>
    </div>
    <p class="mute" style="font-size:12px;margin:8px 0 10px">${ui.plans && ui.plans.signupOpen ? `New shops can also sign up by themselves at <b>${esc(location.origin)}/signup</b> (free trial). ` : 'Public sign-up for new shops is closed for now, so you add each shop here. '}A temporary password is made for the owner and shown once. Give it to them privately; they can change it in their Settings.</p>
    <button class="btn" data-act="neworg">Add partner shop</button></div>`;
}
function vSettings() {
  const s = ui.settings; if (!s) return '<p class="mute">Loading…</p>';
  const e = s.email, owner = S.me.role === 'owner';
  return `${partnersCard()}<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr))">
    <div class="card"><h3>Attendance</h3><label class="chk" style="display:flex;gap:10px;align-items:center;text-transform:none;letter-spacing:0;font-size:14px;color:var(--text);font-weight:500"><input type="checkbox" id="at-photo" ${s.attPhoto ? 'checked' : ''} style="width:20px;height:20px;accent-color:#000">Require a selfie for every time in and time out</label>
      <label class="chk" style="display:flex;gap:10px;align-items:center;text-transform:none;letter-spacing:0;font-size:14px;color:var(--text);font-weight:500"><input type="checkbox" id="at-geo" ${s.attGeo ? 'checked' : ''} style="width:20px;height:20px;accent-color:#000">Also record the location (optional, needs location permission on the phone)</label>
      <p class="mute" style="font-size:12px;margin:8px 0 10px">Tell your staff that selfies and location are recorded for attendance only. Photos are encrypted and visible only to you and your branch staff. Attendance works without internet: it is saved on the phone and uploaded automatically.</p><button class="btn sm" data-act="saveatt">Save</button></div>
    ${owner ? `<div class="card"><h3>New booking system (pilot)</h3><p class="mute" style="font-size:13px;margin:0 0 8px">Tick the branches that use the new booking and queue rules. Start with one branch (the pilot is San Pablo), then add the others one at a time. Branches that are not ticked keep working as today.</p>
      <div class="row" style="flex-wrap:wrap;gap:6px 14px">${S.branches.map(b => `<label style="display:flex;gap:6px;align-items:center;text-transform:none;letter-spacing:0;font-size:14px;color:var(--text);font-weight:500"><input type="checkbox" data-mvp value="${esc(b.id)}" ${(s.mvpBranches || []).includes(b.id) ? 'checked' : ''} style="width:18px;height:18px;accent-color:#000">${esc(b.name)}</label>`).join('')}</div>
      <button class="btn sm" data-act="savemvp" style="margin-top:10px">Save</button></div>` : ''}
    <div class="card"><h3>Staff login on branch phones</h3><p class="mute" style="font-size:13px;margin:0 0 8px">Set up a phone in the app under Pro tools → Tools → This phone. Staff then tap their name and type their PIN. A phone that is lost should be switched off here.</p>
      ${(ui.devices || []).length ? `<div style="overflow-x:auto"><table><tr><th>Phone</th><th>Branch</th><th>Last used</th><th></th></tr>${ui.devices.map(d => `<tr><td>${esc(d.name)}<div class="mute" style="font-size:12px">set up by ${esc(d.createdBy || '')}</div></td><td>${esc(d.branchName || '')}</td><td>${d.lastUsedAt ? esc(String(d.lastUsedAt).slice(0, 16).replace('T', ' ')) : '<span class="mute">never</span>'}</td><td><button class="btn sm sec" data-act="devoff" data-id="${esc(d.id)}">Switch off</button></td></tr>`).join('')}</table></div>` : '<p class="mute" style="font-size:13px">No phones set up yet.</p>'}
      <label class="chk" style="display:flex;gap:10px;align-items:center;text-transform:none;letter-spacing:0;font-size:14px;color:var(--text);font-weight:500;margin-top:10px"><input type="checkbox" id="pin-only" ${s.pinOnly ? 'checked' : ''} style="width:20px;height:20px;accent-color:#000">Also allow login with a PIN alone (without picking a name)</label>
      <p class="mute" style="font-size:12px;margin:6px 0 10px">Turn this off once every branch phone is set up: then a wrong-PIN pause only hits one person, not the whole shop.</p><button class="btn sm" data-act="savepinonly">Save</button></div>
    ${s.payRules ? `<div class="card"><h3>Pay rules (late arrival)</h3><p class="mute" style="font-size:13px;margin:0 0 8px">Pay is always built on the barber's commission. Lateness is counted from the branch opening time (9:00) to the real time-in.</p>
      <label>Free lunch money per day (₱)</label><input id="pr-lunch" type="number" min="0" value="${s.payRules.lunchAmount}">
      <label>No free lunch when this many minutes late or more</label><input id="pr-ll" type="number" min="0" value="${s.payRules.lunchLateMins}">
      <label>No daily allowance (and no lunch) when this many minutes late or more</label><input id="pr-al" type="number" min="0" value="${s.payRules.allowLateMins}">
      <button class="btn sm" data-act="saverules" style="margin-top:10px">Save pay rules</button></div>` : ''}
    ${owner ? `<div class="card"><h3>Owner login</h3>
      <p style="margin:0 0 8px">Your username: <b>${s.ownerUser ? esc(s.ownerUser) : '<span class="mute">not set (you log in with a blank username)</span>'}</b></p>
      <label>New owner username</label><input id="ou-name" value="${esc(s.ownerUser || '')}" placeholder="e.g. kevin" autocapitalize="none" autocomplete="off">
      <label>Current owner password (to confirm)</label><input id="ou-pw" type="password" autocomplete="current-password">
      <p class="mute" style="font-size:12px;margin:8px 0 10px">3 to 30 characters: letters, numbers, dot, dash or underscore. After saving, log in with this username and your usual owner password. Leave the username blank to go back to a blank username. The owner password itself is set in the Railway variable ADMIN_PASSWORD.</p>
      <button class="btn sm" data-act="saveowner">Save username</button>${S.org ? `<h4 style="margin:18px 0 6px">Change password</h4>
      <label>Current password</label><input id="op-cur" type="password" autocomplete="current-password"><label>New password (8+ characters)</label><input id="op-new" type="password" autocomplete="new-password">
      <button class="btn sm" data-act="saveownerpw" style="margin-top:10px">Change password</button>` : ''}</div>` : ''}
    <div class="card" style="${S.org ? 'display:none' : ''}"><h3>Email (welcome and promos)</h3><p class="mute" style="font-size:12px;margin:-4px 0 8px">Promos and the automatic "we miss you" email are in <a href="#" data-view="mkt">Marketing → Email Marketing</a>.</p>
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

  <div class="card" style="margin-top:14px${S.org ? ';display:none' : ''}"><h3>Booking site: branch pictures and contact details</h3>
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

  <div class="card overflow" style="margin-top:14px"><h3>Access: what each role can open in the Brotherhood app</h3>
    <table><tr><th>Section</th><th>Cashier</th><th>Barber</th></tr>
    ${s.modules.map(m => `<tr><td>${esc(MOD_LABEL[m] || m)}</td>${['cashier', 'barber'].map(r => r === 'barber' && m === 'queue' ? '<td class="mute">—</td>' : `<td><input type="checkbox" data-perm="${r}:${m}" ${s.perms[r].includes(m) ? 'checked' : ''} style="width:20px;height:20px;accent-color:#000"></td>`).join('')}</tr>`).join('')}</table>
    <p class="mute" style="font-size:12px;margin:10px 0">Owner and admin always have full access. Create barber and cashier logins under Management → Users. Changes apply right away.</p>
    <button class="btn" data-act="saveaccess">Save access</button></div>

  <div class="card" style="margin-top:14px"><h3>Terms &amp; Conditions (shown under the customer fill-up form)</h3>
    <textarea id="termsta" rows="16" style="font-size:13px;line-height:1.5">${esc(s.terms)}</textarea>
    <p class="mute" style="font-size:12px">This is only a draft. Have a lawyer or compliance officer review it so it follows the Data Privacy Act (RA 10173).</p>
    <div class="row"><button class="btn" data-act="saveterms">Save terms</button>${s.customTerms ? '<button class="btn ghost" data-act="resetterms">Restore default</button>' : ''}</div></div>

  <div class="card overflow" style="margin-top:14px${S.org ? ';display:none' : ''}"><h3>Emails sent</h3><table><tr><th>When</th><th>To</th><th>Type</th><th>Status</th><th>Tries</th><th>Error</th></tr>
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
      : t === 'checks' ? `<div class="row" style="flex-wrap:wrap;gap:6px 14px">${x.opts.map(([v, lab]) => `<label style="display:flex;gap:6px;align-items:center;text-transform:none;letter-spacing:0;font-weight:500"><input type="checkbox" name="${n}" value="${esc(v)}" ${(Array.isArray(val) ? val : []).includes(v) ? 'checked' : ''} style="width:18px;height:18px">${esc(lab)}</label>`).join('')}</div>`
      : t === 'textarea' ? `<textarea name="${n}">${esc(val)}</textarea>`
      : t === 'select' ? `<select name="${n}">${x.opts.map(([v, lab]) => `<option value="${esc(v)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(lab)}</option>`).join('')}</select>`
        : `<input name="${n}" type="${t}" value="${esc(val)}" ${req} ${t === 'number' ? 'step="any"' : ''} ${t === 'password' ? 'autocomplete="new-password"' : ''}>`;
    return `<label>${l}${x.hint ? ` <span class="mute">(${x.hint})</span>` : ''}</label>${ctl}`;
  };
  openModal(`<h2>${id ? 'Edit' : 'New'}</h2><form data-form="${kind}" data-id="${id || ''}">${m.form().map(input).join('')}<p id="err" style="color:var(--bad)"></p><div class="row"><button class="btn">Save</button><button type="button" class="btn ghost" data-act="close">Cancel</button></div></form>`);
}
const thumb = r => r.photo ? `<img class="th ${(r.type || r.openTime) ? 'sq' : ''}" src="${esc(r.photo)}" alt="" loading="lazy">` : `<span class="th ${(r.type || r.openTime) ? 'sq' : ''}">${esc(String(r.name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase())}</span>`;
async function resizeToJpeg(file, max = 640) {
  // big phone photos are decoded straight at a smaller size (much faster, far less memory)
  let bmp = null; if (file.size > 500000) { try { bmp = await createImageBitmap(file, { resizeWidth: max, resizeQuality: 'medium', imageOrientation: 'from-image' }); } catch (e) { bmp = null; } }
  if (!bmp) bmp = await createImageBitmap(file);
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * s)); c.height = Math.max(1, Math.round(bmp.height * s)); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); if (bmp.close) bmp.close();
  return c.toDataURL('image/jpeg', 0.78);
}
function vBookings() {
  const link = location.origin + '/book';
  const rows = ui.bk;
  return `<div class="card" style="margin-bottom:14px"><div class="row between"><div><h3 style="margin:0 0 4px">Online booking link</h3><b style="font-size:16px">${esc(link)}</b><div class="mute" style="font-size:12px">Give this link to customers (Facebook, Messenger, QR code). Each booking goes straight to that branch's POS.</div></div>
    <div class="row"><button class="btn" data-act="copylink">Copy link</button><a class="btn ghost" href="/book" target="_blank" style="text-decoration:none">Open</a></div></div></div>
  <div class="card overflow"><table><tr><th>Date</th><th>Time</th><th>Customer</th><th>Phone</th><th>Services</th><th>Barber</th><th>Branch</th><th>Source</th><th>Status</th><th></th></tr>
  ${rows.map(b => `<tr><td>${esc(b.date)}</td><td>${esc(b.time)}</td><td>${esc(b.customerName)}</td><td>${esc(b.phone)}</td><td>${b.items.map(i => esc(i.name)).join(', ')}</td><td>${thumb({ photo: b.staffPhoto, name: b.staffName })} ${esc(b.staffName)}</td><td>${esc(b.branchName)}</td><td>${b.source === 'online' ? 'Online' : 'Phone/POS'}</td>
    <td><span class="tag ${b.status === 'booked' ? 'booked' : b.status === 'arrived' ? 'done' : ''}">${esc(b.status)}</span></td><td style="white-space:nowrap">${b.status === 'booked' ? `<button class="btn bad sm" data-act="bkcancel" data-id="${b.id}">Cancel</button> ` : ''}<button class="btn ghost sm" data-act="bkhistory" data-id="${b.id}">History</button></td></tr>`).join('') || '<tr><td colspan="10" class="mute">No bookings in this period.</td></tr>'}</table></div>`;
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
async function showFiles(ids, heading) {
  try {
    const imgs = []; for (const id of ids) { const r = await fetch('/api/files/' + id, { headers: { Authorization: 'Bearer ' + token } }); if (r.ok) imgs.push(URL.createObjectURL(await r.blob())); }
    if (!imgs.length) throw new Error('Could not load the photos');
    openModal('<h2 style="margin-top:0">' + heading + '</h2>' + imgs.map(u => '<img src="' + u + '" alt="" style="width:100%;border-radius:14px;border:1px solid var(--line);margin-bottom:10px">').join('') + '<button class="btn ghost" data-act="close">Close</button>');
  } catch (x) { alert(x.message); }
}
async function showIdPhoto(id, base = '/api/idphoto/', heading = 'Customer ID photo') {
  try {
    const r = await fetch(base + id, { headers: { Authorization: 'Bearer ' + token } }); if (!r.ok) throw new Error('Could not load the ID photo');
    openModal('<h2 style="margin-top:0">' + heading + '</h2><img src="' + URL.createObjectURL(await r.blob()) + '" alt="ID photo" style="width:100%;border-radius:14px;border:1px solid var(--line)"><p class="mute" style="font-size:12px">Private. Only the owner and staff of that branch can see this photo.</p><button class="btn ghost" data-act="close">Close</button>');
  } catch (x) { alert(x.message); }
}
document.addEventListener('click', async e => {
  if (e.target.closest('[data-act="menu"]')) { const o = document.getElementById('nav').classList.toggle('open'); document.getElementById('scrim').classList.toggle('show', o); return; }
  const pgb = e.target.closest('[data-pgd]'); if (pgb) { const st = ui.pg[pgb.dataset.pgk]; if (st) { st.p += +pgb.dataset.pgd; paginateTables(); const nb = [...document.querySelectorAll('[data-pgk]')].find(b => b.dataset.pgk === pgb.dataset.pgk), tb = nb && nb.closest('.pager') && nb.closest('.pager').previousElementSibling; if (tb && tb.scrollIntoView) tb.scrollIntoView({ block: 'start', behavior: 'smooth' }); } return; }
  const gh = e.target.closest('[data-grp]');
  if (gh) { const g = gh.dataset.grp; if (ui.navClosed.has(g)) ui.navClosed.delete(g); else ui.navClosed.add(g); try { localStorage.setItem('navClosed', JSON.stringify([...ui.navClosed])); } catch { } return render(); }
  const nb = e.target.closest('[data-view]');
  if (nb) { document.getElementById('nav').classList.remove('open'); document.getElementById('scrim').classList.remove('show'); ui.view = nb.dataset.view; ui.navQ = ''; ui.pg = {}; ui.picked.clear(); if (ui.view === 'mgmt:customers') ui.cust.page = 1; render(); await loadView(); return render(); }
  const el = e.target.closest('[data-act]'); if (!el || el.disabled) return;
  const d = el.dataset, act = d.act;
  if (act === 'close') return closeModal();
  if (act === 'bell') return bellModal();
  if (act === 'allownotif') { await Notification.requestPermission(); return bellModal(); }
  if (act === 'slipview') {
    const x = ui.slip.rows[+d.i]; return openModal(`<div id="slipbox">${payslipHtml(x)}</div><div class="row" style="margin-top:12px"><button class="btn" data-act="slipprint" data-i="${d.i}">🖨 Print / save as PDF</button><button class="btn ghost" data-act="close">Close</button></div>`);
  }
  if (act === 'slipprint') {
    const x = ui.slip.rows[+d.i], w = window.open('', '_blank'); if (!w) return alert('Allow pop-ups to print the payslip.');
    w.document.write('<!doctype html><title>Payslip ' + esc(x.staffName) + '</title><body style="font:14px Arial;max-width:440px;margin:24px auto">' + payslipHtml(x)); w.document.close(); w.focus(); w.print(); return;
  }
  if (act === 'addadj') {
    return openModal(`<h2 style="margin-top:0">Bonus, incentive or other earning</h2><p class="mute" style="font-size:13px">It is added to the employee's next payslip.</p>
      <label>Employee</label><select id="aj-staff">${S.staff.filter(s => s.active).map(s => `<option value="${s.id}">${esc(s.name)} · ${esc(brName(s.branchId))}</option>`).join('')}</select>
      <label>Type</label><select id="aj-kind"><option>Bonus</option><option>Incentive</option><option>Other earning</option></select><label>Amount (₱)</label><input id="aj-amt" type="number"><label>Date</label><input id="aj-date" type="date" value="${today()}"><label>What is it for?</label><input id="aj-note" maxlength="200" placeholder="e.g. Best barber of the week">
      <p id="aj-err" style="color:var(--bad)"></p><div class="row"><button class="btn" data-act="addadjgo">Save</button><button class="btn ghost" data-act="close">Cancel</button></div>`);
  }
  if (act === 'addadjgo') {
    const v = i => document.getElementById(i).value;
    try { await api('POST', '/api/adjustments', { staffId: v('aj-staff'), kind: v('aj-kind'), amount: +v('aj-amt'), date: v('aj-date'), note: v('aj-note') }); closeModal(); await loadView(); render(); } catch (x) { document.getElementById('aj-err').textContent = x.message; } return;
  }
  if (act === 'rmadj') { if (!confirm('Remove this bonus?')) return; try { await api('DELETE', '/api/adjustments/' + d.id); await loadView(); render(); } catch (x) { alert(x.message); } return; }
  if (act === 'lvreview') {
    const action = d.a, note = action === 'approve' ? '' : prompt('Why is this leave rejected?'); if (note === null) return; if (action !== 'approve' && !String(note).trim()) return alert('A note is required.');
    try { await api('PUT', '/api/leaves/' + d.id + '/review', { action, note }); await loadView(); render(); } catch (x) { alert(x.message); } return;
  }
  if (act === 'chksave') {
    const ls = id => document.getElementById(id).value.split('\n').map(s => s.trim()).filter(Boolean);
    try { ui.chkTpl = await api('PUT', '/api/checklists/template', { opening: ls('chk-open'), closing: ls('chk-close') }); alert('Checklist tasks saved.'); render(); } catch (x) { alert(x.message); } return;
  }
  if (act === 'slipprint_old') {
    const x = ui.slip.rows[+d.i], w = window.open('', '_blank'); if (!w) return alert('Allow pop-ups to print the payslip.');
    const row = (l, v, b) => `<tr><td>${l}</td><td style="text-align:right">${b ? '<b>' + v + '</b>' : v}</td></tr>`;
    w.document.write(`<!doctype html><title>Payslip</title><body style="font:14px Arial;max-width:420px;margin:24px auto"><div style="text-align:center"><img src="/logo.png?v=b" width="80" style="border-radius:50%"><h2 style="margin:6px 0">BROTHERHOOD BARBER</h2><div>PAYSLIP</div></div><hr>
      <p><b>${esc(x.staffName)}</b><br>${esc(x.branchName)}<br>Paid on ${esc(x.paidAt.slice(0, 10))} · Days: ${esc(x.days[0])}${x.days.length > 1 ? ' to ' + esc(x.days[x.days.length - 1]) : ''} (${x.days.length} day${x.days.length > 1 ? 's' : ''})</p>
      <table style="width:100%;border-collapse:collapse">${row('Commission', peso(x.commission))}${row('Daily allowance top-up', peso(x.topup))}${x.lunch ? row('Free lunch allowance', peso(x.lunch)) : ''}${row('Gross pay', peso(x.gross), 1)}${row('Less: advances taken during the day', '−' + peso(x.advance))}${x.deductionItems.map(d => row('Less: release pay installment ' + d.seq + ' (' + esc(d.type) + ')', '−' + peso(d.amount))).join('')}${row('NET PAY', peso(x.net), 1)}</table>
      <p style="font-size:11px;color:#666;margin-top:24px">Prepared by ${esc(x.paidBy || '')}. Deductions were authorized in writing by the employee.</p>`);
    w.document.close(); w.focus(); w.print(); return;
  }
  if (act === 'probhist') {
    const x = ui.prob.rows.find(r => r.id === d.id);
    return openModal(`<h2 style="margin-top:0">${esc(x.category)} · ${esc(x.branchName)}</h2><p>${esc(x.description)}</p><h3>Comments</h3>${x.comments.map(c => `<div style="padding:6px 0;border-bottom:1px solid var(--line)"><b>${esc(c.by)}</b> <span class="mute" style="font-size:12px">${new Date(c.at).toLocaleString('en-PH')}</span><br>${esc(c.text)}</div>`).join('') || '<p class="mute">No comments yet.</p>'}
      <h3 style="margin-top:14px">History</h3>${x.history.map(h => `<div style="padding:6px 0;border-bottom:1px solid var(--line)"><b>${esc(h.action)}</b> · ${esc(h.by)} <span class="mute" style="font-size:12px">${new Date(h.at).toLocaleString('en-PH')}</span>${h.note ? '<br>' + esc(h.note) : ''}</div>`).join('')}<br><button class="btn ghost" data-act="close">Close</button>`);
  }
  if (act === 'probnext') { const note = d.to === 'RESOLVED' ? (prompt('What was done? (optional)') || '') : ''; try { await api('PUT', '/api/problems/' + d.id + '/status', { status: d.to, note }); await loadView(); render(); } catch (x) { alert(x.message); } return; }
  if (act === 'probassign') { const who = prompt('Assign to (name of the person or the technician)'); if (who === null) return; try { await api('PUT', '/api/problems/' + d.id + '/assign', { assignedTo: who }); await loadView(); render(); } catch (x) { alert(x.message); } return; }
  if (act === 'probcomment') { const text = prompt('Write your comment'); if (!text || !text.trim()) return; try { await api('POST', '/api/problems/' + d.id + '/comment', { text }); await loadView(); render(); } catch (x) { alert(x.message); } return; }
  if (act === 'attcsv') {
    const r = ui.att, rows = [['Date', 'Barber', 'Branch', 'Time in', 'Time out', 'Late mins', 'Undertime mins', 'Overtime mins', 'Flagged', 'Reason', 'Offline', 'Corrected'], ...r.rows.map(a => [a.date, a.staffName, a.branchName, a.timeIn || '', a.timeOut || '', a.lateMins || 0, a.undertimeMins || 0, a.overtimeMins || 0, a.flagged ? 'YES' : '', a.flagReason || '', a.offline ? 'YES' : '', a.corrected ? 'YES' : ''])];
    const csv = '﻿' + rows.map(x => x.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n'), a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `attendance-${ui.from}_${ui.to}.csv`; a.click(); return;
  }
  if (act === 'atthist') { const a = ui.att.rows.find(r => r.id === d.id); return openModal('<h2 style="margin-top:0">Correction history</h2>' + a.corrections.map(c => `<div style="padding:8px 0;border-bottom:1px solid var(--line)"><b>${esc(c.by)}</b> <span class="mute" style="font-size:12px">${new Date(c.at).toLocaleString('en-PH')}</span><br>${esc(c.reason)}<br><span class="mute" style="font-size:12px">Before: ${esc(c.before.timeIn || '')} → ${esc(c.before.timeOut || '')}<br>After: ${esc(c.after.timeIn || '')} → ${esc(c.after.timeOut || '')}</span></div>`).join('') + '<br><button class="btn ghost" data-act="close">Close</button>'); }
  if (act === 'attfix') {
    const a = ui.att.rows.find(r => r.id === d.id), hhmm = iso => iso ? new Date(iso).toTimeString().slice(0, 5) : '';
    return openModal(`<h2 style="margin-top:0">Correct attendance</h2><p>${esc(a.staffName)} · ${esc(a.date)}</p><label>Time in</label><input id="fx-in" type="time" value="${hhmm(a.timeIn)}"><label>Time out</label><input id="fx-out" type="time" value="${hhmm(a.timeOut)}">
      <label>Reason (required, kept in the audit trail)</label><input id="fx-reason" maxlength="300" placeholder="e.g. Tablet was offline, confirmed by branch manager"><p id="fx-err" style="color:var(--bad)"></p><div class="row"><button class="btn" data-act="attfixgo" data-id="${a.id}">Save correction</button><button class="btn ghost" data-act="close">Cancel</button></div>`);
  }
  if (act === 'attfixgo') {
    const v = i => document.getElementById(i).value;
    try { await api('PUT', '/api/attendance/' + d.id + '/correct', { timeIn: v('fx-in'), timeOut: v('fx-out') || undefined, reason: v('fx-reason') }); closeModal(); await loadView(); render(); } catch (x) { document.getElementById('fx-err').textContent = x.message; } return;
  }
  if (act === 'saverules') { try { await api('PUT', '/api/settings', { payRules: { lunchAmount: document.getElementById('pr-lunch').value, lunchLateMins: document.getElementById('pr-ll').value, allowLateMins: document.getElementById('pr-al').value } }); await loadView(); render(); alert('Pay rules saved. They apply to attendance from now on and to unpaid days.'); } catch (x) { alert(x.message); } return; }
  if (act === 'svcsave') {
    const ids = [...el.closest('tr').querySelectorAll('[data-svc]:checked')].map(x => x.value);
    try { await api('PUT', `/api/staff/${d.id}/services`, { itemIds: ids }); await loadView(); render(); alert(ids.length ? 'Saved.' : 'Saved: this barber does every service.'); } catch (x) { alert(x.message); } return;
  }
  if (act === 'schedsave' || act === 'schedclear') {
    const row = el.closest('tr'); let days = null;
    if (act === 'schedsave') {
      days = [];
      for (let wd = 0; wd < 7; wd++) {
        const off = row.querySelector(`[data-off][data-wd="${wd}"]`).checked, a = row.querySelector(`[data-a][data-wd="${wd}"]`).value, z = row.querySelector(`[data-z][data-wd="${wd}"]`).value;
        if (off) days.push('off'); else if (a && z) days.push({ start: a, end: z }); else if (a || z) return alert(WDAYS[wd] + ': enter both a start and an end time, or leave both empty for the branch hours.'); else days.push(null);
      }
    }
    try { await api('PUT', '/api/schedules/' + d.id, { days }); await loadView(); render(); alert(days ? 'Hours saved.' : 'Back to the branch opening hours.'); } catch (x) { alert(x.message); } return;
  }
  if (act === 'savemvp') { const ids = [...document.querySelectorAll('[data-mvp]:checked')].map(x => x.value); try { await api('PUT', '/api/settings', { mvpBranches: ids }); await loadView(); render(); alert(ids.length ? 'Saved. The new booking system is on in: ' + ids.map(brName).join(', ') + '.' : 'Saved. The new booking system is off in every branch.'); } catch (x) { alert(x.message); } return; }
  if (act === 'savepinonly') { try { await api('PUT', '/api/settings', { pinOnly: document.getElementById('pin-only').checked }); await loadView(); render(); alert('Saved.'); } catch (x) { alert(x.message); } return; }
  if (act === 'devoff') { if (!confirm('Switch off this phone? Staff can no longer log in on it until it is set up again. If it was lost, also reset the PINs of the people who used it (see Activity).')) return; try { await api('DELETE', '/api/devices/' + el.dataset.id); await loadView(); render(); } catch (x) { alert(x.message); } return; }
  if (act === 'saveatt') { try { await api('PUT', '/api/settings', { attPhoto: document.getElementById('at-photo').checked, attGeo: document.getElementById('at-geo').checked }); await loadView(); render(); alert('Attendance settings saved.'); } catch (x) { alert(x.message); } return; }
  if (act === 'advhist') {
    const a = ui.adv.rows.find(r => r.id === d.id);
    return openModal(`<h2 style="margin-top:0">${esc(a.staffName)} · ${esc(a.type)}</h2><p class="mute">${esc(a.reason)}</p>
      <h3>Deduction schedule</h3>${a.deductions.map(x => `<div class="row" style="justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line)"><span>#${x.seq} · ${esc(x.dueDate)}</span><b>${peso(x.amount)}</b><span class="tag">${x.status === 'APPLIED' ? 'Deducted ' + esc((x.appliedAt || '').slice(0, 10)) : 'Scheduled'}</span></div>`).join('') || '<p class="mute">Not released yet, so nothing is scheduled.</p>'}
      <h3 style="margin-top:14px">History</h3>${a.history.map(h => `<div style="padding:6px 0;border-bottom:1px solid var(--line)"><b>${esc(h.action)}</b> · ${esc(h.by)} <span class="mute" style="font-size:12px">${new Date(h.at).toLocaleString('en-PH')}</span>${h.note ? '<br>' + esc(h.note) : ''}</div>`).join('')}<br><button class="btn ghost" data-act="close">Close</button>`);
  }
  if (act === 'advapprove') {
    const a = ui.adv.rows.find(r => r.id === d.id);
    return openModal(`<h2 style="margin-top:0">Approve request</h2><p>${esc(a.staffName)} · ${esc(a.type)} · requested <b>${peso(a.amount)}</b><br><span class="mute">${esc(a.reason)}</span></p>
      <label>Approved amount (₱)</label><input id="ap-amt" type="number" value="${a.amount}"><label>Installments (one per payroll)</label><input id="ap-inst" type="number" min="1" max="12" value="${a.installments}">
      <label>First deduction date</label><input id="ap-first" type="date" value="${today()}"><label>Note (optional)</label><input id="ap-note">
      <label class="chk" style="display:flex;gap:10px;align-items:flex-start;text-transform:none;letter-spacing:0;font-size:13.5px;color:var(--text);font-weight:500"><input type="checkbox" id="ap-consent" style="width:20px;height:20px;accent-color:#000;flex:none"><span>I have the employee's <b>written authorization</b> to deduct this amount from their wages.</span></label>
      <p id="ap-err" style="color:var(--bad)"></p><div class="row"><button class="btn" data-act="advapprovego" data-id="${a.id}">Approve</button><button class="btn ghost" data-act="close">Cancel</button></div>`);
  }
  if (act === 'advapprovego') {
    const v = i => document.getElementById(i);
    try { await api('PUT', '/api/advances/' + d.id + '/approve', { approvedAmt: +v('ap-amt').value, installments: +v('ap-inst').value, firstDue: v('ap-first').value, note: v('ap-note').value, consent: v('ap-consent').checked }); closeModal(); await loadView(); render(); } catch (x) { v('ap-err').textContent = x.message; } return;
  }
  if (act === 'advrelease') {
    const a = ui.adv.rows.find(r => r.id === d.id), only = a.type === 'Other Authorized Deduction';
    return openModal(`<h2 style="margin-top:0">${only ? 'Start deduction' : 'Release the money'}</h2><p>${esc(a.staffName)} · approved <b>${peso(a.approvedAmt)}</b> in ${a.installments} installment(s)</p>
      ${only ? '<p class="mute">This is a deduction only. No money is paid out.</p>' : `<label>Actual amount released (₱)</label><input id="rl-amt" type="number" value="${a.approvedAmt}"><label>Payment method</label><select id="rl-method">${['Cash', 'GCash', 'Maya', 'Bank Transfer', 'Other'].map(m => `<option>${m}</option>`).join('')}</select>
      <label>Proof of release (photo)</label><input id="rl-file" type="file" accept="image/*" capture="environment"><img id="rl-prev" alt="" style="display:none;width:100%;margin-top:8px;border-radius:12px">`}
      <label>Note (optional)</label><input id="rl-note"><p id="rl-err" style="color:var(--bad)"></p><div class="row"><button class="btn" data-act="advreleasego" data-id="${a.id}" data-only="${only ? 1 : ''}">${only ? 'Start deduction' : 'Confirm release'}</button><button class="btn ghost" data-act="close">Cancel</button></div>`);
  }
  if (act === 'advreleasego') {
    const v = i => document.getElementById(i);
    try {
      let proofId = ''; if (!d.only) { const file = v('rl-file').files[0]; if (!file) throw new Error('Upload a photo as proof of release first'); proofId = (await api('POST', '/api/files', { data: await resizeToJpeg(file, 1300), kind: 'release', branchId: ui.adv.rows.find(r => r.id === d.id).branchId })).id; }
      await api('PUT', '/api/advances/' + d.id + '/release', d.only ? { note: v('rl-note').value } : { releasedAmt: +v('rl-amt').value, method: v('rl-method').value, proofId, note: v('rl-note').value });
      closeModal(); await loadView(); render();
    } catch (x) { v('rl-err').textContent = x.message; } return;
  }
  if (act === 'advreject' || act === 'advcancel') {
    const note = prompt(act === 'advreject' ? 'Why is this request rejected? The cashier will see this note.' : 'Reason for cancelling (optional)'); if (note === null) return;
    if (act === 'advreject' && !note.trim()) return alert('A note is required.');
    try { await api('PUT', '/api/advances/' + d.id + '/' + (act === 'advreject' ? 'reject' : 'cancel'), { note }); await loadView(); render(); } catch (x) { alert(x.message); } return;
  }
  if (act === 'viewfiles') { e.preventDefault(); return showFiles(String(d.ids).split(',').filter(Boolean), 'Receipt photos'); }
  if (act === 'expcsv') return download(`/api/expense-claims?${qs()}&status=${ui.estatus || ''}&category=${encodeURIComponent(ui.ecat || '')}&format=csv`, 'expenses.csv');
  if (act === 'exphist') { const x = ui.exp.rows.find(r => r.id === d.id); return openModal('<h2 style="margin-top:0">Expense history</h2>' + x.history.map(h => `<div style="padding:8px 0;border-bottom:1px solid var(--line)"><b>${esc(h.action)}</b> · ${esc(h.by)}<br><span class="mute" style="font-size:12px">${new Date(h.at).toLocaleString('en-PH')}</span>${h.note ? '<br>' + esc(h.note) : ''}</div>`).join('') + '<br><button class="btn ghost" data-act="close">Close</button>'); }
  if (act === 'expreview') {
    const action = d.a, note = action === 'approve' ? '' : prompt('Why is this expense rejected? The submitter will see this note.'); if (note === null) return;
    if (action !== 'approve' && !String(note).trim()) return alert('A note is required.');
    try { await api('PUT', '/api/expense-claims/' + d.id + '/review', { action, note }); await loadView(); render(); } catch (x) { alert(x.message); } return;
  }
  if (act === 'viewfile') { e.preventDefault(); return showIdPhoto(d.id, '/api/files/', 'Remittance proof'); }
  if (act === 'rmhist') { const x = ui.remit.rows.find(r => r.id === d.id); return openModal('<h2 style="margin-top:0">Submission history</h2>' + x.history.map(h => `<div style="padding:8px 0;border-bottom:1px solid var(--line)"><b>${esc(h.action)}</b> · ${esc(h.by)}<br><span class="mute" style="font-size:12px">${new Date(h.at).toLocaleString('en-PH')}</span>${h.note ? '<br>' + esc(h.note) : ''}</div>`).join('') + '<br><button class="btn ghost" data-act="close">Close</button>'); }
  if (act === 'rmreview') {
    const action = d.a, note = action === 'verify' ? '' : prompt(action === 'flag' ? 'Why is this flagged?' : 'Why is this rejected? The cashier will see this note.'); if (note === null) return;
    if (action !== 'verify' && !String(note).trim()) return alert('A note is required.');
    try { await api('PUT', '/api/remittances/' + d.id + '/review', { action, note }); await loadView(); render(); } catch (x) { alert(x.message); } return;
  }
  if (act === 'viewid') { e.preventDefault(); return showIdPhoto(d.id); }
  if (act === 'logout') { token = ''; try { localStorage.removeItem('bp.token'); localStorage.removeItem('bp.master'); } catch (x) { } loggedIn = false; return render(); }
  if (act === 'edit') return form(d.kind, d.id);
  if (act === 'del') { if (confirm('Are you sure?')) mut(async () => { const r = await api('DELETE', `/api/${d.kind}/${d.id}`); if (r.deactivated) alert('This record has history, so it was deactivated instead of deleted.'); }); return; }
  if (act === 'export') return download(`/api/reports/${d.name}?${qs()}&format=csv`, `${d.name}-${ui.from}_${ui.to}.csv`);
  if (act === 'delreview') { if (confirm('Delete this review? It will disappear from the booking site.')) mut(async () => { await api('DELETE', `/api/reviews/${d.id}`); await loadView(); }); return; }
  if (act === 'resetuser') {
    const u = S.users.find(x => x.id === d.id); if (!u || !confirm(`Reset the ${['admin', 'owner', 'manager'].includes(u.role) ? 'password' : 'PIN'} of ${u.name}? Their current sign-in stops working immediately.`)) return;
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
  if (act === 'neworg') {
    const v = k => document.getElementById('og-' + k).value.trim(), body = { name: v('name'), code: v('code').toLowerCase(), branch: v('branch'), ownerUser: v('user').toLowerCase() };
    try { const r = await api('POST', '/api/orgs', body); await loadView(); render(); openModal(`<h3>Partner shop added</h3><p>Give these to the owner of <b>${esc(r.name)}</b> (privately):</p><table><tr><td>Back office</td><td><b>${esc(location.origin)}/backend</b></td></tr><tr><td>Shop code</td><td><b>${esc(r.code)}</b></td></tr><tr><td>Username</td><td><b>${esc(r.ownerUser)}</b></td></tr><tr><td>Temporary password</td><td><b style="font-family:monospace;font-size:16px">${esc(r.password)}</b></td></tr></table><p class="mute" style="font-size:12px">This password is shown only now. Ask them to change it in Settings after logging in.</p><button class="btn" data-act="close">Done</button>`); } catch (x) { alert(x.message); } return;
  }
  if (act === 'orgreset') {
    const o = (ui.orgs || []).find(x => x.id === d.id); if (!o || !confirm(`Make a new password for ${o.name}? Their old password stops working.`)) return;
    try { const r = await api('POST', `/api/orgs/${d.id}/reset`); openModal(`<h3>New password for ${esc(o.name)}</h3><p>Shop code <b>${esc(o.code)}</b>, username <b>${esc(r.ownerUser)}</b></p><p>Temporary password: <b style="font-family:monospace;font-size:16px">${esc(r.password)}</b></p><p class="mute" style="font-size:12px">Shown only now.</p><button class="btn" data-act="close">Done</button>`); } catch (x) { alert(x.message); } return;
  }
  if (act === 'orgpause') {
    const o = (ui.orgs || []).find(x => x.id === d.id); if (!o || !confirm(d.on === '1' ? `Resume ${o.name}? Their staff can log in again.` : `Pause ${o.name}? Nobody from that shop can log in until you resume it. Their data is kept.`)) return;
    try { await api('PUT', `/api/orgs/${d.id}`, { active: d.on === '1' }); await loadView(); render(); } catch (x) { alert(x.message); } return;
  }
  if (act === 'orgenter') {
    try { const r = await api('POST', `/api/orgs/${d.id}/enter`); try { localStorage.setItem('bp.master', token); } catch (x) { } token = r.token; try { localStorage.setItem('bp.token', token); } catch (x) { } ui.view = 'dashboard'; ui.branch = 'all'; await load(); } catch (x) { alert(x.message); } return;
  }
  if (act === 'leaveorg') {
    const m = masterToken(); if (!m) return; token = m; try { localStorage.setItem('bp.token', token); localStorage.removeItem('bp.master'); } catch (x) { } ui.view = 'settings'; ui.branch = 'all'; await load(); return;
  }
  if (act === 'saveownerpw') {
    const password = document.getElementById('op-cur').value, newPassword = document.getElementById('op-new').value;
    try { const r = await api('PUT', '/api/settings/owner-password', { password, newPassword }); token = r.token; try { localStorage.setItem('bp.token', token); } catch (x) { } alert('Password changed.'); await loadView(); render(); } catch (x) { alert(x.message); } return;
  }
  if (act === 'saveowner') {
    const username = document.getElementById('ou-name').value.trim(), password = document.getElementById('ou-pw').value;
    if (!password) return alert('Enter your current owner password to confirm.');
    try { await api('PUT', '/api/settings/owner-username', { username, password }); ui.ownerNamed = !!username; await loadView(); render(); alert(username ? 'Saved. From now on log in with the username "' + username.toLowerCase() + '" and your owner password.' : 'Saved. You can log in with a blank username again.'); } catch (x) { alert(x.message); } return;
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
  if (act === 'bkhistory') {
    const b = ui.bk.find(x => x.id === d.id), label = { booked: 'Booked', arrived: 'Arrived', cancelled: 'Cancelled', noshow: 'No-show' };
    try {
      const ev = await api('GET', `/api/bookings/${d.id}/history`);
      openModal(`<h2 style="margin-top:0">Booking history</h2><p class="mute" style="margin:-6px 0 10px">${b ? esc(b.customerName) + ' · ' + esc(b.date) + ' ' + esc(b.time) + ' · ' + b.items.map(i => esc(i.name) + ' ' + peso(i.price)).join(', ') : ''}</p>
        ${ev.length ? `<table data-nopg><tr><th>When</th><th>What</th><th>By</th><th>Note</th></tr>${ev.map(e => `<tr><td>${new Date(e.at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td><td><b>${esc(label[e.toStatus] || e.toStatus)}</b></td><td>${esc(e.actor)}</td><td>${esc(e.reason)}</td></tr>`).join('')}</table>` : '<p class="mute">This booking was made before history was recorded.</p>'}
        <div class="row" style="margin-top:14px"><button class="btn ghost" data-act="close">Close</button></div>`);
    } catch (x) { alert(x.message); }
    return;
  }
  if (act === 'bkcancel') { if (confirm('Cancel this booking?')) mut(() => api('PUT', `/api/bookings/${d.id}`, { status: 'cancelled' })); return; }
  if (act === 'backup') return download('/api/backup', `brotherhood-${today()}.db`);
  if (act === 'page') { ui.cust.page += +d.n; await loadView(); return render(); }
  if (act === 'paid') {
    if (!confirm(`Mark ${ui.picked.size} barber(s) as paid (all unpaid days up to ${ui.to})?`)) return;
    mut(() => api('POST', '/api/payroll/pay', { staffIds: [...ui.picked], from: ui.rp === 'all' ? '2000-01-01' : ui.from, to: ui.to })).then(() => ui.picked.clear());
  }
  if (act === 'paydays') {
    const tb = ui.rep && ui.rep.tables && ui.rep.tables[0], list = (tb && tb.detail && tb.detail[d.id]) || [], name = (S.staff.find(s => s.id === d.id) || {}).name || '', by = new Map(list.map(x => [x.date, x]));
    const dates = []; if (ui.rp !== 'all') { for (let c = ui.from; c <= ui.to && dates.length < 62; c = addDays(c, 1)) dates.push(c); } else list.forEach(x => dates.push(x.date));
    const hm = iso => iso ? new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }) : '';
    let tot = 0; const rows = dates.map(dt => { const x = by.get(dt); if (!x) return `<tr><td>${dt}</td><td colspan="7" class="mute">No time-in</td></tr>`; const pay = x.commission + x.topup + x.lunch - x.advance; if (!x.paid) tot += pay; return `<tr><td>${dt}</td><td>${hm(x.timeIn)}${x.lateMins ? ` <span class="mute">(${x.lateMins} min late)</span>` : ''}</td><td>${peso(x.commission)}</td><td>${peso(x.topup)}${x.allowLost ? ' <span class="mute">no allowance</span>' : ''}</td><td>${peso(x.lunch)}${x.lunchLost ? ' <span class="mute">no lunch</span>' : ''}</td><td>${x.advance ? '−' + peso(x.advance) : ''}</td><td><b>${peso(pay)}</b></td><td>${x.paid ? '<span class="tag" style="color:var(--ok)">Paid</span>' : 'Unpaid'}</td></tr>`; }).join('');
    return openModal(`<h2 style="margin-top:0">${esc(name)} · ${ui.rp === 'all' ? 'all unpaid days' : ui.from === ui.to ? ui.from : ui.from + ' → ' + ui.to}</h2><div class="overflow"><table><tr><th>Date</th><th>Time in</th><th>Commission</th><th>Top-up</th><th>Lunch</th><th>Advance</th><th>Day pay</th><th></th></tr>${rows}</table></div><p style="margin:10px 0"><b>Unpaid total (before bonuses and deductions): ${peso(tot)}</b></p><button class="btn ghost" data-act="close">Close</button>`);
  }
});
document.addEventListener('keydown', e => {
  if (e.target.id !== 'navq') return;
  if (e.key === 'Escape') { ui.navQ = ''; e.target.value = ''; const g = document.getElementById('navgroups'); if (g) g.innerHTML = navGroups(); }
  if (e.key === 'Enter') { const b = document.querySelector('#navgroups button[data-view]'); if (b) { ui.navQ = ''; b.click(); } }
});
document.addEventListener('change', async e => {
  const t = e.target;
  if (t.dataset && t.dataset.pgn) { const st = ui.pg[t.dataset.pgn]; if (st) { st.n = +t.value; st.p = 1; paginateTables(); } return; }
  if (t.id === 'lstatus') { ui.lstatus = t.value; await loadView(); return render(); }
  if (t.id === 'pstatus') { ui.pstatus = t.value; await loadView(); return render(); }
  if (t.id === 'aflag') { ui.aflag = t.checked; await loadView(); return render(); }
  if (t.id === 'astatus') { ui.astatus = t.value; await loadView(); return render(); }
  if (t.id === 'estatus') { ui.estatus = t.value; await loadView(); return render(); }
  if (t.id === 'ecat') { ui.ecat = t.value; await loadView(); return render(); }
  if (t.id === 'rstatus') { ui.rstatus = t.value; await loadView(); return render(); }
  if (t.id === 'branchsel' || t.id === 'branchsel2') { ui.pg = {}; ui.branch = t.value; render(); await loadView(); return render(); }
  if (t.id === 'tierf') { ui.cust.tier = t.value; ui.cust.page = 1; await loadView(); return render(); }
  if (t.id === 'dpreset') { ui.pg = {}; ui.rp = t.value; if (t.value !== 'custom') [ui.from, ui.to] = presetRange(t.value); render(); await loadView(); return render(); }
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
  if (e.target.id === 'navq') { ui.navQ = e.target.value; const g = document.getElementById('navgroups'); if (g) g.innerHTML = navGroups(); return; }
  if (e.target.id === 'csearch') { ui.cust.q = e.target.value; ui.cust.page = 1; clearTimeout(searchTimer); searchTimer = setTimeout(async () => { await loadView(); const p = e.target.selectionStart; render(); const s = document.getElementById('csearch'); s.focus(); s.setSelectionRange(p, p); }, 300); }
});
document.addEventListener('submit', e => {
  const f = e.target; if (!f.dataset.form) return; e.preventDefault();
  const fd = new FormData(f), kind = f.dataset.form, id = f.dataset.id, err = f.querySelector('#err');
  if (kind === 'login') {
    orgCode = String(fd.get('org') || '').trim().toLowerCase(); try { if (orgCode) localStorage.setItem('bp.org', orgCode); else localStorage.removeItem('bp.org'); } catch (x) { }
    api('POST', '/api/login', { username: fd.get('username'), password: fd.get('password') })
      .then(j => { token = j.token; try { localStorage.setItem('bp.token', token); } catch (x) { } return load(); }).catch(x => { if (err) err.textContent = x.message; });
    return;
  }
  const o = {};
  for (const [k, v] of fd.entries()) { if ((k === 'password' && !v) || k === 'branchIds') continue; o[k] = ['price', 'commission', 'mins', 'pct', 'allowance', 'active', 'value', 'sort', 'graceMins', 'defaultPct', 'bookable', 'apptOnly', 'consent'].includes(k) ? +v : v; }
  if (kind === 'users' && o.role === 'manager') o.branchIds = fd.getAll('branchIds');
  run(async () => { const r = await (id ? api('PUT', `/api/${kind}/${id}`, o) : api('POST', `/api/${kind}`, o)); if (r && r.pin) alert(`New PIN for ${r.name}: ${r.pin}\nGive it to them now. It is shown only once.`); }, err);
});

fetch('/api/public/login-hint').then(r => r.json()).then(j => { ui.ownerNamed = !!j.ownerNamed; if (!loggedIn) render(); }).catch(() => { });
setInterval(() => { if (!document.hidden) pollNotif(false); }, 15000);
setTimeout(() => pollNotif(true), 2500);
load().then(() => setInterval(() => { if (loggedIn && !modal.open && ui.view === 'dashboard' && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) load(); }, 15000));
render();


// ---------- partner shop plans (Brotherhood owner) ----------
const fmtD = s => s ? new Date(s + 'T00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
function planTag(st) {
  if (!st) return '';
  const [c, bg, t] = { paid: ['var(--ok)', 'rgba(62,207,142,.13)', 'Paid until ' + fmtD(st.until)], trial: ['#1f6feb', 'rgba(31,123,255,.12)', 'Free trial · ' + st.daysLeft + ' day' + (st.daysLeft === 1 ? '' : 's') + ' left'],
    expired: ['var(--bad)', 'rgba(255,93,108,.13)', 'Ended ' + fmtD(st.until)], free: ['var(--mute)', 'var(--s3)', 'No plan (free)'], paused: ['var(--mute)', 'var(--s3)', 'Paused'] }[st.state] || ['var(--mute)', 'var(--s3)', st.state];
  return `<span class="tag" style="color:${c};background:${bg}">${esc(t)}</span>${st.planName ? ` <span class="mute" style="font-size:12px">${esc(st.planName)}</span>` : ''}`;
}
function planLine(o) {
  const st = o && o.status; if (!st || st.state === 'free' || st.state === 'paused') return '';
  const p = (o.plans || []).find(x => x.id === st.plan), price = p ? `${esc(p.name)} plan, ${peso(p.price)} a month` : 'your plan';
  const how = o.payInfo ? `<div style="white-space:pre-line;margin-top:4px">${esc(o.payInfo)}</div>` : (o.contact ? ` Contact <a href="mailto:${esc(o.contact)}">${esc(o.contact)}</a> to pay.` : '');
  const msg = st.state === 'trial' ? `<b>Free trial:</b> ${st.daysLeft} day${st.daysLeft === 1 ? '' : 's'} left (until ${fmtD(st.until)}). After that, ${price}.${st.daysLeft <= 7 ? how : ''}`
    : st.state === 'paid' ? `<b>${p ? esc(p.name) + ' plan' : 'Plan'}</b> paid until ${fmtD(st.until)}.${st.daysLeft <= 7 ? how : ''}`
    : `<b style="color:var(--bad)">Your ${st.paidUntil ? 'plan' : 'free trial'} ended on ${fmtD(st.until)}.</b> You can still view everything, but you cannot add bookings or services until you renew (${price}).${how}`;
  return `<div style="font-size:13px;margin-top:6px">${msg}</div>`;
}
function plansEditor() {
  const P = ui.plans; if (!P) return '';
  return `<details style="margin:16px 0 4px"><summary style="cursor:pointer;font-weight:700">Plans, prices and how shops pay you</summary>
    <p class="mute" style="font-size:12px;margin:8px 0">New shops get a ${P.trialDays}-day free trial. Prices are per month. Shops see these on the sign-up page and in their back office.</p>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px">${P.plans.map(p => `<div><label>${esc(p.name)} (₱ a month)</label><input type="number" min="0" id="pl-${p.id}" value="${p.price}"><input id="pd-${p.id}" value="${esc(p.desc)}" style="margin-top:6px;font-size:12px"></div>`).join('')}</div>
    <label>How shops pay you (shown to shops near the end of their trial)</label><textarea id="pl-info" rows="3" placeholder="e.g. GCash 09XX XXX XXXX (Juan D.) or BPI 1234-5678-90. Send the screenshot to our email.">${esc(P.payInfo)}</textarea>
    <button class="btn sm" data-mk="saveplans" style="margin-top:8px">Save plans</button></details>`;
}
async function billModal(id) {
  const o = (ui.orgs || []).find(x => x.id === id); if (!o) return;
  let pays = []; try { pays = await api('GET', `/api/orgs/${id}/payments`); } catch (x) { }
  const P = (ui.plans && ui.plans.plans) || [], KIND = { owner: 'Shop owner with barbers', renter: 'Chair renter', suite: 'Own suite or studio', student: 'Student barber' };
  openModal(`<h2 style="margin-top:0">${esc(o.name)}</h2><p class="mute" style="margin:-6px 0 10px">${planTag(o.status)}</p>
    <table data-nopg><tr><td class="mute">Owner</td><td>${esc(o.ownerName || o.ownerUser)}</td></tr><tr><td class="mute">Email</td><td>${esc(o.email || '—')}</td></tr><tr><td class="mute">Mobile</td><td>${esc(o.phone || '—')}</td></tr>
      <tr><td class="mute">Type</td><td>${esc(KIND[o.kind] || '—')}</td></tr><tr><td class="mute">Shop code</td><td><b>${esc(o.code)}</b></td></tr><tr><td class="mute">Joined</td><td>${esc(String(o.createdAt).slice(0, 10))}${o.source === 'signup' ? ' (self sign-up)' : ''}</td></tr><tr><td class="mute">Total paid</td><td>${peso(o.paid)}</td></tr></table>
    <h3 style="margin:16px 0 4px">Record a payment</h3><p class="mute" style="font-size:12px;margin:0 0 6px">This moves "paid until" forward and emails the shop a confirmation. Issue your own BIR invoice for it and write its number here.</p>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px">
      <div><label>Amount (₱)</label><input type="number" min="0" step="any" id="bp-amount" value="${(P.find(x => x.id === (o.plan || 'shop')) || {}).price || ''}"></div>
      <div><label>Months</label><input type="number" min="1" max="24" id="bp-months" value="1"></div>
      <div><label>Plan</label><select id="bp-plan">${P.map(p => `<option value="${p.id}" ${(o.plan || 'shop') === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
      <div><label>Paid with</label><select id="bp-method">${['GCash', 'Maya', 'Bank transfer', 'Cash', 'Other'].map(m => `<option>${m}</option>`).join('')}</select></div>
      <div><label>Reference no.</label><input id="bp-ref"></div><div><label>Your BIR invoice no.</label><input id="bp-inv"></div></div>
    <p id="bp-err" style="color:var(--bad);min-height:18px"></p><button class="btn" data-mk="pay" data-id="${o.id}">Save payment</button>
    <details style="margin-top:14px"><summary style="cursor:pointer;font-weight:700">Change plan or dates by hand</summary>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-top:6px">
        <div><label>Plan</label><select id="bo-plan"><option value="">No plan (free)</option>${P.map(p => `<option value="${p.id}" ${o.plan === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
        <div><label>Free trial until</label><input type="date" id="bo-trial" value="${esc(o.trialEnds || '')}"></div><div><label>Paid until</label><input type="date" id="bo-paid" value="${esc(o.paidUntil || '')}"></div></div>
      <p class="mute" style="font-size:12px">Leave both dates blank for a free shop with no end date.</p><button class="btn sm" data-mk="planset" data-id="${o.id}">Save</button></details>
    <h3 style="margin:16px 0 4px">Payments</h3>${pays.length ? `<table data-nopg><tr><th>Date</th><th>Amount</th><th>Months</th><th>Paid with</th><th>Ref</th><th>Invoice</th></tr>${pays.map(x => `<tr><td>${esc(String(x.paidAt).slice(0, 10))}</td><td>${peso(x.amount)}</td><td>${x.months}</td><td>${esc(x.method)}</td><td>${esc(x.ref)}</td><td>${esc(x.invoiceNo)}</td></tr>`).join('')}</table>` : '<p class="mute">No payments yet.</p>'}
    <div class="row" style="margin-top:14px"><button class="btn ghost" data-act="close">Close</button></div>`);
}

// ---------- email marketing ----------
const MK_WHO = [['all', 'Everyone who said yes to emails'], ['lapsed', "Haven't come back in a while"], ['new', 'Signed up, no visit yet'], ['regular', 'Regulars (5 or more visits)'], ['tier', 'A loyalty tier']];
const MK_TPL = {
  promo: ['This week only at {shop}', 'Hi {name},\n\nThis week only, get 20% off any haircut from Monday to Thursday. Just show this email at the shop.\n\nSee you soon!', 'Book now'],
  service: ['New at {shop}', 'Hi {name},\n\nWe now offer a new service: hair color and highlights by our senior barbers.\n\nBook a slot in the app and try it this month.', 'See services'],
  hours: ['Holiday hours at {shop}', 'Hi {name},\n\nHeads up: we close early at 5 PM on December 24 and we are closed on December 25. We are back to normal hours on December 26.\n\nBook ahead so you look sharp for the holidays.', 'Book ahead'],
  miss: ['We miss you, {name}', 'Hi {name},\n\nIt has been a while since your last cut at {shop}. Your barber is ready when you are.\n\nBook your next visit in the app and skip the wait.', 'Book my cut']
};
function vMkt() {
  const m = ui.mkt; if (!m) return '<p class="mute">Loading…</p>';
  const w = m.winback, ready = !!m.provider;
  const conn = ready ? `<p style="margin:0"><b style="color:var(--ok)">● Connected</b> · sending ${m.provider === 'gmail' ? 'through Gmail' : 'through Resend'} as <b>${esc(m.from)}</b></p>
      <p class="mute" style="font-size:13px;margin:6px 0 0">Today: <b>${m.sentToday}</b> of ${m.limit} sent${m.pending ? ` · <b>${m.pending}</b> waiting (sent a few every minute)` : ''}. ${m.provider === 'gmail' ? 'A Gmail account can send about 500 emails a day, so big lists are sent over several days automatically.' : ''}</p>`
    : (m.isOrg ? '<p style="margin:0"><b style="color:var(--bad)">● Email is not turned on yet.</b> Ask Brotherhood to connect it.</p>'
      : `<p style="margin:0 0 6px"><b style="color:var(--bad)">● Not connected yet.</b> Connect a Gmail account (5 minutes):</p><ol style="margin:0;padding-left:20px;font-size:13px;line-height:1.7">
        <li>Use a Gmail just for the shop (e.g. brotherhoodbarber.ph@gmail.com). Turn on <b>2-Step Verification</b> in its Google Account.</li>
        <li>Google Account → Security → <b>App passwords</b> → make one named "Brotherhood". Copy the 16 letters.</li>
        <li>Railway → your service → <b>Variables</b>: add <code>GMAIL_USER</code> = the Gmail address and <code>GMAIL_APP_PASSWORD</code> = the 16 letters. Railway restarts by itself.</li></ol>`);
  return `<h2>Email Marketing</h2>
  <div class="card" style="margin-bottom:14px">${conn}<p class="mute" style="font-size:12px;margin:10px 0 0"><b>${m.subscribers}</b> customer${m.subscribers === 1 ? '' : 's'} said yes to emails. Only they get promos, and every email has an unsubscribe link (Data Privacy Act).</p></div>
  <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(340px,1fr));align-items:start">
  <div class="card"><h3>New email</h3>
    <label>Send to</label><select id="mk-who">${MK_WHO.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>
    <div id="mk-days-w" hidden><label>No visit in the last (days)</label><input type="number" id="mk-days" min="7" max="365" value="45"></div>
    <div id="mk-tier-w" hidden><label>Tier</label><select id="mk-tier">${m.tiers.map(t => `<option>${esc(t)}</option>`).join('')}</select></div>
    ${S.branches.length > 1 ? `<label>Branch</label><select id="mk-branch"><option value="">All branches</option>${S.branches.map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select>` : ''}
    <p style="margin:8px 0 0;font-weight:700" id="mk-count">…</p>
    <label style="margin-top:14px">Start from</label><div class="row" style="gap:6px">${[['promo', 'Promo'], ['service', 'New service'], ['hours', 'Holiday hours'], ['miss', 'We miss you']].map(([k, l]) => `<button class="btn ghost sm" data-mk="tpl" data-k="${k}">${l}</button>`).join('')}</div>
    <label>Subject</label><input id="mk-subject" maxlength="150" placeholder="e.g. This week only at {shop}">
    <label>Message</label><textarea id="mk-body" rows="8" placeholder="Hi {name}, ..."></textarea>
    <p class="mute" style="font-size:12px;margin:4px 0 0">{name} becomes the customer's first name, {shop} your shop name. Leave a blank line between paragraphs.</p>
    <div class="grid" style="grid-template-columns:1fr 1.4fr;gap:8px"><div><label>Button text</label><input id="mk-btn" maxlength="40" placeholder="Book now"></div><div><label>Button link <span class="mute">(optional)</span></label><input id="mk-url" placeholder="Booking app (default)"></div></div>
    <label>Send a test first</label><div class="row" style="flex-wrap:nowrap"><input id="mk-to" type="email" placeholder="your email" style="flex:1"><button class="btn ghost" data-mk="test">Send test</button></div>
    <p id="mk-err" style="color:var(--bad);min-height:18px"></p>
    <button class="btn" data-mk="send" style="width:100%;justify-content:center;padding:12px" ${ready ? '' : 'disabled'}>Send</button></div>
  <div class="card"><h3>Automatic: "We miss you"</h3>
    <p class="mute" style="font-size:13px;margin:0 0 8px">When a customer has not come back for some days, they get this email once. It is checked every hour.</p>
    <label class="chk" style="display:flex;gap:10px;align-items:center;text-transform:none;letter-spacing:0;font-size:14px;color:var(--text);font-weight:600"><input type="checkbox" id="wb-on" ${w.on ? 'checked' : ''} style="width:20px;height:20px;accent-color:#000">Turn on</label>
    <label>Send after no visit for (days)</label><input type="number" id="wb-days" min="14" max="180" value="${w.days}">
    <label>Subject</label><input id="wb-subject" maxlength="150" value="${esc(w.subject)}">
    <label>Message</label><textarea id="wb-body" rows="6">${esc(w.body)}</textarea>
    <label>Button text</label><input id="wb-btn" maxlength="40" value="${esc(w.btnText || '')}">
    <p class="mute" style="font-size:12px">Sent so far: ${m.winbackSent}</p><button class="btn sm" data-mk="wbsave">Save</button></div>
  </div>
  <div class="card overflow" style="margin-top:14px"><h3>Sent emails</h3>${m.campaigns.length ? `<table><tr><th>Date</th><th>Subject</th><th>Sent to</th><th>People</th><th>Sent</th><th>Waiting</th><th>Failed</th></tr>${m.campaigns.map(c => `<tr><td>${new Date(c.createdAt).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td><td><b>${esc(c.subject)}</b><br><span class="mute" style="font-size:12px">by ${esc(c.createdBy)}</span></td>
    <td>${esc((MK_WHO.find(x => x[0] === c.audience.who) || ['', ''])[1])}${c.audience.who === 'lapsed' ? ' (' + c.audience.days + ' days)' : c.audience.who === 'tier' ? ' (' + esc(c.audience.tier) + ')' : ''}${c.audience.branchId ? ' · ' + esc(brName(c.audience.branchId)) : ''}</td><td>${c.total}</td><td>${c.stats.sent || 0}</td><td>${c.stats.pending || 0}</td><td>${c.stats.failed ? '<b style="color:var(--bad)">' + c.stats.failed + '</b>' : 0}</td></tr>`).join('')}</table>` : '<p class="mute">Nothing sent yet.</p>'}</div>`;
}
const mkAud = () => ({ who: document.getElementById('mk-who')?.value || 'all', days: +(document.getElementById('mk-days')?.value || 45), tier: document.getElementById('mk-tier')?.value || '', branchId: document.getElementById('mk-branch')?.value || '' });
const mkMsg = () => ({ subject: document.getElementById('mk-subject').value, body: document.getElementById('mk-body').value, btnText: document.getElementById('mk-btn').value, btnUrl: document.getElementById('mk-url').value, audience: mkAud() });
let mkTimer;
function mkCount() {
  const el = document.getElementById('mk-count'); if (!el) return; const a = mkAud();
  document.getElementById('mk-days-w').hidden = a.who !== 'lapsed'; document.getElementById('mk-tier-w').hidden = a.who !== 'tier';
  clearTimeout(mkTimer); mkTimer = setTimeout(async () => { try { const r = await api('POST', '/api/marketing/count', { audience: a }); ui.mkCount = r.count; el.textContent = `→ ${r.count} ${r.count === 1 ? 'person' : 'people'}`; } catch (x) { el.textContent = ''; } }, 250);
}
new MutationObserver(() => { if (ui.view === 'mkt' && document.getElementById('mk-count') && document.getElementById('mk-count').textContent === '…') mkCount(); }).observe(document.getElementById('view'), { childList: true });
document.addEventListener('change', e => { if (/^mk-(who|days|tier|branch)$/.test(e.target.id)) mkCount(); });
document.addEventListener('input', e => { if (e.target.id === 'mk-days') mkCount(); });
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-mk]'); if (!el || el.disabled) return; e.preventDefault();
  const k = el.dataset.mk, err = document.getElementById('mk-err'); if (err) err.textContent = '';
  if (k === 'tpl') { const [s, b, btn] = MK_TPL[el.dataset.k]; document.getElementById('mk-subject').value = s; document.getElementById('mk-body').value = b; document.getElementById('mk-btn').value = btn; if (el.dataset.k === 'miss') { document.getElementById('mk-who').value = 'lapsed'; mkCount(); } return; }
  if (k === 'test') { const to = document.getElementById('mk-to').value.trim(); el.disabled = true; try { await api('POST', '/api/marketing/test', { ...mkMsg(), to }); alert('Test sent to ' + to + '. Check the inbox (and the Spam folder).'); } catch (x) { err.textContent = x.message; } el.disabled = false; return; }
  if (k === 'send') {
    const msg = mkMsg(), n = ui.mkCount; if (!n) { err.textContent = 'Nobody in this group yet. Choose another group.'; return; }
    if (!confirm(`Send "${msg.subject}" to ${n} ${n === 1 ? 'person' : 'people'}? This cannot be undone.`)) return;
    el.disabled = true; try { const r = await api('POST', '/api/marketing/send', msg); ui.mkt = await api('GET', '/api/marketing'); render(); alert(`Sending to ${r.total} people.${r.days > 1 ? ` Because of the daily limit it takes about ${r.days} days.` : ' It takes a few minutes.'}`); } catch (x) { err.textContent = x.message; el.disabled = false; } return;
  }
  if (k === 'wbsave') { const v = id => document.getElementById(id).value; try { await api('PUT', '/api/marketing/winback', { on: document.getElementById('wb-on').checked, days: +v('wb-days'), subject: v('wb-subject'), body: v('wb-body'), btnText: v('wb-btn') }); ui.mkt = await api('GET', '/api/marketing'); render(); alert('Saved.'); } catch (x) { alert(x.message); } return; }
  if (k === 'saveplans') { const P = ui.plans.plans.map(p => ({ id: p.id, price: +document.getElementById('pl-' + p.id).value, desc: document.getElementById('pd-' + p.id).value })); try { ui.plans = { ...ui.plans, ...(await api('PUT', '/api/orgs/plans', { plans: P, payInfo: document.getElementById('pl-info').value })) }; alert('Plans saved.'); } catch (x) { alert(x.message); } return; }
  if (k === 'bill') return billModal(el.dataset.id);
  if (k === 'pay') {
    const v = id => document.getElementById(id).value, body = { amount: +v('bp-amount'), months: +v('bp-months'), plan: v('bp-plan'), method: v('bp-method'), ref: v('bp-ref'), invoiceNo: v('bp-inv') };
    try { const r = await api('POST', `/api/orgs/${el.dataset.id}/payments`, body); ui.orgs = await api('GET', '/api/orgs'); await billModal(el.dataset.id); render(); alert('Saved. Paid until ' + fmtD(r.paidUntil) + '.'); } catch (x) { document.getElementById('bp-err').textContent = x.message; } return;
  }
  if (k === 'planset') {
    const v = id => document.getElementById(id).value;
    try { await api('PUT', `/api/orgs/${el.dataset.id}`, { plan: v('bo-plan'), trialEnds: v('bo-trial'), paidUntil: v('bo-paid') }); ui.orgs = await api('GET', '/api/orgs'); await billModal(el.dataset.id); render(); } catch (x) { alert(x.message); } return;
  }
});
