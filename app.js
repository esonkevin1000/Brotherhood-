// Brotherhood — Squire-style barbershop app (bookings, POS, clients, staff, reports)
const KEY = 'Brotherhood.v1';
const OPEN = 540, CLOSE = 1260; // 9:00 AM - 9:00 PM
const uid = () => Math.random().toString(36).slice(2, 9);
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
let S = { shop: 'Brotherhood', barbers: [], services: [], clients: [], appts: [] };
let token = ''; try { token = localStorage.getItem('bp.token') || ''; } catch (e) { }
let loggedIn = PUBLIC, loadErr = '';
async function api(method, url, body) {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && !PUBLIC) { loggedIn = false; token = ''; render(); throw new Error(j.error || 'Login required'); }
  if (!r.ok) throw new Error(j.error || 'Request failed');
  return j;
}
async function load() {
  try { S = await api('GET', PUBLIC ? '/api/public' : '/api/state'); loggedIn = true; loadErr = ''; }
  catch (e) { loadErr = e.message; if (!PUBLIC) loggedIn = false; }
  if (!modal.open) render();
}
// run an API mutation, then refresh; show server errors (e.g. slot conflict)
async function mut(fn, errEl) {
  try { await fn(); await load(); return true; }
  catch (e) { if (errEl) errEl.textContent = e.message; else alert(e.message); return false; }
}
const save = () => { };
const ui = { view: 'dashboard', date: today(), from: addDays(today(), -6), to: today(), q: '' };
let ob = { svc: [], barber: 'any', date: today(), time: '', name: '', phone: '', done: null };

const svc = id => S.services.find(x => x.id === id);
const bar = id => S.barbers.find(x => x.id === id);
const cli = id => S.clients.find(x => x.id === id);
const dur = a => a.serviceIds.reduce((t, i) => t + (svc(i)?.mins || 30), 0);
const sumP = ids => ids.reduce((t, i) => t + (svc(i)?.price || 0), 0);
const sumM = ids => ids.reduce((t, i) => t + (svc(i)?.mins || 0), 0);
const active = a => a.status === 'booked' || a.status === 'done';

function isFree(barberId, date, start, d, ignore) {
  if (start < OPEN || start + d > CLOSE) return false;
  return !S.appts.some(a => a.id !== ignore && a.barberId === barberId && a.date === date && active(a) &&
    start < toMin(a.time) + dur(a) && toMin(a.time) < start + d);
}
function times(barberId, date, d) {
  const out = [], now = new Date(), nowM = now.getHours() * 60 + now.getMinutes();
  for (let m = OPEN; m + d <= CLOSE; m += 30) {
    if (date === today() && m <= nowM) continue;
    const ids = barberId === 'any' ? S.barbers.map(b => b.id) : [barberId];
    if (ids.some(id => isFree(id, date, m, d))) out.push(toTime(m));
  }
  return out;
}

// ---------- shell ----------
const NAV = [['dashboard', 'Dashboard'], ['schedule', 'Schedule'], ['clients', 'Clients'], ['services', 'Services'], ['barbers', 'Barbers'], ['reports', 'Reports'], ['online', 'Online Booking']];
function render() {
  const nav = document.getElementById('nav'), view = document.getElementById('view');
  if (PUBLIC) { ui.view = 'online'; nav.style.display = 'none'; view.innerHTML = V.online(); return; }
  if (!loggedIn) {
    nav.style.display = 'none';
    view.innerHTML = `<div class="online card"><h2>✂ Staff login</h2><form data-form="login"><label>Password</label><input type="password" name="password" autofocus required><p id="err" style="color:var(--bad)">${esc(loadErr === 'Login required' ? '' : loadErr)}</p><button class="btn">Login</button></form></div>`;
    return;
  }
  nav.style.display = '';
  nav.innerHTML = `<h1>✂ ${esc(S.shop)}</h1>` +
    NAV.map(([k, l]) => `<button class="${ui.view === k ? 'on' : ''}" data-view="${k}">${l}</button>`).join('') +
    `<button data-act="logout" style="margin-top:auto">Logout</button>`;
  view.innerHTML = V[ui.view]();
}
const modal = document.getElementById('modal');
const openModal = h => { modal.innerHTML = h; if (!modal.open) modal.showModal(); };
const closeModal = () => modal.close();

