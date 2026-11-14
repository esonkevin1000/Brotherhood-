// One booking a day per person (2026-11-14, owner's request): in the app (per account, any shop, any barber) and on the website
// (per mobile number), and when a customer moves a booking. The front desk is not limited. Also: booking a barber for a
// service the owner did not set for him gets a clear answer, and only the owner edits the packages on a barber profile.
import { startServer, checker, ymd } from './helper.mjs';
const { ok, done, fail } = checker();
const S = await startServer(3206), { call } = S;
try {
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  const st = (await call('GET', '/api/state', null, owner)).j, br = st.branches[0], ch = st.chairs.filter(c => c.branchId === br.id);
  const vip = st.items.find(i => i.name === 'Vip Compadre');
  const kev = (await call('POST', '/api/staff', { name: 'Kev', branchId: br.id, chairId: ch[0].id, pct: 40, allowance: 0 }, owner)).j;
  const leo = (await call('POST', '/api/staff', { name: 'Leo', branchId: br.id, chairId: ch[1].id, pct: 40, allowance: 0 }, owner)).j;
  const day = n => ymd(new Date(Date.now() + (3 + n) * 864e5)), D = day(0);
  const ana = (await call('POST', '/api/bh/signup', { name: 'Ana Reyes', email: 'ana@example.com', phone: '0917 222 3333', password: 'password123', agree: true })).j.token;
  const book = (o, n) => call('POST', '/api/bh/book', { branchId: br.id, staffId: kev.id, itemIds: [vip.id], date: D, time: '10:00', ...o }, ana, { 'Idempotency-Key': 'one-a-day-key-000' + n });

  // ---------- the app ----------
  let r = await book({}, 1); ok('the first booking of the day is made', r.s === 201, r.j);
  const first = r.j.booking;
  r = await book({}, 1); ok('the same request again still gives back the same booking', r.s === 200 && r.j.booking.id === first.id, r.j);
  r = await book({ time: '14:00' }, 2); ok('a second booking the same day is refused', r.s === 409 && /One booking per day/.test(r.j.error), r.j);
  r = await book({ staffId: leo.id, time: '15:00' }, 3); ok('also with another barber', r.s === 409 && /One booking per day/.test(r.j.error), r.j);
  r = await book({ date: day(1), time: '14:00' }, 4); ok('another day is fine', r.s === 201, r.j);
  const second = r.j.booking;
  r = await call('POST', `/api/bh/bookings/${second.id}/reschedule`, { date: D, time: '16:00' }, ana);
  ok('moving a booking onto a day that already has one is refused', r.s === 409 && /One booking per day/.test(r.j.error), r.j);
  r = await call('POST', `/api/bh/bookings/${second.id}/reschedule`, { date: day(1), time: '15:00' }, ana);
  ok('moving it to another time on its own day works', r.s === 200, r.j);
  r = await call('POST', `/api/bh/bookings/${first.id}/cancel`, null, ana); ok('after cancelling the first booking…', r.s === 200, r.j);
  r = await book({ time: '14:00' }, 5); ok('…the customer can book that day again', r.s === 201, r.j);

  // ---------- the website (by mobile number) ----------
  const web = o => call('POST', '/api/public/book', { branchId: br.id, staffId: kev.id, date: day(2), time: '10:00', itemIds: [vip.id], name: 'Juan Cruz', phone: '0917 123 4567', ...o });
  r = await web({}); ok('website: first booking of the day', r.s === 201, r.j);
  r = await web({ time: '13:00', staffId: leo.id }); ok('website: a second one the same day with the same number is refused', r.s === 409 && /One booking per day/.test(r.j.error), r.j);
  r = await web({ time: '13:00', phone: '0917 765 4321', name: 'Pedro' }); ok('website: someone else can still book that day', r.s === 201, r.j);
  r = await web({ time: '13:30', phone: '+63 917 123 4567' }); ok('website: the same number written another way is still the same person', r.s === 409 && /One booking per day/.test(r.j.error), r.j);

  // ---------- the front desk is not limited ----------
  await call('POST', '/api/users', { name: 'Desk', username: 'desk1', pin: '111111', role: 'cashier', branchId: br.id }, owner);
  const desk = (await call('POST', '/api/login', { pin: '111111' })).j.token;
  r = await call('POST', '/api/bookings', { branchId: br.id, staffId: leo.id, date: day(2), time: '15:00', itemIds: [vip.id], name: 'Juan Cruz', phone: '0917 123 4567' }, desk);
  ok('the front desk can still add a second booking for a customer', r.s === 201, r.j);

  // ---------- a barber who does not do the service ----------
  const trim = (await call('POST', '/api/items', { name: 'Trim', price: 150, type: 'service', mins: 30, bookable: 1, active: 1 }, owner)).j;
  await call('PUT', `/api/staff/${leo.id}/services`, { itemIds: [trim.id] }, owner);
  r = await web({ date: day(3), staffId: leo.id, phone: '0917 000 1111', name: 'Mario' });
  ok('booking Leo for a service he does not do says so', r.s === 409 && /Leo does not do Vip Compadre/.test(r.j.error), r.j);
  r = await web({ date: day(3), staffId: leo.id, itemIds: [trim.id], phone: '0917 000 1111', name: 'Mario' }); ok('his own service books fine', r.s === 201, r.j);

  // ---------- packages and prices on a barber profile: owner only ----------
  await call('POST', '/api/users', { name: 'Kev', username: 'kev', pin: '222222', role: 'barber', branchId: br.id, staffId: kev.id }, owner);
  const kevTok = (await call('POST', '/api/login', { pin: '222222' })).j.token;
  r = await call('PUT', '/api/bh/pro/offers', { staffId: kev.id, offers: [{ pkg: 'cut', price: 999 }] }, kevTok);
  ok('a barber cannot change the services and prices on his profile', r.s === 403, r.j);
  r = await call('PUT', '/api/bh/pro/offers', { staffId: kev.id, offers: [{ pkg: 'cut', price: 300 }] }, owner);
  ok('the owner can', r.s === 200, r.j);
} catch (e) { fail(e); }
await S.stop(); done();
