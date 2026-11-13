// Brotherhood: public booking site. Customers pick a branch, services, barber and time. The booking lands in that branch's POS.
const app = document.getElementById('app');
const peso = n => '₱' + Number(n || 0).toLocaleString('en-PH');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initials = s => String(s || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const t12 = t => { const [h, m] = String(t).split(':').map(Number); return `${h % 12 || 12}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}`; };
const ICON = {
  scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>', pin: '<path d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>'
};
const ic = n => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICON[n]}</svg>`;
const stars = n => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n));

let G = {};
let I = null, R = { reviews: [], count: 0, avg: 0, shown: 6 };
const S = { step: 1, lock: false, branch: '', items: [], staff: 'any', date: '', time: '', slots: null, name: '', phone: '', email: '', cut: '', consent: false, terms: null, showTerms: false, err: '', busy: false, done: null,
  rv: { branchId: '', staffId: '', rating: 0, name: '', text: '', busy: false, err: '', thanks: false } };
const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(Date.now() + i * 864e5); return { v: ymd(d), l: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-PH', { weekday: 'short' }), s: d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) }; });
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
const ready = () => S.branch && S.items.length && S.date && S.time && S.name.trim() && S.phone.replace(/\D/g, '').length >= 10;
const pic = (url, name, cls = 'av') => url ? `<img class="${cls}" src="${esc(url)}" alt="${esc(name)}" loading="lazy">` : `<span class="${cls}">${esc(initials(name))}</span>`;
const hours = b => `${t12(b.openTime || '09:00')} – ${t12(b.closeTime || '21:00')}`;

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
  const head = g.available && g.rating ? `<div class="rhead"><span class="rbig">${Number(g.rating).toFixed(1)}</span><div><div class="stars">${stars(g.rating)}</div><span class="mute">${g.count} Google review${g.count === 1 ? '' : 's'} · ${esc(b.name)}</span></div></div>` : '';
  return `<div class="gblock"><h3><span class="gmark">G</span> Google reviews · ${esc(b.name)}</h3>${head}
    ${rows.length ? `<div class="rgrid">${rows.map(r => `<div class="rcard"><div class="who"><b>${esc(r.author)}</b><span class="stars" style="font-size:14px">${stars(r.rating)}</span></div><small class="mute">${esc(r.when)}</small>${r.text ? `<p>${esc(r.text)}</p>` : ''}</div>`).join('')}</div>` : (g.loading ? '<p class="mute">Loading Google reviews…</p>' : '')}
    <div class="glinks">${gi.readUrl ? `<a class="btn2" href="${esc(gi.readUrl)}" target="_blank" rel="noopener">Read all reviews on Google</a>` : ''}${gi.writeUrl ? `<a class="btn2 alt" href="${esc(gi.writeUrl)}" target="_blank" rel="noopener">Write a Google review</a>` : ''}</div></div>`;
}
async function loadReviews() {
  try { R = { ...R, ...(await (await fetch('/api/public/reviews' + (S.branch ? '?branch=' + S.branch : ''))).json()) }; } catch (e) { }
  render();
}

const hasBarbers = id => I.staff.some(s => s.branchId === id);   // a branch can take online bookings only once barbers are added to it
function branchCards() {
  return `<div class="branches">${I.branches.map(b => {
    const rt = I.ratings?.[b.id], open = hasBarbers(b.id);
    return `<div class="bcard ${S.branch === b.id ? 'on' : ''} ${open ? '' : 'soon'}" ${open ? `data-branch="${b.id}" role="button" tabindex="0"` : ''}><div class="bimg" style="${b.photo ? `background-image:url('${esc(b.photo)}')` : ''}">${b.photo ? '' : ic('scissors')}<span class="pin">Selected</span></div>
      <div class="bbody"><b>${esc(b.name)}</b>${b.google && b.google.rating ? `<span class="rate">G ★ ${Number(b.google.rating).toFixed(1)} <span class="mute" style="font-weight:500">(${b.google.count} on Google)</span></span>` : ''}${rt ? `<span class="rate">★ ${rt.avg} <span class="mute" style="font-weight:500">(${rt.count} review${rt.count === 1 ? '' : 's'})</span></span>` : ''}
      <small>${ic('pin')} ${esc(b.address || 'Brotherhood Barber')}</small><small>Open ${hours(b)}${b.phone ? ' · ' + esc(b.phone) : ''}</small>
      <div class="bact">${open ? `<span class="sel">${S.branch === b.id ? '✓ Selected' : 'Select'}</span>` : `<span class="sel off">Online booking opens soon</span>${b.phone ? `<a href="tel:${esc(b.phone)}">Call to book</a>` : ''}`}${b.mapUrl ? `<a href="${esc(b.mapUrl)}" target="_blank" rel="noopener">Get directions</a>` : ''}</div></div></div>`;
  }).join('')}</div>`;
}
function summaryHtml(forBar) {
  const b = S.branch ? branch(S.branch) : null, st = S.staff === 'any' ? 'Any available barber' : I.staff.find(x => x.id === S.staff)?.name;
  const when = S.date && S.time ? `${days.find(d => d.v === S.date)?.l || S.date} · ${t12(S.time)}` : '';
  if (forBar) return `<div class="sum"><span>${S.items.length ? `${S.items.length} service${S.items.length > 1 ? 's' : ''} · ${mins()} min` : 'No service yet'}</span><b>${peso(total())}</b></div>`;
  return `<div class="summary"><h3>Your booking</h3>${b?.photo ? `<div class="shot" style="background-image:url('${esc(b.photo)}')"></div>` : ''}
    <div class="line"><span>Branch</span><b>${esc(b?.name || '—')}</b></div><div class="line"><span>Services</span><b>${svcs().map(s => esc(s.name)).join(', ') || '—'}</b></div>
    <div class="line"><span>Barber</span><b>${S.step > 3 ? esc(st) : '—'}</b></div><div class="line"><span>When</span><b>${esc(when) || '—'}</b></div><div class="line"><span>Duration</span><b>${S.items.length ? mins() + ' min' : '—'}</b></div>
    <div class="total"><span class="mute">Total (pay at the shop)</span><b>${peso(total())}</b></div>
    <p class="mute" style="font-size:12px;margin:10px 0 0;text-align:center">No payment online. You pay at the shop after your haircut.</p></div>`;
}
// ---------- one page per step ----------
const STEPS = ['Branch', 'Services', 'Barber', 'Time', 'Details'];
const firstStep = () => I.branches.length === 1 ? 2 : 1;
function stepOk(n) { return n === 1 ? !!S.branch : n === 2 ? S.items.length > 0 : n === 3 ? true : n === 4 ? !!(S.date && S.time) : ready(); }
function navBtns() {
  const n = S.step, back = n > firstStep() ? '<button class="back" data-act="back">Back</button>' : '';
  const next = n === 5 ? `<button class="go" data-go ${ready() && !S.busy ? '' : 'disabled'}>${S.busy ? 'Please wait…' : 'Confirm booking'}</button>` : `<button class="go" data-act="next" ${stepOk(n) ? '' : 'disabled'}>Continue</button>`;
  return `<div class="navrow">${back}${next}</div>`;
}
function progressHtml() {
  return `<div class="prog">${STEPS.map((l, i) => { const n = i + 1, st = n === S.step ? 'cur' : n < S.step ? 'done' : ''; if (n === 1 && firstStep() === 2) return ''; return `<button class="pstep ${st}" ${n < S.step ? `data-act="goto" data-n="${n}"` : 'disabled'}><b>${n < S.step ? '✓' : n}</b><span>${l}</span></button>`; }).join('')}</div>`;
}
function stepBody() {
  const n = S.step;
  if (n === 1) return `<section class="step"><h2><b>1</b>Choose your branch</h2><p class="mute" style="margin:-4px 0 12px">Tap a branch to continue.</p>${branchCards()}</section>`;
  if (n === 2) return `<section class="step">${S.lock ? lockedBarber() : ''}<h2><b>2</b>Choose your services</h2><p class="mute" style="margin:-4px 0 12px">Pick one or more. You will pay at the shop after your haircut.${(() => { const w = (I.menu || []).filter(s => s.bookable === false).map(s => s.name); return w.length ? ` <b>${esc(w.join(' and '))}</b> ${w.length === 1 ? 'is' : 'are'} walk-in only, no booking needed.` : ''; })()}</p><div class="services">${I.services.map(s => `<button class="opt ${S.items.includes(s.id) ? 'on' : ''}" data-svc="${s.id}">${s.photo ? `<img class="pic" src="${esc(s.photo)}" alt="" loading="lazy">` : `<span class="pic">${ic('scissors')}</span>`}<span><span class="nm">${esc(s.name)}</span>${s.apptOnly ? '<span class="tag">By appointment</span>' : ''}<small>${s.mins} min</small></span><span class="pr">${peso(s.price)}</span><span class="ck">${S.items.includes(s.id) ? ic('check') : ''}</span></button>`).join('') || '<p class="mute">No services available.</p>'}</div>${stepNav()}</section>`;
  if (n === 3) return `<section class="step"><h2><b>3</b>Choose your barber</h2><div class="team">
      <button class="mate ${S.staff === 'any' ? 'on' : ''}" data-staff="any"><span class="av">${ic('scissors')}</span><b>Any barber</b><small>Fastest</small></button>
      ${team().map(m => `<button class="mate ${S.staff === m.id ? 'on' : ''}" data-staff="${m.id}">${pic(m.photo, m.name)}<b>${esc(m.name)}</b></button>`).join('')}</div>${stepNav()}</section>`;
  if (n === 4) return `<section class="step"><h2><b>4</b>Pick a date and time</h2>
      <div class="chips">${days.map(d => `<button class="chip ${S.date === d.v ? 'on' : ''}" data-date="${d.v}">${d.l}<small>${d.s}</small></button>`).join('')}</div>
      <label>Or pick another date</label><input type="date" id="pickdate" min="${days[0].v}" max="${maxDate}" value="${days.some(d => d.v === S.date) ? '' : esc(S.date)}" style="max-width:240px">
      ${!S.date ? '<p class="mute" style="margin:10px 0 0">Choose a date to see the available times.</p>' : S.slots === null ? '<p class="mute">Looking for open times…</p>' : S.slots.length ? `<div class="slots">${S.slots.map(x => `<button class="chip ${S.time === x ? 'on' : ''}" data-time="${x}">${t12(x)}</button>`).join('')}</div>` : `<p class="mute" style="margin:10px 0 0">${hasBarbers(S.branch) ? 'No open times on this date. Try another day or go back and choose another barber.' : 'This branch has no barbers set up for online booking yet. Please choose another branch or call the shop.'}</p>`}
      <div class="err">${esc(S.err)}</div>${stepNav()}</section>`;
  return `<section class="step"><h2><b>5</b>Your details</h2>
      <div class="row2"><div><label>Full name</label><input id="name" value="${esc(S.name)}" autocomplete="name"></div><div><label>Mobile number</label><input id="phone" type="tel" inputmode="tel" placeholder="09XX XXX XXXX" value="${esc(S.phone)}" autocomplete="tel"></div></div>
      <div class="row2"><div><label>Email (optional)</label><input id="email" type="email" inputmode="email" placeholder="name@email.com" value="${esc(S.email)}" autocomplete="email"></div><div><label>Preferred haircut (optional)</label><input id="cut" placeholder="e.g. Low fade, no. 2 on the sides" value="${esc(S.cut)}"></div></div>
      <label class="consent"><input type="checkbox" id="consent" ${S.consent ? 'checked' : ''}><span>I agree to receive emails and promos from Brotherhood Barber, and I agree to the <a href="#" data-act="terms">Terms &amp; Conditions</a>.</span></label>
      <p class="mute" style="font-size:12px;margin:8px 0 0">Your phone number or email is used to recognise you when you come back and to keep track of your visits and loyalty points.</p>
      <div class="err">${esc(S.err)}</div>${stepNav()}</section>`;
}
function lockedBarber() { const m = I.staff.find(x => x.id === S.staff); if (!m) return ''; return `<div class="lockb">${pic(m.photo, m.name, 'lav')}<div style="flex:1;min-width:0"><small class="mute">Booking with</small><b>${esc(m.name)}</b><small class="mute">${esc(branch(S.branch).name)}</small></div><button class="back" data-act="goto" data-n="3" style="padding:8px 14px;font-size:13px">Change</button></div>`; }
const stepNav = () => `<div class="stepnav">${navBtns()}</div>`;
function goStep(n) { S.step = n; S.err = ''; if (n === 4) { if (!S.date) S.date = days[0].v; loadSlots(); } else render(); window.scrollTo(0, 0); }
function reviewsHtml() {
  const rv = S.rv, rt = R;
  const bsel = `<select id="rv-branch"><option value="">Choose the branch you visited</option>${I.branches.map(b => `<option value="${b.id}" ${rv.branchId === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>`;
  const staff = I.staff.filter(s => !rv.branchId || s.branchId === rv.branchId);
  return `${googleHtml()}<section class="reviews"><h2>What our customers say</h2>
    <div class="rhead"><span class="rbig">${rt.count ? rt.avg.toFixed(1) : '—'}</span><div><div class="stars">${rt.count ? stars(rt.avg) : '☆☆☆☆☆'}</div><span class="mute">${rt.count} review${rt.count === 1 ? '' : 's'}${S.branch ? ' · ' + esc(branch(S.branch).name) : ' · all branches'}</span></div></div>
    <div class="rgrid">${rt.reviews.slice(0, rt.shown ?? 6).map(r => `<div class="rcard"><div class="who"><b>${esc(r.name)}</b><span class="stars" style="font-size:14px">${stars(r.rating)}</span></div><small class="mute">${esc(r.branchName)}${r.staffName ? ' · Barber: ' + esc(r.staffName) : ''} · ${new Date(r.createdAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</small>${r.text ? `<p>${esc(r.text)}</p>` : ''}</div>`).join('') || '<p class="mute">No reviews yet. Be the first!</p>'}</div>
    ${rt.reviews.length > (rt.shown ?? 6) ? '<p style="text-align:center"><button class="btn2" data-act="morerev">Show more reviews</button></p>' : ''}
    <div class="rform"><h3>Leave a review</h3><p class="mute" style="margin:0">Tell us about your visit. Your review appears on this page.</p>
      ${rv.thanks ? '<div class="thanks">Thank you! Your review has been posted.</div>' : `<div class="row2"><div><label>Branch</label>${bsel}</div><div><label>Barber (optional)</label><select id="rv-staff"><option value="">Not sure / no preference</option>${staff.map(s => `<option value="${s.id}" ${rv.staffId === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div></div>
      <label>Your rating</label><div class="starpick">${[1, 2, 3, 4, 5].map(n => `<button type="button" class="${rv.rating >= n ? 'on' : ''}" data-star="${n}" aria-label="${n} star${n > 1 ? 's' : ''}">★</button>`).join('')}</div>
      <label>Your name</label><input id="rv-name" value="${esc(rv.name)}" maxlength="60" autocomplete="name"><label>Comment (optional)</label><textarea id="rv-text" rows="3" maxlength="600" placeholder="How was your haircut?">${esc(rv.text)}</textarea>
      <div class="err">${esc(rv.err)}</div><button class="btn2" data-act="sendrev" ${rv.busy ? 'disabled' : ''}>${rv.busy ? 'Posting…' : 'Post review'}</button>`}</div></section>`;
}

function render() {
  if (!I) { app.innerHTML = '<div class="top"><h1>Brotherhood</h1><p>Loading…</p></div>'; return; }
  const all = I.ratings ? Object.values(I.ratings) : [], n = all.reduce((s, r) => s + r.count, 0), avg = n ? all.reduce((s, r) => s + r.avg * r.count, 0) / n : 0;
  const head = `<div class="top"><img src="/logo-sm.png?v=b" alt=""><h1>${esc(I.shop)}</h1><p>Book your cut online. No waiting, no queue.</p>${n ? `<div class="stars">★ ${avg.toFixed(1)} · ${n} review${n === 1 ? '' : 's'}</div>` : ''}</div>`;
  if (S.showTerms) { app.innerHTML = head + `<div class="wrap"><div class="step"><h2>Terms &amp; Conditions</h2><div class="terms">${esc(S.terms)}</div><br><button class="go" data-act="closeterms">I understand</button></div></div>`; window.scrollTo(0, 0); return; }
  if (S.done) {
    const b = S.done, when = new Date(b.date + 'T00:00').toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' });
    app.innerHTML = head + `<div class="wrap"><div class="step done"><div class="tick">${ic('check')}</div><h2>You're booked!</h2><p class="mute">Thank you, ${esc(b.name)}. We'll be expecting you.</p>
      <div class="recap"><div class="who">${pic(b.staffPhoto, b.staff, 'ph')}<div><b>${esc(b.staff)}</b><br><span class="mute">your barber</span></div></div>
      <div class="r"><span class="mute">When</span><b>${esc(when)}, ${t12(b.time)}</b></div><div class="r"><span class="mute">Where</span><b>${esc(b.branch)}</b></div>
      ${b.items.map(i => `<div class="r"><span>${esc(i.name)}</span><span>${peso(i.price)}</span></div>`).join('')}<div class="r"><b>Total (pay at the shop)</b><b>${peso(b.total)}</b></div></div>
      <p class="mute" style="font-size:13px">Please arrive 5 to 10 minutes early. If you can't make it, call the shop so someone else can take your slot.</p>
      <button class="go" data-act="again">Book another</button></div></div>`;
    window.scrollTo(0, 0); return;
  }
  app.innerHTML = head + `<div class="wrap">${progressHtml()}<div class="layout"><div>${stepBody()}</div><aside class="side">${summaryHtml(false)}</aside></div>
  ${S.step === 1 ? reviewsHtml() : ''}<footer>© ${new Date().getFullYear()} ${esc(I.shop)} Barber</footer></div>
  ${S.step > 1 ? `<div class="bar"><div>${summaryHtml(true)}${navBtns()}</div></div>` : ''}`;
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
  if (d.act === 'again') { Object.assign(S, { items: [], staff: 'any', date: '', time: '', slots: null, err: '', done: null, step: firstStep() }); window.scrollTo(0, 0); return render(); }
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
  if (el.hasAttribute('data-go')) {
    S.busy = true; S.err = ''; render();
    try {
      const r = await fetch('/api/public/book', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idemKey() }, body: JSON.stringify({ branchId: S.branch, staffId: S.staff, date: S.date, time: S.time, itemIds: S.items, name: S.name, phone: S.phone, email: S.email, preferredCut: S.cut, consent: S.consent }) });
      const j = await r.json();
      if (!r.ok) { S.err = j.error || 'Something went wrong. Please try again.'; S.busy = false; if (r.status === 409) { if (/already used/i.test(j.error || '')) VISIT = newVisit(); S.step = 4; await loadSlots(); S.err = j.error; } return render(); }
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
  .catch(() => { app.innerHTML = '<div class="top"><h1>Brotherhood</h1><p>Could not load. Please try again in a moment.</p></div>'; });
render();