// ---------- views ----------
const V = {};
V.dashboard = () => {
  const t = today(), weekStart = addDays(t, -6);
  const done = S.appts.filter(a => a.status === 'done');
  const sales = (f, to) => done.filter(a => a.date >= f && a.date <= to).reduce((s, a) => s + a.total + (a.tip || 0), 0);
  const tAppts = S.appts.filter(a => a.date === t && active(a)).sort((a, b) => a.time.localeCompare(b.time));
  const perBarber = S.barbers.map(b => ({ b, v: done.filter(a => a.barberId === b.id && a.date >= weekStart).reduce((s, a) => s + a.total, 0) })).sort((x, y) => y.v - x.v);
  return `<h2>Dashboard</h2>
  <div class="grid">
    <div class="card stat"><span>Sales today</span><b>${peso(sales(t, t))}</b></div>
    <div class="card stat"><span>Sales (7 days)</span><b>${peso(sales(weekStart, t))}</b></div>
    <div class="card stat"><span>Appointments today</span><b>${tAppts.length}</b></div>
    <div class="card stat"><span>Total clients</span><b>${S.clients.length}</b></div>
  </div>
  <div class="row" style="align-items:flex-start">
    <div class="card" style="flex:2;min-width:300px"><h3>Today's appointments</h3>
      ${tAppts.length ? `<table>${tAppts.map(a => `<tr style="cursor:pointer" data-act="appt" data-id="${a.id}"><td>${fmt12(a.time)}</td><td>${esc(cli(a.clientId)?.name)}</td><td>${esc(bar(a.barberId)?.name)}</td><td>${a.serviceIds.map(i => esc(svc(i)?.name)).join(', ')}</td><td><span class="tag ${a.status}">${a.status}</span></td></tr>`).join('')}</table>` : '<p class="mute">Wala pang booking today.</p>'}
    </div>
    <div class="card" style="flex:1;min-width:220px"><h3>Top barbers (7 days)</h3>
      ${perBarber.map(x => `<div class="row" style="justify-content:space-between;padding:6px 0"><span>${esc(x.b.name)}</span><b>${peso(x.v)}</b></div>`).join('') || '<p class="mute">No barbers</p>'}
    </div>
  </div>`;
};

V.schedule = () => {
  const d = ui.date, list = S.appts.filter(a => a.date === d && active(a));
  const start = {}, cover = {};
  list.forEach(a => { const m = toMin(a.time), n = Math.ceil(dur(a) / 30); start[a.barberId + '|' + m] = a; for (let k = 1; k < n; k++) cover[a.barberId + '|' + (m + 30 * k)] = 1; });
  let rows = '';
  for (let m = OPEN; m < CLOSE; m += 30) {
    rows += `<tr><td>${fmt12(toTime(m))}</td>` + S.barbers.map(b => {
      const k = b.id + '|' + m; if (cover[k]) return '';
      const a = start[k];
      if (a) return `<td rowspan="${Math.ceil(dur(a) / 30)}" class="appt ${a.status}" data-act="appt" data-id="${a.id}"><b>${esc(cli(a.clientId)?.name)}</b>${a.serviceIds.map(i => esc(svc(i)?.name)).join(' + ')}</td>`;
      return `<td class="free" data-act="new" data-barber="${b.id}" data-time="${toTime(m)}"></td>`;
    }).join('') + '</tr>';
  }
  return `<div class="row" style="justify-content:space-between;margin-bottom:14px"><h2 style="margin:0">Schedule</h2>
    <div class="row"><button class="btn ghost sm" data-act="day" data-n="-1">‹</button><input type="date" id="dpick" value="${d}" style="width:auto">
    <button class="btn ghost sm" data-act="day" data-n="1">›</button><button class="btn ghost sm" data-act="day" data-n="0">Today</button>
    <button class="btn" data-act="new">+ Booking</button></div></div>
  <div class="card overflow"><table class="sched"><tr><th></th>${S.barbers.map(b => `<th>${esc(b.name)}</th>`).join('')}</tr>${rows}</table></div>`;
};

