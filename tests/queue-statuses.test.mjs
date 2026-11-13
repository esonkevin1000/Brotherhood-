// T22: plan statuses and check-in. Appointments: confirmed -> checked in -> in service -> completed (or cancelled / no-show).
// Walk-ins: waiting -> assigned -> in service -> completed (or left / cancelled). Only allowed moves work, and each one is in the
// visit's history with who did it.
import { startServer, checker, ymd } from './helper.mjs';
const { ok, done, fail } = checker();
const S = await startServer(3181);
const { call } = S;
let r0;
try {
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  const st = (await call('GET', '/api/state', null, owner)).j, A = st.branches[0], ch = st.chairs.filter(c => c.branchId === A.id);
  const trim = (await call('POST', '/api/items', { name: 'Quick Trim', price: 150, type: 'service', mins: 30, bookable: 1, active: 1 }, owner)).j;
  const kev = (await call('POST', '/api/staff', { name: 'Kev', branchId: A.id, chairId: ch[0].id, pct: 40, allowance: 0 }, owner)).j;
  await call('POST', '/api/users', { name: 'Desk Dina', username: 'dina', pin: '111111', role: 'cashier', branchId: A.id }, owner);
  const desk = (await call('POST', '/api/login', { pin: '111111' })).j.token;
  await call('PUT', '/api/settings', { attPhoto: false }, owner);   // no selfie needed to clock in, for this test
  r0 = await call('POST', '/api/attendance', { staffId: kev.id, action: 'in' }, desk);
  ok('Kev clocks in', r0.s === 200 || r0.s === 201, r0);
  const items = [{ itemId: trim.id, qty: 1 }];
  const plan = async id => (await call('GET', '/api/svc/today', null, desk)).j.tickets.find(t => t.id === id)?.plan;
  const hist = async id => (await call('GET', `/api/svc/${id}/history`, null, desk)).j;

  // ---------- walk-ins ----------
  let r = await call('POST', '/api/svc/walkin', { name: 'Walk One', items, barberId: kev.id }, desk);
  const w1 = r.j.id;
  ok('a walk-in with a free barber goes straight into service', r.s === 201 && await plan(w1) === 'in_service', r.j);
  let h = await hist(w1);
  ok('its history: waiting, then in service, by the front desk', h.map(e => e.to).join() === 'waiting,in_service' && h.every(e => e.actor === 'Desk Dina'), h);
  r = await call('POST', '/api/svc/walkin', { name: 'Walk Two', items }, desk);
  const w2 = r.j.id;
  ok('a walk-in without a barber is waiting', await plan(w2) === 'waiting');
  r = await call('PUT', `/api/orders/${w2}`, { chairId: ch[0].id }, desk);
  ok("put in Kev's line while he is cutting, it is assigned", r.s === 200 && await plan(w2) === 'assigned', r.j);
  ok('the history shows it was assigned to Kev', (await hist(w2)).some(e => e.to === 'assigned' && /Kev/.test(e.reason)));
  r = await call('POST', `/api/svc/${w2}/start`, { barberId: kev.id }, desk);
  ok('it cannot start while Kev is still cutting', r.s === 409 && /Kev/.test(r.j.error), r);
  r = await call('POST', `/api/svc/${w1}/finish`, { method: 'Cash' }, desk);
  ok('Kev finishes the first one: completed', r.s === 200 && await plan(w1) === 'completed' && (await hist(w1)).at(-1).to === 'completed');
  ok('and the next in his line sits down by itself, in the history as the system', await plan(w2) === 'in_service' && (await hist(w2)).at(-1).actor === 'System');
  r = await call('POST', `/api/svc/${w2}/start`, { barberId: kev.id }, desk);
  ok('starting someone already in service is refused, saying who started it', r.s === 409 && /already/i.test(r.j.error), r);
  ok('a completed visit cannot be finished again or cancelled', (await call('POST', `/api/svc/${w1}/finish`, { method: 'Cash' }, desk)).s === 409 && (await call('POST', `/api/svc/${w1}/cancel`, {}, desk)).s === 409);
  r = await call('POST', '/api/svc/walkin', { name: 'Walk Three', items }, desk);
  const w3 = r.j.id;
  ok('a waiting walk-in can be cancelled, then nothing more', (await call('POST', `/api/svc/${w3}/cancel`, { reason: 'Changed mind' }, desk)).s === 200 && await plan(w3) === undefined && (await call('POST', `/api/svc/${w3}/start`, { barberId: kev.id }, desk)).s === 409);
  h = await hist(w3);
  ok('its history ends in cancelled with the reason', h.at(-1).to === 'cancelled' && h.at(-1).reason === 'Changed mind', h);
  r = await call('POST', '/api/svc/walkin', { name: 'Walk Four', items }, desk);
  const w4 = r.j.id;
  await call('POST', `/api/svc/${w2}/finish`, { method: 'Cash' }, desk);
  r = await call('POST', `/api/svc/${w4}/finish`, { method: 'GCash', barberId: kev.id }, desk);
  ok('finishing a waiting walk-in records the start and the finish', r.s === 200 && (await hist(w4)).map(e => e.to).join() === 'waiting,in_service,completed', await hist(w4));

  // ---------- appointments ----------
  const app = (await call('POST', '/api/bh/signup', { name: 'Ana Reyes', email: 'ana@example.com', phone: '0917 222 3333', password: 'password123', agree: true })).j.token;
  const D = ymd(new Date(Date.now() + 2 * 864e5));
  const bk = (await call('POST', '/api/bh/book', { branchId: A.id, staffId: kev.id, itemIds: [trim.id], date: D, time: '10:00' }, app, { 'Idempotency-Key': 'queue-status-key-0001' })).j.booking;
  ok('a booking starts as confirmed', (await call('GET', `/api/bookings?from=${D}&to=${D}`, null, desk)).j.find(b => b.id === bk.id)?.plan === 'confirmed');
  r = await call('POST', `/api/bookings/${bk.id}/arrive`, null, desk);
  const ao = r.j.order.id;
  ok('check-in makes a visit that is checked in (or in service if Kev is free)', ['checked_in', 'in_service'].includes(await plan(ao)), await plan(ao));
  ok('its history starts with checked in, by the front desk', (await hist(ao))[0].to === 'checked_in' && (await hist(ao))[0].actor === 'Desk Dina', await hist(ao));
  ok('checking in twice is refused', (await call('POST', `/api/bookings/${bk.id}/arrive`, null, desk)).s === 409);
  ok('a checked-in customer cannot be marked no-show', (await call('PUT', `/api/bookings/${bk.id}`, { status: 'noshow' }, desk)).s === 409);
  if (await plan(ao) === 'checked_in') await call('POST', `/api/svc/${ao}/start`, { barberId: kev.id }, desk);
  r = await call('POST', `/api/svc/${ao}/finish`, { method: 'Cash' }, desk);
  ok('then in service and completed', r.s === 200 && (await hist(ao)).map(e => e.to).join() === 'checked_in,in_service,completed', await hist(ao));
} catch (e) { fail(e); }
await S.stop();
done();
