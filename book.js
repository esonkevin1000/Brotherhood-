// Brotherhood: public booking site (/book). Customers pick a branch, services, barber and time. The booking lands in that branch.
// Screens follow the dark redesign in book.html: top bar, hero, step pages with a progress bar, a summary (side panel on desktop,
// bottom bar on phones), the emailed-code step (T16), and the booked ticket.
const app = document.getElementById('app');
const peso = n => '₱' + Number(n || 0).toLocaleString('en-PH');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initials = s => String(s || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const t12 = t => { const [h, m] = String(t).split(':').map(Number); return `${h % 12 || 12}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}`; };
const toMin = t => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
const ICON = {
  scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>', pin: '<path d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  back: '<path d="M15 18l-6-6 6-6"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>', mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>', user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>'
};
const ic = n => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICON[n]}</svg>`;
const stars = n => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n));

let G = {};
let I = null, R = { reviews: [], count: 0, avg: 0, shown: 6 };
const S = { step: 1, lock: false, branch: '', items: [], staff: 'any', date: '', time: '', slots: null, name: '', phone: '', email: '', cut: '', consent: false, terms: null, showTerms: false, err: '', busy: false, done: null, hold: null,
  rv: { branchId: '', staffId: '', rating: 0, name: '', text: '', busy: false, err: '', thanks: false } };
const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(Date.now() + i * 864e5); return { v: ymd(d), l: i === 0 ? 'Today' : i === 1 ? 'Tmrw' : d.toLocaleDateString('en-PH', { weekday: 'short' }), n: d.getDate(), m: d.toLocaleDateString('en-PH', { month: 'short' }) }; });
const maxDate = ymd(new Date(Date.now() + 60 * 864e5));

// sent with the booking so a double tap or a retry never makes a second booking: the same choices in this visit give the same key
const newVisit = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now());
let VISIT = newVisit();   // renewed after every successful booking
const idemKey = () => [VISIT, S.branch, S.staff, S.date, S.time, S.items.join('.')].join('|').slice(0, 200);
const svcs = () => I.services.filter(s => S.items.includes(s.id));
const total = () => svcs().reduce((t, s) => t + s.price, 0), mins = () => Math.max(30, svcs().reduce((t, s) => t + (s.mins || 30), 0));
// only barbers who do every chosen service (s.services is null when a barber does everything)
const team = () => I.staff.filter(s => s.branchId === S.branch && (!s.services || S.items.every(i => s.services.includes(i))));
const branch = id => I.branches.find(b => b.id === id);
const needCode = () => !!branch(S.branch)?.verify;   // T16: this branch confirms guest bookings with an emailed code
const dur = m => m % 60 === 0 && m >= 60 ? (m / 60) + ' hour' + (m === 60 ? '' : 's') : m + ' minutes';
// the booking rules shown before confirming (T17); the grace rule only where the new booking system is on
const policyText = () => { const p = branch(S.branch)?.policy; if (!p) return ''; return (p.cancelCutoffMins ? `You can cancel up to ${dur(p.cancelCutoffMins)} before your time.` : 'You can cancel any time before your appointment.') + (needCode() && p.noshowGraceMins ? ` If you are running late, we hold your slot for ${p.noshowGraceMins} minutes; after that it goes to the next customer.` : ''); };
const emailOk = () => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(S.email.trim());
const ready = () => S.branch && S.items.length && S.date && S.time && S.name.trim() && S.phone.replace(/\D/g, '').length >= 10 && (!needCode() || emailOk());
const pic = (url, name, cls = 'av') => url ? `<img class="${cls}" src="${esc(url)}" alt="" loading="lazy">` : `<span class="${cls}" aria-hidden="true">${esc(initials(name))}</span>`;
const hours = b => `${t12(b.openTime || '09:00')} – ${t12(b.closeTime || '21:00')}`;
const openNow = b => { const n = new Date(), m = n.getHours() * 60 + n.getMinutes(); return m >= toMin(b.openTime || '09:00') && m < toMin(b.closeTime || '21:00'); };

async function loadSlots() {
  S.time = ''; S.slots = null;
  if (!S.branch || !S.items.length || !S.date) return render();
  render();
  try { S.slots = (await (await fetch(`/api/public/slots?branch=${S.branch}&date=${S.date}&staff=${S.staff}&items=${S.items.join(',')}`)).json()).slots; } catch (e) { S.slots = []; }
  render();
}
async function loadGoogle(id) {
  const b = id && I ? branch(id) : null; if (!b || !b.google || !b.google.connected || G[id]) return;
  G[id] = { loading: true }; try { G[id] = await (await fetch('/api/public/google?branch=' + id)).json(); } catch (e) { G[id] = { available: false }; }
  render();
}
function googleHtml() {
  const b = S.branch ? branch(S.branch) : null; if (!b || !b.google || !(b.google.readUrl || b.google.writeUrl)) return '';
  const g = G[b.id] || {}, gi = b.google, rows = g.reviews || [];
  const head = g.available && g.rating ? `<div class="rhead"><span class="rbig">${Number(g.rating).toFixed(1)}</span><div><div class="stars" aria-label="${Number(g.rating).toFixed(1)} out of 5">${stars(g.rating)}</div><span class="mute">${g.count} Google review${g.count === 1 ? '' : 's'} · ${esc(b.name)}</span></div></div>` : '';
  return `<div class="gblock"><h3><span class="gmark" aria-hidden="true">G</span> Google reviews · ${esc(b.name)}</h3>${head}
    ${rows.length ? `<div class="rgrid">${rows.map(r => `<div class="rcard"><div class="who"><b>${esc(r.author)}</b><span class="stars" style="font-size:14px" aria-label="${r.rating} out of 5">${stars(r.rating)}</span></div><small class="mute">${esc(r.when)}</small>${r.text ? `<p>${esc(r.text)}</p>` : ''}</div>`).join('')}</div>` : (g.loading ? '<p class="mute">Loading Google reviews…</p>' : '')}
    <div class="glinks">${gi.readUrl ? `<a class="pill" href="${esc(gi.readUrl)}" target="_blank" rel="noopener">Read all reviews on Google</a>` : ''}${gi.writeUrl ? `<a class="pill" href="${esc(gi.writeUrl)}" target="_blank" rel="noopener">Write a Google review</a>` : ''}</div></div>`;
}
async function loadReviews() {
  try { R = { ...R, ...(await (await fetch('/api/public/reviews' + (S.branch ? '?branch=' + S.branch : ''))).json()) }; } catch (e) { }
  render();
}

// ---------- pieces ----------
const hasBarbers = id => I.staff.some(s => s.branchId === id);   // a branch can take online bookings only once barbers are added to it
function topBar() {
  return `<nav class="nav" aria-label="Brotherhood"><div><a class="brand" href="/book" aria-label="Brotherhood Barber, booking home"><img src="/bh-icon-192.png" alt=""><span>BROTHER<b>HOOD</b></span></a><span class="sp"></span><a class="lnk" href="/member">Brotherhood app</a></div></nav>`;
}
function heroHtml() {
  const all = I.ratings ? Object.values(I.ratings) : [], n = all.reduce((s, r) => s + r.count, 0), avg = n ? all.reduce((s, r) => s + r.avg * r.count, 0) / n : 0;
  return `<header class="hero" style="background-image:url('/site/hero.jpg')"><div><span class="mono">${esc(I.shop)} Barber</span><h1>Book your <em>cut</em></h1>
    <p>Pick a branch, your barber and a free time in under a minute. No queue, and you pay at the shop.</p><a class="cta" href="#book">Book now</a>
    <div class="facts"><div><b>${I.branches.length}</b><span>Branches</span></div><div><b>${I.staff.length}</b><span>Barbers</span></div>${n ? `<div><b>★ ${avg.toFixed(1)}</b><span>${n} reviews</span></div>` : ''}</div></div></header>`;
}
function branchCards() {
  return `<div class="branches">${I.branches.map(b => {
    const rt = I.ratings?.[b.id], open = hasBarbers(b.id), crew = I.staff.filter(s => s.branchId === b.id), now = openNow(b);
    return `<div class="bcard ${S.branch === b.id ? 'on' : ''} ${open ? '' : 'soon'}" ${open ? `data-branch="${b.id}" role="button" tabindex="0" aria-label="Book at ${esc(b.name)}"` : ''}>
      <div class="bimg" style="${b.photo ? `background-image:url('${esc(b.photo)}')` : ''}"><span class="status ${now ? 'open' : ''}"><i></i>${now ? 'Open now' : 'Closed now'}</span><span class="nm">${esc(b.name)}</span></div>
      <div class="bbody"><span class="addr">${ic('pin')}<span>${esc(b.address || 'Brotherhood Barber')}</span></span><small class="mute">Open ${hours(b)}${b.phone ? ' · ' + esc(b.phone) : ''}</small>
      ${crew.length ? `<div class="faces"><span class="st">${crew.slice(0, 4).map(s => pic(s.photo, s.name, '')).join('')}</span><small>${crew.length} barber${crew.length === 1 ? '' : 's'}${rt ? ` · ★ ${rt.avg} (${rt.count})` : ''}${b.google && b.google.rating ? ` · Google ★ ${Number(b.google.rating).toFixed(1)}` : ''}</small></div>` : ''}
      <div class="bact">${open ? `<span class="pill pri">${S.branch === b.id ? ic('check') + ' Selected' : 'Book here'}</span>` : `<span class="mute" style="font-size:13px">Online booking opens soon</span>${b.phone ? `<a class="pill" href="tel:${esc(b.phone)}">Call to book</a>` : ''}`}${b.mapUrl ? `<a class="pill" href="${esc(b.mapUrl)}" target="_blank" rel="noopener">${ic('map')} Directions</a>` : ''}</div></div></div>`;
  }).join('')}</div>`;
}
function summaryHtml(forBar) {
  const b = S.branch ? branch(S.branch) : null, st = S.staff === 'any' ? 'Any available barber' : I.staff.find(x => x.id === S.staff)?.name;
  const when = S.date && S.time ? `${new Date(S.date + 'T00:00').toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })} · ${t12(S.time)}` : '';
  if (forBar) return `<div class="sum"><b>${peso(total())}</b><span>${S.items.length ? `${S.items.length} service${S.items.length > 1 ? 's' : ''} · ${mins()} min${when ? ' · ' + esc(when) : ''}` : 'Choose a service'}</span></div>`;
  return `<div class="summary"><h3>Your booking</h3>${b?.photo ? `<div class="shot" style="background-image:url('${esc(b.photo)}')"></div>` : ''}
    <div class="line"><span>Branch</span><b>${esc(b?.name || '—')}</b></div><div class="line"><span>Services</span><b>${svcs().map(s => esc(s.name)).join(', ') || '—'}</b></div>
    <div class="line"><span>Barber</span><b>${S.step > 3 || S.lock ? esc(st) : '—'}</b></div><div class="line"><span>When</span><b>${esc(when) || '—'}</b></div><div class="line"><span>Duration</span><b>${S.items.length ? mins() + ' min' : '—'}</b></div>
    <div class="total"><span class="mute">Total, pay at the shop</span><b>${peso(total())}</b></div>${S.step > 1 ? goBtn('block') : ''}
    <p class="paynote">${ic('cash')}<span>No payment online. You pay at the shop after your haircut.</span></p></div>`;
}
// ---------- one page per step ----------
const STEPS = ['Branch', 'Services', 'Barber', 'Time', 'Details'];
const firstStep = () => I.branches.length === 1 ? 2 : 1;
function stepOk(n) { return n === 1 ? !!S.branch : n === 2 ? S.items.length > 0 : n === 3 ? true : n === 4 ? !!(S.date && S.time) : ready(); }
function goBtn(cls = '') {
  const n = S.step;
  return n === 5 ? `<button class="go ${cls}" data-go ${ready() && !S.busy ? '' : 'disabled'}>${S.busy ? 'Please wait…' : needCode() ? 'Send my code' : 'Confirm booking'}</button>`
    : `<button class="go ${cls}" data-act="next" ${stepOk(n) ? '' : 'disabled'}>Continue</button>`;
}
function stepHead(title, sub) {
  const first = firstStep(), shown = STEPS.length - (first - 1), k = S.step - first + 1;
  return `<div class="stephead"><div>${S.step > first ? `<button class="backlink" data-act="back">${ic('back')} Back</button><br>` : ''}<span class="mono">Step ${k} of ${shown}</span><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div></div>
    <div class="prog" role="progressbar" aria-label="Booking progress" aria-valuemin="1" aria-valuemax="${shown}" aria-valuenow="${k}">${STEPS.slice(first - 1).map((_, i) => `<i class="${i < k ? 'on' : ''}"></i>`).join('')}</div>`;
}
function slotGroups() {
  const g = [['Morning', s => toMin(s) < 720], ['Afternoon', s => toMin(s) >= 720 && toMin(s) < 1020], ['Evening', s => toMin(s) >= 1020]];
  return g.map(([l, f]) => { const list = S.slots.filter(f); return list.length ? `<div class="slotg"><h4>${l}</h4><div class="slots" role="group" aria-label="${l} times">${list.map(x => `<button class="slot ${S.time === x ? 'on' : ''}" data-time="${x}" aria-pressed="${S.time === x}">${t12(x)}</button>`).join('')}</div></div>` : ''; }).join('');
}
function stepBody() {
  const n = S.step;
  if (n === 1) return stepHead('Choose your branch', 'Tap a branch to continue.') + branchCards();
  if (n === 2) { const w = (I.menu || []).filter(s => s.bookable === false);
    return `${S.lock ? lockedBarber() : ''}${stepHead('Choose your services', 'Pick one or more. You pay at the shop after your haircut.')}<div class="services" role="group" aria-label="Services">${I.services.map(s => `<button class="opt ${S.items.includes(s.id) ? 'on' : ''}" data-svc="${s.id}" aria-pressed="${S.items.includes(s.id)}">${s.photo ? `<img class="pic" src="${esc(s.photo)}" alt="" loading="lazy">` : `<span class="pic">${ic('scissors')}</span>`}<span><span class="nm">${esc(s.name)}</span>${s.apptOnly ? '<span class="tag">By appointment</span>' : ''}<small>${s.mins || 30} min</small></span><span class="pr">${peso(s.price)}</span><span class="ck" aria-hidden="true">${S.items.includes(s.id) ? ic('check') : ''}</span></button>`).join('') || '<p class="mute">No services available.</p>'}</div>
      ${w.length ? `<div class="walkin"><b>Walk-in only</b> (no booking needed)${w.map(s => `<div class="mi"><span>${esc(s.name)}</span><span>${peso(s.price)}</span></div>`).join('')}</div>` : ''}`; }
  if (n === 3) return stepHead('Choose your barber', 'Any barber gets you the earliest time.') + `<div class="team" role="group" aria-label="Barbers">
      <button class="mate ${S.staff === 'any' ? 'on' : ''}" data-staff="any" aria-pressed="${S.staff === 'any'}"><span class="av">${ic('scissors')}</span><b>Any barber</b><small>Fastest</small></button>
      ${team().map(m => `<button class="mate ${S.staff === m.id ? 'on' : ''}" data-staff="${m.id}" aria-pressed="${S.staff === m.id}">${pic(m.photo, m.name)}<b>${esc(m.name)}</b></button>`).join('')}</div>`;
  if (n === 4) return stepHead('Pick a day and time', `${mins()} minutes${S.staff !== 'any' ? ' with ' + esc(I.staff.find(x => x.id === S.staff)?.name || '') : ''}.`) + `
      <div class="days" role="group" aria-label="Days">${days.map(d => `<button class="day ${S.date === d.v ? 'on' : ''}" data-date="${d.v}" aria-pressed="${S.date === d.v}" aria-label="${esc(d.l)} ${d.n} ${esc(d.m)}"><small>${esc(d.l)}</small><b>${d.n}</b><small>${esc(d.m)}</small></button>`).join('')}
      <label class="day more">Other<br>date<input type="date" id="pickdate" min="${days[0].v}" max="${maxDate}" value="${days.some(d => d.v === S.date) ? '' : esc(S.date)}" aria-label="Pick another date"></label></div>
      ${!S.date ? '<div class="empty">Choose a day to see the free times.</div>' : S.slots === null ? '<div class="slotg"><div class="skel"></div></div>' : S.slots.length ? slotGroups() : `<div class="empty">${hasBarbers(S.branch) ? 'No free times on this day. Try another day, or go back and choose another barber.' : 'This branch has no barbers set up for online booking yet. Please choose another branch or call the shop.'}</div>`}
      <div class="err" role="alert">${esc(S.err)}</div>`;
  return stepHead('Your details', 'So the shop knows who is coming.') + `<div class="panel">
      <div class="row2"><div><label for="name">Full name</label><input id="name" value="${esc(S.name)}" autocomplete="name" required></div><div><label for="phone">Mobile number</label><input id="phone" type="tel" inputmode="tel" placeholder="09XX XXX XXXX" value="${esc(S.phone)}" autocomplete="tel" required></div></div>
      <div class="row2"><div><label for="email">${needCode() ? 'Email (we send your code here)' : 'Email (optional)'}</label><input id="email" type="email" inputmode="email" placeholder="name@email.com" value="${esc(S.email)}" autocomplete="email" ${needCode() ? 'required aria-describedby="needmail"' : ''}></div><div><label for="cut">Preferred haircut (optional)</label><input id="cut" placeholder="e.g. Low fade, no. 2 on the sides" value="${esc(S.cut)}"></div></div>
      ${needCode() ? `<div class="note" id="needmail">${ic('mail')}<span><b>Email is required to book online.</b> We send you a 6-digit code to confirm your booking. No email? Just walk in, we will gladly serve you.</span></div>` : ''}
      ${policyText() ? `<div class="note">${ic('info')}<span><b>Booking rules.</b> ${esc(policyText())}</span></div>` : ''}
      <label class="consent"><input type="checkbox" id="consent" ${S.consent ? 'checked' : ''}><span>I agree to receive emails and promos from Brotherhood Barber, and I agree to the <a href="#" data-act="terms">Terms &amp; Conditions</a>.</span></label>
      <p class="fine">Your phone number or email is used to recognise you when you come back and to keep track of your visits and loyalty points.</p>
      <div class="err" role="alert">${esc(S.err)}</div></div>`;
}
function lockedBarber() { const m = I.staff.find(x => x.id === S.staff); if (!m) return ''; return `<div class="lockb" style="margin-bottom:14px">${pic(m.photo, m.name, 'lav')}<div style="flex:1;min-width:0"><small class="mute">Booking with</small><b>${esc(m.name)}</b><small class="mute">${esc(branch(S.branch).name)}</small></div><button class="pill" data-act="goto" data-n="3">Change</button></div>`; }
function goStep(n) { S.step = n; S.err = ''; if (n === 4) { if (!S.date) S.date = days[0].v; loadSlots(); } else render(); window.scrollTo(0, 0); }
function reviewsHtml() {
  const rv = S.rv, rt = R;
  const bsel = `<select id="rv-branch"><option value="">Choose the branch you visited</option>${I.branches.map(b => `<option value="${b.id}" ${rv.branchId === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>`;
  const staff = I.staff.filter(s => !rv.branchId || s.branchId === rv.branchId);
  return `${googleHtml()}<section class="reviews" aria-labelledby="revh"><span class="mono">Reviews</span><h2 id="revh">What our customers say</h2>
    <div class="rhead"><span class="rbig">${rt.count ? rt.avg.toFixed(1) : '—'}</span><div><div class="stars" aria-label="${rt.count ? rt.avg.toFixed(1) : 0} out of 5">${rt.count ? stars(rt.avg) : '☆☆☆☆☆'}</div><span class="mute">${rt.count} review${rt.count === 1 ? '' : 's'}${S.branch ? ' · ' + esc(branch(S.branch).name) : ' · all branches'}</span></div></div>
    <div class="rgrid">${rt.reviews.slice(0, rt.shown ?? 6).map(r => `<div class="rcard"><div class="who"><b>${esc(r.name)}</b><span class="stars" style="font-size:14px" aria-label="${r.rating} out of 5">${stars(r.rating)}</span></div><small class="mute">${esc(r.branchName)}${r.staffName ? ' · Barber: ' + esc(r.staffName) : ''} · ${new Date(r.createdAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</small>${r.text ? `<p>${esc(r.text)}</p>` : ''}</div>`).join('') || '<p class="mute">No reviews yet. Be the first!</p>'}</div>
    ${rt.reviews.length > (rt.shown ?? 6) ? '<p style="text-align:center"><button class="pill" data-act="morerev">Show more reviews</button></p>' : ''}
    <details class="rform" ${rv.thanks || rv.err || rv.rating ? 'open' : ''}><summary>Leave a review</summary><p class="mute" style="margin:10px 0 0">Tell us about your visit. Your review appears on this page.</p>
      ${rv.thanks ? '<div class="thanks">Thank you! Your review has been posted.</div>' : `<div class="row2"><div><label for="rv-branch">Branch</label>${bsel}</div><div><label for="rv-staff">Barber (optional)</label><select id="rv-staff"><option value="">Not sure / no preference</option>${staff.map(s => `<option value="${s.id}" ${rv.staffId === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div></div>
      <label>Your rating</label><div class="starpick" role="group" aria-label="Your rating">${[1, 2, 3, 4, 5].map(n => `<button type="button" class="${rv.rating >= n ? 'on' : ''}" data-star="${n}" aria-label="${n} star${n > 1 ? 's' : ''}" aria-pressed="${rv.rating === n}">★</button>`).join('')}</div>
      <label for="rv-name">Your name</label><input id="rv-name" value="${esc(rv.name)}" maxlength="60" autocomplete="name"><label for="rv-text">Comment (optional)</label><textarea id="rv-text" rows="3" maxlength="600" placeholder="How was your haircut?">${esc(rv.text)}</textarea>
      <div class="err" role="alert">${esc(rv.err)}</div><button class="go" data-act="sendrev" ${rv.busy ? 'disabled' : ''}>${rv.busy ? 'Posting…' : 'Post review'}</button>`}</details></section>`;
}
const whyHtml = () => `<section class="why" aria-label="Why book online"><div>${ic('clock')}<b>No queue</b><p>Your barber is ready at your time. No waiting in line.</p></div><div>${ic('user')}<b>Your barber</b><p>Pick the barber you like, or any barber for the earliest time.</p></div><div>${ic('cash')}<b>Pay at the shop</b><p>No card needed. You pay after your haircut.</p></div></section>`;
const footerHtml = () => `<footer><span>© ${new Date().getFullYear()} ${esc(I.shop)} Barber</span><span class="sp"></span><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/member">Brotherhood app</a></footer>`;

function render() {
  if (!I) { app.innerHTML = `<div class="wrap"><p class="mute" role="status">Loading…</p></div>`; return; }
  const top = topBar();
  if (S.showTerms) { app.innerHTML = top + `<main class="wrap"><div class="stephead"><div><button class="backlink" data-act="closeterms">${ic('back')} Back</button><br><h2>Terms &amp; Conditions</h2></div></div><div class="terms">${esc(S.terms)}</div><br><button class="go" data-act="closeterms">I understand</button></main>`; window.scrollTo(0, 0); return; }
  if (S.hold) {   // T16: the time is held while the guest enters the code from the email
    const h = S.hold, left = Math.max(0, Math.ceil((new Date(h.until) - Date.now()) / 60e3));
    app.innerHTML = top + `<main class="wrap"><div class="layout"><div><div class="stephead"><div><span class="mono">Last step</span><h2>Check your email</h2><p>We sent a 6-digit code to <b>${esc(h.email)}</b>. Your time is held for ${left > 0 ? 'about ' + left + ' minute' + (left === 1 ? '' : 's') : 'a few seconds'}.</p></div></div>
      <div class="panel"><label for="code">6-digit code</label><input id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" placeholder="123456" value="${esc(h.code || '')}" style="font-size:26px;letter-spacing:8px;text-align:center">
      <div class="err" role="alert">${esc(S.err)}</div>${h.note ? `<p class="mute" role="status">${esc(h.note)}</p>` : ''}
      <button class="go block" data-act="confirmcode" ${S.busy ? 'disabled' : ''}>${S.busy ? 'Please wait…' : 'Confirm booking'}</button>
      <p class="fine">No email? Check your spam folder. <a href="#" data-act="resendcode">Send a new code</a> · <a href="#" data-act="cancelhold">Start again</a></p></div></div>
      <aside class="side">${summaryHtml(false).replace(/<button class="go[^>]*>[^<]*<\/button>/, '')}</aside></div></main>`;
    return;
  }
  if (S.done) {
    const b = S.done, when = new Date(b.date + 'T00:00').toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' }), br = I.branches.find(x => b.branch && b.branch.endsWith(x.name));
    app.innerHTML = top + `<main class="wrap"><div class="done"><div class="tick" aria-hidden="true">${ic('check')}</div><h2>You're booked!</h2><p class="mute">Thank you, ${esc(b.name)}. We'll be expecting you.${needCode() ? ' A confirmation is in your email.' : ''}</p>
      <div class="ticket"><div class="tt">${b.staffPhoto ? `<img src="${esc(b.staffPhoto)}" alt="">` : `<span class="ph" aria-hidden="true">${esc(initials(b.staff))}</span>`}<div><small class="mute">Your barber</small><b>${esc(b.staff)}</b><small class="mute">${esc(b.branch)}</small></div></div>
        <div class="big"><div><small>Date</small><b>${esc(when)}</b></div><div><small>Time</small><b>${t12(b.time)}</b></div></div>
        ${b.items.map(i => `<div class="r"><span>${esc(i.name)}</span><span>${peso(i.price)}</span></div>`).join('')}<div class="r tot"><span>Total, pay at the shop</span><b>${peso(b.total)}</b></div></div>
      <div class="acts">${br?.mapUrl ? `<a class="pill" href="${esc(br.mapUrl)}" target="_blank" rel="noopener">${ic('map')} Directions</a>` : `<a class="pill" href="/member">Brotherhood app</a>`}<button class="pill pri" data-act="again">Book another</button></div>
      <p class="fine">Please arrive 5 to 10 minutes early. ${esc(policyText())}</p></div></main>`;
    window.scrollTo(0, 0); return;
  }
  app.innerHTML = top + (S.step === firstStep() && S.step === 1 ? heroHtml() : '') + `<main class="wrap" id="book"><div class="layout"><div>${stepBody()}</div><aside class="side" aria-label="Your booking">${summaryHtml(false)}</aside></div>
  ${S.step === 1 ? reviewsHtml() + whyHtml() : ''}</main>${footerHtml()}
  ${S.step > 1 ? `<div class="bar"><div>${summaryHtml(true)}${goBtn()}</div></div>` : ''}`;
}

document.addEventListener('click', async e => {
  if (e.target.closest('.bcard a')) return;
  const el = e.target.closest('[data-branch],[data-svc],[data-staff],[data-date],[data-time],[data-go],[data-star],[data-act]'); if (!el) return;
  const d = el.dataset;
  if (el.tagName === 'A') e.preventDefault();
  if (d.branch) { if (S.branch !== d.branch) { S.staff = 'any'; S.lock = false; S.time = ''; S.slots = null; } S.branch = d.branch; S.err = ''; S.rv.branchId ||= d.branch; loadReviews(); loadGoogle(d.branch); return goStep(2); }
  if (d.svc) { S.items = S.items.includes(d.svc) ? S.items.filter(x => x !== d.svc) : [...S.items, d.svc]; S.err = ''; S.time = ''; S.slots = null; if (S.staff !== 'any' && !S.lock && !team().some(m => m.id === S.staff)) S.staff = 'any'; return render(); }
  if (d.staff) { S.staff = d.staff; S.lock = false; S.time = ''; S.slots = null; return render(); }
  if (d.act === 'next') { if (stepOk(S.step)) goStep(S.lock && S.step === 2 ? 4 : S.step + 1); return; }   // a barber chosen from the promo site skips the barber step
  if (d.act === 'back') return goStep(S.lock && S.step === 4 ? 2 : Math.max(firstStep(), S.step - 1));
  if (d.act === 'goto') return goStep(+d.n);
  if (d.date) { S.date = d.date; return loadSlots(); }
  if (d.time) { S.time = d.time; S.err = ''; return render(); }
  if (d.star) { S.rv.rating = +d.star; S.rv.err = ''; return render(); }
  if (d.act === 'morerev') { R.shown = (R.shown ?? 6) + 6; return render(); }
  if (d.act === 'terms') {
    if (S.terms === null) { try { S.terms = (await (await fetch('/api/public/terms')).json()).terms; } catch (x) { S.terms = 'Could not load the Terms.'; } }
    S.showTerms = true; return render();
  }
  if (d.act === 'closeterms') { S.showTerms = false; return render(); }
  if (d.act === 'again') { Object.assign(S, { items: [], staff: 'any', lock: false, date: '', time: '', slots: null, err: '', done: null, step: S.branch ? 2 : firstStep() });window.scrollTo(0, 0); return render(); }
  if (d.act === 'sendrev') {
    const rv = S.rv;
    if (!rv.branchId) rv.err = 'Please choose the branch you visited.'; else if (!rv.rating) rv.err = 'Please tap the stars to rate your visit.'; else if (!rv.name.trim()) rv.err = 'Please enter your name.'; else rv.err = '';
    if (rv.err) return render();
    rv.busy = true; render();
    try {
      const r = await fetch('/api/public/reviews', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ branchId: rv.branchId, staffId: rv.staffId, name: rv.name, rating: rv.rating, text: rv.text }) });
      const j = await r.json(); rv.busy = false;
      if (!r.ok) { rv.err = j.error || 'Something went wrong. Please try again.'; return render(); }
      Object.assign(rv, { rating: 0, text: '', thanks: true, err: '' }); await loadReviews();
      try { const info = await (await fetch('/api/public/info')).json(); I.ratings = info.ratings; } catch (x) { }
      render();
    } catch (x) { rv.busy = false; rv.err = 'No connection. Please try again.'; render(); }
    return;
  }
  if (d.act === 'confirmcode' || d.act === 'resendcode') {   // T16
    e.preventDefault(); const h = S.hold; if (!h) return;
    h.code = (document.getElementById('code')?.value || '').trim(); S.err = ''; h.note = '';
    if (d.act === 'confirmcode' && !/^\d{6}$/.test(h.code)) { S.err = 'Enter the 6-digit code from the email.'; return render(); }
    S.busy = true; render();
    try {
      const r = await fetch('/api/public/book/' + (d.act === 'confirmcode' ? 'confirm' : 'resend'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hold: h.id, code: h.code }) }), j = await r.json().catch(() => ({}));
      S.busy = false;
      if (r.ok && d.act === 'confirmcode') { S.hold = null; S.done = j.booking; VISIT = newVisit(); return render(); }
      if (r.ok) { h.code = ''; h.note = 'A new code was sent. Use the newest one.'; return render(); }
      if (r.status === 410 || (r.status === 429 && /released/.test(j.error || ''))) { S.hold = null; S.step = 4; S.time = ''; VISIT = newVisit(); await loadSlots(); S.err = j.error; return render(); }
      S.err = j.error || 'Something went wrong. Please try again.'; render();
    } catch (x) { S.busy = false; S.err = 'No connection. Please try again.'; render(); }
    return;
  }
  if (d.act === 'cancelhold') { e.preventDefault(); S.hold = null; S.time = ''; S.step = 4; VISIT = newVisit(); await loadSlots(); return render(); }
  if (el.hasAttribute('data-go')) {
    S.busy = true; S.err = ''; render();
    try {
      const r = await fetch('/api/public/book', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idemKey() }, body: JSON.stringify({ branchId: S.branch, staffId: S.staff, date: S.date, time: S.time, itemIds: S.items, name: S.name, phone: S.phone, email: S.email, preferredCut: S.cut, consent: S.consent }) });
      const j = await r.json();
      if (!r.ok) { S.err = j.error || 'Something went wrong. Please try again.'; S.busy = false; if (r.status === 409) { if (/already used/i.test(j.error || '')) VISIT = newVisit(); S.step = 4; await loadSlots(); S.err = j.error; } return render(); }
      if (r.status === 202 && j.pending) { S.hold = { id: j.hold, until: j.holdUntil, email: j.email, code: '' }; S.busy = false; window.scrollTo(0, 0); render(); document.getElementById('code')?.focus(); return; }
      S.done = j.booking; S.busy = false; VISIT = newVisit(); render();
    } catch (x) { S.err = 'No connection. Please try again.'; S.busy = false; render(); }
  }
});
document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.bcard')) { e.preventDefault(); e.target.click(); } });
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'consent') S.consent = t.checked;
  if (t.id === 'pickdate' && t.value) { S.date = t.value; loadSlots(); }
  if (t.id === 'rv-branch') { S.rv.branchId = t.value; S.rv.staffId = ''; render(); }
  if (t.id === 'rv-staff') S.rv.staffId = t.value;
});
document.addEventListener('input', e => {
  const t = e.target, map = { name: 'name', phone: 'phone', email: 'email', cut: 'cut' };
  if (map[t.id]) { S[map[t.id]] = t.value; document.querySelectorAll('[data-go]').forEach(b => b.disabled = !ready() || S.busy); }
  if (t.id === 'rv-name') S.rv.name = t.value;
  if (t.id === 'rv-text') S.rv.text = t.value;
});

Promise.all([fetch('/api/public/info').then(r => r.json()), fetch('/api/public/reviews').then(r => r.json()).catch(() => R)])
  .then(([info, rev]) => { I = info; R = { ...R, ...rev }; const want = new URLSearchParams(location.search).get('branch'), pre = I.branches.length === 1 ? I.branches[0] : I.branches.find(b => b.id === want && hasBarbers(b.id));
    const wb = new URLSearchParams(location.search).get('barber'), pb = wb && I.staff.find(x => x.id === wb && hasBarbers(x.branchId));
    if (pb) { S.branch = pb.branchId; S.rv.branchId = pb.branchId; S.staff = pb.id; S.lock = true; S.step = 2; loadGoogle(pb.branchId); }
    else if (pre) { S.branch = pre.id; S.rv.branchId = pre.id; S.step = 2; loadGoogle(pre.id); } render(); })
  .catch(() => { app.innerHTML = `<div class="wrap"><p>Could not load. Please try again in a moment.</p></div>`; });
render();