V.clients = () => {
  const q = ui.q.toLowerCase();
  const list = S.clients.filter(c => (c.name + c.phone).toLowerCase().includes(q));
  return `<div class="row" style="justify-content:space-between;margin-bottom:14px"><h2 style="margin:0">Clients</h2>
    <div class="row"><input id="search" placeholder="Search name/phone" value="${esc(ui.q)}" style="width:220px"><button class="btn" data-act="client">+ Client</button></div></div>
  <div class="card overflow"><table><tr><th>Name</th><th>Phone</th><th>Visits</th><th>Spent</th><th>Notes</th><th></th></tr>
  ${list.map(c => { const v = S.appts.filter(a => a.clientId === c.id && a.status === 'done'); return `<tr><td>${esc(c.name)}</td><td>${esc(c.phone)}</td><td>${v.length}</td><td>${peso(v.reduce((s, a) => s + a.total, 0))}</td><td class="mute">${esc(c.notes)}</td><td><button class="btn ghost sm" data-act="client" data-id="${c.id}">Edit</button></td></tr>`; }).join('')}</table></div>`;
};

V.services = () => `<div class="row" style="justify-content:space-between;margin-bottom:14px"><h2 style="margin:0">Services</h2><button class="btn" data-act="service">+ Service</button></div>
  <div class="card"><table><tr><th>Name</th><th>Price</th><th>Duration</th><th></th></tr>
  ${S.services.map(s => `<tr><td>${esc(s.name)}</td><td>${peso(s.price)}</td><td>${s.mins} min</td><td><button class="btn ghost sm" data-act="service" data-id="${s.id}">Edit</button> <button class="btn bad sm" data-act="del" data-kind="services" data-id="${s.id}">Delete</button></td></tr>`).join('')}</table></div>`;

V.barbers = () => `<div class="row" style="justify-content:space-between;margin-bottom:14px"><h2 style="margin:0">Barbers</h2><button class="btn" data-act="barber">+ Barber</button></div>
  <div class="card"><table><tr><th>Name</th><th>Commission</th><th></th></tr>
  ${S.barbers.map(b => `<tr><td>${esc(b.name)}</td><td>${b.pct}%</td><td><button class="btn ghost sm" data-act="barber" data-id="${b.id}">Edit</button> <button class="btn bad sm" data-act="del" data-kind="barbers" data-id="${b.id}">Delete</button></td></tr>`).join('')}</table></div>`;

