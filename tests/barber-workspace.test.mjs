// T26: the barber's day screen. One view with today's bookings, the waiting line, the chair, what he finished and what he earned.
// A barber sees only his own customers plus the unassigned line, and his own earnings (commission), never the shop's takings.
import { startServer, checker, ymd } from './helper.mjs';
const { ok, done, fail } = checker();
const S = await startServer(3186);
const { call } = S;
try {
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  const st = (await call('GET', '/api/state', null, owner)).j, A = st.branches[0], ch = st.chairs.filter(c => c.branchId === A.id);
  const trim = (await call('POST', '/api/items', { name: 'Quick Trim', price: 200, type: 'service', mins: 30, bookable: 1, active: 1 }, owner)).j;
  const kev = (await call('POST', '/api/staff', { name: 'Kev', branchId: A.id, chairId: ch[0].id, pct: 40, allowance: 0 }, owner)).j;
  const leo = (await call('POST', '/api/staff', { name: 'Leo', branchId: A.id, chairId: ch[1].id, pct: 50, allowance: 0 }, owner)).j;
  await call('POST', '/api/users', { name: 'Desk Dina', username: 'dina', pin: '111111', role: 'cashier', branchId: A.id }, owner);
  await call('POST', '/api/users', { name: 'Kev', username: 'kev', pin: '222222', role: 'barber', branchId: A.id, staffId: kev.id }, owner);
  const desk = (await call('POST', '/api/login', { pin: '111111' })).j.token, kevTok = (await call('POST', '/api/login', { pin: '222222' })).j.token;
  await call('PUT', '/api/settings', { attPhoto: false }, owner);
  for (const s of [kev, leo]) await call('POST', '/api/attendance', { staffId: s.id, action: 'in' }, desk);
  const items = [{ itemId: trim.id, qty: 1 }];
  const walk = async (name, o = {}) => (await call('POST', '/api/svc/walkin', { name, items, ...o }, desk)).j.id;
  // Kev finishes one cut (₱200 at 40% = ₱80 for him), Leo finishes one (₱200), one waits for anyone, one waits in Leo's line
  const k1 = await walk('Kev Customer', { barberId: kev.id }); await call('POST', `/api/svc/${k1}/finish`, { method: 'Cash' }, desk);
  const l1 = await walk('Leo Customer', { barberId: leo.id }); await call('POST', `/api/svc/${l1}/finish`, { method: 'Cash' }, desk);
  const l2 = await walk('Leo Now', { barberId: leo.id });
  const anyone = await walk('Anyone'), leoLine = await walk('Leo Next'); await call('PUT', `/api/orders/${leoLine}`, { chairId: ch[1].id }, desk);
  const app = (await call('POST', '/api/bh/signup', { name: 'Ana Reyes', email: 'ana@example.com', phone: '0917 222 3333', password: 'password123', agree: true })).j.token;
  const D = ymd(new Date(Date.now() + 2 * 864e5));
  for (const [s, t, n] of [[kev, '10:00', 1], [leo, '11:00', 2]]) await call('POST', '/api/bh/book', { branchId: A.id, staffId: s.id, itemIds: [trim.id], date: D, time: t }, app, { 'Idempotency-Key': 'workspace-key-00000' + n });
  const { DatabaseSync } = await import('node:sqlite'); const db = new DatabaseSync(S.dbFile, { timeout: 5000 });
  db.prepare("update bookings set date=? where date=?").run(ymd(new Date()), D); db.close();   // both bookings are today

  const kd = (await call('GET', '/api/svc/today', null, kevTok)).j, ids = kd.tickets.map(t => t.id);
  ok("Kev's day: his finished cut and the unassigned line", ids.includes(k1) && ids.includes(anyone), kd.tickets.map(t => t.customerName));
  ok("not Leo's customers (finished, in the chair, or in his line)", !ids.includes(l1) && !ids.includes(l2) && !ids.includes(leoLine));
  ok('only his own booking today', kd.bookings.length === 1 && kd.bookings[0].staffName === 'Kev', kd.bookings);
  ok('his own earnings today: his commission (₱80), not the shop total', kd.myEarnings === 80 && kd.totals.earned === 200, [kd.myEarnings, kd.totals]);
  ok('waiting customers carry an estimate', kd.tickets.find(t => t.id === anyone)?.estimate?.label === 'estimate');
  const dd = (await call('GET', '/api/svc/today', null, desk)).j;
  ok('the front desk sees the whole shop and no barber earnings', dd.tickets.length === 5 && dd.bookings.length === 2 && dd.myEarnings === undefined, [dd.tickets.length, dd.bookings.length, dd.myEarnings]);
  ok("Kev cannot act on Leo's customer", (await call('POST', `/api/svc/${l2}/finish`, { method: 'Cash' }, kevTok)).s === 403);
  ok('Kev cannot close the queue (front desk only)', (await call('POST', '/api/svc/close-queue', { action: 'left' }, kevTok)).s === 403);
} catch (e) { fail(e); }
await S.stop();
done();
