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
  cart: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/>', tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1"/>', chair: '<path d="M6 12V6a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v6"/><path d="M4 12h16v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M12 17v4M8 21h8"/>', star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.3-6.2 3.3L7 14.2 2 9.3l6.9-1z"/>', lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'
};
const ic = (n, c = '') => `<svg class="i ${c}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]}</svg>`;
const t12 = t => { const [h, m] = String(t).split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; };
const ymd = (n = 0) => { const d = new Date(Date.now() + n * 864e5); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const av = (name, photo, cls = '') => photo ? `<img class="av ${cls}" src="${esc(photo)}" alt="${esc(name)}" loading="lazy">` : `<span class="av ${cls}">${esc(initials(name))}</span>`;
function beep() { try { const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain(); o.frequency.value = 880; g.gain.value = 0.08; o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + 0.18); } catch (e) { } }
const isWide = () => window.matchMedia('(min-width: 900px)').matches;
// no double-tap / pinch zoom inside the app (it should behave like an app, not a web page)
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('dblclick', e => { if (!/INPUT|TEXTAREA/.test(e.target.tagName)) e.preventDefault(); });
// only touch the page when the screen really changed (keeps it fast and stops flicker/scroll jumps)
const setApp = html => { if (html === app._html) return; app._html = html; app.innerHTML = html; };
const initials = s => String(s || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const openSheet = h => { sheet.innerHTML = h; if (!sheet.open) sheet.showModal(); };
const closeSheet = () => { if (sheet.open) sheet.close(); };
function toast(msg, err) { const t = document.createElement('div'); t.className = 'toast' + (err ? ' err' : ''); t.textContent = msg; document.body.append(t); setTimeout(() => t.remove(), 2600); }

let token = ''; try { token = localStorage.getItem('bp.pos') || ''; } catch (e) { }
const P = { apptDate: ymd(0), bk: [], na: null, me: null, branch: '', branches: [], boot: null, dash: null, queue: [], att: [], exp: null, shift: null, z: [], zs: [], view: 'dashboard', pin: '', err: '',
  cart: { items: [], barberId: '', mode: 'later', editing: null }, q: [], sf: null, offline: false, cust: { q: '', tier: '', rows: [], total: 0 }, rm: { date: '', calc: null, list: [], proofId: '', preview: '', actual: '', resp: '', notes: '', busy: false }, cat: 'all', qf: { status: 'active', barber: '' }, expRange: 'today', expQ: '', tab: 'close', denoms: {}, remarks: '', custHits: [] };
const DENOMS = [1000, 500, 200, 100, 50, 20, 10, 5, 1, 0.25];
// which sections this login may open (the owner sets this in Settings → Access)
const VMAP = { dashboard: 'dashboard', pos: 'pos', appts: 'bookings', queue: 'queue', expenses: 'expenses', attendance: 'attendance', reading: 'reading', customers: 'customers', remit: 'remittance', release: 'release', problems: 'problems', inbox: 'inbox', checklist: 'checklist', leave: 'leave', myperf: 'myperf' };
const freshCart = () => ({ items: [], editing: null, mode: (typeof P !== 'undefined' && P.cart && P.cart.mode) || 'later' });
const isAdminRole = () => P.me && ['owner', 'admin'].includes(P.me.role);
const canOpen = v => (P.mods || []).includes(VMAP[v]);
const firstView = () => Object.keys(VMAP).find(canOpen) || '';
const br = () => isAdminRole() ? `branch=${P.branch}` : '';
const withBr = u => { const b = br(); return b ? u + (u.includes('?') ? '&' : '?') + b : u; };

// small "working" pill so a slow photo never looks like a frozen app
let busyN = 0;
function busy(on, msg) {
  busyN = Math.max(0, busyN + (on ? 1 : -1));
  let el = document.getElementById('busybar'); if (!el) { el = document.createElement('div'); el.id = 'busybar'; document.body.appendChild(el); }
  if (busyN) { el.textContent = msg || 'Working…'; el.className = 'on'; } else el.className = '';
}
async function api(method, url, body) {
  const up = method === 'POST' && /^\/api\/(files|pos\/idphoto)/.test(url); if (up) busy(true, 'Uploading photo…');
  let r; try { r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined }); } finally { if (up) busy(false); }
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && url !== '/api/login') { token = ''; P.me = null; render(); throw new Error('Login required'); }
  if (!r.ok) throw new Error(j.error || 'Request failed');
  return j;
}
const guard = async fn => { try { return await fn(); } catch (e) { toast(e.message, true); return null; } };