V.reports = () => {
  const done = S.appts.filter(a => a.status === 'done' && a.date >= ui.from && a.date <= ui.to);
  const rev = done.reduce((s, a) => s + a.total, 0), tips = done.reduce((s, a) => s + (a.tip || 0), 0);
  const byB = S.barbers.map(b => { const x = done.filter(a => a.barberId === b.id); const r = x.reduce((s, a) => s + a.total, 0), t = x.reduce((s, a) => s + (a.tip || 0), 0); return { b, n: x.length, r, t, c: r * b.pct / 100 }; });
  const bySvc = {}; done.forEach(a => a.serviceIds.forEach(i => { const n = svc(i)?.name || '?'; bySvc[n] = (bySvc[n] || 0) + 1; }));
  const byPay = {}; done.forEach(a => { byPay[a.pay || 'Cash'] = (byPay[a.pay || 'Cash'] || 0) + a.total + (a.tip || 0); });
  const cnt = S.appts.filter(a => a.date >= ui.from && a.date <= ui.to);
  return `<h2>Reports</h2>
  <div class="row" style="margin-bottom:14px"><div><label>From</label><input type="date" id="rfrom" value="${ui.from}"></div><div><label>To</label><input type="date" id="rto" value="${ui.to}"></div></div>
  <div class="grid">
    <div class="card stat"><span>Revenue</span><b>${peso(rev)}</b></div><div class="card stat"><span>Tips</span><b>${peso(tips)}</b></div>
    <div class="card stat"><span>Completed</span><b>${done.length}</b></div><div class="card stat"><span>No-show / Cancelled</span><b>${cnt.filter(a => a.status === 'noshow' || a.status === 'cancelled').length}</b></div></div>
  <div class="card overflow" style="margin-bottom:14px"><h3>Barber payout</h3><table><tr><th>Barber</th><th>Cuts</th><th>Sales</th><th>Commission</th><th>Tips</th><th>Total payout</th><th>Shop keeps</th></tr>
  ${byB.map(x => `<tr><td>${esc(x.b.name)} (${x.b.pct}%)</td><td>${x.n}</td><td>${peso(x.r)}</td><td>${peso(x.c)}</td><td>${peso(x.t)}</td><td><b>${peso(x.c + x.t)}</b></td><td>${peso(x.r - x.c)}</td></tr>`).join('')}</table></div>
  <div class="row" style="align-items:flex-start"><div class="card" style="flex:1;min-width:240px"><h3>Services sold</h3>${Object.entries(bySvc).map(([k, v]) => `<div class="row" style="justify-content:space-between"><span>${esc(k)}</span><b>${v}</b></div>`).join('') || '<span class="mute">—</span>'}</div>
  <div class="card" style="flex:1;min-width:240px"><h3>Payment methods</h3>${Object.entries(byPay).map(([k, v]) => `<div class="row" style="justify-content:space-between"><span>${esc(k)}</span><b>${peso(v)}</b></div>`).join('') || '<span class="mute">—</span>'}</div></div>`;
};

