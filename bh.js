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
Object.assign(ICON, { bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>', grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>', star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>' });
const ic = n => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICON[n]}</svg>`;
const stars = n => '<span class="star">' + '★'.repeat(Math.round(n)) + '</span><span style="color:var(--line)">' + '★'.repeat(5 - Math.round(n)) + '</span>';
const pic = (url, name, cls = 'av') => url ? `<img class="${cls}" src="${esc(url)}" alt="${esc(name)}" loading="lazy">` : `<span class="${cls}">${esc(initials(name))}</span>`;
const rate = (a, n) => n ? `<span class="star">★</span> ${a.toFixed(1)} <span class="mute">(${n})</span>` : '<span class="mute sm">New</span>';
const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { } } };

const S = { token: store.get('bh_token'), user: null, favs: [], D: null, q: '', branch: '', specialty: '', avail: false, sort: 'best', tab: 'barbers', bk: null, mine: null, auth: { mode: 'login', err: '', busy: false }, err: '', pro: null, proToken: store.get('bh_pro'), proTab: 'dash', rules: null, nsw: null, blocks: null, shop: null, loyal: null, health: null, ret: null, insDays: 30, lapDays: 45, pkg: '', style: '', verified: false, minRating: 0, R: null, fresh: null, ctab: 'feed', cstyle: '', cq: '', spot: null, cuts: null, proPin: false, unread: 0, notifs: null, feed: null, feedScope: 'all', comp: { text: '', img: null, busy: false, err: '' }, open: {}, reports: null, dash: null, dashRange: 'week', toastMsg: '' };

// sent with a booking so a double tap or a retry never makes a second booking: the same choices in this visit give the same key
const newVisit = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now());
let BK_VISIT = newVisit();   // renewed after every successful booking
const bkKey = k => [BK_VISIT, k.branchId, k.staffId, k.date, k.time, (k.items || []).join('.'), k.repEvery || 0].join('|').slice(0, 180);
async function api(path, opt = {}, token = S.token) {
  const r = await fetch('/api/bh' + path, { method: opt.method || 'GET', headers: { ...(opt.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(opt.headers || {}) }, body: opt.body ? JSON.stringify(opt.body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error || 'Something went wrong'); e.code = r.status; throw e; }
  return j;
}
function toast(m) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), Math.max(2400, String(m).length * 55)); }
const nav = h => { location.hash = h; };
const route = () => { const [a, b, c] = (location.hash.slice(1) || '/').split('/').filter(Boolean); return { a: a || 'home', b, c }; };

// ---------- data ----------
async function loadDiscover() {
  S.D = await api('/discover');   // the unfiltered base (Home, Map, shop pages, booking); Discover's filtered results live in S.R
}
async function loadMe() {
  S.loyal = null;
  if (!S.token) { S.user = null; S.favs = []; return; }
  try { const j = await api('/me'); S.user = j.user; S.favs = j.favorites; S.unread = j.unread || 0; } catch (e) { if (e.code === 401) { S.token = null; store.set('bh_token', null); S.user = null; } }
}
async function loadBookings() { if (!S.token) { S.mine = null; return; } try { S.mine = (await api('/bookings')).bookings; } catch { S.mine = []; } }

// ---------- views ----------
const header = (title, back) => { const ra = location.hash.slice(2).split('/')[0] || 'home', uIni = S.user ? initials(S.user.name) : ''; return `<div class="bar">${back ? `<button class="btn sec sm round" data-go="${back}" aria-label="Back">${ic('back')}</button>` : ''}<div class="${title ? '' : 'logo'}">${title ? `<h2 style="font-size:20px">${esc(title)}</h2>` : logoText()}</div><span class="sp"></span>${S.user ? `<button class="btn sec sm round bellb" data-go="/notifications" aria-label="Notifications${S.unread ? ', ' + S.unread + ' unread' : ''}">${ic('bell')}${S.unread ? '<span class="badge dotb"></span>' : ''}</button><button class="btn sec sm round uav" data-go="/profile" aria-label="Profile">${esc(uIni)}</button>` : (['auth', 'pro'].includes(ra) ? '' : `<button class="btn sm" data-go="/auth">Log in</button>`)}</div>`; };
const barberRow = b => `<button class="bcard" data-go="/barber/${b.id}">${pic(b.photo, b.name)}<div class="sp"><div class="nm">${esc(b.name)}${b.verified ? `<span class="ver" title="Verified professional">${ic('ver')}</span>` : ''}</div>
  <div class="sm mute">${esc(b.headline || b.specialties.join(' · ') || 'Barber')} · ${esc(b.branchName)}</div><div class="sm row" style="margin-top:3px;flex-wrap:wrap;gap:6px">${rate(b.rating, b.reviews)}${b.years ? `<span class="mute">· ${b.years} yrs</span>` : ''}${b.slotsToday ? `<span class="tag ok">${b.slotsToday} slots today</span>` : ''}</div></div></button>`;
const svcFor = bid => (S.D && S.D.shopSvc && S.D.shopSvc[bid]) || (S.D && S.D.services) || [];   // a partner shop has its own menu
const minPrice = bid => { const p = svcFor(bid).map(x => +x.price).filter(x => x > 0); return p.length ? Math.min(...p) : 0; };
const brandTag = n => n ? `<span class="brandt">${esc(n)}</span>` : '';
const shopCard = s => `<button class="shop" data-shop="${s.id}">${s.photo ? `<img src="${esc(s.photo)}" alt="${esc(s.name)}" loading="lazy">` : ''}<div class="in"><div class="nm">${esc(s.name)} ${brandTag(s.brand)}</div>
  <div class="sm mute">${ic('pin').replace('class="i"', 'class="i" style="width:14px;height:14px;vertical-align:-2px"')} ${esc(s.address || s.name)} · ${t12(s.openTime)}–${t12(s.closeTime)}</div><div class="sm" style="margin-top:2px">${rate(s.rating, s.reviews)} <span class="mute">· ${s.barbers} barbers</span></div></div></button>`;

const barberTile = (b, badge) => `<button class="tile" data-go="/barber/${b.id}"><div class="tw">${(b.photo || b.cover) ? `<img class="tp" src="${esc(b.photo || b.cover)}" alt="${esc(b.name)}" loading="lazy">` : `<span class="tp ph">${esc(initials(b.name))}</span>`}${badge ? `<span class="tbadge">${esc(badge)}</span>` : ''}</div><div class="tb"><div class="nm tl">${esc(b.name)}${b.verified ? `<span class="ver" title="Verified professional">${ic('ver')}</span>` : ''}</div><div class="sm mute tl">${b.reviews ? `<span class="star">★</span> ${b.rating.toFixed(1)} · ` : ''}${esc(b.branchName)}</div>${b.slotsToday ? `<div class="sm tl tfree">${b.slotsToday} open today</div>` : ''}</div></button>`;
const shopTile = s => `<button class="tile wide" data-shop="${s.id}">${s.photo ? `<img class="tp" src="${esc(s.photo)}" alt="${esc(s.name)}" loading="lazy">` : `<span class="tp ph">${esc(initials(s.name))}</span>`}<div class="tb"><div class="nm tl">${esc(s.name)}</div><div class="sm mute tl">${s.reviews ? `<span class="star">★</span> ${s.rating.toFixed(1)} · ` : ''}${s.barbers ? s.barbers + ' barber' + (s.barbers === 1 ? '' : 's') : esc(s.brand || s.address || 'Barbershop')}</div><div class="sm tl" style="margin-top:4px">${openPill(s)}</div></div></button>`;
// ----- phase 2 polish: greeting, quick actions, booking tickets, friendly empty states -----
const greet = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
const untilTxt = b => {
  const ms = new Date(`${b.date}T${b.time}:00`) - Date.now(); if (ms <= 0) return 'Now';
  if (ms < 36e5) return 'In ' + Math.max(1, Math.round(ms / 6e4)) + ' min';
  if (b.date === ymd(new Date())) return 'Today';
  if (b.date === ymd(new Date(Date.now() + 864e5))) return 'Tomorrow';
  return 'In ' + Math.round((new Date(b.date + 'T00:00:00') - new Date(ymd(new Date()) + 'T00:00:00')) / 864e5) + ' days';
};
const ticket = (b, extra = '') => { const d = new Date(b.date + 'T00:00:00'); return `<div class="tkt2 pop"><div class="tk-d"><span>${d.toLocaleDateString('en-PH', { month: 'short' })}</span><b>${d.getDate()}</b><span>${d.toLocaleDateString('en-PH', { weekday: 'short' })}</span></div><div class="tk-b"><div class="row"><span class="tk-pill">${esc(untilTxt(b))}</span><span class="sp"></span><b class="num" style="font-size:17px">${t12(b.time)}</b></div><div class="nm" style="margin-top:7px">${esc((b.items || []).map(i => i.name).join(' + ') || 'Haircut')}</div><div class="sm mute">${esc(b.staffName || 'Any barber')} · ${esc(b.branchName || '')}</div>${extra}</div></div>`; };
const emptyBox = (icon, title, sub, cta = '') => `<div class="ebox pop"><span class="eic">${ic(icon)}</span><b>${title}</b><span class="sm mute">${sub}</span>${cta}</div>`;
const quickActions = () => `<div class="quick pop">${[['search', 'Find a barber', 'data-go="/discover"'], ['cal', 'Bookings', 'data-go="/bookings"'], ['star', 'Rewards', S.token && S.loyal ? 'data-rewards' : 'data-go="/auth"'], ['scissors', 'Find your cut', 'data-go="/style"']].map(([i, l, a]) => `<button class="qa" ${a}><span>${ic(i)}</span><small>${l}</small></button>`).join('')}</div>`;
function vHome() {
  const D = S.D, up = (S.mine || []).filter(b => b.status === 'booked' && b.date >= ymd(new Date())).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
  const first = S.user ? esc(S.user.name.split(' ')[0]) : '';
  const hero = `<div class="hero ph pop"><div class="hero-bg"></div><div class="hero-in"><h1>The art of<br>the proper cut.</h1><p>Choose your barber and your time. Settle at the shop.</p><button class="btn" data-go="/discover">Book a chair</button></div></div>`;
  const next = up ? `<div class="sec-h"><h2>Your next cut</h2><button class="link" data-go="/bookings">Manage</button></div>${ticket(up)}` : '';
  return header() + (S.user ? `<div class="greet pop"><div class="sm mute">${greet()}, ${first}</div><h1>${up ? 'Your chair<br>is waiting.' : 'Welcome back.'}</h1></div>${next}${hero}${ptsStrip()}` : hero + next)
  + installCard();
}
// ----- Discover: a marketplace of barbers and haircuts -----
Object.assign(ICON, { chev: '<path d="m9 6 6 6-6 6"/>', lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>', doc: '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>', shield: '<path d="M12 3 4 6.5v5c0 4.8 3.4 8.3 8 9.5 4.6-1.2 8-4.7 8-9.5v-5z"/>', cam: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>' });
Object.assign(ICON, { gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>' });
Object.assign(ICON, { filter: '<path d="M4 6h8M16 6h4M4 12h2M10 12h10M4 18h10M18 18h2"/><circle cx="14" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="16" cy="18" r="2"/>' });
Object.assign(ICON, { clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>' });
const emptyD = (t, p, clear) => `<div class="dempty"><div class="dei">${ic('search')}</div><b>${esc(t)}</b><p>${esc(p)}</p>${clear ? '<button class="btn ghost sm" data-dreset>Clear all filters</button>' : ''}</div>`;
const SORTS = [['best', 'Best match'], ['cheapest', 'Lowest price'], ['soonest', 'Soonest available'], ['trending', 'Trending this week'], ['rating', 'Top rated'], ['nearest', 'Nearest to me'], ['experience', 'Most experienced'], ['name', 'A to Z']];
const discoverActive = () => !!(S.q || S.branch || S.style || S.pkg || S.avail || S.minRating || S.verified || S.sort !== 'best' || S.tab === 'shops');
async function loadResults() {
  if (!discoverActive()) { S.R = null; return; }
  const qs = new URLSearchParams({ q: S.q, branch: S.branch, specialty: S.specialty, style: S.style, pkg: S.pkg, available: S.avail ? '1' : '', verified: S.verified ? '1' : '', minRating: S.minRating || '', sort: S.sort === 'nearest' ? 'best' : S.sort });
  try { S.R = await api('/discover?' + qs); } catch { S.R = { barbers: [], shops: [] }; }
}
async function loadFresh() { try { S.fresh = (await api('/cuts')).items.filter(i => i.image).slice(0, 14); } catch { S.fresh = []; } }
const shopOf = id => (S.D?.shops || []).find(s => s.id === id);
const withKm = list => list.map(b => { const sh = shopOf(b.branchId); return { ...b, km: S.geo && sh && sh.lat != null ? kmBetween(S.geo.lat, S.geo.lng, sh.lat, sh.lng) : null }; });
const secRow = (title, attr, inner = '') => `<div class="sec-h"><h2>${title}</h2>${attr ? `<button class="link" ${attr}>See all</button>` : ''}</div>${inner}`;
const toM = t => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
const shopOpen = s => { if (!s) return null; const d = new Date(), n = d.getHours() * 60 + d.getMinutes(), o = toM(s.openTime || '09:00'), c = toM(s.closeTime || '21:00'); return n >= o && n < c ? { open: true, txt: `Open · until ${t12(s.closeTime || '21:00')}`, soon: c - n <= 60 } : { open: false, txt: `Closed · opens ${t12(s.openTime || '09:00')}` }; };
const openPill = s => { const o = shopOpen(s); return o ? `<span class="opill ${o.open ? (o.soon ? 'soon' : 'on') : ''}"><i></i>${o.open && o.soon ? 'Closing soon' : o.txt}</span>` : ''; };
const recentIds = () => { try { return JSON.parse(localStorage.getItem('bh_recent') || '[]'); } catch { return []; } };
const pushRecent = id => { try { const r = recentIds().filter(x => x !== id); r.unshift(id); localStorage.setItem('bh_recent', JSON.stringify(r.slice(0, 12))); } catch {} };
const barberBig = b => {
  const sel = S.pkg ? b.offers.find(o => o.pkg === S.pkg) : null, price = sel ? sel.price : (b.fromPrice || (b.brand ? minPrice(b.branchId) : 0));
  const img = b.cover || b.photo, fav = !!S.token && S.favs.includes(b.id), tags = [b.brand ? 'Partner' : '', b.weekCuts ? `${b.weekCuts} this week` : '', b.level ? esc(b.level) : '', !b.reviews && !b.weekCuts && !b.verified ? 'New' : ''].filter(Boolean);
  const styles = (b.styles && b.styles.length ? b.styles : b.specialties).slice(0, 3);
  return `<article class="bigc pro"><div class="bigimg" data-go="/barber/${b.id}" role="link" aria-label="${esc(b.name)}" style="${img ? `background-image:url('${esc(img)}')` : ''}">${img ? '' : `<span class="ph">${esc(initials(b.name))}</span>`}<div class="tagrow top">${tags.map(t => `<span class="mtag">${t}</span>`).join('')}</div><button class="hbtn ${fav ? 'on' : ''}" data-fav="${b.id}" aria-label="${fav ? 'Unfollow' : 'Follow'}">${ic('heart')}</button>
  <div class="bigcap">${b.photo && b.cover ? `<img class="bav" src="${esc(b.photo)}" alt="" loading="lazy">` : ''}<div class="sp" style="min-width:0"><div class="bnm">${esc(b.name)}${b.verified ? `<span class="ver" title="Verified professional">${ic('ver')}</span>` : ''}</div><div class="bsub">${esc(b.headline || b.specialties[0] || "Barber")}</div></div>${b.reviews ? `<span class="rpill">★ ${b.rating.toFixed(1)}<em>${b.reviews}</em></span>` : ''}</div></div>
  <div class="bigb"><div class="row" style="gap:10px;align-items:center"><div class="sp" data-go="/barber/${b.id}" style="min-width:0;cursor:pointer">
    <div class="bmeta">${b.nextSlot ? `<span class="nfree">${ic('clock')}Next ${t12(b.nextSlot)}</span>` : '<span class="nfull">Fully booked today</span>'}<span class="mute tl">${b.brand ? esc(b.brand) + ' · ' : ''}${esc(b.branchName)}${b.km != null ? ' · ' + kmText(b.km) : ''}</span></div>
    ${styles.length ? `<div class="bstyles">${styles.map(x => `<span>${esc(x)}</span>`).join('')}</div>` : ''}</div>
    <div class="bbook">${price ? `<div class="bfrom"><span>${sel ? esc(PK[S.pkg].short) : 'from'}</span><b class="num">${peso(price)}</b></div>` : ''}<button class="btn sm" data-qbook="${b.id}" data-qbr="${b.branchId}">Book</button></div></div></div></article>`;
};
const BANNERS = [
  { k: 'Book in seconds', t: 'Skip the wait.', p: 'Pick a shop, a barber and a time. Free for customers.', cta: 'Book now', a: 'data-bookany', img: '/site/home-work2.jpg' },
  { k: 'Style finder', t: 'Find your cut.', p: 'Pick your face shape and get cut ideas to show your barber.', cta: 'Find my style', a: 'data-go="/style"', img: '/site/home-work3.jpg' },
  { k: 'Community', t: 'Show the fresh cut.', p: 'Post it, tag your barber and join the brotherhood.', cta: 'Open Community', a: 'data-go="/community"', img: '/site/home-store1.jpg' }
];
function filterBar() {
  const D = S.D, label = Object.fromEntries(SORTS), shopName = S.branch ? (shopOf(S.branch)?.name || 'Shop') : 'All shops';
  return `<div class="fbar"><div class="chips"><button class="chip" data-fsheet aria-label="All filters">${ic('filter').replace('class="i"', 'class="i" style="width:16px;height:16px;vertical-align:-3px"')}</button><button class="chip ${S.sort !== 'best' ? 'on' : ''}" data-fsort>${esc(label[S.sort])} ▾</button><button class="chip ${S.avail ? 'on' : ''}" data-avail>Available today</button><button class="chip ${S.minRating ? 'on' : ''}" data-frate>★ 4.0+</button><button class="chip ${S.verified ? 'on' : ''}" data-fver>✓ Verified</button><button class="chip ${S.branch ? 'on' : ''}" data-floc>${esc(shopName)} ▾</button><button class="chip ${S.pkg ? 'on' : ''}" data-fpkg>${S.pkg ? esc(PK[S.pkg].short) : 'Service'} ▾</button><button class="chip ${S.style ? 'on' : ''}" data-fstyle>${S.style ? esc(S.style) : 'Style'} ▾</button></div></div>`;
}
function vDiscover() {
  const D = S.D, active = discoverActive(), locLabel = S.branch ? (shopOf(S.branch)?.name || 'Shop') : S.geo ? 'Near you' : 'All shops';
  const head = `<div class="dhead" id="dhead"><div class="row" style="margin-bottom:10px"><button class="locchip" data-floc aria-label="Choose location">${ic('pin')}<b>${esc(locLabel)}</b><span>▾</span></button><span class="sp"></span><button class="iconb" data-go="/map" aria-label="Shops on the map">${ic('map')}</button></div>
    <div class="row" style="gap:8px"><div class="search sp">${ic('search')}<input id="q" placeholder="Barbers, haircuts or shops" value="${esc(S.q)}" autocomplete="off" enterkeyhint="search"></div><button class="iconb fbtn ${discoverActive() ? 'on' : ''}" data-fsheet aria-label="Filters">${ic('filter')}</button></div></div>`;
  if (!D) return head + '<div class="skel"><div class="sk" style="height:190px;border-radius:24px"></div><div class="row" style="gap:12px">' + '<div class="sk" style="width:64px;height:64px;border-radius:50%;flex:none"></div>'.repeat(5) + '</div><div class="sk h2"></div><div class="sk" style="height:260px"></div></div>';
  let body = '';
  if (!active) {
    const all_ = withKm(D.barbers), counts = new Map((D.styleTiles || []).map(t => [t.name, t])), tiles = CUTS.map(c => ({ name: c.name, n: counts.get(c.name)?.n || 0, image: counts.get(c.name)?.image || '' })).sort((x, y) => y.n - x.n);
    const soon = all_.filter(b => b.nextSlot).sort((x, y) => x.nextSlot.localeCompare(y.nextSlot)).slice(0, 10), hot = all_.filter(b => b.weekCuts > 0).sort((x, y) => y.weekCuts - x.weekCuts).slice(0, 10);
    const openN = D.shops.filter(x => shopOpen(x)?.open).length, freeN = all_.filter(b => b.nextSlot).length;
    const rated = all_.filter(b => b.reviews > 0).sort((x, y) => y.rating - x.rating || y.reviews - x.reviews).slice(0, 10);
    const rIds = recentIds(), recent = rIds.map(id => all_.find(b => b.id === id)).filter(Boolean).slice(0, 10);
    const styleRow = tiles.slice(0, 12).map(t => `<button class="stile ${S.style === t.name ? 'on' : ''}" data-dstyle="${esc(t.name)}">${t.image ? `<img src="${esc(t.image)}" alt="" loading="lazy">` : `<span class="g ini">${esc(t.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2))}</span>`}<span class="tl" style="display:block">${esc(t.name)}</span></button>`).join('');
    body = `<div class="banners" id="banners">${BANNERS.map(n => `<div class="banner ph" style="background-image:url('${n.img}')"><div class="bnin"><span class="kick">${esc(n.k)}</span><h3>${esc(n.t)}</h3><p>${esc(n.p)}</p><button class="btn white sm" ${n.a}>${esc(n.cta)}</button></div></div>`).join('')}</div>
    <div class="dots" id="bdots">${BANNERS.map((_, i) => `<span class="${i ? '' : 'on'}"></span>`).join('')}</div>
    <div class="pulse"><div><span class="ldot"></span><b class="num">${openN}/${D.shops.length}</b> shops open</div><div><b class="num">${freeN}</b> barber${freeN === 1 ? '' : 's'} free today</div></div>
    ${recent.length ? secRow('Jump back in', '') + `<div class="hscroll">${recent.map(b => barberTile(b, b.nextSlot ? 'Next ' + t12(b.nextSlot) : '')).join('')}</div>` : ''}
    ${secRow('Browse by style', '')}<div class="srow1">${styleRow}</div>
    ${soon.length ? secRow('Free today', 'data-dsee="soonest"') + `<div class="hscroll">${soon.map(b => barberTile(b, 'Next ' + t12(b.nextSlot))).join('')}</div>` : ''}
    ${rated.length ? secRow('Top rated', 'data-dsee="rating"') + `<div class="hscroll">${rated.map(b => barberTile(b, '★ ' + b.rating.toFixed(1))).join('')}</div>` : ''}
    ${hot.length ? secRow('Trending this week', 'data-dsee="trending"') + `<div class="hscroll">${hot.map(b => barberTile(b, '' + b.weekCuts + ' cut' + (b.weekCuts === 1 ? '' : 's'))).join('')}</div>` : ''}
    ${S.fresh && S.fresh.length ? secRow('Fresh cuts', '') + `<div class="hscroll">${S.fresh.map((i, k) => `<button class="tile sq" data-fresh="${k}"><div class="tw"><img class="tp" src="${esc(i.image)}" alt="${esc(i.title)}" loading="lazy">${i.style ? `<span class="tbadge">${esc(i.style)}</span>` : ''}</div><div class="tb"><div class="sm tl"><b>${esc(i.title)}</b></div><div class="sm mute tl">${esc(i.barberName || i.author || '')}</div></div></button>`).join('')}</div>` : ''}
    ${secRow('Top shops', 'data-dsee="shops"')}<div class="hscroll">${D.shops.map(shopTile).join('')}</div>
    ${filterBar()}<div class="sec-h" style="margin-top:8px"><h2>Explore barbers nearby</h2><span class="mute sm">${all_.length}</span></div><div class="list">${all_.map(barberBig).join('') || emptyD('No barbers yet', 'Barbers will show up here once they join.')}</div>`;
  } else {
    const R = S.R, shopsMode = S.tab === 'shops';
    let list = R ? withKm(R.barbers) : null; if (list && S.sort === 'nearest') list.sort((x, y) => (x.km ?? 1e9) - (y.km ?? 1e9));
    body = filterBar() + `<div class="row" style="margin:6px 0 10px"><div class="tabs sp" style="margin:0"><button class="${!shopsMode ? 'on' : ''}" data-tab="barbers">Barbers</button><button class="${shopsMode ? 'on' : ''}" data-tab="shops">Shops</button></div><button class="link" data-dreset>Clear all</button></div>
    ${!R ? skelList() : shopsMode ? `<div class="list">${R.shops.map(shopCard).join('') || emptyD('No shops match', 'Try another search or clear your filters.', 1)}</div>` : `<div class="mute sm" style="margin-bottom:8px">${list.length} barber${list.length === 1 ? '' : 's'}${S.sort === 'nearest' && !S.geo ? ' · allow location to sort by distance' : ''}</div><div class="list">${list.map(barberBig).join('') || emptyD('No barbers match', 'Try removing a filter or searching another name.', 1)}</div>`}`;
  }
  return head + body;
}
function pickSheet(title, opts, cur, cb) {
  const o = sheet(`<h3>${esc(title)}</h3>${opts.map(([v, l, sub]) => `<button class="opt" data-pick="${esc(v)}"><span class="sp"><b>${esc(l)}</b>${sub ? `<span class="sm mute">${esc(sub)}</span>` : ''}</span><span class="ck">${String(cur) === String(v) ? '✓' : ''}</span></button>`).join('')}`);
  o.addEventListener('click', e => { const b = e.target.closest('[data-pick]'); if (b) { o.remove(); cb(b.dataset.pick); } });
}
async function refreshResults() { await loadResults(); render(); }
function nearMe() {
  return new Promise(ok => {
    if (!navigator.geolocation) { toast('Your browser cannot share its location'); return ok(false); }
    navigator.geolocation.getCurrentPosition(p => { S.geo = { lat: p.coords.latitude, lng: p.coords.longitude }; ok(true); }, () => { toast('Allow location access to use Near me'); ok(false); }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  });
}
function shopOptions() { return (S.D?.shops || []).map(s => { const km = S.geo && s.lat != null ? kmBetween(S.geo.lat, S.geo.lng, s.lat, s.lng) : null; return [s.id, s.brand ? `${s.name} · ${s.brand}` : s.name, `${t12(s.openTime)}–${t12(s.closeTime)}${km != null ? ' · ' + kmText(km) : ''} · ${s.barbers} barber${s.barbers === 1 ? '' : 's'}`, km]; }).sort((a, b) => (a[3] ?? 1e9) - (b[3] ?? 1e9)); }
function openShopPicker(mode, svc) {
  const opts = shopOptions().filter(([id]) => mode !== 'svc' || !shopOf(id)?.brand).map(([id, n, sub]) => [id, n, sub]);
  if (mode === 'filter') opts.unshift(['', 'All shops', ''], ['__near', 'Near me', 'Sort by distance from you']);
  pickSheet(mode === 'svc' ? `Where do you want your ${svc.name}?` : mode === 'book' ? 'Choose a shop to book' : 'Choose a shop', opts, mode === 'filter' ? S.branch : '', async v => {
    if (v === '__near') { if (await nearMe()) { S.branch = ''; S.sort = 'nearest'; await refreshResults(); } return; }
    if (mode === 'filter') { S.branch = v; return refreshResults(); }
    startBooking(v, 'any'); if (svc) { S.bk.items = [svc.id]; loadSlots(); } if (!S.token) nav('/auth');
  });
}
function openFilters() {
  const o = sheet(''), draw = () => {
    const chip = (attr, val, label, on) => `<button class="chip ${on ? 'on' : ''}" ${attr}="${esc(val)}">${esc(label)}</button>`;
    o.querySelector('.sheet').innerHTML = `<h3>Filters</h3>
      <div class="sm mute" style="margin:8px 0 4px">Sort by</div><div class="chips" style="flex-wrap:wrap">${SORTS.map(([v, l]) => chip('data-xs', v, l, S.sort === v)).join('')}</div>
      <div class="sm mute" style="margin:8px 0 4px">Shop</div><div class="chips" style="flex-wrap:wrap">${chip('data-xb', '', 'All shops', !S.branch)}${(S.D?.shops || []).map(s => chip('data-xb', s.id, s.name, S.branch === s.id)).join('')}</div>
      <div class="sm mute" style="margin:8px 0 4px">Service</div><div class="chips" style="flex-wrap:wrap">${chip('data-xp', '', 'Any service', !S.pkg)}${PKGS.map(([k, n]) => chip('data-xp', k, n, S.pkg === k)).join('')}</div>
      <div class="sm mute" style="margin:8px 0 4px">Style</div><div class="chips" style="flex-wrap:wrap">${chip('data-xy', '', 'Any style', !S.style)}${CUTS.map(c => chip('data-xy', c.name, c.name, S.style === c.name)).join('')}</div>
      <div class="sm mute" style="margin:8px 0 4px">More</div><div class="chips" style="flex-wrap:wrap">${chip('data-xa', '1', 'Available today', S.avail)}${chip('data-xr', '1', '★ 4.0+', S.minRating)}${chip('data-xv', '1', '✓ Verified', S.verified)}</div>
      <div class="row" style="margin-top:16px"><button class="btn ghost sp" data-xreset>Clear all</button><button class="btn sp" data-x>Show results</button></div>`;
  };
  draw();
  o.addEventListener('click', async e => {
    const t = e.target.closest('[data-xs],[data-xb],[data-xp],[data-xy],[data-xa],[data-xr],[data-xv],[data-xreset]'); if (!t) { if (e.target === o || e.target.closest('[data-x]')) refreshResults(); return; }
    const d = t.dataset;
    if ('xs' in d) { if (d.xs === 'nearest' && !S.geo && !(await nearMe())) return; S.sort = d.xs; } else if ('xb' in d) S.branch = d.xb; else if ('xp' in d) S.pkg = d.xp; else if ('xy' in d) S.style = d.xy; else if ('xa' in d) S.avail = !S.avail; else if ('xr' in d) S.minRating = S.minRating ? 0 : 4; else if ('xv' in d) S.verified = !S.verified;
    else if ('xreset' in d) resetDiscover();
    draw(); loadResults();
  });
}
function resetDiscover() { S.q = ''; S.branch = ''; S.specialty = ''; S.style = ''; S.pkg = ''; S.avail = false; S.minRating = 0; S.verified = false; S.sort = 'best'; S.tab = 'barbers'; S.R = null; }
let bannerTimer = null;
function afterDiscover() {
  const dh = document.getElementById('dhead'); if (dh) document.documentElement.style.setProperty('--dh', dh.offsetHeight - 1 + 'px');
  clearInterval(bannerTimer); const bn = document.getElementById('banners'); if (!bn) return;
  const dots = [...document.querySelectorAll('#bdots span')], step = () => bn.children[0] ? bn.children[0].offsetWidth + 10 : 300;
  const mark = () => { const i = Math.round(bn.scrollLeft / step()); dots.forEach((d, k) => d.classList.toggle('on', k === i)); };
  bn.addEventListener('scroll', () => requestAnimationFrame(mark), { passive: true });
  bannerTimer = setInterval(() => { if (route().a !== 'discover' || !document.getElementById('banners') || document.hidden) return clearInterval(bannerTimer); const i = Math.round(bn.scrollLeft / step()); bn.scrollTo({ left: ((i + 1) % BANNERS.length) * step(), behavior: 'smooth' }); }, 5000);
}
const fmtMonth = d => { if (!d) return ''; if (/^\d{4}$/.test(d)) return d; const dt = new Date((d.length === 7 ? d + '-01' : d) + 'T00:00:00'); return dt.toLocaleDateString('en-PH', d.length === 7 ? { month: 'short', year: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' }); };
const certThumb = c => c.image ? `<img src="${esc(c.image)}" alt="Certificate: ${esc(c.title)}" data-lb="${esc(c.image)}" loading="lazy" style="width:64px;height:64px;border-radius:10px;object-fit:cover;cursor:zoom-in;flex:none">` : `<span class="av" style="width:64px;height:64px;border-radius:10px">${ic('star')}</span>`;
const certRow = c => `<div class="card row">${certThumb(c)}<div class="sp"><div class="nm">${esc(c.title)}${c.verified ? '<span class="tag ok">Verified</span>' : ''}</div><div class="sm mute">${esc([c.org, fmtMonth(c.date)].filter(Boolean).join(' · ') || 'Seminar')}</div></div></div>`;
const photosEditor = sel => `<div class="sec-h"><h2>Photos</h2></div><div class="card" style="padding:0;overflow:hidden"><div style="height:130px;background:linear-gradient(135deg,#1e2024,#0f1012);${sel.cover ? `background-image:url('${esc(sel.cover)}');` : ''}background-size:cover;background-position:center"></div>
  <div style="padding:0 14px 14px"><div class="row" style="margin-top:-34px;align-items:flex-end">${pic(sel.photo, sel.name, 'av lg')}<span class="sp"></span></div>
  <div class="sm mute" style="margin:8px 0 10px">${sel.cover ? 'This is your cover photo.' : 'No cover photo yet. Until you add one, your latest cut is used as your cover.'} A wide photo works best.</div>
  <div class="row" style="flex-wrap:wrap;gap:8px"><label class="btn sec sm" style="cursor:pointer">Change profile photo<input type="file" id="pavatar" accept="image/*" hidden></label><label class="btn sec sm" style="cursor:pointer">${sel.cover ? 'Change cover photo' : 'Add cover photo'}<input type="file" id="pcoverf" accept="image/*" hidden></label>${sel.cover ? '<button class="btn danger sm" data-covdel>Remove cover</button>' : ''}</div></div></div>
`;
const certEditor = sel => `<div class="sec-h"><h2>Seminars & certificates</h2><span class="mute sm">${sel.certs.length}</span></div>
  <div class="list">${sel.certs.map(c => `<div class="card row">${certThumb(c)}<div class="sp"><div class="nm">${esc(c.title)}${c.verified ? '<span class="tag ok">Verified</span>' : ''}</div><div class="sm mute">${esc([c.org, fmtMonth(c.date)].filter(Boolean).join(' · ') || 'Seminar')}</div></div><div style="display:grid;gap:4px">${S.pro.admin ? `<button class="btn sec sm" data-cverify="${c.id}" data-on="${c.verified ? 1 : 0}">${c.verified ? 'Unverify' : 'Verify'}</button>` : ''}<button class="btn danger sm" data-certdel="${c.id}">Remove</button></div></div>`).join('') || '<div class="card empty">Add the seminars you attended. Customers trust barbers who keep learning.</div>'}</div>
  <form id="certf" class="card" style="margin-top:10px"><label class="f" style="margin-top:0">Seminar or certificate name<input name="title" maxlength="100" required placeholder="e.g. Fade Masterclass"></label><label class="f">Organizer (optional)<input name="org" maxlength="80" placeholder="e.g. Viro Bodyworks"></label>
  <label class="f">Month attended (optional)<input name="date" type="month"></label><label class="f">Photo of the certificate (optional)<input name="file" type="file" accept="image/*"></label>${S.certErr ? `<div class="err">${esc(S.certErr)}</div>` : ''}<button class="btn block" style="margin-top:12px" ${S.certBusy ? 'disabled' : ''}>${S.certBusy ? 'Adding…' : 'Add seminar'}</button><p class="mute sm" style="margin:8px 0 0">The owner can mark real certificates as Verified.</p></form>`;
async function vBarber(id) {
  if (!S.cur || S.cur.barber.id !== id) {
    pushRecent(id); try { S.cur = await api('/barbers/' + id, {}, S.token); } catch (e) { S.cur = null; return header('', '/discover') + `<div class="err">${esc(e.message)}</div>`; }
  }
  const j = S.cur, b = j.barber, st = j.stats, fav = !!S.token && S.favs.includes(b.id), tab = S.bTab || 'cuts', today = ymd(new Date());
  const cover = b.cover || (j.portfolio[0] && j.portfolio[0].url) || j.branch.photo || '';
  const soc = [['instagram', 'Instagram'], ['facebook', 'Facebook'], ['tiktok', 'TikTok']].filter(([k]) => b[k]).map(([k, n]) => { const v = b[k], href = /^https?:/i.test(v) ? v : (k === 'instagram' ? 'https://instagram.com/' : k === 'tiktok' ? 'https://tiktok.com/@' : 'https://facebook.com/') + v.replace(/^@/, ''); return `<a class="tag" href="${esc(href)}" target="_blank" rel="noopener">${n}</a>`; }).join('');
  const stat = (v, l) => `<div><b class="num">${v}</b><span>${l}</span></div>`;
  const nf = j.nextFree, nfTxt = nf ? `${nf.date === today ? 'Today' : nf.date === ymd(new Date(Date.now() + 864e5)) ? 'Tomorrow' : fmtDate(nf.date)} · ${t12(nf.time)}` : '';
  const tabs = [['cuts', 'Cuts', 'grid', j.portfolio.length], ['posts', 'Posts', 'chat', j.posts.length], ['reviews', 'Reviews', 'star', b.reviews], ['about', 'About', 'info', j.certs.length]];
  let body = '';
  if (tab === 'cuts') {
    const styles = [...new Set(j.portfolio.map(p => p.style).filter(Boolean))], shown = S.bStyle ? j.portfolio.filter(p => p.style === S.bStyle) : j.portfolio;
    body = (styles.length ? `<div class="chips"><button class="chip ${S.bStyle ? '' : 'on'}" data-bstyle="">All ${j.portfolio.length}</button>${styles.map(x => `<button class="chip ${S.bStyle === x ? 'on' : ''}" data-bstyle="${esc(x)}">${esc(x)} ${j.portfolio.filter(p => p.style === x).length}</button>`).join('')}</div>` : '')
      + (shown.length ? `<div class="pgrid">${shown.map(p => `<button class="pcard" data-cut="${p.id}"><span class="ptag">CUT</span><img src="${esc(p.url)}" alt="${esc(p.caption || 'Haircut by ' + b.name)}" loading="lazy"><div class="pt">${esc(p.caption || p.style || 'Fresh cut')}</div><div class="ps">${esc(p.style || b.name)}</div></button>`).join('')}</div>` : '<div class="card empty">This barber has not added cuts yet.</div>');
  } else if (tab === 'posts') {
    body = (j.posts.length ? `<div class="pgrid">${j.posts.map(p => `<div class="pcard"><span class="ptag">POST</span>${p.image ? `<img src="${esc(p.image)}" alt="" data-lb="${esc(p.image)}" loading="lazy" style="cursor:zoom-in">` : `<div class="ptxt">${esc(String(p.text || '').slice(0, 90))}</div>`}<div class="pt">${esc(String(p.text || 'Photo post').slice(0, 28))}</div><div class="ps">${p.likes} like${p.likes === 1 ? '' : 's'}</div></div>`).join('')}</div>` : `<div class="card empty">No posts yet. Members who tag ${esc(b.name)} in the Community will show up here.</div>`)
      + `<div style="text-align:center;margin-top:12px"><button class="link" data-go="/community">Open Community</button></div>`;
  } else if (tab === 'reviews') {
    body = `<div class="list">${j.reviews.length ? j.reviews.map(r => `<div class="card"><div class="row"><b>${esc(r.name)}</b>${r.verified ? `<span class="tag ok">Verified visit</span>` : ''}<span class="sp"></span><span class="sm mute">${new Date(r.createdAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</span></div><div>${stars(r.rating)}</div>${r.text ? `<p style="margin:6px 0 0">${esc(r.text)}</p>` : ''}${replyBox(r)}</div>`).join('') : '<div class="card empty">No reviews yet. Be the first after your cut.</div>'}</div>`;
  } else {
    body = `${b.bio ? `<p style="margin:0 0 10px">${esc(b.bio)}</p>` : ''}<div class="pill-row" style="margin-bottom:12px">${b.years ? `<span class="tag">${b.years} yrs experience</span>` : ''}${b.specialties.map(x => `<span class="tag">${esc(x)}</span>`).join('')}${soc}</div>
    ${j.certs.length ? `<div class="sec-h" style="margin-top:6px"><h2>Seminars & certificates</h2><span class="mute sm">${j.certs.length}</span></div><div class="list" style="margin-bottom:12px">${j.certs.map(certRow).join('')}</div>` : ''}
    <div class="card row">${ic('pin')}<div class="sp sm"><b>${esc(j.branch.name)}</b>${brandTag(j.branch.brand)}<br><span class="mute">${esc(j.branch.address || '')} · ${t12(j.branch.openTime)}–${t12(j.branch.closeTime)}</span></div><button class="btn sec sm" data-go="/shop/${j.branch.id}">Shop</button></div>
    <div class="sec-h"><h2>Shop menu</h2></div><div class="list">${j.services.map(s => `<div class="card row">${s.photo ? `<img src="${esc(s.photo)}" style="width:48px;height:48px;border-radius:10px;object-fit:cover" alt="">` : ''}<div class="sp"><div class="nm">${esc(s.name)}</div><div class="sm mute">${s.mins || 30} min</div></div><b class="num" style="font-size:18px">${peso(s.price)}</b></div>`).join('')}</div>`;
  }
  return `<div class="pcover" style="background-image:linear-gradient(180deg,rgba(9,9,10,.2),rgba(9,9,10,.88)),url('${esc(cover)}')"></div>
  <div class="bar overcover" style="margin-top:-150px;background:none"><button class="btn sec sm round" data-go="/discover" aria-label="Back">${ic('back')}</button><span class="sp"></span></div>
  <div class="phead">${pic(b.photo, b.name, 'av lg')}<span class="sp"></span><button class="btn sec sm" style="margin-bottom:6px;min-width:104px" data-fav="${b.id}">${fav ? '✓ Following' : '+ Follow'}</button></div>
  <h1 style="font-size:34px;margin-top:12px" class="row">${esc(b.name)}${b.verified ? `<span class="ver" title="Verified professional">${ic('ver')}</span>` : ''}</h1>
  <div class="pill-row" style="margin:6px 0"><span class="gold">${esc(b.level)}</span>${j.certs.length ? `<span class="rankc">🎓 ${j.certs.length} seminar${j.certs.length === 1 ? '' : 's'}</span>` : ''}${j.rankWeek ? `<span class="rankc">Top #${j.rankWeek.rank} this week · ${j.rankWeek.cuts} cut${j.rankWeek.cuts === 1 ? '' : 's'}</span>` : ''}</div>
  <div class="mute sm">${esc(b.headline || 'Barber')} · ${esc(b.branchName)}</div>
  ${(() => { const xs = [[st.cuts, 'Cuts'], st.followers ? [st.followers, 'Followers'] : null, b.reviews ? [b.rating.toFixed(1) + '★', 'Rating'] : null, st.clients ? [st.clients, 'Clients'] : null, st.cuts && st.rebook ? [st.rebook + '%', 'Rebook'] : null].filter(Boolean); return '<div class="stats5" style="grid-template-columns:repeat(' + xs.length + ',1fr)">' + xs.map(([v, l]) => stat(v, l)).join('') + '</div>'; })()}
  <div class="card row" style="margin-top:12px"><span class="dot ${nf ? '' : 'off'}"></span><div class="sp sm">${nf ? `<b>Next free:</b> ${nfTxt}` : '<b>Fully booked</b> for the next 7 days'}<div class="mute">${t12(j.branch.openTime)}–${t12(j.branch.closeTime)} · ${esc(j.branch.name)}</div></div></div>
  ${offersBlock(b)}
  <div class="ptabs">${tabs.map(([k, n, i, c]) => `<button class="${tab === k ? 'on' : ''}" data-btab="${k}">${ic(i)}<span>${n}${c ? ' ' + c : ''}</span></button>`).join('')}</div>
  ${body}
  <div class="foot"><div><div class="sp"><div class="sm mute">${nf ? 'Next free · ' + nfTxt : 'Book with'}</div><b>${esc(b.name)}</b></div><button class="btn" data-book="${b.id}" style="min-width:150px">${ic('cal')} Book now</button></div></div>`;
}
function openCut(p) {
  const j = S.cur, b = j.barber, o = document.createElement('div'); o.className = 'lb'; o.style.alignItems = 'end';
  o.innerHTML = `<div class="card pop" style="width:100%;max-width:720px;border-radius:22px 22px 0 0;padding:14px 14px calc(14px + env(safe-area-inset-bottom));max-height:92vh;overflow:auto"><img src="${esc(p.url)}" alt="" style="width:100%;max-height:55vh;object-fit:contain;border-radius:12px;background:#000;display:block">
    <div style="margin:10px 0 2px"><b>${esc(p.caption || 'Fresh cut')}</b> ${p.style ? `<span class="tag">${esc(p.style)}</span>` : ''}</div><div class="sm mute">by ${esc(b.name)} · ${esc(j.branch.name)}</div>
    <div class="row" style="margin-top:12px"><button class="btn ghost sp" data-x>Close</button><button class="btn sp" data-bookcut>Book this cut</button></div></div>`;
  o.addEventListener('click', e => {
    if (e.target === o || e.target.dataset.x != null) return o.remove();
    if (e.target.closest('[data-bookcut]')) { S.styleNote = `Style I want: ${p.style || 'same as the photo'}${p.caption ? ' (' + p.caption + ')' : ''}. Reference photo by ${b.name}.`; o.remove(); startBooking(b.branchId, b.id); if (!S.token) nav('/auth'); }
  });
  document.body.appendChild(o);
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
  if (k.done) return header('Booked!') + `<div class="done pop"><div class="ckc">${ic('check')}</div><h1>You're booked, ${esc(S.user.name.split(' ')[0])}!</h1><p class="mute">See you ${esc(untilTxt({ date: k.done.date, time: k.done.time }).toLowerCase())} at ${t12(k.done.time)}.</p></div>
  ${ticket({ date: k.done.date, time: k.done.time, items: k.done.items, staffName: k.done.staff, branchName: k.done.branch }, `<div class="row" style="margin-top:10px"><span class="sm mute">Pay at the shop</span><span class="sp"></span><b class="num">${peso(k.done.total)}</b></div>${k.done.promo ? `<div class="sm" style="color:var(--ok);margin-top:4px">Promo ${esc(k.done.promo.code)}: you save ${peso(k.done.promo.amt)} · you pay ${peso(Math.max(0, k.done.total - k.done.promo.amt))}</div>` : ''}`)}
  <div class="sm mute" style="text-align:center;margin:12px 0">You can cancel up to 1 hour before.</div>${seriesHtml(k) ? `<div class="card sm">${seriesHtml(k)}</div>` : ''}${pushCard()}
  <div class="row" style="gap:10px;margin-top:14px"><button class="btn sec sp" data-ics>${ic('cal')} Add to calendar</button><button class="btn sp" data-go="/bookings">View bookings</button></div>`;
  const SV = svcFor(k.branchId), total = SV.filter(s => k.items.includes(s.id)).reduce((t, s) => t + s.price, 0);
  const svcOk = !!(k.items.length || k.pkg), stepN = 1 + (svcOk ? 1 : 0) + 1 + (k.time ? 1 : 0);
  return header('Book a cut', k.staffId !== 'any' ? '/barber/' + k.staffId : '/discover') + `<div class="steps"><div class="stp"><i style="width:${stepN * 25}%"></i></div><span class="sm mute">${!svcOk ? 'Choose a service' : !k.time ? 'Pick a time' : 'Ready to confirm'} · ${stepN} of 4</span></div><div class="card row">${ic('pin')}<div class="sp"><b>${esc(br?.name || '')}</b>${brandTag(br?.brand)}<div class="sm mute">${esc(br?.address || '')}</div></div></div>
  ${k.pkg ? `<div class="card row" style="margin-top:10px"><div class="pa s">${pkgArt(k.pkg.key)}</div><div class="sp"><b>${esc(k.pkg.name)}</b><div class="sm mute">${peso(k.pkg.price)} · the barber's price, pay at the shop</div></div><button class="link" data-rmpkg>Remove</button></div>` : ''}<div class="sec-h"><h2>1 · Barber</h2></div><div class="chips"><button class="chip ${k.staffId === 'any' ? 'on' : ''}" data-bstaff="any">Any available</button>${team.map(b => `<button class="chip ${k.staffId === b.id ? 'on' : ''}" data-bstaff="${b.id}">${esc(b.name)}</button>`).join('')}</div>
  <div class="sec-h"><h2>${k.pkg ? '2 · Time needed' : '2 · Service'}</h2></div>${k.pkg ? '<div class="sm mute" style="margin:-4px 0 8px">Pick the shop service closest to your package so enough time is booked. Your package price applies.</div>' : ''}<div class="list">${SV.map(s => `<button class="svc ${k.items.includes(s.id) ? 'on' : ''}" data-bsvc="${s.id}">${s.photo ? `<img src="${esc(s.photo)}" alt="">` : ''}<div class="sp" style="text-align:left"><div class="nm">${esc(s.name)}</div><div class="sm mute">${s.mins || 30} min</div></div><b class="num">${peso(s.price)}</b><span class="chk">${k.items.includes(s.id) ? ic('check') : ''}</span></button>`).join('')}</div>
  <div class="sec-h"><h2>3 · Date</h2></div><div class="days">${days.map(d => `<button class="day ${k.date === ymd(d) ? 'on' : ''}" data-bday="${ymd(d)}"><span class="sm">${d.toLocaleDateString('en-PH', { weekday: 'short' })}</span><b>${d.getDate()}</b><span class="sm">${d.toLocaleDateString('en-PH', { month: 'short' })}</span></button>`).join('')}</div>
  <div class="sec-h"><h2>4 · Time</h2></div>${!k.items.length ? '<div class="mute sm">Pick a service first.</div>' : k.slots === null ? '<div class="mute sm">Checking availability…</div>' : k.slots.length ? `${[['Morning', t => +t.slice(0, 2) < 12], ['Afternoon', t => +t.slice(0, 2) >= 12 && +t.slice(0, 2) < 17], ['Evening', t => +t.slice(0, 2) >= 17]].map(([lbl, f]) => { const g = k.slots.filter(f); return g.length ? `<div class="tg2">${lbl}</div><div class="slots">${g.map(t => `<button class="slot ${k.time === t ? 'on' : ''}" data-btime="${t}">${t12(t)}</button>`).join('')}</div>` : ''; }).join('')}` : `<div class="card empty">No open slots that day. Try another date or barber.<div style="margin-top:10px"><button class="btn sec sm" data-wl>Notify me if a slot opens</button></div></div>`}
  ${(S.user?.styles || []).length ? `<div class="sm mute" style="margin-top:14px">Add a saved style to your notes</div><div class="chips">${S.user.styles.map(cutById).filter(Boolean).map(c => `<button class="chip" data-snote="${c.id}">${esc(c.name)}</button>`).join('')}</div>` : ''}
  <label class="f">Notes for your barber (optional)<textarea id="bnotes" rows="2" maxlength="300" placeholder="Reference cut, allergies, anything we should know">${esc(k.notes)}</textarea></label>
  ${repeatCard(k)}
  ${br?.brand ? '' : promoCard(k)}
  ${k.err ? `<div class="err">${esc(k.err)}</div>` : ''}
  <div class="foot"><div><div class="sp"><div class="sm mute">${k.pkg ? 'Package · pay at the shop' : 'Total · pay at the shop'}</div>${k.promo ? `<span class="sm mute" style="text-decoration:line-through">${peso(k.pkg ? k.pkg.price : total)}</span> ` : ''}${!k.pkg && !k.items.length ? '<b style="font-size:16px">Pick a service</b>' : `<b class="num" style="font-size:22px">${peso(Math.max(0, (k.pkg ? k.pkg.price : total) - (k.promo ? k.promo.amt : 0)))}</b>`}</div><button class="btn" data-confirm style="min-width:160px" ${k.items.length && k.time && !k.busy ? '' : 'disabled'}>${k.busy ? 'Booking…' : 'Confirm booking'}</button></div></div>`;
}
async function confirmBooking() {
  const k = S.bk; k.busy = true; k.err = ''; render();
  try { const j = await api('/book', { method: 'POST', headers: { 'Idempotency-Key': bkKey(k) }, body: { branchId: k.branchId, staffId: k.staffId, itemIds: k.items, date: k.date, time: k.time, notes: (k.pkg ? `Package: ${k.pkg.name} (${peso(k.pkg.price)}). ` : '') + k.notes, promo: k.promo ? k.promo.code : undefined, repeatEvery: k.repEvery || undefined, repeatCount: k.repEvery ? (k.repCount || 4) : undefined } }); k.done = j.booking; k.series = j.series || []; BK_VISIT = newVisit(); S.mine = null; S.styleNote = ''; }
  catch (e) { k.err = e.message; if (/already used/i.test(e.message)) BK_VISIT = newVisit(); if (/no longer available/i.test(e.message)) loadSlots(); }
  k.busy = false; render();
}

// ----- bookings -----
function vBookings() {
  if (!S.token) return header('Bookings') + `<div class="empty">${ic('cal')}<p>Log in to see your bookings.</p><button class="btn" data-go="/auth">Log in or sign up</button></div>`;
  if (!S.mine) return header('Bookings') + skelList();
  const today = ymd(new Date()), up = S.mine.filter(b => b.status === 'booked' && b.date >= today).reverse(), past = S.mine.filter(b => !up.includes(b));
  const card = b => `<div class="card pop"><div class="row"><b>${fmtDate(b.date)} · ${t12(b.time)}</b><span class="sp"></span><span class="tag ${b.status === 'booked' ? 'on' : b.status === 'cancelled' || b.status === 'noshow' ? 'bad' : 'ok'}">${b.status === 'arrived' ? 'completed' : b.status === 'noshow' ? 'no-show' : esc(b.status)}</span></div>
    <div class="sm mute">${esc(b.items.map(i => i.name).join(' + '))} · ${peso(b.total)}</div><div class="sm mute">${esc(b.staffName || 'Any barber')} · ${esc(b.branchName)}</div>
    <div class="row" style="margin-top:10px;flex-wrap:wrap">${b.canReschedule ? `<button class="btn sec sm" data-resched="${b.id}">Change time</button>` : ''}${b.canCancel ? `<button class="btn danger sm" data-cancel="${b.id}">Cancel</button>` : ''}${b.canReview ? `<button class="btn sm" data-review="${b.id}">Rate your cut</button>` : ''}${b.reviewed ? '<span class="tag ok">Reviewed</span>' : ''}${b.status !== 'booked' ? `<button class="btn sec sm" data-rebook="${b.id}">Book again</button>` : ''}</div></div>`;
  const wl = (S.wait || []).length ? `<div class="sec-h"><h2>Waitlist</h2></div><div class="list">${S.wait.map(w => `<div class="card row"><div class="sp"><b>${fmtDate(w.date)}</b><div class="sm mute">${esc(w.staffName || 'Any barber')} · ${esc(w.branchName)} · we will notify you if a slot opens</div></div><button class="btn danger sm" data-wldel="${w.id}">Remove</button></div>`).join('')}</div>` : '';
  const upCard = b => ticket(b, `<div class="row" style="margin-top:10px;flex-wrap:wrap;gap:8px"><span class="sm mute">${peso(b.total)}</span><span class="sp"></span>${b.canReschedule ? `<button class="btn sec sm" data-resched="${b.id}">Change time</button>` : ''}${b.canCancel ? `<button class="btn danger sm" data-cancel="${b.id}">Cancel</button>` : ''}</div>`);
  return header('My bookings') + wl + `<div class="sec-h"><h2>Upcoming</h2></div><div class="list">${up.map(upCard).join('') || emptyBox('cal', 'No upcoming cuts', 'Find a barber and book a time that suits you.', '<button class="btn sm" data-go="/discover">Find a barber</button>')}</div>
  <div class="sec-h"><h2>History</h2></div><div class="list">${past.map(card).join('') || emptyBox('scissors', 'No visits yet', 'Your past cuts and receipts will show here.')}</div>`;
}

// ----- auth / profile -----
function vAuth() {
  const a = S.auth, su = a.mode === 'signup';
  return header('', '/') + `<div class="hero"><h1>${su ? 'Join the brotherhood' : 'Welcome back'}</h1><p>${su ? 'Free for customers. Book, review and save your favorite barbers.' : 'Log in to book and manage your visits.'}</p></div>
  <form id="authf" autocomplete="on">${su ? '<label class="f">Full name<input name="name" autocomplete="name" required></label>' : ''}<label class="f">Email<input name="email" type="email" autocomplete="email" required autocapitalize="off" autocorrect="off" spellcheck="false"></label>
  ${su ? '<label class="f">Mobile number<input name="phone" type="tel" autocomplete="tel" placeholder="09XX XXX XXXX" required></label>' : ''}
  <label class="f">Password${su ? ' (8+ characters)' : ''}<input name="password" type="password" autocomplete="${su ? 'new-password' : 'current-password'}" minlength="${su ? 8 : 1}" required></label>
  ${su ? '<label class="f row" style="align-items:flex-start"><input type="checkbox" name="agree" style="width:auto;margin-top:4px" required><span style="margin:0">I agree to the <a href="/terms" target="_blank" rel="noopener">Terms of Use</a> and the <a href="/privacy" target="_blank" rel="noopener">Privacy Policy</a> (Data Privacy Act of 2012). My details are used only for my bookings and account.</span></label>' : ''}
  ${a.err ? `<div class="err">${esc(a.err)}</div>` : ''}<button class="btn block" style="margin-top:16px" ${a.busy ? 'disabled' : ''}>${su ? 'Create account' : 'Log in'}</button></form>
  <p class="mute" style="text-align:center">${su ? 'Already a member?' : 'New here?'} <button class="link" data-authmode="${su ? 'login' : 'signup'}">${su ? 'Log in' : 'Create an account'}</button></p>
  <p class="mute sm" style="text-align:center;margin-top:24px">Barber or shop owner? <button class="link" data-go="/pro">Sign in to pro tools</button></p>`;
}
const memberPhotos = u => `<div class="card" style="padding:0;overflow:hidden"><div style="height:120px;background:linear-gradient(135deg,#1e2024,#0f1012);${u.cover ? `background-image:url('${esc(u.cover)}');` : ''}background-size:cover;background-position:center"></div>
  <div style="padding:0 14px 14px"><div class="row" style="margin-top:-34px;align-items:flex-end">${pic(u.photo, u.name, 'av lg')}<span class="sp"></span><button class="btn sec sm" style="margin-bottom:4px" data-go="/member/${u.id}">View my public profile</button></div>
  <div style="margin-top:8px"><b style="font-size:17px">${esc(u.name)}</b><div class="sm mute">${esc(u.email)}</div></div>
  <div class="row" style="flex-wrap:wrap;gap:8px;margin-top:10px"><label class="btn sec sm" style="cursor:pointer">${u.photo ? 'Change profile photo' : 'Add profile photo'}<input type="file" id="mavatar" accept="image/*" hidden></label><label class="btn sec sm" style="cursor:pointer">${u.cover ? 'Change cover photo' : 'Add cover photo'}<input type="file" id="mcoverf" accept="image/*" hidden></label>${u.cover ? '<button class="btn danger sm" data-mcovdel>Remove cover</button>' : ''}${u.photo ? '<button class="btn ghost sm" data-mphotodel>Remove photo</button>' : ''}</div>
  <div class="sm mute" style="margin-top:8px">Your photo, cover and bio are visible to other members. Your phone number and email are never shown.</div></div></div>`;
async function vMember(id, self) {
  if (!S.mem || S.mem.member.id !== id) {
    try { S.mem = await api('/members/' + id, {}, S.token); } catch (e) { S.mem = null; return header('', '/community') + `<div class="err">${esc(e.message)}</div>`; }
    S.feed = { posts: S.mem.posts, more: false };   // lets like / save / comment on these cards work like in the feed
  }
  const j = S.mem, m = j.member;
  return `<div class="pcover" style="background-image:linear-gradient(180deg,rgba(9,9,10,.2),rgba(9,9,10,.88))${m.cover ? `,url('${esc(m.cover)}')` : ''}"></div>
  <div class="bar" style="margin-top:-150px;background:none;border:0;-webkit-backdrop-filter:none;backdrop-filter:none">${self ? '' : `<button class="btn sec sm" data-go="/community" aria-label="Back">${ic('back')}</button>`}<span class="sp"></span>${self ? `<button class="btn sec sm" data-go="/notifications" aria-label="Notifications">${ic('bell')}</button><button class="btn sec sm" data-go="/me" aria-label="Settings">${ic('gear')}</button>` : ''}</div>
  <div class="phead">${pic(m.photo, m.name, 'av lg')}<span class="sp"></span>${m.mine ? `<button class="btn sec sm" style="margin-bottom:6px" data-go="/me/edit">Edit profile</button>` : S.user ? `<button class="btn ${m.following ? 'sec' : 'white'} sm" style="margin-bottom:6px;min-width:104px" data-mfollow="${m.id}" data-on="${m.following ? 1 : 0}">${m.following ? '✓ Following' : '+ Follow'}</button>` : `<button class="btn white sm" style="margin-bottom:6px;min-width:104px" data-go="/auth">+ Follow</button>`}</div>
  <h1 style="font-size:26px;margin-top:10px">${esc(m.name)}</h1>${m.bio ? `<p class="mute" style="margin:6px 0 0;white-space:pre-wrap">${esc(m.bio)}</p>` : ''}<div class="mute sm" style="margin-top:4px">Member since ${new Date(m.joined).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' })}</div>
  <div class="stats5" style="grid-template-columns:repeat(3,1fr)"><div><b class="num">${m.posts}</b><span>Posts</span></div><div><b class="num">${m.likes}</b><span>Likes</span></div><div><b class="num">${m.followers}</b><span>Followers</span></div></div>
  <div class="sec-h"><h2>Posts</h2></div><div class="list">${j.posts.map(postCard).join('') || '<div class="card empty">No posts yet.</div>'}</div>`;
}
function vMe() {
  if (!S.user) { if (!S.token) { setTimeout(() => nav('/auth')); return ''; } return header('Profile', '/profile') + skelList(); }   // still loading the account after a reload
  const sub = route().b;
  if (sub === 'edit') return vEditProfile();
  if (sub === 'notifications') return header('Notifications', '/me') + `${pushCard() || emptyBox('bell', 'Not available here', 'This browser cannot show notifications. Try Chrome, or add Brotherhood to your home screen.')}
    <div class="glabel">Email</div><div class="card"><b>Booking reminders and review requests</b><div class="sm mute" style="margin-top:4px">Sent to ${esc(S.user.email)} when the shop has email turned on.</div></div>`;
  if (sub === 'account') return vAccount();
  const u = S.user, l = S.loyal, saved = (u.styles || []).length;
  const row = (icon, title, subt, attrs, extra = '') => `<button class="srow" ${attrs}><span class="si">${ic(icon)}</span><span class="sp"><b>${title}</b><small>${subt}</small></span>${extra}<span class="chev">${ic('chev')}</span></button>`;
  const canInstall = !isStandalone();
  return header('Profile', '/profile') + `
  <button class="sprof pop" data-go="/profile">${pic(u.photo, u.name, 'av')}<span class="sp"><b>${esc(u.name)}</b><small>View your public profile</small></span><span class="chev">${ic('chev')}</span></button>
  <div class="sstats pop"><div><b class="num">${l ? (l.points ? l.points.balance : l.balance ?? l.visits) : '—'}</b><span>Points</span></div><div><b class="num">${l ? l.visits : '—'}</b><span>Paid visits</span></div><div><b class="word">${l ? (l.points ? (l.points.vip ? 'VIP' : 'Member') : esc(l.tier)) : '—'}</b><span>${l && l.points && !l.points.vip ? 'VIP at ' + l.points.vipAt : 'Status'}</span></div></div>
  <div class="probanner pop"><span class="sp"><b>Barber or shop owner?</b><small>Manage your profile, clients and shop</small></span><button class="btn sm" data-go="/pro">Pro tools</button></div>
  <div class="glabel">Account</div><div class="sgroup">
    ${row('user', 'Edit profile', 'Photo, cover, bio and your details', 'data-go="/me/edit"')}
    ${row('star', 'Rewards', l ? (l.points ? `${l.points.balance} points${l.points.vip ? ' · VIP' : ''} · see your rewards` : `${l.balance ?? l.visits} points · ${esc(l.tier)} · redeem vouchers`) : 'Points, tier and vouchers', l ? 'data-rewards' : 'data-go="/me"')}
    ${row('bell', 'Notifications', 'Reminders, slot alerts and community', 'data-go="/me/notifications"')}
    ${row('lock', 'Account and security', 'Password, email and delete account', 'data-go="/me/account"')}
  </div>
  <div class="glabel">Your cuts</div><div class="sgroup">
    ${row('cal', 'My bookings', 'Upcoming cuts and past visits', 'data-go="/bookings"')}
    ${row('scissors', 'Saved styles', saved ? `${saved} saved · open the Style finder` : 'Find a cut that suits your face', 'data-go="/style"')}
    ${row('pin', 'Shops near you', 'Map of all branches', 'data-go="/map"')}
  </div>
  <div class="glabel">App</div><div class="sgroup">
    ${canInstall ? row('home', 'Install the app', 'Add Brotherhood to your home screen', deferredInstall ? 'data-install' : 'data-insthelp') : ''}
    ${row('chat', 'Help and support', 'Report a problem or ask a question', S.contact ? `data-mailto="${esc(S.contact)}"` : 'data-go="/"')}
    ${row('doc', 'Terms of Use', 'The rules for using Brotherhood', 'data-open="/terms"')}
    ${row('shield', 'Privacy Policy', 'How we handle your information', 'data-open="/privacy"')}
  </div>
  <button class="btn ghost block" style="margin-top:22px;color:var(--bad)" data-logout>Log out</button>
  <div class="sm mute" style="text-align:center;margin:14px 0 4px">Brotherhood · More than a haircut</div>`;
}
function vEditProfile() {
  const u = S.user;
  return header('Edit profile', '/me') + `<div class="ecover pop" style="${u.cover ? `background-image:linear-gradient(180deg,rgba(0,0,0,.05),rgba(0,0,0,.45)),url('${esc(u.cover)}')` : ''}"><div class="ecbtns"><label class="btn sec sm">${ic('cam')} ${u.cover ? 'Change cover' : 'Add cover'}<input type="file" id="mcoverf" accept="image/*" hidden></label>${u.cover ? `<button class="btn sec sm" data-mcovdel>Remove</button>` : ''}</div></div>
  <div class="eav">${pic(u.photo, u.name, 'av lg')}<label class="camb" aria-label="Change profile photo">${ic('cam')}<input type="file" id="mavatar" accept="image/*" hidden></label></div>
  <div style="text-align:center;margin:-2px 0 4px">${u.photo ? '<button class="link" data-mphotodel style="color:var(--mute)">Remove profile photo</button>' : '<span class="sm mute">Tap the camera to add a photo</span>'}</div>
  <form id="mef">${S.meMsg ? `<div class="${S.meMsg.ok ? 'ok' : 'err'}">${esc(S.meMsg.t)}</div>` : ''}
    <label class="f">Bio<textarea name="bio" rows="3" maxlength="300" placeholder="Your style, your barber, anything you want the brotherhood to know">${esc(u.bio || '')}</textarea></label>
    <div class="glabel" style="margin-top:22px">My details</div>
    <label class="f" style="margin-top:0">Name<input name="name" value="${esc(u.name)}" required></label>
    <label class="f">Mobile<input name="phone" type="tel" value="${esc(u.phone)}" required></label>
    <label class="f">City<input name="city" value="${esc(u.city || '')}" placeholder="e.g. San Pablo"></label>
    <label class="f">Email<input value="${esc(u.email)}" disabled></label>
    <button class="btn block" style="margin-top:18px">Save changes</button></form>
  <div class="sm mute" style="margin-top:12px;text-align:center">Your photo, cover, name and bio are public. Your mobile and email are never shown.</div>`;
}
function vAccount() {
  const u = S.user;
  return header('Account', '/me') + `<div class="glabel">Signed in as</div><div class="card"><b>${esc(u.email)}</b><div class="sm mute" style="margin-top:2px">Your email is your login.</div></div>
  <div class="glabel">Change password</div><form id="pwf" class="card">${S.pwMsg ? `<div class="${S.pwMsg.ok ? 'ok' : 'err'}">${esc(S.pwMsg.t)}</div>` : ''}<label class="f" style="margin-top:0">Current password<input name="current" type="password" autocomplete="current-password" required></label><label class="f">New password<input name="password" type="password" minlength="8" autocomplete="new-password" required></label><label class="f">Repeat new password<input name="password2" type="password" minlength="8" autocomplete="new-password" required></label><button class="btn block" style="margin-top:14px">Update password</button></form>
  <div class="glabel">Danger zone</div><details class="card"><summary style="cursor:pointer;color:var(--bad);font-weight:600">Delete my account</summary><p class="sm mute">This removes your account, posts, photos and vouchers. Shop booking records stay with the shop but are unlinked from you. This cannot be undone.</p><input id="delpw" type="password" placeholder="Confirm password"><button class="btn danger block" style="margin-top:10px" data-delete>Delete account</button></details>
  <button class="btn ghost block" style="margin-top:22px;color:var(--bad)" data-logout>Log out</button>`;
}

// ----- pro tools -----
async function loadPro() { try { S.pro = await api('/pro/me', {}, S.proToken); S.proErr = ''; } catch (e) { S.pro = null; S.proErr = e.message; if (e.code === 401) { S.proToken = null; store.set('bh_pro', null); } } }
function vPro() {
  if ((!S.proToken || !S.pro) && store.get('bh_device') && !S.devSkip) return header('Pro tools', '/') + vDeviceLogin();
  if (!S.proToken || !S.pro) return header('Pro tools', '/') + `<p class="mute">Sign in with your Brotherhood staff username and password (same as the back office). New here? <a href="/signup">Put your shop on Brotherhood</a>.</p><form id="prolf">${S.proPin ? '<label class="f">6-digit PIN<input name="pin" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required></label>' : '<label class="f">Username (owners may leave this blank)<input name="username" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false"></label><label class="f">Password<input name="password" type="password" autocomplete="current-password" required></label>'}<label class="f">Shop code (partner shops only)<input name="org" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Leave blank for Brotherhood" value="${esc(store.get('bh_org') || '')}"></label>${S.proErr ? `<div class="err">${esc(S.proErr)}</div>` : ''}<button class="btn block" style="margin-top:14px">Sign in</button><p class="mute sm" style="text-align:center"><button type="button" class="link" data-proPin>${S.proPin ? 'Use username and password instead' : 'Barber or cashier? Sign in with your 6-digit PIN'}</button></p></form>`;
  if (S.pro.desk) { if (!S.td) loadToday(true); if (!['today', 'tools'].includes(S.proTab)) S.proTab = 'today'; return header('Front desk', '/') + `<div class="tabs"><button class="${S.proTab === 'today' ? 'on' : ''}" data-ptab="today">Today</button><button class="${S.proTab === 'tools' ? 'on' : ''}" data-ptab="tools">Tools</button></div>` + (S.proTab === 'tools' ? vTools() : vToday()) + '<button class="btn ghost block" style="margin-top:22px" data-prologout>Sign out</button>'; }   // front desk: the day board only
  const sel = S.pro.staff.find(s => s.id === S.proSel) || S.pro.staff[0]; S.proSel = sel?.id;
  if (!sel) return header('Pro tools', '/') + '<div class="empty">No barbers found.</div>';
  return header('Pro tools', '/') + `${S.pro.admin && !['shop', 'mod', 'ins'].includes(S.proTab) ? `<label class="f">Barber<select id="prosel">${S.pro.staff.map(s => `<option value="${s.id}" ${s.id === sel.id ? 'selected' : ''}>${esc(s.name)} · ${esc(s.branchName)}</option>`).join('')}</select></label>` : ''}
  <div class="tabs scroll"><button class="${S.proTab === 'today' ? 'on' : ''}" data-ptab="today">Today</button><button class="${S.proTab === 'tools' ? 'on' : ''}" data-ptab="tools">Tools</button>${S.pro.admin ? `<button class="${S.proTab === 'shop' ? 'on' : ''}" data-ptab="shop">Shop</button><button class="${S.proTab === 'ins' ? 'on' : ''}" data-ptab="ins">Insights</button>` : ''}<button class="${S.proTab === 'dash' ? 'on' : ''}" data-ptab="dash">${S.pro.admin ? 'Barber' : 'Dashboard'}</button><button class="${S.proTab === 'profile' ? 'on' : ''}" data-ptab="profile">Profile</button><button class="${S.proTab === 'port' ? 'on' : ''}" data-ptab="port">Portfolio</button>${S.pro.admin ? `<button class="${S.proTab === 'mod' ? 'on' : ''}" data-ptab="mod">Moderation</button>` : ''}</div>
  ${S.proTab === 'today' ? vToday() : ''}${S.proTab === 'tools' ? vTools() : ''}${S.proTab === 'shop' && S.pro.admin ? vOwner() : ''}${S.proTab === 'ins' && S.pro.admin ? vInsights() : ''}${S.proTab === 'dash' ? vDash() : ''}${S.proTab === 'mod' ? vMod() : ''}<div ${S.proTab === 'profile' ? '' : 'hidden'}>${photosEditor(sel)}${linkCard(sel)}${offersEditor(sel)}<div class="sec-h"><h2>Professional profile</h2></div><form id="prof">${S.proMsg ? `<div class="${S.proMsg.ok ? 'ok' : 'err'}">${esc(S.proMsg.t)}</div>` : ''}
  <label class="f">Headline<input name="headline" maxlength="80" value="${esc(sel.headline)}" placeholder="e.g. Fade specialist"></label><label class="f">About<textarea name="bio" rows="3" maxlength="600">${esc(sel.bio)}</textarea></label>
  <label class="f">Years of experience<input name="years" type="number" min="0" max="60" value="${sel.years || ''}"></label><label class="f">Specialties (comma separated)<input name="specialties" value="${esc(sel.specialties.join(', '))}" placeholder="Skin Fade, Taper, Pompadour"></label>
  <label class="f">Instagram<input name="instagram" value="${esc(sel.instagram)}" placeholder="@handle or link"></label><label class="f">Facebook<input name="facebook" value="${esc(sel.facebook)}"></label><label class="f">TikTok<input name="tiktok" value="${esc(sel.tiktok)}"></label>
  ${S.pro.admin ? `<label class="f row"><input type="checkbox" name="verified" style="width:auto" ${sel.verified ? 'checked' : ''}><span style="margin:0">Verified professional (owner only)</span></label>` : ''}<button class="btn block" style="margin-top:14px">Save profile</button></form>${certEditor(sel)}</div>
  <div ${S.proTab === 'port' ? '' : 'hidden'}><div class="sec-h"><h2>Portfolio</h2><label class="btn sm" style="cursor:pointer">${ic('plus')} Add photos<input type="file" id="pfile" accept="image/*" multiple hidden></label></div>
  <label class="f" style="margin-top:0">Style tag for the photos you add (optional)<select id="pstyle"><option value="">No tag</option>${CUTS.map(c => `<option value="${esc(c.name)}" ${S.pstyle === c.name ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
  <div class="pgrid" style="margin-top:10px">${sel.portfolio.map(p => `<div class="pcard"><img src="${esc(p.url)}" alt="" data-lb="${esc(p.url)}"><button class="btn sm danger" style="position:absolute;right:4px;top:4px;padding:2px 8px;background:var(--bg)" data-pdel="${p.id}" aria-label="Delete photo">✕</button><button class="btn sm sec" style="position:absolute;left:4px;top:4px;padding:2px 8px" data-pedit="${p.id}" data-cap="${esc(p.caption || '')}" data-style="${esc(p.style || '')}" aria-label="Edit caption and style">✎</button><div class="pt">${esc(p.caption || p.style || 'No caption')}</div><div class="ps">${esc(p.style || 'No style tag')}</div></div>`).join('')}</div>${sel.portfolio.length ? '' : '<div class="card empty">Add your best cuts. Customers choose barbers by their work.</div>'}</div>
  <button class="btn ghost block" style="margin-top:22px" data-prologout>Sign out of pro tools</button>`;
}

// T32: `how` is the short "how this is counted" note from planning/METRIC_DEFINITIONS.md; tap the tile to read it
const kpi = (l, v, sub = '', how = '') => `<div class="card kpi" style="padding:12px${how ? ';cursor:help' : ''}"${how ? ` data-how="${esc(how)}" title="${esc(how)}"` : ''}><div class="sm mute">${l}${how ? ' <span style="opacity:.6">ⓘ</span>' : ''}</div><div class="num" style="font-size:26px">${v}</div>${sub ? `<div class="sm mute">${sub}</div>` : ''}</div>`;
const claimCard = () => { const v = S.vchk; return `<div class="card" style="margin-bottom:12px"><div class="sm mute" style="letter-spacing:1px">CLAIM A MEMBER VOUCHER</div><div class="row" style="gap:8px;margin-top:6px;align-items:end"><label class="f sp" style="margin:0">Voucher code<input id="vcode" maxlength="12" autocapitalize="characters" autocomplete="off" placeholder="e.g. RWK3M9PQ" style="text-transform:uppercase" value="${esc(S.vcode || '')}"></label><button class="btn sec sm" data-vcheck>Check</button></div>${S.verr ? `<div class="err" style="margin-top:8px">${esc(S.verr)}</div>` : ''}${v ? `<div class="row" style="gap:10px;margin-top:10px">${v.photo ? `<img src="${esc(v.photo)}" alt="" style="width:64px;height:64px;object-fit:cover;border-radius:10px">` : ''}<div class="sp"><b>${esc(v.name)}</b> <span class="tag ${v.status === 'active' ? 'ok' : v.status === 'used' ? '' : 'bad'}">${v.status === 'active' ? 'Valid' : v.status === 'used' ? 'Already used' : 'Expired'}</span><div class="sm mute">${esc(v.member)} · ${esc(v.label)}${v.expires ? ' · until ' + fmtDate(v.expires) : ''}</div></div></div>${v.status === 'active' && v.kind === 'item' ? `<button class="btn block" style="margin-top:10px" data-vclaim="${esc(v.code)}">Hand over and mark as claimed</button>` : v.status === 'active' ? '<div class="sm mute" style="margin-top:8px">This is a discount voucher. It applies automatically when the member books with it.</div>' : ''}` : ''}</div>`; };
function vDash() {
  const d = S.dash; const per = `<div class="tabs">${[['today', 'Today'], ['week', 'This week'], ['month', 'This month'], ['all', 'All time']].map(([k, n]) => `<button class="${S.dashRange === k ? 'on' : ''}" data-drange="${k}" style="font-size:13px;padding:9px 2px;white-space:nowrap">${n}</button>`).join('')}</div>`;
  if (!d) return claimCard() + per + skelList();
  const m = d.metrics, today = ymd(new Date()), e = S.earn;
  return claimCard() + per + `<div class="grid2 kpis" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${kpi('Haircuts', m.haircuts, `${m.daysWorked} days worked`)}${kpi('Revenue', peso(m.revenue), `avg ${peso(m.avgService)}`)}${kpi('Commission', peso(m.commission), 'earned this period')}${kpi('Rating', m.reviews ? m.rating.toFixed(1) + ' ★' : '—', `${m.reviews} review${m.reviews === 1 ? '' : 's'}`)}${kpi('Retention', m.retention + '%', `${m.clients} clients served`)}${kpi('Rebooking', d.clients.length ? m.rebooking + '%' : '—', 'clients with 2+ visits')}</div>
  ${e ? `<div class="card" style="margin-top:10px"><div class="sm mute">MY PAY · NOT YET PAID OUT</div><div class="num" style="font-size:28px">${peso(e.unpaid.net)}</div><div class="sm mute">${e.unpaid.days} day${e.unpaid.days === 1 ? '' : 's'} · commission ${peso(e.unpaid.commission)}${e.unpaid.bonus ? ' · bonus ' + peso(e.unpaid.bonus) : ''}${e.unpaid.advance ? ' · advance −' + peso(e.unpaid.advance) : ''}</div><div class="sm" style="margin-top:6px">Today: ${e.today.cuts} cut${e.today.cuts === 1 ? '' : 's'} · ${peso(e.today.commission)}</div></div>` : ''}
  <div class="sec-h"><h2>Appointments · next 7 days</h2></div><div class="list">${d.appointments.map(a => `<div class="card"><div class="row"><b>${a.date === today ? 'Today' : fmtDate(a.date)} · ${t12(a.time)}</b><span class="sp"></span>${a.noShows ? `<span class="tag bad">⚠ ${a.noShows} no-show${a.noShows > 1 ? 's' : ''}</span>` : ''}<span class="tag ${a.status === 'arrived' ? 'ok' : 'on'}">${a.status === 'arrived' ? 'arrived' : 'booked'}</span></div><div>${esc(a.customer)}${a.phone ? ` <a class="sm" style="color:var(--blue)" href="tel:${esc(a.phone)}">${esc(a.phone)}</a>` : ''}</div><div class="sm mute">${esc(a.items.join(' + '))} · ${a.mins} min · ${peso(a.total)}</div>${a.notes ? `<div class="sm" style="margin-top:4px">“${esc(a.notes)}”</div>` : ''}</div>`).join('') || '<div class="card empty">No appointments in the next 7 days.</div>'}</div>
  ${blocksSection()}
  <div class="sec-h"><h2>My clients</h2><span class="mute sm">${d.clients.length}</span></div><div class="list">${d.clients.slice(0, 50).map(c => `<button class="card row" style="width:100%;text-align:left" data-client="${esc(c.key)}"><span class="av" style="width:42px;height:42px;font-size:14px">${esc(initials(c.name))}</span><div class="sp"><div class="nm">${esc(c.name)}${c.vip ? '<span class="gold" style="font-size:11px;padding:1px 8px">VIP</span>' : c.visits >= 5 ? '<span class="tag">Regular</span>' : ''}${bdaySoon(c.birthday) ? '<span class="tag">🎂 soon</span>' : ''}${c.hasNote ? '<span class="tag">📝</span>' : ''}</div><div class="sm mute">${c.visits} visit${c.visits === 1 ? '' : 's'} · last ${fmtDate(c.last)}${c.phone ? ' · ' + esc(c.phone) : ''}</div></div><b class="num">${peso(c.spent)}</b></button>`).join('') || '<div class="card empty">Clients appear here after their first paid visit with you.</div>'}</div>
  <div class="sec-h"><h2>Latest reviews</h2></div><div class="list">${d.recentReviews.map(r => `<div class="card"><div class="row"><b>${esc(r.name)}</b>${r.verified ? '<span class="tag ok">Verified visit</span>' : ''}<span class="sp"></span>${stars(r.rating)}</div>${r.text ? `<p style="margin:6px 0 0">${esc(r.text)}</p>` : ''}${r.reply ? `<div class="sm" style="margin-top:8px;padding:8px 10px;border-left:3px solid var(--blue);background:var(--s3);border-radius:8px"><b>Your reply</b><div>${esc(r.reply)}</div></div>` : ''}<button class="btn sec sm" style="margin-top:8px" data-rreply="${r.id}" data-cur="${esc(r.reply || '')}">${r.reply ? 'Edit reply' : 'Reply'}</button></div>`).join('') || '<div class="card empty">No reviews yet.</div>'}</div>`;
}

// ----- owner insights: branch health, win-back, barber retention -----
const hsCls = s => s == null ? '' : s >= 80 ? 'ok' : s >= 65 ? 'good' : s >= 50 ? 'warn' : 'bad';
async function loadInsights() {
  try { [S.health, S.ret] = await Promise.all([api(`/pro/health?days=${S.insDays}`, {}, S.proToken), api(`/pro/retention?days=${S.lapDays}`, {}, S.proToken)]); } catch (e) { toast(e.message); }
  await loadRules(); render();
}
function vInsights() {
  const h = S.health, r = S.ret; if (!h || !r) return skelList();
  const chips = (list, cur, attr, fmt) => `<div class="chips">${list.map(n => `<button class="chip ${cur === n ? 'on' : ''}" ${attr}="${n}">${fmt(n)}</button>`).join('')}</div>`;
  return `<div class="sec-h" style="margin-top:4px"><h2>Branch health</h2><span class="mute sm">${h.from} to ${h.to}</span></div>${chips([7, 30, 90], S.insDays, 'data-idays', n => 'Last ' + n + ' days')}
  <div class="list">${h.branches.map(b => `<div class="card"><div class="row"><b style="font-size:17px">${esc(b.name)}</b><span class="sp"></span><span class="hs ${hsCls(b.score)}">${b.score ?? '—'}</span></div><div class="bar2" style="margin-top:8px"><i class="${hsCls(b.score)}" style="width:${b.score || 0}%"></i></div>
    <div class="sm mute" style="margin-top:6px">${esc(b.label)} · sales ${peso(b.sales.cur)}${b.sales.change != null ? ` (${b.sales.change >= 0 ? '+' : ''}${b.sales.change}% vs before)` : ''}${b.focus ? ` · needs attention: <b style="color:var(--text)">${esc(b.focus)}</b>` : ''}</div>
    <details style="margin-top:8px"><summary class="sm">See the breakdown</summary>${b.components.map(c => `<div class="row sm" style="padding:7px 0;border-top:1px solid var(--line);gap:10px;align-items:flex-start"><span class="hs s ${hsCls(c.score)}">${c.score ?? '—'}</span><div class="sp"><b>${esc(c.label)}</b> <span class="mute">(${c.weight}%)</span><div class="mute">${esc(c.detail)}</div></div></div>`).join('')}<div class="sm mute" style="margin-top:6px">Areas with no data are left out and the rest are re-weighted. A score needs at least 30% of the data.</div></details></div>`).join('')}</div>
  <div class="sec-h"><h2>Win-back</h2></div>${chips([30, 45, 60, 90], S.lapDays, 'data-ldays', n => n + '+ days away')}
  <div class="card sm">${r.summary.regulars ? `<b>${r.summary.lapsed}</b> of <b>${r.summary.regulars}</b> regulars (2+ visits) have not been back in ${r.days}+ days. Regular retention is <b>${r.summary.retention}%</b>.` : 'No regulars yet. A regular is a customer with 2 or more paid visits who was identified at the POS.'}</div>
  <div class="list" style="margin-top:10px">${r.lapsed.map(c => `<div class="card row"><span class="av" style="width:42px;height:42px;font-size:14px">${esc(initials(c.name))}</span><div class="sp"><div class="nm">${esc(c.name)}</div><div class="sm mute">Last visit ${fmtDate(c.last)} · ${c.daysAgo} days ago</div><div class="sm mute">${c.visits} visits · ${peso(c.spent)}${c.barber ? ' · ' + esc(c.barber) : ''}${c.branch ? ' · ' + esc(c.branch) : ''}</div></div>${c.phone ? `<a class="btn white sm" href="tel:${esc(c.phone)}">Call</a>` : ''}</div>`).join('')}</div>
  <div class="sec-h"><h2>Barber retention</h2><span class="mute sm">last 90 days</span></div><div class="list">${r.barbers.map(b => `<div class="card"><div class="row"><b>${esc(b.name)}</b><span class="mute sm">${esc(b.branch)}</span><span class="sp"></span><b class="num" style="font-size:20px">${b.rate == null ? '—' : b.rate + '%'}</b></div><div class="bar2" style="margin:6px 0"><i class="${b.rate == null ? '' : b.rate >= 60 ? 'ok' : b.rate >= 40 ? 'warn' : 'bad'}" style="width:${b.rate || 0}%"></i></div><div class="sm mute">${b.returning} of ${b.clients} identified clients came back for another cut</div></div>`).join('') || '<div class="card empty">No barbers yet.</div>'}</div>${rulesSection()}`;
}
// ----- barber: client sheet (private notes, VIP, birthday, visit history) -----
const bdaySoon = bd => { if (!bd) return false; const [m, d] = bd.split('-').map(Number), n = new Date(), today = new Date(n.getFullYear(), n.getMonth(), n.getDate()); let t = new Date(n.getFullYear(), m - 1, d); if (t < today) t = new Date(n.getFullYear() + 1, m - 1, d); return (t - today) / 864e5 <= 14; };
async function openClient(key) {
  let c; try { c = await api(`/pro/client?staffId=${S.proSel}&key=${encodeURIComponent(key)}`, {}, S.proToken); } catch (x) { return toast(x.message); }
  const o = sheet(`<h3>${esc(c.name)}</h3><div class="row sm mute" style="justify-content:center;gap:12px;margin:-4px 0 8px;flex-wrap:wrap"><span>${c.visits} visit${c.visits === 1 ? '' : 's'} with you</span>${c.first ? `<span>since ${fmtMonth(c.first.slice(0, 7))}</span>` : ''}${c.phone ? `<a href="tel:${esc(c.phone)}" style="color:var(--blue)">${esc(c.phone)}</a>` : ''}</div>
    <label class="row" style="gap:10px;margin:6px 0;cursor:pointer"><input type="checkbox" id="cvip" ${c.vip ? 'checked' : ''} style="width:20px;height:20px"><b>VIP client</b><span class="sm mute">give extra care</span></label>
    <label class="f">Preferred cut<input id="cpref" maxlength="120" value="${esc(c.pref)}" placeholder="e.g. Mid taper, scissors on top"></label>
    <label class="f">Birthday (only the day and month are saved)<input id="cbd" type="date" value="${c.birthday ? '2000-' + c.birthday : ''}"></label>
    <label class="f">Notes, only you and the owner can see these<textarea id="cnote" rows="3" maxlength="500" placeholder="Guard number, the part, small talk, allergies...">${esc(c.note)}</textarea></label>
    <div class="sm mute" style="margin:12px 0 4px">Recent visits</div>${c.history.map(h => `<div class="row sm" style="padding:6px 0;border-top:1px solid var(--line)"><span style="width:84px" class="mute">${fmtDate(h.date)}</span><span class="sp">${esc(h.items.join(', '))}</span><b>${peso(h.total)}</b></div>`).join('') || '<div class="sm mute">No visits yet.</div>'}
    <div id="cerr"></div><div class="row" style="margin-top:14px"><button class="btn ghost sp" data-x>Close</button><button class="btn sp" id="csave">Save</button></div>`);
  o.querySelector('#csave').onclick = async ev => {
    const btn = ev.currentTarget; btn.disabled = true;
    try { await api('/pro/client', { method: 'PUT', body: { staffId: S.proSel, key, note: o.querySelector('#cnote').value, pref: o.querySelector('#cpref').value, vip: o.querySelector('#cvip').checked, birthday: o.querySelector('#cbd').value } }, S.proToken); o.remove(); toast('Client saved'); loadDash(); }
    catch (x) { o.querySelector('#cerr').innerHTML = `<div class="err">${esc(x.message)}</div>`; btn.disabled = false; }
  };
}
const linkCard = sel => { const url = `${location.origin}/b/${sel.id}`; return `<div class="sec-h"><h2>My booking link</h2></div><div class="card"><div class="sm mute" style="margin-bottom:8px">Put this in your Facebook, Instagram and TikTok bio, or send it to your regulars. It opens your profile so they can book you.</div><div class="row" style="gap:8px"><input readonly value="${esc(url)}" id="blink" data-selall style="flex:1;min-width:0"><button class="btn sm" data-copylink="${esc(url)}">Copy</button></div>${navigator.share ? `<button class="btn sec sm block" style="margin-top:8px" data-sharelink="${esc(url)}" data-sname="${esc(sel.name)}">Share…</button>` : ''}</div>`; };
// ----- member loyalty card (points and tier come from the POS) -----
const TIER_MIN = { Member: 0, Bronze: 5, Silver: 16, Gold: 26, VIP: 51 };
function loyaltyCard() {
  const l = S.loyal; if (!S.user || !l) return '';
  const cur = TIER_MIN[l.tier] ?? 0, pct = l.next ? Math.max(0, Math.min(100, Math.round((l.visits - cur) / (l.visits + l.next.visitsNeeded - cur) * 100))) : 100;
  return `<div class="card" style="margin:12px 0"><div class="row"><span class="sm mute" style="letter-spacing:1px">BROTHERHOOD REWARDS</span><span class="sp"></span><span class="gold">${esc(l.tier)}</span></div><div class="row" style="align-items:baseline;gap:8px;margin-top:4px"><b class="num" style="font-size:30px">${l.balance ?? l.visits}</b><span class="mute sm">point${(l.balance ?? l.visits) === 1 ? '' : 's'} to spend · ${l.visits} paid visit${l.visits === 1 ? '' : 's'} so far</span></div>
    <div class="bar2" style="margin:8px 0 6px"><i class="ok" style="width:${pct}%"></i></div><div class="sm mute">${l.next ? `${l.next.visitsNeeded} more visit${l.next.visitsNeeded === 1 ? '' : 's'} to ${esc(l.next.name)}` : 'You are at the top tier. Thank you!'}${l.linked ? '' : ' · Book your first cut to start earning.'}</div>${(l.rewards || []).length || (l.vouchers || []).length ? `<button class="btn white sm block" data-rewards style="margin-top:10px">${ic('star')} Redeem rewards${(l.vouchers || []).some(v => v.status === 'active') ? ' · you have a voucher' : ''}</button>` : ''}</div>`;
}

// ----- push notifications: turn on reminders and alerts on this phone -----
const swReady = (ms = 5000) => Promise.race([navigator.serviceWorker.ready, new Promise((_, no) => setTimeout(() => no(new Error('no service worker')), ms))]);   // never wait forever when the worker did not start
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const keyToArray = k => { const raw = atob((k + '='.repeat((4 - k.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...raw].map(c => c.charCodeAt(0))); };
async function loadPush() {
  S.push = { loading: true }; const p = { ok: pushSupported(), perm: 'Notification' in window ? Notification.permission : 'unsupported', on: false, prefs: { bookings: true, community: false }, ios: isIOS && !isStandalone() };
  if (p.ok && S.token) {
    try { const reg = await swReady(), sub = await reg.pushManager.getSubscription(); p.on = !!sub && Notification.permission === 'granted'; } catch { p.ok = false; }
    try { p.prefs = (await api('/push/prefs')).prefs; } catch { }
  }
  S.push = p; render();
}
async function enablePush() {
  try {
    if (!pushSupported()) return toast('This browser cannot show notifications. Try Chrome, or add Brotherhood to your home screen.');
    if (await Notification.requestPermission() !== 'granted') { toast('Notifications are blocked. You can allow them in your phone or browser settings.'); return loadPush(); }
    const reg = await swReady(), { key } = await api('/push/key');
    let sub = await reg.pushManager.getSubscription();
    if (sub) { try { await sub.unsubscribe(); } catch { } sub = null; }   // always a fresh subscription for this server key
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToArray(key) });
    await api('/push/subscribe', { method: 'POST', body: sub.toJSON() }); toast('Notifications are on');
  } catch (e) { toast(e.message || 'Could not turn on notifications'); }
  loadPush();
}
async function disablePush() {
  try { const reg = await swReady(), sub = await reg.pushManager.getSubscription(); if (sub) { try { await api('/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } }); } catch { } await sub.unsubscribe(); } toast('Notifications are off'); } catch (e) { toast(e.message || 'Could not turn off'); }
  loadPush();
}
const pushCard = () => {
  const p = S.push; if (!S.user || !p || p.loading) return '';
  const box = inner => `<div class="card" style="margin:12px 0">${inner}</div>`, head = t => `<div class="row"><span class="av" style="width:40px;height:40px">${ic('bell')}</span><div class="sp"><b>${t}</b></div></div>`;
  if (!p.ok) return p.ios ? box(`${head('Get reminders on your iPhone')}<div class="sm mute" style="margin-top:8px">Tap the Share button in Safari, then <b>Add to Home Screen</b>. Open Brotherhood from your home screen, then turn on notifications here.</div>`) : '';
  if (p.perm === 'denied') return box(`${head('Notifications are blocked')}<div class="sm mute" style="margin-top:8px">Allow notifications for Brotherhood in your phone or browser settings, then come back here.</div>`);
  if (!p.on) return box(`${head('Get booking reminders')}<div class="sm mute" style="margin:6px 0 10px">A reminder before your cut, and a message if the shop changes your booking or a slot opens.</div><button class="btn block" data-pushon>Turn on notifications</button>`);
  return box(`${head('Notifications are on')}<label class="row" style="gap:10px;margin:12px 0 4px;cursor:pointer"><input type="checkbox" id="pbook" style="width:20px;height:20px" ${p.prefs.bookings ? 'checked' : ''}><span>Bookings, reminders and slot alerts</span></label><label class="row" style="gap:10px;margin:8px 0;cursor:pointer"><input type="checkbox" id="pcomm" style="width:20px;height:20px" ${p.prefs.community ? 'checked' : ''}><span>Community (comments and new followers)</span></label><div class="row" style="gap:8px;margin-top:8px"><button class="btn sec sm sp" data-pushtest>Send a test</button><button class="btn ghost sm sp" data-pushoff>Turn off</button></div>`);
};
const logoText = () => S.shop && !/^brotherhood$/i.test(S.shop) ? esc(S.shop) : '<img src="/bh-mark.png" alt="" width="30" height="30"><span>Brother<b>hood</b></span>';   // the B mark is the Brotherhood app's logo; partner shops show their own name
// ----- booking rules and no-show watch (owner), blocked time (barber), repeat bookings (member) -----
const seriesHtml = k => (k.series || []).length ? `<div style="margin-top:10px;border-top:1px solid rgba(255,255,255,.12);padding-top:8px" class="sm"><b>Repeat bookings</b>${k.series.map(x => `<div>${x.ok ? '✓' : '✕'} ${fmtDate(x.date)} at ${t12(x.time)}${x.ok ? '' : ` <span style="opacity:.8">· ${esc(x.reason)}</span>`}</div>`).join('')}</div>` : '';
const repeatCard = k => `<div class="card" style="margin-top:12px"><div class="row" style="gap:10px"><label class="f sp" style="margin:0">Repeat<select id="brep"><option value="0">One time</option>${[1, 2, 3, 4, 6].map(n => `<option value="${n}" ${k.repEvery === n ? 'selected' : ''}>Every ${n === 1 ? 'week' : n + ' weeks'}</option>`).join('')}</select></label>${k.repEvery ? `<label class="f" style="margin:0;width:110px">Cuts<select id="brepn">${[2, 3, 4, 5, 6].map(n => `<option value="${n}" ${(k.repCount || 4) === n ? 'selected' : ''}>${n} in total</option>`).join('')}</select></label>` : ''}</div>${k.repEvery ? '<div class="sm mute" style="margin-top:6px">Same barber and time each time. Weeks that are taken are skipped and you will see which ones. Bookings can be up to 60 days ahead.</div>' : ''}</div>`;
async function loadRules() { try { [S.rules, S.nsw, S.promos, S.rewardsList] = await Promise.all([api('/pro/rules', {}, S.proToken), api('/pro/noshows', {}, S.proToken), api('/pro/promos', {}, S.proToken), api('/pro/rewards', {}, S.proToken)]); } catch (e) { toast(e.message); } }
const rulesSection = () => {
  const r = S.rules, n = S.nsw; if (!r || !n) return '';
  return `<div class="sec-h"><h2>Booking rules</h2></div><div class="card"><label class="f" style="margin-top:0">Pause online booking after missed appointments<select id="rnoshow">${[0, 1, 2, 3, 4, 5].map(v => `<option value="${v}" ${r.noshowMax === v ? 'selected' : ''}>${v ? v + ' missed in 90 days' : 'Off'}</option>`).join('')}</select></label>
    <label class="f">Buffer between cuts<select id="rbuffer">${[0, 5, 10, 15, 20, 30].map(v => `<option value="${v}" ${r.bufferMins === v ? 'selected' : ''}>${v ? v + ' minutes' : 'No buffer'}</option>`).join('')}</select></label>
    <div class="sm mute" style="margin-top:10px">Email reminders: ${r.emailReady ? '<b style="color:var(--ok)">connected</b>. Customers get a reminder about a day before, and members get a review request after their cut.' : '<b>not connected</b>. Add RESEND_API_KEY in the hosting variables to turn on reminders and review requests.'}</div></div>
  <div class="sec-h"><h2>No-show watch</h2><span class="mute sm">last 90 days</span></div><div class="list">${n.rows.map(x => `<div class="card row"><div class="sp"><div class="nm">${esc(x.name)}${x.blocked ? '<span class="tag bad">Paused</span>' : x.allowed ? '<span class="tag ok">Allowed</span>' : ''}</div><div class="sm mute">${x.count} missed · last ${fmtDate(x.last)}${x.phone ? ' · ' + esc(x.phone) : ''}</div></div>${x.customerId && (x.blocked || x.allowed) ? `<button class="btn ${x.blocked ? 'white' : 'sec'} sm" data-nsallow="${x.customerId}" data-allow="${x.blocked ? 1 : 0}">${x.blocked ? 'Allow booking' : 'Restrict'}</button>` : ''}</div>`).join('') || '<div class="card empty sm">No missed appointments in the last 90 days.</div>'}</div>` + promosSection() + rewardsSection();
};

// ----- promo codes: owner creates them (Insights); customers type one on the booking page -----
const promosSection = () => {
  const ps = (S.promos && S.promos.promos) || [];
  return `<div class="sec-h"><h2>Promo codes</h2><button class="btn white sm" data-promoadd>New code</button></div><div class="list">${ps.map(p => `<div class="card"><div class="row"><div class="sp"><div class="nm"><b style="letter-spacing:1px">${esc(p.code)}</b> ${p.expired ? '<span class="tag bad">Expired</span>' : p.active ? '<span class="tag ok">Active</span>' : '<span class="tag">Paused</span>'}</div><div class="sm mute">${esc(p.label)}${p.expires ? ' · until ' + fmtDate(p.expires) : ''}${p.note ? ' · ' + esc(p.note) : ''}</div><div class="sm mute">${p.uses} used${p.maxUses ? ' of ' + p.maxUses : ''} · ${peso(p.saved)} given as discount</div></div></div>
    <div class="row" style="gap:8px;margin-top:8px"><button class="btn sec sm sp" data-promotoggle="${p.id}" data-on="${p.active ? 0 : 1}">${p.active ? 'Pause' : 'Turn on'}</button><button class="btn danger sm sp" data-promodel="${p.id}">Delete</button></div></div>`).join('') || '<div class="card empty sm">No promo codes yet. Make one (like WELCOME20) and share it on Facebook or Instagram. When a customer books with it, the discount is applied to their ticket automatically at the cashier.</div>'}</div>`;
};
function openPromo() {
  const o = sheet(`<h3>New promo code</h3><label class="f" style="margin-top:0">Code<input id="pcode" maxlength="20" placeholder="e.g. WELCOME20" autocapitalize="characters" style="text-transform:uppercase"></label>
    <div class="row" style="gap:10px"><label class="f sp" style="margin:0">Discount type<select id="pkind"><option value="percent">Percent off (%)</option><option value="amount">Peso off (₱)</option></select></label><label class="f" style="margin:0;width:110px">Value<input id="pvalue" type="number" min="1" step="1" value="20" inputmode="numeric"></label></div>
    <label class="row" style="gap:10px;margin:12px 0;cursor:pointer"><input type="checkbox" id="pfirst" style="width:20px;height:20px"><b>First-time customers only</b></label>
    <div class="row" style="gap:10px"><label class="f sp" style="margin:0">Total uses (0 = unlimited)<input id="pmax" type="number" min="0" step="1" value="0" inputmode="numeric"></label><label class="f sp" style="margin:0">Ends on (optional)<input id="pexp" type="date" min="${ymd(new Date())}"></label></div>
    <label class="f">Note (only you see this)<input id="pnote" maxlength="120" placeholder="e.g. Facebook launch"></label>
    <div id="perr"></div><div class="row" style="margin-top:14px"><button class="btn ghost sp" data-x>Cancel</button><button class="btn sp" id="psavebtn">Create code</button></div>`);
  o.querySelector('#psavebtn').onclick = async ev => {
    const btn = ev.currentTarget; btn.disabled = true;
    try {
      await api('/pro/promos', { method: 'POST', body: { code: o.querySelector('#pcode').value, kind: o.querySelector('#pkind').value, value: o.querySelector('#pvalue').value, firstVisit: o.querySelector('#pfirst').checked, maxUses: o.querySelector('#pmax').value, expires: o.querySelector('#pexp').value, note: o.querySelector('#pnote').value } }, S.proToken);
      o.remove(); toast('Promo code created'); await loadRules(); render();
    } catch (x) { o.querySelector('#perr').innerHTML = `<div class="err">${esc(x.message)}</div>`; btn.disabled = false; }
  };
}
const promoCard = k => `<div class="card" style="margin-top:12px"><div class="row" style="gap:8px;align-items:end"><label class="f sp" style="margin:0">Promo code (optional)<input id="bpromo" maxlength="20" autocapitalize="characters" autocomplete="off" placeholder="Enter code" value="${esc(k.promoCode || '')}" style="text-transform:uppercase"></label><button class="btn sec sm" data-promoapply ${k.items.length ? '' : 'disabled'}>Apply</button></div>${k.promo ? `<div class="sm" style="margin-top:8px;color:var(--ok)">✓ <b>${esc(k.promo.code)}</b> · ${esc(k.promo.label)}. You save ${peso(k.promo.amt)}. Applied at the cashier when you arrive.</div>` : k.promoErr ? `<div class="sm" style="margin-top:8px;color:#ff8a8a">${esc(k.promoErr)}</div>` : !k.items.length ? '<div class="sm mute" style="margin-top:8px">Pick a service first, then apply your code.</div>' : ''}${voucherChips()}</div>`;
async function applyPromo() {
  const k = S.bk; k.promoCode = (document.getElementById('bpromo')?.value || '').trim(); k.promo = null; k.promoErr = '';
  if (!k.promoCode) { k.promoErr = 'Enter a promo code'; return render(); }
  try { k.promo = await api(`/promo/check?code=${encodeURIComponent(k.promoCode)}&items=${k.items.join(',')}`); } catch (e) { k.promoErr = e.message; }
  render();
}

// ----- rewards: members spend points on vouchers; the owner decides what is on offer -----
// T36: the points ledger. Member side: balance, VIP, the rewards and how far each one is, and the history. Staff redeem at the shop.
const ptsKind = { earn: 'Visit', reverse: 'Visit cancelled', redeem: 'Reward', carry_over: 'Points from past visits', adjust: 'Adjustment' };
function pointsBlock(p) {
  if (!p) return '';
  const next = p.rewards.find(r => !r.reachable), ready = p.rewards.filter(r => r.reachable).pop(), toVip = Math.max(0, p.vipAt - p.earned);
  return `<div class="pts">
    <div class="sm mute">Brotherhood points</div>
    <div class="row" style="align-items:flex-end;margin-top:4px"><b class="pts-big num">${p.balance}</b><span class="sp"></span><div style="text-align:right">${ready ? `<span class="tag gold">${esc(ready.name)} ready</span>` : ''}<div class="sm mute" style="margin-top:8px">${p.vip ? 'VIP member' : `VIP at ${p.vipAt} points`}</div></div></div>
    <div class="pts-bar" style="margin:14px 0 8px"><i style="width:${Math.max(2, Math.min(100, Math.round(p.earned / p.vipAt * 100)))}%"></i></div>
    <div class="sm mute">${p.vip ? 'Your VIP status stays' : `${toVip} point${toVip === 1 ? '' : 's'} to VIP`} · points never expire</div>
    ${p.blocked ? '<div class="err">Your points are below zero after a cancelled visit. Rewards open again once they are back above zero.</div>' : ''}
    <div class="pts-list">${p.rewards.map(r => `<div class="pts-rw"><span class="pts-ring num ${r.reachable ? 'on' : ''}">${r.points}</span><div class="sp"><div class="nm">${esc(r.name)}</div>${r.reachable ? '<div class="sm mute">Ready to claim at the front desk</div>' : `<div class="pts-bar"><i style="width:${Math.max(2, Math.min(100, Math.round(p.balance / r.points * 100)))}%"></i></div>`}</div>${r.reachable ? `<span class="pts-ok">${ic('check')}</span>` : `<span class="sm mute">${r.points - Math.max(0, p.balance)} to go</span>`}</div>`).join('')}</div>
    <div class="sm mute" style="margin-top:14px">Show this screen at the front desk to claim. One finished visit earns one point.${next ? '' : ''}</div>
    ${p.history.length ? `<details class="pts-hist"><summary class="sm">History</summary><div class="list" style="margin-top:8px;gap:0">${p.history.slice(0, 30).map(h => `<div class="row sm" style="padding:9px 0;border-top:1px solid var(--line)"><span class="sp">${esc(h.reward || ptsKind[h.kind] || h.kind)} <span class="mute">· ${esc(fmtDate(String(h.at).slice(0, 10)))}</span></span><b class="${h.delta > 0 ? '' : 'mute'}">${h.delta > 0 ? '+' : ''}${h.delta}</b></div>`).join('')}</div></details>` : ''}</div>`;
}
// home: the points at a glance; opens the rewards sheet
function ptsStrip() {
  const p = S.loyal?.points; if (!p) return '';
  const ready = p.rewards.filter(r => r.reachable).pop(), next = p.rewards.find(r => !r.reachable), gap = next ? next.points - Math.max(0, p.balance) : 0;
  return `<button class="card ptstrip pop" data-rewards="1"><div class="ptn"><b class="num">${p.balance}</b><span class="sm mute">points</span></div><div class="sp" style="min-width:0;text-align:left"><div class="nm">${ready ? esc(ready.name) + ' is ready' : next ? `${gap} points to ${esc(next.name)}` : 'Every reward is open'}</div>${next ? `<div class="pts-bar" style="margin-top:9px"><i style="width:${Math.max(2, Math.min(100, Math.round(Math.max(0, p.balance) / next.points * 100)))}%"></i></div><div class="sm mute" style="margin-top:7px">${gap} more for ${esc(next.name)}</div>` : ''}</div><span class="chev">${ic('chev')}</span></button>`;
}
// staff side: a customer's points, with Redeem buttons for the reachable rewards. One request key per sheet, so a double tap counts once.
async function openPoints(cid) {
  let v; try { v = await sapi(`/loyalty/customers/${cid}`); } catch (x) { return toast(x.message); }
  const key = 'rd-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  const o = sheet(`<h3>${esc(v.customer.name)} · points</h3><div class="row" style="align-items:baseline;gap:8px"><b class="num" style="font-size:30px">${v.balance}</b><span class="mute sm">points</span><span class="sp"></span>${v.vip ? '<span class="tag ok">VIP</span>' : ''}</div>
    ${v.blocked ? '<div class="err">The balance is below zero after a cancelled visit. No reward until it is positive again.</div>' : ''}
    <div class="list" style="margin-top:10px">${v.rewards.map(r => `<div class="row" style="gap:10px"><div class="sp"><div class="nm">${esc(r.name)}</div><div class="sm mute">${r.points} points</div></div>${r.reachable ? `<button class="btn sm" data-predeem="${esc(r.key)}">Redeem</button>` : `<span class="sm mute">${v.balance}/${r.points}</span>`}</div>`).join('')}</div>
    <div id="perr"></div><div class="row" style="margin-top:14px"><button class="btn ghost sp" data-x>Close</button></div>`);
  o.addEventListener('click', async e => {
    const b = e.target.closest('[data-predeem]'); if (!b) return;
    if (!confirm(`Give ${b.closest('.row').querySelector('.nm').textContent} to ${v.customer.name}?`)) return;
    o.querySelectorAll('[data-predeem]').forEach(x => x.disabled = true);
    try { const j = await sapi(`/loyalty/customers/${cid}/redeem`, { method: 'POST', body: { reward: b.dataset.predeem, requestKey: key } }); o.remove(); toast(`${j.reward || 'Reward'} given. Balance ${j.balance}`); }
    catch (x) { o.querySelector('#perr').innerHTML = `<div class="err">${esc(x.message)}</div>`; o.querySelectorAll('[data-predeem]').forEach(x => x.disabled = false); }
  });
}
document.addEventListener('click', e => { const b = e.target.closest('[data-tpts]'); if (b) openPoints(b.dataset.tpts); });
function openRewards() {
  const l = S.loyal; if (!l) return;
  const vs = l.vouchers || [], sTag = v => v.status === 'active' ? '<span class="tag ok">Ready</span>' : v.status === 'used' ? '<span class="tag">Used</span>' : '<span class="tag bad">Expired</span>';
  const o = sheet(`${l.points ? pointsBlock(l.points) + '<details class="pts-old"><summary class="sm">Older visit rewards</summary>' : '<h3>Rewards</h3>'}<div class="row" style="align-items:baseline;gap:8px;margin-top:10px"><b class="num" style="font-size:28px">${l.balance}</b><span class="mute sm">visit points to spend</span></div>
    <div class="list" style="margin-top:10px">${(l.rewards || []).map(r => `<div class="card" style="padding:0;overflow:hidden">${r.photo ? `<img src="${esc(r.photo)}" alt="" style="width:100%;height:150px;object-fit:cover;display:block">` : ''}<div class="row" style="padding:12px"><div class="sp"><div class="nm">${esc(r.name)}</div><div class="sm mute">${esc(r.label)} · ${r.cost} point${r.cost === 1 ? '' : 's'}${l.balance >= r.cost ? '' : ` · ${r.cost - l.balance} more to go`}</div></div><button class="btn ${l.balance >= r.cost ? '' : 'sec'} sm" data-redeem="${r.id}" ${l.balance >= r.cost ? '' : 'disabled'}>${l.balance >= r.cost ? 'Claim' : 'Locked'}</button></div></div>`).join('') || '<div class="card empty sm">No rewards yet. Check back soon.</div>'}</div>
    ${vs.length ? `<div class="sec-h"><h2>My vouchers</h2></div><div class="list">${vs.map(v => `<div class="card"><div class="row" style="gap:10px">${v.photo ? `<img src="${esc(v.photo)}" alt="" style="width:56px;height:56px;object-fit:cover;border-radius:10px">` : ''}<div class="sp"><b style="letter-spacing:1px">${esc(v.code)}</b> ${sTag(v)}<div class="sm mute">${esc(v.name)} · ${esc(v.label)}${v.status === 'active' && v.expires ? ' · use by ' + fmtDate(v.expires) : ''}</div></div></div></div>`).join('')}</div><div class="sm mute" style="margin-top:8px">Discount vouchers: enter the code in the Promo code box when you book. Free items: show the code at the shop. A voucher you don't use before it expires gives your points back.</div>` : ''}${l.points ? '</details>' : ''}
    <div id="rwerr"></div><div class="row" style="margin-top:14px"><button class="btn ghost sp" data-x>Close</button></div>`);
  o.addEventListener('click', async e => {
    const b = e.target.closest('[data-redeem]'); if (!b) return; b.disabled = true;
    try { const j = await api(`/rewards/${b.dataset.redeem}/redeem`, { method: 'POST' }); S.loyal = await api('/loyalty'); o.remove(); toast('Voucher ' + j.code + ' is ready'); render(); openRewards(); }
    catch (x) { o.querySelector('#rwerr').innerHTML = `<div class="err">${esc(x.message)}</div>`; b.disabled = false; }
  });
}
const rewardsSection = () => {
  const rs = (S.rewardsList && S.rewardsList.rewards) || [];
  return `<div class="sec-h"><h2>Rewards</h2><button class="btn white sm" data-rewardadd>New reward</button></div><div class="sm mute" style="margin:-4px 0 8px">Members spend points (1 paid visit = 1 point) to get a one-use voucher. At the cashier it becomes a discount automatically.</div><div class="list">${rs.map(r => `<div class="card"><div class="row" style="gap:10px">${r.photo ? `<img src="${esc(r.photo)}" alt="" style="width:64px;height:64px;object-fit:cover;border-radius:10px">` : ''}<div class="sp"><div class="nm"><b>${esc(r.name)}</b> ${r.active ? '<span class="tag ok">On</span>' : '<span class="tag">Paused</span>'}</div><div class="sm mute">${esc(r.label)} · ${r.cost} point${r.cost === 1 ? '' : 's'} · ${r.redeemed} redeemed</div></div></div>
    <div class="row" style="gap:8px;margin-top:8px"><button class="btn sec sm sp" data-rewardtoggle="${r.id}" data-on="${r.active ? 0 : 1}">${r.active ? 'Pause' : 'Turn on'}</button><label class="btn sec sm sp" style="cursor:pointer;text-align:center">${r.photo ? 'Change photo' : 'Add photo'}<input type="file" accept="image/*" hidden data-rwfile="${r.id}"></label><button class="btn danger sm sp" data-rewarddel="${r.id}">Delete</button></div></div>`).join('') || '<div class="card empty sm">No rewards yet. Try "Free haircut" for 10 points, or "₱50 off" for 5 points.</div>'}</div>`;
};
function openReward() {
  const o = sheet(`<h3>New reward</h3><label class="f" style="margin-top:0">Name<input id="rwname" maxlength="60" placeholder="e.g. Free haircut"></label>
    <div class="row" style="gap:10px"><label class="f sp" style="margin:0">Discount type<select id="rwkind"><option value="item">Free item (no discount)</option><option value="percent">Percent off (%)</option><option value="amount">Peso off (₱)</option></select></label><label class="f" id="rwvalwrap" style="margin:0;width:100px;display:none">Value<input id="rwvalue" type="number" min="1" step="1" value="100" inputmode="numeric"></label></div>
    <label class="f">Points needed<input id="rwcost" type="number" min="1" max="500" step="1" value="10" inputmode="numeric"></label>
    <div id="rwimg"></div><div class="row" style="margin-top:10px"><label class="btn sec sm" style="cursor:pointer">${ic('plus')} Add a picture<input type="file" id="rwpic" accept="image/*" hidden></label><span class="mute sm">Like a free haircut or a cap. Members see it.</span></div>
    <div class="sm mute" id="rwhint" style="margin-top:6px">A free item (like a cap) has no money value and is not deducted from any sale. The member shows the voucher code and you hand it over, then mark it as claimed in Pro tools, Dashboard.</div>
    <div id="rwerr2"></div><div class="row" style="margin-top:14px"><button class="btn ghost sp" data-x>Cancel</button><button class="btn sp" id="rwsave">Create reward</button></div>`);
  let rwImg = null;
  o.querySelector('#rwkind').addEventListener('change', e => { const it = e.target.value === 'item'; o.querySelector('#rwvalwrap').style.display = it ? 'none' : ''; o.querySelector('#rwhint').textContent = it ? 'A free item (like a cap) has no money value and is not deducted from any sale. The member shows the voucher code and you hand it over, then mark it as claimed in Pro tools, Dashboard.' : '100% off means a free service. The discount applies to the whole ticket.'; });
  o.querySelector('#rwpic').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try { rwImg = await compress(f); o.querySelector('#rwimg').innerHTML = `<div style="position:relative;margin-top:10px"><img src="${rwImg}" alt="" style="width:100%;height:150px;object-fit:cover;border-radius:12px"><button class="btn sm danger" style="position:absolute;top:6px;right:6px;background:var(--bg)" id="rwx">✕</button></div>`; o.querySelector('#rwerr2').innerHTML = ''; o.querySelector('#rwx').onclick = () => { rwImg = null; o.querySelector('#rwimg').innerHTML = ''; }; }
    catch (x) { o.querySelector('#rwerr2').innerHTML = `<div class="err">${esc(x.message)}</div>`; }
  });
  o.querySelector('#rwsave').onclick = async ev => {
    const btn = ev.currentTarget; btn.disabled = true;
    try { await api('/pro/rewards', { method: 'POST', body: { photo: rwImg || undefined, name: o.querySelector('#rwname').value, kind: o.querySelector('#rwkind').value, value: o.querySelector('#rwvalue').value, cost: o.querySelector('#rwcost').value } }, S.proToken); o.remove(); toast('Reward created'); await loadRules(); render(); }
    catch (x) { o.querySelector('#rwerr2').innerHTML = `<div class="err">${esc(x.message)}</div>`; btn.disabled = false; }
  };
}
const voucherChips = () => { const vs = ((S.loyal && S.loyal.vouchers) || []).filter(v => v.status === 'active' && v.kind !== 'item'); return vs.length ? `<div class="sm mute" style="margin-top:10px">Your vouchers</div><div class="chips">${vs.map(v => `<button class="chip" data-usevoucher="${esc(v.code)}">${esc(v.name)} · ${esc(v.code)}</button>`).join('')}</div>` : ''; };
async function loadBlocks() { try { S.blocks = (await api('/pro/blocks?staffId=' + S.proSel, {}, S.proToken)).blocks; } catch { S.blocks = []; } }
const blocksSection = () => `<div class="sec-h"><h2>Time off & blocks</h2><button class="btn white sm" data-blockadd>Block time</button></div><div class="list">${(S.blocks || []).map(b => `<div class="card row"><div class="sp"><b>${fmtDate(b.date)}</b><div class="sm mute">${b.allDay ? 'Whole day' : t12(b.from) + ' to ' + t12(b.to)}${b.reason ? ' · ' + esc(b.reason) : ''}</div></div><button class="btn danger sm" data-blockdel="${b.id}">Remove</button></div>`).join('') || '<div class="card empty sm">No blocked time. Block a break, training or a day off so nobody can book it.</div>'}</div>`;
function openBlock() {
  const today = ymd(new Date()), o = sheet(`<h3>Block time</h3><label class="f" style="margin-top:0">Date<input id="bdate" type="date" min="${today}" value="${today}"></label>
    <label class="row" style="gap:10px;margin:10px 0;cursor:pointer"><input type="checkbox" id="ball" style="width:20px;height:20px"><b>Whole day (day off)</b></label>
    <div class="row" id="btimes" style="gap:10px"><label class="f sp" style="margin:0">From<input id="bfrom" type="time" step="900" value="12:00"></label><label class="f sp" style="margin:0">To<input id="bto" type="time" step="900" value="13:00"></label></div>
    <div class="chips" style="margin-top:10px">${['Break', 'Training', 'Day off', 'Errand'].map(r => `<button class="chip" data-reason="${r}">${r}</button>`).join('')}</div><label class="f">Reason (optional)<input id="breason" maxlength="60" placeholder="e.g. Training"></label>
    <div id="berr"></div><div class="row" style="margin-top:14px"><button class="btn ghost sp" data-x>Cancel</button><button class="btn sp" id="bsave">Block this time</button></div>`);
  o.addEventListener('click', e => { const r = e.target.closest('[data-reason]'); if (r) o.querySelector('#breason').value = r.dataset.reason; });
  o.querySelector('#ball').addEventListener('change', e => { o.querySelector('#btimes').style.opacity = e.target.checked ? .4 : 1; });
  o.querySelector('#bsave').onclick = async ev => {
    const btn = ev.currentTarget; btn.disabled = true;
    try {
      const j = await api('/pro/block', { method: 'POST', body: { staffId: S.proSel, date: o.querySelector('#bdate').value, allDay: o.querySelector('#ball').checked, from: o.querySelector('#bfrom').value, to: o.querySelector('#bto').value, reason: o.querySelector('#breason').value } }, S.proToken);
      await loadBlocks(); render();
      if (j.conflicts && j.conflicts.length) { o.querySelector('.sheet').innerHTML = `<h3>Blocked</h3><div class="err" style="margin-top:0">These customers already have bookings in that time. Please contact them to move their appointment:</div>${j.conflicts.map(c => `<div class="row sm" style="padding:8px 0;border-top:1px solid var(--line)"><b style="width:76px">${t12(c.time)}</b><span class="sp">${esc(c.customer)}</span>${c.phone ? `<a class="btn white sm" href="tel:${esc(c.phone)}">Call</a>` : ''}</div>`).join('')}<button class="btn block" style="margin-top:14px" data-x>Done</button>`; }
      else { o.remove(); toast('Time blocked'); }
    } catch (x) { o.querySelector('#berr').innerHTML = `<div class="err">${esc(x.message)}</div>`; btn.disabled = false; }
  };
}
function vOwner() {
  const d = S.shopData; if (!d) return skelList();
  const t = d.totals;
  return `<div class="row" style="margin-bottom:14px"><a class="btn sec block" href="/backend">Open the back office</a></div>
  <div class="grid2 kpis" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${kpi('Sales today', peso(t.today), `${t.transactions} transactions`, 'Finished visits today in all branches, after discounts and approved corrections. Voided records are left out.')}${kpi('Sales · 7 days', peso(t.week), '', 'The same, for today and the 6 days before.')}${kpi('Bookings today', t.bookings, '', 'Bookings for today that are still booked or have arrived. Cancelled and no-shows are left out.')}${kpi('Queue now', t.waiting + t.cutting, `${t.waiting} waiting · ${t.cutting} cutting`, 'Customers waiting plus customers in the chair right now.')}</div>
  <div class="sec-h"><h2>Branches</h2><span class="mute sm">${t.onDuty} barbers on duty</span></div><div class="list">${d.branches.map(b => `<div class="card"><div class="row"><b>${esc(b.name)}</b><span class="sp"></span><b class="num" style="font-size:20px">${peso(b.today)}</b></div><div class="sm mute">${b.todayCount} transactions today · 7 days ${peso(b.week)}</div><div class="sm mute" style="margin-top:4px">${[b.onDuty ? b.onDuty + ' on duty' : '', b.waiting ? b.waiting + ' waiting' : '', b.cutting ? b.cutting + ' in the chair' : '', b.bookings ? b.bookings + ' booked' : ''].filter(Boolean).join(' · ') || 'No one in today'}</div></div>`).join('')}</div>
  ${carryCard()}
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
async function loadShopOwner() { try { S.shopData = await api('/pro/shop', {}, S.proToken); S.carry = await sapi('/loyalty/carry-over').catch(() => null); } catch (e) { S.shopData = null; toast(e.message); } render(); }   // T38: the carry-over count
// T38: carry-over of past visits into points. The owner sees the count first (for stock planning), then decides.
function carryCard() {
  const c = S.carry; if (!c) return '';
  if (c.done) return `<div class="sec-h"><h2>Points carry-over</h2></div><div class="card sm mute">Done: ${c.carried} customers got their past visits as points.</div>`;
  const lvl = [[10, 'free haircut'], [15, 'Viro product'], [25, 'cap'], [40, 'shirt'], [50, 'VIP']];
  return `<div class="sec-h"><h2>Points carry-over</h2><span class="mute sm">not done yet</span></div><div class="card">
    <div class="sm">${c.customers} customers have ${c.visits} past paid visits. Each visit becomes 1 point, and rewards can be claimed right away (D-3a). Customers who would start at or above:</div>
    <div class="list" style="margin-top:8px">${lvl.map(([k, n]) => `<div class="row sm"><span class="sp">${k} points (${n})</span><b>${c.atLeast[k] ?? 0}</b></div>`).join('')}</div>
    <div class="sm mute" style="margin-top:8px">Check your stock of Viro products, caps and shirts before you start. This is done once and cannot be undone.</div>
    ${c.customers ? '<button class="btn sec block" data-carrygo style="margin-top:10px">Carry over past visits now</button>' : ''}</div>`;
}
document.addEventListener('click', async e => {
  if (!e.target.closest('[data-carrygo]')) return;
  if (!confirm(`Give ${S.carry.customers} customers their ${S.carry.visits} past visits as points? This cannot be undone.`)) return;
  try { const j = await sapi('/loyalty/carry-over', { method: 'POST', body: { confirm: true } }); toast(`Done: ${j.created} customers`); S.carry = await sapi('/loyalty/carry-over'); render(); } catch (x) { toast(x.message); }
});

async function loadDash() {
  S.dash = null; S.earn = null; if (!S.pro || !S.proSel || S.pro.desk) return;   // the front desk has no barber dashboard
  try { S.dash = await api(`/pro/dashboard?staffId=${S.proSel}&range=${S.dashRange}`, {}, S.proToken); } catch (e) { S.dash = null; toast(e.message); }
  await loadBlocks();
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
// ----- sample illustrations for each haircut (drawn in code; replaced by a barber's real photo once one is uploaded for that style) -----
let artN = 0;
const ART_TOP = {
  'low-fade': 'M27 36 C25 20 38 15 50 15 C62 15 75 20 73 36 C70 29 62 26 50 26 C38 26 30 29 27 36Z',
  'mid-fade': 'M27 36 C24 17 38 11 50 11 C62 11 76 17 73 36 C70 28 62 24 50 24 C38 24 30 28 27 36Z',
  'high-fade': 'M28 34 C26 12 36 7 50 7 C64 7 74 12 72 34 C69 26 62 21 50 21 C38 21 31 26 28 34Z',
  'taper-fade': 'M26 38 C23 18 37 12 50 12 C63 12 77 18 74 38 C71 29 62 25 50 25 C38 25 29 29 26 38Z',
  'skin-fade': 'M28 35 C26 18 38 12 50 12 C62 12 74 18 72 35 C69 28 62 24 50 24 C38 24 31 28 28 35Z',
  'burst-fade': 'M27 36 C22 26 26 14 36 14 C40 7 48 7 52 11 C58 7 68 11 68 17 C76 20 78 30 73 36 C70 28 62 25 50 25 C38 25 30 28 27 36Z',
  'french-crop': 'M26 38 C24 20 36 14 50 14 C64 14 76 20 74 38 L72 33 C66 31 60 33 50 33 C40 33 34 31 28 33Z',
  'textured-crop': 'M26 38 C24 20 36 13 50 13 C64 13 76 20 74 38 L70 31 L65 36 L60 30 L55 36 L50 30 L45 36 L40 30 L35 36 L30 31Z',
  'buzz-cut': 'M28.5 34 C27 19 39 14 50 14 C61 14 73 19 71.5 34 C68 26 60 23 50 23 C40 23 32 26 28.5 34Z',
  'pompadour': 'M26 38 C19 20 30 3 50 3 C70 3 83 18 74 38 C72 30 64 21 50 21 C36 21 28 30 26 38Z',
  'slick-back': 'M26 36 C25 18 38 11 50 11 C64 11 76 18 74 36 C72 28 64 22 50 22 C36 22 28 28 26 36Z',
  'two-block': 'M25 40 C22 18 36 11 50 11 C64 11 78 18 75 40 C72 33 66 31 58 33 C52 29 44 31 38 33 C32 31 28 34 25 40Z',
  'scissor-cut': 'M24 46 C19 18 36 9 52 9 C68 9 81 20 76 46 C74 34 66 27 52 26 C42 26 30 30 24 46Z',
  'long-flow': 'M25 38 C22 16 38 9 50 9 C62 9 78 16 75 38 C71 28 62 24 50 24 C38 24 29 28 25 38Z M25 36 C19 52 19 72 25 90 L36 86 C32 70 32 52 34 38Z M75 36 C81 52 81 72 75 90 L64 86 C68 70 68 52 66 38Z'
};
const ART_FADE = { 'low-fade': [42, 60], 'mid-fade': [34, 50], 'high-fade': [27, 41], 'taper-fade': [46, 58], 'skin-fade': [30, 38], 'burst-fade': [34, 52], 'buzz-cut': [60, 61], 'french-crop': [40, 54], 'textured-crop': [38, 52], 'pompadour': [40, 54], 'slick-back': [42, 56], 'two-block': [36, 50] };
const ART_LINES = { 'pompadour': 'M34 22 C40 12 56 10 66 20 M38 26 C44 17 56 15 64 24', 'slick-back': 'M32 24 C42 17 58 17 68 24 M30 28 C42 21 58 21 70 28 M34 20 C44 14 56 14 66 20', 'textured-crop': '', 'burst-fade': 'M36 18 C40 14 44 14 46 18 M54 16 C58 12 64 14 64 19' };
function styleArt(name) {
  const c = CUTS.find(x => x.name === name), id = c ? c.id : 'taper-fade', i = Math.max(0, CUTS.findIndex(x => x.id === id)), n = ++artN;
  const skin = ['#d9a982', '#b98563', '#946348'][i % 3], shade = ['#c18f6b', '#a2704f', '#7c5239'][i % 3], bg = [['#2c313a', '#171a1f'], ['#293342', '#14181e'], ['#332f3b', '#1a191f'], ['#2e3b37', '#16201c']][i % 4], hair = '#0e0f11', edge = '#40444d';
  const f = ART_FADE[id], y0 = 20, y1 = 66, p = v => Math.max(0, Math.min(1, (v - y0) / (y1 - y0)));
  const side = f ? `<defs><linearGradient id="sf${n}" x1="0" y1="${y0}" x2="0" y2="${y1}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${hair}"/><stop offset="${p(f[0])}" stop-color="${hair}"/><stop offset="${p(f[1])}" stop-color="${hair}" stop-opacity="0"/></linearGradient></defs>
    <path d="M27.5 26 L37 28 L35 46 L32.5 62 L28.5 64 L26 50Z" fill="url(#sf${n})"/><path d="M72.5 26 L63 28 L65 46 L67.5 62 L71.5 64 L74 50Z" fill="url(#sf${n})"/>` : '';
  const hasSideHair = id === 'scissor-cut' ? `<path d="M26 40 L35 38 L34 56 L28 54Z M74 40 L65 38 L66 56 L72 54Z" fill="${hair}"/>` : '';
  const op = id === 'buzz-cut' ? '.82' : '1';
  return `<svg class="sa" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${esc(name)} illustration" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="bg${n}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></linearGradient></defs>
    <rect width="100" height="100" fill="url(#bg${n})"/>
    ${id === 'long-flow' ? '' : ''}<path d="M8 100 Q12 82 50 79 Q88 82 92 100Z" fill="#2a2f37"/><rect x="42" y="68" width="16" height="16" rx="4" fill="${shade}"/>
    <ellipse cx="28.5" cy="52" rx="3.6" ry="6" fill="${skin}"/><ellipse cx="71.5" cy="52" rx="3.6" ry="6" fill="${skin}"/><ellipse cx="50" cy="50" rx="22" ry="27" fill="${skin}"/>
    ${side}${hasSideHair}<path d="${ART_TOP[id]}" fill="${hair}" fill-opacity="${op}" stroke="${edge}" stroke-width=".8" stroke-linejoin="round"/>${ART_LINES[id] ? `<path d="${ART_LINES[id]}" fill="none" stroke="${edge}" stroke-width="1" stroke-linecap="round"/>` : ''}
    <circle cx="41" cy="51" r="1.5" fill="#1b1210"/><circle cx="59" cy="51" r="1.5" fill="#1b1210"/><path d="M50 53 L48.5 60 L51.5 60" fill="none" stroke="${shade}" stroke-width="1.2" stroke-linecap="round"/><path d="M44.5 67 Q50 70 55.5 67" fill="none" stroke="#6b3f2e" stroke-width="1.3" stroke-linecap="round"/></svg>`;
}
// ----- service packages: what a barber can offer -----
const PKGS = [['cut', 'Haircut only', 'Quick and clean. In and out.', 'Haircut'], ['blow', 'Haircut + blower, shampoo & styling', 'Cut, shampoo, blow dry and styling.', 'Blower pkg'], ['full', 'Full package', 'The pamper day: the works, start to finish.', 'Full package']];
const PK = Object.fromEntries(PKGS.map(([k, name, desc, short]) => [k, { name, desc, short }]));
function pkgArt(k) {
  const n = ++artN, w = '#e8ebf1', dim = '#98a0ad', gold = '#f3c969', blue = '#4f9bff', bg = { cut: ['#2b3039', '#16181d'], blow: ['#26303f', '#14181f'], full: ['#352f27', '#1a1713'] }[k] || ['#2b3039', '#16181d'];
  const scissors = `<g fill="none" stroke="${w}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"><path d="M33 20 L60 66"/><path d="M63 20 L36 66"/><circle cx="33" cy="77" r="9.5"/><circle cx="63" cy="77" r="9.5"/></g><circle cx="48" cy="43" r="3.2" fill="${gold}"/>`;
  const comb = `<rect x="58" y="12" width="36" height="10" rx="3" fill="${w}"/><path d="M62 22v9M67 22v9M72 22v9M77 22v9M82 22v9M87 22v9" stroke="${w}" stroke-width="2" stroke-linecap="round"/>`;
  const dryer = `<rect x="18" y="26" width="48" height="26" rx="13" fill="${w}"/><rect x="64" y="31" width="16" height="16" rx="3" fill="${dim}"/><path d="M36 50 L31 80 Q31 85 36 85 L45 85 Q50 85 50 80 L46 50Z" fill="${w}"/><circle cx="34" cy="39" r="3" fill="${dim}"/>`;
  const air = `<g fill="none" stroke="${blue}" stroke-width="3" stroke-linecap="round"><path d="M86 30 q8 -2 10 -9"/><path d="M88 39 q9 0 12 -3"/><path d="M86 48 q8 3 10 10"/></g>`;
  const bottle = `<rect x="8" y="44" width="24" height="40" rx="7" fill="${w}"/><rect x="14" y="35" width="12" height="10" rx="2.5" fill="${dim}"/><rect x="13" y="58" width="14" height="15" rx="3.5" fill="${blue}"/>`;
  const drops = `<g fill="none" stroke="${blue}" stroke-width="2.2"><circle cx="40" cy="22" r="4"/><circle cx="52" cy="14" r="2.6"/><circle cx="26" cy="20" r="2.2"/></g>`;
  const crown = `<path d="M28 44 L33 18 L50 34 L67 18 L72 44Z" fill="${gold}"/><rect x="28" y="44" width="44" height="7" rx="2.5" fill="${gold}"/><circle cx="33" cy="16" r="3.2" fill="${gold}"/><circle cx="50" cy="31" r="3" fill="${gold}"/><circle cx="67" cy="16" r="3.2" fill="${gold}"/>`;
  const spark = `<path d="M16 22 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z M84 56 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6z" fill="${gold}"/>`;
  const body = k === 'blow' ? `<g transform="translate(2 2)">${dryer}${air}${drops}</g><g transform="translate(-2 6) scale(.92)">${bottle}</g>`
    : k === 'full' ? `<g transform="translate(14 -2) scale(.72)">${crown}</g><g transform="translate(6 50) scale(.5)">${scissors}</g><g transform="translate(34 48) scale(.5)">${dryer}</g><g transform="translate(66 50) scale(.52)">${bottle}</g>${spark}`
    : `<g transform="translate(-4 0)">${scissors}${comb}</g>`;
  return `<svg class="sa" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${esc((PK[k] || {}).name || k)}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="pg${n}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></linearGradient></defs><rect width="100" height="100" fill="url(#pg${n})"/>${body}</svg>`;
}
// premium touches: skeletons while loading, and real shop prices when a barber has not set their own
const skelList = () => '<div class="skel"><div class="sk h1"></div><div class="sk h2"></div><div class="sk h3"></div></div>';
const shopFrom = () => { const p = ((S.D && S.D.services) || []).map(x => +x.price).filter(x => x > 0); return p.length ? Math.min(...p) : 0; };
const shopMenuRows = b => { const sv = svcFor(b.branchId).slice(0, 4); return sv.length ? sv.map(x => `<div class="card row">${x.photo ? `<img src="${esc(x.photo)}" alt="" style="width:48px;height:48px;border-radius:12px;object-fit:cover;flex:none">` : ''}<div class="sp"><div class="nm">${esc(x.name)}</div><div class="sm mute">${x.mins || 30} min · shop menu</div></div><div style="text-align:right"><b class="num" style="font-size:19px">${peso(x.price)}</b><div><button class="btn sec sm" style="margin-top:4px" data-book="${b.id}">Book</button></div></div></div>`).join('') : '<div class="card empty sm">Prices are set by the shop. Book and pay at the counter.</div>'; };
function offersBlock(b) {
  const o = b.offers || [];
  return `<div class="sec-h" style="margin-top:14px"><h2>Services & prices</h2></div><div class="list">${o.length ? o.map(x => `<div class="card row"><div class="pa s">${pkgArt(x.pkg)}</div><div class="sp"><div class="nm">${esc(PK[x.pkg].name)}</div><div class="sm mute">${esc(PK[x.pkg].desc)}</div></div><div style="text-align:right"><b class="num" style="font-size:20px">${peso(x.price)}</b><div><button class="btn sec sm" style="margin-top:4px" data-bookpkg="${x.pkg}">Book</button></div></div></div>`).join('') : shopMenuRows(b)}</div>`;
}
const offersEditor = sel => `<div class="sec-h"><h2>Services I offer</h2></div><div class="card"><div class="sm mute" style="margin-bottom:6px">Turn on what you cater to and set your price. Customers can find you by these. Your price is shown to customers; the shop still charges at the POS.</div>${PKGS.map(([k, name, desc]) => { const o = (sel.offers || []).find(x => x.pkg === k); return `<div class="row" style="padding:10px 0;border-top:1px solid var(--line);gap:10px;align-items:center"><label class="row sp" style="gap:10px;cursor:pointer;min-width:0"><input type="checkbox" data-opk="${k}" ${o ? 'checked' : ''} style="width:20px;height:20px;flex:none"><span class="pa s">${pkgArt(k)}</span><span style="min-width:0"><b>${esc(name)}</b><span class="sm mute" style="display:block">${esc(desc)}</span></span></label><span class="row" style="gap:4px;flex:none"><span class="mute">₱</span><input type="number" min="1" max="99999" inputmode="numeric" data-opp="${k}" value="${o ? o.price : ''}" placeholder="Price" style="width:88px" ${o ? '' : 'disabled'}></span></div>`; }).join('')}<button class="btn block" style="margin-top:12px" data-offsave>Save services</button></div>`;
function recommend() {
  return CUTS.map(c => { let sc = (c.face.includes(SF.face) ? 50 : 0) + (c.hair.includes(SF.hair) ? 30 : 0); sc += 20 - Math.abs(c.care - (SF.care || 2)) * 10; return { c, sc }; }).filter(x => x.sc >= 50).sort((a, b) => b.sc - a.sc).slice(0, 3);
}
function vStyle() {
  const saved = (S.user?.styles || []), pick = (k, v) => SF[k] === v ? 'on' : '';
  if (SF.done) {
    const rec = recommend(), face = FACES.find(f => f[0] === SF.face)[1];
    return header('Your style', '/') + `<div class="card"><div class="sm mute">Based on</div><b>${esc(face)} face · ${esc(HAIRS.find(h => h[0] === SF.hair)[1])} hair · ${CARES.find(c => c[0] === (SF.care || 2))[1]} upkeep</b></div>
    <div class="list" style="margin-top:12px">${rec.map(({ c }, i) => `<div class="card pop"><div class="sart">${styleArt(c.name)}</div>${i === 0 ? '<span class="tag on">Best match</span> ' : ''}<h3 style="font-size:22px;margin:6px 0 4px">${esc(c.name)}</h3><div class="mute sm" style="margin-bottom:8px">${esc(c.note)}</div>
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
  const lv = j.live, stat = (n, l) => `<b>${n}</b><span>${l}</span>`;
  return header('', '/discover') + `<div class="row" style="align-items:center;gap:12px;flex-wrap:wrap;margin-top:4px"><div style="flex:1 1 150px;min-width:0"><div class="row" style="gap:10px;flex-wrap:wrap"><h1 style="font-size:28px;overflow-wrap:anywhere">${esc(s.name)}</h1>${s.brand ? `<span class="brandt lg">🤝 ${esc(s.brand)}</span>` : ''}${lv ? `<span class="tag ${lv.open ? 'ok' : 'bad'}">${lv.open ? 'Open now' : 'Closed'}</span>` : ''}</div><div class="mute sm" style="overflow-wrap:anywhere">${esc(s.address || (s.brand || 'Brotherhood Barbershop'))}</div></div>
    ${lv ? `<div class="sbox" aria-label="Live shop status">${lv.open ? stat(lv.waiting, 'waiting') + stat(lv.cutting, 'in the chair') + stat(lv.onDuty, 'barber' + (lv.onDuty === 1 ? '' : 's') + ' on duty') : `<span class="one">Opens ${t12(s.openTime)}</span>`}</div>` : ''}</div>
  <div style="margin:6px 0 12px">${rate(s.rating, s.reviews)} <span class="tag">${t12(s.openTime)}–${t12(s.closeTime)}</span></div>
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
    const c = document.createElement('link'); c.rel = 'stylesheet'; c.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; c.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY='; c.crossOrigin = 'anonymous'; document.head.appendChild(c);
    const s = document.createElement('script'); s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; s.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo='; s.crossOrigin = 'anonymous'; s.onload = ok; s.onerror = () => no(new Error('Map failed to load')); document.head.appendChild(s);
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
  <div class="list">${!S.D ? skelList() : list.map(s => `<button class="bcard" data-shop="${s.id}">${s.photo ? `<img class="av" src="${esc(s.photo)}" alt="" loading="lazy" style="border-radius:12px">` : `<span class="av">${esc(initials(s.name))}</span>`}<div class="sp"><div class="nm">${esc(s.name)}</div><div class="sm mute">${esc(s.address || (s.brand || 'Brotherhood Barbershop'))} · ${t12(s.openTime)}–${t12(s.closeTime)}</div></div>${s.km != null ? `<b class="num">${kmText(s.km)}</b>` : ''}</button>`).join('') || '<div class="card empty">Shop locations are being added. Check back soon.</div>'}${missing > 0 && list.length ? `<div class="sm mute" style="text-align:center">${missing} more shop${missing === 1 ? ' is' : 's are'} not on the map yet.</div>` : ''}</div>`;
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
const NICON = { reminder: 'bell', due: 'scissors', waitlist: 'cal', reply: 'chat', booking: 'cal', rate: 'heart', like: 'heart', comment: 'chat', follow: 'team' };
function vNotifs() {
  if (!S.token) { setTimeout(() => nav('/auth')); return ''; }
  const n = S.notifs; if (!n) return header('Notifications', '/') + skelList();
  return header('Notifications', '/') + `<div class="list">${n.items.map(x => `<button class="bcard" data-ngo="${esc(x.link || '#/')}" style="${x.readAt ? 'opacity:.7' : 'border-color:var(--blue)'}"><span class="av" style="width:40px;height:40px">${ic(NICON[x.kind] || 'bell')}</span><div class="sp"><div>${esc(x.text)}</div><div class="sm mute">${(a => a === 'just now' ? a : a + ' ago')(ago(x.createdAt))}</div></div></button>`).join('') || emptyBox('bell', 'All caught up', 'Booking updates, reminders and community activity show up here.')}</div>`;
}
async function loadNotifs() {
  try { S.notifs = await api('/notifications'); S.unread = 0; await api('/notifications/read', { method: 'POST' }); } catch { S.notifs = { items: [] }; }
  render();
}
setInterval(async () => { if (S.token && !document.hidden) { try { const j = await api('/me'); if (j.unread !== S.unread && route().a !== 'notifications') { S.unread = j.unread; render(); } } catch { } } }, 60000);

// ----- community -----
const ago = iso => { const m = Math.max(0, (Date.now() - new Date(iso)) / 60000); return m < 1 ? 'just now' : m < 60 ? Math.floor(m) + 'm' : m < 1440 ? Math.floor(m / 60) + 'h' : Math.floor(m / 1440) + 'd'; };
const QUICK = ['✂️', '💈', '🔥', '💯', '👏', '🙌', '❤️'];
async function loadFeed() {
  const tab = S.ctab || 'feed', scope = tab === 'saved' ? 'saved' : tab === 'me' ? 'mine' : S.feedScope;
  if (scope !== 'all' && !S.token) { S.feed = { posts: [], more: false, needLogin: true }; return; }
  const qs = new URLSearchParams({ scope, style: tab === 'feed' ? S.cstyle : '', q: S.cq || '', spot: tab === 'feed' ? '1' : '' });
  try { S.feed = await api('/feed?' + qs); if (tab === 'feed') S.spot = S.feed.spotlight || null; } catch { S.feed = { posts: [], more: false }; }
}
async function loadCuts() { try { S.cuts = await api('/cuts?style=' + encodeURIComponent(S.cstyle || '')); } catch { S.cuts = { items: [], styles: [] }; } }
async function loadCommunity() { if ((S.ctab || 'feed') === 'cuts') await loadCuts(); else await loadFeed(); render(); }
function postCard(p) {
  return `<article class="card pop post"><div class="row"><a href="#/member/${p.userId}" aria-label="${esc(p.author)}">${p.authorPhoto ? `<img class="av" src="${esc(p.authorPhoto)}" alt="" style="width:40px;height:40px" loading="lazy">` : `<span class="av" style="width:40px;height:40px;font-size:14px">${esc(initials(p.author))}</span>`}</a><div class="sp"><a href="#/member/${p.userId}" style="font-weight:700">${esc(p.author)}</a><div class="sm mute">${ago(p.createdAt)}${p.staffName ? ` · cut by <a href="#/barber/${p.staffId}" style="color:var(--text);text-decoration:underline">${esc(p.staffName)}</a>` : ''}</div></div>
    ${!p.mine && S.user ? `<button class="btn sec sm" data-pfollow="${p.userId}" data-on="${p.following ? 1 : 0}">${p.following ? 'Following' : 'Follow'}</button>` : ''}
    <details style="position:relative"><summary class="btn sec sm" style="list-style:none">•••</summary><div class="card" style="position:absolute;right:0;z-index:4;width:170px;padding:6px;display:grid;gap:4px">${p.mine ? `<button class="btn ghost sm" data-pdel="${p.id}" data-ptype="post">Delete post</button>` : `<button class="btn ghost sm" data-preport="${p.id}">Report post</button><button class="btn ghost sm" data-pblock="${p.userId}">Block ${esc(p.author)}</button>`}</div></details></div>
    ${p.text ? `<p style="margin:10px 0 0;white-space:pre-wrap;word-break:break-word">${esc(p.text)}</p>` : ''}
    ${p.style ? `<div style="margin-top:8px"><span class="gold">${esc(p.style)}</span></div>` : ''}
    ${p.image ? `<img class="media" src="${esc(p.image)}" alt="Post photo" data-lb="${esc(p.image)}" loading="lazy">` : ''}
    <div class="act"><button class="heart ${p.liked ? 'on' : ''}" data-plike="${p.id}" aria-label="Like">${ic('heart')} ${p.likes}</button><button data-pcomm="${p.id}" aria-label="Comments">${ic('chat')} ${p.comments}</button><button class="sv ${p.saved ? 'on' : ''}" data-psave="${p.id}" aria-label="Save">${ic('bookmark')}</button><span class="sp"></span>
    ${p.staffId ? `<button class="btn white sm" data-go="/barber/${p.staffId}" style="color:#09090a">Book ${esc(p.staffName.split(' ')[0])}</button>` : ''}</div></article>`;
}
function vCommunity() {
  const tab = S.ctab || 'feed', f = S.feed, u = S.user, sp = S.spot;
  const tabs = [['feed', 'Feed'], ['cuts', 'Cuts'], ['saved', 'Saved'], ['me', 'Profile']], styleNames = CUTS.map(c => c.name);
  const chips = (list, cur, attr, allLabel) => `<div class="chips"><button class="chip ${cur ? '' : 'on'}" ${attr}="">${allLabel}</button>${list.map(x => `<button class="chip ${cur === x ? 'on' : ''}" ${attr}="${esc(x)}">${esc(x)}</button>`).join('')}</div>`;
  const loginCard = msg => `<div class="card empty">${esc(msg)}<div style="margin-top:10px"><button class="btn sm" data-go="/auth">Log in</button></div></div>`;
  let body = '';
  if (tab === 'feed') {
    body = `<div class="chips"><button class="chip ${S.feedScope === 'all' ? 'on' : ''}" data-cscope="all">Latest</button><button class="chip ${S.feedScope === 'following' ? 'on' : ''}" data-cscope="following">Following</button></div>` + chips(styleNames, S.cstyle, 'data-cstyle', 'All styles');
  } else if (tab === 'cuts') {
    const c = S.cuts; body = chips(c ? c.styles : [], S.cstyle, 'data-cstyle', 'All styles');
    body += !c ? skelList() : c.items.length ? `<div class="pgrid">${c.items.map((i, k) => `<button class="pcard" data-ctile="${k}"><span class="ptag">${i.kind === 'cut' ? 'CUT' : 'POST'}</span><img src="${esc(i.image)}" alt="${esc(i.title)}" loading="lazy"><div class="pt">${esc(i.title)}</div><div class="ps">${esc(i.style || i.barberName || i.author || '')}</div></button>`).join('')}</div>` : '<div class="card empty">No cuts here yet. Be the first to post one.</div>';
  } else if (tab === 'me') {
    if (!u) body = loginCard('Log in to see your profile and posts.');
    else { const st = (f && f.stats) || { posts: 0, likes: 0, following: S.favs.length };
      body = `${memberPhotos(u)}
      <div class="stats5" style="grid-template-columns:repeat(3,1fr)"><div><b class="num">${st.posts}</b><span>Posts</span></div><div><b class="num">${st.likes}</b><span>Likes</span></div><div><b class="num">${st.following}</b><span>Barbers followed</span></div></div>`; }
  }
  let list = '';
  if (tab === 'feed' || tab === 'saved' || tab === 'me') {
    if (!f) list = skelList();
    else if (f.needLogin) list = tab === 'me' ? '' : loginCard(tab === 'saved' ? 'Log in to see the posts you saved.' : 'Log in to see posts from the members and barbers you follow.');
    else list = f.posts.length ? f.posts.map(postCard).join('') : `<div class="card empty">${tab === 'saved' ? `<div style="font-size:30px">${ic('bookmark')}</div><b>No saved items yet</b><div class="sm">Tap the bookmark on any post to save it here.</div>` : tab === 'me' ? 'You have not posted yet. Share your first cut.' : S.feedScope === 'following' ? 'Follow members or barbers to see their posts here.' : S.cstyle || S.cq ? 'No posts match. Try another style or search.' : 'No posts yet. Be the first!'}</div>`;
  }
  return header('Community') + `<div class="mute sm" style="margin:14px 0 10px">Cuts and wins from the brotherhood.</div>
  <div class="chero"><div class="sp"><h2>Show your best cut</h2><p>Post a fresh cut, tag your barber, and inspire the brotherhood.</p><button class="btn white" data-compose>Post a cut</button></div></div>
  <div class="ctiles">${sp ? `<button class="ctile" data-go="/barber/${sp.id}"><span class="sm mute">Barber of the week</span><div class="row">${pic(sp.photo, sp.name, 'av')}<div class="sp"><b>${esc(sp.name)}</b><div class="sm mute">${esc(sp.branchName)}</div></div></div><span class="sm">${sp.cuts} cut${sp.cuts === 1 ? '' : 's'} this week ›</span></button>`
      : `<button class="ctile" data-go="/discover"><span class="sm mute">Barbers</span><b style="font-size:17px">Find your barber</b><span class="sm">Explore</span></button>`}</div>
  <div class="ctabs">${tabs.map(([k, n]) => `<button class="${tab === k ? 'on' : ''}" data-ctab="${k}">${n}</button>`).join('')}</div>
  ${tab !== 'cuts' && tab !== 'me' ? `<div class="row" style="margin-bottom:12px;gap:8px"><div class="search sp">${ic('search')}<input id="cq" placeholder="${tab === 'saved' ? 'Search saved items' : 'Search posts, styles or barbers'}" value="${esc(S.cq || '')}" autocomplete="off"></div></div>` : `<div class="row" style="justify-content:flex-end;margin-bottom:10px"><button class="btn white sm" data-compose>+ Post</button></div>`}
  ${body}<div class="list">${list}</div>
  <p class="mute sm" style="text-align:center;margin-top:18px">Be respectful. Report anything that breaks the brotherhood rules. Posts reported by 3 members are hidden for review.</p>`;
}
function sheet(inner) {
  const o = document.createElement('div'); o.className = 'lb'; o.style.alignItems = 'end'; o.innerHTML = `<div class="sheet pop">${inner}</div>`;
  o.addEventListener('click', e => { const g = e.target.closest('[data-go]'); if (g) { o.remove(); return nav(g.dataset.go); } if (e.target === o || e.target.closest('[data-x]')) o.remove(); }); document.body.appendChild(o); countUp(o); return o;
}
// ----- motion (Foodpanda-style feel, our look): screen entrance with stagger, count-up figures. CSS does the rest. -----
const calm = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
function countUp(root) {
  if (calm()) return;
  root.querySelectorAll('.pts-big,.ptstrip .ptn b,.kpi .num,.sstats b.num').forEach(el => {
    const txt = el.textContent.trim(), m = txt.match(/^(₱?)([\d,]+)$/); if (!m || el.dataset.counted) return;
    const end = +m[2].replace(/,/g, ''); if (!end || end > 1e7) return; el.dataset.counted = '1';
    const t0 = performance.now(), dur = Math.min(900, 420 + end * 4), fmt = n => m[1] + Math.round(n).toLocaleString('en-PH');
    const step = t => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(end * e); if (k < 1) requestAnimationFrame(step); else el.textContent = txt; };
    el.textContent = fmt(0); requestAnimationFrame(step);
  });
}
let lastScreen = '', enterAt = 0;
// photos: a photo seen before shows at once when the page is drawn again; a new one fades in once when it arrives
const seenImg = new Set();
const markImg = im => { if (im.complete && im.naturalWidth) { im.classList.add('ld'); seenImg.add(im.currentSrc || im.src); } };
document.addEventListener('load', e => { if (e.target.tagName === 'IMG') markImg(e.target); }, true);
document.addEventListener('error', e => { if (e.target.tagName === 'IMG') e.target.classList.add('ld'); }, true);
function settlePhotos() {
  app.querySelectorAll('img').forEach(im => { if (seenImg.has(im.currentSrc || im.src) || seenImg.has(im.src)) { im.loading = 'eager'; im.classList.add('ld', 'now'); } else markImg(im); });
  // photos set as a background (barber covers): the same, using a hidden loader for each new address
  app.querySelectorAll('.bigimg[style*="url("],.pcover[style*="url("],.ecover[style*="url("]').forEach(el => {
    const m = (el.getAttribute('style') || '').match(/url\(['"]?([^'")]+)['"]?\)/); if (!m) return el.classList.add('ld');
    const src = new URL(m[1], location.href).href;
    if (seenImg.has(src)) return el.classList.add('ld', 'now');
    const im = new Image(); im.onload = im.onerror = () => { seenImg.add(src); document.querySelectorAll('.bigimg,.pcover,.ecover').forEach(x => { if ((x.getAttribute('style') || '').includes(m[1])) x.classList.add('ld'); }); }; im.src = src;
  });
}
// the fixed photos (Discover banners, Home hero) are fetched as soon as the app starts
BANNERS.map(b => b.img).concat(['/site/home-work2.jpg']).forEach(src => { const im = new Image(); im.onload = () => seenImg.add(new URL(src, location.href).href); im.src = src; });
function motionAfter() {
  settlePhotos();
  const key = location.hash.split('?')[0], now = performance.now();
  if (key === lastScreen) {
    // the same screen drawn again (its data arrived): the new elements carry on from where the entrance was, no second bounce
    if (app.classList.contains('enter')) app.style.setProperty('--el', -((now - enterAt) / 1000).toFixed(3) + 's');
    return;
  }
  lastScreen = key; enterAt = now; app.style.setProperty('--el', '0s');
  app.classList.remove('enter'); void app.offsetWidth; app.classList.add('enter');
  clearTimeout(motionAfter.t); motionAfter.t = setTimeout(() => { app.classList.remove('enter'); app.style.removeProperty('--el'); }, 1500);
  countUp(app);
}

function openComposer() {
  if (!S.token) return nav('/auth');
  const barbers = (S.D && S.D.barbers) || [];
  const o = sheet(`<h3>Post a cut</h3><textarea id="cptext" rows="3" maxlength="500" placeholder="Share a fresh cut, a tip, or something for the brotherhood"></textarea>
    <div id="cpimg"></div><div class="row" style="margin-top:8px"><label class="btn sec sm" style="cursor:pointer">${ic('plus')} Photo<input type="file" id="cpfile" accept="image/*" hidden></label><span class="mute sm">Optional</span></div>
    <label class="f">Style<select id="cpstyle"><option value="">No style tag</option>${CUTS.map(c => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('')}</select></label>
    <label class="f">Tag your barber<select id="cpbarber"><option value="">Not tagged</option>${barbers.map(b => `<option value="${b.id}">${esc(b.name)} · ${esc(b.branchName)}</option>`).join('')}</select></label>
    <div id="cperr"></div><div class="row" style="margin-top:14px"><button class="btn ghost sp" data-x>Cancel</button><button class="btn sp" id="cpgo">Post</button></div>`);
  let img = null; const err = m => { o.querySelector('#cperr').innerHTML = m ? `<div class="err">${esc(m)}</div>` : ''; };
  o.querySelector('#cpfile').addEventListener('change', async e => {
    const file = e.target.files[0]; e.target.value = ''; if (!file) return;
    try { img = await compress(file); o.querySelector('#cpimg').innerHTML = `<div style="position:relative;margin-top:8px"><img src="${img}" alt="" style="width:100%;max-height:220px;object-fit:cover;border-radius:12px"><button class="btn sm danger" style="position:absolute;top:6px;right:6px;background:var(--bg)" id="cpx">✕</button></div>`; err(''); o.querySelector('#cpx').onclick = () => { img = null; o.querySelector('#cpimg').innerHTML = ''; }; } catch (x) { err(x.message); }
  });
  o.querySelector('#cpgo').onclick = async ev => {
    const btn = ev.currentTarget; btn.disabled = true; btn.textContent = 'Posting…'; err('');
    try {
      await api('/posts', { method: 'POST', body: { text: o.querySelector('#cptext').value, data: img || undefined, style: o.querySelector('#cpstyle').value, staffId: o.querySelector('#cpbarber').value || undefined } });
      o.remove(); toast('Posted'); S.ctab = 'feed'; S.feedScope = 'all'; S.cstyle = ''; S.cq = ''; await loadCommunity();
    } catch (x) { err(x.message); btn.disabled = false; btn.textContent = 'Post'; }
  };
}
async function openComments(postId) {
  const post = (S.feed && S.feed.posts.find(x => x.id === postId)) || null; let list = [];
  try { list = (await api(`/posts/${postId}/comments`)).comments; } catch (x) { return toast(x.message); }
  const o = sheet(`<h3>Comments</h3><div id="cmlist"></div><div class="emo">${QUICK.map(e => `<button data-emo="${e}" aria-label="React ${e}">${e}</button>`).join('')}</div>
    ${S.user ? `<div class="row"><input id="cmin" maxlength="300" placeholder="Write a comment…"><button class="btn sm" id="cmgo">Send</button></div>` : '<div style="text-align:center"><button class="link" data-x data-go="/auth">Log in to comment</button></div>'}`);
  const draw = () => { o.querySelector('#cmlist').innerHTML = list.length ? list.map(x => `<div class="sm" style="margin-bottom:10px"><b>${esc(x.author)}</b> <span class="mute">${ago(x.createdAt)}</span>${x.mine ? ` <button class="link" data-cdelc="${x.id}">delete</button>` : ''}<div style="white-space:pre-wrap;word-break:break-word;font-size:14px">${esc(x.text)}</div></div>`).join('') : '<div class="empty" style="padding:22px 10px"><b>No comments yet</b><div class="sm">Your words could make someone\'s day. Be the first to comment!</div></div>'; };
  draw();
  const send = async text => {
    if (!S.token) return nav('/auth'); text = String(text || '').trim(); if (!text) return;
    try { const j = await api(`/posts/${postId}/comments`, { method: 'POST', body: { text } }); list.push(j.comment); if (post) post.comments++; draw(); const i = o.querySelector('#cmin'); if (i) i.value = ''; render(); } catch (x) { toast(x.message); }
  };
  o.addEventListener('click', async e => {
    const em = e.target.closest('[data-emo]'); if (em) return send(em.dataset.emo);
    if (e.target.closest('#cmgo')) return send(o.querySelector('#cmin').value);
    const d = e.target.closest('[data-cdelc]'); if (d) { try { await api('/comments/' + d.dataset.cdelc, { method: 'DELETE' }); list = list.filter(x => x.id !== d.dataset.cdelc); if (post) post.comments--; draw(); render(); } catch (x) { toast(x.message); } }
  });
}
function openMedia(i) {
  const o = sheet(`<img src="${esc(i.image)}" alt="" style="width:100%;max-height:52vh;object-fit:contain;border-radius:12px;background:#000;display:block">
    <div style="margin:10px 0 2px"><b>${esc(i.title)}</b> ${i.style ? `<span class="gold">${esc(i.style)}</span>` : ''}</div><div class="sm mute">${i.kind === 'cut' ? 'Cut by' : 'Posted by ' + esc(i.author || 'a member') + (i.barberName ? ' · cut by' : '')} ${esc(i.barberName || '')}</div>
    <div class="row" style="margin-top:12px"><button class="btn ghost sp" data-x>Close</button>${i.barberId ? `<button class="btn sec sp" data-gob>View barber</button><button class="btn sp" data-bookit>Book this cut</button>` : ''}</div>`);
  o.addEventListener('click', e => {
    if (e.target.closest('[data-gob]')) { o.remove(); nav('/barber/' + i.barberId); }
    if (e.target.closest('[data-bookit]')) { S.styleNote = `Style I want: ${i.style || 'same as the photo'}${i.title ? ' (' + i.title + ')' : ''}. Reference photo from the Community.`; o.remove(); startBooking(i.branchId, i.barberId); if (!S.token) nav('/auth'); }
  });
}
const REASONS = ['Spam', 'Harassment or hate', 'Nudity or sexual content', 'Violence', 'Other'];
function vMod() {
  const r = S.reports; if (!r) return skelList();
  return `<div class="sec-h"><h2>Reported content</h2><span class="mute sm">${r.length}</span></div><div class="list">${r.map(x => `<div class="card"><div class="row"><span class="tag ${x.hidden ? 'bad' : ''}">${x.kind}${x.hidden ? ' · hidden' : ''}</span><span class="tag">${x.n} report${x.n > 1 ? 's' : ''}</span></div>
    ${x.author ? `<div class="sm mute" style="margin-top:6px">by ${esc(x.author)}</div>` : ''}<p style="margin:6px 0;white-space:pre-wrap;word-break:break-word">${esc(x.text) || '<span class="mute">(no text)</span>'}</p>${x.image ? `<img src="${esc(x.image)}" alt="" style="width:100%;max-height:200px;object-fit:cover;border-radius:10px">` : ''}
    <div class="sm mute" style="margin:6px 0">${esc(x.reasons || '')}</div>${x.kind === 'user' ? '<div class="sm mute">Account reports are reviewed manually.</div>' : `<div class="row">${x.hidden ? `<button class="btn sec sm" data-mod="restore" data-mkind="${x.kind}" data-mid="${x.targetId}">Restore</button>` : ''}<button class="btn danger sm" data-mod="remove" data-mkind="${x.kind}" data-mid="${x.targetId}">Remove</button></div>`}</div>`).join('') || '<div class="card empty">Nothing to review.</div>'}</div>`;
}
async function loadReports() { try { S.reports = (await api('/pro/reports', {}, S.proToken)).reports; } catch (e) { S.reports = []; toast(e.message); } render(); }

// ----- photo cropper: drag to position and pinch or slide to zoom before a cover or profile photo is saved -----
function cropImage(file, aspect, outW, round) {
  return new Promise(async resolve => {
    let url; try { url = URL.createObjectURL(file); } catch { return resolve(null); }
    const img = new Image();
    try { await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = url; }); } catch { URL.revokeObjectURL(url); toast('This photo could not be opened. Try a JPG or PNG.'); return resolve(null); }
    const o = sheet(`<h3>${round ? 'Adjust your photo' : 'Adjust your cover'}</h3><div class="sm mute" style="text-align:center;margin:-4px 0 12px">Drag to move. Use the slider to zoom.</div>
      <div class="crop ${round ? 'round' : ''}" style="aspect-ratio:${aspect}"><img alt="" draggable="false"></div>
      <div class="row" style="gap:12px;margin:14px 2px 4px"><span class="sm mute">−</span><input type="range" id="czoom" min="1" max="3" step="0.01" value="1" style="padding:0;border:0;background:none;box-shadow:none"><span class="sm mute">+</span></div>
      <div class="row" style="margin-top:14px;gap:10px"><button class="btn ghost sp" data-cx>Cancel</button><button class="btn sp" id="csave">Save photo</button></div>`);
    const fr = o.querySelector('.crop'), im = fr.querySelector('img'); im.src = url; im.style.width = img.naturalWidth + 'px'; im.style.height = img.naturalHeight + 'px';
    let W = 0, H = 0, base = 1, z = 1, x = 0, y = 0;
    const clamp = () => { const s = base * z, w = img.naturalWidth * s, h = img.naturalHeight * s; x = Math.min(0, Math.max(W - w, x)); y = Math.min(0, Math.max(H - h, y)); };
    const draw = () => { clamp(); im.style.transform = `translate(${x}px,${y}px) scale(${base * z})`; };
    const setup = () => { W = fr.clientWidth; H = fr.clientHeight; base = Math.max(W / img.naturalWidth, H / img.naturalHeight); x = (W - img.naturalWidth * base) / 2; y = (H - img.naturalHeight * base) / 2; draw(); };
    setup(); requestAnimationFrame(() => { if (fr.clientWidth !== W) setup(); });
    const pts = new Map(); let last = null, pinch = 0;
    fr.addEventListener('pointerdown', e => { fr.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); last = { x: e.clientX, y: e.clientY }; if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); } });
    fr.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) { const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch) zoomTo(z * d / pinch); pinch = d; return; }
      x += e.clientX - last.x; y += e.clientY - last.y; last = { x: e.clientX, y: e.clientY }; draw();
    });
    const up = e => { pts.delete(e.pointerId); pinch = 0; const p = [...pts.values()][0]; if (p) last = { ...p }; };
    fr.addEventListener('pointerup', up); fr.addEventListener('pointercancel', up);
    const zoomTo = nz => { nz = Math.max(1, Math.min(3, nz)); const cx = W / 2, cy = H / 2, k = nz / z; x = cx - (cx - x) * k; y = cy - (cy - y) * k; z = nz; o.querySelector('#czoom').value = z; draw(); };
    o.querySelector('#czoom').addEventListener('input', e => zoomTo(+e.target.value));
    fr.addEventListener('wheel', e => { e.preventDefault(); zoomTo(z * (e.deltaY < 0 ? 1.06 : 0.94)); }, { passive: false });
    const done = v => { URL.revokeObjectURL(url); o.remove(); resolve(v); };
    o.addEventListener('click', e => { if (e.target === o || e.target.closest('[data-cx]')) done(null); });
    o.querySelector('#csave').onclick = () => {
      const s = base * z, outH = Math.round(outW / aspect), cv = document.createElement('canvas'); cv.width = outW; cv.height = outH;
      cv.getContext('2d').drawImage(img, -x / s, -y / s, W / s, H / s, 0, 0, outW, outH);
      for (const q of [0.86, 0.76, 0.64, 0.5]) { const d = cv.toDataURL('image/jpeg', q); if (d.length * 0.75 < 650_000) return done(d); }
      toast('Photo is too large'); done(null);
    };
  });
}
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
  else if (r.a === 'book') html = vBook(); else if (r.a === 'bookings') html = vBookings(); else if (r.a === 'auth') html = vAuth(); else if (r.a === 'me') html = vMe(); else if (r.a === 'pro') html = vPro(); else if (r.a === 'community') html = vCommunity(); else if (r.a === 'notifications') html = vNotifs(); else if (r.a === 'member') html = await vMember(r.b); else if (r.a === 'profile') html = S.user ? await vMember(S.user.id, true) : (S.token ? skelList() : (setTimeout(() => nav('/auth')), '')); else if (r.a === 'style') html = vStyle(); else if (r.a === 'shop') html = await vShop(r.b); else if (r.a === 'map') html = vMap(); else html = vHome();
  if (my !== rendering) return;
  const focus = document.activeElement?.id, pos = document.activeElement?.selectionStart, sy = window.scrollY;
  const showNav = !['barber', 'book', 'auth', 'pro', 'notifications', 'style', 'shop', 'member'].includes(r.a), tabs = [['home', 'Home', 'home'], ['discover', 'Discover', 'search'], ['community', 'Community', 'team'], ['bookings', 'Bookings', 'cal'], ['profile', 'Profile', 'user']];
  app.innerHTML = html + (showNav ? `<nav class="nav"><div>${tabs.map(([k, n, i]) => `<button class="${r.a === k || (k === 'profile' && r.a === 'me') ? 'on' : ''}" data-go="/${k === 'home' ? '' : k}">${ic(i)}${n}</button>`).join('')}</div></nav>` : '');
  if (focus === 'q' || focus === 'cq') { const el = document.getElementById(focus); if (el) el.focus(); try { el.setSelectionRange(pos, pos); } catch { } }
  motionAfter();
  if (r.a === 'map') mountMap();
  if (r.a === 'pro' && typeof afterPro === 'function') afterPro();
  if (r.a === 'discover') afterDiscover();
  if (r.a === 'barber' || r.a === 'book' || r.a === 'shop') window.scrollTo(0, r.a === 'book' ? sy : 0);
}
async function onRoute() {
  const r = route(); window.scrollTo(0, 0);
  if (r.a === 'barber') { S.cur = null; S.bTab = 'cuts'; S.bStyle = ''; }
  if (r.a === 'member') S.mem = null;
  if (r.a === 'discover') { if (!S.fresh) loadFresh().then(() => { if (route().a === 'discover') render(); }); if (discoverActive() && !S.R) loadResults().then(render); }
  if (['discover', 'home', 'book', 'barber', 'shop', 'map', 'community', 'me', 'member'].includes(r.a) && !S.D) { render(); await loadDiscover().catch(() => { }); }
  if (['bookings', 'home'].includes(r.a) && S.token && !S.mine) await loadBookings();
  if (['home', 'me', 'book', 'profile'].includes(r.a) && S.token && !S.loyal) api('/loyalty').then(j => { S.loyal = j; render(); }).catch(() => { });
  if (['me', 'book'].includes(r.a) && S.token && !S.push) loadPush();
  if (r.a === 'pro' && S.proToken && !S.pro) { await loadPro(); S.proSel = S.pro?.staff[0]?.id; if (S.pro?.admin) { S.proTab = 'shop'; loadShopOwner(); } else { S.proTab = 'today'; loadToday(true); } loadDash(); }
  if (r.a === 'bookings' && S.token) { loadBookings().then(render); api('/waitlist').then(j => { S.wait = j.items; render(); }).catch(() => { }); }
  if (r.a === 'community') loadCommunity();
  if (r.a === 'notifications' && S.token) { S.notifs = null; loadNotifs(); }
  if (r.a === 'book' && S.bk && !S.token) { nav('/auth'); return; }
  render();
}
addEventListener('hashchange', onRoute);