// ---------- data ----------
const TIER_STEPS = [[5, 'Bronze'], [16, 'Silver'], [26, 'Gold'], [51, 'VIP']];
const nextTierOf = v => { const n = TIER_STEPS.find(([m]) => v < m); return n ? { name: n[1], need: n[0] - v } : null; };
async function loadRemit() {
  const m = P.rm; if (!m.date) m.date = ymd(0);
  const br = P.boot?.branch?.id || P.branch || '', q = br ? '&branch=' + br : '';
  [m.calc, m.list] = await Promise.all([api('GET', '/api/remittances/preview?date=' + m.date + q), api('GET', '/api/remittances?from=' + ymd(-30) + '&to=' + ymd(0) + q).then(r => r.rows)]);
}
async function loadCustomers() {
  const c = P.cust, br = P.boot?.branch?.id || P.branch || '';
  const r = await api('GET', '/api/customers?size=40&q=' + encodeURIComponent(c.q) + (c.tier ? '&tier=' + c.tier : '') + (br ? '&branch=' + br : ''));
  c.rows = r.rows; c.total = r.total;
}
// ---------- offline-first attendance: selfie, encrypted local queue, automatic sync ----------
const isNet = e => e instanceof TypeError || /Failed to fetch|NetworkError|Load failed|network/i.test(String(e && e.message));
const OFF = {
  _db: null,
  db() { return this._db ||= new Promise((ok, no) => { const r = indexedDB.open('bp-offline', 1); r.onupgradeneeded = () => { r.result.createObjectStore('keys'); r.result.createObjectStore('queue', { keyPath: 'id' }); }; r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); }); },
  async tx(store, mode, fn) { const db = await this.db(); return new Promise((ok, no) => { const t = db.transaction(store, mode), req = fn(t.objectStore(store)); t.oncomplete = () => ok(req && req.result); t.onerror = () => no(t.error); }); },
  async key() { let k = await this.tx('keys', 'readonly', s => s.get('k')); if (!k) { k = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']); await this.tx('keys', 'readwrite', s => s.put(k, 'k')); } return k; },   // non-extractable key kept in the browser
  async enc(text) { const k = await this.key(), iv = crypto.getRandomValues(new Uint8Array(12)), c = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode(text))), out = new Uint8Array(12 + c.length); out.set(iv); out.set(c, 12); return out; },
  async dec(buf) { const b = new Uint8Array(buf), k = await this.key(); return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.slice(0, 12) }, k, b.slice(12))); },
  all() { return this.tx('queue', 'readonly', s => s.getAll()).then(r => r || []); },
  put(item) { return this.tx('queue', 'readwrite', s => s.put(item)); },
  del(id) { return this.tx('queue', 'readwrite', s => s.delete(id)); }
};
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2));
let syncing = false;
async function syncQueue() {
  if (syncing || !P.me || !P.boot) return; syncing = true;
  try {
    for (const it of (await OFF.all()).sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      if (it.status === 'CONFLICT' && !it.retry) continue;
      try {
        let photoId = it.photoId || '';
        if (!photoId && it.photo) { const f = await api('POST', '/api/files', { data: await OFF.dec(it.photo), kind: 'attendance', branchId: it.branchId }); photoId = f.id; it.photoId = photoId; await OFF.put(it); }
        await api('POST', '/api/attendance', { staffId: it.staffId, action: it.action, photoId, clientId: it.id, deviceAt: it.deviceAt, geo: it.geo });
        await OFF.del(it.id);
      } catch (e) {
        if (isNet(e) || /Login required/.test(e.message)) { it.tries = (it.tries || 0) + 1; it.status = 'PENDING SYNC'; await OFF.put(it); break; }   // still offline: keep it and try again later
        it.status = 'CONFLICT'; it.error = e.message; it.retry = false; it.tries = (it.tries || 0) + 1; await OFF.put(it);   // kept for the manager. Never deleted silently
      }
    }
  } catch (e) { } finally { syncing = false; P.q = await OFF.all().catch(() => []); if (!sheet.open && P.me) { try { await refresh(); } catch (e) { } } }
}
function cacheSave() { try { localStorage.setItem('bp.cache', JSON.stringify({ me: P.me, shop: P.shop, branches: P.branches, mods: P.mods, boot: P.boot, att: P.att, branch: P.branch })); } catch (e) { } }
function selfieSheet() {
  const sf = P.sf, st = P.boot.staff.find(s => s.id === sf.staffId), need = P.boot.settings?.attPhoto !== false, word = sf.action === 'in' ? 'Time in' : 'Time out';
  openSheet(`<div class="row between"><h2 style="margin:0">${word} · ${esc(st?.name || '')}</h2><button class="ghost sm" data-a="sfcancel">Cancel</button></div>
    <p class="mute" style="margin:8px 0 0">${need ? 'Take a selfie to confirm it is really you. ' : ''}${navigator.onLine === false ? '<b>No internet.</b> This will be saved on this device and uploaded automatically.' : 'The time is recorded now.'}</p>
    <button type="button" class="ghost block" data-a="sfpick" style="margin-top:10px">🤳 ${sf.data ? 'Retake selfie' : 'Take selfie'}</button><input type="file" id="sffile" accept="image/*" capture="user" hidden>
    ${sf.data ? `<img class="idprev" src="${sf.data}" alt="Selfie">` : ''}
    ${P.boot.settings?.attGeo ? `<p class="mute" style="font-size:12.5px;margin:8px 0 0">📍 ${sf.geo ? 'Location captured' : 'Getting location… (optional)'}</p>` : ''}
    <p id="err" style="color:var(--bad);margin:8px 0 0"></p>
    <button class="block" data-a="sfgo" ${(need && !sf.data) || sf.busy ? 'disabled' : ''}>${sf.busy ? 'Saving…' : 'Confirm ' + word.toLowerCase()}</button>`);
}
async function sfSubmit() {
  const sf = P.sf, st = P.boot.staff.find(s => s.id === sf.staffId); sf.busy = true; selfieSheet();
  const item = { id: uuid(), staffId: sf.staffId, staffName: st?.name || '', branchId: P.boot.branch.id, action: sf.action, deviceAt: new Date().toISOString(), geo: sf.geo || null, createdAt: new Date().toISOString(), status: 'PENDING SYNC', tries: 0, photo: sf.data ? await OFF.enc(sf.data) : null };
  if (navigator.onLine !== false) {
    try {
      const photoId = sf.data ? (await api('POST', '/api/files', { data: sf.data, kind: 'attendance', branchId: item.branchId })).id : '';
      await api('POST', '/api/attendance', { staffId: item.staffId, action: item.action, photoId, clientId: item.id, deviceAt: item.deviceAt, geo: item.geo });
      P.sf = null; closeSheet(); toast(sf.action === 'in' ? 'Timed in' : 'Timed out'); return refresh();
    } catch (e) { if (!isNet(e)) { sf.busy = false; selfieSheet(); const er = document.getElementById('err'); if (er) er.textContent = e.message; return; } }
  }
  await OFF.put(item); P.q = await OFF.all(); P.sf = null; closeSheet(); toast('Saved on this device. It will upload when the internet is back.'); render();
}
async function loadMp() {
  const m = P.mp ||= { range: 'today', perf: null, slips: [], err: '' }, s = m.range === 'today' ? [ymd(0), ymd(0)] : m.range === 'week' ? (() => { const d = new Date(); const back = (d.getDay() + 6) % 7; return [ymd(-back), ymd(6 - back)]; })() : [ymd(0).slice(0, 8) + '01', ymd(0)];
  try { [m.perf, m.slips] = await Promise.all([api('GET', '/api/me/performance?from=' + s[0] + '&to=' + s[1]), api('GET', '/api/me/payslips').then(r => r.rows)]); m.err = ''; } catch (e) { if (isNet(e)) throw e; m.err = e.message; }
}
function slipSheet(x) {
  const row = (l, v, b) => '<div class="row between" style="padding:5px 0;border-bottom:1px solid var(--line)"><span' + (b ? ' style="font-weight:700"' : '') + '>' + l + '</span><span' + (b ? ' style="font-weight:700"' : '') + '>' + v + '</span></div>';
  const html = row('Pay period', esc(x.period)) + '<p style="margin:10px 0 4px"><b>Earnings</b></p>' + x.dayItems.map(d => row('Commission · ' + esc(d.date), peso(d.commission))).join('') + (x.topup ? row('Daily allowance top-up', peso(x.topup)) : '') + (x.lunch ? row('Free lunch allowance', peso(x.lunch)) : '') + x.earningItems.map(e => row(esc(e.kind) + ': ' + esc(e.note), peso(e.amount))).join('') + row('Gross earnings', peso(x.gross), 1)
    + '<p style="margin:10px 0 4px"><b>Deductions</b></p>' + x.advanceItems.concat(x.deductionItems).map(a => row(esc(a.label), '−' + peso(a.amount))).join('') + (!x.advanceItems.length && !x.deductionItems.length ? row('None', peso(0)) : '') + row('Total deductions', '−' + peso(x.totalDeductions), 1) + '<div class="paybox"><small>Net salary</small><div class="num">' + peso(x.net) + '</div></div>';
  openSheet('<div class="row between"><h2 style="margin:0">Payslip · ' + esc(x.staffName) + '</h2><button class="ghost sm" data-a="closesheet">Close</button></div>' + html + '<button class="block" data-a="slipprint" data-i="' + P.mp.slips.indexOf(x) + '" style="margin-top:10px">🖨 Print</button>');
}
async function loadChk() {
  const r = await api('GET', withBr('/api/checklists/today')), keep = P.ck;
  P.ck = { template: r.template, runs: r.runs, kind: keep ? keep.kind : 'opening', items: keep && keep.items ? keep.items : [] };
}
// refresh(quiet): the 10-second background poll passes quiet=true and does nothing visible when the data has not changed (no re-render, no cache write)
async function refresh(quiet) {
  if (!P.me) return;
  if (!canOpen(P.view)) P.view = firstView() || P.view;
  try {
    const jobs = [api('GET', withBr('/api/pos/bootstrap')).then(b => { P.boot = b; P.shift = b.shift; })];
    // barbers only need bookings on the screens that show them; cashiers keep the live new-booking alert
    if (canOpen('appts') && (P.me.role !== 'barber' || ['appts', 'dashboard'].includes(P.view))) jobs.push(api('GET', withBr(`/api/bookings?from=${ymd(0)}&to=${ymd(14)}`)).then(r => { P.bk = r; notifyBookings(); })); else if (!canOpen('appts')) P.bk = [];
    if (P.view === 'dashboard') {
      jobs.push(api('GET', withBr('/api/pos/dashboard')).then(r => { P.dash = r; }));
      if (P.me.role === 'barber') jobs.push(api('GET', '/api/me/earnings').then(r => { P.earn = r; P.earnErr = ''; }, e => { if (isNet(e)) throw e; P.earn = null; P.earnErr = e.message; }));
    }
    if (P.view === 'pos') jobs.push(api('GET', withBr('/api/pos/queue?filter=active')).then(r => { P.queue = r; }));
    if (P.view === 'customers') jobs.push(loadCustomers());
    if (P.view === 'remit') jobs.push(loadRemit());
    if (P.view === 'checklist') jobs.push(loadChk());
    if (P.view === 'myperf') jobs.push(loadMp());
    if (P.view === 'leave') jobs.push(api('GET', withBr('/api/leaves')).then(r => { P.lv = r; }));
    if (P.view === 'problems') jobs.push(api('GET', withBr('/api/problems')).then(r => { P.pr = r; }));
    if (canOpen('inbox') && window.Inbox) { Inbox.setOpt({ token: () => token, isAdmin: isAdminRole(), meId: P.me.id }); jobs.push(Inbox.refreshUnread().then(n => { P.inUnread = n; }, () => { })); }
    if (P.view === 'release') jobs.push(api('GET', withBr('/api/advances')).then(async r => { P.adv = r; if (P.advBal) P.advBal = await api('GET', '/api/advances/balance?staffId=' + P.advBal.staffId); }));
    if (P.view === 'queue') jobs.push(api('GET', withBr('/api/pos/queue?filter=' + (P.qf.status === 'done' ? 'done' : P.qf.status === 'all' ? 'all' : 'active'))).then(r => { P.queue = r; }));
    if (P.view === 'attendance') jobs.push(api('GET', withBr('/api/pos/attendance')).then(r => { P.att = r; }));
    if (P.view === 'expenses') jobs.push(api('GET', withBr(`/api/expense-claims?range=${P.expRange}&q=${encodeURIComponent(P.expQ)}`)).then(r => { P.exp = r; }));
    if (P.view === 'reading') jobs.push(Promise.all([api('GET', withBr('/api/pos/shift')), api('GET', withBr('/api/pos/zreadings'))]).then(([s, z]) => { P.cur = s; P.zs = z; }));
    await Promise.all(jobs);
    P.offline = false;
    if (quiet) { const sig = JSON.stringify([P.view, P.boot, P.bk, P.dash, P.queue, P.att, P.exp, P.adv, P.advBal, P.pr, P.lv, P.cust, P.rm, P.chk, P.mp, P.cur, P.zs, P.inUnread, P.earn, P.offline]); if (sig === P._sig) return; P._sig = sig; }
    cacheSave();
  } catch (e) { if (isNet(e)) P.offline = true; else if (P.me) toast(e.message, true); }
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
const TITLES = { dashboard: 'Executive Dashboard', pos: 'Point of Sale', queue: 'Walk-in Queue', expenses: 'Shop Expenses', attendance: 'Barber Attendance', reading: 'Sales Reading', appts: 'Appointments', customers: 'Customer Directory', remit: 'Daily Sales Remittance', release: 'Release Pay', problems: 'Report a Problem', inbox: 'Inbox', checklist: 'Daily Checklist', leave: 'Leave Requests', myperf: 'My Performance' };
// a screen whose data has not arrived yet shows "Loading…" instead of breaking
const safeView = () => { try { return VIEWS[P.view](); } catch (e) { return '<p class="mute">Loading…</p>'; } };
function render() {
  if (!P.me) {
    app._html = ""; app.innerHTML = `<main class="login"><img class="logo" src="/logo.png" alt=""><h1>Brotherhood</h1><p class="mute">Barbershop POS</p>
      <div class="dots">${[0, 1, 2, 3, 4, 5].map(i => `<i class="${i < P.pin.length ? 'on' : ''}"></i>`).join('')}</div><p style="color:var(--bad);min-height:22px;font-size:13px">${esc(P.err) || 'Enter your 6-digit PIN'}</p>
      <div class="pin">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-a="pin" data-n="${n}">${n}</button>`).join('')}<button data-a="pinclr" class="ghost">CLR</button><button data-a="pin" data-n="0">0</button><button data-a="pinbk" class="ghost">⌫</button></div></main>`;    return;
  }
  const b = P.boot; app.classList.toggle('in', !!P.me);
  if (!canOpen(P.view)) P.view = firstView();
  if (!P.view) { app._html = ""; app.innerHTML = `<main class="login"><h1>No access</h1><p class="mute">Your login has no sections turned on. Ask the owner to enable them in Settings → Access.</p><button data-a="logout">Logout</button></main>`; return; }
  const FULLNAV = [['dashboard', 'grid', 'Dashboard'], ['pos', 'pos', 'POS'], ['appts', 'calendar', 'Bookings'], ['queue', 'users', 'Queue'], ['customers', 'star', 'Customers'], ['expenses', 'wallet', 'Expenses'], ['attendance', 'clock', 'Attendance'], ['reading', 'doc', 'Sales Reading'], ['remit', 'wallet', 'Remittance'], ['release', 'tag', 'Release Pay'], ['problems', 'tag', 'Problems'], ['inbox', 'users', 'Inbox'], ['checklist', 'doc', 'Checklist'], ['leave', 'calendar', 'Leave'], ['myperf', 'star', 'My Performance']];
  const nav = (isWide() ? FULLNAV : FULLNAV.slice(0, 4)).filter(([k]) => canOpen(k));
  const s = P.shift, enter = P.view !== P._rv ? 'enter' : ''; P._rv = P.view;
  setApp(`<header><button class="burger" data-a="more">${ic('menu')}</button>${P.me.role === 'barber' ? `<span class="hav" data-a="go" data-v="dashboard">${av(P.me.name, P.me.photo)}</span>` : ''}<div class="ttl"><h1>${TITLES[P.view]}</h1><small>${esc(b?.branch?.name || '')} · ${esc(P.me.name)}</small></div>${P.inUnread && P.view !== 'inbox' ? `<span class="shiftchip" style="color:#e5384a" data-a="go" data-v="inbox">✉ ${P.inUnread}</span>` : ''}${P.offline || navigator.onLine === false ? '<span class="shiftchip" style="color:var(--bad)">Offline</span>' : ''}${P.q && P.q.length ? `<span class="shiftchip" style="color:#b26a00" data-a="go" data-v="attendance">⟳ ${P.q.length} pending sync</span>` : ''}<span class="shiftchip ${s ? 'on' : ''}">${s ? '● Shift #' + s.no : '○ No shift'}</span></header>
    <main class="${enter}">${isAdminRole() ? `<select data-a="branchsel" style="margin-bottom:12px">${P.branches.map(x => `<option value="${x.id}" ${x.id === P.branch ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>` : ''}${b ? safeView() : '<p class="mute">Loading…</p>'}</main>
    ${P.view === 'pos' && P.cart.mode !== 'now' && !isWide() && P.cart.items.length ? `<div class="cartbar"><button class="block" data-a="cart">${ic('cart')} ${P.cart.items.reduce((s, i) => s + i.qty, 0)} item(s) · ${peso(cartTotal())} — View cart</button></div>` : ''}
    <nav class="bottom">${isWide() ? `<p class="rbrand"><img src="/logo.png" alt=""><span><b>BROTHERHOOD</b><small>${esc(b?.branch?.name || '')}</small></span></p>` : ''}<div>${nav.map(([k, icn, l]) => `<button class="${P.view === k ? 'on' : ''}" data-a="go" data-v="${k}">${ic(icn)}${l}</button>`).join('')}${isWide() ? `<button class="ghost railout" data-a="logout">${ic('menu', 'sm')} Logout (${esc(P.me.name)})</button>` : ''}</div></nav>`);
}
const _render = render;
render = function () { _render(); const h = document.getElementById('inbox-host'); if (h && window.Inbox && P.me) Inbox.mount(h, { token: () => token, isAdmin: isAdminRole(), meId: P.me.id }); };
const staffById = id => P.boot?.staff.find(s => s.id === id);
const cuttingIds = () => new Set((P.boot?.queue || []).filter(o => o.status === 'in_chair').map(o => o.barberId));
const stateLabel = { present: 'Present', late: 'Late', break: 'On break', off: 'Off duty', out: 'Timed out', none: 'Not timed in' };

// ---------- views ----------
// A barber's own earnings (only ever their own account: the server picks the profile from the login)
function earningsCard() {
  if (!P.me || P.me.role !== 'barber') return '';
  if (!P.earn) return P.earnErr ? `<div class="card"><b>My earnings</b><p class="mute" style="margin:6px 0 0">${esc(P.earnErr)}</p></div>` : '';
  const e = P.earn, t = e.today, u = e.unpaid, row = (l, v, c) => `<div class="row between" style="padding:5px 0;border-bottom:1px solid var(--line)"><span>${l}</span><b style="${c ? 'color:' + c : ''}">${v}</b></div>`;
  return `<div class="card" style="margin-bottom:14px"><div class="profile">${av(e.name, e.photo, 'xl')}<div><h2>${esc(e.name)}</h2><small class="mute">Barber · ${esc(e.branchName)}</small></div><button class="ghost sm" data-a="go" data-v="myperf" style="margin-left:auto">Payslips</button></div><b>My earnings</b>
    <div class="paybox" style="margin:10px 0"><small>Earned today${t.present ? '' : ' (not timed in yet)'}</small><div class="num">${peso(t.pay)}</div><small>${t.cuts} haircut${t.cuts === 1 ? '' : 's'} · commission ${peso(t.commission)}${t.topup ? ' + allowance top-up ' + peso(t.topup) : ''}${t.lunch ? ' + free lunch ' + peso(t.lunch) : ''}</small>${t.present ? (t.allowLost ? '<small style="color:var(--bad);display:block;margin-top:4px">You came ' + t.lateMins + ' min late: no daily allowance and no free lunch today.</small>' : t.lunchLost ? '<small style="color:var(--bad);display:block;margin-top:4px">You came ' + t.lateMins + ' min late: no free lunch today (' + peso(e.rules.lunchAmount) + ').</small>' : '') : ''}</div>
    <p style="margin:10px 0 4px"><b>Not yet paid${u.since ? ' · since ' + esc(u.since) : ''}</b></p>
    ${row('Commission (' + u.days + ' day' + (u.days === 1 ? '' : 's') + ')', peso(u.commission))}${u.topup ? row('Allowance top-up', peso(u.topup)) : ''}${u.lunch ? row('Free lunch allowance', peso(u.lunch)) : ''}${u.bonus ? row('Bonus / incentive', peso(u.bonus)) : ''}${u.advance ? row('Cash advance taken', '−' + peso(u.advance), 'var(--bad)') : ''}${u.deductions ? row('Scheduled deductions', '−' + peso(u.deductions), 'var(--bad)') : ''}
    <div class="row between" style="padding-top:8px"><b>Estimated take-home</b><b style="font-size:20px">${peso(u.net)}</b></div><small class="mute">An estimate until the owner pays it. The final amount is on your payslip.</small></div>`;
}
const VIEWS = {
  dashboard() {
    const d = P.dash; if (!d) return '<p class="mute">Loading…</p>';
    return `${earningsCard()}<div class="card hero"><small>${P.me.role === 'barber' ? 'My sales today' : "Today's gross sales"}</small><div class="num">${peso(d.gross)}</div><span class="mute">${d.completed} completed order${d.completed === 1 ? '' : 's'} · net ${peso(d.net)}</span></div>
    <div class="kpis">${canOpen('queue') ? `<div class="card kpi b"><div class="ic">${ic('hourglass')}</div><small>Waiting in queue</small><div class="num">${d.waiting}</div><small>${d.cutting} in chair</small></div>` : ''}
      ${P.me.role === 'barber' ? '' : `<div class="card kpi g"><div class="ic">${ic('scissors')}</div><small>Barbers on duty</small><div class="num">${d.onDuty}<span class="mute" style="font-size:18px"> / ${d.totalBarbers}</span></div><small>available for walk-ins</small></div>`}</div>
    ${bookingsCard()}
    ${canOpen('queue') ? `<div class="sect"><h3>Live walk-in floor</h3><span class="mute">${d.queue.length} active</span></div>${d.queue.map(o => ticketHtml(o)).join('') || '<div class="card" style="text-align:center"><p class="mute" style="margin:6px 0">No customers on the floor right now.</p></div>'}` : ''}`;
  },  pos() {
    const b = P.boot, s = P.shift, cats = b.categories, items = b.items.filter(i => P.cat === 'all' || i.categoryId === P.cat), later = P.cart.mode !== 'now';
    const top = `<div class="posh">Fast checkout, discount vouchers, and cash change calculator.</div>
    ${s ? `<div class="shiftbn">✓ Shift #${s.no} Active (Float: ${peso(s.openingFloat || 0)})</div>` : P.boot.locked ? `<div class="card" style="border-color:#f2b8bf;background:#fff4f5"><b style="color:var(--bad)">🔒 Today is locked</b><p class="mute" style="margin:4px 0 0">The sales reading (Z-${P.boot.zNo}) is done. No more sales today. Open a new shift tomorrow.</p></div>` : `<div class="card" style="border-color:#f2b8bf;background:#fff4f5"><b style="color:var(--bad)">No open shift</b><p class="mute" style="margin:4px 0 12px">Open a shift first so you can take payments.</p><button class="sm" data-a="openshift">${ic('lock', 'sm')} Open shift</button></div>`}
    <div class="seg"><button class="${later ? 'on' : ''}" data-a="mode" data-m="later">${ic('cart', 'sm')} Pay As You Order</button><button class="${!later ? 'on' : ''}" data-a="mode" data-m="now">${ic('hourglass', 'sm')} Pay Later</button></div>`;
    if (!later) return top + sessionsBoard();
    const menu = `<div class="chips"><button class="chip ${P.cat === 'all' ? 'on' : ''}" data-a="cat" data-c="all">All</button>${cats.map(c => `<button class="chip ${P.cat === c.id ? 'on' : ''}" data-a="cat" data-c="${c.id}">${esc(c.name)}</button>`).join('')}</div>
    <div class="grid">${items.map(i => `<button class="item ${i.type} ${i.photo ? 'hasphoto' : ''}" data-a="add" data-id="${i.id}">${i.photo ? `<img class="pic" src="${esc(i.photo)}" alt="" loading="lazy">` : `<span class="mono">${ic(i.type === 'service' ? 'scissors' : 'bottle')}</span>`}<span class="body"><span class="nm">${esc(i.name)}</span><small>${i.type === 'service' ? i.mins + ' min' : 'Product'}${i.apptOnly ? ' · Appt only' : ''}</small><b>${peso(i.price)}</b></span><span class="plus">${ic('plus', 'sm')}</span></button>`).join('')}</div>`;
    return isWide() ? `${top}<div class="pos2"><div>${menu}</div><aside class="cartpane"><h3>${P.cart.editing ? 'Chair session' : 'Current order'}</h3>${cartInner()}</aside></div>` : top + menu;
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
  inbox() { return '<div id="inbox-host"></div>'; },
  problems() {
    const l = P.pr; if (!l) return '<p class="mute">Loading…</p>';
    const st = s => ({ SUBMITTED: 'waiting', ACKNOWLEDGED: 'in_chair', 'IN PROGRESS': 'in_chair', RESOLVED: 'paid', CLOSED: 'paid' }[s] || '');
    return `<button class="block" data-a="newprob" style="margin-bottom:12px;padding:16px">${ic('plus')} Report a problem</button>
    <p class="mute" style="margin:0 2px 10px">${l.open} open report${l.open === 1 ? '' : 's'}</p>
    ${l.rows.map(x => `<div class="card" style="padding:14px"><div class="row between" style="flex-wrap:nowrap"><b>${esc(x.category)}</b><span class="tag ${st(x.status)}">${x.status}</span></div>
      <small class="mute">${esc(x.priority)} priority · ${esc(x.submittedBy)} · ${esc(x.createdAt.slice(0, 10))}${x.assignedTo ? ' · Assigned: ' + esc(x.assignedTo) : ''}</small><p style="margin:6px 0">${esc(x.description)}</p>
      ${x.comments.map(c => `<small style="display:block;border-left:3px solid var(--line);padding-left:8px;margin:4px 0"><b>${esc(c.by)}</b>: ${esc(c.text)}</small>`).join('')}
      <div class="row" style="margin-top:8px">${x.photos.length ? `<button class="ghost sm" data-a="viewfiles" data-ids="${x.photos.join(',')}">${x.photos.length} photo${x.photos.length > 1 ? 's' : ''}</button>` : ''}<button class="ghost sm" data-a="pbcomment" data-id="${x.id}">Add comment</button></div></div>`).join('') || '<div class="card" style="text-align:center"><p class="mute" style="margin:6px 0">No problem reports yet.</p></div>'}`;
  },
  checklist() {
    const c = P.ck; if (!c) return '<p class="mute">Loading…</p>';
    const tabs = `<div class="seg"><button class="${c.kind === 'opening' ? 'on' : ''}" data-a="ckkind" data-k="opening">Opening</button><button class="${c.kind === 'closing' ? 'on' : ''}" data-a="ckkind" data-k="closing">Closing</button></div>`;
    const run = c.runs.find(r => r.kind === c.kind);
    if (run) return tabs + `<div class="card"><b style="color:var(--ok)">✔ Submitted</b> <span class="mute">by ${esc(run.submittedBy)} at ${hm(run.createdAt)}</span>${run.items.map(i => `<div class="row" style="padding:6px 0;border-top:1px solid var(--line);flex-wrap:nowrap"><span style="color:${i.done ? 'var(--ok)' : 'var(--bad)'}">${i.done ? '✔' : '✗'}</span><div style="flex:1"><span>${esc(i.text)}</span>${i.done && i.by ? `<br><small class="mute">${esc(i.by)} · ${hm(i.at)}</small>` : ''}${i.note ? `<br><small class="mute">${esc(i.note)}</small>` : ''}</div>${i.photoId ? `<button class="ghost sm" data-a="viewfiles" data-ids="${i.photoId}">Photo</button>` : ''}</div>`).join('')}</div>`;
    return tabs + `<div class="card"><h3 style="margin:0 0 6px;font-size:15px;text-transform:uppercase;letter-spacing:1px">${c.kind === 'opening' ? 'Opening' : 'Closing'} checklist</h3><p class="mute" style="margin:0 0 6px;font-size:13px">Tick every task. Tasks marked 📷 need a photo. If a task cannot be done, leave it unticked and write why.</p>
      ${c.template[c.kind].map((tk, i) => { const it = c.items[i] || {}; return `<div style="padding:8px 0;border-top:1px solid var(--line)"><label class="consent" style="margin:0"><input type="checkbox" data-a="ckitem" data-i="${i}" ${it.done ? 'checked' : ''}><span>${esc(tk.text)}${tk.photo ? ' 📷' : ''}</span></label>
        ${it.done && tk.photo ? `<div class="row" style="margin-top:6px"><button class="ghost sm" data-a="ckphoto" data-i="${i}">${it.photoId ? 'Retake photo' : '📷 Take photo'}</button>${it.preview ? `<img src="${it.preview}" alt="" style="width:46px;height:46px;border-radius:10px;object-fit:cover">` : '<small style="color:var(--bad)">Photo required</small>'}</div>` : ''}
        ${it.done ? `<small class="mute">${esc(P.me.name)} · ${hm(it.doneAt)}</small>` : `<input data-ck="${i}" placeholder="Why was this not done?" value="${esc(it.note || '')}" style="margin-top:6px">`}</div>`; }).join('')}
      <input type="file" id="ckfile" accept="image/*" capture="environment" hidden><p id="err" style="color:var(--bad);margin:8px 0 0"></p><button class="block" data-a="cksubmit">Submit ${c.kind} checklist</button></div>`;
  },
  leave() {
    const l = P.lv; if (!l) return '<p class="mute">Loading…</p>';
    const st = s => ({ PENDING: 'waiting', APPROVED: 'paid', REJECTED: 'void' }[s] || '');
    return `<button class="block" data-a="newleave" style="margin-bottom:12px;padding:16px">${ic('plus')} New leave request</button>
    ${l.rows.map(x => `<div class="card" style="padding:14px"><div class="row between" style="flex-wrap:nowrap"><b>${esc(x.staffName)}</b><span class="tag ${st(x.status)}">${x.status}</span></div><small class="mute">${esc(x.type)} · ${esc(x.from_date)}${x.to_date !== x.from_date ? ' to ' + esc(x.to_date) : ''}</small><br><small>${esc(x.reason)}</small>${x.reviewNote ? `<br><small>Owner note: ${esc(x.reviewNote)}</small>` : ''}</div>`).join('') || '<div class="card" style="text-align:center"><p class="mute" style="margin:6px 0">No leave requests.</p></div>'}`;
  },
  myperf() {
    const m = P.mp; if (!m) return '<p class="mute">Loading…</p>';
    if (m.err) return `<div class="card"><p>${esc(m.err)}</p></div>`;
    const me = m.perf.me, rg = [['today', 'Today'], ['week', 'This week'], ['month', 'This month']], k = (l, v) => `<div class="card kpi"><small>${l}</small><div class="num" style="font-size:24px">${v}</div></div>`;
    return `<div class="seg">${rg.map(([v, l]) => `<button class="${m.range === v ? 'on' : ''}" data-a="mprange" data-r="${v}">${l}</button>`).join('')}</div>
    <div class="card hero"><small>${esc(me.name)} · rank</small><div class="num">#${m.perf.rank} <span style="font-size:20px">of ${m.perf.of} barbers</span></div><span class="mute">Branch average: ${peso(m.perf.branchAvg.sales)} sales · ${Math.round(m.perf.branchAvg.haircuts * 10) / 10} haircuts</span></div>
    <div class="kpis">${k('Haircuts', me.n)}${k('Service sales', peso(me.sales))}${k('Average ticket', peso(me.avg))}${k('Returning customers', me.returning)}${k('Days worked', me.worked)}${k('Late arrivals', me.late)}${k('Days without time-in', me.absent)}${k('Rating', me.rating == null ? '—' : me.rating.toFixed(1) + ' ★')}</div>
    <p class="mute" style="font-size:12.5px;margin:0 2px 8px">Sales per day ${peso(me.perDay)} · ${Math.round(me.cutsPerDay * 10) / 10} haircuts per day · ${me.rc} review${me.rc === 1 ? '' : 's'}</p>
    <div class="sect"><h3>My payslips</h3><span class="mute">${m.slips.length}</span></div>
    ${m.slips.map((x, i) => `<div class="card" style="padding:14px"><div class="row between"><b>${esc(x.period)}</b><b>${peso(x.net)}</b></div><small class="mute">Paid ${esc(x.paidAt.slice(0, 10))} · Gross ${peso(x.gross)} · Deductions ${peso(x.totalDeductions)}</small><div class="row" style="margin-top:8px"><button class="sm ghost" data-a="slipview" data-i="${i}">View payslip</button></div></div>`).join('') || '<div class="card" style="text-align:center"><p class="mute" style="margin:6px 0">No payslips yet. One is created every time payroll is paid.</p></div>'}`;
  },
  release() {
    const l = P.adv; if (!l) return '<p class="mute">Loading…</p>';
    const st = s => ({ REQUESTED: 'waiting', APPROVED: 'in_chair', RELEASED: 'paid', REJECTED: 'void', CANCELLED: 'void' }[s] || '');
    return `<button class="block" data-a="newadv" style="margin-bottom:12px;padding:16px">${ic('plus')} New release pay request</button>
    <div class="card"><label style="margin-top:0">Check an employee's balance</label><select data-a="advbal"><option value="">Choose an employee</option>${P.boot.staff.map(s => `<option value="${s.id}" ${P.advBal?.staffId === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
      ${P.advBal ? `<div class="paybox" style="margin-top:10px"><small>Remaining advance balance · ${esc(P.advBal.name)}</small><div class="num">${peso(P.advBal.balance)}</div><small>Already deducted: ${peso(P.advBal.deducted)}</small></div>
      ${P.advBal.deductions.map(d => `<div class="row between" style="padding:5px 0;border-bottom:1px solid var(--line)"><span class="mute">${esc(d.dueDate)}</span><span>${peso(d.amount)}</span><span class="tag ${d.status === 'APPLIED' ? 'paid' : 'waiting'}">${d.status === 'APPLIED' ? 'Deducted' : 'Scheduled'}</span></div>`).join('') || '<p class="mute">No deductions yet.</p>'}` : ''}</div>
    <div class="sect"><h3>Requests</h3><span class="mute">${l.rows.length}</span></div>
    ${l.rows.map(a => `<div class="card" style="padding:14px"><div class="row between" style="flex-wrap:nowrap"><b>${esc(a.staffName)}</b><span class="tag ${st(a.status)}">${a.status}</span></div>
      <small class="mute">${esc(a.type)} · ${peso(a.amount)} · ${a.installments} installment${a.installments > 1 ? 's' : ''} · ${esc(a.createdAt.slice(0, 10))}</small><br><small>${esc(a.reason)}</small>
      ${a.status === 'RELEASED' ? `<br><small>Released ${peso(a.releasedAmt)} (${esc(a.method)}) · Balance <b>${peso(a.balance)}</b> · Deducted ${peso(a.deducted)}</small>` : ''}${a.reviewNote ? `<br><small>Owner note: ${esc(a.reviewNote)}</small>` : ''}</div>`).join('') || '<div class="card" style="text-align:center"><p class="mute" style="margin:6px 0">No requests yet.</p></div>'}`;
  },
  remit() {
    const m = P.rm, c = m.calc; if (!c) return '<p class="mute">Loading…</p>';
    const done = (c.existing || [])[0], st = s => ({ PENDING: 'waiting', VERIFIED: 'paid', FLAGGED: 'void', REJECTED: 'void' }[s] || '');
    const act = Number(m.actual), vr = m.actual !== '' && Number.isFinite(act) ? Math.round((act - c.expected) * 100) / 100 : null;
    const row = (l, v, b) => `<div class="row between" style="padding:6px 0;border-bottom:1px solid var(--line)"><span class="mute">${l}</span><span>${b ? '<b>' + v + '</b>' : v}</span></div>`;
    return `<div class="card"><label style="margin-top:0">Business date</label><input type="date" id="rmdate" data-a="rmdate" min="${ymd(-14)}" max="${ymd(0)}" value="${esc(m.date)}">
      <div style="margin-top:10px">${row('POS sales (' + c.orders + ' tickets)', peso(c.posSales))}${row('Cash sales', peso(c.cashSales))}${row('GCash sales', peso(c.gcashSales))}${row('Maya sales', peso(c.mayaSales))}${row('Other payment methods', peso(c.otherSales))}${c.cashIn ? row('Cash added to drawer', peso(c.cashIn)) : ''}${row('Authorized cash expenses and payouts', '−' + peso(c.cashExpenses))}</div>
      <div class="paybox"><small>Expected remittance</small><div class="num">${peso(c.expected)}</div><small>Cash sales − cash expenses</small></div></div>
    ${done ? `<div class="notice"><b>Already submitted for this date</b><br><small>Status: ${done.status}. Ask the owner to reject it first if it must be redone.</small></div>` : `<div class="card"><h3 style="margin:0 0 6px;font-size:15px;text-transform:uppercase;letter-spacing:1px">Submit remittance</h3>
      <label>Actual amount remitted (₱)</label><input id="rmactual" type="number" inputmode="decimal" value="${esc(m.actual)}" placeholder="0.00">
      <div id="rmvar" class="changebox row between" style="${vr === null ? 'display:none' : ''}"><span>Difference</span><b style="color:${vr !== null && Math.abs(vr) >= 1 ? 'var(--bad)' : 'var(--ok)'}">${vr === null ? '' : (vr > 0 ? '+' : '') + peso(vr)}</b></div>
      <label>Person responsible</label><input id="rmresp" value="${esc(m.resp || P.me.name)}" maxlength="100">
      <label>Deposit slip / remittance proof (photo)</label><button type="button" class="ghost block" data-a="rmpick">📷 ${m.proofId ? 'Retake photo' : 'Take photo or choose from gallery'}</button><input type="file" id="rmfile" accept="image/*" capture="environment" hidden>
      ${m.preview ? `<img class="idprev" src="${m.preview}" alt="Proof">` : ''}
      <label>Notes (optional)</label><textarea id="rmnotes" rows="2" maxlength="500" placeholder="e.g. Deposited at BDO, reference no.">${esc(m.notes)}</textarea>
      <p id="err" style="color:var(--bad);margin:8px 0 0"></p>
      <button class="block" data-a="rmsubmit" ${m.proofId && m.actual !== '' && !m.busy ? '' : 'disabled'}>${m.busy ? 'Submitting…' : 'Submit remittance'}</button>
      <p class="mute" style="font-size:12px;margin:8px 0 0">A difference of ₱1 or more is flagged automatically for the owner to review.</p></div>`}
    <div class="sect"><h3>Recent submissions</h3><span class="mute">last 30 days</span></div>
    ${m.list.map(r => `<div class="card" style="padding:14px"><div class="row between" style="flex-wrap:nowrap"><b>${esc(r.date)}</b><span class="tag ${st(r.status)}">${r.status}</span></div>
      <small class="mute">Expected ${peso(r.expected)} · Remitted ${peso(r.actual)} · <b style="color:${Math.abs(r.variance) >= 1 ? 'var(--bad)' : 'var(--ok)'}">${r.variance > 0 ? '+' : ''}${peso(r.variance)}</b></small>
      ${r.reviewNote ? `<br><small>Owner note: ${esc(r.reviewNote)}</small>` : ''}</div>`).join('') || '<div class="card" style="text-align:center"><p class="mute" style="margin:6px 0">No submissions yet.</p></div>'}`;
  },
  expenses() {
    const e = P.exp; if (!e) return '<p class="mute">Loading…</p>';
    const st = s => ({ PENDING: 'waiting', APPROVED: 'paid', REJECTED: 'void' }[s] || '');
    return `<div class="grid"><div class="card"><small class="mute">Today's expenses</small><b style="font-size:20px;display:block">${peso(e.today)}</b></div><div class="card"><small class="mute">Filtered total</small><b style="font-size:20px;display:block">${peso(e.total)}</b></div></div>
    <input id="expq" placeholder="Search description, category, name" value="${esc(P.expQ)}"><select data-a="exprange" style="margin:8px 0 12px">${[['today', 'Today'], ['month', 'This month'], ['all', 'All time']].map(([v, l]) => `<option value="${v}" ${P.expRange === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <p class="mute">${e.count} entries${e.noReceipt ? ` · <b style="color:var(--bad)">${e.noReceipt} without receipt</b>` : ''}</p>
    ${e.rows.map(m => `<div class="card" style="padding:14px"><div class="row between" style="flex-wrap:nowrap"><b>${esc(m.description)}</b><b>${peso(m.amount)}</b></div>
      <small class="mute">${esc(m.category)} · ${esc(m.method)} · ${esc(m.date)} · ${esc(m.submittedBy)}</small>
      <div class="row" style="margin-top:8px"><span class="tag ${st(m.status)}">${m.status}</span>${m.noReceipt ? '<span class="tag void">NO RECEIPT</span>' : `<button class="ghost sm" data-a="viewfiles" data-ids="${m.receipts.join(',')}">${m.receipts.length} receipt photo${m.receipts.length > 1 ? 's' : ''}</button>`}</div>
      ${m.noReceipt ? `<small class="mute">Reason: ${esc(m.noReceiptReason)}</small>` : ''}${m.reviewNote ? `<br><small>Owner note: ${esc(m.reviewNote)}</small>` : ''}</div>`).join('') || '<p class="mute" style="text-align:center">No expenses match the selected filters.</p>'}
    <div class="fab"><button data-a="addexp">${ic('plus')} Add Expense</button></div>`;
  },
  attendance() {
    const cnt = k => P.att.filter(s => s.state === k).length;
    return `<div class="grid"><div class="card"><small class="mute">Present (on time)</small><b style="font-size:22px;display:block">${cnt('present')}</b></div><div class="card"><small class="mute">Late</small><b style="font-size:22px;display:block">${cnt('late')}</b></div>
    <div class="card"><small class="mute">On break</small><b style="font-size:22px;display:block">${cnt('break')}</b></div><div class="card"><small class="mute">Not timed in</small><b style="font-size:22px;display:block">${cnt('none')}</b></div></div>
    ${P.q && P.q.length ? `<div class="card" style="border-color:#f1d98a;background:#fff9e8"><b>Waiting to sync (${P.q.length})</b><p class="mute" style="margin:4px 0 8px;font-size:13px">Saved on this device with the original time. They upload automatically when the internet is back.</p>${P.q.map(x => `<div class="row between" style="padding:6px 0;border-top:1px solid var(--line)"><span><b>${esc(x.staffName)}</b> · ${x.action === 'in' ? 'Time in' : 'Time out'} · ${hm(x.deviceAt)}</span><span class="tag ${x.status === 'CONFLICT' ? 'void' : 'waiting'}">${x.status}</span></div>${x.error ? `<small style="color:var(--bad)">${esc(x.error)} (kept for the manager)</small>` : ''}`).join('')}<button class="sm" data-a="syncnow" style="margin-top:8px">Retry now</button></div>` : ''}
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
    const c = P.cur; if (!c?.shift && P.boot?.locked) return tabs + `<div class="card" style="text-align:center"><div style="font-size:34px">🔒</div><b>Today is locked</b><p class="mute">The sales reading (Z-${P.boot.zNo}) for today is already done. Only one per day. You can open a new shift tomorrow.</p><button class="ghost" data-a="tab" data-t="z">View Z-readings</button></div>`;
    if (!c?.shift) return tabs + `<div class="card"><p>There is no open shift.</p><button data-a="openshift">Open shift</button></div>`;
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
      ${(() => { const q = (P.boot?.queue || []).length, ci = P.cart.items.length; return q || ci ? `<div class="card" style="border-color:#f2b8bf;background:#fff4f5"><b style="color:var(--bad)">Cannot do the sales reading yet</b><p style="margin:6px 0 0">${q ? q + ' ticket' + (q === 1 ? '' : 's') + ' still open (pay later or in the chair). Pay or cancel ' + (q === 1 ? 'it' : 'them') + '.' : ''} ${ci ? 'Your cart still has ' + ci + ' item' + (ci === 1 ? '' : 's') + '. Check it out or clear it.' : ''}</p></div>` : ''; })()}
      <label>Closing remarks (optional)</label><textarea id="remarks">${esc(P.remarks)}</textarea><br><br><button class="block" data-a="closeshift">${ic('lock')} Submit & Close Shift</button></div>`;
  }
};
function ticketHtml(o, actions) {
  const names = o.items.map(i => esc(i.name) + (i.qty > 1 ? ' ×' + i.qty : '')).join(', ');
  const live = o.status === 'waiting' || o.status === 'in_chair';
  return `<div class="ticket ${o.status}"><div class="no">#${String(o.no).padStart(3, '0')}</div><div class="bd"><div class="row between" style="flex-wrap:nowrap"><b>${esc(o.customerName)}</b><span class="tag ${o.status}">${o.status === 'in_chair' ? 'In Chair' : o.status === 'paid' ? 'Paid' : o.status === 'void' ? 'Void' : o.barberId ? 'Queued' : 'Waiting'}</span></div>
    <small>${names || 'No items yet'}</small>${o.idPhoto ? ` <a href="#" class="tag paid" data-a="viewticketid" data-id="${o.idPhoto}" style="margin-left:4px;text-decoration:none">${esc(o.idType || 'ID')} ID</a>` : ''}<br><small>${o.barberName ? ic('scissors', 'sm') + ' ' + esc(o.barberName) + (o.chairId ? ' · ' + esc(chairName(o.chairId)) : '') : 'No barber yet'}${live ? ' · ' + mins(o.startedAt || o.createdAt) + ' min' : ''}${o.status === 'paid' ? ' · ' + peso(o.total) : ''}</small>${o.cust ? `<br><small><span class="${tierCls(o.cust.tier)}">${o.cust.tier}</span> ${o.cust.visits} visit${o.cust.visits === 1 ? '' : 's'}${o.cust.preferredCut ? ' · ✂ ' + esc(o.cust.preferredCut) : ''}</small>` : ''}
    ${actions === 'queue' && live ? `<div class="acts">${o.status === 'waiting' ? `<button class="sm" data-a="seat" data-id="${o.id}">${o.barberId ? 'Reassign' : 'Seat'}</button>` : `<button class="sm ghost" data-a="gopl">Open at POS</button>`}</div>` : ''}
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
function pushItem(it) { const c = P.cart.items.find(x => x.itemId === it.id); if (c) c.qty++; else P.cart.items.push({ itemId: it.id, name: it.name, type: it.type, price: it.price, qty: 1, ...(it.needId ? { needId: 1 } : {}) }); }
// Items marked "requires ID" (Buddy: Senior / PWD / Student) can only be added after a photo of the customer's ID is taken.
async function resizeToJpeg(file, max = 1000) {
  busy(true, 'Preparing photo…');
  try {
    // big phone photos (12 MP+) are decoded directly at a smaller size: several times faster and far less memory than decoding them in full
    let bmp; if (file.size > 500000) { try { bmp = await createImageBitmap(file, { resizeWidth: max, resizeQuality: 'medium', imageOrientation: 'from-image' }); } catch (e) { bmp = null; } }
    if (!bmp) bmp = await createImageBitmap(file);
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.width * s)); c.height = Math.max(1, Math.round(bmp.height * s)); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); if (bmp.close) bmp.close();
    return c.toDataURL('image/jpeg', 0.74);
  } finally { busy(false); }
}
const idOk = () => !!(P.cart.idPhotoId || P.cart.hasId);
const cartNeedsId = () => P.cart.items.some(i => i.needId);
function syncId() { if (!cartNeedsId() && !P.cart.editing) { P.cart.idPhotoId = ''; P.cart.idPreview = ''; P.cart.idType = ''; } }
function idSheet(item) { P.idDraft = { item: item || null, type: P.cart.idType || '', data: '' }; idRender(); }
function idRender() {
  const dr = P.idDraft, name = dr.item ? dr.item.name : 'This order';
  openSheet(`<div class="row between"><h2 style="margin:0">ID required</h2><button class="ghost sm" data-a="idcancel">Cancel</button></div>
    <p class="mute" style="margin:8px 0 0">${esc(name)} is for <b>Senior, PWD and Student</b> customers. Take a clear photo of the customer's ID first. It cannot be added to the cart without it.</p>
    <label>Type of ID</label><div class="chips" style="flex-wrap:wrap">${['Senior', 'PWD', 'Student'].map(x => `<button class="chip ${dr.type === x ? 'on' : ''}" data-a="idtype" data-t="${x}">${x}</button>`).join('')}</div>
    <label>Photo of the ID</label><button type="button" class="ghost block" data-a="idpick">📷 ${dr.data ? 'Retake photo' : 'Take photo or choose from gallery'}</button>
    <input type="file" id="idfile" accept="image/*" capture="environment" hidden>
    ${dr.data ? `<img class="idprev" src="${dr.data}" alt="ID photo">` : '<p class="mute" style="font-size:12.5px;margin:8px 0 0">Make sure the name, photo and ID number are readable.</p>'}
    <p id="err" style="color:var(--bad);margin:8px 0 0"></p>
    <button class="block" data-a="idgo" ${dr.type && dr.data ? '' : 'disabled'}>${dr.item ? 'Add ' + esc(dr.item.name) + ' to cart' : 'Save ID photo'}</button>`);
}
async function viewIdPhoto(id) {
  try {
    const r = await fetch('/api/idphoto/' + id, { headers: { Authorization: 'Bearer ' + token } }); if (!r.ok) throw new Error('Could not load the ID photo');
    const url = URL.createObjectURL(await r.blob());
    openSheet(`<div class="row between"><h2 style="margin:0">Customer ID</h2><button class="ghost sm" data-a="closesheet">Close</button></div><img class="idprev" src="${url}" alt="ID photo">`);
  } catch (x) { toast(x.message, true); }
}
function addItem(id) {
  if (P.boot && P.boot.locked) return toast('Today is locked: the sales reading is already done.', true);
  const it = P.boot.items.find(i => i.id === id);
  if (it.apptOnly && !P.cart.items.some(x => x.itemId === id)) { toast(it.name + ' is by appointment only. Use the Bookings tab.', true); return; }
  if (!cu().name.trim()) return customerSheet(it);   // first item: ask who the customer is (same as the other POS)
  if (it.needId && !idOk()) return idSheet(it);
  pushItem(it); render();
}
function sessionsBoard() {
  const q = P.queue || [], chairs = P.boot.chairs;
  const cards = chairs.map(ch => {
    const cur = q.find(o => o.chairId === ch.id && o.status === 'in_chair'), wait = q.filter(o => o.chairId === ch.id && o.status === 'waiting').length;
    const bar = P.boot.staff.find(x => x.id === (cur ? cur.barberId : '')) || P.boot.staff.find(x => x.chairId === ch.id);
    return cur
      ? `<button class="seat occ" data-a="opensession" data-id="${cur.id}"><span class="tg">OCCUPIED</span>${ic('chair', 'big')}<b>${esc(ch.name)}</b><span class="bn">${ic('scissors', 'sm')} ${esc(cur.barberName || bar?.name || '')}</span><span class="cn">${esc(cur.customerName)}</span><span class="pr">${peso(cur.total || cur.subtotal || 0)}</span>${wait ? `<small class="mute">+${wait} waiting</small>` : ''}</button>`
      : `<div class="seat free"><span class="tg">AVAILABLE</span>${ic('chair', 'big')}<b>${esc(ch.name)}</b><span class="bn">${bar ? ic('scissors', 'sm') + ' ' + esc(bar.name) : 'No barber assigned'}</span><span class="cn mute">Empty</span></div>`;
  }).join('');
  const waiting = q.filter(o => o.status === 'waiting');
  return `<div class="chairsb">${cards || '<p class="mute">No chairs are set up for this branch.</p>'}</div>
    ${waiting.length ? `<div class="sect"><h3>Waiting in line</h3><span class="mute">${waiting.length}</span></div>${waiting.map(o => ticketHtml(o, 'queue')).join('')}` : ''}
    <p class="mute" style="text-align:center;font-size:13px;margin-top:16px">Tap an occupied chair to open its order and check out.</p>`;
}
// ---------- expenses with receipts ----------
const EXP_CATS = ['Supplies', 'Utilities', 'Repairs & Maintenance', 'Food & Meals', 'Transportation', 'Marketing', 'Equipment', 'Staff Welfare', 'Other'], PAY_METHODS = ['Cash', 'GCash', 'Maya', 'Bank Transfer', 'Card', 'Other'];
function expSheet() {
  const x = P.ex;
  openSheet(`<div class="row between"><h2 style="margin:0">Add expense</h2><button class="ghost sm" data-a="closesheet">Cancel</button></div>
    <label>Category</label><select id="xcat"><option value="">Choose a category</option>${EXP_CATS.map(c => `<option ${x.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
    <label>Description</label><input id="xdesc" value="${esc(x.desc)}" maxlength="300" placeholder="e.g. Towels, clipper oil">
    <label>Amount (₱)</label><input id="xamt" type="number" inputmode="decimal" value="${esc(x.amount)}">
    <label>Payment method</label><div class="chips" style="flex-wrap:wrap">${PAY_METHODS.map(m => `<button class="chip ${x.method === m ? 'on' : ''}" data-a="xmethod" data-m="${m}">${m}</button>`).join('')}</div>
    <label>Receipt photos</label><button type="button" class="ghost block" data-a="xpick">📷 Add receipt photo${x.receipts.length ? ' (' + x.receipts.length + ')' : ''}</button><input type="file" id="xfile" accept="image/*" capture="environment" hidden>
    ${x.receipts.length ? `<div class="thumbs">${x.receipts.map((r, i) => `<div class="thumb"><img src="${r.preview}" alt=""><button class="rm" data-a="xrm" data-i="${i}" aria-label="Remove">✕</button></div>`).join('')}</div>` : `<div class="notice" style="margin-top:8px"><b>NO RECEIPT</b><br><small>Tell us why there is no receipt. The owner will see this.</small></div><input id="xreason" value="${esc(x.reason)}" maxlength="300" placeholder="Reason (required)">`}
    <p id="err" style="color:var(--bad);margin:8px 0 0"></p>
    <button class="block" data-a="xsave" ${x.busy ? 'disabled' : ''}>${x.busy ? 'Saving…' : 'Save expense'}</button>`);
}
async function viewFiles(ids, title = 'Photos') {
  try {
    const imgs = [];
    for (const id of ids) { const r = await fetch('/api/files/' + id, { headers: { Authorization: 'Bearer ' + token } }); if (r.ok) imgs.push(URL.createObjectURL(await r.blob())); }
    if (!imgs.length) throw new Error('Could not load the photos');
    openSheet(`<div class="row between"><h2 style="margin:0">${esc(title)}</h2><button class="ghost sm" data-a="closesheet">Close</button></div>${imgs.map(u => `<img class="idprev" src="${u}" alt="">`).join('')}`);
  } catch (x) { toast(x.message, true); }
}
const ADV_TYPES = ['Cash Advance', 'Salary Advance', 'Partial Salary Release', 'Emergency Assistance', 'Other Authorized Deduction'];
function advSheet() {
  const x = P.av;
  openSheet(`<div class="row between"><h2 style="margin:0">Release pay request</h2><button class="ghost sm" data-a="closesheet">Cancel</button></div>
    <label>Employee</label><select id="avstaff"><option value="">Choose an employee</option>${P.boot.staff.map(s => `<option value="${s.id}" ${x.staffId === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
    <label>Request type</label><select id="avtype">${ADV_TYPES.map(t => `<option ${x.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
    <label>Amount (₱)</label><input id="avamt" type="number" inputmode="decimal" value="${esc(x.amount)}">
    <label>Deduct over how many payrolls?</label><select id="avinst">${[1, 2, 3, 4, 6, 8, 12].map(n => `<option value="${n}" ${+x.inst === n ? 'selected' : ''}>${n} installment${n > 1 ? 's' : ''}</option>`).join('')}</select>
    <label>Reason</label><input id="avreason" value="${esc(x.reason)}" maxlength="300" placeholder="Why is this needed?">
    <label class="consent"><input type="checkbox" id="avconsent" ${x.consent ? 'checked' : ''}><span>The employee has agreed in writing that this amount will be deducted from their wages on the schedule above.</span></label>
    <p id="err" style="color:var(--bad);margin:8px 0 0"></p><button class="block" data-a="avsave" ${x.busy ? 'disabled' : ''}>${x.busy ? 'Sending…' : 'Send request'}</button>`);
}
const PROB_CATS = ['Equipment malfunction', 'Air conditioning', 'Electrical', 'Internet', 'POS', 'Maintenance', 'Customer complaint', 'Employee concern', 'Inventory shortage', 'Other'];
function probSheet() {
  const x = P.pb;
  openSheet(`<div class="row between"><h2 style="margin:0">Report a problem</h2><button class="ghost sm" data-a="closesheet">Cancel</button></div>
    <label>Category</label><select id="pbcat"><option value="">Choose a category</option>${PROB_CATS.map(c => `<option ${x.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
    <label>Priority</label><div class="chips">${['Low', 'Normal', 'High', 'Urgent'].map(p => `<button class="chip ${x.priority === p ? 'on' : ''}" data-a="pbprio" data-p="${p}">${p}</button>`).join('')}</div>
    <label>What is wrong?</label><textarea id="pbdesc" rows="3" maxlength="1000" placeholder="Describe the problem">${esc(x.desc)}</textarea>
    <label>Photos (optional)</label><button type="button" class="ghost block" data-a="pbpick">📷 Add photo${x.photos.length ? ' (' + x.photos.length + ')' : ''}</button><input type="file" id="pbfile" accept="image/*" capture="environment" hidden>
    ${x.photos.length ? `<div class="thumbs">${x.photos.map((r, i) => `<div class="thumb"><img src="${r.preview}" alt=""><button class="rm" data-a="pbrm" data-i="${i}">✕</button></div>`).join('')}</div>` : ''}
    <p id="err" style="color:var(--bad);margin:8px 0 0"></p><button class="block" data-a="pbsave" ${x.busy ? 'disabled' : ''}>${x.busy ? 'Sending…' : 'Send report'}</button>`);
}
function leaveSheet() {
  const x = P.lvf;
  openSheet(`<div class="row between"><h2 style="margin:0">Leave request</h2><button class="ghost sm" data-a="closesheet">Cancel</button></div>
    <label>Employee</label><select id="lvstaff"><option value="">Choose an employee</option>${P.boot.staff.map(s => `<option value="${s.id}" ${x.staffId === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
    <label>Type</label><select id="lvtype">${['Vacation', 'Sick', 'Emergency', 'Other'].map(t => `<option ${x.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
    <div class="row" style="flex-wrap:nowrap"><div style="flex:1"><label>From</label><input type="date" id="lvfrom" value="${x.from}"></div><div style="flex:1"><label>To</label><input type="date" id="lvto" value="${x.to}"></div></div>
    <label>Reason</label><input id="lvreason" value="${esc(x.reason)}" maxlength="300"><p id="err" style="color:var(--bad);margin:8px 0 0"></p><button class="block" data-a="lvsave" ${x.busy ? 'disabled' : ''}>${x.busy ? 'Sending…' : 'Send request'}</button>`);
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
    return `<button class="chair ${s.cls}" data-a="aspick" data-id="${ch.id}" ${s.ok ? '' : 'disabled'}>${ic('chair', 'big')}<b>${esc(ch.name)}</b><span class="who">${s.barber ? ic('scissors', 'sm') + ' ' + esc(s.barber.name) : '—'}</span><span class="st">${s.label}</span></button>`;
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
function cartInner() {
  const c = P.cart, u = cu(), card = u.card, sub = cartTotal(), disc = discountOf(), svc = cartHasService(), dn = P.boot.discounts.find(d => d.id === c.discountId), sess = !!c.editing;
  const sv = c.items.filter(i => i.type === 'service').map(i => i.name).join(', ');
  return `<div class="custchip"><span class="av">${esc(initials(u.name || '?'))}</span><div style="flex:1;min-width:0"><b>${esc(u.name || 'No customer specified')}</b><br><small class="mute">${sess && c.barber ? 'Barber: <b style="color:var(--info)">' + esc(c.barber) + '</b>' : card ? `${esc(card.tier)} · ${card.visits} visits` : (u.phone || u.email ? 'New customer · joins the directory' : 'Walk-in · not in the directory')}</small></div><button class="ghost sm" data-a="changecust">${ic('menu', 'sm')} Change</button></div>
    ${(c.idPhotoId || c.hasId) ? `<div class="idchip">${c.idPreview ? `<img src="${c.idPreview}" alt="">` : ic('doc')}<div style="flex:1;min-width:0"><b>${esc(c.idType || 'ID')} ID on file</b><br><small class="mute">Photo attached to this ticket</small></div>${c.hasId && c.idPhoto && !c.idPhotoId ? '<button class="ghost sm" data-a="viewid">View</button>' : ''}<button class="ghost sm" data-a="idretake">Retake</button></div>` : ''}
    ${c.items.map((i, n) => `<div class="cartrow"><div style="flex:1;min-width:0"><b>${esc(i.name)}</b><br><small class="mute">${sess && c.barber && i.type === 'service' ? 'Barber: ' + esc(c.barber) + '<br>' : ''}${peso(i.price)} each</small></div><div class="qty"><button class="ghost sm" data-a="q" data-n="${n}" data-d="-1">−</button><b>${i.qty}</b><button class="ghost sm" data-a="q" data-n="${n}" data-d="1">＋</button></div><b style="min-width:76px;text-align:right">${peso(i.price * i.qty)}</b><button class="ghost sm" data-a="rm" data-n="${n}" aria-label="Remove">✕</button></div>`).join('') || `<div class="emptycart">${ic('cart')}<p>Cart is empty. Tap an item to add it.</p></div>`}
    <div class="totals"><div class="row between"><span class="mute">Subtotal</span><span>${peso(sub)}</span></div>${disc ? `<div class="row between"><span class="mute">Discount${dn ? ' (' + esc(dn.name) + ')' : ''}</span><span>−${peso(disc)}</span></div>` : ''}<div class="row between" style="margin-top:6px"><b>Total Amount:</b><b style="font-size:24px;font-family:Oswald;color:var(--info)">${peso(sub - disc)}</b></div></div>
    ${svc && !sess ? `<div class="notice"><b>Chair assignment required before payment</b><br><small>Service items (${esc(sv)}) must be charged later on a chair and barber. Settle the payment afterwards from the chair session.</small></div>` : ''}
    <div class="row" style="flex-wrap:nowrap"><button class="ghost block" data-a="discount">${ic('tag', 'sm')} Discount${dn ? ': ' + esc(dn.name) : ''}</button>${sess ? '<button class="ghost block" data-a="cancelsession">Cancel Session</button>' : '<button class="ghost block" data-a="clearcart">Clear</button>'}</div>
    <p id="cerr" style="color:var(--bad);margin:8px 0 0"></p>
    ${sess ? `<div class="row" style="flex-wrap:nowrap"><button class="ghost block" data-a="saveticket" ${c.items.length ? '' : 'disabled'}>${ic('hourglass', 'sm')} Charge Later</button><button class="block blue" data-a="paynow" ${c.items.length ? '' : 'disabled'}>${ic('cart', 'sm')} Pay Now</button></div>`
      : `<button class="block ${svc ? '' : 'blue'}" data-a="${svc ? 'chargelater' : 'paynow'}" ${c.items.length ? '' : 'disabled'}>${svc ? 'Charge Later — Assign Chair &amp; Barber' : 'Pay Now'}</button>`}`;
}
function cartSheet() {
  if (isWide()) { closeSheet(); return render(); }
  openSheet(`<div class="row between"><h2 style="margin:0">${P.cart.editing ? 'Chair session' : 'Cart'}</h2><button class="ghost sm" data-a="closesheet">Close</button></div>${cartInner()}`);
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
  openSheet(`<div class="payhd">${ic('pos')}<h2>Process Payment &amp; Checkout</h2></div>
    <div class="paybox"><small>Total Amount Due</small><div class="num">${peso(t.total)}</div><small>Customer: ${esc(p.order.customerName)} · #${String(p.order.no).padStart(3, '0')}</small></div>
    <p class="mute" style="font-size:13px;margin:8px 2px 0">${p.order.items.map(i => esc(i.name) + (i.qty > 1 ? ' ×' + i.qty : '')).join(', ')}${t.amt ? ' · Discount −' + peso(t.amt) : ''}</p>
    <label>Select Payment Tender</label><div class="chips tender" style="flex-wrap:wrap">${[['Cash', 'Cash'], ['GCash', 'GCash'], ['Maya', 'Maya'], ['Card', 'Credit / Debit Card']].map(([m, l]) => `<button class="chip ${p.method === m ? 'on' : ''}" data-a="paym" data-m="${m}">${p.method === m ? '✓ ' : ''}${l}</button>`).join('')}</div>
    ${p.method === 'Cash' ? `<label>Amount Tendered (₱)</label><input id="tendered" type="number" inputmode="decimal" value="${p.tendered}" placeholder="0.00">
      <div class="chips" style="margin-top:8px"><button class="chip" data-a="exact">Exact</button>${[100, 500, 1000].map(n => `<button class="chip" data-a="quick" data-n="${n}">₱${n.toLocaleString('en-PH')}</button>`).join('')}</div>
      <div class="changebox row between"><span>Change Due to Customer</span><b id="chg" style="color:${change < 0 ? 'var(--bad)' : 'var(--ok)'}">${peso(Math.max(0, change))}</b></div>` : ''}
    <details style="margin-top:10px"><summary class="mute" style="cursor:pointer;font-size:13px">Discount voucher</summary><select data-a="paydisc" style="margin-top:6px"><option value="">None</option>${P.boot.discounts.map(d => `<option value="${d.id}" ${p.disc === d.id ? 'selected' : ''}>${esc(d.name)} (${d.kind === 'percent' ? d.value + '%' : peso(d.value)})</option>`).join('')}</select></details>
    <p id="err" style="color:var(--bad);margin:8px 0 0"></p>
    <div class="row" style="flex-wrap:nowrap;margin-top:6px"><button class="ghost block" data-a="closesheet">Cancel</button><button class="block ok" data-a="confirmpay" ${p.method === 'Cash' && change < 0 ? 'disabled' : ''}>✔ Complete</button></div>`);
}
function receiptSheet(o) {
  P.lastSale = o;
  openSheet(`<h2 style="margin:0 0 6px;color:var(--ok)">✔ Paid</h2><p class="mute">SI-${String(o.si).padStart(6, '0')} · #${String(o.no).padStart(3, '0')} · ${esc(o.customerName)}</p>
    ${o.items.map(i => `<div class="row between"><span>${esc(i.name)} ×${i.qty}</span><span>${peso(i.price * i.qty)}</span></div>`).join('')}<hr>
    ${o.discountAmt ? `<div class="row between"><span>${esc(o.discountName)}</span><span>−${peso(o.discountAmt)}</span></div>` : ''}<div class="row between"><b>Total</b><b>${peso(o.total)}</b></div>
    ${o.change ? `<div class="row between"><span>Change</span><b style="color:var(--gold);font-size:20px">${peso(o.change)}</b></div>` : ''}<br><button class="block" data-a="closesheet">Done</button>`);
}

// ---------- sales reading on screen (nothing is printed except the payslip) ----------
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
    + (z.remarks ? `<hr>Remarks: ${esc(z.remarks)}` : '') + `<hr><div class="c">*** END OF SALES READING ***</div>`;
}
function printHtml(html) { document.getElementById('print').innerHTML = `<div class="paper">${html}</div>`; setTimeout(() => window.print(), 50); }
function showReading(z) {
  P.lastZ = z; openSheet(`<div class="paper">${readingHtml(z)}</div><button class="block" data-a="closesheet" style="margin-top:12px">Done</button>`);
}

// ---------- events ----------
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-a]'); if (!el) return;
  const d = el.dataset, a = d.a;
  if (a === 'pin') { if (P.pin.length < 6) P.pin += d.n; P.err = ''; render(); if (P.pin.length === 6) { const pin = P.pin; P.pin = ''; try { await afterLogin(await api('POST', '/api/login', { pin })); } catch (x) { P.err = x.message; render(); } } return; }
  if (a === 'pinclr') { P.pin = ''; return render(); }
  if (a === 'pinbk') { P.pin = P.pin.slice(0, -1); return render(); }
  if (a === 'closesheet') { closeSheet(); return render(); }
  if (a === 'go') { P.view = d.v; render(); refresh(); return; }   // show the screen at once, fresh data fills in a moment later
  if (a === 'more') {
    return openSheet(`<div class="drawer"><div class="row between"><div class="row"><img src="/logo.png" width="42" height="42" style="border-radius:12px" alt=""><div><h2 style="margin:0;font-size:20px">BROTHERHOOD</h2><small class="mute">${esc(P.boot?.branch?.name || '')} · ${esc(P.me.name)}</small></div></div><button class="ghost sm" data-a="closesheet">Close</button></div><hr>
      ${[['dashboard', 'grid', 'Dashboard'], ['pos', 'pos', 'Point of Sale'], ['queue', 'users', 'Walk-in Queue'], ['expenses', 'wallet', 'Expenses'], ['appts', 'calendar', 'Appointments'], ['customers', 'star', 'Customer Directory'], ['remit', 'wallet', 'Daily Sales Remittance'], ['release', 'tag', 'Release Pay'], ['problems', 'tag', 'Report a Problem'], ['inbox', 'users', 'Inbox'], ['checklist', 'doc', 'Daily Checklist'], ['leave', 'calendar', 'Leave Requests'], ['myperf', 'star', 'My Performance & Payslips'], ['attendance', 'clock', 'Barber Attendance'], ['reading', 'doc', 'Sales Reading']].filter(([v]) => canOpen(v)).map(([v, i, l]) => `<a href="#" data-a="drawergo" data-v="${v}">${ic(i)}${l}</a>`).join('')}
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
  if (a === 'mode') { P.cart.mode = d.m; render(); refresh(); return; }
  if (a === 'gopl') { P.cart.mode = 'now'; P.view = 'pos'; await refresh(); return render(); }
  if (a === 'cat') { P.cat = d.c; return render(); }
  if (a === 'add') return addItem(d.id);
  if (a === 'cart') { P.custHits = []; return cartSheet(); }
  if (a === 'rm') { P.cart.items.splice(+d.n, 1); syncId(); cartSheet(); return render(); }
  if (a === 'newprob') { P.pb = { category: '', priority: 'Normal', desc: '', photos: [], busy: false }; return probSheet(); }
  if (a === 'pbprio') { P.pb.priority = d.p; return probSheet(); }
  if (a === 'pbpick') { document.getElementById('pbfile')?.click(); return; }
  if (a === 'pbrm') { P.pb.photos.splice(+d.i, 1); return probSheet(); }
  if (a === 'pbsave') {
    const x = P.pb; x.busy = true; probSheet();
    try { await api('POST', '/api/problems', { branchId: P.boot.branch.id, category: x.category, priority: x.priority, description: x.desc, photos: x.photos.map(r => r.id) }); closeSheet(); toast('Report sent to the owner'); await refresh(); }
    catch (er) { x.busy = false; probSheet(); const e2 = document.getElementById('err'); if (e2) e2.textContent = er.message; }
    return;
  }
  if (a === 'pbcomment') { const text = prompt('Write your comment'); if (!text || !text.trim()) return; await guard(() => api('POST', '/api/problems/' + d.id + '/comment', { text })); return refresh(); }
  if (a === 'mprange') { P.mp.range = d.r; await refresh(); return render(); }
  if (a === 'slipview') return slipSheet(P.mp.slips[+d.i]);
  if (a === 'slipprint') { const x = P.mp.slips[+d.i]; return printHtml('<div class="c"><b>' + esc((P.shop || 'Brotherhood').toUpperCase()) + ' BARBERSHOP</b></div><div class="c">PAYSLIP</div><hr>' + R('Employee', x.staffName) + R('Pay period', x.period) + R('Paid on', x.paidAt.slice(0, 10)) + '<hr>' + x.dayItems.map(d => R('Commission ' + d.date, peso(d.commission))).join('') + (x.topup ? R('Daily top-up', peso(x.topup)) : '') + (x.lunch ? R('Free lunch allowance', peso(x.lunch)) : '') + x.earningItems.map(e => R(e.kind + ': ' + e.note, peso(e.amount))).join('') + R('GROSS', peso(x.gross), 1) + '<hr>' + x.advanceItems.concat(x.deductionItems).map(a => R(a.label, '-' + peso(a.amount))).join('') + R('TOTAL DEDUCTIONS', '-' + peso(x.totalDeductions), 1) + '<hr>' + R('NET SALARY', peso(x.net), 1)); }
  if (a === 'ckphoto') { P.ckTarget = +d.i; document.getElementById('ckfile')?.click(); return; }
  if (a === 'ckkind') { P.ck.kind = d.k; P.ck.items = []; return render(); }
  if (a === 'cksubmit') {
    const c = P.ck, n = c.template[c.kind].length, items = Array.from({ length: n }, (_, i) => { const x = c.items[i] || { done: false, note: '' }; return { done: !!x.done, note: x.note || '', photoId: x.photoId || '', doneAt: x.doneAt || '' }; });
    try { await api('POST', '/api/checklists/submit', { branchId: P.boot.branch.id, kind: c.kind, items }); toast('Checklist submitted'); c.items = []; await refresh(); }
    catch (x) { const er = document.getElementById('err'); if (er) er.textContent = x.message; else toast(x.message, true); }
    return;
  }
  if (a === 'newleave') { P.lvf = { staffId: '', type: 'Vacation', from: ymd(1), to: ymd(1), reason: '', busy: false }; return leaveSheet(); }
  if (a === 'lvsave') {
    const x = P.lvf; x.busy = true; leaveSheet();
    try { await api('POST', '/api/leaves', { branchId: P.boot.branch.id, staffId: x.staffId, type: x.type, from: x.from, to: x.to, reason: x.reason }); closeSheet(); toast('Leave request sent'); await refresh(); }
    catch (er) { x.busy = false; leaveSheet(); const e2 = document.getElementById('err'); if (e2) e2.textContent = er.message; }
    return;
  }
  if (a === 'newadv') { P.av = { staffId: '', type: 'Cash Advance', amount: '', inst: 1, reason: '', consent: false, busy: false }; return advSheet(); }
  if (a === 'avsave') {
    const x = P.av; x.busy = true; advSheet();
    try { await api('POST', '/api/advances', { branchId: P.boot.branch.id, staffId: x.staffId, type: x.type, amount: x.amount, installments: x.inst, reason: x.reason, consent: x.consent }); closeSheet(); toast('Request sent to the owner'); await refresh(); }
    catch (er) { x.busy = false; advSheet(); const e2 = document.getElementById('err'); if (e2) e2.textContent = er.message; }
    return;
  }
  if (a === 'rmpick') { document.getElementById('rmfile')?.click(); return; }
  if (a === 'rmsubmit') {
    const m = P.rm; m.busy = true; render();
    try {
      await api('POST', '/api/remittances', { branchId: P.boot.branch.id, date: m.date, actual: m.actual, responsible: m.resp || P.me.name, proofId: m.proofId, notes: m.notes });
      Object.assign(m, { proofId: '', preview: '', actual: '', resp: '', notes: '', busy: false }); toast('Remittance submitted for review'); await refresh();
    } catch (x) { m.busy = false; render(); const er = document.getElementById('err'); if (er) er.textContent = x.message; else toast(x.message, true); }
    return;
  }
  if (a === 'idpick') { document.getElementById('idfile')?.click(); return; }
  if (a === 'idtype') { P.idDraft.type = d.t; return idRender(); }
  if (a === 'idcancel') { P.idDraft = null; closeSheet(); return render(); }
  if (a === 'idretake') { return idSheet(null); }
  if (a === 'viewid') return viewIdPhoto(P.cart.idPhoto);
  if (a === 'viewticketid') { e.preventDefault(); return viewIdPhoto(d.id); }
  if (a === 'idgo') {
    const dr = P.idDraft; if (!dr || !dr.type || !dr.data) return;
    const r = await guard(() => api('POST', '/api/pos/idphoto', { data: dr.data, idType: dr.type, branchId: P.boot.branch.id })); if (!r) return;
    P.cart.idPhotoId = r.id; P.cart.idType = dr.type; P.cart.idPreview = dr.data; P.cart.hasId = false;
    if (dr.item) pushItem(dr.item); P.idDraft = null; closeSheet(); render(); toast('ID photo saved'); if (P.cart.editing && !dr.item) toast('ID photo will be saved with the order'); return;
  }
  if (a === 'changecust') { P.fromCart = true; P.custHits = []; return customerSheet(null); }
  if (a === 'custdone') {
    const err = document.getElementById('err');
    try { customerPayload(); } catch (x) { if (err) err.textContent = x.message; return; }
    if (P.pendingItem) { const it = P.pendingItem; P.pendingItem = null; if (it.needId && !idOk()) { P.fromCart = false; return idSheet(it); } pushItem(it); }
    const back = P.fromCart; P.fromCart = false; closeSheet(); render(); if (back) cartSheet(); return;
  }
  if (a === 'discount') return discountSheet();
  if (a === 'pickdisc') { P.cart.discountId = d.id; return cartSheet(); }
  if (a === 'cartback') return cartSheet();
  if (a === 'clearcart') { if (!confirm('Clear the cart and the customer?')) return; P.cart = freshCart(); closeSheet(); return render(); }
  if (a === 'q') { const it = P.cart.items[+d.n]; it.qty += +d.d; if (it.qty <= 0) P.cart.items.splice(+d.n, 1); syncId(); cartSheet(); return render(); }
  if (a === 'pickcust') { const h = P.custHits.find(x => x.id === d.id); P.custHits = []; if (h) { const u = cu(); u.name = h.name; u.phone = ''; u.email = ''; u.cut = ''; applyCard({ id: h.id, name: h.name, phone: h.phone, email: h.email, preferredCut: h.preferredCut, consent: h.consent, visits: h.visits, spent: h.spent, lastVisit: h.lastVisit, tier: h.tier, next: null }); } return customerSheet(P.pendingItem); }
  if (a === 'terms') { e.preventDefault(); return termsSheet('termsback'); }
  if (a === 'termsback') return customerSheet(P.pendingItem);
  if (a === 'canceledit') { P.cart = freshCart(); return render(); }
  if (a === 'newticket') { P.cart = freshCart(); P.view = 'pos'; await refresh(); return render(); }
  if (a === 'openshift') return openSheet(`<h2 style="margin-top:0">Open shift</h2><label>Opening float (₱)</label><input id="float" type="number" inputmode="decimal" value="0"><p id="err" style="color:var(--bad)"></p><div class="row"><button data-a="doopen">Open shift</button><button class="ghost" data-a="closesheet">Cancel</button></div>`);
  if (a === 'doopen') { const r = await guard(() => api('POST', '/api/shifts/open', { branchId: P.branch, terminal: 'Terminal 1', openingFloat: +document.getElementById('float').value || 0 })); if (r) { closeSheet(); toast('Shift opened'); await refresh(); } return; }
  if (a === 'chargelater' || a === 'paynow' || a === 'saveticket') {
    const c = P.cart, err = document.getElementById('cerr');
    try {
      const customer = customerPayload(), items = c.items.map(i => ({ itemId: i.itemId, qty: i.qty }));
      if (c.editing) {
        await api('PUT', '/api/orders/' + c.editing, { items, customer, discountId: c.discountId || '', ...(c.idPhotoId ? { idPhotoId: c.idPhotoId } : {}) });
        const o = a === 'paynow' ? await api('GET', '/api/orders/' + c.editing) : null;
        P.cart = freshCart(); P.cart.mode = 'now'; closeSheet(); await refresh(); render();
        if (o) return paySheet(o);
        return toast('Order saved to chair session.');
      }
      const o = await api('POST', '/api/orders', { customer, items, discountId: c.discountId || '', ...(c.idPhotoId ? { idPhotoId: c.idPhotoId } : {}) });
      P.cart = freshCart(); await refresh();
      if (a === 'paynow') { closeSheet(); render(); return paySheet(o); }
      toast('Ticket #' + o.no + ' created'); closeSheet(); render(); return assignSheet(o.id);
    } catch (x) { if (err) err.textContent = x.message; else toast(x.message, true); }
    return;
  }
  if (a === 'opensession') {
    const o = await guard(() => api('GET', '/api/orders/' + d.id)); if (!o) return;
    P.cart = { items: o.items.map(i => ({ ...i })), cu: { id: o.customerId || '', name: o.customerName, phone: o.cust?.phone || '', email: o.cust?.email || '', cut: o.cust?.preferredCut || '', consent: false, card: o.cust || null }, discountId: o.discountId || '', editing: o.id, mode: 'later', barber: o.barberName || P.boot.staff.find(s => s.id === o.barberId)?.name || '', hasId: !!o.idPhoto, idPhoto: o.idPhoto || '', idType: o.idType || '' };
    await refresh(); return render();
  }
  if (a === 'cancelsession') {
    if (!confirm('Cancel this chair session? The ticket will be voided.')) return;
    const r = await guard(() => api('POST', `/api/orders/${P.cart.editing}/void`, { reason: 'Cancelled at POS' })); if (!r) return;
    toast('Session cancelled'); P.cart = freshCart(); P.cart.mode = 'now'; closeSheet(); await refresh(); return render();
  }
  if (a === 'seat') { await refresh(); return assignSheet(d.id); }
  if (a === 'aspick') {
    const as = P.as, r = await guard(() => api('PUT', '/api/orders/' + as.id, { chairId: d.id })); if (!r) return;
    const who = P.boot.staff.find(s => s.id === r.barberId)?.name || 'the barber', cn = chairName(r.chairId);
    closeSheet(); toast(r.queued ? 'Added to queue for ' + cn + ' · ' + who : 'Order saved to chair session.');
    if (P.view === 'pos') P.cart.mode = 'now';
    await refresh(); render();
    return;
  }
    if (a === 'checkout') { const o = await guard(() => api('GET', '/api/orders/' + d.id)); if (o) paySheet(o); return; }
  if (a === 'editticket') {
    const o = await guard(() => api('GET', '/api/orders/' + d.id)); if (!o) return;
    P.cart = { items: o.items.map(i => ({ ...i })), cu: { id: o.customerId || '', name: o.customerName, phone: o.cust?.phone || '', email: o.cust?.email || '', cut: o.cust?.preferredCut || '', consent: false, card: o.cust || null }, discountId: o.discountId || '', editing: o.id, mode: 'later', barber: o.barberName || '', hasId: !!o.idPhoto, idPhoto: o.idPhoto || '', idType: o.idType || '' };
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
    if (o) { receiptSheet(o); if (P.view === 'pos') P.cart.mode = 'now'; await refresh(); }
    return;
  }
  if (a === 'addexp') { P.ex = { category: '', desc: '', amount: '', method: 'Cash', receipts: [], reason: '', busy: false }; return expSheet(); }
  if (a === 'xmethod') { P.ex.method = d.m; return expSheet(); }
  if (a === 'xpick') { document.getElementById('xfile')?.click(); return; }
  if (a === 'xrm') { P.ex.receipts.splice(+d.i, 1); return expSheet(); }
  if (a === 'viewfiles') return viewFiles(String(d.ids).split(',').filter(Boolean), 'Receipt photos');
  if (a === 'xsave') {
    const x = P.ex, err = document.getElementById('err'); x.busy = true; expSheet();
    try {
      await api('POST', '/api/expense-claims', { branchId: P.boot.branch.id, category: x.category, description: x.desc, amount: x.amount, method: x.method, receipts: x.receipts.map(r => r.id), noReceiptReason: x.reason });
      closeSheet(); toast('Expense saved for approval'); await refresh();
    } catch (er) { x.busy = false; expSheet(); const e2 = document.getElementById('err'); if (e2) e2.textContent = er.message; }
    return;
  }
  if (a === 'att' && (d.x === 'in' || d.x === 'out')) {
    P.sf = { staffId: d.id, action: d.x, data: '', geo: null, busy: false }; selfieSheet();
    if (P.boot.settings?.attGeo && navigator.geolocation) navigator.geolocation.getCurrentPosition(p => { if (P.sf) { P.sf.geo = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }; if (sheet.open) selfieSheet(); } }, () => { }, { timeout: 8000, maximumAge: 60000 });
    return;
  }
  if (a === 'sfpick') { document.getElementById('sffile')?.click(); return; }
  if (a === 'sfcancel') { P.sf = null; closeSheet(); return render(); }
  if (a === 'sfgo') return sfSubmit();
  if (a === 'syncnow') { for (const x of await OFF.all()) { x.retry = true; await OFF.put(x); } await syncQueue(); return; }
  if (a === 'att') { const r = await guard(() => api('POST', '/api/attendance', { staffId: d.id, action: d.x })); if (r) toast('Saved'); return refresh(); }
  if (a === 'viewz') { const z = P.zs[+d.i]; return showReading({ no: z.no, businessDate: z.businessDate, ...z.data }); }
  if (a === 'tab') { P.tab = d.t; return render(); }
  if (a === 'den') { P.denoms[d.d] = Math.max(0, (P.denoms[d.d] || 0) + +d.n); return render(); }
  if (a === 'cashmove') return openSheet(`<h2 style="margin-top:0">Cash ${d.k === 'in' ? 'in' : 'out'}</h2><label>Amount (₱)</label><input id="camt" type="number" inputmode="decimal"><label>Note</label><input id="cnote"><p id="err" style="color:var(--bad)"></p><div class="row"><button data-a="docash" data-k="${d.k}">Save</button><button class="ghost" data-a="closesheet">Cancel</button></div>`);
  if (a === 'docash') { const r = await (async () => { try { return await api('POST', '/api/cash', { shiftId: P.cur.shift.id, kind: d.k, amount: +document.getElementById('camt').value, note: document.getElementById('cnote').value }); } catch (x) { document.getElementById('err').textContent = x.message; return null; } })(); if (r) { closeSheet(); toast('Saved'); await refresh(); } return; }
  if (a === 'closeshift') {
    if (P.cart.items.length) return alert('Your cart still has items. Check it out or clear it before the sales reading.');
    if ((P.boot?.queue || []).length) return alert('There are still open tickets (pay later or in the chair). Pay or cancel them before the sales reading.');
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
  if (a === 'advbal') { P.advBal = t.value ? await api('GET', '/api/advances/balance?staffId=' + t.value) : null; return render(); }
  if (t.id === 'avstaff') { P.av.staffId = t.value; return; }
  if (t.id === 'avtype') { P.av.type = t.value; return; }
  if (t.id === 'avinst') { P.av.inst = t.value; return; }
  if (t.id === 'avconsent') { P.av.consent = t.checked; return; }
  if (a === 'rmdate' || t.id === 'rmdate') { P.rm.date = t.value || ymd(0); P.rm.proofId = ''; P.rm.preview = ''; refresh().then(render); return; }
  if (t.id === 'sffile') { const file = t.files[0]; if (!file || !P.sf) return; try { P.sf.data = await resizeToJpeg(file, 720); selfieSheet(); } catch (x) { toast('Could not read that photo. Please try again.', true); } return; }
  if (a === 'ckitem') { const i = +t.dataset.i; P.ck.items[i] = { ...(P.ck.items[i] || {}), done: t.checked, doneAt: t.checked ? new Date().toISOString() : '' }; return render(); }
  if (t.id === 'ckfile') { const file = t.files[0], i = P.ckTarget; if (!file || i === undefined) return; try { const data = await resizeToJpeg(file, 1000); const r = await api('POST', '/api/files', { data, kind: 'checklist', branchId: P.boot.branch.id }); P.ck.items[i] = { ...(P.ck.items[i] || {}), photoId: r.id, preview: data }; render(); } catch (x) { toast(x.message || 'Could not upload the photo.', true); } return; }
  if (t.id === 'lvstaff') { P.lvf.staffId = t.value; return; }
  if (t.id === 'lvtype') { P.lvf.type = t.value; return; }
  if (t.id === 'lvfrom') { P.lvf.from = t.value; return; }
  if (t.id === 'lvto') { P.lvf.to = t.value; return; }
  if (t.id === 'pbcat') { P.pb.category = t.value; return; }
  if (t.id === 'pbfile') {
    const file = t.files[0]; if (!file || !P.pb) return;
    try { const data = await resizeToJpeg(file, 1100); const r = await api('POST', '/api/files', { data, kind: 'problem', branchId: P.boot.branch.id }); P.pb.photos.push({ id: r.id, preview: data }); probSheet(); }
    catch (x) { toast(x.message || 'Could not upload the photo.', true); }
    return;
  }
  if (t.id === 'xcat') { P.ex.category = t.value; return; }
  if (t.id === 'xfile') {
    const file = t.files[0]; if (!file || !P.ex) return;
    try { const data = await resizeToJpeg(file, 1100); const r = await api('POST', '/api/files', { data, kind: 'receipt', branchId: P.boot.branch.id }); P.ex.receipts.push({ id: r.id, preview: data }); expSheet(); }
    catch (x) { toast(x.message || 'Could not upload the photo. Please try again.', true); }
    return;
  }
  if (t.id === 'rmfile') {
    const file = t.files[0]; if (!file) return;
    try { const data = await resizeToJpeg(file, 1100); const r = await api('POST', '/api/files', { data, kind: 'remit', branchId: P.boot.branch.id }); P.rm.proofId = r.id; P.rm.preview = data; render(); }
    catch (x) { toast(x.message || 'Could not upload the photo. Please try again.', true); }
    return;
  }
  if (t.id === 'idfile') { const file = t.files[0]; if (!file || !P.idDraft) return; try { P.idDraft.data = await resizeToJpeg(file, 1100); } catch (x) { return toast('Could not read that photo. Please try again.', true); } return idRender(); }
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
  if (t.dataset.ck !== undefined) { const i = +t.dataset.ck; P.ck.items[i] = { ...(P.ck.items[i] || {}), note: t.value }; return; }
  if (t.id === 'lvreason') { P.lvf.reason = t.value; return; }
  if (t.id === 'pbdesc') { P.pb.desc = t.value; return; }
  if (t.id === 'avamt') { P.av.amount = t.value; return; }
  if (t.id === 'avreason') { P.av.reason = t.value; return; }
  if (t.id === 'xdesc') { P.ex.desc = t.value; return; }
  if (t.id === 'xamt') { P.ex.amount = t.value; return; }
  if (t.id === 'xreason') { P.ex.reason = t.value; return; }
  if (t.id === 'rmactual' || t.id === 'rmresp' || t.id === 'rmnotes') {
    const m = P.rm; if (t.id === 'rmactual') m.actual = t.value; else if (t.id === 'rmresp') m.resp = t.value; else m.notes = t.value;
    const btn = document.querySelector('[data-a="rmsubmit"]'); if (btn) btn.disabled = !(m.proofId && m.actual !== '' && !m.busy);
    const box = document.getElementById('rmvar'); if (box && t.id === 'rmactual') { const v = Math.round((Number(m.actual) - m.calc.expected) * 100) / 100; box.style.display = m.actual === '' ? 'none' : ''; box.innerHTML = '<span>Difference</span><b style="color:' + (Math.abs(v) >= 1 ? 'var(--bad)' : 'var(--ok)') + '">' + (v > 0 ? '+' : '') + peso(v) + '</b>'; }
    return;
  }
  if (t.id === 'custq') { P.cust.q = t.value; clearTimeout(timer); timer = setTimeout(async () => { await refresh(); const i = document.getElementById('custq'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 300); }
});
sheet.addEventListener('close', () => render());
window.matchMedia('(min-width: 900px)').addEventListener('change', () => { closeSheet(); render(); });

(async () => {
  P.q = await OFF.all().catch(() => []);
  if (token) {
    try { const st = await api('GET', '/api/state'); P.me = st.me; P.shop = st.shop; P.branches = st.branches || []; P.mods = st.modules || Object.values(VMAP); if (isAdminRole()) P.branch = P.branches[0]?.id || ''; await refresh(); }
    catch (e) {
      let c = null; try { c = JSON.parse(localStorage.getItem('bp.cache') || 'null'); } catch (x) { }
      if (isNet(e) && c && c.me) { Object.assign(P, { me: c.me, shop: c.shop, branches: c.branches, mods: c.mods, boot: c.boot, att: c.att || [], branch: c.branch, offline: true }); P.view = canOpen('attendance') ? 'attendance' : firstView(); }   // opened without internet: work from the last saved roster
      else { token = ''; P.me = null; }
    }
  }
  render();
  window.addEventListener('online', () => syncQueue());
  setInterval(() => { if (P.q && P.q.length) syncQueue(); }, 30000); syncQueue();
  setInterval(() => { if (P.me && !document.hidden && !sheet.open && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) refresh(true); }, 10000);
})();


