// Journey C (Service-records checkpoint, tracking half): a booked customer and a walk-in are served; the front desk records the amount
// and payment (status "reported", D-15); the branch manager verifies one (D-9) and approves a correction; the owner sees the branch
// totals, labelled as an internal record, and can export them for reconciliation.
import { DatabaseSync } from 'node:sqlite';
import { startServer, checker } from './helper.mjs';
const { ok, done, fail } = checker();
const S = await startServer(3193);
const { call } = S;
const LABEL = 'Internal operational record. Not an official receipt or accounting record.';
const hm = d => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`, ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
try {
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  const st = (await call('GET', '/api/state', null, owner)).j, A = st.branches[0], ch = st.chairs.filter(c => c.branchId === A.id);
  await call('PUT', `/api/branches/${A.id}`, { openTime: '00:00', closeTime: '23:59' }, owner);
  const trim = (await call('POST', '/api/items', { name: 'Quick Trim', price: 200, type: 'service', mins: 30, bookable: 1, active: 1 }, owner)).j;
  const kev = (await call('POST', '/api/staff', { name: 'Kev', branchId: A.id, chairId: ch[0].id, pct: 40, allowance: 0 }, owner)).j;
  const leo = (await call('POST', '/api/staff', { name: 'Leo', branchId: A.id, chairId: ch[1].id, pct: 50, allowance: 0 }, owner)).j;
  await call('POST', '/api/users', { name: 'Desk Dina', username: 'dina', pin: '111111', role: 'cashier', branchId: A.id }, owner);
  await call('POST', '/api/users', { name: 'Manager Mia', username: 'mia', password: 'miapass1', role: 'manager', branchIds: [A.id] }, owner);
  const desk = (await call('POST', '/api/login', { pin: '111111' })).j.token, mia = (await call('POST', '/api/login', { username: 'mia', password: 'miapass1' })).j.token;
  await call('PUT', '/api/settings', { attPhoto: false }, owner);
  await call('PUT', '/api/settings', { mvpBranches: [A.id] }, owner);
  for (const s of [kev, leo]) await call('POST', '/api/attendance', { staffId: s.id, action: 'in' }, desk);
  const db = new DatabaseSync(S.dbFile, { timeout: 5000 }), row = id => db.prepare('select * from orders where id=?').get(id);

  // a booking for later today, made in the app
  const app = (await call('POST', '/api/bh/signup', { name: 'Ana Reyes', email: 'ana@example.com', phone: '0917 222 3333', password: 'password123', agree: true })).j.token;
  const D = new Date(Date.now() + 2 * 864e5);
  const bk = (await call('POST', '/api/bh/book', { branchId: A.id, staffId: kev.id, itemIds: [trim.id], date: ymd(D), time: '10:00' }, app, { 'Idempotency-Key': 'journey-c-key-000001' })).j.booking;
  db.prepare('update bookings set date=?, time=? where id=?').run(ymd(new Date()), hm(new Date(Date.now() + 5 * 60e3)), bk.id);

  // C1: the booked customer arrives and is served; the front desk records the amount and payment
  let r = await call('POST', `/api/bookings/${bk.id}/arrive`, null, desk);
  const appt = r.j.order?.id;
  if (r.j.order && r.j.order.status !== 'in_chair') await call('POST', `/api/svc/${appt}/start`, { barberId: kev.id }, desk);
  r = await call('POST', `/api/svc/${appt}/finish`, { method: 'GCash' }, desk);
  ok('C1 the booked visit is finished; source appointment, payment reported, by the front desk', r.s === 200 && row(appt).source === 'appointment' && row(appt).payStatus === 'reported' && row(appt).status === 'paid', row(appt));
  // C2: a walk-in with Leo
  const walk = (await call('POST', '/api/svc/walkin', { name: 'Walter Walkin', items: [{ itemId: trim.id, qty: 1 }], barberId: leo.id }, desk)).j.id;
  await call('POST', `/api/svc/${walk}/finish`, { method: 'Cash' }, desk);
  ok('C2 the walk-in is recorded as a walk-in', row(walk).source === 'walkin' && row(walk).payStatus === 'reported');

  // C3: the manager verifies the GCash payment
  r = await call('POST', `/api/records/${appt}/verify`, {}, mia);
  ok('C3 the branch manager verifies the GCash payment', r.s === 200 && row(appt).payStatus === 'verified' && row(appt).verifiedBy === 'Manager Mia', r.j);
  // C4: the walk-in was charged ₱180, not ₱200: the desk asks, the manager approves
  r = await call('POST', `/api/records/${walk}/adjust`, { kind: 'amount', after: 180, reason: 'Customer paid 180 (promo)' }, desk);
  ok('C4 the front desk asks for a correction; the record is unchanged until approved', r.s === 201 && row(walk).total === 200);
  await call('POST', `/api/adjustments/${r.j.adjustment.id}/approve`, { approve: true }, mia);
  ok('C5 the manager approves it; the record now shows ₱180', row(walk).total === 180);

  // C6: the owner sees the branch totals, labelled as internal
  const date = row(appt).date, rep = (await call('GET', `/api/reports/records?branch=${A.id}&from=${date}&to=${date}`, null, owner)).j;
  const card = l => rep.cards.find(c => c.label === l)?.value;
  ok('C6 the owner sees the totals: ₱380 from 2 visits, 1 booked, 1 walk-in, half verified', card('Recorded value') === 380 && card('Visits') === 2 && card('From appointments') === 1 && card('Walk-ins') === 1 && card('Verified payments') === '50%', rep.cards);
  ok('C7 labelled as an internal record, with the branch and date', rep.label === LABEL && rep.filters.branch === A.name && rep.filters.from === date);
  // C8: and exports them for reconciliation; the export is audited
  const csv = String((await call('GET', `/api/records/export?branch=${A.id}&from=${date}&to=${date}`, null, owner)).j);
  ok('C8 the reconciliation export lists both, with the correction', csv.includes(LABEL) && csv.includes('Appointment') && csv.includes('Walk-in') && /amount ₱200 → ₱180/.test(csv) && db.prepare("select count(*) n from audit where action='records-exported'").get().n === 1);
  // C9: the front desk sees the day, not the reports
  ok('C9 the front desk cannot open the reports', (await call('GET', '/api/reports/records', null, desk)).s === 403);
  db.close();
} catch (e) { fail(e); }
await S.stop();
done();