V.online = () => {
  if (ob.done) return `<div class="online card"><h2>✅ Booked!</h2><p>${esc(ob.done)}</p><button class="btn" data-act="obreset">Book another</button></div>`;
  const d = sumM(ob.svc), ts = d ? times(ob.barber, ob.date, d) : [];
  return `<div class="online card"><h2>Book at ${esc(S.shop)}</h2>
  <label>1. Services</label>${S.services.map(s => `<label class="chk"><input type="checkbox" data-ob="svc" value="${s.id}" ${ob.svc.includes(s.id) ? 'checked' : ''}> ${esc(s.name)} — ${peso(s.price)} (${s.mins}m)</label>`).join('')}
  <label>2. Barber</label><select data-ob="barber"><option value="any">Any available</option>${S.barbers.map(b => `<option value="${b.id}" ${ob.barber === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>
  <label>3. Date</label><input type="date" data-ob="date" min="${today()}" value="${ob.date}">
  <label>4. Time</label><div class="chips">${ts.length ? ts.map(t => `<span class="chip ${ob.time === t ? 'on' : ''}" data-act="obtime" data-t="${t}">${fmt12(t)}</span>`).join('') : `<span class="mute">${d ? 'Walang available na oras.' : 'Pumili muna ng service.'}</span>`}</div>
  <label>5. Your name</label><input data-ob="name" value="${esc(ob.name)}"><label>Phone</label><input data-ob="phone" value="${esc(ob.phone)}">
  <p><b>Total: ${peso(sumP(ob.svc))}</b></p><button class="btn" data-act="obconfirm">Confirm booking</button></div>`;
};

// ---------- forms ----------
function apptForm(pre = {}) {
  const a = pre.id ? S.appts.find(x => x.id === pre.id) : null;
  const v = a || { date: ui.date, time: pre.time || '10:00', barberId: pre.barberId || S.barbers[0]?.id, serviceIds: [], clientId: '' };
  openModal(`<h2>${a ? 'Edit' : 'New'} booking</h2><form data-form="appt" data-id="${a?.id || ''}">
  <label>Client</label><select name="client"><option value="">+ New / walk-in</option>${S.clients.map(c => `<option value="${c.id}" ${v.clientId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
  <div class="row"><input name="cname" placeholder="New client name" style="flex:1"><input name="cphone" placeholder="Phone" style="flex:1"></div>
  <label>Barber</label><select name="barber">${S.barbers.map(b => `<option value="${b.id}" ${v.barberId === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>
  <div class="row"><div style="flex:1"><label>Date</label><input type="date" name="date" value="${v.date}" required></div><div style="flex:1"><label>Time</label><input type="time" name="time" step="1800" value="${v.time}" required></div></div>
  <label>Services</label>${S.services.map(s => `<label class="chk"><input type="checkbox" name="svc" value="${s.id}" ${v.serviceIds.includes(s.id) ? 'checked' : ''}> ${esc(s.name)} — ${peso(s.price)} (${s.mins}m)</label>`).join('')}
  <p id="err" style="color:var(--bad)"></p><div class="row"><button class="btn">Save</button><button type="button" class="btn ghost" data-act="close">Cancel</button></div></form>`);
}
function apptDetail(id) {
  const a = S.appts.find(x => x.id === id), c = cli(a.clientId);
  const done = a.status === 'done';
  openModal(`<h2>${esc(c?.name)} <span class="tag ${a.status}">${a.status}</span></h2>
  <p class="mute">${a.date} · ${fmt12(a.time)} · ${esc(bar(a.barberId)?.name)}${c?.phone ? ' · ' + esc(c.phone) : ''}</p>
  ${a.serviceIds.map(i => `<div class="row" style="justify-content:space-between"><span>${esc(svc(i)?.name)}</span><span>${peso(svc(i)?.price)}</span></div>`).join('')}
  <hr style="border-color:var(--line)"><div class="row" style="justify-content:space-between"><b>Total</b><b>${peso(a.total)}</b></div>
  ${done ? `<p class="mute">Paid via ${esc(a.pay)}${a.tip ? ' · tip ' + peso(a.tip) : ''}</p>` : a.status === 'booked' ? `<form data-form="checkout" data-id="${a.id}"><div class="row"><div style="flex:1"><label>Payment</label><select name="pay"><option>Cash</option><option>GCash</option><option>Maya</option><option>Card</option></select></div><div style="flex:1"><label>Tip</label><input type="number" name="tip" min="0" value="0"></div></div><br><button class="btn">✔ Checkout & complete</button></form>` : ''}
  <div class="row" style="margin-top:14px">${a.status === 'booked' ? `<button class="btn ghost sm" data-act="edit" data-id="${a.id}">Edit</button><button class="btn ghost sm" data-act="status" data-s="noshow" data-id="${a.id}">No-show</button><button class="btn bad sm" data-act="status" data-s="cancelled" data-id="${a.id}">Cancel booking</button>` : ''}<button class="btn ghost sm" data-act="close">Close</button></div>`);
}
const simpleForm = (title, kind, fields, id) => {
  const o = id ? S[kind].find(x => x.id === id) : {};
  openModal(`<h2>${title}</h2><form data-form="${kind}" data-id="${id || ''}">${fields.map(([n, l, t]) => `<label>${l}</label>${t === 'textarea' ? `<textarea name="${n}">${esc(o[n])}</textarea>` : `<input name="${n}" type="${t}" value="${esc(o[n] ?? '')}" required>`}`).join('')}<br><div class="row"><button class="btn">Save</button><button type="button" class="btn ghost" data-act="close">Cancel</button></div></form>`);
};

// ---------- events ----------
document.addEventListener('click', e => {
  const nb = e.target.closest('[data-view]'); if (nb) { ui.view = nb.dataset.view; return render(); }
  const el = e.target.closest('[data-act]'); if (!el) return;
  const d = el.dataset, act = d.act;
  if (act === 'close') return closeModal();
  if (act === 'day') { ui.date = d.n === '0' ? today() : addDays(ui.date, +d.n); return render(); }
  if (act === 'new') return apptForm({ barberId: d.barber, time: d.time });
  if (act === 'appt') return apptDetail(d.id);
  if (act === 'edit') return apptForm({ id: d.id });
  if (act === 'client') return simpleForm(d.id ? 'Edit client' : 'New client', 'clients', [['name', 'Name', 'text'], ['phone', 'Phone', 'text'], ['notes', 'Notes / preferred cut', 'textarea']], d.id);
  if (act === 'service') return simpleForm(d.id ? 'Edit service' : 'New service', 'services', [['name', 'Name', 'text'], ['price', 'Price (₱)', 'number'], ['mins', 'Duration (min, multiples of 30)', 'number']], d.id);
  if (act === 'barber') return simpleForm(d.id ? 'Edit barber' : 'New barber', 'barbers', [['name', 'Name', 'text'], ['pct', 'Commission %', 'number']], d.id);
  if (act === 'logout') { token = ''; try { localStorage.removeItem('bp.token'); } catch (e) { } loggedIn = false; return render(); }
  if (act === 'del') { if (confirm('Delete?')) mut(() => api('DELETE', `/api/${d.kind}/${d.id}`)); return; }
  if (act === 'status') { mut(() => api('PUT', `/api/appts/${d.id}`, { status: d.s })).then(() => closeModal()); return; }
  if (act === 'obtime') { ob.time = d.t; return render(); }
  if (act === 'obreset') { ob = { svc: [], barber: 'any', date: today(), time: '', name: '', phone: '', done: null }; return render(); }
  if (act === 'obconfirm') {
    const dd = sumM(ob.svc);
    if (!dd || !ob.time || !ob.name.trim()) return alert('Pumili ng service, oras, at ilagay ang pangalan.');
    fetch('/api/public/book', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: ob.name, phone: ob.phone, date: ob.date, time: ob.time, barberId: ob.barber, serviceIds: ob.svc }) })
      .then(async r => { const j = await r.json(); if (!r.ok) { alert(j.error + '. Pumili ng ibang oras.'); ob.time = ''; return load(); } ob.done = `${j.date} at ${fmt12(j.time)} with ${j.barber}. See you, ${ob.name}!`; await load(); render(); })
      .catch(() => alert('Hindi maabot ang server.'));
  }
});
document.addEventListener('change', e => {
  const t = e.target;
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
  const fd = new FormData(f), kind = f.dataset.form, id = f.dataset.id;
  if (kind === 'appt') {
    const ids = fd.getAll('svc'), err = f.querySelector('#err');
    if (!ids.length) return err.textContent = 'Pumili ng kahit isang service.';
    const cname = (fd.get('cname') || '').trim();
    if (!fd.get('client') && !cname) return err.textContent = 'Ilagay ang pangalan ng client.';
    const bid = fd.get('barber'), date = fd.get('date'), time = fd.get('time');
    if (!isFree(bid, date, toMin(time), sumM(ids), id)) return err.textContent = 'May conflict sa oras (o labas sa 9AM–9PM). Pumili ng ibang oras.';
    run(async () => {
      let cid = fd.get('client');
      if (!cid) cid = (await api('POST', '/api/clients', { name: cname, phone: fd.get('cphone') || '', notes: '' })).id;
      const rec = { barberId: bid, date, time, clientId: cid, serviceIds: ids };
      if (id) await api('PUT', `/api/appts/${id}`, rec); else await api('POST', '/api/appts', { ...rec, status: 'booked' });
      ui.date = date;
    }, err);
    return;
  }
  if (kind === 'login') {
    const err = f.querySelector('#err');
    api('POST', '/api/login', { password: fd.get('password') }).then(j => { token = j.token; try { localStorage.setItem('bp.token', token); } catch (e) { } return load(); }).then(render).catch(x => err.textContent = x.message);
    return;
  }
  if (kind === 'checkout') run(() => api('PUT', `/api/appts/${id}`, { status: 'done', pay: fd.get('pay'), tip: +fd.get('tip') || 0 }));
  else {
    const o = {}; for (const [k, v] of fd.entries()) o[k] = ['price', 'mins', 'pct'].includes(k) ? +v : v;
    run(() => id ? api('PUT', `/api/${kind}/${id}`, o) : api('POST', `/api/${kind}`, o), f.querySelector('#err'));
  }
});
// mutation helper for forms: close the dialog only if the server accepted it
function run(fn, errEl) { mut(fn, errEl).then(ok => { if (ok) closeModal(); }); }
load().then(() => setInterval(() => { if (!modal.open && loggedIn && !PUBLIC && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) load(); }, 15000));
render();
