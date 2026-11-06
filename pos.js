// Brotherhood cashier app (phone-first). Talks to the same backend as the admin back office.
const peso = n => '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hm = iso => iso ? new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }) : '';
const mins = iso => Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000));
const sheet = document.getElementById('sheet'), app = document.getElementById('app');
const ICONS = {
  scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12"/>',
  grid: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  pos: '<path d="M4 2v20l3-2 3 2 3-2 3 2 3-2V2l-3 2-3-2-3 2-3-2z"/><path d="M8 8h8M8 12h8"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>', phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  wallet: '<path d="M3 7a2 2 0 0 1 2-2h13v4"/><path d="M3 7v11a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2z"/><circle cx="17" cy="14" r="1"/>',
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  hourglass: '<path d="M6 2h12M6 22h12M7 2v4a5 5 0 0 0 2 4l3 2-3 2a5 5 0 0 0-2 4v4M17 2v4a5 5 0 0 1-2 4l-3 2 3 2a5 5 0 0 1 2 4v4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  printer: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  bottle: '<path d="M10 2h4M10 2v4l-2 3v11a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V9l-2-3V2"/>', coin: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4"/>',
  cart: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/>', star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.3-6.2 3.3L7 14.2 2 9.3l6.9-1z"/>', lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'
};
const ic = (n, c = '') => `<svg class="i ${c}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]}</svg>`;
const t12 = t => { const [h, m] = String(t).split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; };
const ymd = (n = 0) => { const d = new Date(Date.now() + n * 864e5); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const av = (name, photo, cls = '') => photo ? `<img class="av ${cls}" src="${esc(photo)}" alt="${esc(name)}" loading="lazy">` : `<span class="av ${cls}">${esc(initials(name))}</span>`;
function beep() { try { const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain(); o.frequency.value = 880; g.gain.value = 0.08; o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + 0.18); } catch (e) { } }
const initials = s => String(s || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const openSheet = h => { sheet.innerHTML = h; if (!sheet.open) sheet.showModal(); };
const closeSheet = () => { if (sheet.open) sheet.close(); };
function toast(msg, err) { const t = document.createElement('div'); t.className = 'toast' + (err ? ' err' : ''); t.textContent = msg; document.body.append(t); setTimeout(() => t.remove(), 2600); }

let token = ''; try { token = localStorage.getItem('bp.pos') || ''; } catch (e) { }
const P = { apptDate: ymd(0), bk: [], na: null, me: null, branch: '', branches: [], boot: null, dash: null, queue: [], att: [], exp: null, shift: null, z: [], zs: [], view: 'dashboard', pin: '', err: '',
  cart: { items: [], barberId: '', mode: 'later', editing: null }, cust: { q: '', tier: '', rows: [], total: 0 }, cat: 'all', qf: { status: 'active', barber: '' }, expRange: 'today', expQ: '', tab: 'close', denoms: {}, remarks: '', custHits: [] };
const DENOMS = [1000, 500, 200, 100, 50, 20, 10, 5, 1, 0.25];
// which sections this login may open (the owner sets this in Settings → Access)
const VMAP = { dashboard: 'dashboard', pos: 'pos', appts: 'bookings', queue: 'queue', expenses: 'expenses', attendance: 'attendance', reading: 'reading', customers: 'customers' };
const freshCart = () => ({ items: [], editing: null, mode: (typeof P !== 'undefined' && P.cart && P.cart.mode) || 'later' });
const isAdminRole = () => P.me && ['owner', 'admin'].includes(P.me.role);
const canOpen = v => (P.mods || []).includes(VMAP[v]);
const firstView = () => Object.keys(VMAP).find(canOpen) || '';
const br = () => isAdminRole() ? `branch=${P.branch}` : '';
const withBr = u => { const b = br(); return b ? u + (u.includes('?') ? '&' : '?') + b : u; };

async function api(method, url, body) {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && url !== '/api/login') { token = ''; P.me = null; render(); throw new Error('Login required'); }
  if (!r.ok) throw new Error(j.error || 'Request failed');
  return j;
}
const guard = async fn => { try { return await fn(); } catch (e) { toast(e.message, true); return null; } };

// ---------- data ----------
const TIER_STEPS = [[5, 'Bronze'], [16, 'Silver'], [26, 'Gold'], [51, 'VIP']];
const nextTierOf = v => { const n = TIER_STEPS.find(([m]) => v < m); return n ? { name: n[1], need: n[0] - v } : null; };
async function loadCustomers() {
  const c = P.cust, br = P.boot?.branch?.id || P.branch || '';
  const r = await api('GET', '/api/customers?size=40&q=' + encodeURIComponent(c.q) + (c.tier ? '&tier=' + c.tier : '') + (br ? '&branch=' + br : ''));
  c.rows = r.rows; c.total = r.total;
}
async function refresh() {
  if (!P.me) return;
  if (!canOpen(P.view)) P.view = firstView() || P.view;
  try {
    P.boot = await api('GET', withBr('/api/pos/bootstrap')); P.shift = P.boot.shift;
    if (canOpen('appts')) { P.bk = await api('GET', withBr(`/api/bookings?from=${ymd(0)}&to=${ymd(14)}`)); notifyBookings(); } else P.bk = [];
    if (P.view === 'dashboard') P.dash = await api('GET', withBr('/api/pos/dashboard'));
    if (P.view === 'pos' && P.cart.mode !== 'now') P.queue = (await api('GET', withBr('/api/pos/queue?filter=active')));
    if (P.view === 'customers') await loadCustomers();
    if (P.view === 'queue') P.queue = await api('GET', withBr('/api/pos/queue?filter=' + (P.qf.status === 'done' ? 'done' : P.qf.status === 'all' ? 'all' : 'active')));
    if (P.view === 'attendance') P.att = await api('GET', withBr('/api/pos/attendance'));
    if (P.view === 'expenses') P.exp = await api('GET', withBr(`/api/expenses?range=${P.expRange}&q=${encodeURIComponent(P.expQ)}`));
    if (P.view === 'reading') { const s = await api('GET', withBr('/api/pos/shift')); P.cur = s; P.zs = await api('GET', withBr('/api/pos/zreadings')); }
  } catch (e) { if (P.me) toast(e.message, true); }
  if (!sheet.open) render();
}
function notifyBookings() {
  const ids = new Set(P.bk.map(b => b.id));
  if (P._seen) {
    const fresh = P.bk.filter(b => !P._seen.has(b.id) && b.source === 'online' && b.status === 'booked');
    if (fresh.length) { toast(`🔔 New booking: ${fresh[0].customerName} · ${t12(fresh[0].time)}${fresh.length > 1 ? ` (+${fresh.length - 1})` : ''}`); beep(); }
  }
  P._seen = ids;
}
async function afterLogin(j) {
  token = j.token; try { localStorage.setItem('bp.pos', token); } catch (e) { }
  const st = await api('GET', '/api/state'); P.me = st.me; P.shop = st.shop; P.branches = st.branches || []; P.mods = st.modules || Object.values(VMAP);
  if (isAdminRole()) { P.branch = P.branches[0]?.id || ''; }
  await refresh();
}

