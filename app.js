// Brotherhood — barbershop operating system (bookings, POS, clients, staff, branches, reports)
const OPEN = 540, CLOSE = 1260; // 9:00 AM - 9:00 PM
const peso = n => '₱' + Number(n || 0).toLocaleString('en-PH');
const pad = n => String(n).padStart(2, '0');
const dstr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => dstr(new Date());
const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const toTime = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const fmt12 = t => { const m = toMin(t), h = Math.floor(m / 60); return `${h % 12 || 12}:${pad(m % 60)} ${h >= 12 ? 'PM' : 'AM'}`; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const addDays = (s, n) => { const d = new Date(s + 'T00:00'); d.setDate(d.getDate() + n); return dstr(d); };

// ---------- state ----------
const PUBLIC = location.pathname.startsWith('/book');
let S = { shop: 'Brotherhood', me: null, branches: [], barbers: [], services: [], clients: [], appts: [] };
let token = ''; try { token = localStorage.getItem('bp.token') || ''; } catch (e) { }
let loggedIn = PUBLIC, loadErr = '';
const ui = { view: 'dashboard', branch: 'all', date: today(), from: addDays(today(), -6), to: today(), q: '', audit: [] };
let ob = { branch: '', svc: [], barber: 'any', date: today(), time: '', name: '', phone: '', done: null };

async function api(method, url, body) {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && !PUBLIC && url !== '/api/login') { loggedIn = false; token = ''; render(); throw new Error(j.error || 'Login required'); }
  if (!r.ok) throw new Error(j.error || 'Request failed');
  return j;
}
async function load() {
  try {
    S = await api('GET', PUBLIC ? '/api/public' : '/api/state'); loggedIn = true; loadErr = '';
    if (PUBLIC && !ob.branch && S.branches.length === 1) ob.branch = S.branches[0].id;
  } catch (e) { loadErr = e.message; if (!PUBLIC) loggedIn = false; }
  if (!modal.open) render();
}
// run an API mutation, then refresh; show server errors (e.g. slot conflict)
async function mut(fn, errEl) {
  try { await fn(); await load(); return true; }
  catch (e) { if (errEl) errEl.textContent = e.message; else alert(e.message); return false; }
}
function run(fn, errEl) { mut(fn, errEl).then(ok => { if (ok) closeModal(); }); }

// ---------- lookups ----------
const isOwner = () => S.me?.role === 'owner';
const br = id => S.branches.find(x => x.id === id);
const svc = id => S.services.find(x => x.id === id);
const bar = id => S.barbers.find(x => x.id === id);
const cli = id => S.clients.find(x => x.id === id);
const curBranch = () => isOwner() ? (ui.branch !== 'all' && br(ui.branch) ? ui.branch : 'all') : S.me?.branchId;
const inBr = x => curBranch() === 'all' || x.branchId === curBranch();
const activeBarbers = bid => S.barbers.filter(b => b.active !== 0 && (!bid || bid === 'all' || b.branchId === bid));
const dur = a => a.serviceIds.reduce((t, i) => t + (svc(i)?.mins || 30), 0);
const sumP = ids => ids.reduce((t, i) => t + (svc(i)?.price || 0), 0);
const sumM = ids => ids.reduce((t, i) => t + (svc(i)?.mins || 0), 0);
const active = a => a.status === 'booked' || a.status === 'done';
const money = (arr, f) => arr.reduce((s, a) => s + f(a), 0);

function isFree(barberId, date, start, d, ignore) {
  if (start < OPEN || start + d > CLOSE) return false;
  return !S.appts.some(a => a.id !== ignore && a.barberId === barberId && a.date === date && active(a) &&
    start < toMin(a.time) + dur(a) && toMin(a.time) < start + d);
}
function times(branchId, barberId, date, d) {
  const out = [], now = new Date(), nowM = now.getHours() * 60 + now.getMinutes();
  const ids = barberId === 'any' ? activeBarbers(branchId).map(b => b.id) : [barberId];
  for (let m = OPEN; m + d <= CLOSE; m += 30) {
    if (date === today() && m <= nowM) continue;
    if (ids.some(id => isFree(id, date, m, d))) out.push(toTime(m));
  }
  return out;
}

