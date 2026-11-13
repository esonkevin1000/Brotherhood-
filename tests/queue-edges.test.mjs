// Queue checkpoint review: edge cases the first Phase 4 tests missed (slow request bodies, chair assignment and D-8, a booked customer
// arriving while his barber cuts, a cut running long, refused moves, least-busy ordering).
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { startServer, checker } from './helper.mjs';
const { ok, done, fail } = checker();
const S = await startServer(3188);
const { call } = S;
const hm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
// a request whose body arrives 300 ms after its headers (a slow phone connection)
const slow = (path, body, tok) => new Promise(resolve => {
  const data = JSON.stringify(body), req = http.request(S.B + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), Authorization: 'Bearer ' + tok } }, res => { let t = ''; res.on('data', d => t += d); res.on('end', () => resolve({ s: res.statusCode, j: JSON.parse(t || '{}') })); });
  req.flushHeaders(); setTimeout(() => req.end(data), 300);
});
try {
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  const st = (await call('GET', '/api/state', null, owner)).j, A = st.branches[0], ch = st.chairs.filter(c => c.branchId === A.id);
  await call('PUT', `/api/branches/${A.id}`, { openTime: '00:00', closeTime: '23:59' }, owner);   // the tests do not depend on the time of day
  const trim = (await call('POST', '/api/items', { name: 'Quick Trim', price: 200, type: 'service', mins: 30, bookable: 1, active: 1 }, owner)).j;
  const kev = (await call('POST', '/api/staff', { name: 'Kev', branchId: A.id, chairId: ch[0].id, pct: 40, allowance: 0 }, owner)).j;
  const leo = (await call('POST', '/api/staff', { name: 'Leo', branchId: A.id, chairId: ch[1].id, pct: 50, allowance: 0 }, owner)).j;
  await call('POST', '/api/users', { name: 'Desk Dina', username: 'dina', pin: '111111', role: 'cashier', branchId: A.id }, owner);
  await call('POST', '/api/users', { name: 'Desk Ella', username: 'ella', pin: '333333', role: 'cashier', branchId: A.id }, owner);
  const desk = (await call('POST', '/api/login', { pin: '111111' })).j.token, ella = (await call('POST', '/api/login', { pin: '333333' })).j.token;
  await call('PUT', '/api/settings', { attPhoto: false }, owner);
  await call('PUT', '/api/settings', { mvpBranches: [A.id] }, owner);
  for (const s of [kev, leo]) await call('POST', '/api/attendance', { staffId: s.id, action: 'in' }, desk);
  const items = [{ itemId: trim.id, qty: 1 }];
  const walk = async (name, o = {}) => (await call('POST', '/api/svc/walkin', { name, items, ...o }, desk)).j.id;
  const db = new DatabaseSync(S.dbFile, { timeout: 5000 });
  const row = id => db.prepare('select * from orders where id=?').get(id);
  const n = new Date(), now = n.getHours() * 60 + n.getMinutes(), today = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  const app = (await call('POST', '/api/bh/signup', { name: 'Ana Reyes', email: 'ana@example.com', phone: '0917 222 3333', password: 'password123', agree: true })).j.token;
  let k = 0;
  const bookToday = async (staff, at) => { const D = new Date(Date.now() + 2 * 864e5), Ds = `${D.getFullYear()}-${String(D.getMonth() + 1).padStart(2, '0')}-${String(D.getDate()).padStart(2, '0')}`;
    const b = (await call('POST', '/api/bh/book', { branchId: A.id, staffId: staff.id, itemIds: [trim.id], date: Ds, time: '10:00' }, app, { 'Idempotency-Key': 'queue-edge-key-00000' + (++k) })).j.booking;
    db.prepare('update bookings set date=?, time=? where id=?').run(today, hm(at), b.id); return b.id; };

  // ---------- B1: slow request bodies ----------
  const w1 = await walk('Slow Start');
  let rs = await Promise.all([slow(`/api/svc/${w1}/start`, { barberId: leo.id }, desk), slow(`/api/svc/${w1}/start`, { barberId: leo.id }, ella)]);
  ok('two starts whose bodies arrive late: still exactly one wins', rs.filter(r => r.s === 200).length === 1 && rs.filter(r => r.s === 409).length === 1, rs.map(r => [r.s, r.j.error]));
  ok('and one "in service" in the history', db.prepare("select count(*) n from order_events where orderId=? and toStatus='in_service'").get(w1).n === 1);
  rs = await Promise.all([slow(`/api/svc/${w1}/finish`, { method: 'Cash' }, desk), slow(`/api/svc/${w1}/finish`, { method: 'GCash' }, ella)]);
  ok('two finishes whose bodies arrive late: exactly one wins', rs.filter(r => r.s === 200).length === 1, rs.map(r => [r.s, r.j.error]));

  // ---------- B4: a cut running long keeps the barber busy ----------
  const long = await walk('Long Cut', { barberId: leo.id });
  db.prepare('update orders set startedAt=? where id=?').run(new Date(Date.now() - 45 * 60e3).toISOString(), long);   // 45 minutes into a 30-minute cut
  let r = await call('GET', `/api/svc/walkin-options?items=${trim.id}`, null, desk);
  const lo = r.j.barbers.find(b => b.staffId === leo.id);
  ok('a barber whose cut runs long is shown busy, not free', lo.busy === true && lo.safe === false, lo);
  await call('POST', `/api/svc/${long}/finish`, { method: 'Cash' }, desk);

  // ---------- least busy first ----------
  r = await call('GET', `/api/svc/walkin-options?items=${trim.id}`, null, desk);
  ok('with two safe barbers, the one with fewer cuts today is offered first', r.j.barbers[0].staffId === kev.id && r.j.barbers.every(b => b.safe), r.j.barbers);

  // ---------- B2: assigning by chair follows D-8 ----------
  const bk1 = await bookToday(kev, now + 10);
  const w2 = await walk('Chair Assign');
  r = await call('PUT', `/api/orders/${w2}`, { chairId: ch[0].id }, desk);
  ok("putting a walk-in on Kev's chair 10 minutes before his booking is refused", r.s === 409 && /booking/.test(r.j.error), r);
  ok('and he keeps waiting, unassigned', row(w2).status === 'waiting' && !row(w2).barberId);
  db.prepare("update bookings set status='cancelled' where id=?").run(bk1);

  // ---------- B3: a booked customer arrives while his barber is cutting ----------
  const cutting = await walk('Kev Cutting', { barberId: kev.id });
  const bk2 = await bookToday(kev, now + 5);
  r = await call('POST', `/api/bookings/${bk2}/arrive`, null, desk);
  const ao = r.j.order?.id;
  ok('the booked customer checks in and stays with Kev, waiting', r.s === 200 && row(ao).barberId === kev.id && row(ao).status === 'waiting', r.j);
  const w3 = await walk('Walk After');
  await call('PUT', `/api/orders/${w3}`, { chairId: ch[0].id }, ella);   // a walk-in put in Kev's line too
  await call('POST', `/api/svc/${cutting}/finish`, { method: 'Cash' }, desk);
  ok('when Kev finishes, the booked customer sits down, not the walk-in', row(ao).status === 'in_chair' && row(w3).status === 'waiting', [row(ao).status, row(w3).status]);
  ok('a walk-in cannot be started with Kev ahead of a checked-in booking', (await call('POST', `/api/svc/${w3}/start`, { barberId: kev.id }, desk)).s === 409);

  // ---------- T22: refused moves ----------
  const bk3 = await bookToday(leo, now + 120);
  await call('PUT', `/api/bookings/${bk3}`, { status: 'cancelled', reason: 'x' }, desk);
  ok('a cancelled booking cannot be checked in', (await call('POST', `/api/bookings/${bk3}/arrive`, null, desk)).s === 409);
  const w4 = await walk('Cancel Me'); await call('POST', `/api/svc/${w4}/cancel`, { reason: 'x' }, desk);
  r = await call('POST', `/api/svc/${w4}/left`, {}, ella);
  ok('a cancelled visit cannot be marked left, and the message says who cancelled it', r.s === 409 && /cancelled by Desk Dina/.test(r.j.error), r);
  db.close();
} catch (e) { fail(e); }
await S.stop();
done();