// ---------- events ----------
let qTimer;
app.addEventListener('input', e => {
  if (e.target.id === 'q') { S.q = e.target.value; clearTimeout(qTimer); qTimer = setTimeout(refreshResults, 250); }
  if (e.target.id === 'bnotes' && S.bk) S.bk.notes = e.target.value;
  if (e.target.id === 'bpromo' && S.bk) S.bk.promoCode = e.target.value;
  if (e.target.id === 'cq') { S.cq = e.target.value; clearTimeout(qTimer); qTimer = setTimeout(async () => { await loadFeed(); render(); }, 300); }
});
app.addEventListener('change', async e => {
  if (e.target.id === 'sort') { S.sort = e.target.value; await refreshResults(); }
  if (e.target.id === 'prosel') { S.proSel = e.target.value; S.proMsg = null; render(); loadDash(); }
  if (e.target.id === 'cfile') { const f = e.target.files[0]; e.target.value = ''; if (f) { try { S.comp.img = await compress(f); S.comp.err = ''; } catch (x) { S.comp.err = x.message; } render(); } }
  if (e.target.id === 'pcoverf' || e.target.id === 'pavatar') {
    const f = e.target.files[0], isCover = e.target.id === 'pcoverf'; e.target.value = ''; if (!f) return;
    const data = await cropImage(f, isCover ? 2.6 : 1, isCover ? 1400 : 800, !isCover); if (!data) return;
    try { await api(isCover ? '/pro/cover' : '/pro/photo', { method: 'POST', body: { staffId: S.proSel, data } }, S.proToken); toast(isCover ? 'Cover photo saved' : 'Profile photo saved'); S.D = null; S.cur = null; await loadPro(); render(); } catch (x) { toast(x.message); }
  }
  if (e.target.id === 'mcoverf' || e.target.id === 'mavatar') {
    const f = e.target.files[0], isCover = e.target.id === 'mcoverf'; e.target.value = ''; if (!f) return;
    const data = await cropImage(f, isCover ? 2.6 : 1, isCover ? 1400 : 800, !isCover); if (!data) return;
    try { await api(isCover ? '/me/cover' : '/me/photo', { method: 'POST', body: { data } }); toast(isCover ? 'Cover photo saved' : 'Profile photo saved'); S.mem = null; S.feed = null; await loadMe(); render(); } catch (x) { toast(x.message); }
  }
  if (e.target.dataset && e.target.dataset.opk) { const inp = document.querySelector(`[data-opp="${e.target.dataset.opk}"]`); inp.disabled = !e.target.checked; if (e.target.checked) inp.focus(); }
  if (e.target.dataset && e.target.dataset.rwfile) {
    const f = e.target.files[0], id = e.target.dataset.rwfile; e.target.value = ''; if (!f) return;
    try { await api('/pro/rewards/' + id, { method: 'PUT', body: { photo: await compress(f) } }, S.proToken); toast('Picture saved'); await loadRules(); render(); } catch (x) { toast(x.message); }
  }
  if ((e.target.id === 'pbook' || e.target.id === 'pcomm') && S.push) {
    S.push.prefs = { bookings: document.getElementById('pbook').checked, community: document.getElementById('pcomm').checked };
    try { await api('/push/prefs', { method: 'PUT', body: S.push.prefs }); toast('Saved'); } catch (x) { toast(x.message); }
  }
  if (e.target.id === 'brep' && S.bk) { S.bk.repEvery = +e.target.value; render(); }
  if (e.target.id === 'brepn' && S.bk) { S.bk.repCount = +e.target.value; }
  if (e.target.id === 'rnoshow' || e.target.id === 'rbuffer') {
    try { await api('/pro/rules', { method: 'PUT', body: e.target.id === 'rnoshow' ? { noshowMax: +e.target.value } : { bufferMins: +e.target.value } }, S.proToken); toast('Saved'); await loadRules(); render(); } catch (x) { toast(x.message); await loadRules(); render(); }
  }
  if (e.target.id === 'pstyle') S.pstyle = e.target.value;
  if (e.target.id === 'pfile') {
    const files = [...e.target.files]; let n = 0; e.target.value = '';
    for (const f of files.slice(0, 10)) { try { await api('/pro/portfolio', { method: 'POST', body: { staffId: S.proSel, data: await compress(f), style: S.pstyle || '' } }, S.proToken); n++; } catch (x) { toast(x.message); } }
    if (n) { toast(n + ' photo' + (n > 1 ? 's' : '') + ' added'); await loadPro(); render(); }
  }
});
app.addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target, d = Object.fromEntries(new FormData(f));
  if (f.id === 'authf') {
    S.auth.busy = true; S.auth.err = ''; render();
    try { const j = await api(S.auth.mode === 'signup' ? '/signup' : '/login', { method: 'POST', body: { ...d, email: String(d.email || '').trim(), agree: !!d.agree } }, null); S.push = null; S.token = j.token; store.set('bh_token', j.token); S.user = j.user; await loadMe(); S.mine = null; nav(S.bk ? '/book' : '/me'); }
    catch (x) { S.auth.err = x.message; }
    S.auth.busy = false; render();
  } else if (f.id === 'pwf') {
    if (d.password !== d.password2) { S.pwMsg = { ok: false, t: 'The new passwords do not match' }; return render(); }
    try { const j = await api('/me/password', { method: 'PUT', body: { current: d.current, password: d.password } }); if (j.token) { S.token = j.token; store.set('bh_token', j.token); } S.pwMsg = { ok: true, t: 'Password updated. Other devices are signed out.' }; f.reset(); } catch (x) { S.pwMsg = { ok: false, t: x.message }; } render();
  } else if (f.id === 'mef') {
    try { S.user = (await api('/me', { method: 'PUT', body: d })).user; S.meMsg = { ok: true, t: 'Saved' }; S.mem = null; toast('Profile saved'); } catch (x) { S.meMsg = { ok: false, t: x.message }; } render();
  } else if (f.id === 'prolf') {
    const org = String(d.org || '').trim().toLowerCase(); delete d.org; store.set('bh_org', org || null);
    try { const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(org ? { 'x-org': org } : {}) }, body: JSON.stringify(d) }), j = await r.json(); if (!r.ok) throw new Error(j.error);
      S.proToken = j.token; store.set('bh_pro', j.token); await loadPro(); S.proSel = S.pro?.staff[0]?.id; S.td = null; if (S.pro?.admin) { S.proTab = 'shop'; loadShopOwner(); } else { S.proTab = 'today'; loadToday(true); } loadDash(); } catch (x) { S.proErr = x.message; } render();
  } else if (f.id === 'certf') {
    S.certBusy = true; S.certErr = ''; render();
    try { const file = f.querySelector('[name=file]').files[0]; await api('/pro/certs', { method: 'POST', body: { staffId: S.proSel, title: d.title, org: d.org, date: d.date, data: file ? await compress(file) : undefined } }, S.proToken); await loadPro(); toast('Seminar added'); }
    catch (x) { S.certErr = x.message; } S.certBusy = false; render();
  } else if (f.id === 'prof') {
    try { await api('/pro/profile', { method: 'PUT', body: { staffId: S.proSel, ...d, verified: S.pro.admin ? !!d.verified : undefined } }, S.proToken); S.proMsg = { ok: true, t: 'Profile saved' }; await loadPro(); } catch (x) { S.proMsg = { ok: false, t: x.message }; } render();
  }
});
app.addEventListener('click', async e => {
  const t = e.target.closest('[data-qbook],[data-go],[data-shop],[data-avail],[data-branchf],[data-spec],[data-tab],[data-fav],[data-book],[data-bstaff],[data-bsvc],[data-bday],[data-btime],[data-confirm],[data-cancel],[data-resched],[data-review],[data-rebook],[data-authmode],[data-logout],[data-delete],[data-lb],[data-pdel],[data-prologout],[data-ptab],[data-drange],[data-propin],[data-nsallow],[data-ics],[data-mailto],[data-open],[data-insthelp],[data-pushon],[data-pushoff],[data-pushtest],[data-vcheck],[data-vclaim],[data-promoadd],[data-rewards],[data-rewardadd],[data-rewardtoggle],[data-rewarddel],[data-usevoucher],[data-promotoggle],[data-promodel],[data-promoapply],[data-blockadd],[data-blockdel],[data-idays],[data-ldays],[data-client],[data-copylink],[data-sharelink],[data-dpkg],[data-fpkg],[data-bookpkg],[data-rmpkg],[data-offsave],[data-mcovdel],[data-mphotodel],[data-mfollow],[data-covdel],[data-fsheet],[data-fsort],[data-frate],[data-fver],[data-floc],[data-fstyle],[data-dstyle],[data-dsee],[data-dreset],[data-svc],[data-fresh],[data-bookany],[data-cverify],[data-certdel],[data-btab],[data-bstyle],[data-cut],[data-pedit],[data-locate],[data-locurl],[data-locgps],[data-locsave],[data-ngo],[data-install],[data-noinstall],[data-wl],[data-wldel],[data-bookshop],[data-rreply],[data-snote],[data-sface],[data-shair],[data-scare],[data-sgo],[data-sagain],[data-ssave],[data-sbook],[data-ctab],[data-cstyle],[data-cscope],[data-compose],[data-psave],[data-ctile],[data-plike],[data-pcomm],[data-pfollow],[data-preport],[data-pblock],[data-mod]');
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
  if (D.avail != null) { S.avail = !S.avail; return refreshResults(); }
  if (D.branchf != null) { S.branch = D.branchf; return refreshResults(); }
  if (D.spec) { S.specialty = S.specialty === D.spec ? '' : D.spec; return refreshResults(); }
  if (D.tab) { S.tab = D.tab; return refreshResults(); }
  if (D.cverify) { try { await api('/pro/certs/' + D.cverify, { method: 'PUT', body: { verified: D.on !== '1' } }, S.proToken); await loadPro(); } catch (x) { toast(x.message); } return render(); }
  if (D.certdel) { if (!confirm('Remove this seminar?')) return; try { await api('/pro/certs/' + D.certdel, { method: 'DELETE' }, S.proToken); await loadPro(); } catch (x) { toast(x.message); } return render(); }
  if (D.btab) { S.bTab = D.btab; return render(); }
  if (D.bstyle != null) { S.bStyle = D.bstyle; return render(); }
  if (D.cut) { const p = S.cur?.portfolio.find(x => x.id === D.cut); if (p) openCut(p); return; }
  if (D.pedit) {
    const cap = prompt('Caption for this cut:', D.cap || ''); if (cap === null) return;
    const sty = prompt('Style tag (for example Skin Fade, Taper, Pompadour):', D.style || ''); if (sty === null) return;
    try { await api('/pro/portfolio/' + D.pedit, { method: 'PUT', body: { caption: cap, style: sty } }, S.proToken); await loadPro(); toast('Saved'); } catch (x) { toast(x.message); } return render();
  }
  if (D.fav) {
    if (!S.token) return nav('/auth'); const on = S.favs.includes(D.fav);
    try { await api('/favorites/' + D.fav, { method: on ? 'DELETE' : 'PUT' }); S.favs = on ? S.favs.filter(x => x !== D.fav) : [...S.favs, D.fav]; if (S.cur?.barber?.id === D.fav) S.cur.stats.followers += on ? -1 : 1; render(); } catch (x) { toast(x.message); } return;
  }
  if (D.book) { const b = S.cur?.barber; startBooking(b.branchId, b.id); if (!S.token) nav('/auth'); return; }
  if (D.bstaff) { S.bk.staffId = D.bstaff; return loadSlots(); }
  if (D.bsvc) { const k = S.bk; k.promo = null; k.promoErr = ''; k.items = k.items.includes(D.bsvc) ? k.items.filter(x => x !== D.bsvc) : [...k.items, D.bsvc]; return loadSlots(); }
  if (D.bday) { S.bk.date = D.bday; return loadSlots(); }
  if (D.btime) { S.bk.time = D.btime; return render(); }
  if (D.confirm != null) return confirmBooking();
  if (D.resched) { openReschedule(D.resched); return; }
  if (D.cancel) { if (!confirm('Cancel this booking?')) return; try { await api(`/bookings/${D.cancel}/cancel`, { method: 'POST' }); toast('Booking cancelled'); await loadBookings(); } catch (x) { toast(x.message); } return render(); }
  if (D.rebook) { const b = S.mine.find(x => x.id === D.rebook); startBooking(b.branchId, b.staffId); S.bk.items = b.itemIds.filter(id => svcFor(b.branchId).some(s => s.id === id)); if (!S.token) return nav('/auth'); return loadSlots(); }
  if (D.review) { openReview(D.review); return; }
  if (D.authmode) { S.auth.mode = D.authmode; S.auth.err = ''; return render(); }
  if (D.logout != null) { try { if (pushSupported()) { const reg = await swReady(1500), sub = await reg.pushManager.getSubscription(); if (sub) { try { await api('/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } }); } catch { } await sub.unsubscribe(); } } } catch { } S.push = null; S.token = null; S.user = null; S.favs = []; S.mine = null; store.set('bh_token', null); return nav('/'); }
  if (D.delete != null) {
    const pw = document.getElementById('delpw').value; if (!pw || !confirm('Delete your account permanently?')) return;
    try { await api('/me', { method: 'DELETE', body: { password: pw } }); S.token = null; S.user = null; store.set('bh_token', null); toast('Account deleted'); nav('/'); } catch (x) { toast(x.message); } return;
  }
  if (D.lb) { const o = document.createElement('div'); o.className = 'lb'; o.innerHTML = `<img src="${esc(D.lb)}" alt=""><button aria-label="Close">✕</button>`; o.onclick = () => o.remove(); document.body.appendChild(o); return; }
  if (D.ctab) { S.ctab = D.ctab; S.cstyle = ''; S.cq = ''; S.feed = null; render(); return loadCommunity(); }
  if (D.cscope) { S.feedScope = D.cscope; S.feed = null; render(); return loadCommunity(); }
  if (D.cstyle != null) { S.cstyle = D.cstyle; if ((S.ctab || 'feed') === 'cuts') S.cuts = null; else S.feed = null; render(); return loadCommunity(); }
  if (D.compose != null) return openComposer();
  if (D.ctile != null) { const i = S.cuts && S.cuts.items[+D.ctile]; if (i) openMedia(i); return; }
  if (D.psave) {
    if (!S.token) return nav('/auth'); const p = S.feed.posts.find(x => x.id === D.psave);
    try { const j = await api(`/posts/${p.id}/save`, { method: p.saved ? 'DELETE' : 'PUT' }); p.saved = j.saved; if (!j.saved && S.ctab === 'saved') S.feed.posts = S.feed.posts.filter(x => x.id !== p.id); toast(j.saved ? 'Saved' : 'Removed from saved'); render(); } catch (x) { toast(x.message); } return;
  }
  if (D.plike) {
    if (!S.token) return nav('/auth'); const p = S.feed.posts.find(x => x.id === D.plike);
    try { const j = await api(`/posts/${p.id}/like`, { method: p.liked ? 'DELETE' : 'PUT' }); p.liked = !p.liked; p.likes = j.likes; render(); } catch (x) { toast(x.message); } return;
  }
  if (D.pcomm) return openComments(D.pcomm);
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
  if (D.floc != null) return openShopPicker('filter');
  if (D.fsheet != null) return openFilters();
  if (D.fsort != null) return pickSheet('Sort by', SORTS, S.sort, async v => { if (v === 'nearest' && !S.geo && !(await nearMe())) return; S.sort = v; refreshResults(); });
  if (D.frate != null) { S.minRating = S.minRating ? 0 : 4; return refreshResults(); }
  if (D.fver != null) { S.verified = !S.verified; return refreshResults(); }
  if (D.fstyle != null) return pickSheet('Style', [['', 'Any style'], ...CUTS.map(c => [c.name, c.name])], S.style, v => { S.style = v; refreshResults(); });
  if (D.qbook) { startBooking(D.qbr, D.qbook); if (!S.token) nav('/auth'); return; }
  if (D.dstyle) { S.style = S.style === D.dstyle ? '' : D.dstyle; window.scrollTo(0, 0); return refreshResults(); }
  if (D.dsee) { if (D.dsee === 'shops') S.tab = 'shops'; else { S.sort = D.dsee; if (D.dsee === 'soonest') S.avail = true; } window.scrollTo(0, 0); return refreshResults(); }
  if (D.dreset != null) { resetDiscover(); return render(); }
  if (D.svc) { const v = S.D.services.find(x => x.id === D.svc); return v && openShopPicker('svc', v); }
  if (D.fresh != null) { const i = S.fresh && S.fresh[+D.fresh]; return i && openMedia(i); }
  if (D.bookany != null) return openShopPicker('book');
  if (D.covdel != null) { if (!confirm('Remove your cover photo? Your latest cut will be used instead.')) return; try { await api('/pro/cover?staffId=' + S.proSel, { method: 'DELETE' }, S.proToken); S.D = null; S.cur = null; await loadPro(); toast('Cover removed'); } catch (x) { toast(x.message); } return render(); }
  if (D.mcovdel != null || D.mphotodel != null) {
    const cover = D.mcovdel != null; if (!confirm(cover ? 'Remove your cover photo?' : 'Remove your profile photo?')) return;
    try { await api(cover ? '/me/cover' : '/me/photo', { method: 'DELETE' }); S.mem = null; S.feed = null; await loadMe(); toast('Removed'); } catch (x) { toast(x.message); } return render();
  }
  if (D.mfollow) {
    const on = D.on === '1'; try { await api('/follow/' + D.mfollow, { method: on ? 'DELETE' : 'PUT' }); S.mem.member.following = !on; S.mem.member.followers += on ? -1 : 1; render(); } catch (x) { toast(x.message); } return;
  }
  if (D.dpkg) { S.pkg = D.dpkg; window.scrollTo(0, 0); return refreshResults(); }
  if (D.fpkg != null) return pickSheet('Service', [['', 'Any service', ''], ...PKGS.map(([k, n, d]) => [k, n, d])], S.pkg, v => { S.pkg = v; refreshResults(); });
  if (D.bookpkg) { const b = S.cur?.barber; if (!b) return; const o = (b.offers || []).find(x => x.pkg === D.bookpkg); startBooking(b.branchId, b.id); if (o) S.bk.pkg = { key: o.pkg, name: PK[o.pkg].name, price: o.price }; if (!S.token) nav('/auth'); return; }
  if (D.rmpkg != null) { if (S.bk) S.bk.pkg = null; return render(); }
  if (D.offsave != null) {
    const rows = PKGS.map(([k]) => ({ k, on: document.querySelector(`[data-opk="${k}"]`).checked, v: document.querySelector(`[data-opp="${k}"]`).value })).filter(r => r.on);
    if (rows.some(r => !(+r.v >= 1))) return toast('Enter a price for each service you offer');
    try { await api('/pro/offers', { method: 'PUT', body: { staffId: S.proSel, offers: rows.map(r => ({ pkg: r.k, price: +r.v })) } }, S.proToken); toast('Services saved'); S.D = null; S.cur = null; await loadPro(); } catch (x) { toast(x.message); } return render();
  }
  if (D.idays) { S.insDays = +D.idays; S.health = null; render(); return loadInsights(); }
  if (D.ldays) { S.lapDays = +D.ldays; S.ret = null; render(); return loadInsights(); }
  if (D.client) return openClient(D.client);
  if (D.copylink) {
    try { await navigator.clipboard.writeText(D.copylink); } catch { const i = document.getElementById('blink'); if (i) { i.select(); document.execCommand('copy'); } }
    return toast('Link copied');
  }
  if (D.sharelink) { try { await navigator.share({ title: D.sname + ' · Book a cut', url: D.sharelink }); } catch { } return; }
  if (D.nsallow) { try { await api('/pro/noshow-allow', { method: 'POST', body: { customerId: D.nsallow, allow: D.allow === '1' } }, S.proToken); toast(D.allow === '1' ? 'Customer can book online again' : 'Customer restricted'); await loadRules(); } catch (x) { toast(x.message); } return render(); }
  if (D.mailto) { location.href = 'mailto:' + D.mailto + '?subject=' + encodeURIComponent('Brotherhood app help'); return; }
  if (D.open) { window.open(D.open, '_blank', 'noopener'); return; }
  if (D.insthelp != null) { sheet(`<h3>Install Brotherhood</h3><div class="list" style="margin-top:6px"><div class="card"><b>iPhone</b><div class="sm mute" style="margin-top:4px">Open this page in Safari, tap the Share button, then <b>Add to Home Screen</b>.</div></div><div class="card"><b>Android</b><div class="sm mute" style="margin-top:4px">Open it in Chrome, tap the menu, then <b>Install app</b> or <b>Add to Home screen</b>.</div></div></div><button class="btn block" style="margin-top:14px" data-x>Got it</button>`); return; }
  if (D.ics != null && S.bk && S.bk.done) {
    const b = S.bk.done, start = new Date(`${b.date}T${b.time}:00`), end = new Date(start.getTime() + 45 * 6e4), f = d => `${ymd(d).replace(/-/g, '')}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Brotherhood//Booking//EN', 'BEGIN:VEVENT', `UID:${b.id}@brotherhood`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`, `DTSTART:${f(start)}`, `DTEND:${f(end)}`, `SUMMARY:Haircut at ${b.branch}`, `DESCRIPTION:${(b.items || []).map(i => i.name).join(' + ')} with ${b.staff || 'your barber'}`, `LOCATION:${b.branch}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })); a.download = 'brotherhood-booking.ics'; document.body.appendChild(a); a.click(); a.remove(); return;
  }
  if (D.pushon != null) return enablePush();
  if (D.pushoff != null) return disablePush();
  if (D.pushtest != null) { try { const j = await api('/push/test', { method: 'POST' }); toast(j.sent ? 'Test sent. It should show up in a moment.' : j.gone ? 'This phone is no longer registered. Turn notifications off and on again.' : 'Could not reach this phone. Try again.'); } catch (x) { toast(x.message); } if (S.push) loadPush(); return; }
  if (D.vcheck != null) { S.vcode = (document.getElementById('vcode')?.value || '').trim(); S.vchk = null; S.verr = ''; if (!S.vcode) { S.verr = 'Enter the voucher code'; return render(); } try { S.vchk = await api('/pro/voucher?code=' + encodeURIComponent(S.vcode), {}, S.proToken); } catch (x) { S.verr = x.message; } return render(); }
  if (D.vclaim) { try { await api('/pro/voucher/claim', { method: 'POST', body: { code: D.vclaim } }, S.proToken); toast('Marked as claimed'); S.vchk = await api('/pro/voucher?code=' + encodeURIComponent(D.vclaim), {}, S.proToken); } catch (x) { toast(x.message); } return render(); }
  if (D.rewards != null) return openRewards();
  if (D.rewardadd != null) return openReward();
  if (D.usevoucher) { const i = document.getElementById('bpromo'); if (i) i.value = D.usevoucher; return applyPromo(); }
  if (D.rewardtoggle) { try { await api('/pro/rewards/' + D.rewardtoggle, { method: 'PUT', body: { active: D.on === '1' } }, S.proToken); toast(D.on === '1' ? 'Reward is on' : 'Reward paused'); await loadRules(); } catch (x) { toast(x.message); } return render(); }
  if (D.rewarddel) { if (!confirm('Delete this reward? This cannot be undone.')) return; try { await api('/pro/rewards/' + D.rewarddel, { method: 'DELETE' }, S.proToken); toast('Deleted'); await loadRules(); } catch (x) { toast(x.message); } return render(); }
  if (D.promoadd != null) return openPromo();
  if (D.promoapply != null) return applyPromo();
  if (D.promotoggle) { try { await api('/pro/promos/' + D.promotoggle, { method: 'PUT', body: { active: D.on === '1' } }, S.proToken); toast(D.on === '1' ? 'Promo is on' : 'Promo paused'); await loadRules(); } catch (x) { toast(x.message); } return render(); }
  if (D.promodel) { if (!confirm('Delete this promo code? This cannot be undone.')) return; try { await api('/pro/promos/' + D.promodel, { method: 'DELETE' }, S.proToken); toast('Deleted'); await loadRules(); } catch (x) { toast(x.message); } return render(); }
  if (D.blockadd != null) return openBlock();
  if (D.blockdel) { if (!confirm('Remove this blocked time?')) return; try { await api('/pro/blocks/' + D.blockdel, { method: 'DELETE' }, S.proToken); await loadBlocks(); toast('Removed'); } catch (x) { toast(x.message); } return render(); }
  if (D.propin != null) { S.proPin = !S.proPin; S.proErr = ''; return render(); }
  if (D.ptab) { S.proTab = D.ptab; if (D.ptab === 'today') { S.td = null; loadToday(); } if (D.ptab === 'tools') { S.tool = ''; S.tlData = null; if (!S.td) loadToday(true); } if (D.ptab === 'mod') loadReports(); if (D.ptab === 'shop') loadShopOwner(); if (D.ptab === 'ins') { S.health = null; S.ret = null; loadInsights(); } return render(); }
  if (D.drange) { S.dashRange = D.drange; render(); return loadDash(); }
  if (D.prologout != null) { S.proToken = null; S.pro = null; store.set('bh_pro', null); return render(); }
});
// ----- Today: the shop's day board (bookings, walk-ins, the line, in the chair, done). It takes over from the POS. -----
// Tracking only: no receipts, no invoice numbers, no shift readings. The shop issues its own BIR invoice and may note its number.
async function sapi(path, opt = {}) {
  const r = await fetch('/api' + path, { method: opt.method || 'GET', headers: { ...(opt.body ? { 'Content-Type': 'application/json' } : {}), Authorization: 'Bearer ' + S.proToken }, body: opt.body ? JSON.stringify(opt.body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error || 'Something went wrong'); e.code = r.status; throw e; }
  return j;
}
async function loadToday(quiet) {
  try { S.td = await sapi('/svc/today' + (S.tdBranch ? '?branch=' + encodeURIComponent(S.tdBranch) : '')); S.tdErr = '';
    S.tdAdj = ['owner', 'admin', 'manager'].includes(S.td.role) ? await sapi(`/adjustments?status=requested&branch=${encodeURIComponent(S.td.branch.id)}`).catch(() => []) : [];   // T29
    S.tdWarn = ['owner', 'admin', 'manager'].includes(S.td.role) ? await sapi(`/loyalty/warnings?branch=${encodeURIComponent(S.td.branch.id)}`).catch(() => []) : [];   // T37
    S.tdEarn = S.td.role === 'barber' ? await sapi('/earnings').catch(() => null) : ['owner', 'admin', 'manager'].includes(S.td.role) ? await sapi(`/earnings/branch?branch=${encodeURIComponent(S.td.branch.id)}`).catch(() => null) : null;   // T34
  }
  catch (e) { S.tdErr = e.message; if (!quiet) toast(e.message); }
  if ((S.proTab === 'today' || (S.proTab === 'tools' && !S.tool)) && !document.querySelector('.lb')) render();   // the Tools tab also waits for this data
}
setInterval(() => { if (S.proToken && S.proTab === 'today' && !document.hidden && document.querySelector('[data-today]') && !document.querySelector('.lb')) loadToday(true); }, 20000);
const NOT_RECEIPT = 'Tracking only. This is not an official receipt: issue your BIR invoice to the customer separately.';
const minsAgo = iso => { const m = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000)); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min'; };
const svcLine = x => x.items.map(i => esc(i.name) + (i.qty > 1 ? ' ×' + i.qty : '')).join(', ');
function tdCard(x, sub, acts) {
  return `<div class="card tk"><div class="row" style="gap:12px;align-items:flex-start"><span class="tkno">#${x.no}</span><div class="sp" style="min-width:0"><div class="nm">${esc(x.customerName)}</div><div class="sm mute">${svcLine(x)}</div>${sub ? `<div class="sm mute">${sub}</div>` : ''}</div><b class="num" style="font-size:19px;white-space:nowrap">${peso(x.total)}</b></div>${acts ? `<div class="row" style="gap:8px;margin-top:12px">${acts}</div>` : ''}</div>`;
}
function vToday() {
  const d = S.td; if (!d) return `<div data-today>${S.tdErr ? `<div class="card sm">${esc(S.tdErr)}</div>` : skelList()}</div>`;
  const me = d.role === 'barber', waiting = d.tickets.filter(x => x.status === 'waiting'), chair = d.tickets.filter(x => x.status === 'in_chair'), done = d.tickets.filter(x => x.status === 'done');
  const empty = t => `<div class="card sm mute">${t}</div>`;
  return `<div data-today>
  ${d.branches.length ? `<label class="f" style="margin-top:0">Shop<select id="tdbranch">${d.branches.map(b => `<option value="${b.id}" ${b.id === d.branch.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></label>` : ''}
  <div class="row" style="margin:14px 0 2px;gap:12px;align-items:flex-end"><div class="sp"><div class="sm mute">${esc(d.branch.name)} · ${fmtDate(d.date)}</div><div class="tdh">${me ? 'My day' : 'Today'}</div></div>${d.locked ? '' : `<button class="btn gold" data-twalk>${ic('plus')} Walk-in</button>`}</div>
  <div class="kpis" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px">${kpi('Waiting', d.totals.waiting, '', me ? 'Your customers waiting today, plus the line for any barber.' : 'Customers waiting in this branch today.')}${kpi('In the chair', d.totals.inChair, '', 'Customers being served right now.')}${kpi(me ? 'Done · mine' : 'Done', d.totals.done, me ? 'I earned ' + peso(d.myEarnings || 0) : peso(d.totals.earned), me ? 'Your finished visits today. I earned = your commission today (service value after discounts × your %, plus product commission); allowance and lunch are not included.' : 'Finished visits today and their value. Voided records are left out.')}</div>
  ${d.locked ? '<div class="card sm" style="margin-top:10px">Today is already closed for this shop.</div>' : ''}
  ${!me && d.closing?.needed ? `<div class="card" role="alert" style="margin-top:10px;border-color:var(--gold)"><b>It is past closing time (${t12(d.closing.closeTime)})</b><div class="sm mute" style="margin:4px 0 10px">${d.closing.waiting} still waiting. Mark them as left, or carry them over to tomorrow.</div><div class="row" style="gap:8px"><button class="btn sm sp" data-tclose="left">Mark all as left</button><button class="btn sec sm" data-tclose="carry">Carry over</button></div></div>` : ''}
  ${(S.tdAdj || []).length ? `<div class="sec-h"><h2>Corrections to approve</h2><span class="mute sm">${S.tdAdj.length}</span></div><div class="list">${S.tdAdj.map(a => `<div class="card tk"><div class="nm">${esc(a.kind === 'amount' ? `Amount ${peso(a.before.total)} → ${peso(a.after.total)}` : a.kind === 'method' ? `Payment ${a.before.method} → ${a.after.method}` : a.kind === 'barber' ? `Barber ${a.before.name || 'none'} → ${a.after.name}` : 'Void the record')}</div><div class="sm mute">${esc(a.reason)} · asked by ${esc(a.requestedBy)}</div>${a.canDecide ? `<div class="row" style="gap:8px;margin-top:10px"><button class="btn sm sp" data-tadjok="${a.id}">Approve</button><button class="btn sec sm" data-tadjno="${a.id}">Reject</button></div>` : '<div class="sm mute" style="margin-top:6px">Waiting for the owner</div>'}</div>`).join('')}</div>` : ''}
  ${d.bookings.length ? `<div class="sec-h"><h2>Booked today</h2><span class="mute sm">${d.bookings.length}</span></div><div class="list">${d.bookings.map(b => `<div class="card tk"><div class="row" style="gap:12px;align-items:flex-start"><span class="tkno">${t12(b.time)}</span><div class="sp" style="min-width:0"><div class="nm">${esc(b.customerName)}</div><div class="sm mute">${esc(b.items.join(', '))} · ${esc(b.staffName)}</div></div></div><div class="row" style="gap:8px;margin-top:12px"><button class="btn sm sp" data-tarrive="${b.id}">${ic('check')} Arrived</button><button class="btn sec sm" data-tnoshow="${b.id}">No-show</button>${b.phone ? `<a class="btn sec sm" href="tel:${esc(b.phone)}">Call</a>` : ''}</div></div>`).join('')}</div>` : ''}
  <div class="sec-h"><h2>In the chair</h2><span class="mute sm">${chair.length}</span></div><div class="list">${chair.map(x => tdCard(x, `${esc(x.barberName)} · started ${minsAgo(x.startedAt || x.createdAt)} ago`, `<button class="btn sm sp" data-tfin="${x.id}">${ic('check')} Done</button><button class="btn sec sm" data-tcan="${x.id}">Cancel</button>`)).join('') || empty('Nobody in the chair right now.')}</div>
  <div class="sec-h"><h2>Waiting</h2><span class="mute sm">${waiting.length}</span></div><div class="list">${waiting.map(x => tdCard(x, `${x.plan === 'checked_in' ? 'Booked · checked in · ' : ''}${x.barberName ? 'For ' + esc(x.barberName) : 'Any barber'} · waiting ${minsAgo(x.createdAt)}${x.estimate ? ` · starts about ${t12(x.estimate.start)}${x.barberName ? '' : ' with ' + esc(x.estimate.barber)} <span class="tag">estimate</span>` : ''}`, `<button class="btn sm sp" data-tstart="${x.id}">${me ? 'Start with me' : 'Start'}</button><button class="btn sec sm" data-tfin="${x.id}">Done</button>${me ? '' : `<button class="btn sec sm" data-tleft="${x.id}">Left</button>`}<button class="btn sec sm" data-tcan="${x.id}">Cancel</button>`)).join('') || empty('No one is waiting.')}</div>
  <div class="sec-h"><h2>Done today</h2><span class="mute sm">${done.length} · ${peso(d.totals.earned)}</span></div><div class="list">${done.slice().reverse().map(x => tdCard(x, `${esc(x.barberName)} · ${esc(x.method)}${x.discountName ? ' · ' + esc(x.discountName) : ''}${x.invoiceNo ? ' · BIR invoice ' + esc(x.invoiceNo) : ''}${x.payStatus === 'verified' ? ' <span class="tag ok">verified</span>' : ''}`, me ? '' : `${x.customerId ? `<button class="btn sec sm" data-tpts="${x.customerId}">Points</button>` : ''}<button class="btn sec sm" data-tadj="${x.id}">Correct</button>${x.payStatus !== 'verified' && d.role !== 'cashier' ? `<button class="btn sec sm" data-tverify="${x.id}">Verify payment</button>` : ''}`)).join('') || empty('No finished services yet today.')}</div>
  ${warnSection()}${earnSection(d)}
  <p class="sm mute" style="margin:16px 2px 0">${NOT_RECEIPT}</p></div>`;
}
// T37: visits voided after the customer had redeemed points (D-19: the reward is not taken back; the manager is told)
function warnSection() {
  const w = S.tdWarn || []; if (!w.length) return '';
  return `<div class="sec-h"><h2>Points warnings</h2><span class="mute sm">${w.length}</span></div><div class="list">${w.slice(0, 10).map(x => `<div class="card" style="padding:10px 12px"><div class="row"><b>${esc(x.customerName)}</b><span class="sp"></span><span class="sm ${x.balance < 0 ? '' : 'mute'}" style="${x.balance < 0 ? 'color:var(--bad, #e5484d)' : ''}">${x.balance} points</span></div><div class="sm mute">Visit #${esc(String(x.orderNo ?? ''))} (${esc(x.orderDate || '')}) was voided after a reward was given. The reward is not taken back; rewards stay blocked while the balance is below zero.</div></div>`).join('')}</div>`;
}
// T34: a barber's own commission entries (today, this week, history); managers and the owner see each barber's totals
function earnSection(d) {
  const e = S.tdEarn; if (!e) return '';
  const how = 'Your commission from finished visits: service value after discounts × your %, plus product commission. A correction or void adds a correcting line; nothing is erased. Allowance and lunch are not included.';
  if (e.entries) {
    const list = S.earnAll ? e.entries : e.entries.slice(0, 8);
    const line = x => `<div class="card" style="padding:10px 12px"><div class="row"><b class="sm">${x.visitNo ? '#' + x.visitNo + ' · ' : ''}${esc(x.date)}</b><span class="sp"></span><b class="num" style="color:${x.amount < 0 ? 'var(--bad, #e5484d)' : 'inherit'}">${x.amount < 0 ? '−' : ''}${peso(Math.abs(x.amount))}</b></div><div class="sm mute">${x.kind === 'earn' ? esc(x.pct + '% of ' + peso(x.base) + (x.productComm ? ' + ' + peso(x.productComm) + ' products' : '')) : 'Correction: ' + esc(x.reason)}</div></div>`;
    return `<div class="sec-h"><h2>My earnings</h2><span class="mute sm">commission</span></div>
  <div class="kpis" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">${kpi('Today', peso(e.today.total), '', how)}${kpi('This week', peso(e.period.total), 'from ' + esc(e.period.from.slice(5)), how)}${kpi('All', peso(e.all.total), '', how)}</div>
  <div class="list" style="margin-top:10px">${list.map(line).join('') || '<div class="card sm mute">No earnings recorded yet.</div>'}</div>
  ${e.entries.length > 8 ? `<button class="btn sec sm" data-earnall style="margin-top:8px">${S.earnAll ? 'Show fewer' : 'Show all ' + e.entries.length}</button>` : ''}`;
  }
  if (!e.barbers?.length) return '';
  return `<div class="sec-h"><h2>Barbers' commission</h2><span class="mute sm">today · this week</span></div><div class="list">${e.barbers.map(b => `<div class="card" style="padding:10px 12px"><div class="row"><b>${esc(b.name)}</b><span class="sp"></span><b class="num">${peso(b.today)}</b></div><div class="sm mute">This week ${peso(b.period)}</div></div>`).join('')}</div>`;
}
document.addEventListener('click', e => { if (e.target.closest('[data-earnall]')) { S.earnAll = !S.earnAll; render(); } });
// a photo from the phone, made small before it is sent
async function shrinkPhoto(file, max = 1100) {
  let bmp = null; if (file.size > 500000) { try { bmp = await createImageBitmap(file, { resizeWidth: max, resizeQuality: 'medium', imageOrientation: 'from-image' }); } catch (e) { bmp = null; } }
  if (!bmp) bmp = await createImageBitmap(file);
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas'); c.width = Math.max(1, Math.round(bmp.width * s)); c.height = Math.max(1, Math.round(bmp.height * s));
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); if (bmp.close) bmp.close(); return c.toDataURL('image/jpeg', 0.76);
}
const discAmt = (sub, dc) => !dc ? 0 : Math.min(sub, Math.max(0, dc.kind === 'percent' ? sub * dc.value / 100 : dc.value));
function idBlock(W) {
  return `<div class="card" style="margin-top:12px"><b>ID needed</b><div class="sm mute" style="margin-top:2px">This service is for Senior, PWD and Student customers. Take a clear photo of the ID.</div>
    <div class="chips" style="margin-top:10px">${['Senior', 'PWD', 'Student'].map(t => `<button class="chip ${W.idType === t ? 'on' : ''}" data-wid="${t}">${t}</button>`).join('')}</div>
    ${W.idPreview ? `<img src="${W.idPreview}" alt="ID photo" style="width:100%;max-height:180px;object-fit:contain;border-radius:12px;margin-top:10px;background:#000">` : ''}
    <label class="btn sec block" style="margin-top:10px;cursor:pointer">${W.idPhotoId ? 'Retake the ID photo' : 'Take a photo of the ID'}<input type="file" accept="image/*" capture="environment" data-wfile hidden></label></div>`;
}
async function uploadId(W, file, redraw) {
  if (!W.idType) return toast('Choose the ID type first');
  try { W.busy = true; redraw(); const data = await shrinkPhoto(file, 1100); const r = await sapi('/svc/idphoto', { method: 'POST', body: { data, idType: W.idType, branchId: S.td.branch.id } }); W.idPhotoId = r.id; W.idPreview = data; }
  catch (e) { toast(e.message || 'Could not read that photo. Please try again.'); }
  W.busy = false; redraw();
}
function openWalkin() {
  const d = S.td, me = d.role === 'barber', W = { name: '', phone: '', items: [], barberId: '', idType: '', idPhotoId: '', idPreview: '', busy: false, err: '' };
  const o = sheet('<div id="tw"></div>'), box = o.querySelector('#tw');
  const draw = () => {
    const pick = d.menu.filter(i => W.items.includes(i.id)), sub = pick.reduce((t, i) => t + i.price, 0), needId = pick.some(i => i.needId);
    const free = s => ['present', 'late'].includes(s.state) && !s.busy;
    box.innerHTML = `<div class="row"><h3 style="margin:0" class="sp">New walk-in</h3><button class="btn sec sm" data-x>Close</button></div>
      <label class="f">Customer name<input id="tw-name" value="${esc(W.name)}" autocomplete="off" placeholder="e.g. Juan Dela Cruz"></label>
      <label class="f">Mobile number (optional, for rewards)<input id="tw-phone" value="${esc(W.phone)}" inputmode="tel" placeholder="09XX XXX XXXX"></label>
      <div class="sm mute" style="margin:14px 0 6px">Services</div><div class="chips wrap">${d.menu.filter(i => i.type === 'service').map(i => `<button class="chip ${W.items.includes(i.id) ? 'on' : ''}" data-witem="${i.id}">${esc(i.name)} · ${peso(i.price)}</button>`).join('')}</div>
      ${d.menu.some(i => i.type === 'product') ? `<div class="sm mute" style="margin:12px 0 6px">Products</div><div class="chips wrap">${d.menu.filter(i => i.type === 'product').map(i => `<button class="chip ${W.items.includes(i.id) ? 'on' : ''}" data-witem="${i.id}">${esc(i.name)} · ${peso(i.price)}</button>`).join('')}</div>` : ''}
      ${needId ? idBlock(W) : ''}
      ${me ? '' : `<label class="f">Barber<select id="tw-barber"><option value="">Next free barber (wait in line)</option>${d.staff.map(s => `<option value="${s.id}" ${W.barberId === s.id ? 'selected' : ''} ${free(s) ? '' : 'disabled'}>${esc(s.name)}${free(s) ? '' : s.busy ? ' · cutting' : ' · not clocked in'}</option>`).join('')}</select></label>`}
      ${W.err ? `<div class="err" style="margin-top:10px">${esc(W.err)}</div>` : ''}
      <button class="btn block" style="margin-top:16px" data-wsave ${W.busy ? 'disabled' : ''}>${W.busy ? 'Please wait…' : (me || W.barberId ? 'Start now' : 'Add to the line') + (sub ? ' · ' + peso(sub) : '')}</button>`;
  };
  o.addEventListener('input', e => { if (e.target.id === 'tw-name') W.name = e.target.value; if (e.target.id === 'tw-phone') W.phone = e.target.value; });
  o.addEventListener('change', e => { if (e.target.id === 'tw-barber') { W.barberId = e.target.value; draw(); } if (e.target.matches('[data-wfile]') && e.target.files[0]) uploadId(W, e.target.files[0], draw); });
  o.addEventListener('click', async e => {
    const t = e.target.closest('[data-witem],[data-wid],[data-wsave]'); if (!t) return;
    if (t.dataset.witem) { const id = t.dataset.witem; W.items = W.items.includes(id) ? W.items.filter(x => x !== id) : [...W.items, id]; W.err = ''; return draw(); }
    if (t.dataset.wid) { W.idType = t.dataset.wid; return draw(); }
    if (t.hasAttribute('data-wsave')) {
      if (!W.name.trim()) { W.err = "Enter the customer's name"; return draw(); }
      if (!W.items.length) { W.err = 'Choose at least one service'; return draw(); }
      W.busy = true; W.err = ''; draw();
      try { await sapi('/svc/walkin', { method: 'POST', body: { branchId: d.branch.id, name: W.name, phone: W.phone, items: W.items.map(itemId => ({ itemId, qty: 1 })), barberId: W.barberId, idPhotoId: W.idPhotoId } }); o.remove(); toast('Walk-in added'); loadToday(); }
      catch (x) { W.busy = false; W.err = x.message; draw(); }
    }
  });
  draw(); setTimeout(() => o.querySelector('#tw-name')?.focus(), 50);
}
function openFinish(id) {
  const d = S.td, x = d.tickets.find(t => t.id === id); if (!x) return;
  const W = { items: x.items.map(i => i.itemId), discountId: x.discountId || '', method: '', invoiceNo: '', barberId: x.barberId, idType: '', idPhotoId: '', idPreview: '', busy: false, err: '' };
  const o = sheet('<div id="tf"></div>'), box = o.querySelector('#tf'), me = d.role === 'barber';
  const draw = () => {
    const pick = d.menu.filter(i => W.items.includes(i.id)), sub = pick.reduce((t, i) => t + i.price, 0), dc = d.discounts.find(z => z.id === W.discountId), less = discAmt(sub, dc), total = sub - less;
    const needId = pick.some(i => i.needId) && !x.hasId;
    box.innerHTML = `<div class="row"><h3 style="margin:0" class="sp">#${x.no} · ${esc(x.customerName)}</h3><button class="btn sec sm" data-x>Close</button></div>
      <div class="sm mute" style="margin:14px 0 6px">What was done</div><div class="chips wrap">${d.menu.map(i => `<button class="chip ${W.items.includes(i.id) ? 'on' : ''}" data-fitem="${i.id}">${esc(i.name)} · ${peso(i.price)}</button>`).join('')}</div>
      ${needId ? idBlock(W) : ''}
      ${!x.barberId && !me ? `<label class="f">Barber who did the cut<select id="tf-barber"><option value="">Choose the barber</option>${d.staff.map(s => `<option value="${s.id}" ${W.barberId === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>` : ''}
      ${d.discounts.length ? `<label class="f">Discount<select id="tf-disc"><option value="">No discount</option>${d.discounts.map(z => `<option value="${z.id}" ${W.discountId === z.id ? 'selected' : ''}>${esc(z.name)} (${z.kind === 'percent' ? z.value + '%' : peso(z.value)})</option>`).join('')}</select></label>` : ''}
      <div class="sm mute" style="margin:14px 0 6px">How did the customer pay?</div><div class="chips wrap">${d.methods.map(m => `<button class="chip ${W.method === m ? 'on' : ''}" data-fpay="${m}">${m}</button>`).join('')}</div>
      <label class="f">BIR invoice no. (optional)<input id="tf-inv" value="${esc(W.invoiceNo)}" placeholder="From your BIR invoice booklet or system" autocomplete="off"></label>
      <div class="card" style="margin-top:14px"><div class="row sm"><span class="sp mute">Services</span><span>${peso(sub)}</span></div>${less ? `<div class="row sm" style="margin-top:4px"><span class="sp mute">${esc(dc.name)}</span><span>−${peso(less)}</span></div>` : ''}<div class="row" style="margin-top:8px"><b class="sp">Total</b><b class="num" style="font-size:24px">${peso(total)}</b></div></div>
      <p class="sm mute" style="margin:10px 2px 0">${NOT_RECEIPT}</p>
      ${W.err ? `<div class="err" style="margin-top:10px">${esc(W.err)}</div>` : ''}
      <button class="btn block" style="margin-top:14px" data-fsave ${W.busy ? 'disabled' : ''}>${W.busy ? 'Please wait…' : `${ic('check')} Mark as done · ${peso(total)}`}</button>`;
  };
  o.addEventListener('input', e => { if (e.target.id === 'tf-inv') W.invoiceNo = e.target.value; });
  o.addEventListener('change', e => { if (e.target.id === 'tf-disc') { W.discountId = e.target.value; draw(); } if (e.target.id === 'tf-barber') W.barberId = e.target.value; if (e.target.matches('[data-wfile]') && e.target.files[0]) uploadId(W, e.target.files[0], draw); });
  o.addEventListener('click', async e => {
    const t = e.target.closest('[data-fitem],[data-fpay],[data-wid],[data-fsave]'); if (!t) return;
    if (t.dataset.fitem) { const id = t.dataset.fitem; W.items = W.items.includes(id) ? W.items.filter(z => z !== id) : [...W.items, id]; W.err = ''; return draw(); }
    if (t.dataset.fpay) { W.method = t.dataset.fpay; W.err = ''; return draw(); }
    if (t.dataset.wid) { W.idType = t.dataset.wid; return draw(); }
    if (t.hasAttribute('data-fsave')) {
      if (!W.items.length) { W.err = 'Choose what was done'; return draw(); }
      if (!W.method) { W.err = 'Choose how the customer paid'; return draw(); }
      W.busy = true; W.err = ''; draw();
      try { await sapi(`/svc/${x.id}/finish`, { method: 'POST', body: { items: W.items.map(itemId => ({ itemId, qty: 1 })), discountId: W.discountId, method: W.method, invoiceNo: W.invoiceNo, barberId: W.barberId, idPhotoId: W.idPhotoId } }); o.remove(); toast('Done. Nice cut!'); loadToday(); }
      catch (z) { W.busy = false; W.err = z.message; draw(); }
    }
  });
  draw();
}
function openStart(id) {
  const d = S.td, x = d.tickets.find(t => t.id === id); if (!x) return;
  const free = s => ['present', 'late'].includes(s.state) && !s.busy;
  const o = sheet(`<div class="row"><h3 style="margin:0" class="sp">Who takes #${x.no} ${esc(x.customerName)}?</h3><button class="btn sec sm" data-x>Close</button></div>
    <div class="list" style="margin-top:12px">${d.staff.map(s => `<button class="card row" style="width:100%;text-align:left;gap:12px" data-tsb="${s.id}" ${free(s) ? '' : 'disabled'}>${s.photo ? `<img src="${esc(s.photo)}" alt="" class="av" style="width:44px;height:44px;object-fit:cover">` : `<span class="av" style="width:44px;height:44px;font-size:14px">${esc(initials(s.name))}</span>`}<span class="sp"><span class="nm">${esc(s.name)}</span><span class="sm mute" style="display:block">${free(s) ? 'Free now' : s.busy ? 'Cutting' : s.state === 'break' ? 'On break' : 'Not clocked in'}</span></span>${free(s) ? `<span class="tag ok">Free</span>` : ''}</button>`).join('')}</div>`);
  o.addEventListener('click', async e => { const b = e.target.closest('[data-tsb]'); if (!b || b.disabled) return; try { await sapi(`/svc/${x.id}/start`, { method: 'POST', body: { barberId: b.dataset.tsb } }); o.remove(); loadToday(); } catch (z) { toast(z.message); } });
}
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-twalk],[data-tfin],[data-tstart],[data-tcan],[data-tarrive],[data-tleft],[data-tnoshow],[data-tclose],[data-tadj],[data-tverify],[data-tadjok],[data-tadjno]'); if (!t || !S.td) return;
  if (t.dataset.tadj) return openCorrection(t.dataset.tadj);
  if (t.dataset.tverify) { try { await sapi(`/records/${t.dataset.tverify}/verify`, { method: 'POST', body: {} }); toast('Payment verified'); loadToday(); } catch (z) { toast(z.message); } return; }
  if (t.dataset.tadjok || t.dataset.tadjno) { const no = !!t.dataset.tadjno, note = no ? prompt('Why is this correction rejected?') : ''; if (no && !note) return; try { await sapi(`/adjustments/${t.dataset.tadjok || t.dataset.tadjno}/approve`, { method: 'POST', body: { approve: !no, note } }); toast(no ? 'Rejected' : 'Approved'); loadToday(); } catch (z) { toast(z.message); } return; }
  if (t.dataset.tleft) { const why = prompt('The customer left without a cut. Note (optional):', 'Could not wait'); if (why === null) return; try { await sapi(`/svc/${t.dataset.tleft}/left`, { method: 'POST', body: { reason: why } }); toast('Marked as left'); loadToday(); } catch (z) { toast(z.message); } return; }
  if (t.dataset.tnoshow) { if (!confirm('Mark this booking as a no-show?')) return; try { await sapi(`/bookings/${t.dataset.tnoshow}`, { method: 'PUT', body: { status: 'noshow' } }); toast('Marked as no-show'); loadToday(); } catch (z) { toast(z.message); } return; }
  if (t.dataset.tclose) { if (!confirm(t.dataset.tclose === 'left' ? 'Mark everyone still waiting as left?' : 'Carry everyone still waiting over to tomorrow?')) return; try { const r = await sapi('/svc/close-queue', { method: 'POST', body: { branchId: S.td.branch.id, action: t.dataset.tclose } }); toast(r.left != null ? `${r.left} marked as left` : `${r.carried} carried over`); loadToday(); } catch (z) { toast(z.message); } return; }
  if (t.hasAttribute('data-twalk')) return openWalkin();
  if (t.dataset.tfin) return openFinish(t.dataset.tfin);
  if (t.dataset.tstart) { if (S.td.role === 'barber') { try { await sapi(`/svc/${t.dataset.tstart}/start`, { method: 'POST', body: {} }); loadToday(); } catch (z) { toast(z.message); } return; } return openStart(t.dataset.tstart); }
  if (t.dataset.tcan) { const why = prompt('Why is this visit cancelled? (for example: customer left)'); if (why === null) return; try { await sapi(`/svc/${t.dataset.tcan}/cancel`, { method: 'POST', body: { reason: why } }); toast('Cancelled'); loadToday(); } catch (z) { toast(z.message); } return; }
  if (t.dataset.tarrive) { try { await sapi(`/bookings/${t.dataset.tarrive}/arrive`, { method: 'POST', body: {} }); toast('Checked in'); loadToday(); } catch (z) { toast(z.message); } }
});
// T29: ask for a correction of a finished visit (never edited directly). The owner's own corrections take effect at once.
function openCorrection(id) {
  const d = S.td, x = d.tickets.find(t => t.id === id); if (!x) return;
  const o = sheet(`<h3>Correct #${x.no} ${esc(x.customerName)}</h3><p class="sm mute" style="margin-top:0">${peso(x.total)} · ${esc(x.method)} · ${esc(x.barberName)}. The record is not changed until the correction is approved.</p>
    <label class="f">What is wrong<select id="cwhat"><option value="amount">The amount</option><option value="method">How it was paid</option><option value="barber">The barber</option><option value="void">It should not count (void)</option></select></label>
    <div id="cafter"></div><label class="f">Reason<input id="creason" maxlength="300" placeholder="e.g. wrong price entered"></label><div id="cerr"></div>
    <div class="row" style="gap:8px;margin-top:12px"><button class="btn" id="csend">Send for approval</button><button class="btn sec" data-x>Close</button></div>`);
  const field = () => { const k = o.querySelector('#cwhat').value; o.querySelector('#cafter').innerHTML = k === 'amount' ? `<label class="f">Correct amount (₱)<input id="cval" type="number" min="0" inputmode="decimal" value="${x.total}"></label>` : k === 'method' ? `<label class="f">Paid by<select id="cval">${(d.methods || []).map(m => `<option ${m === x.method ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select></label>` : k === 'barber' ? `<label class="f">Barber who did it<select id="cval">${d.staff.map(s => `<option value="${s.id}" ${s.id === x.barberId ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>` : ''; };
  field(); o.addEventListener('change', e => { if (e.target.id === 'cwhat') field(); });
  o.addEventListener('click', async e => {
    if (e.target.id !== 'csend') return;
    const kind = o.querySelector('#cwhat').value, after = o.querySelector('#cval')?.value, reason = o.querySelector('#creason').value.trim();
    try { const r = await sapi(`/records/${x.id}/adjust`, { method: 'POST', body: { kind, after: kind === 'amount' ? +after : after, reason } }); o.remove(); toast(r.adjustment.status === 'approved' ? 'Corrected' : 'Sent for approval'); loadToday(); }
    catch (z) { o.querySelector('#cerr').innerHTML = `<div class="err">${esc(z.message)}</div>`; }
  });
}
document.addEventListener('change', e => { if (e.target.id === 'tdbranch') { S.tdBranch = e.target.value; S.td = null; render(); loadToday(); } });

// ----- Tools: the rest of what the POS did, now in the app (time clock, expenses, end-of-day cash, release pay, checklist, problems, leave, inbox) -----
Object.assign(ICON, { clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', wallet: '<path d="M3 7a2 2 0 0 1 2-2h13v4"/><path d="M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2z"/><circle cx="16" cy="14.5" r="1.2"/>', cash: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v5M18 9.5v5"/>' });
const TOOLS = [
  ['clock', 'Time clock', 'Time in and out with a selfie, breaks', 'clock', null],
  ['exp', 'Expenses', 'Shop spending with receipt photos', 'wallet', 'expenses'],
  ['cash', 'End-of-day cash', 'Count and turn over the day\'s cash', 'cash', 'remittance'],
  ['rel', 'Release pay', 'Cash advances and salary releases', 'heart', 'release'],
  ['chk', 'Daily checklist', 'Opening and closing tasks', 'check', 'checklist'],
  ['prob', 'Report a problem', 'Broken equipment, complaints and more', 'info', 'problems'],
  ['leave', 'Leave requests', 'Vacation, sick and emergency leave', 'cal', 'leave'],
  ['inbox', 'Inbox', 'Chat with the owner and the team', 'chat', 'inbox']
];
const EXP_CATS = ['Supplies', 'Utilities', 'Repairs & Maintenance', 'Food & Meals', 'Transportation', 'Marketing', 'Equipment', 'Staff Welfare', 'Other'], EXP_PAY = ['Cash', 'GCash', 'Maya', 'Bank Transfer', 'Card', 'Other'];
const ADV_TYPES = ['Cash Advance', 'Salary Advance', 'Partial Salary Release', 'Emergency Assistance', 'Other Authorized Deduction'];
const PROB_CATS = ['Equipment malfunction', 'Air conditioning', 'Electrical', 'Internet', 'Maintenance', 'Customer complaint', 'Employee concern', 'Inventory shortage', 'Other'], PRIOS = ['Low', 'Normal', 'High', 'Urgent'];
const toolOk = m => { const d = S.td; if (!d) return false; return !m || d.role === 'owner' || d.role === 'admin' || (d.modules || []).includes(m); };
const stTag = s => { const k = String(s || '').toUpperCase(); const c = ['APPROVED', 'VERIFIED', 'RELEASED', 'RESOLVED', 'CLOSED'].includes(k) ? 'ok' : ['REJECTED', 'FLAGGED', 'CANCELLED'].includes(k) ? 'bad' : ''; return `<span class="tag ${c}">${esc(k.charAt(0) + k.slice(1).toLowerCase())}</span>`; };
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2));
async function upPhoto(file, kind, max = 1100) { const data = await shrinkPhoto(file, max); const r = await sapi('/files', { method: 'POST', body: { data, kind, branchId: S.td.branch.id } }); return { id: r.id, preview: data }; }
async function loadTool() {
  const k = S.tool, d = S.td; if (!k || !d) return;
  const br = d.branches.length ? 'branch=' + encodeURIComponent(d.branch.id) : '';
  try {
    if (k === 'exp') S.tlData = await sapi('/expense-claims?range=' + (S.expRange || 'today') + (br ? '&' + br : ''));
    if (k === 'cash') { const [pv, hist] = await Promise.all([sapi('/remittances/preview?date=' + d.date + (br ? '&' + br : '')), sapi('/remittances?from=' + ymd(new Date(Date.now() - 30 * 864e5)) + (br ? '&' + br : ''))]); S.tlData = { pv, hist }; }
    if (k === 'rel') S.tlData = await sapi('/advances' + (br ? '?' + br : ''));
    if (k === 'chk') S.tlData = await sapi('/checklists/today' + (br ? '?' + br : ''));
    if (k === 'prob') S.tlData = await sapi('/problems' + (br ? '?' + br : ''));
    if (k === 'leave') S.tlData = await sapi('/leaves' + (br ? '?' + br : ''));
    if (k === 'inbox') S.tlData = await sapi('/state');
    S.tlErr = '';
  } catch (e) { S.tlErr = e.message; }
  render();
}
function vTools() {
  const d = S.td; if (!d) return `<div>${S.tdErr ? `<div class="card sm">${esc(S.tdErr)}</div>` : skelList()}</div>`;
  if (!S.tool) return (S.pro?.admin ? vDeviceCard() : '') + `<div class="tgrid">${TOOLS.filter(t => toolOk(t[4])).map(([k, n, s, i]) => `<button class="card tcard" data-tool="${k}">${ic(i)}<b>${esc(n)}</b><span class="sm mute">${esc(s)}</span></button>`).join('')}</div>`;
  const t = TOOLS.find(x => x[0] === S.tool);
  const head = `<div class="row" style="margin:4px 0 12px;gap:10px"><button class="btn sec sm" data-tool="">${ic('back')} All tools</button><b class="sp" style="font-size:18px">${esc(t[1])}</b></div>`;
  if (S.tool === 'clock') return head + vClock();
  if (S.tlErr) return head + `<div class="card sm">${esc(S.tlErr)}</div>`;
  if (!S.tlData) return head + skelList();
  return head + ({ exp: vExp, cash: vCash, rel: vRel, chk: vChk, prob: vProb, leave: vLeave, inbox: () => '<div id="app-inbox"></div>' })[S.tool]();
}
function afterPro() { if (S.proTab === 'tools' && S.tool === 'inbox' && window.Inbox && S.tlData?.me) { const h = document.getElementById('app-inbox'); if (h) Inbox.mount(h, { token: () => S.proToken, isAdmin: ['owner', 'admin'].includes(S.tlData.me.role), meId: S.tlData.me.id }); } }
// --- time clock ---
function vClock() {
  const d = S.td, me = d.role === 'barber', list = me ? d.staff.filter(s => s.id === d.myStaffId) : d.staff;
  const label = s => ({ none: 'Not in yet', present: 'In', late: 'In (late)', break: 'On break', out: 'Out for the day', off: 'Day off' })[s.state] || s.state;
  return `<div class="list">${list.map(s => {
    const acts = ['none', 'out'].includes(s.state) ? `<button class="btn sm sp" data-clk="in" data-sid="${s.id}">Time in</button>` : ['present', 'late'].includes(s.state) ? `<button class="btn sec sm sp" data-clk="break_start" data-sid="${s.id}">Break</button><button class="btn sm sp" data-clk="out" data-sid="${s.id}">Time out</button>` : s.state === 'break' ? `<button class="btn sm sp" data-clk="break_end" data-sid="${s.id}">Back from break</button>` : '';
    return `<div class="card"><div class="row" style="gap:12px">${s.photo ? `<img src="${esc(s.photo)}" alt="" class="av" style="width:46px;height:46px;object-fit:cover">` : `<span class="av" style="width:46px;height:46px;font-size:15px">${esc(initials(s.name))}</span>`}<div class="sp"><div class="nm">${esc(s.name)}</div><div class="sm mute">${esc(label(s))}${s.timeIn ? ' · since ' + new Date(s.timeIn).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }) : ''}${s.lateMins ? ' · ' + s.lateMins + ' min late' : ''}</div></div></div>${acts ? `<div class="row" style="gap:8px;margin-top:12px">${acts}</div>` : ''}</div>`;
  }).join('') || '<div class="card sm mute">No barbers to show.</div>'}</div>
  ${me && !d.myStaffId ? '<div class="card sm">Your login is not linked to your barber profile yet. Ask the owner.</div>' : ''}
  <p class="sm mute" style="margin:12px 2px 0">${d.attPhoto ? 'A selfie is needed to time in and out. ' : ''}The time is taken from this phone when you tap.</p>`;
}
function openClock(staffId, action) {
  const d = S.td, s = d.staff.find(x => x.id === staffId), word = { in: 'Time in', out: 'Time out', break_start: 'Start break', break_end: 'Back from break' }[action];
  const needPic = d.attPhoto && ['in', 'out'].includes(action), W = { data: '', busy: false, err: '' }, at = new Date().toISOString();
  const o = sheet('<div id="clk"></div>'), box = o.querySelector('#clk');
  const draw = () => { box.innerHTML = `<div class="row"><h3 style="margin:0" class="sp">${word} · ${esc(s.name)}</h3><button class="btn sec sm" data-x>Cancel</button></div>
    ${needPic ? `${W.data ? `<img src="${W.data}" alt="Selfie" style="width:100%;max-height:300px;object-fit:cover;border-radius:16px;margin-top:12px">` : '<div class="card sm mute" style="margin-top:12px">Take a quick selfie to confirm it is really you.</div>'}
    <label class="btn sec block" style="margin-top:10px;cursor:pointer">${W.data ? 'Retake selfie' : 'Take selfie'}<input type="file" accept="image/*" capture="user" data-clkfile hidden></label>` : ''}
    ${W.err ? `<div class="err" style="margin-top:10px">${esc(W.err)}</div>` : ''}
    <button class="btn block" style="margin-top:14px" data-clkgo ${W.busy || (needPic && !W.data) ? 'disabled' : ''}>${W.busy ? 'Please wait…' : word + ' now'}</button>`; };
  o.addEventListener('change', async e => { if (e.target.matches('[data-clkfile]') && e.target.files[0]) { try { W.data = await shrinkPhoto(e.target.files[0], 720); } catch (x) { W.err = 'Could not read that photo. Please try again.'; } draw(); } });
  o.addEventListener('click', async e => {
    if (!e.target.closest('[data-clkgo]')) return; W.busy = true; W.err = ''; draw();
    try {
      let photoId = ''; if (needPic) photoId = (await sapi('/files', { method: 'POST', body: { data: W.data, kind: 'attendance', branchId: d.branch.id } })).id;
      const r = await sapi('/attendance', { method: 'POST', body: { staffId, action, photoId, clientId: uuid(), deviceAt: at } }); o.remove(); toast(word + (r.flagged ? ' (flagged for the owner to check)' : '')); loadToday();
    } catch (x) { W.busy = false; W.err = x.message; draw(); }
  });
  draw();
}
// --- expenses ---
function vExp() {
  const x = S.tlData, rng = S.expRange || 'today';
  return `<div class="row" style="gap:10px"><div class="chips sp" style="padding:0">${[['today', 'Today'], ['month', 'This month']].map(([k, n]) => `<button class="chip ${rng === k ? 'on' : ''}" data-exr="${k}">${n}</button>`).join('')}</div><button class="btn sm" data-expnew>${ic('plus')} Add</button></div>
  <div class="card" style="margin-top:12px"><div class="sm mute">Total ${rng === 'today' ? 'today' : 'this month'}</div><div class="num" style="font-size:26px">${peso(x.total)}</div>${x.noReceipt ? `<div class="sm" style="color:var(--bad)">${x.noReceipt} without receipt</div>` : ''}</div>
  <div class="list" style="margin-top:12px">${x.rows.map(e => `<div class="card"><div class="row" style="gap:10px"><div class="sp"><div class="nm">${esc(e.description)}</div><div class="sm mute">${esc(e.category)} · ${esc(e.method)} · ${esc(fmtDate(e.date))} · ${esc(e.submittedBy)}</div></div><b class="num" style="font-size:18px">${peso(e.amount)}</b></div><div class="row" style="gap:6px;margin-top:8px">${stTag(e.status)}${e.noReceipt ? '<span class="tag bad">No receipt</span>' : `<span class="tag">${(e.receipts || []).length} receipt photo${(e.receipts || []).length === 1 ? '' : 's'}</span>`}</div></div>`).join('') || '<div class="card sm mute">No expenses yet.</div>'}</div>`;
}
function openExpense() {
  const W = { category: '', desc: '', amount: '', method: 'Cash', receipts: [], reason: '', busy: false, err: '' }, o = sheet('<div id="ex"></div>'), box = o.querySelector('#ex');
  const draw = () => { box.innerHTML = `<div class="row"><h3 style="margin:0" class="sp">Add an expense</h3><button class="btn sec sm" data-x>Cancel</button></div>
    <label class="f">Category<select id="ex-cat"><option value="">Choose</option>${EXP_CATS.map(c => `<option ${W.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
    <label class="f">What was it for?<input id="ex-desc" value="${esc(W.desc)}" placeholder="e.g. Alcohol and cotton"></label>
    <label class="f">Amount (₱)<input id="ex-amt" type="number" inputmode="decimal" min="0" value="${esc(W.amount)}"></label>
    <div class="sm mute" style="margin:12px 0 6px">Paid with</div><div class="chips wrap">${EXP_PAY.map(m => `<button class="chip ${W.method === m ? 'on' : ''}" data-exm="${m}">${m}</button>`).join('')}</div>
    <div class="sm mute" style="margin:12px 0 6px">Receipt photos</div>${W.receipts.length ? `<div class="row wrap" style="gap:8px">${W.receipts.map((r, i) => `<div style="position:relative"><img src="${r.preview}" alt="" style="width:72px;height:72px;object-fit:cover;border-radius:12px"><button class="btn sec sm" style="position:absolute;right:-6px;top:-6px;padding:2px 7px" data-exrm="${i}">✕</button></div>`).join('')}</div>` : ''}
    <label class="btn sec block" style="margin-top:8px;cursor:pointer">${ic('plus')} Add receipt photo<input type="file" accept="image/*" capture="environment" data-exfile hidden></label>
    ${W.receipts.length ? '' : `<label class="f">No receipt? Tell the owner why<input id="ex-why" value="${esc(W.reason)}" placeholder="Required when there is no receipt"></label>`}
    ${W.err ? `<div class="err" style="margin-top:10px">${esc(W.err)}</div>` : ''}<button class="btn block" style="margin-top:14px" data-exsave ${W.busy ? 'disabled' : ''}>${W.busy ? 'Please wait…' : 'Save expense'}</button>`; };
  o.addEventListener('input', e => { const m = { 'ex-desc': 'desc', 'ex-amt': 'amount', 'ex-why': 'reason' }[e.target.id]; if (m) W[m] = e.target.value; });
  o.addEventListener('change', async e => { if (e.target.id === 'ex-cat') W.category = e.target.value; if (e.target.matches('[data-exfile]') && e.target.files[0]) { W.busy = true; draw(); try { W.receipts.push(await upPhoto(e.target.files[0], 'receipt')); } catch (x) { W.err = x.message; } W.busy = false; draw(); } });
  o.addEventListener('click', async e => {
    const t = e.target.closest('[data-exm],[data-exrm],[data-exsave]'); if (!t) return;
    if (t.dataset.exm) { W.method = t.dataset.exm; return draw(); }
    if (t.dataset.exrm) { W.receipts.splice(+t.dataset.exrm, 1); return draw(); }
    W.busy = true; W.err = ''; draw();
    try { await sapi('/expense-claims', { method: 'POST', body: { branchId: S.td.branch.id, category: W.category, description: W.desc, amount: W.amount, method: W.method, receipts: W.receipts.map(r => r.id), noReceiptReason: W.reason } }); o.remove(); toast('Expense saved'); loadTool(); }
    catch (x) { W.busy = false; W.err = x.message; draw(); }
  });
  draw();
}
// --- end-of-day cash (cash turnover to the owner; not a BIR reading) ---
function vCash() {
  const { pv, hist } = S.tlData, sent = (pv.existing || []).length;
  const row = (l, v, b) => `<div class="row sm" style="padding:6px 0;border-top:1px solid var(--line)"><span class="sp ${b ? '' : 'mute'}">${l}</span>${b ? `<b>${v}</b>` : `<span>${v}</span>`}</div>`;
  return `<div class="card"><div class="sm mute">${esc(fmtDate(pv.date))} · ${pv.orders} finished service${pv.orders === 1 ? '' : 's'}</div>
    ${row('Cash collected', peso(pv.cashSales))}${row('GCash', peso(pv.gcashSales))}${row('Maya', peso(pv.mayaSales))}${row('Other ways', peso(pv.otherSales))}${row('Cash expenses paid from the drawer', '−' + peso(pv.cashExpenses))}${pv.cashIn ? row('Cash added', peso(pv.cashIn)) : ''}${row('Cash you should turn over', peso(pv.expected), true)}</div>
  ${sent ? `<div class="card sm" style="margin-top:10px">Today's cash was already turned over. ${stTag(pv.existing[0].status)}</div>` : `<button class="btn block" style="margin-top:12px" data-cashnew>Turn over today's cash</button>`}
  <p class="sm mute" style="margin:10px 2px 0">This is the shop's own cash count for the owner. It is not a BIR sales reading.</p>
  <div class="sec-h"><h2>Last 30 days</h2></div><div class="list">${hist.rows.map(r => `<div class="card"><div class="row"><div class="sp"><div class="nm">${esc(fmtDate(r.date))}</div><div class="sm mute">${esc(r.responsible)} · expected ${peso(r.expected)}</div></div><b class="num" style="font-size:18px">${peso(r.actual)}</b></div><div class="row" style="gap:6px;margin-top:8px">${stTag(r.status)}${Math.abs(r.variance) >= 1 ? `<span class="tag ${r.variance < 0 ? 'bad' : ''}">${r.variance < 0 ? 'Short' : 'Over'} ${peso(Math.abs(r.variance))}</span>` : ''}</div></div>`).join('') || '<div class="card sm mute">Nothing turned over yet.</div>'}</div>`;
}
function openCash() {
  const pv = S.tlData.pv, W = { actual: '', resp: S.pro?.name || '', notes: '', proof: null, busy: false, err: '' }, o = sheet('<div id="ca"></div>'), box = o.querySelector('#ca');
  const draw = () => { const v = W.actual === '' ? null : +W.actual - pv.expected; box.innerHTML = `<div class="row"><h3 style="margin:0" class="sp">Turn over today's cash</h3><button class="btn sec sm" data-x>Cancel</button></div>
    <div class="card" style="margin-top:12px"><div class="sm mute">Cash you should turn over</div><div class="num" style="font-size:26px">${peso(pv.expected)}</div></div>
    <label class="f">Cash actually turned over (₱)<input id="ca-amt" type="number" inputmode="decimal" min="0" value="${esc(W.actual)}"></label>
    ${v !== null && Math.abs(v) >= 1 ? `<div class="sm" style="margin-top:6px;color:var(--bad)">${v < 0 ? 'Short' : 'Over'} by ${peso(Math.abs(v))}. The owner will be told.</div>` : ''}
    <label class="f">Person responsible<input id="ca-resp" value="${esc(W.resp)}"></label><label class="f">Notes (optional)<input id="ca-notes" value="${esc(W.notes)}"></label>
    ${W.proof ? `<img src="${W.proof.preview}" alt="" style="width:100%;max-height:200px;object-fit:contain;border-radius:12px;margin-top:12px;background:#000">` : ''}
    <label class="btn sec block" style="margin-top:10px;cursor:pointer">${W.proof ? 'Retake the photo' : 'Photo of the deposit slip or turnover proof'}<input type="file" accept="image/*" capture="environment" data-cafile hidden></label>
    ${W.err ? `<div class="err" style="margin-top:10px">${esc(W.err)}</div>` : ''}<button class="btn block" style="margin-top:14px" data-casave ${W.busy ? 'disabled' : ''}>${W.busy ? 'Please wait…' : 'Submit'}</button>`; };
  o.addEventListener('input', e => { const m = { 'ca-amt': 'actual', 'ca-resp': 'resp', 'ca-notes': 'notes' }[e.target.id]; if (m) { W[m] = e.target.value; if (m === 'actual') { draw(); const el = document.getElementById('ca-amt'); el.focus(); el.setSelectionRange(el.value.length, el.value.length); } } });
  o.addEventListener('change', async e => { if (e.target.matches('[data-cafile]') && e.target.files[0]) { W.busy = true; draw(); try { W.proof = await upPhoto(e.target.files[0], 'remit', 1300); } catch (x) { W.err = x.message; } W.busy = false; draw(); } });
  o.addEventListener('click', async e => {
    if (!e.target.closest('[data-casave]')) return; W.busy = true; W.err = ''; draw();
    try { await sapi('/remittances', { method: 'POST', body: { branchId: S.td.branch.id, date: pv.date, actual: W.actual === '' ? NaN : +W.actual, responsible: W.resp, notes: W.notes, proofId: W.proof?.id } }); o.remove(); toast('Cash turnover submitted'); loadTool(); }
    catch (x) { W.busy = false; W.err = x.message; draw(); }
  });
  draw();
}
// --- release pay ---
function vRel() {
  const x = S.tlData;
  return `<button class="btn block" data-relnew>${ic('plus')} New request</button>
  <div class="list" style="margin-top:12px">${x.rows.map(r => `<div class="card"><div class="row" style="gap:10px"><div class="sp"><div class="nm">${esc(r.staffName)} · ${esc(r.type)}</div><div class="sm mute">${esc(r.reason)}</div><div class="sm mute">${r.installments} installment${r.installments === 1 ? '' : 's'} · requested by ${esc(r.requestedBy)}</div></div><b class="num" style="font-size:18px">${peso(r.amount)}</b></div><div class="row" style="gap:6px;margin-top:8px">${stTag(r.status)}${r.balance ? `<span class="tag">Balance ${peso(r.balance)}</span>` : ''}</div></div>`).join('') || '<div class="card sm mute">No requests yet.</div>'}</div>`;
}
function openRel() {
  const d = S.td, W = { staffId: d.role === 'barber' ? d.myStaffId : '', type: 'Cash Advance', amount: '', inst: 1, reason: '', consent: false, busy: false, err: '' }, o = sheet('<div id="rl"></div>'), box = o.querySelector('#rl');
  const draw = () => { box.innerHTML = `<div class="row"><h3 style="margin:0" class="sp">Release pay request</h3><button class="btn sec sm" data-x>Cancel</button></div>
    ${d.role === 'barber' ? '' : `<label class="f">Employee<select id="rl-staff"><option value="">Choose</option>${d.staff.map(s => `<option value="${s.id}" ${W.staffId === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>`}
    <label class="f">Type<select id="rl-type">${ADV_TYPES.map(t => `<option ${W.type === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
    <label class="f">Amount (₱)<input id="rl-amt" type="number" inputmode="decimal" min="0" value="${esc(W.amount)}"></label>
    <label class="f">Pay back in<select id="rl-inst">${[1, 2, 3, 4, 6, 8, 10, 12].map(n => `<option value="${n}" ${+W.inst === n ? 'selected' : ''}>${n} payroll${n === 1 ? '' : 's'}</option>`).join('')}</select></label>
    <label class="f">Reason<input id="rl-why" value="${esc(W.reason)}"></label>
    <label class="f row" style="gap:10px;align-items:flex-start"><input type="checkbox" id="rl-ok" style="width:auto;margin-top:3px" ${W.consent ? 'checked' : ''}><span style="margin:0">The employee agrees that this amount will be deducted from their pay.</span></label>
    ${W.err ? `<div class="err" style="margin-top:10px">${esc(W.err)}</div>` : ''}<button class="btn block" style="margin-top:14px" data-relsave ${W.busy ? 'disabled' : ''}>${W.busy ? 'Please wait…' : 'Send request to the owner'}</button>`; };
  o.addEventListener('input', e => { const m = { 'rl-amt': 'amount', 'rl-why': 'reason' }[e.target.id]; if (m) W[m] = e.target.value; });
  o.addEventListener('change', e => { const m = { 'rl-staff': 'staffId', 'rl-type': 'type', 'rl-inst': 'inst' }[e.target.id]; if (m) W[m] = e.target.value; if (e.target.id === 'rl-ok') W.consent = e.target.checked; });
  o.addEventListener('click', async e => {
    if (!e.target.closest('[data-relsave]')) return; W.busy = true; W.err = ''; draw();
    try { await sapi('/advances', { method: 'POST', body: { branchId: d.branch.id, staffId: W.staffId, type: W.type, amount: W.amount, installments: +W.inst, reason: W.reason, consent: W.consent } }); o.remove(); toast('Request sent'); loadTool(); }
    catch (x) { W.busy = false; W.err = x.message; draw(); }
  });
  draw();
}
// --- daily checklist ---
function vChk() {
  const x = S.tlData, kind = S.chkKind || 'opening', run = (x.runs || []).find(r => r.kind === kind), tpl = x.template[kind] || [];
  const C = S.chkDraft && S.chkDraft.kind === kind ? S.chkDraft : (S.chkDraft = { kind, items: tpl.map(() => ({ done: false, note: '', photoId: '', preview: '', doneAt: '' })), busy: false, err: '' });
  const tabs = `<div class="chips" style="padding:0">${[['opening', 'Opening'], ['closing', 'Closing']].map(([k, n]) => `<button class="chip ${kind === k ? 'on' : ''}" data-chkk="${k}">${n}${(x.runs || []).some(r => r.kind === k) ? ' ✓' : ''}</button>`).join('')}</div>`;
  if (run) return tabs + `<div class="card" style="margin-top:12px"><b>Submitted</b><div class="sm mute">by ${esc(run.submittedBy || '')}</div></div><div class="list" style="margin-top:10px">${(run.items || []).map(i => `<div class="card sm"><b>${i.done ? '✓' : '✗'}</b> ${esc(i.text)}${i.note ? `<div class="mute">${esc(i.note)}</div>` : ''}</div>`).join('')}</div>`;
  return tabs + `<div class="list" style="margin-top:12px">${tpl.map((t, i) => { const it = C.items[i]; return `<div class="card"><label class="row" style="gap:12px;align-items:flex-start;margin:0"><input type="checkbox" data-chki="${i}" ${it.done ? 'checked' : ''} style="width:22px;height:22px;margin-top:2px"><span class="sp">${esc(t.text)}${t.photo ? ' <span class="tag">Photo</span>' : ''}</span></label>
    ${t.photo ? `${it.preview ? `<img src="${it.preview}" alt="" style="width:100%;max-height:160px;object-fit:cover;border-radius:12px;margin-top:10px">` : ''}<label class="btn sec sm block" style="margin-top:8px;cursor:pointer">${it.preview ? 'Retake photo' : 'Take photo'}<input type="file" accept="image/*" capture="environment" data-chkf="${i}" hidden></label>` : ''}
    ${it.done ? '' : `<input data-chkn="${i}" value="${esc(it.note)}" placeholder="Not done? Write why" style="margin-top:10px">`}</div>`; }).join('')}</div>
    ${C.err ? `<div class="err" style="margin-top:10px">${esc(C.err)}</div>` : ''}<button class="btn block" style="margin-top:14px" data-chksave ${C.busy ? 'disabled' : ''}>${C.busy ? 'Please wait…' : 'Submit ' + kind + ' checklist'}</button>`;
}
// --- problems ---
function vProb() {
  const x = S.tlData;
  return `<button class="btn block" data-probnew>${ic('plus')} Report a problem</button>
  <div class="list" style="margin-top:12px">${x.rows.map(r => `<div class="card"><div class="row" style="gap:8px"><b class="sp">${esc(r.category)}</b>${stTag(r.status)}<span class="tag ${['High', 'Urgent'].includes(r.priority) ? 'bad' : ''}">${esc(r.priority)}</span></div><p style="margin:6px 0 0">${esc(r.description)}</p><div class="sm mute" style="margin-top:6px">${esc(r.submittedBy)} · ${new Date(r.createdAt).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div></div>`).join('') || '<div class="card sm mute">No problems reported.</div>'}</div>`;
}
function openProb() {
  const W = { category: '', priority: 'Normal', desc: '', photos: [], busy: false, err: '' }, o = sheet('<div id="pb"></div>'), box = o.querySelector('#pb');
  const draw = () => { box.innerHTML = `<div class="row"><h3 style="margin:0" class="sp">Report a problem</h3><button class="btn sec sm" data-x>Cancel</button></div>
    <label class="f">What kind of problem?<select id="pb-cat"><option value="">Choose</option>${PROB_CATS.map(c => `<option ${W.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
    <div class="sm mute" style="margin:12px 0 6px">How urgent?</div><div class="chips wrap">${PRIOS.map(p => `<button class="chip ${W.priority === p ? 'on' : ''}" data-pbp="${p}">${p}</button>`).join('')}</div>
    <label class="f">What happened?<textarea id="pb-desc" rows="3">${esc(W.desc)}</textarea></label>
    ${W.photos.length ? `<div class="row wrap" style="gap:8px;margin-top:10px">${W.photos.map(r => `<img src="${r.preview}" alt="" style="width:72px;height:72px;object-fit:cover;border-radius:12px">`).join('')}</div>` : ''}
    <label class="btn sec block" style="margin-top:10px;cursor:pointer">${ic('plus')} Add photo<input type="file" accept="image/*" capture="environment" data-pbfile hidden></label>
    ${W.err ? `<div class="err" style="margin-top:10px">${esc(W.err)}</div>` : ''}<button class="btn block" style="margin-top:14px" data-pbsave ${W.busy ? 'disabled' : ''}>${W.busy ? 'Please wait…' : 'Send to the owner'}</button>`; };
  o.addEventListener('input', e => { if (e.target.id === 'pb-desc') W.desc = e.target.value; });
  o.addEventListener('change', async e => { if (e.target.id === 'pb-cat') W.category = e.target.value; if (e.target.matches('[data-pbfile]') && e.target.files[0]) { W.busy = true; draw(); try { W.photos.push(await upPhoto(e.target.files[0], 'problem', 1300)); } catch (x) { W.err = x.message; } W.busy = false; draw(); } });
  o.addEventListener('click', async e => {
    const t = e.target.closest('[data-pbp],[data-pbsave]'); if (!t) return; if (t.dataset.pbp) { W.priority = t.dataset.pbp; return draw(); }
    W.busy = true; W.err = ''; draw();
    try { await sapi('/problems', { method: 'POST', body: { branchId: S.td.branch.id, category: W.category, priority: W.priority, description: W.desc, photos: W.photos.map(p => p.id) } }); o.remove(); toast('Sent to the owner'); loadTool(); }
    catch (x) { W.busy = false; W.err = x.message; draw(); }
  });
  draw();
}
// --- leave ---
function vLeave() {
  const x = S.tlData;
  return `<button class="btn block" data-lvnew>${ic('plus')} Request leave</button>
  <div class="list" style="margin-top:12px">${x.rows.map(r => `<div class="card"><div class="row" style="gap:8px"><b class="sp">${esc(r.staffName)} · ${esc(r.type)}</b>${stTag(r.status)}</div><div class="sm mute" style="margin-top:4px">${esc(fmtDate(r.from_date))}${r.to_date !== r.from_date ? ' to ' + esc(fmtDate(r.to_date)) : ''} · ${esc(r.reason)}</div>${r.reviewNote ? `<div class="sm" style="margin-top:4px">Owner: ${esc(r.reviewNote)}</div>` : ''}</div>`).join('') || '<div class="card sm mute">No leave requests yet.</div>'}</div>`;
}
function openLeave() {
  const d = S.td, x = S.tlData, W = { staffId: d.role === 'barber' ? d.myStaffId : '', type: (x.types || ['Vacation'])[0], from: d.date, to: d.date, reason: '', busy: false, err: '' }, o = sheet('<div id="lv"></div>'), box = o.querySelector('#lv');
  const draw = () => { box.innerHTML = `<div class="row"><h3 style="margin:0" class="sp">Request leave</h3><button class="btn sec sm" data-x>Cancel</button></div>
    ${d.role === 'barber' ? '' : `<label class="f">Employee<select id="lv-staff"><option value="">Choose</option>${d.staff.map(s => `<option value="${s.id}" ${W.staffId === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>`}
    <label class="f">Type<select id="lv-type">${(x.types || []).map(t => `<option ${W.type === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
    <div class="row" style="gap:10px"><label class="f sp">From<input id="lv-from" type="date" value="${W.from}"></label><label class="f sp">To<input id="lv-to" type="date" value="${W.to}"></label></div>
    <label class="f">Reason<input id="lv-why" value="${esc(W.reason)}"></label>
    ${W.err ? `<div class="err" style="margin-top:10px">${esc(W.err)}</div>` : ''}<button class="btn block" style="margin-top:14px" data-lvsave ${W.busy ? 'disabled' : ''}>${W.busy ? 'Please wait…' : 'Send request'}</button>`; };
  o.addEventListener('input', e => { if (e.target.id === 'lv-why') W.reason = e.target.value; });
  o.addEventListener('change', e => { const m = { 'lv-staff': 'staffId', 'lv-type': 'type', 'lv-from': 'from', 'lv-to': 'to' }[e.target.id]; if (m) W[m] = e.target.value; });
  o.addEventListener('click', async e => {
    if (!e.target.closest('[data-lvsave]')) return; W.busy = true; W.err = ''; draw();
    try { await sapi('/leaves', { method: 'POST', body: { branchId: d.branch.id, staffId: W.staffId, type: W.type, from: W.from, to: W.to, reason: W.reason } }); o.remove(); toast('Leave request sent'); loadTool(); }
    catch (x) { W.busy = false; W.err = x.message; draw(); }
  });
  draw();
}
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-tool],[data-clk],[data-exr],[data-expnew],[data-cashnew],[data-relnew],[data-chkk],[data-chksave],[data-probnew],[data-lvnew]'); if (!t || !S.td) return;
  if (t.dataset.tool !== undefined) { S.tool = t.dataset.tool; S.tlData = null; S.tlErr = ''; S.chkDraft = null; render(); if (S.tool && S.tool !== 'clock') loadTool(); if (S.tool === 'clock') loadToday(true); return; }
  if (t.dataset.clk) return openClock(t.dataset.sid, t.dataset.clk);
  if (t.dataset.exr) { S.expRange = t.dataset.exr; S.tlData = null; render(); return loadTool(); }
  if (t.hasAttribute('data-expnew')) return openExpense();
  if (t.hasAttribute('data-cashnew')) return openCash();
  if (t.hasAttribute('data-relnew')) return openRel();
  if (t.hasAttribute('data-probnew')) return openProb();
  if (t.hasAttribute('data-lvnew')) return openLeave();
  if (t.dataset.chkk) { S.chkKind = t.dataset.chkk; return render(); }
  if (t.hasAttribute('data-chksave')) {
    const C = S.chkDraft; C.busy = true; C.err = ''; render();
    try { await sapi('/checklists/submit', { method: 'POST', body: { branchId: S.td.branch.id, kind: C.kind, items: C.items.map(i => ({ done: i.done, note: i.note, photoId: i.photoId, doneAt: i.doneAt })) } }); S.chkDraft = null; toast('Checklist submitted'); loadTool(); }
    catch (x) { C.busy = false; C.err = x.message; render(); }
  }
});
document.addEventListener('change', async e => {
  const t = e.target, C = S.chkDraft; if (!C) return;
  if (t.dataset.chki !== undefined) { const it = C.items[+t.dataset.chki]; it.done = t.checked; it.doneAt = t.checked ? new Date().toISOString() : ''; render(); }
  if (t.dataset.chkf !== undefined && t.files[0]) { const it = C.items[+t.dataset.chkf]; try { C.busy = true; render(); const r = await upPhoto(t.files[0], 'checklist', 1000); it.photoId = r.id; it.preview = r.preview; } catch (x) { C.err = x.message; } C.busy = false; render(); }
});
document.addEventListener('input', e => { const t = e.target; if (t.dataset.chkn !== undefined && S.chkDraft) S.chkDraft.items[+t.dataset.chkn].note = t.value; });

// T18: move a booking to another free time (same barber; before the booking's cancel cutoff)
function openReschedule(id) {
  const b = (S.mine || []).find(x => x.id === id); if (!b) return;
  const pad = n => String(n).padStart(2, '0'), ymdOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(Date.now() + i * 864e5); return { v: ymdOf(d), l: d.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' }) }; });
  let date = b.date, time = '';
  const o = sheet(`<h3>Change time</h3><p class="sm mute" style="margin-top:0">Now: ${esc(b.date)} at ${esc(b.time)} with ${esc(b.staffName || 'any barber')}</p>
    <label class="f">Day<select id="rsday">${days.map(d => `<option value="${d.v}" ${d.v === date ? 'selected' : ''}>${esc(d.l)}</option>`).join('')}</select></label>
    <div id="rstimes" class="row" style="flex-wrap:wrap;gap:6px;margin-top:8px"><span class="mute sm">Loading times…</span></div><div id="rserr"></div>
    <div class="row" style="margin-top:14px;gap:8px"><button class="btn" id="rssave" disabled>Move my booking</button><button class="btn sec" data-x>Keep it</button></div>`);
  const load = async () => {
    const box = o.querySelector('#rstimes'); time = ''; o.querySelector('#rssave').disabled = true; box.innerHTML = '<span class="mute sm">Loading times…</span>';
    try {
      const j = await (await fetch(`/api/public/slots?branch=${encodeURIComponent(b.branchId)}&date=${date}&staff=${encodeURIComponent(b.staffId || 'any')}&items=${(b.itemIds || []).map(encodeURIComponent).join(',')}`)).json();
      box.innerHTML = (j.slots || []).map(t => `<button type="button" class="chip" data-rst="${t}">${t}</button>`).join('') || '<span class="mute sm">No free times that day. Try another day.</span>';
    } catch { box.innerHTML = '<span class="mute sm">Could not load the times. Check your connection.</span>'; }
  };
  o.addEventListener('change', e => { if (e.target.id === 'rsday') { date = e.target.value; load(); } });
  o.addEventListener('click', async e => {
    const c = e.target.closest('[data-rst]');
    if (c) { time = c.dataset.rst; o.querySelectorAll('[data-rst]').forEach(x => x.classList.toggle('on', x === c)); o.querySelector('#rssave').disabled = false; return; }
    if (e.target.id === 'rssave' && time) {
      e.target.disabled = true;
      try { const r = await api(`/bookings/${b.id}/reschedule`, { method: 'POST', body: { date, time } }); o.remove(); toast(`Moved to ${r.booking.date} at ${r.booking.time}`); await loadBookings(); render(); }
      catch (x) { o.querySelector('#rserr').innerHTML = `<div class="err">${esc(x.message)}</div>`; e.target.disabled = false; load(); }
    }
  });
  load();
}
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
  api('/config').then(j => { S.shop = j.shop; S.contact = j.contact || ''; if (S.shop && !/^brotherhood$/i.test(S.shop)) document.title = S.shop + ' · Book your cut'; render(); }).catch(() => { });
  if (S.token) await loadMe();
  if (S.token) loadBookings().then(render);
  onRoute();
})();

// ---------- staff PIN login on a phone set up for a branch (decision D-21) ----------
// The owner or an admin sets up the phone once (Tools → This phone). After that, staff pick their name and type their PIN;
// wrong PINs pause only that person. A phone can be switched off from the back office if it is lost.
const devHeaders = () => ({ 'x-device': store.get('bh_device') || '', ...(store.get('bh_device_org') ? { 'x-org': store.get('bh_device_org') } : {}) });
async function loadDevicePeople() {
  S.dev = { loading: true }; render();
  try {
    const r = await fetch('/api/device/people', { headers: devHeaders() }), j = await r.json().catch(() => ({}));
    if (r.status === 401) { store.set('bh_device', null); store.set('bh_device_org', null); store.set('bh_device_branch', null); S.dev = null; S.proErr = 'This phone is no longer set up for PIN login. Ask the owner to set it up again.'; return render(); }
    if (!r.ok) throw new Error(j.error || 'Could not load the names');
    S.dev = { people: j.people, branch: j.branch.name };
  } catch (x) { S.dev = { err: x.message }; }
  render();
}
function vDeviceLogin() {
  if (!S.dev) { loadDevicePeople(); return skelList(); }
  if (S.dev.loading) return skelList();
  const other = '<p class="mute sm" style="text-align:center;margin-top:18px"><button type="button" class="link" data-devskip>Owner or admin? Sign in with username and password</button></p>';
  if (S.dev.err) return `<div class="card sm">${esc(S.dev.err)}</div><button class="btn block" style="margin-top:12px" data-devreload>Try again</button>` + other;
  const who = S.dev.people.find(x => x.id === S.devPick);
  if (who) return `<p class="mute" style="margin-top:0">${esc(S.dev.branch)}</p><form id="devpinf"><div class="card" style="display:flex;align-items:center;gap:12px"><span class="av" aria-hidden="true">${esc(initials(who.name))}</span><div class="sp"><b>${esc(who.name)}</b><div class="sm mute">${who.role === 'barber' ? 'Barber' : 'Front desk'}</div></div><button type="button" class="btn sec sm" data-devpick="">Not you?</button></div>
    <label class="f">Your 6-digit PIN<input name="pin" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="off" required autofocus></label>${S.proErr ? `<div class="err" role="alert">${esc(S.proErr)}</div>` : ''}<button class="btn block" style="margin-top:14px" ${S.devBusy ? 'disabled' : ''}>Sign in</button></form>` + other;
  return `<p class="mute" style="margin-top:0">${esc(S.dev.branch)} · tap your name</p>${S.proErr ? `<div class="err" role="alert">${esc(S.proErr)}</div>` : ''}<div class="tgrid">${S.dev.people.map(x => `<button class="card tcard" data-devpick="${esc(x.id)}"><span class="av" aria-hidden="true">${esc(initials(x.name))}</span><b>${esc(x.name)}</b><span class="sm mute">${x.role === 'barber' ? 'Barber' : 'Front desk'}</span></button>`).join('') || '<div class="empty">Nobody with a PIN in this branch yet.</div>'}</div>` + other;
}
function vDeviceCard() {
  const set = store.get('bh_device'), branches = S.td?.branches?.length ? S.td.branches : (S.td?.branch ? [S.td.branch] : []);
  if (set) return `<div class="card" style="margin-bottom:12px"><b>This phone</b><p class="sm mute" style="margin:4px 0 10px">Set up for staff PIN login at <b>${esc(store.get('bh_device_branch') || 'a branch')}</b>. Staff pick their name, then type their PIN.</p><button class="btn sec sm" data-devunset>Stop using this phone for PIN login</button></div>`;
  return `<div class="card" style="margin-bottom:12px"><b>This phone</b><p class="sm mute" style="margin:4px 0 10px">Use this phone or tablet at a branch so staff sign in by picking their name and typing their PIN.</p>
    <div class="row" style="gap:8px"><select id="devbranch" aria-label="Branch for this phone" style="flex:1">${branches.map(b => `<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('')}</select><button class="btn sm" data-devset ${branches.length ? '' : 'disabled'}>Set up</button></div></div>`;
}
app.addEventListener('click', async e => {
  const el = e.target.closest('[data-devpick],[data-devskip],[data-devreload],[data-devset],[data-devunset]'); if (!el) return;
  const D = el.dataset; S.proErr = '';
  if ('devpick' in D) { S.devPick = D.devpick || null; return render(); }
  if ('devskip' in D) { S.devSkip = true; return render(); }
  if ('devreload' in D) { S.dev = null; return render(); }
  if ('devset' in D) {
    const bid = document.getElementById('devbranch')?.value; if (!bid) return;
    try { const j = await sapi('/device/setup', { method: 'POST', body: { branchId: bid } }); store.set('bh_device', j.deviceToken); store.set('bh_device_org', store.get('bh_org') || null); store.set('bh_device_branch', j.device.branchName); store.set('bh_device_id', j.device.id);
      // sign the owner/admin out, so the next person on this shared phone sees the name list, not the owner's session
      S.proToken = null; S.pro = null; store.set('bh_pro', null); S.dev = null; S.devSkip = false;
      toast('This phone is set up for ' + j.device.branchName + '. You are signed out; staff can now tap their name.'); }
    catch (x) { toast(x.message); }
    return render();
  }
  if ('devunset' in D) {
    const id = store.get('bh_device_id');   // also switch it off on the server, so the key on this phone stops working
    if (id) { try { await sapi('/devices/' + id, { method: 'DELETE' }); } catch (x) { if (!/not found/i.test(x.message)) { toast(x.message); return; } } }
    store.set('bh_device_id', null); store.set('bh_device', null); store.set('bh_device_org', null); store.set('bh_device_branch', null); S.dev = null; toast('This phone is no longer used for PIN login'); return render(); }
});
app.addEventListener('submit', async e => {
  if (e.target.id !== 'devpinf') return;
  const pin = String(new FormData(e.target).get('pin') || '').trim();
  S.devBusy = true; S.proErr = ''; render();
  try {
    const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', ...devHeaders() }, body: JSON.stringify({ userId: S.devPick, pin }) }), j = await r.json().catch(() => ({}));
    if (r.status === 401 && /not set up/.test(j.error || '')) { S.dev = null; store.set('bh_device', null); throw new Error(j.error); }
    if (!r.ok) throw new Error(j.error || 'Something went wrong');
    store.set('bh_org', store.get('bh_device_org') || null);
    S.proToken = j.token; store.set('bh_pro', j.token); S.devPick = null; await loadPro(); S.proSel = S.pro?.staff[0]?.id; S.td = null;
    if (S.pro?.admin) { S.proTab = 'shop'; loadShopOwner(); } else { S.proTab = 'today'; loadToday(true); } loadDash();
  } catch (x) { S.proErr = x.message; }
  S.devBusy = false; render();
});

// the booking link box selects all its text when tapped (in place of an inline onclick, which the security policy blocks)
document.addEventListener('focusin', e => { if (e.target.matches?.('[data-selall]')) e.target.select(); });
// T32: tap a number tile to read how it is counted
document.addEventListener('click', e => { const h = e.target.closest('[data-how]'); if (h && !e.target.closest('button,a,input,select')) toast(h.dataset.how); });
