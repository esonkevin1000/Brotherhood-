// Brotherhood — public booking page. Customers pick branch, services, barber, time; the booking lands in the POS.
const app = document.getElementById('app');
const peso = n => '₱' + Number(n || 0).toLocaleString('en-PH');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initials = s => String(s || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const t12 = t => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}`; };
const ICON = {
  scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>', pin: '<path d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>'
};
const ic = n => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICON[n]}</svg>`;

let I = null;
const S = { pickBranch: false, branch: '', items: [], staff: 'any', date: '', time: '', slots: null, name: '', phone: '', notes: '', err: '', busy: false, done: null };
const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(Date.now() + i * 864e5); return { v: ymd(d), l: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-PH', { weekday: 'short' }), s: d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) }; });

const svcs = () => I.services.filter(s => S.items.includes(s.id));
const total = () => svcs().reduce((t, s) => t + s.price, 0), mins = () => Math.max(30, svcs().reduce((t, s) => t + (s.mins || 30), 0));
const team = () => I.staff.filter(s => s.branchId === S.branch);
const ready = () => S.branch && S.items.length && S.date && S.time && S.name.trim() && S.phone.replace(/\D/g, '').length >= 10;

async function loadSlots() {
  S.time = ''; S.slots = null;
  if (!S.branch || !S.items.length || !S.date) return render();
  render();
  try { S.slots = (await (await fetch(`/api/public/slots?branch=${S.branch}&date=${S.date}&staff=${S.staff}&items=${S.items.join(',')}`)).json()).slots; } catch (e) { S.slots = []; }
  render();
}
const pic = (url, name, cls = 'av') => url ? `<img class="${cls}" src="${esc(url)}" alt="${esc(name)}" loading="lazy">` : `<span class="${cls}">${esc(initials(name))}</span>`;

function render() {
  if (!I) { app.innerHTML = '<div class="top"><h1>Brotherhood</h1><p>Loading…</p></div>'; return; }
  const head = `<div class="top"><img src="/icon-192.png" alt=""><h1>${esc(I.shop)}</h1><p>Book your cut. Walang pila, walang hintay.</p></div>`;
  if (S.done) {
    const b = S.done, when = new Date(b.date + 'T00:00').toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' });
    app.innerHTML = head + `<main><div class="step done"><div class="tick">${ic('check')}</div><h2>Booked!</h2><p class="mute">Salamat, ${esc(b.name)}. Hinihintay ka namin.</p>
      <div class="recap"><div class="who">${pic(b.staffPhoto, b.staff, 'ph')}<div><b>${esc(b.staff)}</b><br><span class="mute" style="all:unset;color:var(--mute)">your barber</span></div></div>
      <div class="r"><span class="mute">When</span><b>${esc(when)}, ${t12(b.time)}</b></div><div class="r"><span class="mute">Where</span><b>${esc(b.branch)}</b></div>
      ${b.items.map(i => `<div class="r"><span>${esc(i.name)}</span><span>${peso(i.price)}</span></div>`).join('')}<div class="r"><b>Total (bayad sa shop)</b><b>${peso(b.total)}</b></div></div>
      <p class="mute" style="font-size:13px">Pumunta 5–10 minuto bago ang oras. Kung hindi ka makakarating, tawagan ang shop para mabigyan ng slot ang iba.</p>
      <button class="go" id="again">Book another</button></div></main>`;
    document.getElementById('again').onclick = () => { Object.assign(S, { items: [], staff: 'any', date: '', time: '', slots: null, notes: '', err: '', done: null }); render(); };
    return;
  }
  const brs = I.branches, mates = team();
  const sum = S.items.length ? `${S.items.length} service${S.items.length > 1 ? 's' : ''} · ${mins()} min` : 'Pumili ng serbisyo';
  app.innerHTML = head + `<main>
    ${brs.length > 1 && S.branch && !S.pickBranch ? `<section class="step"><h2><b>1</b>Branch</h2><button class="opt on" data-pickbranch="1"><span class="pic">${ic('pin')}</span><span><span class="nm">${esc(brs.find(b => b.id === S.branch).name)}</span><small>${esc(brs.find(b => b.id === S.branch).address || 'Brotherhood Barbershop')}</small></span><span class="pr" style="font:600 13px Inter;color:var(--mute)">Palitan</span></button></section>` : brs.length > 1 ? `<section class="step"><h2><b>1</b>Branch</h2>${brs.map(b => `<button class="opt ${S.branch === b.id ? 'on' : ''}" data-branch="${b.id}"><span class="pic">${ic('pin')}</span><span><span class="nm">${esc(b.name)}</span><small>${esc(b.address || 'Brotherhood Barbershop')}</small></span><span class="ck">${S.branch === b.id ? ic('check') : ''}</span></button>`).join('')}</section>` : ''}
    <section class="step ${S.branch ? '' : 'off'}"><h2><b>${brs.length > 1 ? 2 : 1}</b>Services</h2>${I.services.map(s => `<button class="opt ${S.items.includes(s.id) ? 'on' : ''}" data-svc="${s.id}">${s.photo ? `<img class="pic" src="${esc(s.photo)}" alt="" loading="lazy">` : `<span class="pic">${ic('scissors')}</span>`}<span><span class="nm">${esc(s.name)}</span>${s.apptOnly ? '<span class="tag">By appointment</span>' : ''}<small>${s.mins} min</small></span><span class="pr">${peso(s.price)}</span><span class="ck">${S.items.includes(s.id) ? ic('check') : ''}</span></button>`).join('') || '<p class="mute">Walang available na serbisyo.</p>'}</section>
    <section class="step ${S.branch && S.items.length ? '' : 'off'}"><h2><b>${brs.length > 1 ? 3 : 2}</b>Piliin ang barber</h2><div class="team">
      <button class="mate ${S.staff === 'any' ? 'on' : ''}" data-staff="any"><span class="av">${ic('scissors')}</span><b>Kahit sino</b><small>Pinakamabilis</small></button>
      ${mates.map(m => `<button class="mate ${S.staff === m.id ? 'on' : ''}" data-staff="${m.id}">${pic(m.photo, m.name)}<b>${esc(m.name)}</b></button>`).join('')}</div></section>
    <section class="step ${S.branch && S.items.length ? '' : 'off'}"><h2><b>${brs.length > 1 ? 4 : 3}</b>Petsa at oras</h2>
      <div class="chips">${days.map(d => `<button class="chip ${S.date === d.v ? 'on' : ''}" data-date="${d.v}">${d.l}<small>${d.s}</small></button>`).join('')}</div>
      ${!S.date ? '<p class="mute" style="margin:6px 0 0">Pumili ng petsa.</p>' : S.slots === null ? '<p class="mute">Hinahanap ang mga bakanteng oras…</p>' : S.slots.length ? `<div class="slots">${S.slots.map(t => `<button class="chip ${S.time === t ? 'on' : ''}" data-time="${t}">${t12(t)}</button>`).join('')}</div>` : '<p class="mute">Walang bakanteng oras sa petsang ito. Subukan ang ibang araw o ibang barber.</p>'}</section>
    <section class="step ${S.time ? '' : 'off'}"><h2><b>${brs.length > 1 ? 5 : 4}</b>Iyong detalye</h2>
      <label>Pangalan</label><input id="name" value="${esc(S.name)}" autocomplete="name"><label>Mobile number</label><input id="phone" type="tel" inputmode="tel" placeholder="09XX XXX XXXX" value="${esc(S.phone)}" autocomplete="tel">
      <label>Paalala (optional)</label><textarea id="notes" rows="2" placeholder="Hal. low fade, no.2 sa gilid">${esc(S.notes)}</textarea></section>
  </main>
  <div class="bar"><div><div class="sum"><span>${sum}</span><b>${peso(total())}</b></div><div class="err">${esc(S.err)}</div><button class="go" id="go" ${ready() && !S.busy ? '' : 'disabled'}>${S.busy ? 'Sandali…' : 'Confirm booking'}</button></div></div>`;
}

document.addEventListener('click', async e => {
  const el = e.target.closest('[data-pickbranch],[data-branch],[data-svc],[data-staff],[data-date],[data-time],#go'); if (!el) return;
  const d = el.dataset;
  if (d.pickbranch) { S.pickBranch = true; return render(); }
  if (d.branch) { S.pickBranch = false; S.branch = d.branch; S.staff = 'any'; S.err = ''; return loadSlots(); }
  if (d.svc) { S.items = S.items.includes(d.svc) ? S.items.filter(x => x !== d.svc) : [...S.items, d.svc]; S.err = ''; return loadSlots(); }
  if (d.staff) { S.staff = d.staff; return loadSlots(); }
  if (d.date) { S.date = d.date; return loadSlots(); }
  if (d.time) { S.time = d.time; S.err = ''; render(); document.getElementById('name')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
  if (el.id === 'go') {
    S.busy = true; S.err = ''; render();
    try {
      const r = await fetch('/api/public/book', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ branchId: S.branch, staffId: S.staff, date: S.date, time: S.time, itemIds: S.items, name: S.name, phone: S.phone, notes: S.notes }) });
      const j = await r.json();
      if (!r.ok) { S.err = j.error || 'May problema. Subukan ulit.'; S.busy = false; if (r.status === 409) { await loadSlots(); S.err = j.error; render(); } else render(); return; }
      S.done = j.booking; S.busy = false; window.scrollTo(0, 0); render();
    } catch (x) { S.err = 'Walang koneksyon. Subukan ulit.'; S.busy = false; render(); }
  }
});
document.addEventListener('input', e => {
  const t = e.target; if (!['name', 'phone', 'notes'].includes(t.id)) return;
  S[t.id] = t.value; const go = document.getElementById('go'); if (go) go.disabled = !ready() || S.busy;
});

fetch('/api/public/info').then(r => r.json()).then(j => { I = j; if (I.branches.length === 1) S.branch = I.branches[0].id; render(); }).catch(() => { app.innerHTML = '<div class="top"><h1>Brotherhood</h1><p>Hindi ma-load. Subukan ulit mamaya.</p></div>'; });
render();
