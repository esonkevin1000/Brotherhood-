// Brotherhood customer app: discover barbers & shops, barber profiles, booking, history, verified reviews, and barber/owner pro tools.
const app = document.getElementById('app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const peso = n => '₱' + Number(n || 0).toLocaleString('en-PH');
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const t12 = t => { const [h, m] = String(t).split(':').map(Number); return `${h % 12 || 12}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}`; };
const initials = s => String(s || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const fmtDate = d => new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' });
const ICON = {
  home: '<path d="M3 11 12 3l9 8v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>', search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>', user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  heart: '<path d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z"/>', back: '<path d="m15 18-6-6 6-6"/>',
  pin: '<path d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>', check: '<path d="M20 6 9 17l-5-5"/>',
  ver: '<path d="M12 2 9.5 4.5 6 4.6 5.4 8 3 10.5 4.6 13.5 4 17l3.3 1.1L9.5 21l2.5-1.4 2.5 1.4 2.2-2.9L20 17l-.6-3.5L21 10.5 18.6 8 18 4.6l-3.5-.1z"/><path d="m8.5 12 2.5 2.5 4.5-5" stroke="#fff"/>',
  scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12"/>', plus: '<path d="M12 5v14M5 12h14"/>', bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 21a2 2 0 0 0 4 0"/>', chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>', team: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c2.5.6 4 2.2 4 5.2"/>'
};
const ic = n => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICON[n]}</svg>`;
const stars = n => '<span class="star">' + '★'.repeat(Math.round(n)) + '</span><span style="color:var(--line)">' + '★'.repeat(5 - Math.round(n)) + '</span>';
const pic = (url, name, cls = 'av') => url ? `<img class="${cls}" src="${esc(url)}" alt="${esc(name)}" loading="lazy">` : `<span class="${cls}">${esc(initials(name))}</span>`;
const rate = (a, n) => n ? `<span class="star">★</span> ${a.toFixed(1)} <span class="mute">(${n})</span>` : '<span class="mute sm">New</span>';
const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { } } };

const S = { token: store.get('bh_token'), user: null, favs: [], D: null, q: '', branch: '', specialty: '', avail: false, sort: 'best', tab: 'barbers', bk: null, mine: null, auth: { mode: 'login', err: '', busy: false }, err: '', pro: null, proToken: store.get('bh_pro'), proTab: 'dash', proPin: false, unread: 0, notifs: null, feed: null, feedScope: 'all', comp: { text: '', img: null, busy: false, err: '' }, open: {}, reports: null, dash: null, dashRange: 'week', toastMsg: '' };

async function api(path, opt = {}, token = S.token) {
  const r = await fetch('/api/bh' + path, { method: opt.method || 'GET', headers: { ...(opt.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: opt.body ? JSON.stringify(opt.body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error || 'Something went wrong'); e.code = r.status; throw e; }
  return j;
}
function toast(m) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), 2400); }
const nav = h => { location.hash = h; };
const route = () => { const [a, b, c] = (location.hash.slice(1) || '/').split('/').filter(Boolean); return { a: a || 'home', b, c }; };

// ---------- data ----------
async function loadDiscover() {
  const qs = new URLSearchParams({ q: S.q, branch: S.branch, specialty: S.specialty, available: S.avail ? '1' : '', sort: S.sort });
  S.D = await api('/discover?' + qs);
}
async function loadMe() {
  if (!S.token) { S.user = null; S.favs = []; return; }
  try { const j = await api('/me'); S.user = j.user; S.favs = j.favorites; S.unread = j.unread || 0; } catch (e) { if (e.code === 401) { S.token = null; store.set('bh_token', null); S.user = null; } }
}
async function loadBookings() { if (!S.token) { S.mine = null; return; } try { S.mine = (await api('/bookings')).bookings; } catch { S.mine = []; } }

// ---------- views ----------
const header = (title, back) => `<div class="bar">${back ? `<button class="btn sec sm" data-go="${back}" aria-label="Back">${ic('back')}</button>` : ''}<div class="${title ? '' : 'logo'}">${title ? `<h2 style="font-size:20px">${esc(title)}</h2>` : 'Brother<b>hood</b>'}</div><span class="sp"></span>${S.user ? `<button class="btn sec sm bellb" data-go="/notifications" aria-label="Notifications">${ic('bell')}${S.unread ? `<span class="badge">${S.unread > 9 ? '9+' : S.unread}</span>` : ''}</button><button class="btn sec sm" data-go="/me">${esc(S.user.name.split(' ')[0])}</button>` : `<button class="btn sm" data-go="/auth">Log in</button>`}</div>`;
const barberRow = b => `<button class="bcard" data-go="/barber/${b.id}">${pic(b.photo, b.name)}<div class="sp"><div class="nm">${esc(b.name)}${b.verified ? `<span class="ver" title="Verified professional">${ic('ver')}</span>` : ''}</div>
  <div class="sm mute">${esc(b.headline || b.specialties.join(' · ') || 'Barber')} · ${esc(b.branchName)}</div><div class="sm row" style="margin-top:3px;flex-wrap:wrap;gap:6px">${rate(b.rating, b.reviews)}${b.years ? `<span class="mute">· ${b.years} yrs</span>` : ''}${b.slotsToday ? `<span class="tag ok">${b.slotsToday} slots today</span>` : ''}</div></div></button>`;
const shopCard = s => `<button class="shop" data-shop="${s.id}">${s.photo ? `<img src="${esc(s.photo)}" alt="${esc(s.name)}" loading="lazy">` : ''}<div class="in"><div class="nm">${esc(s.name)}</div>
  <div class="sm mute">${ic('pin').replace('class="i"', 'class="i" style="width:14px;height:14px;vertical-align:-2px"')} ${esc(s.address || s.name)} · ${t12(s.openTime)}–${t12(s.closeTime)}</div><div class="sm" style="margin-top:2px">${rate(s.rating, s.reviews)} <span class="mute">· ${s.barbers} barbers</span></div></div></button>`;

function vHome() {
  const D = S.D, up = (S.mine || []).filter(b => b.status === 'booked' && b.date >= ymd(new Date())).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
  return header() + `<div class="hero pop"><h1>More than a haircut.<br>It's a brotherhood.</h1><p>Find your barber. Book in seconds. Always free for customers.</p><button class="btn" data-go="/discover">${ic('search')} Find a barber</button></div>
  ${installCard()}${up ? `<div class="card pop" style="margin-bottom:6px"><div class="sm mute">YOUR NEXT CUT</div><div class="nm" style="margin-top:4px">${fmtDate(up.date)} · ${t12(up.time)}</div><div class="sm mute">${esc(up.items.map(i => i.name).join(' + '))} with ${esc(up.staffName)} · ${esc(up.branchName)}</div></div>` : ''}
  <button class="bcard" data-go="/style" style="margin-top:6px"><span class="av" style="background:var(--s2)">${ic('scissors')}</span><div class="sp"><div class="nm">Find your cut</div><div class="sm mute">Pick your face shape and get cut ideas to show your barber</div></div></button>
  <div class="sec-h"><h2>Top barbers</h2><button class="link" data-go="/discover">See all</button></div>
  <div class="list">${D ? D.barbers.slice(0, 5).map(barberRow).join('') || '<div class="empty">No barbers yet.</div>' : '<div class="empty">Loading…</div>'}</div>
  <div class="sec-h"><h2>Our shops</h2><button class="link" data-go="/map">View map</button></div><div class="list">${D ? D.shops.map(shopCard).join('') : ''}</div>`;
}
function vDiscover() {
  const D = S.D;
  const brChips = D ? [['', 'All shops'], ...D.shops.map(s => [s.id, s.name])] : [];
  return header('Discover') + `<div class="search">${ic('search')}<input id="q" placeholder="Search barber, shop or style" value="${esc(S.q)}" autocomplete="off"></div>
  <div class="chips" style="margin-top:10px"><button class="chip ${S.avail ? 'on' : ''}" data-avail>Available today</button>${brChips.map(([id, n]) => `<button class="chip ${S.branch === id ? 'on' : ''}" data-branchf="${id}">${esc(n)}</button>`).join('')}</div>
  ${D && D.specialties.length ? `<div class="chips">${D.specialties.map(s => `<button class="chip ${S.specialty === s ? 'on' : ''}" data-spec="${esc(s)}">${esc(s)}</button>`).join('')}</div>` : ''}
  <div class="row"><div class="tabs sp"><button class="${S.tab === 'barbers' ? 'on' : ''}" data-tab="barbers">Barbers</button><button class="${S.tab === 'shops' ? 'on' : ''}" data-tab="shops">Shops</button><button data-go="/map">Map</button></div>
  ${S.tab === 'barbers' ? `<select id="sort" style="width:auto"><option value="best" ${S.sort === 'best' ? 'selected' : ''}>Best match</option><option value="rating" ${S.sort === 'rating' ? 'selected' : ''}>Top rated</option><option value="experience" ${S.sort === 'experience' ? 'selected' : ''}>Experience</option><option value="name" ${S.sort === 'name' ? 'selected' : ''}>Name</option></select>` : ''}</div>
  <div class="list" id="results">${!D ? '<div class="empty">Loading…</div>' : S.tab === 'barbers' ? (D.barbers.map(barberRow).join('') || '<div class="empty">No barbers match. Try different filters.</div>') : (D.shops.map(shopCard).join('') || '<div class="empty">No shops match.</div>')}</div>`;
}
async function vBarber(id) {
  let j; try { j = await api('/barber' + 's/' + id, {}, S.token); } catch (e) { return header('', '/discover') + `<div class="err">${esc(e.message)}</div>`; }
  const b = j.barber, fav = S.favs.includes(b.id) || j.favorite;
  const soc = [['instagram', 'Instagram'], ['facebook', 'Facebook'], ['tiktok', 'TikTok']].filter(([k]) => b[k]).map(([k, n]) => { const v = b[k], href = /^https?:/i.test(v) ? v : (k === 'instagram' ? 'https://instagram.com/' : k === 'tiktok' ? 'https://tiktok.com/@' : 'https://facebook.com/') + v.replace(/^@/, ''); return `<a class="tag" href="${esc(href)}" target="_blank" rel="noopener">${n}</a>`; }).join('');
  S.cur = j;
  return `<div class="cover"></div><div class="bar" style="margin-top:-110px;background:none"><button class="btn sec sm" data-go="/discover">${ic('back')}</button><span class="sp"></span><button class="btn sec sm heart ${fav ? 'on' : ''}" data-fav="${b.id}" aria-label="Favorite">${ic('heart')}</button></div>
  <div style="margin-top:20px;display:flex;gap:14px;align-items:flex-end">${pic(b.photo, b.name, 'av lg')}<div><h1 style="font-size:26px" class="row">${esc(b.name)}${b.verified ? `<span class="ver">${ic('ver')}</span>` : ''}</h1><div class="mute sm">${esc(b.headline || 'Barber')} · ${esc(b.branchName)}</div><div style="margin-top:4px">${rate(b.rating, b.reviews)}${b.verifiedReviews ? ` <span class="tag ok">${b.verifiedReviews} verified</span>` : ''}</div></div></div>
  <div class="pill-row" style="margin:14px 0">${b.years ? `<span class="tag">${b.years} yrs experience</span>` : ''}${b.specialties.map(s => `<span class="tag">${esc(s)}</span>`).join('')}${soc}</div>
  ${b.bio ? `<p class="mute" style="margin:0 0 6px">${esc(b.bio)}</p>` : ''}
  <div class="card row" style="margin-top:10px">${ic('pin')}<div class="sp sm"><b>${esc(j.branch.name)}</b><br><span class="mute">${esc(j.branch.address || '')} · ${t12(j.branch.openTime)}–${t12(j.branch.closeTime)}</span></div>${/^https?:\/\//i.test(j.branch.mapUrl) ? `<a class="btn sec sm" href="${esc(j.branch.mapUrl)}" target="_blank" rel="noopener">Map</a>` : ''}</div>
  <div class="sec-h"><h2>Portfolio</h2><span class="mute sm">${j.portfolio.length} photos</span></div>
  ${j.portfolio.length ? `<div class="grid3">${j.portfolio.map(p => `<img src="${esc(p.url)}" alt="${esc(p.caption || 'Haircut by ' + b.name)}" data-lb="${esc(p.url)}" loading="lazy">`).join('')}</div>` : '<div class="card empty">This barber has not added portfolio photos yet.</div>'}
  <div class="sec-h"><h2>Services</h2></div><div class="list">${j.services.map(s => `<div class="card row">${s.photo ? `<img src="${esc(s.photo)}" style="width:48px;height:48px;border-radius:10px;object-fit:cover" alt="">` : ''}<div class="sp"><div class="nm">${esc(s.name)}</div><div class="sm mute">${s.mins || 30} min</div></div><b class="num" style="font-size:18px">${peso(s.price)}</b></div>`).join('')}</div>
  <div class="sec-h"><h2>Reviews</h2></div><div class="list">${j.reviews.length ? j.reviews.map(r => `<div class="card"><div class="row"><b>${esc(r.name)}</b>${r.verified ? `<span class="tag ok">Verified visit</span>` : ''}<span class="sp"></span><span class="sm mute">${new Date(r.createdAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</span></div><div>${stars(r.rating)}</div>${r.text ? `<p style="margin:6px 0 0">${esc(r.text)}</p>` : ''}${replyBox(r)}</div>`).join('') : '<div class="card empty">No reviews yet. Be the first after your cut.</div>'}</div>
  <div class="foot"><div><div class="sp"><div class="sm mute">Book with</div><b>${esc(b.name)}</b></div><button class="btn" data-book="${b.id}" style="min-width:150px">${ic('cal')} Book now</button></div></div>`;
}

// ----- booking -----
function startBooking(branchId, staffId) {
  S.bk = { branchId, staffId: staffId || 'any', items: [], date: ymd(new Date()), time: '', slots: null, notes: S.styleNote || '', err: '', busy: false, done: null };
  nav('/book');
}
async function loadSlots() {
  const k = S.bk; if (!k.items.length) { k.slots = null; return render(); }
  k.time = ''; k.slots = null; render();
  try { k.slots = (await (await fetch(`/api/public/slots?branch=${k.branchId}&date=${k.date}&staff=${k.staffId}&items=${k.items.join(',')}`)).json()).slots; } catch { k.slots = []; }
  render();
}
function vBook() {
  const k = S.bk, D = S.D; if (!k || !D) { setTimeout(() => nav('/discover')); return ''; }
  const br = D.shops.find(s => s.id === k.branchId), team = D.barbers.filter(b => b.branchId === k.branchId), days = Array.from({ length: 14 }, (_, i) => new Date(Date.now() + i * 864e5));
  if (k.done) return header('Booked!') + `<div class="ok pop"><b>You're booked, ${esc(S.user.name.split(' ')[0])}!</b><br>${fmtDate(k.done.date)} at ${t12(k.done.time)} · ${esc(k.done.branch)}<br>${esc(k.done.items.map(i => i.name).join(' + '))} with ${esc(k.done.staff)} · ${peso(k.done.total)}<br><span class="sm">Pay at the shop. Cancel up to 1 hour before.</span></div><button class="btn block" data-go="/bookings">View my bookings</button>`;
  const total = D.services.filter(s => k.items.includes(s.id)).reduce((t, s) => t + s.price, 0);
  return header('Book a cut', k.staffId !== 'any' ? '/barber/' + k.staffId : '/discover') + `<div class="card row">${ic('pin')}<div class="sp"><b>${esc(br?.name || '')}</b><div class="sm mute">${esc(br?.address || '')}</div></div></div>
  <div class="sec-h"><h2>1 · Barber</h2></div><div class="chips"><button class="chip ${k.staffId === 'any' ? 'on' : ''}" data-bstaff="any">Any available</button>${team.map(b => `<button class="chip ${k.staffId === b.id ? 'on' : ''}" data-bstaff="${b.id}">${esc(b.name)}</button>`).join('')}</div>
  <div class="sec-h"><h2>2 · Service</h2></div><div class="list">${D.services.map(s => `<button class="svc ${k.items.includes(s.id) ? 'on' : ''}" data-bsvc="${s.id}">${s.photo ? `<img src="${esc(s.photo)}" alt="">` : ''}<div class="sp" style="text-align:left"><div class="nm">${esc(s.name)}</div><div class="sm mute">${s.mins || 30} min</div></div><b class="num">${peso(s.price)}</b><span class="chk">${k.items.includes(s.id) ? ic('check') : ''}</span></button>`).join('')}</div>
  <div class="sec-h"><h2>3 · Date</h2></div><div class="days">${days.map(d => `<button class="day ${k.date === ymd(d) ? 'on' : ''}" data-bday="${ymd(d)}"><span class="sm">${d.toLocaleDateString('en-PH', { weekday: 'short' })}</span><b>${d.getDate()}</b><span class="sm">${d.toLocaleDateString('en-PH', { month: 'short' })}</span></button>`).join('')}</div>
  <div class="sec-h"><h2>4 · Time</h2></div>${!k.items.length ? '<div class="mute sm">Pick a service first.</div>' : k.slots === null ? '<div class="mute sm">Checking availability…</div>' : k.slots.length ? `<div class="slots">${k.slots.map(t => `<button class="slot ${k.time === t ? 'on' : ''}" data-btime="${t}">${t12(t)}</button>`).join('')}</div>` : `<div class="card empty">No open slots that day. Try another date or barber.<div style="margin-top:10px"><button class="btn sec sm" data-wl>Notify me if a slot opens</button></div></div>`}
  ${(S.user?.styles || []).length ? `<div class="sm mute" style="margin-top:14px">Add a saved style to your notes</div><div class="chips">${S.user.styles.map(cutById).filter(Boolean).map(c => `<button class="chip" data-snote="${c.id}">${esc(c.name)}</button>`).join('')}</div>` : ''}
  <label class="f">Notes for your barber (optional)<textarea id="bnotes" rows="2" maxlength="300" placeholder="Reference cut, allergies, anything we should know">${esc(k.notes)}</textarea></label>
  ${k.err ? `<div class="err">${esc(k.err)}</div>` : ''}
  <div class="foot"><div><div class="sp"><div class="sm mute">Total · pay at the shop</div><b class="num" style="font-size:22px">${peso(total)}</b></div><button class="btn" data-confirm style="min-width:160px" ${k.items.length && k.time && !k.busy ? '' : 'disabled'}>${k.busy ? 'Booking…' : 'Confirm booking'}</button></div></div>`;
}
async function confirmBooking() {
  const k = S.bk; k.busy = true; k.err = ''; render();
  try { const j = await api('/book', { method: 'POST', body: { branchId: k.branchId, staffId: k.staffId, itemIds: k.items, date: k.date, time: k.time, notes: k.notes } }); k.done = j.booking; S.mine = null; S.styleNote = ''; }
  catch (e) { k.err = e.message; if (/no longer available/i.test(e.message)) loadSlots(); }
  k.busy = false; render();
}

// ----- bookings -----
function vBookings() {
  if (!S.token) return header('Bookings') + `<div class="empty">${ic('cal')}<p>Log in to see your bookings.</p><button class="btn" data-go="/auth">Log in or sign up</button></div>`;
  if (!S.mine) return header('Bookings') + '<div class="empty">Loading…</div>';
  const today = ymd(new Date()), up = S.mine.filter(b => b.status === 'booked' && b.date >= today).reverse(), past = S.mine.filter(b => !up.includes(b));
  const card = b => `<div class="card pop"><div class="row"><b>${fmtDate(b.date)} · ${t12(b.time)}</b><span class="sp"></span><span class="tag ${b.status === 'booked' ? 'on' : b.status === 'cancelled' || b.status === 'noshow' ? 'bad' : 'ok'}">${b.status === 'arrived' ? 'completed' : b.status === 'noshow' ? 'no-show' : esc(b.status)}</span></div>
    <div class="sm mute">${esc(b.items.map(i => i.name).join(' + '))} · ${peso(b.total)}</div><div class="sm mute">${esc(b.staffName || 'Any barber')} · ${esc(b.branchName)}</div>
    <div class="row" style="margin-top:10px;flex-wrap:wrap">${b.canCancel ? `<button class="btn danger sm" data-cancel="${b.id}">Cancel</button>` : ''}${b.canReview ? `<button class="btn sm" data-review="${b.id}">Rate your cut</button>` : ''}${b.reviewed ? '<span class="tag ok">Reviewed</span>' : ''}${b.status !== 'booked' ? `<button class="btn sec sm" data-rebook="${b.id}">Book again</button>` : ''}</div></div>`;
  const wl = (S.wait || []).length ? `<div class="sec-h"><h2>Waitlist</h2></div><div class="list">${S.wait.map(w => `<div class="card row"><div class="sp"><b>${fmtDate(w.date)}</b><div class="sm mute">${esc(w.staffName || 'Any barber')} · ${esc(w.branchName)} · we will notify you if a slot opens</div></div><button class="btn danger sm" data-wldel="${w.id}">Remove</button></div>`).join('')}</div>` : '';
  return header('My bookings') + wl + `<div class="sec-h"><h2>Upcoming</h2></div><div class="list">${up.map(card).join('') || '<div class="card empty">Nothing booked. <button class="link" data-go="/discover">Find a barber</button></div>'}</div>
  <div class="sec-h"><h2>History</h2></div><div class="list">${past.map(card).join('') || '<div class="card empty">Your past visits will show here.</div>'}</div>`;
}

// ----- auth / profile -----
function vAuth() {
  const a = S.auth, su = a.mode === 'signup';
  return header('', '/') + `<div class="hero"><h1>${su ? 'Join the brotherhood' : 'Welcome back'}</h1><p>${su ? 'Free for customers. Book, review and save your favorite barbers.' : 'Log in to book and manage your visits.'}</p></div>
  <form id="authf" autocomplete="on">${su ? '<label class="f">Full name<input name="name" autocomplete="name" required></label>' : ''}<label class="f">Email<input name="email" type="email" autocomplete="email" required autocapitalize="off" autocorrect="off" spellcheck="false"></label>
  ${su ? '<label class="f">Mobile number<input name="phone" type="tel" autocomplete="tel" placeholder="09XX XXX XXXX" required></label>' : ''}
  <label class="f">Password${su ? ' (8+ characters)' : ''}<input name="password" type="password" autocomplete="${su ? 'new-password' : 'current-password'}" minlength="${su ? 8 : 1}" required></label>
  ${su ? '<label class="f row" style="align-items:flex-start"><input type="checkbox" name="agree" style="width:auto;margin-top:4px" required><span style="margin:0">I agree to the Terms and the Privacy Notice (Data Privacy Act of 2012). My details are used only for my bookings and account.</span></label>' : ''}
  ${a.err ? `<div class="err">${esc(a.err)}</div>` : ''}<button class="btn block" style="margin-top:16px" ${a.busy ? 'disabled' : ''}>${su ? 'Create account' : 'Log in'}</button></form>
  <p class="mute" style="text-align:center">${su ? 'Already a member?' : 'New here?'} <button class="link" data-authmode="${su ? 'login' : 'signup'}">${su ? 'Log in' : 'Create an account'}</button></p>
  <p class="mute sm" style="text-align:center;margin-top:24px">Barber or shop owner? <button class="link" data-go="/pro">Sign in to pro tools</button></p>`;
}
function vMe() {
  if (!S.user) { setTimeout(() => nav('/auth')); return ''; }
  const u = S.user, favs = S.D ? S.D.barbers.filter(b => S.favs.includes(b.id)) : [];
  return header('Profile', '/') + `<div class="card row"><span class="av">${esc(initials(u.name))}</span><div class="sp"><b>${esc(u.name)}</b><div class="sm mute">${esc(u.email)}</div></div></div>
  <div class="sec-h"><h2>Favorite barbers</h2></div><div class="list">${favs.map(barberRow).join('') || '<div class="card empty">Tap the heart on a barber to save them.</div>'}</div>
  <div class="sec-h"><h2>Saved styles</h2><button class="link" data-go="/style">Style finder</button></div><div class="pill-row">${(u.styles || []).map(id => cutById(id)).filter(Boolean).map(c => `<span class="tag">${esc(c.name)}</span>`).join('') || '<span class="mute sm">None yet. Try the Style finder.</span>'}</div>
  <div class="sec-h"><h2>My details</h2></div><form id="mef">${S.meMsg ? `<div class="${S.meMsg.ok ? 'ok' : 'err'}">${esc(S.meMsg.t)}</div>` : ''}<label class="f">Name<input name="name" value="${esc(u.name)}" required></label><label class="f">Mobile<input name="phone" type="tel" value="${esc(u.phone)}" required></label><label class="f">City<input name="city" value="${esc(u.city)}" placeholder="e.g. San Pablo"></label><button class="btn block" style="margin-top:14px">Save</button></form>
  <div class="sec-h"><h2>For barbers & owners</h2></div><div class="card"><p class="mute sm" style="margin-top:0">Manage your professional profile and portfolio with your Brotherhood staff login.</p><button class="btn sec block" data-go="/pro">Open pro tools</button></div>
  <div class="sec-h"><h2>Account</h2></div><div class="list"><button class="btn ghost block" data-logout>Log out</button><details class="card"><summary>Delete my account</summary><p class="sm mute">This removes your account and favorites. Shop booking records stay with the shop but are unlinked from you.</p><input id="delpw" type="password" placeholder="Confirm password"><button class="btn danger block" style="margin-top:10px" data-delete>Delete account</button></details></div>`;
}

// ----- pro tools -----
async function loadPro() { try { S.pro = await api('/pro/me', {}, S.proToken); S.proErr = ''; } catch (e) { S.pro = null; S.proErr = e.message; if (e.code === 401) { S.proToken = null; store.set('bh_pro', null); } } }
function vPro() {
  if (!S.proToken || !S.pro) return header('Pro tools', '/') + `<p class="mute">Sign in with your Brotherhood staff username and password (same as the POS / back office).</p><form id="prolf">${S.proPin ? '<label class="f">6-digit PIN<input name="pin" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required></label>' : '<label class="f">Username (owners may leave this blank)<input name="username" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false"></label><label class="f">Password<input name="password" type="password" autocomplete="current-password" required></label>'}${S.proErr ? `<div class="err">${esc(S.proErr)}</div>` : ''}<button class="btn block" style="margin-top:14px">Sign in</button><p class="mute sm" style="text-align:center"><button type="button" class="link" data-proPin>${S.proPin ? 'Use username and password instead' : 'Barber or cashier? Sign in with your 6-digit PIN'}</button></p></form>`;
  const sel = S.pro.staff.find(s => s.id === S.proSel) || S.pro.staff[0]; S.proSel = sel?.id;
  if (!sel) return header('Pro tools', '/') + '<div class="empty">No barbers found.</div>';
  return header('Pro tools', '/') + `${S.pro.admin && !['shop', 'mod'].includes(S.proTab) ? `<label class="f">Barber<select id="prosel">${S.pro.staff.map(s => `<option value="${s.id}" ${s.id === sel.id ? 'selected' : ''}>${esc(s.name)} · ${esc(s.branchName)}</option>`).join('')}</select></label>` : ''}
  <div class="tabs">${S.pro.admin ? `<button class="${S.proTab === 'shop' ? 'on' : ''}" data-ptab="shop">Shop</button>` : ''}<button class="${S.proTab === 'dash' ? 'on' : ''}" data-ptab="dash">${S.pro.admin ? 'Barber' : 'Dashboard'}</button><button class="${S.proTab === 'profile' ? 'on' : ''}" data-ptab="profile">Profile</button><button class="${S.proTab === 'port' ? 'on' : ''}" data-ptab="port">Portfolio</button>${S.pro.admin ? `<button class="${S.proTab === 'mod' ? 'on' : ''}" data-ptab="mod">Moderation</button>` : ''}</div>
  ${S.proTab === 'shop' && S.pro.admin ? vOwner() : ''}${S.proTab === 'dash' ? vDash() : ''}${S.proTab === 'mod' ? vMod() : ''}<div ${S.proTab === 'profile' ? '' : 'hidden'}><div class="sec-h"><h2>Professional profile</h2></div><form id="prof">${S.proMsg ? `<div class="${S.proMsg.ok ? 'ok' : 'err'}">${esc(S.proMsg.t)}</div>` : ''}
  <label class="f">Headline<input name="headline" maxlength="80" value="${esc(sel.headline)}" placeholder="e.g. Fade specialist"></label><label class="f">About<textarea name="bio" rows="3" maxlength="600">${esc(sel.bio)}</textarea></label>
  <label class="f">Years of experience<input name="years" type="number" min="0" max="60" value="${sel.years || ''}"></label><label class="f">Specialties (comma separated)<input name="specialties" value="${esc(sel.specialties.join(', '))}" placeholder="Skin Fade, Taper, Pompadour"></label>
  <label class="f">Instagram<input name="instagram" value="${esc(sel.instagram)}" placeholder="@handle or link"></label><label class="f">Facebook<input name="facebook" value="${esc(sel.facebook)}"></label><label class="f">TikTok<input name="tiktok" value="${esc(sel.tiktok)}"></label>
  ${S.pro.admin ? `<label class="f row"><input type="checkbox" name="verified" style="width:auto" ${sel.verified ? 'checked' : ''}><span style="margin:0">Verified professional (owner only)</span></label>` : ''}<button class="btn block" style="margin-top:14px">Save profile</button></form></div>
  <div ${S.proTab === 'port' ? '' : 'hidden'}><div class="sec-h"><h2>Portfolio</h2><label class="btn sm" style="cursor:pointer">${ic('plus')} Add photos<input type="file" id="pfile" accept="image/*" multiple hidden></label></div>
  <div class="grid3">${sel.portfolio.map(p => `<div style="position:relative"><img src="${esc(p.url)}" alt="" data-lb="${esc(p.url)}"><button class="btn sm danger" style="position:absolute;right:4px;top:4px;padding:2px 8px;background:var(--bg)" data-pdel="${p.id}">✕</button></div>`).join('')}</div>${sel.portfolio.length ? '' : '<div class="card empty">Add your best cuts. Customers choose barbers by their work.</div>'}</div>
  <button class="btn ghost block" style="margin-top:22px" data-prologout>Sign out of pro tools</button>`;
}

const kpi = (l, v, sub = '') => `<div class="card" style="padding:12px"><div class="sm mute">${l}</div><div class="num" style="font-size:26px">${v}</div>${sub ? `<div class="sm mute">${sub}</div>` : ''}</div>`;
function vDash() {
  const d = S.dash; const per = `<div class="tabs">${[['today', 'Today'], ['week', 'This week'], ['month', 'This month'], ['all', 'All time']].map(([k, n]) => `<button class="${S.dashRange === k ? 'on' : ''}" data-drange="${k}" style="font-size:13px;padding:9px 2px;white-space:nowrap">${n}</button>`).join('')}</div>`;
  if (!d) return per + '<div class="empty">Loading…</div>';
  const m = d.metrics, today = ymd(new Date()), e = S.earn;
  return per + `<div class="grid2" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${kpi('Haircuts', m.haircuts, `${m.daysWorked} days worked`)}${kpi('Revenue', peso(m.revenue), `avg ${peso(m.avgService)}`)}${kpi('Commission', peso(m.commission), 'earned this period')}${kpi('Rating', m.reviews ? m.rating.toFixed(1) + ' ★' : '—', `${m.reviews} review${m.reviews === 1 ? '' : 's'}`)}${kpi('Retention', m.retention + '%', `${m.clients} clients served`)}${kpi('Rebooking', d.clients.length ? m.rebooking + '%' : '—', 'clients with 2+ visits')}</div>
  ${e ? `<div class="card" style="margin-top:10px"><div class="sm mute">MY PAY · NOT YET PAID OUT</div><div class="num" style="font-size:28px">${peso(e.unpaid.net)}</div><div class="sm mute">${e.unpaid.days} day${e.unpaid.days === 1 ? '' : 's'} · commission ${peso(e.unpaid.commission)}${e.unpaid.bonus ? ' · bonus ' + peso(e.unpaid.bonus) : ''}${e.unpaid.advance ? ' · advance −' + peso(e.unpaid.advance) : ''}</div><div class="sm" style="margin-top:6px">Today: ${e.today.cuts} cut${e.today.cuts === 1 ? '' : 's'} · ${peso(e.today.commission)}</div></div>` : ''}
  <div class="sec-h"><h2>Appointments · next 7 days</h2></div><div class="list">${d.appointments.map(a => `<div class="card"><div class="row"><b>${a.date === today ? 'Today' : fmtDate(a.date)} · ${t12(a.time)}</b><span class="sp"></span><span class="tag ${a.status === 'arrived' ? 'ok' : 'on'}">${a.status === 'arrived' ? 'arrived' : 'booked'}</span></div><div>${esc(a.customer)}${a.phone ? ` <a class="sm" style="color:var(--blue)" href="tel:${esc(a.phone)}">${esc(a.phone)}</a>` : ''}</div><div class="sm mute">${esc(a.items.join(' + '))} · ${a.mins} min · ${peso(a.total)}</div>${a.notes ? `<div class="sm" style="margin-top:4px">“${esc(a.notes)}”</div>` : ''}</div>`).join('') || '<div class="card empty">No appointments in the next 7 days.</div>'}</div>
  <div class="sec-h"><h2>My clients</h2><span class="mute sm">${d.clients.length}</span></div><div class="list">${d.clients.slice(0, 50).map(c => `<div class="card row"><span class="av" style="width:42px;height:42px;font-size:14px">${esc(initials(c.name))}</span><div class="sp"><div class="nm">${esc(c.name)}${c.visits >= 5 ? '<span class="tag">Regular</span>' : ''}</div><div class="sm mute">${c.visits} visit${c.visits === 1 ? '' : 's'} · last ${fmtDate(c.last)}${c.phone ? ' · ' + esc(c.phone) : ''}</div></div><b class="num">${peso(c.spent)}</b></div>`).join('') || '<div class="card empty">Clients appear here after their first paid visit with you.</div>'}</div>
  <div class="sec-h"><h2>Latest reviews</h2></div><div class="list">${d.recentReviews.map(r => `<div class="card"><div class="row"><b>${esc(r.name)}</b>${r.verified ? '<span class="tag ok">Verified visit</span>' : ''}<span class="sp"></span>${stars(r.rating)}</div>${r.text ? `<p style="margin:6px 0 0">${esc(r.text)}</p>` : ''}${r.reply ? `<div class="sm" style="margin-top:8px;padding:8px 10px;border-left:3px solid var(--blue);background:var(--s3);border-radius:8px"><b>Your reply</b><div>${esc(r.reply)}</div></div>` : ''}<button class="btn sec sm" style="margin-top:8px" data-rreply="${r.id}" data-cur="${esc(r.reply || '')}">${r.reply ? 'Edit reply' : 'Reply'}</button></div>`).join('') || '<div class="card empty">No reviews yet.</div>'}</div>`;
}

function vOwner() {
  const d = S.shopData; if (!d) return '<div class="empty">Loading…</div>';
  const t = d.totals;
  return `<div class="row" style="margin-bottom:12px;gap:10px"><a class="btn block" href="/pos" style="flex:1">${ic('scissors')} Open POS</a><a class="btn sec block" href="/backend" style="flex:1">Back office</a></div>
  <div class="grid2" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${kpi('Sales today', peso(t.today), `${t.transactions} transactions`)}${kpi('Sales · 7 days', peso(t.week))}${kpi('Bookings today', t.bookings)}${kpi('Queue now', t.waiting + t.cutting, `${t.waiting} waiting · ${t.cutting} cutting`)}</div>
  <div class="sec-h"><h2>Branches</h2><span class="mute sm">${t.onDuty} barbers on duty</span></div><div class="list">${d.branches.map(b => `<div class="card"><div class="row"><b>${esc(b.name)}</b><span class="sp"></span><b class="num" style="font-size:20px">${peso(b.today)}</b></div><div class="sm mute">${b.todayCount} transactions today · 7 days ${peso(b.week)}</div><div class="sm" style="margin-top:4px"><span class="tag">${b.onDuty} on duty</span> <span class="tag">${b.waiting} waiting</span> <span class="tag">${b.cutting} cutting</span> <span class="tag">${b.bookings} bookings</span></div></div>`).join('')}</div>
  <div class="sec-h"><h2>Map pins</h2><span class="mute sm">${d.branches.filter(b => b.lat != null).length}/${d.branches.length} set</span></div><div>${d.branches.map(locEditor).join('')}</div>
  <div class="sec-h"><h2>Brotherhood app</h2></div><div class="card sm"><b>${d.members}</b> app members${d.openReports ? ` · <button class="link" data-ptab="mod">${d.openReports} reported item${d.openReports === 1 ? '' : 's'} to review</button>` : ' · nothing to review'}</div>`;
}

const locEditor = b => `<details class="card" style="margin-top:6px;padding:10px"><summary class="sm">${b.lat != null ? '📍 Pin set' : '⚠ No map pin yet'} · ${esc(b.name)}</summary><div style="margin-top:8px">
  <label class="f" style="margin-top:0">Google Maps link<input id="lu-${b.id}" value="${esc(b.mapUrl || '')}" placeholder="Paste the shop's Google Maps link" autocapitalize="off" autocorrect="off" spellcheck="false"></label>
  <button class="btn sec sm block" style="margin-top:8px" data-locurl="${b.id}">Detect location from link</button>
  <div class="row" style="margin-top:10px"><input id="la-${b.id}" inputmode="decimal" placeholder="Latitude" value="${b.lat ?? ''}"><input id="ln-${b.id}" inputmode="decimal" placeholder="Longitude" value="${b.lng ?? ''}"></div>
  ${b.lat != null ? `<a class="link" style="display:inline-block;margin-top:8px" href="https://www.google.com/maps?q=${b.lat},${b.lng}" target="_blank" rel="noopener">Check this pin on Google Maps (${Number(b.lat).toFixed(5)}, ${Number(b.lng).toFixed(5)})</a>` : ''}
  <div class="row" style="margin-top:8px"><button class="btn sec sm sp" data-locgps="${b.id}">◎ Use my current location</button><button class="btn sm sp" data-locsave="${b.id}">Save pin</button></div></div></details>`;
async function saveLoc(id, body) {
  try { const j = await api('/pro/branch-location', { method: 'PUT', body: { branchId: id, ...body } }, S.proToken); toast('Map pin saved'); S.D = null; await loadShopOwner(); return j; } catch (x) { toast(x.message); }
}
async function loadShopOwner() { try { S.shopData = await api('/pro/shop', {}, S.proToken); } catch (e) { S.shopData = null; toast(e.message); } render(); }
async function loadDash() {
  S.dash = null; S.earn = null; if (!S.pro || !S.proSel) return;
  try { S.dash = await api(`/pro/dashboard?staffId=${S.proSel}&range=${S.dashRange}`, {}, S.proToken); } catch (e) { S.dash = null; toast(e.message); }
  if (!S.pro.admin) { try { S.earn = await (await fetch('/api/me/earnings', { headers: { Authorization: 'Bearer ' + S.proToken } })).json(); if (!S.earn.unpaid) S.earn = null; } catch { S.earn = null; } }
  render();
}



// ----- Style Finder (rule-based recommendations; not AI and not a guaranteed result) -----
const FACES = [['oval', 'Oval', 'Face is longer than wide, jaw slightly narrower than the forehead. Most cuts work.'], ['round', 'Round', 'Width and length are similar, soft jaw and full cheeks.'], ['square', 'Square', 'Strong, angular jaw; forehead and jaw about the same width.'],
  ['heart', 'Heart', 'Wide forehead, narrower chin.'], ['oblong', 'Oblong', 'Long face, forehead, cheeks and jaw similar width.'], ['diamond', 'Diamond', 'Cheekbones widest, narrower forehead and jaw.']];
const HAIRS = [['straight', 'Straight'], ['wavy', 'Wavy'], ['curly', 'Curly'], ['coily', 'Coily / very thick']];
const CUTS = [
  { id: 'low-fade', name: 'Low Fade', face: ['oval', 'square', 'oblong', 'heart'], hair: ['straight', 'wavy', 'curly', 'coily'], care: 1, top: 'Short to medium', sides: 'Low fade, starts above the ears', style: 'Matte clay or light pomade', every: '3-4 weeks', note: 'Clean and easy. A safe first fade.' },
  { id: 'mid-fade', name: 'Mid Fade', face: ['oval', 'round', 'square', 'diamond'], hair: ['straight', 'wavy', 'curly', 'coily'], care: 2, top: 'Short to medium', sides: 'Mid fade at the temple', style: 'Texture powder or clay', every: '2-3 weeks', note: 'Balanced contrast that suits most faces.' },
  { id: 'high-fade', name: 'High Fade', face: ['oval', 'oblong', 'diamond'], hair: ['straight', 'wavy', 'curly', 'coily'], care: 3, top: 'Medium, kept on top', sides: 'High fade, tight on the sides', style: 'Pomade or matte paste', every: '2 weeks', note: 'Sharp, strong contrast. Needs frequent upkeep.' },
  { id: 'taper-fade', name: 'Taper Fade', face: ['oval', 'round', 'square', 'heart', 'oblong', 'diamond'], hair: ['straight', 'wavy', 'curly', 'coily'], care: 1, top: 'Medium', sides: 'Gradual taper at sideburns and neckline', style: 'Matte finish', every: '3 weeks', note: 'Neat and office-friendly, grows out gracefully.' },
  { id: 'skin-fade', name: 'Skin Fade', face: ['oval', 'square', 'round', 'diamond'], hair: ['straight', 'wavy', 'curly', 'coily'], care: 3, top: 'Short to medium', sides: 'Fades down to bare skin', style: 'Light pomade', every: '2 weeks', note: 'The cleanest look; shows every regrowth.' },
  { id: 'burst-fade', name: 'Burst Fade', face: ['oval', 'square', 'heart'], hair: ['wavy', 'curly', 'coily'], care: 2, top: 'Medium to long, textured', sides: 'Fade curves around the ear', style: 'Curl cream or sea salt spray', every: '3 weeks', note: 'Great with curls and a mohawk-style top.' },
  { id: 'french-crop', name: 'French Crop', face: ['round', 'oval', 'oblong', 'diamond'], hair: ['straight', 'wavy'], care: 1, top: 'Short, forward fringe', sides: 'Short, can be faded', style: 'Matte clay', every: '3-4 weeks', note: 'Low maintenance; the fringe softens a long forehead.' },
  { id: 'textured-crop', name: 'Textured Crop', face: ['oval', 'round', 'square', 'heart', 'diamond'], hair: ['straight', 'wavy', 'curly'], care: 1, top: 'Short to medium, choppy', sides: 'Tapered', style: 'Sea salt spray or texture powder', every: '3-4 weeks', note: 'Messy-on-purpose volume with minimal effort.' },
  { id: 'buzz-cut', name: 'Buzz Cut', face: ['oval', 'square', 'diamond'], hair: ['straight', 'wavy', 'curly', 'coily'], care: 1, top: 'Very short, one guard length', sides: 'Same length or lightly tapered', style: 'None', every: '2-3 weeks', note: 'Fastest routine. Best for balanced head shapes.' },
  { id: 'pompadour', name: 'Pompadour', face: ['oval', 'square', 'round', 'diamond'], hair: ['straight', 'wavy'], care: 3, top: 'Long, swept up and back', sides: 'Faded or tapered short', style: 'Strong pomade and blow dry', every: '3 weeks', note: 'Adds height to round faces; needs daily styling.' },
  { id: 'slick-back', name: 'Slick Back', face: ['oval', 'square', 'oblong', 'heart'], hair: ['straight', 'wavy'], care: 2, top: 'Medium to long, combed back', sides: 'Tapered or faded', style: 'Medium-hold pomade', every: '3-4 weeks', note: 'Classic and sharp; works best with thicker hair.' },
  { id: 'two-block', name: 'Two Block', face: ['round', 'oval', 'heart', 'oblong'], hair: ['straight', 'wavy'], care: 2, top: 'Medium, longer than the sides', sides: 'Short, disconnected from the top', style: 'Light wax', every: '4 weeks', note: 'Popular and easy to style; flatters round faces.' },
  { id: 'scissor-cut', name: 'Classic Scissor Cut', face: ['oval', 'round', 'square', 'heart', 'oblong', 'diamond'], hair: ['straight', 'wavy', 'curly'], care: 1, top: 'Medium, natural', sides: 'Scissor-over-comb, soft taper', style: 'Light cream or none', every: '4-5 weeks', note: 'Natural look that grows out evenly.' },
  { id: 'long-flow', name: 'Long Hairstyle', face: ['oval', 'square', 'heart', 'diamond'], hair: ['straight', 'wavy', 'curly'], care: 2, top: 'Long, layered', sides: 'Long, tapered neckline', style: 'Leave-in cream, air dry', every: '6-8 weeks', note: 'Long layers frame the face; regular trims keep it healthy.' }
];
const CARES = [[1, 'Low', 'Wash and go'], [2, 'Medium', 'A few minutes daily'], [3, 'High', 'I enjoy styling']];
const SF = { face: '', hair: '', care: 0, done: false };
const cutById = id => CUTS.find(c => c.id === id);
function recommend() {
  return CUTS.map(c => { let sc = (c.face.includes(SF.face) ? 50 : 0) + (c.hair.includes(SF.hair) ? 30 : 0); sc += 20 - Math.abs(c.care - (SF.care || 2)) * 10; return { c, sc }; }).filter(x => x.sc >= 50).sort((a, b) => b.sc - a.sc).slice(0, 3);
}
function vStyle() {
  const saved = (S.user?.styles || []), pick = (k, v) => SF[k] === v ? 'on' : '';
  if (SF.done) {
    const rec = recommend(), face = FACES.find(f => f[0] === SF.face)[1];
    return header('Your style', '/') + `<div class="card"><div class="sm mute">Based on</div><b>${esc(face)} face · ${esc(HAIRS.find(h => h[0] === SF.hair)[1])} hair · ${CARES.find(c => c[0] === (SF.care || 2))[1]} upkeep</b></div>
    <div class="list" style="margin-top:12px">${rec.map(({ c }, i) => `<div class="card pop">${i === 0 ? '<span class="tag on">Best match</span> ' : ''}<h3 style="font-size:22px;margin:6px 0 4px">${esc(c.name)}</h3><div class="mute sm" style="margin-bottom:8px">${esc(c.note)}</div>
      ${[['Face shape', face], ['Top', c.top], ['Sides', c.sides], ['Styling', c.style], ['Maintenance', 'Every ' + c.every]].map(([k, v]) => `<div class="row sm" style="padding:5px 0;border-top:1px solid var(--line)"><span class="mute" style="width:100px">${k}</span><span>${esc(v)}</span></div>`).join('')}
      <div class="row" style="margin-top:10px;flex-wrap:wrap"><button class="btn sm ${saved.includes(c.id) ? 'sec' : ''}" data-ssave="${c.id}">${saved.includes(c.id) ? '♥ Saved' : 'Save'}</button><button class="btn sec sm" data-sbook="${c.id}">${ic('cal')} Book with this cut</button></div></div>`).join('') || '<div class="card empty">No strong matches. Try a different upkeep level.</div>'}</div>
    <p class="mute sm" style="margin-top:14px">These are suggestions from simple grooming rules, not an AI scan or a guaranteed result. Show it to your barber and they will adjust it to your head shape, hairline and hair growth.</p>
    <button class="btn ghost block" data-sagain>Start over</button>`;
  }
  const ready = SF.face && SF.hair;
  return header('Style finder', '/') + `<p class="mute" style="margin-top:0">Answer three quick questions and get cuts that suit you. You will not need to upload a photo.</p>
  <div class="sec-h" style="margin-top:8px"><h2>1 · Face shape</h2></div><div class="list">${FACES.map(([id, n, d]) => `<button class="svc ${pick('face', id)}" data-sface="${id}"><div class="sp" style="text-align:left"><div class="nm">${n}</div><div class="sm mute">${d}</div></div><span class="chk">${SF.face === id ? ic('check') : ''}</span></button>`).join('')}</div>
  <div class="sec-h"><h2>2 · Hair type</h2></div><div class="chips" style="flex-wrap:wrap">${HAIRS.map(([id, n]) => `<button class="chip ${pick('hair', id)}" data-shair="${id}">${n}</button>`).join('')}</div>
  <div class="sec-h"><h2>3 · Daily upkeep</h2></div><div class="chips" style="flex-wrap:wrap">${CARES.map(([id, n, d]) => `<button class="chip ${SF.care === id ? 'on' : ''}" data-scare="${id}">${n} · ${d}</button>`).join('')}</div>
  <button class="btn block" style="margin-top:20px" data-sgo ${ready ? '' : 'disabled'}>Show my cuts</button>
  ${saved.length ? `<div class="sec-h"><h2>Saved styles</h2></div><div class="pill-row">${saved.map(id => cutById(id) ? `<span class="tag">${esc(cutById(id).name)}</span>` : '').join('')}</div>` : ''}`;
}
async function saveStyle(id) {
  if (!S.token) return nav('/auth');
  const cur = S.user.styles || [], next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
  try { S.user.styles = (await api('/me/styles', { method: 'PUT', body: { styles: next } })).styles; render(); } catch (x) { toast(x.message); }
}


const replyBox = r => r.reply ? `<div class="sm" style="margin-top:8px;padding:8px 10px;border-left:3px solid var(--blue);background:var(--s3);border-radius:8px"><b>Reply from ${esc(r.replyBy || 'the shop')}</b><div style="white-space:pre-wrap">${esc(r.reply)}</div></div>` : '';
// ----- shop page -----
async function vShop(id) {
  let j; try { j = await api('/shops/' + id); } catch (e) { return header('', '/discover') + `<div class="err">${esc(e.message)}</div>`; }
  const s = j.shop; S.curShop = s;
  return header('', '/discover') + `<h1 style="font-size:28px">${esc(s.name)}</h1><div class="mute sm">${esc(s.address || 'Brotherhood Barbershop')}</div>
  <div style="margin:6px 0 12px">${rate(s.rating, s.reviews)} <span class="tag">${t12(s.openTime)}–${t12(s.closeTime)}</span></div>
  ${j.live ? `<div class="card row" style="margin:0 0 12px"><span class="tag ${j.live.open ? 'ok' : 'bad'}">${j.live.open ? 'Open now' : 'Closed'}</span><div class="sp sm">${j.live.open ? `<b>${j.live.waiting}</b> waiting · <b>${j.live.cutting}</b> in the chair · <b>${j.live.onDuty}</b> barber${j.live.onDuty === 1 ? '' : 's'} on duty` : 'Opens ' + t12(s.openTime)}${j.live.estWait != null && j.live.waiting ? `<div class="mute">Walk-in wait is about ${j.live.estWait} min (estimate)</div>` : j.live.open && j.live.onDuty ? '<div class="mute">No wait right now</div>' : ''}</div></div>` : ''}
  ${j.gallery.length ? `<div class="chips" style="margin:0 -16px;padding:0 16px">${j.gallery.map(g => `<img src="${esc(g)}" alt="${esc(s.name)} shop photo" data-lb="${esc(g)}" loading="lazy" style="height:170px;width:auto;border-radius:14px;flex:none;cursor:zoom-in;background:var(--s2)">`).join('')}</div>` : ''}
  <div class="row" style="margin:12px 0;flex-wrap:wrap">${s.phone ? `<a class="btn sec sm" href="tel:${esc(s.phone)}">Call</a>` : ''}${/^https?:\/\//i.test(s.mapUrl) ? `<a class="btn sec sm" href="${esc(s.mapUrl)}" target="_blank" rel="noopener">${ic('pin')} Directions</a>` : ''}</div>
  <div class="sec-h"><h2>Barbers · ${j.barbers.length}</h2></div><div class="list">${j.barbers.map(barberRow).join('') || '<div class="card empty">Barber profiles are coming soon. You can still book any available barber.</div>'}</div>
  <div class="sec-h"><h2>Prices</h2></div><div class="list">${j.services.map(x => `<div class="card row">${x.photo ? `<img src="${esc(x.photo)}" style="width:48px;height:48px;border-radius:10px;object-fit:cover" alt="">` : ''}<div class="sp"><div class="nm">${esc(x.name)}</div><div class="sm mute">${x.mins || 30} min</div></div><b class="num" style="font-size:18px">${peso(x.price)}</b></div>`).join('')}</div>
  <div class="sec-h"><h2>Reviews</h2></div><div class="list">${j.reviews.map(r => `<div class="card"><div class="row"><b>${esc(r.name)}</b>${r.verified ? '<span class="tag ok">Verified visit</span>' : ''}<span class="sp"></span>${stars(r.rating)}</div>${r.staffName ? `<div class="sm mute">Haircut by ${esc(r.staffName)}</div>` : ''}${r.text ? `<p style="margin:6px 0 0">${esc(r.text)}</p>` : ''}${replyBox(r)}</div>`).join('') || '<div class="card empty">No reviews for this shop yet.</div>'}</div>
  <div class="foot"><div><div class="sp"><div class="sm mute">Book at</div><b>${esc(s.name)}</b></div><button class="btn" data-bookshop="${s.id}" style="min-width:150px">${ic('cal')} Book here</button></div></div>`;
}


// ----- install as an app + updates -----
let deferredInstall = null;
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; if (route().a === 'home') render(); });
addEventListener('appinstalled', () => { deferredInstall = null; store.set('bh_inst', '1'); render(); });
const canOfferInstall = () => !isStandalone() && !store.get('bh_inst') && (deferredInstall || isIOS);
const installCard = () => canOfferInstall() ? `<div class="card row pop" style="margin-bottom:12px"><span class="av" style="width:44px;height:44px;background:var(--s2)">${ic('home')}</span><div class="sp"><b>Install Brotherhood</b><div class="sm mute">${deferredInstall ? 'Add it to your home screen for one-tap booking.' : 'Tap Share, then "Add to Home Screen".'}</div></div>${deferredInstall ? '<button class="btn sm" data-install>Install</button>' : ''}<button class="link" data-noinstall aria-label="Dismiss">✕</button></div>` : '';
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').then(reg => {
    const offer = w => { if (!w || !navigator.serviceWorker.controller || document.getElementById('upd')) return; const b = document.createElement('div'); b.id = 'upd'; b.className = 'toast'; b.style.cssText += ';display:flex;gap:10px;align-items:center;bottom:84px';
      b.innerHTML = 'A new version is ready <button class="btn sm" style="padding:6px 12px">Update</button>'; b.querySelector('button').onclick = () => w.postMessage('SKIP_WAITING'); document.body.appendChild(b); };
    if (reg.waiting) offer(reg.waiting);
    reg.addEventListener('updatefound', () => { const w = reg.installing; w && w.addEventListener('statechange', () => { if (w.state === 'installed') offer(reg.waiting || w); }); });
    setInterval(() => reg.update().catch(() => { }), 3600e3);
  }).catch(() => { });
  let reloaded = false; const hadController = !!navigator.serviceWorker.controller;   // first install must not reload the page
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloaded || !hadController) return; reloaded = true; location.reload(); });
}