// ---------- shell ----------
const NAV_OWNER = [['dashboard', 'Dashboard'], ['schedule', 'Schedule'], ['clients', 'Clients'], ['services', 'Services'], ['staff', 'Staff'], ['branches', 'Branches'], ['reports', 'Reports'], ['activity', 'Activity']];
const NAV_STAFF = [['dashboard', 'Dashboard'], ['schedule', 'Schedule'], ['clients', 'Clients'], ['reports', 'My earnings']];
const modal = document.getElementById('modal');
const openModal = h => { modal.innerHTML = h; if (!modal.open) modal.showModal(); };
const closeModal = () => modal.close();

function render() {
  const nav = document.getElementById('nav'), view = document.getElementById('view');
  if (PUBLIC) { ui.view = 'online'; nav.style.display = 'none'; view.innerHTML = V.online(); return; }
  if (!loggedIn) {
    nav.style.display = 'none';
    view.innerHTML = `<div class="online card"><h2>✂ ${esc(S.shop)} login</h2><form data-form="login">
      <label>Username <span class="mute">(owner: iwanang blangko)</span></label><input name="username" autocapitalize="none" autocomplete="username">
      <label>Password</label><input type="password" name="password" autocomplete="current-password" required>
      <p id="err" style="color:var(--bad)">${esc(loadErr === 'Login required' ? '' : loadErr)}</p><button class="btn">Login</button></form></div>`;
    return;
  }
  const items = isOwner() ? NAV_OWNER : NAV_STAFF;
  if (!items.some(([k]) => k === ui.view)) ui.view = 'dashboard';
  nav.style.display = '';
  const picker = isOwner()
    ? `<select id="branchsel" style="margin:0 0 10px"><option value="all">All branches</option>${S.branches.map(b => `<option value="${b.id}" ${curBranch() === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>`
    : `<div class="mute" style="margin:0 8px 10px">${esc(br(S.me.branchId)?.name || '')}<br>${esc(S.me.name)}</div>`;
  nav.innerHTML = `<h1>✂ ${esc(S.shop)}</h1>${picker}` +
    items.map(([k, l]) => `<button class="${ui.view === k ? 'on' : ''}" data-view="${k}">${l}</button>`).join('') +
    `<button data-act="logout" style="margin-top:auto">Logout</button>`;
  view.innerHTML = V[ui.view]();
}

// ---------- views ----------
const V = {};
const apptRows = (arr, showBranch) => `<table>${arr.map(a => `<tr style="cursor:pointer" data-act="appt" data-id="${a.id}"><td>${fmt12(a.time)}</td><td>${esc(cli(a.clientId)?.name)}</td><td>${esc(bar(a.barberId)?.name)}${showBranch ? ` <span class="mute">· ${esc(br(a.branchId)?.name)}</span>` : ''}</td><td>${a.serviceIds.map(i => esc(svc(i)?.name)).join(', ')}</td><td><span class="tag ${a.status}">${a.status}</span></td></tr>`).join('')}</table>`;

V.dashboard = () => {
  const t = today(), ws = addDays(t, -6), all = curBranch() === 'all';
  const A = S.appts.filter(inBr), done = A.filter(a => a.status === 'done');
  const sales = (arr, f, to) => money(arr.filter(a => a.status === 'done' && a.date >= f && a.date <= to), a => a.total + (a.tip || 0));
  const tA = A.filter(a => a.date === t && active(a)).sort((a, b) => a.time.localeCompare(b.time));
  const per = S.barbers.filter(b => b.active !== 0 && (all || b.branchId === curBranch()))
    .map(b => ({ b, v: money(done.filter(a => a.barberId === b.id && a.date >= ws), a => a.total) })).sort((x, y) => y.v - x.v);
  const title = all ? 'All branches' : esc(br(curBranch())?.name);
  const branchCard = all && isOwner() ? `<div class="card overflow" style="margin-bottom:14px"><h3>Branches</h3><table><tr><th>Branch</th><th>Sales today</th><th>Sales (7 days)</th><th>Appts today</th></tr>
    ${S.branches.map(b => { const x = S.appts.filter(a => a.branchId === b.id); return `<tr style="cursor:pointer" data-act="pickbranch" data-id="${b.id}"><td>${esc(b.name)}</td><td>${peso(sales(x, t, t))}</td><td>${peso(sales(x, ws, t))}</td><td>${x.filter(a => a.date === t && active(a)).length}</td></tr>`; }).join('')}</table></div>` : '';
  return `<h2>Dashboard <span class="mute" style="font-size:14px">· ${title}</span></h2>
  <div class="grid">
    <div class="card stat"><span>Sales today</span><b>${peso(sales(A, t, t))}</b></div>
    <div class="card stat"><span>Sales (7 days)</span><b>${peso(sales(A, ws, t))}</b></div>
    <div class="card stat"><span>Appointments today</span><b>${tA.length}</b></div>
    <div class="card stat"><span>Clients</span><b>${S.clients.length}</b></div>
  </div>${branchCard}
  <div class="row" style="align-items:flex-start">
    <div class="card" style="flex:2;min-width:300px"><h3>Today's appointments</h3>${tA.length ? apptRows(tA, all) : '<p class="mute">Wala pang booking today.</p>'}</div>
    <div class="card" style="flex:1;min-width:220px"><h3>Top barbers (7 days)</h3>
      ${per.map(x => `<div class="row" style="justify-content:space-between;padding:6px 0"><span>${esc(x.b.name)}</span><b>${peso(x.v)}</b></div>`).join('') || '<p class="mute">No barbers yet</p>'}</div>
  </div>`;
};

V.schedule = () => {
  const bid = curBranch();
  if (bid === 'all') return `<h2>Schedule</h2><p class="mute">Pumili ng branch:</p><div class="chips">${S.branches.map(b => `<span class="chip" data-act="pickbranch" data-id="${b.id}">${esc(b.name)}</span>`).join('')}</div>`;
  const d = ui.date, bs = activeBarbers(bid), list = S.appts.filter(a => a.date === d && a.branchId === bid && active(a));
  if (!bs.length) return `<h2>Schedule · ${esc(br(bid)?.name)}</h2><p class="mute">Walang barber sa branch na ito. Idagdag sa Staff.</p>`;
  const start = {}, cover = {};
  list.forEach(a => { const m = toMin(a.time), n = Math.ceil(dur(a) / 30); start[a.barberId + '|' + m] = a; for (let k = 1; k < n; k++) cover[a.barberId + '|' + (m + 30 * k)] = 1; });
  let rows = '';
  for (let m = OPEN; m < CLOSE; m += 30) {
    rows += `<tr><td>${fmt12(toTime(m))}</td>` + bs.map(b => {
      const k = b.id + '|' + m; if (cover[k]) return '';
      const a = start[k];
      if (a) return `<td rowspan="${Math.ceil(dur(a) / 30)}" class="appt ${a.status}" data-act="appt" data-id="${a.id}"><b>${esc(cli(a.clientId)?.name)}</b>${a.serviceIds.map(i => esc(svc(i)?.name)).join(' + ')}</td>`;
      return `<td class="free" data-act="new" data-barber="${b.id}" data-time="${toTime(m)}"></td>`;
    }).join('') + '</tr>';
  }
  return `<div class="row" style="justify-content:space-between;margin-bottom:14px"><h2 style="margin:0">Schedule · ${esc(br(bid)?.name)}</h2>
    <div class="row"><button class="btn ghost sm" data-act="day" data-n="-1">‹</button><input type="date" id="dpick" value="${d}" style="width:auto">
    <button class="btn ghost sm" data-act="day" data-n="1">›</button><button class="btn ghost sm" data-act="day" data-n="0">Today</button>
    <button class="btn" data-act="new">+ Booking</button></div></div>
  <div class="card overflow"><table class="sched"><tr><th></th>${bs.map(b => `<th>${esc(b.name)}</th>`).join('')}</tr>${rows}</table></div>`;
};

V.clients = () => {
  const q = ui.q.toLowerCase();
  const list = S.clients.filter(c => (c.name + c.phone).toLowerCase().includes(q));
  return `<div class="row" style="justify-content:space-between;margin-bottom:14px"><h2 style="margin:0">Clients</h2>
    <div class="row"><input id="search" placeholder="Search name/phone" value="${esc(ui.q)}" style="width:220px"><button class="btn" data-act="client">+ Client</button></div></div>
  <div class="card overflow"><table><tr><th>Name</th><th>Phone</th><th>Visits</th><th>Spent</th><th>Notes</th><th></th></tr>
  ${list.map(c => { const v = S.appts.filter(a => a.clientId === c.id && a.status === 'done'); return `<tr><td>${esc(c.name)}</td><td>${esc(c.phone)}</td><td>${v.length}</td><td>${peso(money(v, a => a.total))}</td><td class="mute">${esc(c.notes)}</td><td><button class="btn ghost sm" data-act="client" data-id="${c.id}">Edit</button></td></tr>`; }).join('')}</table></div>`;
};

V.services = () => `<div class="row" style="justify-content:space-between;margin-bottom:14px"><h2 style="margin:0">Services</h2><button class="btn" data-act="service">+ Service</button></div>
  <div class="card"><table><tr><th>Name</th><th>Price</th><th>Duration</th><th></th></tr>
  ${S.services.map(s => `<tr><td>${esc(s.name)}</td><td>${peso(s.price)}</td><td>${s.mins} min</td><td><button class="btn ghost sm" data-act="service" data-id="${s.id}">Edit</button> <button class="btn bad sm" data-act="del" data-kind="services" data-id="${s.id}">Delete</button></td></tr>`).join('')}</table></div>`;

V.staff = () => {
  const list = S.barbers.filter(b => curBranch() === 'all' || b.branchId === curBranch());
  return `<div class="row" style="justify-content:space-between;margin-bottom:14px"><h2 style="margin:0">Staff</h2><button class="btn" data-act="barber">+ Barber</button></div>
  <div class="card overflow"><table><tr><th>Name</th><th>Branch</th><th>Login</th><th>Commission</th><th>Status</th><th></th></tr>
  ${list.map(b => `<tr style="${b.active === 0 ? 'opacity:.5' : ''}"><td>${esc(b.name)}</td><td>${esc(br(b.branchId)?.name)}</td><td>${b.username ? esc(b.username) : '<span class="mute">walang login</span>'}</td><td>${b.pct}%</td><td>${b.active === 0 ? 'Inactive' : 'Active'}</td><td><button class="btn ghost sm" data-act="barber" data-id="${b.id}">Edit</button> <button class="btn bad sm" data-act="del" data-kind="barbers" data-id="${b.id}">Remove</button></td></tr>`).join('') || '<tr><td colspan="6" class="mute">Wala pang barber.</td></tr>'}</table></div>
  <p class="mute">Ang "Remove" ay hindi buburahin ang barber kung may history siya. I-didisable lang ang login niya.</p>`;
};

V.branches = () => `<div class="row" style="justify-content:space-between;margin-bottom:14px"><h2 style="margin:0">Branches</h2><button class="btn" data-act="branch">+ Branch</button></div>
  <div class="card overflow"><table><tr><th>Branch</th><th>Phone</th><th>Address</th><th>Barbers</th><th></th></tr>
  ${S.branches.map(b => `<tr><td>${esc(b.name)}</td><td>${esc(b.phone)}</td><td class="mute">${esc(b.address)}</td><td>${activeBarbers(b.id).length}</td><td><button class="btn ghost sm" data-act="branch" data-id="${b.id}">Edit</button> <button class="btn bad sm" data-act="del" data-kind="branches" data-id="${b.id}">Delete</button></td></tr>`).join('')}</table></div>
  <div class="card" style="margin-top:14px"><h3>Customer booking link</h3><p><b>${esc(location.origin)}/book</b></p><p class="mute">Ibigay ito sa customers. Pipili sila ng branch, barber, at oras.</p></div>`;

V.activity = () => `<div class="row" style="justify-content:space-between;margin-bottom:14px"><h2 style="margin:0">Activity</h2><button class="btn" data-act="backup">⬇ Download backup</button></div>
  <p class="mute">Awtomatikong may daily backup sa server. I-download din ito paminsan-minsan at itago sa ibang lugar (Google Drive, flash drive).</p>
  <div class="card overflow"><table><tr><th>When</th><th>Who</th><th>Action</th><th>What</th><th>Detail</th></tr>
  ${ui.audit.map(r => `<tr><td>${new Date(r.ts).toLocaleString('en-PH')}</td><td>${esc(r.who)}</td><td>${esc(r.action)}</td><td>${esc(r.entity)}</td><td class="mute">${esc(r.detail)}</td></tr>`).join('') || '<tr><td colspan="5" class="mute">Wala pa.</td></tr>'}</table></div>`;

V.reports = () => {
  const mine = !isOwner();
  const done = S.appts.filter(a => a.status === 'done' && a.date >= ui.from && a.date <= ui.to && inBr(a) && (!mine || a.barberId === S.me.id));
  const cnt = S.appts.filter(a => a.date >= ui.from && a.date <= ui.to && inBr(a) && (!mine || a.barberId === S.me.id));
  const rev = money(done, a => a.total), tips = money(done, a => a.tip || 0);
  const byB = S.barbers.filter(b => (!mine || b.id === S.me.id) && (curBranch() === 'all' || b.branchId === curBranch()))
    .map(b => { const x = done.filter(a => a.barberId === b.id); const r = money(x, a => a.total); return { b, n: x.length, r, t: money(x, a => a.tip || 0), c: r * (b.pct || 0) / 100 }; })
    .filter(x => x.n || x.b.active !== 0);
  const bySvc = {}; done.forEach(a => a.serviceIds.forEach(i => { const n = svc(i)?.name || '?'; bySvc[n] = (bySvc[n] || 0) + 1; }));
  const byPay = {}; done.forEach(a => { byPay[a.pay || 'Cash'] = (byPay[a.pay || 'Cash'] || 0) + a.total + (a.tip || 0); });
  const byBranch = isOwner() && curBranch() === 'all' ? `<div class="card overflow" style="margin-bottom:14px"><h3>By branch</h3><table><tr><th>Branch</th><th>Cuts</th><th>Sales</th><th>Barber commission</th><th>Shop keeps</th></tr>
    ${S.branches.map(b => { const x = done.filter(a => a.branchId === b.id); const r = money(x, a => a.total), c = money(x, a => a.total * (bar(a.barberId)?.pct || 0) / 100); return `<tr><td>${esc(b.name)}</td><td>${x.length}</td><td>${peso(r)}</td><td>${peso(c)}</td><td><b>${peso(r - c)}</b></td></tr>`; }).join('')}</table></div>` : '';
  return `<h2>${mine ? 'My earnings' : 'Reports'}</h2>
  <div class="row" style="margin-bottom:14px"><div><label>From</label><input type="date" id="rfrom" value="${ui.from}"></div><div><label>To</label><input type="date" id="rto" value="${ui.to}"></div></div>
  <div class="grid">
    <div class="card stat"><span>Revenue</span><b>${peso(rev)}</b></div><div class="card stat"><span>Tips</span><b>${peso(tips)}</b></div>
    <div class="card stat"><span>Completed</span><b>${done.length}</b></div><div class="card stat"><span>No-show / Cancelled</span><b>${cnt.filter(a => a.status === 'noshow' || a.status === 'cancelled').length}</b></div></div>
  ${byBranch}
  <div class="card overflow" style="margin-bottom:14px"><h3>Barber payout</h3><table><tr><th>Barber</th><th>Cuts</th><th>Sales</th><th>Commission</th><th>Tips</th><th>Total payout</th><th>Shop keeps</th></tr>
  ${byB.map(x => `<tr><td>${esc(x.b.name)} (${x.b.pct}%)</td><td>${x.n}</td><td>${peso(x.r)}</td><td>${peso(x.c)}</td><td>${peso(x.t)}</td><td><b>${peso(x.c + x.t)}</b></td><td>${peso(x.r - x.c)}</td></tr>`).join('')}</table></div>
  <div class="row" style="align-items:flex-start"><div class="card" style="flex:1;min-width:240px"><h3>Services sold</h3>${Object.entries(bySvc).map(([k, v]) => `<div class="row" style="justify-content:space-between"><span>${esc(k)}</span><b>${v}</b></div>`).join('') || '<span class="mute">—</span>'}</div>
  <div class="card" style="flex:1;min-width:240px"><h3>Payment methods</h3>${Object.entries(byPay).map(([k, v]) => `<div class="row" style="justify-content:space-between"><span>${esc(k)}</span><b>${peso(v)}</b></div>`).join('') || '<span class="mute">—</span>'}</div></div>`;
};

V.online = () => {
  if (ob.done) return `<div class="online card"><h2>✅ Booked!</h2><p>${esc(ob.done)}</p><button class="btn" data-act="obreset">Book another</button></div>`;
  if (!ob.branch) return `<div class="online card"><h2>Book at ${esc(S.shop)}</h2><label>Pumili ng branch</label><div class="chips">${S.branches.map(b => `<span class="chip" data-act="obbranch" data-id="${b.id}">${esc(b.name)}</span>`).join('') || '<span class="mute">Loading…</span>'}</div></div>`;
  const d = sumM(ob.svc), ts = d ? times(ob.branch, ob.barber, ob.date, d) : [];
  return `<div class="online card"><h2>Book at ${esc(S.shop)} — ${esc(br(ob.branch)?.name)}</h2>${S.branches.length > 1 ? '<p><a href="#" data-act="obbranch" data-id="" style="color:var(--gold)">Palitan ang branch</a></p>' : ''}
  <label>1. Services</label>${S.services.map(s => `<label class="chk"><input type="checkbox" data-ob="svc" value="${s.id}" ${ob.svc.includes(s.id) ? 'checked' : ''}> ${esc(s.name)} — ${peso(s.price)} (${s.mins}m)</label>`).join('')}
  <label>2. Barber</label><select data-ob="barber"><option value="any">Any available</option>${activeBarbers(ob.branch).map(b => `<option value="${b.id}" ${ob.barber === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>
  <label>3. Date</label><input type="date" data-ob="date" min="${today()}" value="${ob.date}">
  <label>4. Time</label><div class="chips">${ts.length ? ts.map(t => `<span class="chip ${ob.time === t ? 'on' : ''}" data-act="obtime" data-t="${t}">${fmt12(t)}</span>`).join('') : `<span class="mute">${d ? 'Walang available na oras.' : 'Pumili muna ng service.'}</span>`}</div>
  <label>5. Your name</label><input data-ob="name" value="${esc(ob.name)}"><label>Phone</label><input data-ob="phone" value="${esc(ob.phone)}">
  <p><b>Total: ${peso(sumP(ob.svc))}</b></p><button class="btn" data-act="obconfirm">Confirm booking</button></div>`;
};

// ---------- forms ----------
function apptForm(pre = {}) {
  const a = pre.id ? S.appts.find(x => x.id === pre.id) : null;
  const bid = a?.branchId || curBranch();
  const bs = activeBarbers(bid);
  const v = a || { date: ui.date, time: pre.time || '10:00', barberId: pre.barberId || bs[0]?.id, serviceIds: [], clientId: '' };
  openModal(`<h2>${a ? 'Edit' : 'New'} booking</h2><form data-form="appt" data-id="${a?.id || ''}">
  <label>Client</label><select name="client"><option value="">+ New / walk-in</option>${S.clients.map(c => `<option value="${c.id}" ${v.clientId === c.id ? 'selected' : ''}>${esc(c.name)}${c.phone ? ' · ' + esc(c.phone) : ''}</option>`).join('')}</select>
  <div class="row"><input name="cname" placeholder="New client name" style="flex:1"><input name="cphone" placeholder="Phone" style="flex:1"></div>
  <label>Barber</label><select name="barber">${bs.map(b => `<option value="${b.id}" ${v.barberId === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>
  <div class="row"><div style="flex:1"><label>Date</label><input type="date" name="date" value="${v.date}" required></div><div style="flex:1"><label>Time</label><input type="time" name="time" step="1800" value="${v.time}" required></div></div>
  <label>Services</label>${S.services.map(s => `<label class="chk"><input type="checkbox" name="svc" value="${s.id}" ${v.serviceIds.includes(s.id) ? 'checked' : ''}> ${esc(s.name)} — ${peso(s.price)} (${s.mins}m)</label>`).join('')}
  <p id="err" style="color:var(--bad)"></p><div class="row"><button class="btn">Save</button><button type="button" class="btn ghost" data-act="close">Cancel</button></div></form>`);
}
function apptDetail(id) {
  const a = S.appts.find(x => x.id === id), c = cli(a.clientId);
  const done = a.status === 'done';
  openModal(`<h2>${esc(c?.name)} <span class="tag ${a.status}">${a.status}</span></h2>
  <p class="mute">${a.date} · ${fmt12(a.time)} · ${esc(bar(a.barberId)?.name)} · ${esc(br(a.branchId)?.name)}${c?.phone ? ' · ' + esc(c.phone) : ''}</p>
  ${a.serviceIds.map(i => `<div class="row" style="justify-content:space-between"><span>${esc(svc(i)?.name)}</span><span>${peso(svc(i)?.price)}</span></div>`).join('')}
  <hr style="border-color:var(--line)"><div class="row" style="justify-content:space-between"><b>Total</b><b>${peso(a.total)}</b></div>
  ${done ? `<p class="mute">Paid via ${esc(a.pay)}${a.tip ? ' · tip ' + peso(a.tip) : ''}</p>` : a.status === 'booked' ? `<form data-form="checkout" data-id="${a.id}"><div class="row"><div style="flex:1"><label>Payment</label><select name="pay"><option>Cash</option><option>GCash</option><option>Maya</option><option>Card</option></select></div><div style="flex:1"><label>Tip</label><input type="number" name="tip" min="0" value="0"></div></div><p id="err" style="color:var(--bad)"></p><button class="btn">✔ Checkout & complete</button></form>` : ''}
  <div class="row" style="margin-top:14px">${a.status === 'booked' ? `<button class="btn ghost sm" data-act="edit" data-id="${a.id}">Edit</button><button class="btn ghost sm" data-act="status" data-s="noshow" data-id="${a.id}">No-show</button><button class="btn bad sm" data-act="status" data-s="cancelled" data-id="${a.id}">Cancel booking</button>` : ''}<button class="btn ghost sm" data-act="close">Close</button></div>`);
}
// fields: [name, label, type, {opts:[[value,label]], req:false, hint}]
function simpleForm(title, kind, fields, id) {
  const o = id ? S[kind].find(x => x.id === id) : {};
  const input = ([n, l, t, x = {}]) => {
    const val = n === 'password' ? '' : (o[n] ?? x.def ?? '');
    const req = x.req === false ? '' : 'required';
    const ctl = t === 'textarea' ? `<textarea name="${n}">${esc(val)}</textarea>`
      : t === 'select' ? `<select name="${n}">${x.opts.map(([v, lab]) => `<option value="${esc(v)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(lab)}</option>`).join('')}</select>`
        : `<input name="${n}" type="${t}" value="${esc(val)}" ${req} ${t === 'password' ? 'autocomplete="new-password"' : ''}>`;
    return `<label>${l}${x.hint ? ` <span class="mute">(${x.hint})</span>` : ''}</label>${ctl}`;
  };
  openModal(`<h2>${title}</h2><form data-form="${kind}" data-id="${id || ''}">${fields.map(input).join('')}<p id="err" style="color:var(--bad)"></p><div class="row"><button class="btn">Save</button><button type="button" class="btn ghost" data-act="close">Cancel</button></div></form>`);
}

// ---------- events ----------
document.addEventListener('click', async e => {
  const nb = e.target.closest('[data-view]');
  if (nb) {
    ui.view = nb.dataset.view;
    if (ui.view === 'activity') { try { ui.audit = await api('GET', '/api/audit'); } catch (x) { } }
    return render();
  }
  const el = e.target.closest('[data-act]'); if (!el) return;
  const d = el.dataset, act = d.act;
  if (el.tagName === 'A') e.preventDefault();
  if (act === 'close') return closeModal();
  if (act === 'day') { ui.date = d.n === '0' ? today() : addDays(ui.date, +d.n); return render(); }
  if (act === 'pickbranch') { ui.branch = d.id; ui.view = ui.view === 'dashboard' ? 'dashboard' : ui.view; return render(); }
  if (act === 'new') return apptForm({ barberId: d.barber, time: d.time });
  if (act === 'appt') return apptDetail(d.id);
  if (act === 'edit') return apptForm({ id: d.id });
  if (act === 'client') return simpleForm(d.id ? 'Edit client' : 'New client', 'clients', [['name', 'Name', 'text'], ['phone', 'Phone', 'text', { req: false }], ['notes', 'Notes / preferred cut', 'textarea']], d.id);
  if (act === 'service') return simpleForm(d.id ? 'Edit service' : 'New service', 'services', [['name', 'Name', 'text'], ['price', 'Price (₱)', 'number'], ['mins', 'Duration (min, multiples of 30)', 'number']], d.id);
  if (act === 'branch') return simpleForm(d.id ? 'Edit branch' : 'New branch', 'branches', [['name', 'Name', 'text'], ['phone', 'Phone', 'text', { req: false }], ['address', 'Address', 'text', { req: false }]], d.id);
  if (act === 'barber') {
    const def = curBranch() !== 'all' ? curBranch() : S.branches[0]?.id;
    return simpleForm(d.id ? 'Edit barber' : 'New barber', 'barbers', [
      ['name', 'Name', 'text'], ['branchId', 'Branch', 'select', { opts: S.branches.map(b => [b.id, b.name]), def }],
      ['pct', 'Commission %', 'number'], ['username', 'Login username', 'text', { req: false, hint: 'blangko = walang login' }],
      ['password', 'Password', 'password', { req: false, hint: 'blangko = hindi babaguhin; min 6' }],
      ...(d.id ? [['active', 'Status', 'select', { opts: [[1, 'Active'], [0, 'Inactive']] }]] : [])], d.id);
  }
  if (act === 'logout') { token = ''; try { localStorage.removeItem('bp.token'); } catch (x) { } loggedIn = false; return render(); }
  if (act === 'del') { if (confirm('Sigurado ka?')) mut(() => api('DELETE', `/api/${d.kind}/${d.id}`)); return; }
  if (act === 'status') { mut(() => api('PUT', `/api/appts/${d.id}`, { status: d.s })).then(() => closeModal()); return; }
  if (act === 'backup') {
    try {
      const r = await fetch('/api/backup', { headers: { Authorization: 'Bearer ' + token } });
      if (!r.ok) throw new Error('Backup failed');
      const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = `brotherhood-${today()}.db`; a.click();
    } catch (x) { alert(x.message); }
    return;
  }
  if (act === 'obbranch') { ob.branch = d.id; ob.barber = 'any'; ob.time = ''; return render(); }
  if (act === 'obtime') { ob.time = d.t; return render(); }
  if (act === 'obreset') { ob = { branch: S.branches.length === 1 ? S.branches[0].id : '', svc: [], barber: 'any', date: today(), time: '', name: '', phone: '', done: null }; return render(); }
  if (act === 'obconfirm') {
    if (!sumM(ob.svc) || !ob.time || !ob.name.trim()) return alert('Pumili ng service, oras, at ilagay ang pangalan.');
    fetch('/api/public/book', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: ob.name, phone: ob.phone, date: ob.date, time: ob.time, branchId: ob.branch, barberId: ob.barber, serviceIds: ob.svc }) })
      .then(async r => {
        const j = await r.json();
        if (!r.ok) { alert(j.error + '. Pumili ng ibang oras.'); ob.time = ''; return load(); }
        ob.done = `${j.date} at ${fmt12(j.time)} with ${j.barber} (${j.branch}). See you, ${ob.name}!`; await load(); render();
      }).catch(() => alert('Hindi maabot ang server.'));
  }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'branchsel') { ui.branch = t.value; return render(); }
  if (t.id === 'dpick') { ui.date = t.value || today(); return render(); }
  if (t.id === 'rfrom') { ui.from = t.value; return render(); }
  if (t.id === 'rto') { ui.to = t.value; return render(); }
  if (t.dataset.ob) {
    const k = t.dataset.ob;
    if (k === 'svc') ob.svc = t.checked ? [...ob.svc, t.value] : ob.svc.filter(x => x !== t.value);
    else ob[k] = t.value;
    if (k !== 'name' && k !== 'phone') { ob.time = ''; render(); }
  }
});
document.addEventListener('input', e => {
  if (e.target.id === 'search') { ui.q = e.target.value; const p = e.target.selectionStart; render(); const s = document.getElementById('search'); s.focus(); s.setSelectionRange(p, p); }
  if (e.target.dataset.ob === 'name' || e.target.dataset.ob === 'phone') ob[e.target.dataset.ob] = e.target.value;
});
document.addEventListener('submit', e => {
  const f = e.target; if (!f.dataset.form) return; e.preventDefault();
  const fd = new FormData(f), kind = f.dataset.form, id = f.dataset.id, err = f.querySelector('#err');
  if (kind === 'login') {
    api('POST', '/api/login', { username: fd.get('username'), password: fd.get('password') })
      .then(j => { token = j.token; try { localStorage.setItem('bp.token', token); } catch (x) { } return load(); })
      .then(render).catch(x => { if (err) err.textContent = x.message; });
    return;
  }
  if (kind === 'appt') {
    const ids = fd.getAll('svc');
    if (!ids.length) return err.textContent = 'Pumili ng kahit isang service.';
    const cname = (fd.get('cname') || '').trim();
    if (!fd.get('client') && !cname) return err.textContent = 'Ilagay ang pangalan ng client.';
    const bid = fd.get('barber'), date = fd.get('date'), time = fd.get('time');
    if (!bid) return err.textContent = 'Pumili ng barber.';
    if (!isFree(bid, date, toMin(time), sumM(ids), id)) return err.textContent = 'May conflict sa oras (o labas sa 9AM–9PM). Pumili ng ibang oras.';
    run(async () => {
      let cid = fd.get('client');
      if (!cid) cid = (await api('POST', '/api/clients', { name: cname, phone: fd.get('cphone') || '', notes: '' })).id;
      const rec = { barberId: bid, date, time, clientId: cid, serviceIds: ids };
      if (id) await api('PUT', `/api/appts/${id}`, rec); else await api('POST', '/api/appts', rec);
      ui.date = date;
    }, err);
    return;
  }
  if (kind === 'checkout') return run(() => api('PUT', `/api/appts/${id}`, { status: 'done', pay: fd.get('pay'), tip: +fd.get('tip') || 0 }), err);
  const o = {};
  for (const [k, v] of fd.entries()) {
    if (k === 'password' && !v) continue;
    o[k] = ['price', 'mins', 'pct', 'active'].includes(k) ? +v : v;
  }
  run(() => id ? api('PUT', `/api/${kind}/${id}`, o) : api('POST', `/api/${kind}`, o), err);
});

load().then(() => setInterval(() => { if (!modal.open && loggedIn && !PUBLIC && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) load(); }, 15000));
render();
