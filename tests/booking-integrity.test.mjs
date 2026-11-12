// Slice 1: a booking keeps the price it was made at, a repeated request never makes a second booking,
// one slot can only be booked once however many people try at the same moment, and every status change is in the history.
import { DatabaseSync } from 'node:sqlite';
import { startServer, checker, ymd } from './helper.mjs';
const { ok, done, fail } = checker();
const S = await startServer(3160, { BOOK_LIMIT: '500' });
const { call } = S;
try {
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  const st = (await call('GET', '/api/state', null, owner)).j, br = st.branches[0], ch = st.chairs.filter(c => c.branchId === br.id);
  const vip = st.items.find(i => i.name === 'Vip Compadre');
  const kev = (await call('POST', '/api/staff', { name: 'Kev', branchId: br.id, chairId: ch[0].id, pct: 40, allowance: 0 }, owner)).j;
  const leo = (await call('POST', '/api/staff', { name: 'Leo', branchId: br.id, chairId: ch[1].id, pct: 40, allowance: 0 }, owner)).j;
  await call('POST', '/api/users', { name: 'Desk', username: 'desk1', pin: '111111', role: 'cashier', branchId: br.id }, owner);
  const desk = (await call('POST', '/api/login', { pin: '111111' })).j.token;
  const D = ymd(new Date(Date.now() + 864e5)), D2 = ymd(new Date(Date.now() + 2 * 864e5));
  const body = (o = {}) => ({ branchId: br.id, staffId: kev.id, date: D, time: '10:00', itemIds: [vip.id], name: 'Juan Cruz', phone: '0917 123 4567', ...o });
  const key = n => ({ 'Idempotency-Key': 'test-key-' + String(n).padStart(12, '0') });
  const list = async (d = D) => (await call('GET', `/api/bookings?from=${d}&to=${d}`, null, owner)).j;

  // ---------- the same request again never makes a second booking ----------
  let r = await call('POST', '/api/public/book', body(), null, key(1)); ok('first booking is made', r.s === 201 && r.j.booking.total === vip.price, r.j);
  r = await call('POST', '/api/public/book', body(), null, key(1)); ok('the same request again gives back the same booking (200)', r.s === 200 && r.j.booking.time === '10:00', r);
  r = await call('POST', '/api/public/book', body(), null, key(1)); ok('and a third time too', r.s === 200, r);
  ok('only one booking exists', (await list()).length === 1, (await list()).length);
  r = await call('POST', '/api/public/book', body({ phone: '0918 000 0000', name: 'Someone Else' }), null, key(1)); ok('another person cannot reuse the key to see the booking', r.s === 409 && !r.j.booking, r);
  r = await call('POST', '/api/public/book', body({ time: '14:00' }), null, key(1)); ok('the same key with a different time is refused, not answered with the old booking', r.s === 409 && !r.j.booking && (await list()).length === 1, r);
  { const burst = await Promise.all(Array.from({ length: 20 }, () => call('POST', '/api/public/book', body(), null, key(1)))); ok('20 copies of the same request at once all get the one booking', burst.every(x => x.s === 200) && (await list()).length === 1, burst.map(x => x.s)); }
  r = await call('POST', '/api/public/book', body(), null, key(2)); ok('a new request for the taken slot is refused', r.s === 409 && /no longer available/.test(r.j.error), r);
  r = await call('POST', '/api/public/book', body({ time: '11:00' }), null, { 'Idempotency-Key': 'short' }); ok('a too-short key is ignored, the booking still works', r.s === 201, r);
  r = await call('POST', '/api/public/book', body({ time: '12:00' })); ok('no key at all still works (older app versions)', r.s === 201, r);

  // "any barber" with a double tap used to take two barbers
  r = await call('POST', '/api/public/book', body({ staffId: 'any', date: D2 }), null, key(3));
  const r2 = await call('POST', '/api/public/book', body({ staffId: 'any', date: D2 }), null, key(3));
  ok('"any barber" double tap: one booking, not one per barber', r.s === 201 && r2.s === 200 && (await list(D2)).length === 1, [r.s, r2.s, (await list(D2)).length]);

  // ---------- one slot, many people at the same moment ----------
  const many = await Promise.all(Array.from({ length: 50 }, (_, i) => call('POST', '/api/public/book', body({ staffId: leo.id, time: '15:00', phone: '0917 555 ' + String(1000 + i), name: 'Racer ' + i }), null, key(100 + i))));
  const won = many.filter(x => x.s === 201).length, lost = many.filter(x => x.s === 409).length;
  ok('50 people book the same barber and time at once: exactly 1 gets it', won === 1 && lost === 49, { won, lost, other: many.filter(x => ![201, 409].includes(x.s)).map(x => x.s) });
  ok('and the day shows exactly one booking at that time', (await list()).filter(b => b.time === '15:00' && b.staffId === leo.id).length === 1);

  // ---------- the price is frozen at booking time ----------
  const mine = (await list()).find(b => b.time === '10:00');
  ok('staff see the booking with its price', mine.total === vip.price && mine.items[0].price === vip.price && !('snapshot' in mine) && !('idemKey' in mine), mine);
  await call('PUT', '/api/items/' + vip.id, { price: vip.price + 100, name: 'Vip Compadre Plus' }, owner);
  const after = (await list()).find(b => b.id === mine.id);
  ok('a later price change does not change a booking already made', after.total === vip.price && after.items[0].name === 'Vip Compadre', after);
  r = await call('POST', '/api/public/book', body({ time: '13:00' }), null, key(4)); ok('a new booking gets the new price', r.s === 201 && r.j.booking.total === vip.price + 100, r.j);
  // when the customer arrives, the visit carries the booked price
  r = await call('POST', `/api/bookings/${mine.id}/arrive`, null, desk); ok('arriving creates the visit at the booked price', r.s === 200 && r.j.order.items[0].price === vip.price, r.j);

  // the booked price must survive every later step of the visit (the Today board always re-sends the services when finishing)
  const visit = r.j.order;
  r = await call('PUT', '/api/orders/' + visit.id, { items: [{ itemId: vip.id, qty: 1 }] }, desk); ok('re-saving the services of the visit keeps the booked price', r.s === 200 && r.j.total === vip.price, r.j);
  const amigo = st.items.find(i => i.name === 'Amigo');
  r = await call('POST', `/api/svc/${visit.id}/finish`, { items: [{ itemId: vip.id, qty: 1 }, { itemId: amigo.id, qty: 1 }], method: 'Cash', barberId: kev.id }, desk);
  ok('finishing with the services re-sent charges the booked price; an added service gets today\'s price', r.s === 200 && r.j.status === 'done' && r.j.total === vip.price + amigo.price && r.j.items[0].price === vip.price, r.j);
  // a booked service that the owner switches off later can still be served at the booked price
  const b13 = (await list()).find(b => b.time === '13:00');
  await call('PUT', '/api/items/' + vip.id, { active: 0 }, owner);
  r = await call('POST', `/api/bookings/${b13.id}/arrive`, null, desk); ok('a booked service that was switched off can still arrive', r.s === 200 && r.j.order.items[0].price === vip.price + 100 && r.j.order.items[0].name === 'Vip Compadre Plus', r.j);
  r = await call('POST', `/api/svc/${r.j.order.id}/finish`, { items: [{ itemId: vip.id, qty: 1 }], method: 'GCash', barberId: kev.id }, desk); ok('and be finished at the booked price', r.s === 200 && r.j.total === vip.price + 100, r.j);
  r = await call('POST', '/api/svc/walkin', { name: 'Walk In', items: [{ itemId: vip.id, qty: 1 }], barberId: leo.id }, desk); ok('a walk-in still cannot pick a switched-off service', r.s === 400, r);
  await call('PUT', '/api/items/' + vip.id, { active: 1 }, owner);

  // ---------- history ----------
  let h = (await call('GET', `/api/bookings/${mine.id}/history`, null, owner)).j;
  ok('history: booked, then arrived, with who did it', h.length === 2 && h[0].toStatus === 'booked' && /online/i.test(h[0].actor) && h[1].fromStatus === 'booked' && h[1].toStatus === 'arrived' && h[1].actor === 'Desk', h);
  const b11 = (await list()).find(b => b.time === '11:00');
  r = await call('PUT', '/api/bookings/' + b11.id, { status: 'cancelled', reason: 'Customer called' }, desk);
  h = (await call('GET', `/api/bookings/${b11.id}/history`, null, desk)).j;
  ok('cancelling adds a history row with the reason', r.s === 200 && h.length === 2 && h[1].toStatus === 'cancelled' && h[1].reason === 'Customer called', h);
  const b12 = (await list()).find(b => b.time === '12:00'); await call('PUT', '/api/bookings/' + b12.id, { status: 'noshow' }, owner);
  h = (await call('GET', `/api/bookings/${b12.id}/history`, null, owner)).j; ok('no-show is in the history', h[1]?.toStatus === 'noshow', h);
  r = await call('GET', `/api/bookings/${mine.id}/history`); ok('history needs a staff login', r.s === 401, r.s);
  const other = st.branches[1]; await call('POST', '/api/users', { name: 'Desk2', username: 'desk2', pin: '222222', role: 'cashier', branchId: other.id }, owner);
  const desk2 = (await call('POST', '/api/login', { pin: '222222' })).j.token;
  r = await call('GET', `/api/bookings/${mine.id}/history`, null, desk2); ok('another branch cannot read the history', r.s === 403, r.s);
  // a key from a cancelled booking cannot bring it back
  r = await call('POST', '/api/public/book', body({ time: '11:00' }), null, { 'Idempotency-Key': 'short' }); ok('the freed 11:00 slot can be booked again', r.s === 201, r);

  // staff bookings are protected the same way
  r = await call('POST', '/api/bookings', body({ time: '16:00' }), desk, key(5)); const again = await call('POST', '/api/bookings', body({ time: '16:00' }), desk, key(5));
  ok('front desk double tap: one booking', r.s === 201 && again.s === 200 && again.j.id === r.j.id, [r.s, again.s]);
  h = (await call('GET', `/api/bookings/${r.j.id}/history`, null, desk)).j; ok('a staff booking records who made it', h.length === 1 && h[0].actor === 'Desk', h);

  // ---------- what is stored ----------
  await S.stop();
  const db = new DatabaseSync(S.dbFile), row = db.prepare('select snapshot, idemKey from bookings where id=?').get(mine.id), snap = JSON.parse(row.snapshot);
  ok('the stored snapshot has services, prices, minutes, total, branch and barber', snap.items[0].name === 'Vip Compadre' && snap.items[0].price === vip.price && snap.total === vip.price && snap.mins >= 30 && snap.branchName === br.name && snap.staffName === 'Kev' && !!snap.takenAt, snap);
  ok('the migration is recorded once', db.prepare('select count(*) n from migrations').get().n >= 1 && db.prepare("select count(*) n from migrations where id='001_booking_integrity'").get().n === 1);
  ok('history rows match the status changes', db.prepare('select count(*) n from booking_events where bookingId=?').get(mine.id).n === 2);
  db.close();
} catch (e) { fail(e); }
await S.stop().catch(() => { });
done();