// ---------- shell ----------
const TITLES = { dashboard: 'Executive Dashboard', pos: 'Point of Sale', queue: 'Walk-in Queue', expenses: 'Shop Expenses', attendance: 'Barber Attendance', reading: 'Sales Reading', appts: 'Appointments', customers: 'Customer Directory' };
function render() {
  if (!P.me) {
    app.innerHTML = `<main class="login"><img class="logo" src="/logo.png" alt=""><h1>Brotherhood</h1><p class="mute">Barbershop POS</p>
      <div class="dots">${[0, 1, 2, 3, 4, 5].map(i => `<i class="${i < P.pin.length ? 'on' : ''}"></i>`).join('')}</div><p style="color:var(--bad);min-height:22px;font-size:13px">${esc(P.err) || 'Enter your 6-digit PIN'}</p>
      <div class="pin">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-a="pin" data-n="${n}">${n}</button>`).join('')}<button data-a="pinclr" class="ghost">CLR</button><button data-a="pin" data-n="0">0</button><button data-a="pinbk" class="ghost">⌫</button></div></main>`;    return;
  }
  const b = P.boot;
  if (!canOpen(P.view)) P.view = firstView();
  if (!P.view) { app.innerHTML = `<main class="login"><h1>No access</h1><p class="mute">Your login has no sections turned on. Ask the owner to enable them in Settings → Access.</p><button data-a="logout">Logout</button></main>`; return; }
  const nav = [['dashboard', 'grid', 'Dashboard'], ['pos', 'pos', 'POS'], ['appts', 'calendar', 'Bookings'], ['queue', 'users', 'Queue'], ['customers', 'star', 'Customers']].filter(([k]) => canOpen(k));
  const s = P.shift, enter = P.view !== P._rv ? 'enter' : ''; P._rv = P.view;
  app.innerHTML = `<header><button class="burger" data-a="more">${ic('menu')}</button><div class="ttl"><h1>${TITLES[P.view]}</h1><small>${esc(b?.branch?.name || '')} · ${esc(P.me.name)}</small></div><span class="shiftchip ${s ? 'on' : ''}">${s ? '● Shift #' + s.no : '○ No shift'}</span></header>
    <main class="${enter}">${isAdminRole() ? `<select data-a="branchsel" style="margin-bottom:12px">${P.branches.map(x => `<option value="${x.id}" ${x.id === P.branch ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>` : ''}${b ? VIEWS[P.view]() : '<p class="mute">Loading…</p>'}</main>
    ${P.view === 'pos' && P.cart.items.length ? `<div class="cartbar"><button class="block" data-a="cart">${ic('cart')} ${P.cart.items.reduce((s, i) => s + i.qty, 0)} item(s) · ${peso(cartTotal())} — View cart</button></div>` : ''}
    <nav class="bottom"><div>${nav.map(([k, icn, l]) => `<button class="${P.view === k ? 'on' : ''}" data-a="${k === 'more' ? 'more' : 'go'}" data-v="${k}">${ic(icn)}${l}</button>`).join('')}</div></nav>`;
}
const staffById = id => P.boot?.staff.find(s => s.id === id);
const cuttingIds = () => new Set((P.boot?.queue || []).filter(o => o.status === 'in_chair').map(o => o.barberId));
const stateLabel = { present: 'Present', late: 'Late', break: 'On break', off: 'Off duty', out: 'Timed out', none: 'Not timed in' };

// ---------- views ----------
const VIEWS = {
  dashboard() {
    const d = P.dash; if (!d) return '<p class="mute">Loading…</p>';
    return `<div class="card hero"><small>Today's gross sales</small><div class="num">${peso(d.gross)}</div><span class="mute">${d.completed} completed order${d.completed === 1 ? '' : 's'} · net ${peso(d.net)}</span></div>
    <div class="kpis"><div class="card kpi b"><div class="ic">${ic('hourglass')}</div><small>Waiting in queue</small><div class="num">${d.waiting}</div><small>${d.cutting} in chair</small></div>
      <div class="card kpi g"><div class="ic">${ic('scissors')}</div><small>Barbers on duty</small><div class="num">${d.onDuty}<span class="mute" style="font-size:18px"> / ${d.totalBarbers}</span></div><small>available for walk-ins</small></div></div>
    ${bookingsCard()}
    <div class="sect"><h3>Live walk-in floor</h3><span class="mute">${d.queue.length} active</span></div>${d.queue.map(o => ticketHtml(o)).join('') || '<div class="card" style="text-align:center"><p class="mute" style="margin:6px 0">No customers on the floor right now.</p></div>'}`;
  },  pos() {
    const b = P.boot, s = P.shift, cats = b.categories, items = b.items.filter(i => P.cat === 'all' || i.categoryId === P.cat);
    return `${s ? '' : `<div class="card" style="border-color:#f2b8bf;background:#fff4f5"><b style="color:var(--bad)">No open shift</b><p class="mute" style="margin:4px 0 12px">Open a shift first so you can take payments.</p><button class="sm" data-a="openshift">${ic('lock', 'sm')} Open shift</button></div>`}
    ${P.cart.editing ? `<div class="card">Editing ticket · <button class="sm ghost" data-a="canceledit">cancel</button></div>` : `<div class="seg"><button class="${P.cart.mode === 'now' ? 'on' : ''}" data-a="mode" data-m="now">Pay As You Order</button><button class="${P.cart.mode !== 'now' ? 'on' : ''}" data-a="mode" data-m="later">Pay Later${P.cart.mode !== 'now' && (P.queue || []).filter(o => ['waiting', 'in_chair'].includes(o.status)).length ? ' (' + (P.queue || []).filter(o => ['waiting', 'in_chair'].includes(o.status)).length + ')' : ''}</button></div>`}
    ${P.cart.mode !== 'now' && !P.cart.editing ? payLaterList() : ''}
    <div class="chips"><button class="chip ${P.cat === 'all' ? 'on' : ''}" data-a="cat" data-c="all">All</button>${cats.map(c => `<button class="chip ${P.cat === c.id ? 'on' : ''}" data-a="cat" data-c="${c.id}">${esc(c.name)}</button>`).join('')}</div>
    <div class="grid">${items.map(i => `<button class="item ${i.type} ${i.photo ? 'hasphoto' : ''}" data-a="add" data-id="${i.id}">${i.photo ? `<img class="pic" src="${esc(i.photo)}" alt="" loading="lazy">` : `<span class="mono">${ic(i.type === 'service' ? 'scissors' : 'bottle')}</span>`}<span class="body"><span class="nm">${esc(i.name)}</span><small>${i.type === 'service' ? i.mins + ' min' : 'Product'}${i.apptOnly ? ' · Appt only' : ''}</small><b>${peso(i.price)}</b></span><span class="plus">${ic('plus', 'sm')}</span></button>`).join('')}</div>`;
  },
  appts() {
    const days = [0, 1, 2, 3, 4, 5, 6].map(n => ({ v: ymd(n), l: n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : new Date(Date.now() + n * 864e5).toLocaleDateString('en-PH', { weekday: 'short', day: 'numeric' }) }));
    const list = P.bk.filter(b => b.date === P.apptDate), live = list.filter(b => b.status === 'booked').length;
    return `<button class="block" data-a="newappt" style="margin-bottom:14px;padding:16px">${ic('plus')} New appointment</button>
    <div class="chips">${days.map(d => `<button class="chip ${P.apptDate === d.v ? 'on' : ''}" data-a="apptdate" data-d="${d.v}">${d.l}${P.bk.filter(b => b.date === d.v && b.status === 'booked').length ? ` · ${P.bk.filter(b => b.date === d.v && b.status === 'booked').length}` : ''}</button>`).join('')}</div>
    <div class="sect"><h3>${live} upcoming</h3><span class="mute">${list.length} total</span></div>
    ${list.map(b => `<div class="appt ${b.status}"><div class="tm"><b>${t12(b.time).split(' ')[0]}</b><small>${t12(b.time).split(' ')[1]}</small></div><div class="bd">
      <div class="row between" style="flex-wrap:nowrap"><b>${esc(b.customerName)}</b><span class="tag ${b.status === 'booked' ? 'waiting' : b.status === 'arrived' ? 'paid' : 'void'}">${b.status === 'noshow' ? 'No-show' : b.status[0].toUpperCase() + b.status.slice(1)}</span></div>
      <small>${b.items.map(i => esc(i.name)).join(', ')} · ${peso(b.total)}</small>
      <div class="who">${av(b.staffName, b.staffPhoto, 'xs')}<small>${esc(b.staffName || 'Any barber')} · ${b.source === 'online' ? 'Online' : 'Phone/POS'}</small></div>
      <div class="acts"><a class="sm ghost callbtn" href="tel:${esc(b.phone)}">${ic('phone', 'sm')} ${esc(b.phone)}</a>${b.status === 'booked' ? `<button class="sm ok" data-a="arrive" data-id="${b.id}">Arrived</button><button class="sm ghost" data-a="bkno" data-id="${b.id}">No-show</button><button class="sm bad" data-a="bkcancel" data-id="${b.id}">Cancel</button>` : ''}</div></div></div>`).join('') || '<div class="card" style="text-align:center"><p class="mute" style="margin:6px 0">No bookings on this day.</p></div>'}`;
  },  queue() {
    const f = P.qf, list = P.queue.filter(o => (f.status === 'waiting' ? o.status === 'waiting' : f.status === 'chair' ? o.status === 'in_chair' : true) && (!f.barber || o.barberId === f.barber));
    const waiting = P.queue.filter(o => o.status === 'waiting'), chair = P.queue.filter(o => o.status === 'in_chair');
    const avail = (P.boot.staff.filter(s => ['present', 'late'].includes(s.state)).length - chair.length) || 1;
    const est = Math.round(waiting.reduce((t, o) => t + o.items.filter(i => i.type === 'service').reduce((m, i) => m + 30 * i.qty, 0), 0) / Math.max(1, avail));
    return `<button class="block" data-a="newticket" style="margin-bottom:14px;padding:16px">${ic('plus')} Add Walk-in Ticket</button>
    <div class="kpis"><div class="card kpi g"><div class="ic">${ic('scissors')}</div><small>Now in chair</small><div class="num">${chair.length}</div></div>
      <div class="card kpi b"><div class="ic">${ic('hourglass')}</div><small>Waiting in line</small><div class="num">${waiting.length}</div><small>Est. wait ~${est} min</small></div></div>    <div class="row" style="margin-bottom:12px"><div style="flex:1"><label>Ticket status</label><select data-a="qstatus">${[['active', 'Active queue'], ['waiting', 'Waiting'], ['chair', 'In chair'], ['done', 'Completed today'], ['all', 'All today']].map(([v, l]) => `<option value="${v}" ${f.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div style="flex:1"><label>Filter by barber</label><select data-a="qbarber"><option value="">All barbers</option>${P.boot.staff.map(s => `<option value="${s.id}" ${f.barber === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div></div>
    ${list.map(o => ticketHtml(o, 'queue')).join('') || '<p class="mute" style="text-align:center">No tickets found in this queue view.</p>'}`;
  },
  customers() {
    const c = P.cust;
    return `<div class="row" style="margin-bottom:10px;flex-wrap:nowrap"><input id="custq" placeholder="Search name, phone or email" value="${esc(c.q)}" style="flex:1"><select data-a="custtier" style="width:130px;flex:none"><option value="">All tiers</option>${['member', 'bronze', 'silver', 'gold', 'vip'].map(x => `<option value="${x}" ${c.tier === x ? 'selected' : ''}>${x === 'vip' ? 'VIP' : x[0].toUpperCase() + x.slice(1)}</option>`).join('')}</select></div>
    <p class="mute" style="margin:0 2px 10px;font-size:13px">${c.total} customer${c.total === 1 ? '' : 's'} · ${esc(P.boot?.branch?.name || '')} · 1 paid visit = 1 point</p>
    ${c.rows.map(h => { const nt = nextTierOf(h.visits); return `<div class="card" style="padding:14px"><div class="row between" style="flex-wrap:nowrap"><b style="font-size:16px">${esc(h.name)}</b><span class="${tierCls(h.tier)}">${h.tier}</span></div>
      <div class="row" style="margin-top:8px;gap:18px"><div><div class="num" style="font-size:30px;line-height:1">${h.visits}</div><small class="mute">points</small></div><div style="flex:1;min-width:0"><small class="mute">${nt ? nt.need + ' more visit' + (nt.need === 1 ? '' : 's') + ' to reach ' + nt.name : 'Top tier reached'}</small>${nt ? `<div style="height:6px;border-radius:6px;background:var(--s3);margin-top:6px;overflow:hidden"><div style="height:100%;width:${Math.min(100, Math.round(h.visits / (h.visits + nt.need) * 100))}%;background:#000"></div></div>` : ''}</div></div>
      <small class="mute" style="display:block;margin-top:8px">${esc(h.phone || '')}${h.phone && h.email ? ' · ' : ''}${esc(h.email || '')}</small>
      <small class="mute">Last visit: ${h.lastVisit ? new Date(h.lastVisit).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : 'none yet'} · Spent ${peso(h.spent)}${h.preferredCut ? ' · ✂ ' + esc(h.preferredCut) : ''}</small></div>`; }).join('') || '<div class="card" style="text-align:center"><p class="mute" style="margin:6px 0">No customers found for this branch.</p></div>'}`;
  },
  expenses() {
    const e = P.exp; if (!e) return '<p class="mute">Loading…</p>';
    return `<div class="grid"><div class="card"><small class="mute">Today's expenses</small><b style="font-size:20px;display:block">${peso(e.today)}</b></div><div class="card"><small class="mute">This month</small><b style="font-size:20px;display:block">${peso(e.month)}</b></div></div>
    <input id="expq" placeholder="Search description, cashier, barber" value="${esc(P.expQ)}"><select data-a="exprange" style="margin:8px 0 12px">${[['today', 'Today'], ['month', 'This month'], ['all', 'All time']].map(([v, l]) => `<option value="${v}" ${P.expRange === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <p class="mute">Filtered total: <b>${peso(e.filtered)}</b> · ${e.rows.length} entries</p>
    ${e.rows.map(m => `<div class="card"><div class="row between"><b>${esc(m.note || 'Expense')}</b><b>${peso(m.amount)}</b></div><small class="mute">${hm(m.ts)} · ${esc(m.by)}${m.staffName ? ' · ' + esc(m.staffName) : ''}</small></div>`).join('') || '<p class="mute" style="text-align:center">No expenses match the selected filters.</p>'}
    <div class="fab"><button data-a="addexp">${ic('plus')} Add Expense</button></div>`;
  },
  attendance() {
    const cnt = k => P.att.filter(s => s.state === k).length;
    return `<div class="grid"><div class="card"><small class="mute">Present (on time)</small><b style="font-size:22px;display:block">${cnt('present')}</b></div><div class="card"><small class="mute">Late</small><b style="font-size:22px;display:block">${cnt('late')}</b></div>
    <div class="card"><small class="mute">On break</small><b style="font-size:22px;display:block">${cnt('break')}</b></div><div class="card"><small class="mute">Not timed in</small><b style="font-size:22px;display:block">${cnt('none')}</b></div></div>
    <div class="card"><b>Barber attendance roster</b> <span class="mute">· ${P.att.length} barbers</span>
    ${P.att.map(s => `<hr><div class="row between"><div class="row" style="flex-wrap:nowrap">${av(s.name, s.photo)}<div><b>${esc(s.name)}</b><br><small class="mute">${esc(s.chairName || 'No chair assigned')}${s.timeIn ? ' · in ' + hm(s.timeIn) : ''}</small></div></div><span class="tag ${s.state}">${stateLabel[s.state]}</span></div>
      <div class="row" style="margin-top:8px">${s.state === 'none' || s.state === 'off' ? `<button class="sm" data-a="att" data-id="${s.id}" data-x="in">Time in</button>` + (s.state === 'none' ? `<button class="sm ghost" data-a="att" data-id="${s.id}" data-x="off">Off duty</button>` : '') : ''}
      ${s.state === 'present' || s.state === 'late' ? `<button class="sm ghost" data-a="att" data-id="${s.id}" data-x="break_start">Start break</button><button class="sm bad" data-a="att" data-id="${s.id}" data-x="out">Time out</button>` : ''}
      ${s.state === 'break' ? `<button class="sm ok" data-a="att" data-id="${s.id}" data-x="break_end">End break</button>` : ''}</div>`).join('')}</div>`;
  },
  reading() {
    const tabs = `<div class="seg"><button class="${P.tab === 'close' ? 'on' : ''}" data-a="tab" data-t="close">Closing Tender</button><button class="${P.tab === 'z' ? 'on' : ''}" data-a="tab" data-t="z">Z Reading</button></div>`;
    if (P.tab === 'z') return tabs + (P.zs.map((z, idx) => `<div class="card" data-a="viewz" data-i="${idx}" style="cursor:pointer"><div class="row between"><b>Z-${z.no}</b><span class="mute">${z.businessDate}</span></div><small class="mute">Shift #${z.data.shiftNo || ''} · ${hm(z.generatedAt)}</small><hr>
      <div class="row between"><span>Net sales</span><b>${peso(z.data.net)}</b></div><div class="row between"><span>Expected cash</span><span>${peso(z.data.expected)}</span></div><div class="row between"><span>Counted</span><span>${peso(z.data.counted)}</span></div>
      <div class="row between"><span>Variance</span><b style="color:${z.data.variance < 0 ? 'var(--bad)' : z.data.variance > 0 ? 'var(--info)' : 'var(--ok)'}">${peso(z.data.variance)}</b></div></div>`).join('') || '<p class="mute">No Z-readings yet.</p>');
    const c = P.cur; if (!c?.shift) return tabs + `<div class="card"><p>There is no open shift.</p><button data-a="openshift">Open shift</button></div>`;
    const z = c.z, counted = DENOMS.reduce((t, d) => t + d * (P.denoms[d] || 0), 0), nonCash = Object.entries(z.tender).filter(([k]) => k !== 'Cash'), variance = counted - z.expected;
    return `${tabs}<div class="card"><b>Cash denomination counter</b><p class="mute" style="margin:2px 0 6px">Count the bills and coins in the drawer</p>
      ${DENOMS.map(d => `<div class="row between" style="padding:6px 0"><b style="width:70px">₱${d}</b><div class="qty"><button class="ghost sm" data-a="den" data-d="${d}" data-n="-1">−</button><input type="number" min="0" inputmode="numeric" data-den="${d}" value="${P.denoms[d] || 0}" style="width:70px;text-align:center"><button class="ghost sm" data-a="den" data-d="${d}" data-n="1">＋</button></div><span style="width:90px;text-align:right">${peso(d * (P.denoms[d] || 0))}</span></div>`).join('')}</div>
    <div class="card"><b>Non-cash (auto)</b>${nonCash.map(([k, v]) => `<div class="row between"><span>${esc(k)}</span><span>${peso(v)}</span></div>`).join('') || '<p class="mute">No non-cash transactions for this shift.</p>'}</div>
    <div class="card"><b>Shift drawer reconciliation</b><hr>
      <div class="row between"><span>Opening float</span><span>${peso(z.openingFloat)}</span></div><div class="row between"><span>+ Cash sales</span><span>${peso(z.cashSales)}</span></div>
      <div class="row between"><span>+ Cash in</span><span>${peso(z.cashIn)}</span></div><div class="row between"><span>− Cash out / expenses / advances</span><span>${peso(z.cashOut)}</span></div><hr>
      <div class="row between"><b>Expected cash in drawer</b><b>${peso(z.expected)}</b></div><div class="row between"><span>Declared physical cash</span><span>${peso(counted)}</span></div>
      <div class="row between"><b>Cash variance (over / short)</b><b id="var" style="color:${variance < 0 ? 'var(--bad)' : variance > 0 ? 'var(--info)' : 'var(--ok)'}">${peso(variance)}</b></div>
      <div class="row" style="margin:10px 0"><button class="sm ghost" data-a="cashmove" data-k="in">＋ Cash in</button><button class="sm ghost" data-a="cashmove" data-k="out">− Cash out</button></div>
      <label>Closing remarks (optional)</label><textarea id="remarks">${esc(P.remarks)}</textarea><br><br><button class="block" data-a="closeshift">${ic('lock')} Submit & Close Shift</button></div>`;
  }
};
function payLaterList() {
  const open = (P.queue || []).filter(o => ['waiting', 'in_chair'].includes(o.status)).sort((a, b) => (a.status === 'in_chair' ? 0 : 1) - (b.status === 'in_chair' ? 0 : 1) || String(a.createdAt).localeCompare(String(b.createdAt)));
  return `<details class="card" style="padding:12px" ${open.length ? 'open' : ''}><summary style="cursor:pointer;font-weight:700;list-style:none;display:flex;justify-content:space-between;align-items:center"><span>Pay Later tickets</span><span class="mute">${open.length} open · check out here</span></summary><div style="margin-top:10px">${open.map(o => ticketHtml(o, true)).join('') || '<p class="mute" style="margin:6px 0;text-align:center">No open tickets. Add a service below to start one.</p>'}</div></details>`;
}
function ticketHtml(o, actions) {
  const names = o.items.map(i => esc(i.name) + (i.qty > 1 ? ' ×' + i.qty : '')).join(', ');
  const live = o.status === 'waiting' || o.status === 'in_chair';
  return `<div class="ticket ${o.status}"><div class="no">#${String(o.no).padStart(3, '0')}</div><div class="bd"><div class="row between" style="flex-wrap:nowrap"><b>${esc(o.customerName)}</b><span class="tag ${o.status}">${o.status === 'in_chair' ? 'In Chair' : o.status === 'paid' ? 'Paid' : o.status === 'void' ? 'Void' : o.barberId ? 'Queued' : 'Waiting'}</span></div>
    <small>${names || 'No items yet'}</small><br><small>${o.barberName ? ic('scissors', 'sm') + ' ' + esc(o.barberName) + (o.chairId ? ' · ' + esc(chairName(o.chairId)) : '') : 'No barber yet'}${live ? ' · ' + mins(o.startedAt || o.createdAt) + ' min' : ''}${o.status === 'paid' ? ' · ' + peso(o.total) : ''}</small>${o.cust ? `<br><small><span class="${tierCls(o.cust.tier)}">${o.cust.tier}</span> ${o.cust.visits} visit${o.cust.visits === 1 ? '' : 's'}${o.cust.preferredCut ? ' · ✂ ' + esc(o.cust.preferredCut) : ''}</small>` : ''}
    ${actions === 'queue' && live ? `<div class="acts">${o.status === 'waiting' ? `<button class="sm" data-a="seat" data-id="${o.id}">${o.barberId ? 'Reassign' : 'Seat'}</button>` : `<button class="sm ghost" data-a="gopl">Check out in Pay Later</button>`}</div>` : ''}
    ${actions === true && live ? `<div class="acts">${o.status === 'waiting' ? `<button class="sm" data-a="seat" data-id="${o.id}">${o.barberId ? 'Reassign' : 'Seat'}</button>` : `<button class="sm ok" data-a="checkout" data-id="${o.id}">Checkout</button>`}<button class="sm ghost" data-a="editticket" data-id="${o.id}">Edit</button><button class="sm bad" data-a="void" data-id="${o.id}">Void</button></div>` : ''}</div></div>`;
}
function bookingsCard() {
  const t = ymd(0), list = (P.bk || []).filter(b => b.date === t && b.status === 'booked').sort((a, b) => a.time.localeCompare(b.time)), next = list[0];
  return `<div class="card kpi" data-a="go" data-v="appts" style="cursor:pointer;display:flex;gap:14px;align-items:center"><div class="ic" style="margin:0">${ic('calendar')}</div><div style="flex:1"><small>Bookings today</small><div class="num" style="font-size:24px">${list.length} upcoming</div>${next ? `<small>Next: ${esc(next.customerName)} · ${t12(next.time)}</small>` : '<small>No pending bookings</small>'}</div></div>`;
}
function apptSheet() {
  const n = P.na, svcs = P.boot.items.filter(i => i.type === 'service');
  openSheet(`<div class="row between"><h2 style="margin:0">New appointment</h2><button class="ghost sm" data-a="closesheet">Close</button></div>
    <label>Customer name</label><input data-na="name" value="${esc(n.name)}"><label>Mobile number</label><input data-na="phone" type="tel" inputmode="tel" placeholder="09XX XXX XXXX" value="${esc(n.phone)}">
    <label>Services</label><div class="chips" style="flex-wrap:wrap">${svcs.map(i => `<button class="chip ${n.items.includes(i.id) ? 'on' : ''}" data-a="natoggle" data-id="${i.id}">${esc(i.name)} · ${peso(i.price)}</button>`).join('')}</div>
    <label>Barber</label><select data-na="staff"><option value="any">Any available</option>${P.boot.staff.map(s => `<option value="${s.id}" ${n.staff === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
    <label>Date</label><input data-na="date" type="date" min="${ymd(0)}" value="${n.date}">
    <label>Time</label>${!n.items.length ? '<p class="mute">Choose a service first.</p>' : n.slots === null ? '<p class="mute">Looking for open times…</p>' : n.slots.length ? `<div class="chips" style="flex-wrap:wrap">${n.slots.map(t => `<button class="chip ${n.time === t ? 'on' : ''}" data-a="natime" data-t="${t}">${t12(t)}</button>`).join('')}</div>` : '<p class="mute">No open times.</p>'}
    <p id="err" style="color:var(--bad)">${esc(n.err)}</p><button class="block" id="nasave" data-a="nasave" ${n.time && n.name.trim() && n.phone.replace(/\D/g, '').length >= 10 ? '' : 'disabled'}>Save appointment</button>`);
}
async function naSlots() {
  const n = P.na; n.time = ''; n.slots = null; apptSheet();
  if (!n.items.length) return;
  try { n.slots = (await api('GET', `/api/public/slots?branch=${P.boot.branch.id}&date=${n.date}&staff=${n.staff}&items=${n.items.join(',')}`)).slots; } catch (e) { n.slots = []; }
  apptSheet();
}

// ---------- cart / ticket / payment ----------
const cartHasService = () => P.cart.items.some(i => i.type === 'service');
const cartTotal = () => P.cart.items.reduce((s, i) => s + i.price * i.qty, 0);
function discountOf() { const d = P.boot.discounts.find(x => x.id === P.cart.discountId); if (!d) return 0; const sub = cartTotal(); return Math.min(sub, d.kind === 'percent' ? sub * d.value / 100 : d.value); }
function pushItem(it) { const c = P.cart.items.find(x => x.itemId === it.id); if (c) c.qty++; else P.cart.items.push({ itemId: it.id, name: it.name, type: it.type, price: it.price, qty: 1 }); }
function addItem(id) {
  const it = P.boot.items.find(i => i.id === id);
  if (it.apptOnly && !P.cart.items.some(x => x.itemId === id)) { toast(it.name + ' is by appointment only. Use the Bookings tab.', true); return; }
  if (!cu().name.trim()) return customerSheet(it);   // first item: ask who the customer is (same as the other POS)
  pushItem(it); render();
}
function freeBarbers() { const cut = cuttingIds(); return P.boot.staff.filter(s => ['present', 'late'].includes(s.state) && !cut.has(s.id)); }
const chairName = id => P.boot?.chairs.find(c => c.id === id)?.name || '';
// "Assign to Chair": each chair is a card with its barber. Free chair = seated now; busy chair = joins that barber's line.
function chairState(ch, orderId) {
  const barber = P.boot.staff.find(s => s.chairId === ch.id);
  const q = (P.boot.queue || []).filter(o => o.chairId === ch.id && o.id !== orderId && ['in_chair', 'waiting'].includes(o.status)).length;
  if (!barber) return { barber: null, cls: 'off', label: 'No barber assigned', ok: false };
  if (!['present', 'late'].includes(barber.state)) return { barber, cls: 'off', label: barber.state === 'break' ? 'Barber on break' : 'Barber not on duty', ok: false };
  return q ? { barber, cls: 'busy', label: 'Add to Queue (' + q + ')', ok: true } : { barber, cls: 'free', label: 'Available', ok: true };
}
function assignSheet(id, payAfter) {
  P.as = { id, payAfter: !!payAfter };
  openSheet(`<h2 style="margin:0 0 12px;text-align:center">Assign to Chair</h2><div class="chairs">${P.boot.chairs.map(ch => {
    const s = chairState(ch, id);
    return `<button class="chair ${s.cls}" data-a="aspick" data-id="${ch.id}" ${s.ok ? '' : 'disabled'}><b>${esc(ch.name)}</b><span class="who">${s.barber ? ic('scissors', 'sm') + ' ' + esc(s.barber.name) : '—'}</span><span class="st">${s.label}</span></button>`;
  }).join('') || '<p class="mute">No chairs are set up for this branch. Add them in the back office under Chairs.</p>'}</div>
    <p id="err" style="color:var(--bad);margin:8px 0 0"></p>
    <button class="ghost block" data-a="closesheet" style="margin-top:10px">Cancel</button>`);
}
function customerSheet(pending) {
  P.pendingItem = pending || null;
  openSheet(`<div class="row between"><h2 style="margin:0">${pending ? 'Add to Cart: ' + esc(pending.name) : 'Customer details'}</h2><button class="ghost sm" data-a="closesheet">Close</button></div>
    ${pending ? `<div class="cust-card" style="margin:10px 0 0"><div class="row between"><b>${esc(pending.name)}</b><b>${peso(pending.price)}</b></div></div>` : ''}
    ${custBlock()}<p id="err" style="color:var(--bad);margin:8px 0 0"></p>
    <div class="row" style="flex-wrap:nowrap;margin-top:10px"><button class="ghost block" data-a="closesheet">Cancel</button><button class="block" data-a="custdone">${pending ? 'Add to Cart' : 'Done'}</button></div>`);
}
function discountSheet() {
  openSheet(`<div class="row between"><h2 style="margin:0">Discount</h2><button class="ghost sm" data-a="cartback">Back</button></div><p class="mute">Choose a discount voucher for this order.</p>
    <button class="opt ${P.cart.discountId ? '' : 'on'}" data-a="pickdisc" data-id=""><span><b>No discount</b></span></button>
    ${P.boot.discounts.map(d => `<button class="opt ${P.cart.discountId === d.id ? 'on' : ''}" data-a="pickdisc" data-id="${d.id}"><span><b>${esc(d.name)}</b><small>${d.kind === 'percent' ? d.value + '% off' : peso(d.value) + ' off'}</small></span></button>`).join('')}`);
}
function cartSheet() {
  const c = P.cart, u = cu(), card = u.card, sub = cartTotal(), disc = discountOf(), svc = cartHasService(), dn = P.boot.discounts.find(d => d.id === c.discountId);
  const sv = c.items.filter(i => i.type === 'service').map(i => i.name).join(', ');
  openSheet(`<div class="row between"><h2 style="margin:0">${c.editing ? 'Edit ticket' : 'Cart'}</h2><button class="ghost sm" data-a="closesheet">Close</button></div>
    <div class="custchip"><span class="av">${esc(initials(u.name || '?'))}</span><div style="flex:1;min-width:0"><b>${esc(u.name || 'No customer yet')}</b><br><small class="mute">${card ? `${esc(card.tier)} · ${card.visits} visits` : (u.phone || u.email ? 'New customer · joins the directory' : 'Walk-in · not in the directory')}</small></div><button class="ghost sm" data-a="changecust">Change</button></div>
    ${c.items.map((i, n) => `<div class="cartrow"><div style="flex:1;min-width:0"><b>${esc(i.name)}</b><br><small class="mute">${peso(i.price)} each</small></div><div class="qty"><button class="ghost sm" data-a="q" data-n="${n}" data-d="-1">−</button><b>${i.qty}</b><button class="ghost sm" data-a="q" data-n="${n}" data-d="1">＋</button></div><b style="min-width:76px;text-align:right">${peso(i.price * i.qty)}</b><button class="ghost sm" data-a="rm" data-n="${n}" aria-label="Remove">✕</button></div>`).join('') || '<p class="mute">Your cart is empty.</p>'}
    <div class="totals"><div class="row between"><span class="mute">Subtotal</span><span>${peso(sub)}</span></div>${disc ? `<div class="row between"><span class="mute">Discount${dn ? ' (' + esc(dn.name) + ')' : ''}</span><span>−${peso(disc)}</span></div>` : ''}<div class="row between" style="margin-top:6px"><b>Total Amount</b><b style="font-size:22px;font-family:Oswald">${peso(sub - disc)}</b></div></div>
    ${svc && !c.editing && c.mode !== 'now' ? `<div class="notice"><b>Chair assignment required before payment</b><br><small>Service items (${esc(sv)}) must be charged later on a chair and barber. Settle the payment afterwards from the Walk-in Queue.</small></div>` : ''}
    <div class="row" style="flex-wrap:nowrap"><button class="ghost block" data-a="discount">${ic('tag', 'sm')} Discount${dn ? ': ' + esc(dn.name) : ''}</button><button class="ghost block" data-a="clearcart">Clear</button></div>
    <p id="err" style="color:var(--bad);margin:8px 0 0"></p>
    <button class="block" data-a="${c.editing ? 'saveticket' : svc ? 'chargelater' : 'paynow'}" ${c.items.length ? '' : 'disabled'}>${c.editing ? 'Save ticket' : svc ? (c.mode === 'now' ? 'Assign Chair &amp; Barber, then Pay' : 'Charge Later — Assign Chair &amp; Barber') : 'Pay Now'}</button>`);
}

// ----- customer details: full name, phone, email, preferred haircut, T&C consent -----
const cu = () => P.cart.cu ||= { id: '', name: '', phone: '', email: '', cut: '', consent: false, card: null };
const nextTierC = v => { const n = [[5, 'Bronze'], [16, 'Silver'], [26, 'Gold'], [51, 'VIP']].find(([m]) => m > v); return n ? { name: n[1], visitsNeeded: n[0] - v } : null; };
const tierCls = t => `tier ${t}`;
const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
function custCardHtml() {
  const u = cu(), c = u.card;
  if (!c) return (u.phone.replace(/\D/g, '').length >= 10 || /@/.test(u.email)) ? `<div class="cust-card"><b>New customer</b><br><small class="mute">Will be added to the Customer Directory and start at 0 visits (Member).</small></div>` : '';
  return `<div class="cust-card"><div class="row between" style="flex-wrap:nowrap"><b>Returning customer ✓</b><span class="${tierCls(c.tier)}">${c.tier}</span></div>
    <div class="cgrid"><div><b>${c.visits}</b><small>visits / points</small></div><div><b>${peso(c.spent)}</b><small>total spent</small></div><div><b>${fmtDate(c.lastVisit)}</b><small>last visit</small></div></div>
    <small class="mute">${nextTierC(c.visits) ? `${nextTierC(c.visits).visitsNeeded} more visit${nextTierC(c.visits).visitsNeeded === 1 ? '' : 's'} to reach <b>${nextTierC(c.visits).name}</b>` : 'Top tier reached!'} · After payment: <b>${c.visits + 1}</b> points</small>
    ${c.consent ? '<br><small style="color:var(--ok)">✔ Subscribed to email and promos</small>' : ''}</div>`;
}
const hitHtml = h => `<div class="card" style="padding:10px;margin:6px 0" data-a="pickcust" data-id="${h.id}"><div class="row between" style="flex-wrap:nowrap"><b>${esc(h.name)}</b><span class="${tierCls(h.tier)}">${h.tier}</span></div><small class="mute">${esc(h.phone || h.email || '')} · ${h.visits} visits</small></div>`;
function custBlock() {
  const u = cu();
  return `<label>Full name</label><input id="cu-name" placeholder="Customer's full name (type to search existing)" value="${esc(u.name)}" autocomplete="off">
    <div id="custhits">${P.custHits.map(hitHtml).join('')}</div>
    <div class="row" style="flex-wrap:nowrap;gap:10px"><div style="flex:1;min-width:0"><label>Mobile number (optional)</label><input id="cu-phone" type="tel" inputmode="tel" placeholder="09XX XXX XXXX" value="${esc(u.phone)}"></div>
      <div style="flex:1;min-width:0"><label>Email (optional)</label><input id="cu-email" type="email" inputmode="email" placeholder="name@email.com" value="${esc(u.email)}"></div></div>
    <label>Preferred haircut</label><input id="cu-cut" placeholder="e.g. Low fade, no. 2 on the sides" value="${esc(u.cut)}">
    <div id="cu-card">${custCardHtml()}</div>
    <label class="consent"><input type="checkbox" id="cu-consent" ${u.consent || u.card?.consent ? 'checked' : ''} ${u.card?.consent ? 'disabled' : ''}><span>I agree to receive emails and promos from Brotherhood Barber, and I agree to the <a href="#" data-a="terms">Terms &amp; Conditions</a>.</span></label>
    <small class="mute" style="display:block;margin-top:6px">With a mobile number or email, the customer joins the Customer Directory and earns loyalty points. Without either, this is a ticket only.</small>`;
}
function applyCard(card) {   // fill the form from a known customer; never overwrites what was already typed
  const u = cu(); u.card = card; u.id = card.id;
  if (!u.name.trim()) u.name = card.name; if (!u.phone && card.phone) u.phone = card.phone; if (!u.email && card.email) u.email = card.email; if (!u.cut && card.preferredCut) u.cut = card.preferredCut;
  for (const [id, v] of [['cu-name', u.name], ['cu-phone', u.phone], ['cu-email', u.email], ['cu-cut', u.cut]]) { const el = document.getElementById(id); if (el) el.value = v; }
  const box = document.getElementById('cu-card'); if (box) box.innerHTML = custCardHtml();
  const cb = document.getElementById('cu-consent'); if (cb) { cb.checked = !!(u.consent || card.consent); cb.disabled = !!card.consent; }
}
async function lookupCustomer() {
  const u = cu(), digits = u.phone.replace(/\D/g, ''), em = u.email.trim();
  if (digits.length < 10 && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) { if (u.card) { u.card = null; u.id = ''; } const box = document.getElementById('cu-card'); if (box) box.innerHTML = custCardHtml(); return; }
  try {
    const r = await api('GET', `/api/customers/lookup?phone=${encodeURIComponent(digits.length >= 10 ? u.phone : '')}&email=${encodeURIComponent(em)}`);
    if (r.customer) return applyCard(r.customer);
  } catch (e) { }
  u.card = null; u.id = ''; const box = document.getElementById('cu-card'); if (box) box.innerHTML = custCardHtml();
}
function customerPayload() {
  const u = cu(); if (!u.name.trim()) throw new Error("Enter the customer's full name");
  if (u.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(u.email.trim())) throw new Error('That email address looks wrong');
  if (u.phone.trim() && u.phone.replace(/\D/g, '').length < 10) throw new Error('That mobile number looks wrong');
  return { id: u.id, name: u.name.trim(), phone: u.phone.trim(), email: u.email.trim(), preferredCut: u.cut.trim(), consent: u.consent };
}
async function termsSheet(back) {
  if (!P.terms) { try { P.terms = (await api('GET', '/api/public/terms')).terms; } catch (e) { P.terms = 'Could not load the Terms.'; } }
  openSheet(`<div class="row between"><h2 style="margin:0">Terms &amp; Conditions</h2><button class="ghost sm" data-a="${back}">Back</button></div><div class="terms">${esc(P.terms)}</div><br><button class="block" data-a="${back}">I understand</button>`);
}
function paySheet(order) {
  const p = P.pay = { order, disc: order.discountId || '', method: 'Cash', tendered: '' };
  renderPay(p);
}
function payTotals(p) {
  const d = P.boot.discounts.find(x => x.id === p.disc), sub = p.order.subtotal;
  const amt = d ? Math.min(sub, d.kind === 'percent' ? sub * d.value / 100 : d.value) : 0;
  return { sub, amt, total: Math.round((sub - amt) * 100) / 100 };
}
function renderPay(p) {
  const t = payTotals(p), tendered = p.method === 'Cash' ? (+p.tendered || 0) : t.total, change = tendered - t.total;
  openSheet(`<div class="row between"><h2 style="margin:0">Payment · #${String(p.order.no).padStart(3, '0')}</h2><button class="ghost sm" data-a="closesheet">Close</button></div>
    <p class="mute">${esc(p.order.customerName)} · ${p.order.items.map(i => esc(i.name) + (i.qty > 1 ? ' ×' + i.qty : '')).join(', ')}</p>
    <div class="row between"><span>Subtotal</span><span>${peso(t.sub)}</span></div>
    <label>Discount voucher</label><select data-a="paydisc"><option value="">None</option>${P.boot.discounts.map(d => `<option value="${d.id}" ${p.disc === d.id ? 'selected' : ''}>${esc(d.name)} (${d.kind === 'percent' ? d.value + '%' : peso(d.value)})</option>`).join('')}</select>
    <div class="row between" style="margin-top:8px"><span>Discount</span><span>−${peso(t.amt)}</span></div><div class="row between"><b style="font-size:20px">Total</b><b style="font-size:20px;color:var(--gold)">${peso(t.total)}</b></div>
    <label>Payment method</label><div class="chips">${['Cash', 'GCash', 'Maya', 'Card'].map(m => `<button class="chip ${p.method === m ? 'on' : ''}" data-a="paym" data-m="${m}">${m}</button>`).join('')}</div>
    ${p.method === 'Cash' ? `<label>Cash received</label><input id="tendered" type="number" inputmode="decimal" value="${p.tendered}" placeholder="0.00">
      <div class="chips" style="margin-top:8px"><button class="chip" data-a="exact">Exact</button>${[100, 200, 500, 1000].map(n => `<button class="chip" data-a="quick" data-n="${n}">₱${n}</button>`).join('')}</div>
      <div class="row between"><span>Change</span><b style="color:${change < 0 ? 'var(--bad)' : 'var(--ok)'}" id="chg">${peso(Math.max(0, change))}</b></div>` : ''}
    <p id="err" style="color:var(--bad)"></p><button class="block ok" data-a="confirmpay" ${p.method === 'Cash' && change < 0 ? 'disabled' : ''}>✔ Confirm payment</button>`);
}
function receiptSheet(o) {
  P.lastSale = o;
  openSheet(`<h2 style="margin:0 0 6px;color:var(--ok)">✔ Paid</h2><p class="mute">SI-${String(o.si).padStart(6, '0')} · #${String(o.no).padStart(3, '0')} · ${esc(o.customerName)}</p>
    ${o.items.map(i => `<div class="row between"><span>${esc(i.name)} ×${i.qty}</span><span>${peso(i.price * i.qty)}</span></div>`).join('')}<hr>
    ${o.discountAmt ? `<div class="row between"><span>${esc(o.discountName)}</span><span>−${peso(o.discountAmt)}</span></div>` : ''}<div class="row between"><b>Total</b><b>${peso(o.total)}</b></div>
    ${o.change ? `<div class="row between"><span>Change</span><b style="color:var(--gold);font-size:20px">${peso(o.change)}</b></div>` : ''}<br><div class="row"><button style="flex:1" data-a="printsale">${ic('printer')} Print</button><button class="ghost" style="flex:1" data-a="closesheet">Done</button></div>`);
}

// ---------- printable receipts ----------
const dt = iso => iso ? new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
const R = (l, r, b) => `<div class="r"><span>${esc(l)}</span><span>${b ? '<b>' + esc(r) + '</b>' : esc(r)}</span></div>`;
const head = b => `<h3>${esc((P.shop || 'Brotherhood').toUpperCase())} BARBERSHOP</h3><div class="c">${esc(b.branchName || '')}</div>${b.address ? `<div class="c">${esc(b.address)}</div>` : ''}${b.phone ? `<div class="c">${esc(b.phone)}</div>` : ''}`;
function readingHtml(z) {
  const tender = Object.entries(z.tender || {}), items = Object.entries(z.items || {}), dn = Object.entries(z.denoms || {}).sort((a, b) => b[0] - a[0]);
  return head(z) + `<hr><div class="c"><b>SALES READING · Z-${esc(z.no)}</b></div><div class="c">${esc(z.businessDate || '')}</div><hr>`
    + R('Terminal', z.terminal || '') + R('Shift #', z.shiftNo || '') + R('Cashier', z.cashier || '') + R('Opened', dt(z.openedAt)) + R('Closed', dt(z.closedAt)) + '<hr>'
    + R('Transactions', z.transactions) + R('Gross sales', peso(z.gross)) + R('Discounts', '-' + peso(z.discounts)) + R('NET SALES', peso(z.net), true) + '<hr><b>TENDER</b>'
    + (tender.map(([k, v]) => R(k, peso(v))).join('') || R('—', '')) + '<hr><b>ITEMS SOLD</b>' + (items.map(([k, v]) => R(k + ' x' + v.qty, peso(v.amount))).join('') || R('—', ''))
    + '<hr><b>CASH DRAWER</b>' + R('Opening float', peso(z.openingFloat)) + R('+ Cash sales', peso(z.cashSales)) + R('+ Cash in', peso(z.cashIn)) + R('- Out / expenses', peso(z.cashOut))
    + R('Expected cash', peso(z.expected), true) + R('Declared cash', peso(z.counted)) + R('VARIANCE', peso(z.variance), true)
    + (dn.length ? '<hr><b>DENOMINATIONS</b>' + dn.map(([d, n]) => R('P' + d + ' x ' + n, peso(d * n))).join('') : '')
    + (z.remarks ? `<hr>Remarks: ${esc(z.remarks)}` : '') + `<hr><div class="c">Printed ${esc(dt(new Date().toISOString()))}</div><div class="c">*** END OF SALES READING ***</div>`;
}
function saleHtml(o) {
  const b = P.boot?.branch || {};
  return head({ branchName: b.name, address: b.address, phone: b.phone }) + `<hr><div class="c"><b>SALES INVOICE</b></div><hr>` + R('SI No.', 'SI-' + String(o.si).padStart(6, '0')) + R('Ticket', '#' + String(o.no).padStart(3, '0'))
    + R('Date', dt(o.paidAt)) + R('Customer', o.customerName) + R('Cashier', P.me?.name || '') + '<hr>'
    + o.items.map(i => R(i.name + ' x' + i.qty, peso(i.price * i.qty))).join('') + '<hr>' + R('Subtotal', peso(o.subtotal)) + (o.discountAmt ? R(o.discountName || 'Discount', '-' + peso(o.discountAmt)) : '')
    + R('TOTAL', peso(o.total), true) + o.tenders.map(t => R(t.method, peso(t.amount))).join('') + (o.change ? R('Change', peso(o.change)) : '') + `<hr><div class="c">Thank you! See you again.</div>`;
}
function printHtml(html) { document.getElementById('print').innerHTML = `<div class="paper">${html}</div>`; setTimeout(() => window.print(), 50); }
function showReading(z) {
  P.lastZ = z; openSheet(`<div class="paper">${readingHtml(z)}</div><div class="row" style="margin-top:12px"><button style="flex:1" data-a="printz">${ic('printer')} Print Sales Reading</button><button class="ghost" style="flex:1" data-a="closesheet">Done</button></div>`);
}

// ---------- events ----------
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-a]'); if (!el) return;
  const d = el.dataset, a = d.a;
  if (a === 'pin') { if (P.pin.length < 6) P.pin += d.n; P.err = ''; render(); if (P.pin.length === 6) { const pin = P.pin; P.pin = ''; try { await afterLogin(await api('POST', '/api/login', { pin })); } catch (x) { P.err = x.message; render(); } } return; }
  if (a === 'pinclr') { P.pin = ''; return render(); }
  if (a === 'pinbk') { P.pin = P.pin.slice(0, -1); return render(); }
  if (a === 'closesheet') { closeSheet(); return render(); }
  if (a === 'go') { P.view = d.v; await refresh(); return render(); }
  if (a === 'more') {
    return openSheet(`<div class="drawer"><div class="row between"><div class="row"><img src="/logo.png" width="42" height="42" style="border-radius:12px" alt=""><div><h2 style="margin:0;font-size:20px">BROTHERHOOD</h2><small class="mute">${esc(P.boot?.branch?.name || '')} · ${esc(P.me.name)}</small></div></div><button class="ghost sm" data-a="closesheet">Close</button></div><hr>
      ${[['dashboard', 'grid', 'Dashboard'], ['pos', 'pos', 'Point of Sale'], ['queue', 'users', 'Walk-in Queue'], ['expenses', 'wallet', 'Expenses'], ['appts', 'calendar', 'Appointments'], ['customers', 'star', 'Customer Directory'], ['attendance', 'clock', 'Barber Attendance'], ['reading', 'doc', 'Sales Reading']].filter(([v]) => canOpen(v)).map(([v, i, l]) => `<a href="#" data-a="drawergo" data-v="${v}">${ic(i)}${l}</a>`).join('')}
      <a href="#" data-a="logout" style="color:var(--bad)">${ic('logout')}Logout</a></div>`);
  }
  if (a === 'drawergo') { e.preventDefault(); closeSheet(); P.view = d.v; await refresh(); return render(); }
  if (a === 'logout') { e.preventDefault(); token = ''; try { localStorage.removeItem('bp.pos'); } catch (x) { } P.me = null; P.boot = null; closeSheet(); return render(); }
  if (a === 'apptdate') { P.apptDate = d.d; return render(); }
  if (a === 'arrive') {
    const r = await guard(() => api('POST', `/api/bookings/${d.id}/arrive`)); if (!r) return;
    P.view = 'queue'; await refresh(); render();
    if (r.seated) toast('Seated with ' + (P.boot.staff.find(s => s.id === r.order.barberId)?.name || 'the barber')); else assignSheet(r.order.id);
    return;
  }
  if (a === 'bkcancel' || a === 'bkno') {
    if (!confirm(a === 'bkno' ? 'Mark as no-show?' : 'Cancel this booking?')) return;
    await guard(() => api('PUT', `/api/bookings/${d.id}`, { status: a === 'bkno' ? 'noshow' : 'cancelled' })); return refresh();
  }
  if (a === 'newappt') { P.na = { name: '', phone: '', date: P.apptDate < ymd(0) ? ymd(0) : P.apptDate, items: [], staff: 'any', time: '', slots: null, err: '' }; return apptSheet(); }
  if (a === 'natoggle') { const n = P.na; n.items = n.items.includes(d.id) ? n.items.filter(x => x !== d.id) : [...n.items, d.id]; return naSlots(); }
  if (a === 'natime') { P.na.time = d.t; return apptSheet(); }
  if (a === 'nasave') {
    const n = P.na;
    try {
      const b = await api('POST', '/api/bookings', { branchId: P.boot.branch.id, date: n.date, time: n.time, itemIds: n.items, name: n.name, phone: n.phone, staffId: n.staff });
      P.apptDate = b.date; closeSheet(); toast('Appointment saved'); P.view = 'appts'; await refresh(); render();
    } catch (x) { n.err = x.message; if (/no longer/.test(x.message)) return naSlots(); apptSheet(); }
    return;
  }
  if (a === 'mode') { P.cart.mode = d.m; await refresh(); return render(); }
  if (a === 'gopl') { P.cart.mode = 'later'; P.view = 'pos'; await refresh(); return render(); }
  if (a === 'cat') { P.cat = d.c; return render(); }
  if (a === 'add') return addItem(d.id);
  if (a === 'cart') { P.custHits = []; return cartSheet(); }
  if (a === 'rm') { P.cart.items.splice(+d.n, 1); cartSheet(); return render(); }
  if (a === 'changecust') { P.fromCart = true; P.custHits = []; return customerSheet(null); }
  if (a === 'custdone') {
    const err = document.getElementById('err');
    try { customerPayload(); } catch (x) { if (err) err.textContent = x.message; return; }
    if (P.pendingItem) { pushItem(P.pendingItem); P.pendingItem = null; }
    const back = P.fromCart; P.fromCart = false; closeSheet(); render(); if (back) cartSheet(); return;
  }
  if (a === 'discount') return discountSheet();
  if (a === 'pickdisc') { P.cart.discountId = d.id; return cartSheet(); }
  if (a === 'cartback') return cartSheet();
  if (a === 'clearcart') { if (!confirm('Clear the cart and the customer?')) return; P.cart = freshCart(); closeSheet(); return render(); }
  if (a === 'q') { const it = P.cart.items[+d.n]; it.qty += +d.d; if (it.qty <= 0) P.cart.items.splice(+d.n, 1); cartSheet(); return render(); }
  if (a === 'pickcust') { const h = P.custHits.find(x => x.id === d.id); P.custHits = []; if (h) { const u = cu(); u.name = h.name; u.phone = ''; u.email = ''; u.cut = ''; applyCard({ id: h.id, name: h.name, phone: h.phone, email: h.email, preferredCut: h.preferredCut, consent: h.consent, visits: h.visits, spent: h.spent, lastVisit: h.lastVisit, tier: h.tier, next: null }); } return customerSheet(P.pendingItem); }
  if (a === 'terms') { e.preventDefault(); return termsSheet('termsback'); }
  if (a === 'termsback') return customerSheet(P.pendingItem);
  if (a === 'canceledit') { P.cart = freshCart(); return render(); }
  if (a === 'newticket') { P.cart = freshCart(); P.view = 'pos'; await refresh(); return render(); }
  if (a === 'openshift') return openSheet(`<h2 style="margin-top:0">Open shift</h2><label>Opening float (₱)</label><input id="float" type="number" inputmode="decimal" value="0"><p id="err" style="color:var(--bad)"></p><div class="row"><button data-a="doopen">Open shift</button><button class="ghost" data-a="closesheet">Cancel</button></div>`);
  if (a === 'doopen') { const r = await guard(() => api('POST', '/api/shifts/open', { branchId: P.branch, terminal: 'Terminal 1', openingFloat: +document.getElementById('float').value || 0 })); if (r) { closeSheet(); toast('Shift opened'); await refresh(); } return; }
  if (a === 'chargelater' || a === 'paynow' || a === 'saveticket') {
    const c = P.cart, err = document.getElementById('err');
    try {
      const customer = customerPayload(), items = c.items.map(i => ({ itemId: i.itemId, qty: i.qty })), fresh = freshCart();
      if (a === 'saveticket') {
        await api('PUT', '/api/orders/' + c.editing, { items, customer, discountId: c.discountId || '' }); toast('Ticket saved');
        P.cart = fresh; closeSheet(); P.view = 'pos'; await refresh(); return render();
      }
      const o = await api('POST', '/api/orders', { customer, items, discountId: c.discountId || '' });
      P.cart = fresh; await refresh();
      if (a === 'paynow') return paySheet(o);
      toast('Ticket #' + o.no + ' created'); closeSheet(); P.view = 'pos'; await refresh(); render(); return assignSheet(o.id, c.mode === 'now');
    } catch (x) { if (err) err.textContent = x.message; else toast(x.message, true); }
    return;
  }
  if (a === 'seat') { await refresh(); return assignSheet(d.id); }
  if (a === 'aspick') {
    const as = P.as, r = await guard(() => api('PUT', '/api/orders/' + as.id, { chairId: d.id })); if (!r) return;
    const who = P.boot.staff.find(s => s.id === r.barberId)?.name || 'the barber', cn = chairName(r.chairId);
    closeSheet(); toast(r.queued ? 'Added to queue for ' + cn + ' · ' + who : 'Seated at ' + cn + ' with ' + who);
    await refresh(); render();
    if (as.payAfter) { const o = await guard(() => api('GET', '/api/orders/' + as.id)); if (o) paySheet(o); }
    return;
  }
    if (a === 'checkout') { const o = await guard(() => api('GET', '/api/orders/' + d.id)); if (o) paySheet(o); return; }
  if (a === 'editticket') {
    const o = await guard(() => api('GET', '/api/orders/' + d.id)); if (!o) return;
    P.cart = { items: o.items.map(i => ({ ...i })), cu: { id: o.customerId || '', name: o.customerName, phone: o.cust?.phone || '', email: o.cust?.email || '', cut: o.cust?.preferredCut || '', consent: false, card: o.cust || null }, discountId: o.discountId || '', editing: o.id, mode: 'later' };
    P.view = 'pos'; await refresh(); render(); return cartSheet();
  }
  if (a === 'void') { const reason = prompt('Reason for void?'); if (reason === null) return; const r = await guard(() => api('POST', `/api/orders/${d.id}/void`, { reason })); if (r) toast('Ticket voided'); return refresh(); }
  if (a === 'paydisc') return;
  if (a === 'paym') { P.pay.method = d.m; return renderPay(P.pay); }
  if (a === 'exact') { P.pay.tendered = String(payTotals(P.pay).total); return renderPay(P.pay); }
  if (a === 'quick') { P.pay.tendered = d.n; return renderPay(P.pay); }
  if (a === 'confirmpay') {
    const p = P.pay, t = payTotals(p), amount = p.method === 'Cash' ? +p.tendered : t.total;
    const o = await (async () => { try { return await api('POST', `/api/orders/${p.order.id}/pay`, { discountId: p.disc, tenders: [{ method: p.method, amount }] }); } catch (x) { const er = document.getElementById('err'); if (er) er.textContent = x.message; return null; } })();
    if (o) { receiptSheet(o); P.view = P.view === 'pos' ? 'queue' : P.view; await refresh(); }
    return;
  }
  if (a === 'addexp') return openSheet(`<h2 style="margin-top:0">Add expense</h2><label>Amount (₱)</label><input id="xamt" type="number" inputmode="decimal"><label>Description</label><input id="xnote" placeholder="e.g. Staff meal, supplies">
    <label>Barber (optional)</label><select id="xstaff"><option value="">—</option>${P.boot.staff.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select><p id="err" style="color:var(--bad)"></p><div class="row"><button data-a="doexp">Save expense</button><button class="ghost" data-a="closesheet">Cancel</button></div>`);
  if (a === 'doexp') {
    if (!P.shift) return (document.getElementById('err').textContent = 'Open a shift first (Point of Sale).');
    const r = await (async () => { try { return await api('POST', '/api/cash', { shiftId: P.shift.id, kind: 'expense', amount: +document.getElementById('xamt').value, note: document.getElementById('xnote').value, staffId: document.getElementById('xstaff').value }); } catch (x) { document.getElementById('err').textContent = x.message; return null; } })();
    if (r) { closeSheet(); toast('Expense saved'); await refresh(); } return;
  }
  if (a === 'att') { const r = await guard(() => api('POST', '/api/attendance', { staffId: d.id, action: d.x })); if (r) toast('Saved'); return refresh(); }
  if (a === 'printz') return printHtml(readingHtml(P.lastZ));
  if (a === 'printsale') return printHtml(saleHtml(P.lastSale));
  if (a === 'viewz') { const z = P.zs[+d.i]; return showReading({ no: z.no, businessDate: z.businessDate, ...z.data }); }
  if (a === 'tab') { P.tab = d.t; return render(); }
  if (a === 'den') { P.denoms[d.d] = Math.max(0, (P.denoms[d.d] || 0) + +d.n); return render(); }
  if (a === 'cashmove') return openSheet(`<h2 style="margin-top:0">Cash ${d.k === 'in' ? 'in' : 'out'}</h2><label>Amount (₱)</label><input id="camt" type="number" inputmode="decimal"><label>Note</label><input id="cnote"><p id="err" style="color:var(--bad)"></p><div class="row"><button data-a="docash" data-k="${d.k}">Save</button><button class="ghost" data-a="closesheet">Cancel</button></div>`);
  if (a === 'docash') { const r = await (async () => { try { return await api('POST', '/api/cash', { shiftId: P.cur.shift.id, kind: d.k, amount: +document.getElementById('camt').value, note: document.getElementById('cnote').value }); } catch (x) { document.getElementById('err').textContent = x.message; return null; } })(); if (r) { closeSheet(); toast('Saved'); await refresh(); } return; }
  if (a === 'closeshift') {
    const counted = DENOMS.reduce((t, x) => t + x * (P.denoms[x] || 0), 0);
    if (!confirm(`Close Shift #${P.cur.shift.no}? Declared cash: ${peso(counted)}`)) return;
    const z = await guard(() => api('POST', `/api/shifts/${P.cur.shift.id}/close`, { denoms: P.denoms, remarks: document.getElementById('remarks')?.value || '' }));
    if (z) { P.denoms = {}; P.remarks = ''; P.tab = 'z'; showReading({ businessDate: P.cur.shift.businessDate, ...z }); await refresh(); }
    return;
  }
});
document.addEventListener('change', async e => {
  const t = e.target, a = t.dataset.a;
  if (t.dataset.na === 'staff' || t.dataset.na === 'date') { P.na[t.dataset.na] = t.value; return naSlots(); }
  if (a === 'branchsel') { P.branch = t.value; P.cart.items = []; return refresh(); }
  if (a === 'qstatus') { P.qf.status = t.value; return refresh(); }
  if (a === 'qbarber') { P.qf.barber = t.value; return render(); }
  if (a === 'exprange') { P.expRange = t.value; return refresh(); }
  if (a === 'paydisc') { P.pay.disc = t.value; return renderPay(P.pay); }
  if (a === 'custtier') { P.cust.tier = t.value; refresh().then(render); return; }
  if (t.id === 'cartbarber') P.cart.barberId = t.value;
  if (t.id === 'cu-consent') cu().consent = t.checked;
  if (t.dataset.den) { P.denoms[t.dataset.den] = Math.max(0, Math.floor(+t.value || 0)); return render(); }
});
let timer, nameTimer, lookupTimer;
document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.na === 'name' || t.dataset.na === 'phone') { P.na[t.dataset.na] = t.value; const n = P.na, b = document.getElementById('nasave'); if (b) b.disabled = !(n.time && n.name.trim() && n.phone.replace(/\D/g, '').length >= 10); return; }
  if (t.id === 'tendered') { P.pay.tendered = t.value; const tt = payTotals(P.pay), ch = (+t.value || 0) - tt.total; const c = document.getElementById('chg'); c.textContent = peso(Math.max(0, ch)); c.style.color = ch < 0 ? 'var(--bad)' : 'var(--ok)'; document.querySelector('[data-a=confirmpay]').disabled = ch < 0; }
  if (['cu-name', 'cu-phone', 'cu-email', 'cu-cut'].includes(t.id)) {
    const u = cu(), key = { 'cu-name': 'name', 'cu-phone': 'phone', 'cu-email': 'email', 'cu-cut': 'cut' }[t.id]; u[key] = t.value;
    if (t.id === 'cu-name') {
      if (u.card && t.value.trim() !== u.card.name) { u.card = null; u.id = ''; const b = document.getElementById('cu-card'); if (b) b.innerHTML = custCardHtml(); }
      clearTimeout(nameTimer); nameTimer = setTimeout(async () => {
        if (t.value.trim().length < 2 || u.card) P.custHits = []; else { try { P.custHits = (await api('GET', '/api/customers?q=' + encodeURIComponent(t.value.trim()) + '&size=5')).rows; } catch (x) { } }
        const box = document.getElementById('custhits'); if (box) box.innerHTML = P.custHits.map(h => `<div class="card" style="padding:10px;margin:6px 0" data-a="pickcust" data-id="${h.id}"><div class="row between" style="flex-wrap:nowrap"><b>${esc(h.name)}</b><span class="${tierCls(h.tier)}">${h.tier}</span></div><small class="mute">${esc(h.phone || h.email || '')} · ${h.visits} visits</small></div>`).join('');
      }, 250);
    } else if (t.id !== 'cu-cut') { clearTimeout(lookupTimer); lookupTimer = setTimeout(lookupCustomer, 400); }
    return;
  }  if (t.id === 'expq') { P.expQ = t.value; clearTimeout(timer); timer = setTimeout(async () => { await refresh(); const i = document.getElementById('expq'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 300); }
  if (t.id === 'remarks') P.remarks = t.value;
  if (t.id === 'custq') { P.cust.q = t.value; clearTimeout(timer); timer = setTimeout(async () => { await refresh(); const i = document.getElementById('custq'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 300); }
});
sheet.addEventListener('close', () => render());

(async () => {
  if (token) { try { const st = await api('GET', '/api/state'); P.me = st.me; P.shop = st.shop; P.branches = st.branches || []; P.mods = st.modules || Object.values(VMAP); if (isAdminRole()) P.branch = P.branches[0]?.id || ''; await refresh(); } catch (e) { token = ''; P.me = null; } }
  render();
  setInterval(() => { if (P.me && !sheet.open && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) refresh(); }, 10000);
})();


