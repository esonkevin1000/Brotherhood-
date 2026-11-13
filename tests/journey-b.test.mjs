// Journey B (Queue checkpoint): a walk-in arrives at the pilot branch, the front desk registers the name and service, the app lists the
// barbers who can take him without touching a booking, the desk picks one, the customer waits with an estimate, the barber starts,
// finishes, and the visit is recorded.
import { DatabaseSync } from 'node:sqlite';
import { startServer, checker } from './helper.mjs';
const { ok, done, fail } = checker();
const S = await startServer(3187);
const { call } = S;
const hm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
try {
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  const st = (await call('GET', '/api/state', null, owner)).j, A = st.branches[0], ch = st.chairs.filter(c => c.branchId === A.id);
  for (const b of [A]) await call('PUT', `/api/branches/${b.id}`, { openTime: '00:00', closeTime: '23:59' }, owner);   // the test does not depend on the time of day
  const trim = (await call('POST', '/api/items', { name: 'Quick Trim', price: 200, type: 'service', mins: 30, bookable: 1, active: 1 }, owner)).j;
  const kev = (await call('POST', '/api/staff', { name: 'Kev', branchId: A.id, chairId: ch[0].id, pct: 40, allowance: 0 }, owner)).j;
  const leo = (await call('POST', '/api/staff', { name: 'Leo', branchId: A.id, chairId: ch[1].id, pct: 50, allowance: 0 }, owner)).j;
  await call('POST', '/api/users', { name: 'Desk Dina', username: 'dina', pin: '111111', role: 'cashier', branchId: A.id }, owner);
  await call('POST', '/api/users', { name: 'Leo', username: 'leo', pin: '222222', role: 'barber', branchId: A.id, staffId: leo.id }, owner);
  const desk = (await call('POST', '/api/login', { pin: '111111' })).j.token, leoTok = (await call('POST', '/api/login', { pin: '222222' })).j.token;
  await call('PUT', '/api/settings', { attPhoto: false }, owner);
  await call('PUT', '/api/settings', { mvpBranches: [A.id] }, owner);
  for (const s of [kev, leo]) await call('POST', '/api/attendance', { staffId: s.id, action: 'in' }, desk);
  // Kev has a booking in 15 minutes, so a 30-minute walk-in must not go to him; Leo is busy for about 20 more minutes
  const app = (await call('POST', '/api/bh/signup', { name: 'Ana Reyes', email: 'ana@example.com', phone: '0917 222 3333', password: 'password123', agree: true })).j.token;
  const D = new Date(Date.now() + 2 * 864e5), Ds = `${D.getFullYear()}-${String(D.getMonth() + 1).padStart(2, '0')}-${String(D.getDate()).padStart(2, '0')}`;
  const bk = (await call('POST', '/api/bh/book', { branchId: A.id, staffId: kev.id, itemIds: [trim.id], date: Ds, time: '10:00' }, app, { 'Idempotency-Key': 'journey-b-key-000001' })).j.booking;
  const n = new Date(), now = n.getHours() * 60 + n.getMinutes(), today = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  const db = new DatabaseSync(S.dbFile, { timeout: 5000 });
  db.prepare('update bookings set date=?, time=? where id=?').run(today, hm(now + 15), bk.id);
  const busy = (await call('POST', '/api/svc/walkin', { name: 'Already Cutting', items: [{ itemId: trim.id, qty: 1 }], barberId: leo.id }, desk)).j.id;
  db.prepare('update orders set startedAt=? where id=?').run(new Date(Date.now() - 10 * 60e3).toISOString(), busy);

  // B1-B2: the desk registers the walk-in and sees who can take him
  let r = await call('GET', `/api/svc/walkin-options?items=${trim.id}`, null, desk);
  const k = r.j.barbers.find(b => b.staffId === kev.id), l = r.j.barbers.find(b => b.staffId === leo.id);
  ok('B1 neither barber can take a 30-minute walk-in right now: Kev has a booking soon, Leo is cutting', r.s === 200 && !k.safe && !l.safe, r.j);
  ok('B2 each one shows his earliest safe start: Leo in about 20 minutes, Kev after his booking', Math.abs(+l.earliest.slice(3) + 60 * +l.earliest.slice(0, 2) - (now + 20)) <= 2 && k.earliest === hm(now + 45), r.j.barbers);
  r = await call('POST', '/api/svc/walkin', { name: 'Walter Walkin', phone: '0917 555 9999', items: [{ itemId: trim.id, qty: 1 }] }, desk);
  const w = r.j.id;
  ok('B3 the walk-in is registered and waits', r.s === 201 && r.j.plan === 'waiting', r.j);
  // B4: the desk puts him in Leo's line; he waits with an estimate
  r = await call('PUT', `/api/orders/${w}`, { chairId: ch[1].id }, desk);
  ok('B4 he is put in Leo\'s line (assigned)', r.s === 200 && (await call('GET', '/api/svc/today', null, desk)).j.tickets.find(t => t.id === w).plan === 'assigned', r.j);
  const e = (await call('GET', '/api/svc/today', null, desk)).j.tickets.find(t => t.id === w).estimate;
  ok('B5 he sees an estimated start of about 20 minutes, labelled estimate', e?.label === 'estimate' && Math.abs(e.waitMins - 20) <= 2 && e.barber === 'Leo', e);
  ok('B6 he cannot be pushed into Kev\'s chair in front of the booking', (await call('POST', `/api/svc/${w}/start`, { barberId: kev.id }, desk)).s === 409);
  // B7-B8: Leo finishes the current cut; the next in his line sits down; Leo finishes Walter
  await call('POST', `/api/svc/${busy}/finish`, { method: 'Cash' }, leoTok);
  let t = (await call('GET', '/api/svc/today', null, leoTok)).j.tickets.find(x => x.id === w);
  ok('B7 when Leo finishes, Walter sits down with Leo (in service)', t?.plan === 'in_service' && t.barberName === 'Leo', t);
  r = await call('POST', `/api/svc/${w}/finish`, { method: 'GCash' }, leoTok);
  ok('B8 Leo finishes Walter: the visit is completed and recorded', r.s === 200 && r.j.status === 'done' && r.j.total === 200 && r.j.method === 'GCash', r.j);
  const h = (await call('GET', `/api/svc/${w}/history`, null, desk)).j.map(x => x.to);
  ok('B9 the history tells the whole story', h.join() === 'waiting,assigned,in_service,completed', h);
  const c = (await call('GET', '/api/customers?q=Walter', null, owner)).j.rows.find(x => x.name === 'Walter Walkin');
  ok('B10 the visit counts for the customer', c?.visits === 1, c);
  ok('B11 and in Leo\'s earnings today (2 cuts at 50% of ₱200 = ₱200)', (await call('GET', '/api/svc/today', null, leoTok)).j.myEarnings === 200);
  db.close();
} catch (e) { fail(e); }
await S.stop();
done();
