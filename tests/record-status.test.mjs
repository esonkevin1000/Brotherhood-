// T28 (D-15, D-9): every completed visit records its source (appointment or walk-in) and a payment status: "reported" when the
// front desk records it, "verified" when the owner, an admin or the branch manager confirms it (optional). Finishing twice makes one record.
import { DatabaseSync } from 'node:sqlite';
import { startServer, checker } from './helper.mjs';
const { ok, done, fail } = checker();
const S = await startServer(3189);
const { call } = S;
try {
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  const st = (await call('GET', '/api/state', null, owner)).j, [A, B] = st.branches, ch = st.chairs.filter(c => c.branchId === A.id);
  for (const b of [A]) await call('PUT', `/api/branches/${b.id}`, { openTime: '00:00', closeTime: '23:59' }, owner);
  const trim = (await call('POST', '/api/items', { name: 'Quick Trim', price: 200, type: 'service', mins: 30, bookable: 1, active: 1 }, owner)).j;
  const kev = (await call('POST', '/api/staff', { name: 'Kev', branchId: A.id, chairId: ch[0].id, pct: 40, allowance: 0 }, owner)).j;
  await call('POST', '/api/users', { name: 'Desk Dina', username: 'dina', pin: '111111', role: 'cashier', branchId: A.id }, owner);
  await call('POST', '/api/users', { name: 'Manager Mia', username: 'mia', password: 'miapass1', role: 'manager', branchIds: [A.id] }, owner);
  await call('POST', '/api/users', { name: 'Manager Max', username: 'max', password: 'maxpass1', role: 'manager', branchIds: [B.id] }, owner);
  const desk = (await call('POST', '/api/login', { pin: '111111' })).j.token, mia = (await call('POST', '/api/login', { username: 'mia', password: 'miapass1' })).j.token, max = (await call('POST', '/api/login', { username: 'max', password: 'maxpass1' })).j.token;
  await call('PUT', '/api/settings', { attPhoto: false }, owner);
  await call('POST', '/api/attendance', { staffId: kev.id, action: 'in' }, desk);
  const items = [{ itemId: trim.id, qty: 1 }];
  const db = new DatabaseSync(S.dbFile, { timeout: 5000 }), row = id => db.prepare('select * from orders where id=?').get(id);
  const ticket = async id => (await call('GET', '/api/svc/today', null, desk)).j.tickets.find(t => t.id === id);

  // ---------- a walk-in ----------
  const w = (await call('POST', '/api/svc/walkin', { name: 'Walk In', items, barberId: kev.id }, desk)).j.id;
  let r = await call('POST', `/api/svc/${w}/finish`, { method: 'GCash' }, desk);
  ok('a finished walk-in is recorded as a walk-in, payment reported', r.s === 200 && row(w).source === 'walkin' && row(w).payStatus === 'reported', [row(w).source, row(w).payStatus]);
  ok('the day board shows it', (await ticket(w)).source === 'walkin' && (await ticket(w)).payStatus === 'reported');
  ok('finishing it again makes no second record', (await call('POST', `/api/svc/${w}/finish`, { method: 'Cash' }, desk)).s === 409 && db.prepare("select count(*) n from orders where id=? and status='paid'").get(w).n === 1);

  // ---------- an appointment ----------
  const app = (await call('POST', '/api/bh/signup', { name: 'Ana Reyes', email: 'ana@example.com', phone: '0917 222 3333', password: 'password123', agree: true })).j.token;
  const D = new Date(Date.now() + 2 * 864e5), Ds = `${D.getFullYear()}-${String(D.getMonth() + 1).padStart(2, '0')}-${String(D.getDate()).padStart(2, '0')}`;
  const bk = (await call('POST', '/api/bh/book', { branchId: A.id, staffId: kev.id, itemIds: [trim.id], date: Ds, time: '10:00' }, app, { 'Idempotency-Key': 'record-status-key-001' })).j.booking;
  const ao = (await call('POST', `/api/bookings/${bk.id}/arrive`, null, desk)).j.order.id;
  if (row(ao).status !== 'in_chair') await call('POST', `/api/svc/${ao}/start`, { barberId: kev.id }, desk);
  await call('POST', `/api/svc/${ao}/finish`, { method: 'Cash' }, desk);
  ok('a finished appointment is recorded as an appointment', row(ao).source === 'appointment' && row(ao).payStatus === 'reported', row(ao).source);

  // ---------- verifying the payment (D-9) ----------
  ok('the front desk cannot verify', (await call('POST', `/api/records/${w}/verify`, null, desk)).s === 403);
  ok("another branch's manager cannot verify", (await call('POST', `/api/records/${w}/verify`, null, max)).s === 403);
  r = await call('POST', `/api/records/${w}/verify`, null, mia);
  ok("the branch's manager verifies it", r.s === 200 && row(w).payStatus === 'verified' && row(w).verifiedBy === 'Manager Mia' && !!row(w).verifiedAt, r);
  ok('verifying again is refused, saying by whom', (r = await call('POST', `/api/records/${w}/verify`, null, owner)).s === 409 && /Manager Mia/.test(r.j.error), r);
  ok('the owner can verify too', (await call('POST', `/api/records/${ao}/verify`, null, owner)).s === 200 && row(ao).payStatus === 'verified');
  const open = (await call('POST', '/api/svc/walkin', { name: 'Not Done', items }, desk)).j.id;
  ok('a visit that is not finished cannot be verified', (await call('POST', `/api/records/${open}/verify`, null, owner)).s === 409);
  ok('the history shows the verification', (await call('GET', `/api/svc/${w}/history`, null, desk)).j.at(-1).reason === 'payment verified');

  // ---------- older records ----------
  ok('every paid visit has a source and a payment status', db.prepare("select count(*) n from orders where status='paid' and (source is null or payStatus is null)").get().n === 0);
  db.close();
} catch (e) { fail(e); }
await S.stop();
done();