// ----- map (OpenStreetMap via Leaflet, loaded only when the map is opened) -----
let LMap = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve();
  return new Promise((ok, no) => {
    const c = document.createElement('link'); c.rel = 'stylesheet'; c.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(c);
    const s = document.createElement('script'); s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; s.onload = ok; s.onerror = () => no(new Error('Map failed to load')); document.head.appendChild(s);
  });
}
const kmBetween = (a, b, c, d) => { const r = x => x * Math.PI / 180, h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };
const kmText = k => k < 1 ? Math.round(k * 1000 / 10) * 10 + ' m' : k.toFixed(k < 10 ? 1 : 0) + ' km';
const withPos = () => (S.D?.shops || []).filter(s => s.lat != null && s.lng != null).map(s => ({ ...s, km: S.geo ? kmBetween(S.geo.lat, S.geo.lng, s.lat, s.lng) : null })).sort((a, b) => S.geo ? a.km - b.km : 0);
function vMap() {
  const list = withPos(), missing = (S.D?.shops || []).length - list.length;
  return header('Shops near you', '/discover') + `<div id="map" aria-label="Map of Brotherhood barbershops"></div>
  <div class="row" style="margin:10px 0"><button class="btn sec sm" data-locate>${S.geoBusy ? 'Locating…' : S.geo ? '◎ Update my location' : '◎ Near me'}</button><span class="sp"></span><span class="mute sm">${list.length} shop${list.length === 1 ? '' : 's'} on the map</span></div>
  ${S.geoErr ? `<div class="err">${esc(S.geoErr)}</div>` : ''}
  <div class="list">${!S.D ? '<div class="empty">Loading…</div>' : list.map(s => `<button class="bcard" data-shop="${s.id}">${s.photo ? `<img class="av" src="${esc(s.photo)}" alt="" loading="lazy" style="border-radius:12px">` : `<span class="av">${esc(initials(s.name))}</span>`}<div class="sp"><div class="nm">${esc(s.name)}</div><div class="sm mute">${esc(s.address || 'Brotherhood Barbershop')} · ${t12(s.openTime)}–${t12(s.closeTime)}</div></div>${s.km != null ? `<b class="num">${kmText(s.km)}</b>` : ''}</button>`).join('') || '<div class="card empty">Shop locations are being added. Check back soon.</div>'}${missing > 0 && list.length ? `<div class="sm mute" style="text-align:center">${missing} more shop${missing === 1 ? ' is' : 's are'} not on the map yet.</div>` : ''}</div>`;
}
async function mountMap() {
  const el = document.getElementById('map'); if (!el) return; const list = withPos();
  try { await loadLeaflet(); } catch { el.innerHTML = '<div class="empty">The map could not load. Check your connection and try again.</div>'; return; }
  if (!document.getElementById('map')) return; if (LMap) { LMap.remove(); LMap = null; }
  LMap = L.map(el, { zoomControl: true }).setView([14.1, 121.3], 9);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(LMap);
  const pts = [];
  for (const s of list) {
    const m = L.marker([s.lat, s.lng], { icon: L.divIcon({ className: '', html: '<div class="pin"></div>', iconSize: [26, 26], iconAnchor: [13, 26], popupAnchor: [0, -26] }), title: s.name }).addTo(LMap);
    const d = document.createElement('div'); d.innerHTML = `<b>${esc(s.name)}</b><br><span style="color:#555">${t12(s.openTime)}–${t12(s.closeTime)}${s.km != null ? ' · ' + kmText(s.km) : ''}</span><br><button class="btn sm" style="margin-top:6px;padding:6px 12px">View shop</button>`;
    d.querySelector('button').onclick = () => nav('/shop/' + s.id); m.bindPopup(d); pts.push([s.lat, s.lng]);   // Leaflet stops clicks inside popups from bubbling, so the handler is attached directly
  }
  if (S.geo) { L.marker([S.geo.lat, S.geo.lng], { icon: L.divIcon({ className: '', html: '<div class="pin me"></div>', iconSize: [20, 20], iconAnchor: [10, 10] }), title: 'You are here' }).addTo(LMap); pts.push([S.geo.lat, S.geo.lng]); }
  if (pts.length > 1) LMap.fitBounds(pts, { padding: [30, 30], maxZoom: 14 }); else if (pts.length) LMap.setView(pts[0], 15);
}
function locate() {
  if (!navigator.geolocation) { S.geoErr = 'Your browser cannot share its location.'; return render(); }
  S.geoBusy = true; S.geoErr = ''; render();
  navigator.geolocation.getCurrentPosition(p => { S.geo = { lat: p.coords.latitude, lng: p.coords.longitude }; S.geoBusy = false; render(); },
    e => { S.geoBusy = false; S.geoErr = e.code === 1 ? 'Location permission was denied. You can allow it in your browser settings.' : 'Could not get your location. Try again outdoors or check your signal.'; render(); }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
}

// ----- notifications -----
const NICON = { waitlist: 'cal', reply: 'chat', booking: 'cal', rate: 'heart', like: 'heart', comment: 'chat', follow: 'team' };
function vNotifs() {
  if (!S.token) { setTimeout(() => nav('/auth')); return ''; }
  const n = S.notifs; if (!n) return header('Notifications', '/') + '<div class="empty">Loading…</div>';
  return header('Notifications', '/') + `<div class="list">${n.items.map(x => `<button class="bcard" data-ngo="${esc(x.link || '#/')}" style="${x.readAt ? 'opacity:.7' : 'border-color:var(--blue)'}"><span class="av" style="width:40px;height:40px">${ic(NICON[x.kind] || 'bell')}</span><div class="sp"><div>${esc(x.text)}</div><div class="sm mute">${(a => a === 'just now' ? a : a + ' ago')(ago(x.createdAt))}</div></div></button>`).join('') || '<div class="card empty">No notifications yet. Booking updates and community activity show up here.</div>'}</div>`;
}
async function loadNotifs() {
  try { S.notifs = await api('/notifications'); S.unread = 0; await api('/notifications/read', { method: 'POST' }); } catch { S.notifs = { items: [] }; }
  render();
}
setInterval(async () => { if (S.token && !document.hidden) { try { const j = await api('/me'); if (j.unread !== S.unread && route().a !== 'notifications') { S.unread = j.unread; render(); } } catch { } } }, 60000);

// ----- community -----
const ago = iso => { const m = Math.max(0, (Date.now() - new Date(iso)) / 60000); return m < 1 ? 'just now' : m < 60 ? Math.floor(m) + 'm' : m < 1440 ? Math.floor(m / 60) + 'h' : Math.floor(m / 1440) + 'd'; };
async function loadFeed() { try { S.feed = await api('/feed?scope=' + S.feedScope); } catch { S.feed = { posts: [], more: false }; } }
function postCard(p) {
  const c = S.open[p.id];
  return `<div class="card pop"><div class="row"><span class="av" style="width:40px;height:40px;font-size:14px">${esc(initials(p.author))}</span><div class="sp"><b>${esc(p.author)}</b><div class="sm mute">${ago(p.createdAt)}${p.staffName ? ` · cut by <a href="#/barber/${p.staffId}" style="color:var(--blue)">${esc(p.staffName)}</a>` : ''}</div></div>
    ${!p.mine && S.user ? `<button class="btn sec sm" data-pfollow="${p.userId}" data-on="${p.following ? 1 : 0}">${p.following ? 'Following' : 'Follow'}</button>` : ''}</div>
    ${p.text ? `<p style="margin:10px 0 0;white-space:pre-wrap;word-break:break-word">${esc(p.text)}</p>` : ''}${p.image ? `<img src="${esc(p.image)}" alt="Post photo" data-lb="${esc(p.image)}" loading="lazy" style="width:100%;border-radius:12px;margin-top:10px;max-height:480px;object-fit:cover;cursor:zoom-in">` : ''}
    <div class="row" style="margin-top:10px"><button class="btn sec sm heart ${p.liked ? 'on' : ''}" data-plike="${p.id}">${ic('heart')} ${p.likes}</button><button class="btn sec sm" data-pcomm="${p.id}">${ic('chat')} ${p.comments}</button><span class="sp"></span>
    <details style="position:relative"><summary class="btn sec sm" style="list-style:none">•••</summary><div class="card" style="position:absolute;right:0;z-index:4;width:170px;padding:6px;display:grid;gap:4px">${p.mine ? `<button class="btn ghost sm" data-pdel="${p.id}" data-ptype="post">Delete post</button>` : `<button class="btn ghost sm" data-preport="${p.id}">Report post</button><button class="btn ghost sm" data-pblock="${p.userId}">Block ${esc(p.author)}</button>`}</div></details></div>
    ${c ? `<div style="margin-top:10px;border-top:1px solid var(--line);padding-top:10px">${c.list.map(x => `<div class="sm" style="margin-bottom:8px"><b>${esc(x.author)}</b> <span class="mute">${ago(x.createdAt)}</span>${x.mine ? ` <button class="link" data-cdel="${x.id}" data-post="${p.id}">delete</button>` : ''}<div style="white-space:pre-wrap;word-break:break-word">${esc(x.text)}</div></div>`).join('') || '<div class="sm mute" style="margin-bottom:8px">No comments yet.</div>'}
      ${S.user ? `<div class="row"><input id="cin-${p.id}" maxlength="300" placeholder="Add a comment"><button class="btn sm" data-csend="${p.id}">Send</button></div>` : '<button class="link" data-go="/auth">Log in to comment</button>'}</div>` : ''}</div>`;
}
function vCommunity() {
  const f = S.feed, cp = S.comp;
  return header('Community') + `<div class="tabs"><button class="${S.feedScope === 'all' ? 'on' : ''}" data-fscope="all">Latest</button><button class="${S.feedScope === 'following' ? 'on' : ''}" data-fscope="following">Following</button></div>
  ${S.user ? `<div class="card" style="margin-bottom:12px"><textarea id="ctext" rows="2" maxlength="500" placeholder="Share a cut, a tip, or something for the brotherhood">${esc(cp.text)}</textarea>
    ${cp.img ? `<div style="position:relative;margin-top:8px"><img src="${cp.img}" alt="" style="width:100%;max-height:220px;object-fit:cover;border-radius:12px"><button class="btn sm danger" style="position:absolute;top:6px;right:6px;background:var(--bg)" data-cimgx>✕</button></div>` : ''}
    ${cp.err ? `<div class="err">${esc(cp.err)}</div>` : ''}<div class="row" style="margin-top:8px"><label class="btn sec sm" style="cursor:pointer">${ic('plus')} Photo<input type="file" id="cfile" accept="image/*" hidden></label><span class="sp"></span><button class="btn sm" data-cpost ${cp.busy ? 'disabled' : ''}>${cp.busy ? 'Posting…' : 'Post'}</button></div></div>`
    : `<div class="card row" style="margin-bottom:12px"><div class="sp mute sm">Join the conversation. Log in to post, like and comment.</div><button class="btn sm" data-go="/auth">Log in</button></div>`}
  <div class="list">${!f ? '<div class="empty">Loading…</div>' : f.posts.map(postCard).join('') || `<div class="empty">${S.feedScope === 'following' ? 'Follow members to see their posts here.' : 'No posts yet. Be the first!'}</div>`}</div>
  <p class="mute sm" style="text-align:center;margin-top:18px">Be respectful. Report anything that breaks the brotherhood rules. Posts reported by 3 members are hidden for review.</p>`;
}
const REASONS = ['Spam', 'Harassment or hate', 'Nudity or sexual content', 'Violence', 'Other'];
function vMod() {
  const r = S.reports; if (!r) return '<div class="empty">Loading…</div>';
  return `<div class="sec-h"><h2>Reported content</h2><span class="mute sm">${r.length}</span></div><div class="list">${r.map(x => `<div class="card"><div class="row"><span class="tag ${x.hidden ? 'bad' : ''}">${x.kind}${x.hidden ? ' · hidden' : ''}</span><span class="tag">${x.n} report${x.n > 1 ? 's' : ''}</span></div>
    ${x.author ? `<div class="sm mute" style="margin-top:6px">by ${esc(x.author)}</div>` : ''}<p style="margin:6px 0;white-space:pre-wrap;word-break:break-word">${esc(x.text) || '<span class="mute">(no text)</span>'}</p>${x.image ? `<img src="${esc(x.image)}" alt="" style="width:100%;max-height:200px;object-fit:cover;border-radius:10px">` : ''}
    <div class="sm mute" style="margin:6px 0">${esc(x.reasons || '')}</div>${x.kind === 'user' ? '<div class="sm mute">Account reports are reviewed manually.</div>' : `<div class="row">${x.hidden ? `<button class="btn sec sm" data-mod="restore" data-mkind="${x.kind}" data-mid="${x.targetId}">Restore</button>` : ''}<button class="btn danger sm" data-mod="remove" data-mkind="${x.kind}" data-mid="${x.targetId}">Remove</button></div>`}</div>`).join('') || '<div class="card empty">Nothing to review.</div>'}</div>`;
}
async function loadReports() { try { S.reports = (await api('/pro/reports', {}, S.proToken)).reports; } catch (e) { S.reports = []; toast(e.message); } render(); }
async function compressImg(file) { return compress(file); }
async function compress(file) {
  const bmp = await createImageBitmap(file), sc = Math.min(1, 1080 / Math.max(bmp.width, bmp.height)), cv = document.createElement('canvas');
  cv.width = Math.round(bmp.width * sc); cv.height = Math.round(bmp.height * sc); cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
  for (const q of [0.82, 0.7, 0.55, 0.4]) { const d = cv.toDataURL('image/jpeg', q); if (d.length * 0.75 < 650_000) return d; }
  throw new Error('Photo is too large');
}

// ---------- render ----------
let rendering = 0;
async function render() {
  const my = ++rendering, r = route(); let html = '';
  if (r.a === 'home') html = vHome(); else if (r.a === 'discover') html = vDiscover(); else if (r.a === 'barber') html = await vBarber(r.b);
  else if (r.a === 'book') html = vBook(); else if (r.a === 'bookings') html = vBookings(); else if (r.a === 'auth') html = vAuth(); else if (r.a === 'me') html = vMe(); else if (r.a === 'pro') html = vPro(); else if (r.a === 'community') html = vCommunity(); else if (r.a === 'notifications') html = vNotifs(); else if (r.a === 'style') html = vStyle(); else if (r.a === 'shop') html = await vShop(r.b); else if (r.a === 'map') html = vMap(); else html = vHome();
  if (my !== rendering) return;
  const focus = document.activeElement?.id, pos = document.activeElement?.selectionStart, sy = window.scrollY;
  const showNav = !['barber', 'book', 'auth', 'pro', 'notifications', 'style', 'shop'].includes(r.a), tabs = [['home', 'Home', 'home'], ['discover', 'Discover', 'search'], ['community', 'Community', 'team'], ['bookings', 'Bookings', 'cal'], ['me', 'Profile', 'user']];
  app.innerHTML = html + (showNav ? `<nav class="nav"><div>${tabs.map(([k, n, i]) => `<button class="${r.a === k || (k === 'home' && r.a === 'home') ? 'on' : ''}" data-go="/${k === 'home' ? '' : k}">${ic(i)}${n}</button>`).join('')}</div></nav>` : '');
  if (focus === 'q') { const el = document.getElementById('q'); el.focus(); try { el.setSelectionRange(pos, pos); } catch { } }
  if (r.a === 'map') mountMap();
  if (r.a === 'barber' || r.a === 'book' || r.a === 'shop') window.scrollTo(0, r.a === 'book' ? sy : 0);
}
async function onRoute() {
  const r = route(); window.scrollTo(0, 0);
  if (['discover', 'home', 'book', 'barber', 'shop', 'map'].includes(r.a) && !S.D) { render(); await loadDiscover().catch(() => { }); }
  if (['bookings', 'home'].includes(r.a) && S.token && !S.mine) await loadBookings();
  if (r.a === 'pro' && S.proToken && !S.pro) { await loadPro(); S.proSel = S.pro?.staff[0]?.id; if (S.pro?.admin) { S.proTab = 'shop'; loadShopOwner(); } loadDash(); }
  if (r.a === 'bookings' && S.token) { loadBookings().then(render); api('/waitlist').then(j => { S.wait = j.items; render(); }).catch(() => { }); }
  if (r.a === 'community') loadFeed().then(render);
  if (r.a === 'notifications' && S.token) { S.notifs = null; loadNotifs(); }
  if (r.a === 'book' && S.bk && !S.token) { nav('/auth'); return; }
  render();
}
addEventListener('hashchange', onRoute);

// ---------- events ----------
let qTimer;
app.addEventListener('input', e => {
  if (e.target.id === 'q') { S.q = e.target.value; clearTimeout(qTimer); qTimer = setTimeout(async () => { await loadDiscover().catch(() => { }); render(); }, 250); }
  if (e.target.id === 'bnotes' && S.bk) S.bk.notes = e.target.value;
  if (e.target.id === 'ctext') S.comp.text = e.target.value;
});
app.addEventListener('change', async e => {
  if (e.target.id === 'sort') { S.sort = e.target.value; await loadDiscover(); render(); }
  if (e.target.id === 'prosel') { S.proSel = e.target.value; S.proMsg = null; render(); loadDash(); }
  if (e.target.id === 'cfile') { const f = e.target.files[0]; e.target.value = ''; if (f) { try { S.comp.img = await compress(f); S.comp.err = ''; } catch (x) { S.comp.err = x.message; } render(); } }
  if (e.target.id === 'pfile') {
    const files = [...e.target.files]; let n = 0; e.target.value = '';
    for (const f of files.slice(0, 10)) { try { await api('/pro/portfolio', { method: 'POST', body: { staffId: S.proSel, data: await compress(f) } }, S.proToken); n++; } catch (x) { toast(x.message); } }
    if (n) { toast(n + ' photo' + (n > 1 ? 's' : '') + ' added'); await loadPro(); render(); }
  }
});
app.addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target, d = Object.fromEntries(new FormData(f));
  if (f.id === 'authf') {
    S.auth.busy = true; S.auth.err = ''; render();
    try { const j = await api(S.auth.mode === 'signup' ? '/signup' : '/login', { method: 'POST', body: { ...d, email: String(d.email || '').trim(), agree: !!d.agree } }, null); S.token = j.token; store.set('bh_token', j.token); S.user = j.user; await loadMe(); S.mine = null; nav(S.bk ? '/book' : '/me'); }
    catch (x) { S.auth.err = x.message; }
    S.auth.busy = false; render();
  } else if (f.id === 'mef') {
    try { S.user = (await api('/me', { method: 'PUT', body: d })).user; S.meMsg = { ok: true, t: 'Saved' }; } catch (x) { S.meMsg = { ok: false, t: x.message }; } render();
  } else if (f.id === 'prolf') {
    try { const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) }), j = await r.json(); if (!r.ok) throw new Error(j.error);
      S.proToken = j.token; store.set('bh_pro', j.token); await loadPro(); S.proSel = S.pro?.staff[0]?.id; if (S.pro?.admin) { S.proTab = 'shop'; loadShopOwner(); } else S.proTab = 'dash'; loadDash(); } catch (x) { S.proErr = x.message; } render();
  } else if (f.id === 'prof') {
    try { await api('/pro/profile', { method: 'PUT', body: { staffId: S.proSel, ...d, verified: S.pro.admin ? !!d.verified : undefined } }, S.proToken); S.proMsg = { ok: true, t: 'Profile saved' }; await loadPro(); } catch (x) { S.proMsg = { ok: false, t: x.message }; } render();
  }
});
app.addEventListener('click', async e => {
  const t = e.target.closest('[data-go],[data-shop],[data-avail],[data-branchf],[data-spec],[data-tab],[data-fav],[data-book],[data-bstaff],[data-bsvc],[data-bday],[data-btime],[data-confirm],[data-cancel],[data-review],[data-rebook],[data-authmode],[data-logout],[data-delete],[data-lb],[data-pdel],[data-prologout],[data-ptab],[data-drange],[data-propin],[data-locate],[data-locurl],[data-locgps],[data-locsave],[data-ngo],[data-install],[data-noinstall],[data-wl],[data-wldel],[data-bookshop],[data-rreply],[data-snote],[data-sface],[data-shair],[data-scare],[data-sgo],[data-sagain],[data-ssave],[data-sbook],[data-fscope],[data-cpost],[data-cimgx],[data-plike],[data-pcomm],[data-csend],[data-cdel],[data-pfollow],[data-preport],[data-pblock],[data-mod]');
  if (!t) return; const D = t.dataset;
  if (D.go != null) return nav(D.go || '/');
  if (D.shop) return nav('/shop/' + D.shop);
  if (D.rreply) {
    const text = prompt('Reply to this review (leave empty to remove your reply):', D.cur || ''); if (text === null) return;
    try { await api(`/pro/reviews/${D.rreply}/reply`, { method: 'POST', body: { text } }, S.proToken); toast('Reply saved'); await loadDash(); } catch (x) { toast(x.message); } return;
  }
  if (D.install != null) { if (deferredInstall) { deferredInstall.prompt(); await deferredInstall.userChoice.catch(() => { }); deferredInstall = null; render(); } return; }
  if (D.noinstall != null) { store.set('bh_inst', '1'); return render(); }
  if (D.wl != null) {
    if (!S.token) return nav('/auth'); const k = S.bk;
    try { await api('/waitlist', { method: 'POST', body: { branchId: k.branchId, staffId: k.staffId, date: k.date } }); toast('You are on the waitlist. We will notify you.'); S.wait = null; } catch (x) { toast(x.message); } return;
  }
  if (D.wldel) { try { await api('/waitlist/' + D.wldel, { method: 'DELETE' }); S.wait = (S.wait || []).filter(x => x.id !== D.wldel); } catch (x) { toast(x.message); } return render(); }
  if (D.bookshop) { startBooking(D.bookshop, 'any'); if (!S.token) nav('/auth'); return; }
  if (D.avail != null) { S.avail = !S.avail; await loadDiscover(); return render(); }
  if (D.branchf != null) { S.branch = D.branchf; await loadDiscover(); return render(); }
  if (D.spec) { S.specialty = S.specialty === D.spec ? '' : D.spec; await loadDiscover(); return render(); }
  if (D.tab) { S.tab = D.tab; return render(); }
  if (D.fav) {
    if (!S.token) return nav('/auth'); const on = S.favs.includes(D.fav);
    try { await api('/favorites/' + D.fav, { method: on ? 'DELETE' : 'PUT' }); S.favs = on ? S.favs.filter(x => x !== D.fav) : [...S.favs, D.fav]; render(); } catch (x) { toast(x.message); } return;
  }
  if (D.book) { const b = S.cur?.barber; startBooking(b.branchId, b.id); if (!S.token) nav('/auth'); return; }
  if (D.bstaff) { S.bk.staffId = D.bstaff; return loadSlots(); }
  if (D.bsvc) { const k = S.bk; k.items = k.items.includes(D.bsvc) ? k.items.filter(x => x !== D.bsvc) : [...k.items, D.bsvc]; return loadSlots(); }
  if (D.bday) { S.bk.date = D.bday; return loadSlots(); }
  if (D.btime) { S.bk.time = D.btime; return render(); }
  if (D.confirm != null) return confirmBooking();
  if (D.cancel) { if (!confirm('Cancel this booking?')) return; try { await api(`/bookings/${D.cancel}/cancel`, { method: 'POST' }); toast('Booking cancelled'); await loadBookings(); } catch (x) { toast(x.message); } return render(); }
  if (D.rebook) { const b = S.mine.find(x => x.id === D.rebook); startBooking(b.branchId, b.staffId); S.bk.items = b.itemIds.filter(id => S.D?.services.some(s => s.id === id)); if (!S.token) return nav('/auth'); return loadSlots(); }
  if (D.review) { openReview(D.review); return; }
  if (D.authmode) { S.auth.mode = D.authmode; S.auth.err = ''; return render(); }
  if (D.logout != null) { S.token = null; S.user = null; S.favs = []; S.mine = null; store.set('bh_token', null); return nav('/'); }
  if (D.delete != null) {
    const pw = document.getElementById('delpw').value; if (!pw || !confirm('Delete your account permanently?')) return;
    try { await api('/me', { method: 'DELETE', body: { password: pw } }); S.token = null; S.user = null; store.set('bh_token', null); toast('Account deleted'); nav('/'); } catch (x) { toast(x.message); } return;
  }
  if (D.lb) { const o = document.createElement('div'); o.className = 'lb'; o.innerHTML = `<img src="${esc(D.lb)}" alt=""><button aria-label="Close">✕</button>`; o.onclick = () => o.remove(); document.body.appendChild(o); return; }
  if (D.fscope) { S.feedScope = D.fscope; S.feed = null; render(); await loadFeed(); return render(); }
  if (D.cimgx != null) { S.comp.img = null; return render(); }
  if (D.cpost != null) {
    const c = S.comp; c.busy = true; c.err = ''; render();
    try { await api('/posts', { method: 'POST', body: { text: c.text, data: c.img || undefined } }); S.comp = { text: '', img: null, busy: false, err: '' }; await loadFeed(); toast('Posted'); }
    catch (x) { c.err = x.message; c.busy = false; } return render();
  }
  if (D.plike) {
    if (!S.token) return nav('/auth'); const p = S.feed.posts.find(x => x.id === D.plike);
    try { const j = await api(`/posts/${p.id}/like`, { method: p.liked ? 'DELETE' : 'PUT' }); p.liked = !p.liked; p.likes = j.likes; render(); } catch (x) { toast(x.message); } return;
  }
  if (D.pcomm) {
    if (S.open[D.pcomm]) { delete S.open[D.pcomm]; return render(); }
    try { S.open[D.pcomm] = { list: (await api(`/posts/${D.pcomm}/comments`)).comments }; } catch (x) { toast(x.message); } return render();
  }
  if (D.csend) {
    const inp = document.getElementById('cin-' + D.csend), text = inp.value.trim(); if (!text) return;
    try { const j = await api(`/posts/${D.csend}/comments`, { method: 'POST', body: { text } }); S.open[D.csend].list.push(j.comment); S.feed.posts.find(x => x.id === D.csend).comments++; } catch (x) { return toast(x.message); } return render();
  }
  if (D.cdel) { try { await api('/comments/' + D.cdel, { method: 'DELETE' }); const c = S.open[D.post]; c.list = c.list.filter(x => x.id !== D.cdel); S.feed.posts.find(x => x.id === D.post).comments--; } catch (x) { toast(x.message); } return render(); }
  if (D.pfollow) {
    const on = D.on === '1'; try { await api('/follow/' + D.pfollow, { method: on ? 'DELETE' : 'PUT' }); S.feed.posts.forEach(x => { if (x.userId === D.pfollow) x.following = !on; }); render(); } catch (x) { toast(x.message); } return;
  }
  if (D.preport) {
    if (!S.token) return nav('/auth'); const r = prompt('Why are you reporting this?\n' + REASONS.map((x, i) => `${i + 1}. ${x}`).join('\n') + '\nType a number or your own reason:'); if (!r) return;
    try { await api('/report', { method: 'POST', body: { kind: 'post', id: D.preport, reason: REASONS[+r - 1] || r } }); toast('Thanks. We will review it.'); } catch (x) { toast(x.message); } return;
  }
  if (D.pblock) {
    if (!confirm('Block this member? You will no longer see each other\'s posts or comments.')) return;
    try { await api('/block/' + D.pblock, { method: 'PUT' }); toast('Member blocked'); await loadFeed(); } catch (x) { toast(x.message); } return render();
  }
  if (D.mod) {
    if (D.mod === 'remove' && !confirm('Remove this permanently?')) return;
    try { await api('/pro/moderate', { method: 'POST', body: { kind: D.mkind, id: D.mid, action: D.mod } }, S.proToken); await loadReports(); toast('Done'); } catch (x) { toast(x.message); } return;
  }
  if (D.pdel && D.ptype === 'post') {
    if (!confirm('Delete this post?')) return;
    try { await api('/posts/' + D.pdel, { method: 'DELETE' }); await loadFeed(); toast('Post deleted'); } catch (x) { toast(x.message); } return render();
  }
  if (D.pdel) { if (!confirm('Remove this photo?')) return; try { await api('/pro/portfolio/' + D.pdel, { method: 'DELETE' }, S.proToken); await loadPro(); } catch (x) { toast(x.message); } return render(); }
  if (D.snote) { const c = cutById(D.snote); S.bk.notes = (S.bk.notes ? S.bk.notes + '\n' : '') + `Style I want: ${c.name} (${c.top.toLowerCase()} on top, ${c.sides.toLowerCase()}).`; return render(); }
  if (D.sface) { SF.face = D.sface; return render(); }
  if (D.shair) { SF.hair = D.shair; return render(); }
  if (D.scare) { SF.care = +D.scare; return render(); }
  if (D.sgo != null) { SF.done = true; window.scrollTo(0, 0); return render(); }
  if (D.sagain != null) { SF.done = false; return render(); }
  if (D.ssave) return saveStyle(D.ssave);
  if (D.sbook) { const c = cutById(D.sbook); S.styleNote = `Style I want: ${c.name} (${c.top.toLowerCase()} on top, ${c.sides.toLowerCase()}). Suggested by Brotherhood Style Finder.`; toast('Pick your barber. Your style will be added to the booking notes.'); S.branch = ''; return nav('/discover'); }
  if (D.ngo) { if (D.ngo.startsWith('#/')) { S.mine = null; return nav(D.ngo.slice(1)); } return; }
  if (D.locate != null) return locate();
  if (D.locurl) return saveLoc(D.locurl, { fromMapUrl: true, mapUrl: document.getElementById('lu-' + D.locurl).value.trim() });
  if (D.locsave) return saveLoc(D.locsave, { lat: document.getElementById('la-' + D.locsave).value, lng: document.getElementById('ln-' + D.locsave).value });
  if (D.locgps) {
    if (!navigator.geolocation) return toast('Your browser cannot share its location');
    toast('Getting your location… stand inside the shop');
    return navigator.geolocation.getCurrentPosition(p => saveLoc(D.locgps, { lat: p.coords.latitude, lng: p.coords.longitude }), () => toast('Could not get your location. Allow location access and try again.'), { enableHighAccuracy: true, timeout: 15000 });
  }
  if (D.propin != null) { S.proPin = !S.proPin; S.proErr = ''; return render(); }
  if (D.ptab) { S.proTab = D.ptab; if (D.ptab === 'mod') loadReports(); if (D.ptab === 'shop') loadShopOwner(); return render(); }
  if (D.drange) { S.dashRange = D.drange; render(); return loadDash(); }
  if (D.prologout != null) { S.proToken = null; S.pro = null; store.set('bh_pro', null); return render(); }
});
function openReview(bookingId) {
  let rating = 0; const o = document.createElement('div'); o.className = 'lb'; o.style.alignItems = 'end';
  o.innerHTML = `<div class="card pop" style="width:100%;max-width:720px;border-radius:22px 22px 0 0;padding:20px 20px calc(20px + env(safe-area-inset-bottom))"><h2 style="font-size:20px">How was your cut?</h2><div class="stars-in" style="margin:8px 0">${[1, 2, 3, 4, 5].map(n => `<button data-n="${n}">★</button>`).join('')}</div><textarea rows="3" maxlength="600" placeholder="Tell others about your visit (optional)"></textarea><div id="rverr"></div><div class="row" style="margin-top:12px"><button class="btn ghost sp" data-x>Not now</button><button class="btn sp" data-send>Post review</button></div></div>`;
  o.addEventListener('click', async e => {
    if (e.target === o || e.target.dataset.x != null) return o.remove();
    if (e.target.dataset.n) { rating = +e.target.dataset.n; o.querySelectorAll('.stars-in button').forEach((b, i) => b.classList.toggle('on', i < rating)); }
    if (e.target.dataset.send != null) {
      try { await api('/reviews', { method: 'POST', body: { bookingId, rating, text: o.querySelector('textarea').value } }); o.remove(); toast('Thanks for your review!'); await loadBookings(); S.D = null; render(); }
      catch (x) { o.querySelector('#rverr').innerHTML = `<div class="err">${esc(x.message)}</div>`; }
    }
  });
  document.body.appendChild(o);
}

(async function init() {
  if (S.token) await loadMe();
  if (S.token) loadBookings().then(render);
  onRoute();
})();
