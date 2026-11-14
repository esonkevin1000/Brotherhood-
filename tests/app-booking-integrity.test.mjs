// Slice 1 in the customer app (/api/bh): a repeated booking request gives back the same booking, repeat series stay intact,
// the customer's own cancel is in the history, and a partner shop's database gets the same protection.
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { startServer, checker, ymd } from './helper.mjs';
const { ok, done, fail } = checker();
const S = await startServer(3161, { SIGNUPS_OPEN: '1' });
const { call } = S;
try {
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  const st = (await call('GET', '/api/state', null, owner)).j, br = st.branches[0], ch = st.chairs.filter(c => c.branchId === br.id);
  const vip = st.items.find(i => i.name === 'Vip Compadre');
  const kev = (await call('POST', '/api/staff', { name: 'Kev', branchId: br.id, chairId: ch[0].id, pct: 40, allowance: 0 }, owner)).j;
  await call('POST', '/api/staff', { name: 'Leo', branchId: br.id, chairId: ch[1].id, pct: 40, allowance: 0 }, owner);
  let r = await call('POST', '/api/bh/signup', { name: 'Ana Reyes', email: 'ana@example.com', phone: '0917 222 3333', password: 'password123', agree: true });
  ok('a customer signs up in the app', r.s === 200 || r.s === 201, r); const ana = r.j.token;
  // one booking a day per account: each part below uses its own day (D, E, F, ...)
  const D = ymd(new Date(Date.now() + 3 * 864e5)), dayAfter = n => ymd(new Date(new Date(D + 'T00:00:00').getTime() + n * 864e5)), E = dayAfter(1), key = n => ({ 'Idempotency-Key': 'app-key-' + String(n).padStart(12, '0') });
  const body = (o = {}) => ({ branchId: br.id, staffId: 'any', itemIds: [vip.id], date: D, time: '10:00', ...o });
  const mine = async () => (await call('GET', '/api/bh/bookings', null, ana)).j;

  r = await call('POST', '/api/bh/book', body(), ana, key(1)); ok('app booking is made', r.s === 201 && r.j.booking.total === vip.price, r);
  const first = r.j.booking;
  r = await call('POST', '/api/bh/book', body(), ana, key(1)); ok('the same request again gives back the same booking', r.s === 200 && r.j.booking.id === first.id && r.j.duplicate === true, r);
  const all1 = (await call('GET', `/api/bookings?from=${D}&to=${D}`, null, owner)).j; ok('one booking, one barber', all1.length === 1, all1.length);
  const notifs = (await call('GET', '/api/bh/notifications', null, ana)).j; ok('the customer is told once, not twice', JSON.stringify(notifs).split('Booked:').length - 1 === 1, JSON.stringify(notifs).slice(0, 300));

  // repeat series: every 2 weeks, 3 cuts, sent twice
  const rb = body({ date: E, time: '14:00', repeatEvery: 2, repeatCount: 3 });
  r = await call('POST', '/api/bh/book', rb, ana, key(2)); ok('a repeat series books 3 cuts', r.s === 201 && r.j.series.filter(x => x.ok).length === 2, r.j);
  r = await call('POST', '/api/bh/book', rb, ana, key(2)); ok('sending the series again makes nothing new', r.s === 200, r.j);
  const D14 = dayAfter(15), D28 = dayAfter(29);
  const cnt = async d => (await call('GET', `/api/bookings?from=${d}&to=${d}`, null, owner)).j.filter(b => b.time === '14:00').length;
  ok('exactly one booking on each of the 3 dates', await cnt(E) === 1 && await cnt(D14) === 1 && await cnt(D28) === 1, [await cnt(E), await cnt(D14), await cnt(D28)]);

  // the customer cancels in the app, then books the same slot again
  r = await call('POST', `/api/bh/bookings/${first.id}/cancel`, null, ana); ok('the customer cancels in the app', r.s === 200, r);
  const h = (await call('GET', `/api/bookings/${first.id}/history`, null, owner)).j;
  ok('history shows booked by the customer, then cancelled by the customer', h.length === 2 && /app/i.test(h[0].actor) && h[1].toStatus === 'cancelled' && /app/i.test(h[1].actor), h);
  r = await call('POST', '/api/bh/book', body(), ana, key(1)); ok('the old key does not bring a cancelled booking back as a success', r.s === 409 && !r.j.booking, r);
  r = await call('POST', '/api/bh/book', body(), ana, key(11)); ok('booking the freed slot again with a fresh key works (the app renews its key after every success)', r.s === 201 && r.j.booking.id !== first.id, r);
  r = await call('POST', '/api/bh/book', body({ date: dayAfter(2), time: '11:00' }), ana); ok('no key still works (older app versions)', r.s === 201, r);

  // ---------- a partner shop has its own database: same protection there ----------
  r = await call('POST', '/api/public/signup', { kind: 'suite', shopName: 'Solo Cuts', ownerName: 'Rico Solo', email: 'rico@solo.ph', phone: '0917 999 8888', city: 'Lipa', username: 'rico', password: 'secret123', agree: true });
  ok('a partner shop exists', r.s === 201, r); const ptk = r.j.token;
  const pst = (await call('GET', '/api/state', null, ptk)).j, pbr = pst.branches[0], pit = pst.items[0], pbarber = pst.staff[0];
  const pb = { branchId: pbr.id, staffId: pbarber.id, date: D, time: '10:00', itemIds: [pit.id], name: 'Walk Up', phone: '0917 111 0000' };
  r = await call('POST', '/api/bookings', pb, ptk, key(9)); const again = await call('POST', '/api/bookings', pb, ptk, key(9));
  ok('partner shop: double tap makes one booking', r.s === 201 && again.s === 200 && again.j.id === r.j.id, [r, again]);
  await call('PUT', '/api/items/' + pit.id, { price: pit.price + 50 }, ptk);
  const pl = (await call('GET', `/api/bookings?from=${D}&to=${D}`, null, ptk)).j; ok('partner shop: the booked price is kept after a price change', pl.length === 1 && pl[0].total === pit.price, pl);
  const ph = (await call('GET', `/api/bookings/${r.j.id}/history`, null, ptk)).j; ok('partner shop: history is recorded', ph.length === 1 && ph[0].toStatus === 'booked', ph);
  r = await call('GET', `/api/bookings/${first.id}/history`, null, ptk); ok('a partner shop cannot read Brotherhood booking history', r.s === 404, r.s);
  // the app books at the partner shop
  r = await call('POST', '/api/bh/book', { branchId: pbr.id, staffId: pbarber.id, itemIds: [pit.id], date: dayAfter(3), time: '13:00' }, ana, key(10));
  const r2 = await call('POST', '/api/bh/book', { branchId: pbr.id, staffId: pbarber.id, itemIds: [pit.id], date: dayAfter(3), time: '13:00' }, ana, key(10));
  ok('the app books at a partner shop once, even when sent twice', r.s === 201 && r2.s === 200 && r2.j.booking.id === r.j.booking.id, [r, r2]);

  await S.stop();
  const orgId = new DatabaseSync(S.dbFile, { timeout: 5000 }).prepare("select id from orgs where code='solo-cuts'").get().id, odb = new DatabaseSync(path.join(S.dbDir, `org-${orgId}.db`));
  ok('the partner database has its own migration record', odb.prepare("select count(*) n from migrations where id='001_booking_integrity'").get().n === 1);
  ok('and its own snapshots', odb.prepare('select count(*) n from bookings where snapshot is not null').get().n === 2, odb.prepare('select count(*) n from bookings where snapshot is not null').get().n);
  odb.close();

  // ---------- a partner database that is damaged must not break Brotherhood or the customer app ----------
  const fs = await import('node:fs');
  fs.writeFileSync(path.join(S.dbDir, `org-${orgId}.db`), 'this is not a database file, it is damaged'.repeat(200));
  const S2 = await startServer(3161, { SIGNUPS_OPEN: '1' }, S.dbDir), c2 = S2.call;
  const owner2 = (await c2('POST', '/api/login', { password: 'ownerpw' })).j.token;
  ok('Brotherhood still starts and the owner can log in', !!owner2);
  r = await c2('GET', '/api/orgs', null, owner2); ok('the owner sees the partner list with the broken shop marked', r.s === 200 && r.j.find(o => o.code === 'solo-cuts')?.status.state === 'error', r);
  r = await c2('GET', '/api/bh/bookings', null, ana); ok('the customer app still shows the customer their Brotherhood bookings', r.s === 200 && JSON.stringify(r.j).includes(D), r.s);
  r = await c2('GET', '/api/bh/discover'); ok('Discover still loads', r.s === 200, r.s);
  r = await c2('POST', '/api/bh/book', body({ date: dayAfter(4), time: '15:00' }), ana, key(20)); ok('booking at Brotherhood still works', r.s === 201, r);
  r = await c2('POST', '/api/login', { username: 'rico', password: 'secret123' }, null, { 'x-org': 'solo-cuts' }); ok('the broken shop gets a clear "temporarily unavailable" answer, not a crash', r.s === 503 && /temporarily unavailable/.test(r.j.error), r);
  await S2.stop();
} catch (e) { fail(e); }
await S.stop().catch(() => { });
done();
