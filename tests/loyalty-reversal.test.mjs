// T37 (L1, D-19): voiding a visit that earned a point adds a reverse row (never a delete). If the customer already spent that point, the
// balance goes below zero: redemption is blocked until it is positive again, and the branch manager sees a warning (the reward is not
// taken back).
import { DatabaseSync } from 'node:sqlite';
import { startServer, checker } from './helper.mjs';
const { ok, done, fail } = checker();
const S = await startServer(3202);
const { call } = S;
try {
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  const st = (await call('GET', '/api/state', null, owner)).j, [A, B] = st.branches, ch = st.chairs.filter(c => c.branchId === A.id);
  await call('PUT', `/api/branches/${A.id}`, { openTime: '00:00', closeTime: '23:59' }, owner);
  await call('PUT', '/api/settings', { attPhoto: false }, owner);
  await call('PUT', '/api/settings', { mvpBranches: [A.id] }, owner);
  const trim = (await call('POST', '/api/items', { name: 'Quick Trim', price: 200, type: 'service', mins: 30, bookable: 1, active: 1 }, owner)).j;
  const kev = (await call('POST', '/api/staff', { name: 'Kev', branchId: A.id, chairId: ch[0].id, pct: 40, allowance: 0 }, owner)).j;
  await call('POST', '/api/users', { name: 'Desk Dina', username: 'dina', pin: '111111', role: 'cashier', branchId: A.id }, owner);
  await call('POST', '/api/users', { name: 'Manager Mia', username: 'mia', password: 'miapass1', role: 'manager', branchIds: [A.id] }, owner);
  await call('POST', '/api/users', { name: 'Manager Max', username: 'max', password: 'maxpass1', role: 'manager', branchIds: [B.id] }, owner);
  const desk = (await call('POST', '/api/login', { pin: '111111' })).j.token, mia = (await call('POST', '/api/login', { username: 'mia', password: 'miapass1' })).j.token, max = (await call('POST', '/api/login', { username: 'max', password: 'maxpass1' })).j.token;
  await call('POST', '/api/attendance', { staffId: kev.id, action: 'in' }, desk);
  const db = new DatabaseSync(S.dbFile, { timeout: 5000 });
  const ana = { name: 'Ana Cruz', phone: '0917 111 2222' };
  const visit = async () => { const id = (await call('POST', '/api/svc/walkin', { ...ana, items: [{ itemId: trim.id, qty: 1 }], barberId: kev.id }, desk)).j.id; await call('POST', `/api/svc/${id}/finish`, { method: 'Cash', barberId: kev.id }, desk); return id; };
  const ledger = cid => db.prepare('select * from loyalty_ledger where customerId=? order by createdAt, rowid').all(cid);

  const v1 = await visit(), cid = db.prepare('select customerId from orders where id=?').get(v1).customerId;
  db.prepare("insert into loyalty_ledger(id,customerId,kind,delta,reason,createdAt) values('p9',?,'adjust',9,'test points','2000-01-01T00:00:00Z')").run(cid);
  ok('the customer has 10 points', (await call('GET', `/api/loyalty/customers/${cid}`, null, desk)).j.balance === 10);
  ok('and redeems a free haircut', (await call('POST', `/api/loyalty/customers/${cid}/redeem`, { reward: 'haircut', requestKey: 'rev-test-key-0001' }, desk)).s === 201);
  // the visit that gave the tenth point is voided
  await call('POST', `/api/records/${v1}/adjust`, { kind: 'void', reason: 'Charged by mistake' }, owner);
  const rev = ledger(cid).filter(e => e.kind === 'reverse');
  ok('voiding it adds one reverse row; the earn row stays', rev.length === 1 && rev[0].delta === -1 && rev[0].orderId === v1 && ledger(cid).some(e => e.kind === 'earn' && e.orderId === v1), ledger(cid));
  const v = (await call('GET', `/api/loyalty/customers/${cid}`, null, desk)).j;
  ok('the balance is now −1 and marked blocked', v.balance === -1 && v.blocked === true, v);
  ok('the reward is not taken back (the redeem row stays)', ledger(cid).filter(e => e.kind === 'redeem').length === 1);
  await visit();
  ok('even after a new visit (balance 0), a reward is refused', (await call('POST', `/api/loyalty/customers/${cid}/redeem`, { reward: 'haircut', requestKey: 'rev-test-key-0002' }, desk)).s === 409);
  db.prepare("insert into loyalty_ledger(id,customerId,kind,delta,reason,createdAt) values('neg',?,'adjust',-5,'test','2000-01-01T00:00:00Z')").run(cid);
  const neg = await call('POST', `/api/loyalty/customers/${cid}/redeem`, { reward: 'haircut', requestKey: 'rev-test-key-0003' }, desk);
  ok('a negative balance says why the reward is blocked', neg.s === 409 && /below zero/.test(neg.j.error || ''), neg.j);

  let r = await call('GET', `/api/loyalty/warnings?branch=${A.id}`, null, mia);
  ok('the branch manager sees a warning: a visit voided after the customer redeemed', r.s === 200 && r.j.length === 1 && r.j[0].customerName === 'Ana Cruz' && r.j[0].orderNo && r.j[0].balance < 0, r.j);
  ok("a manager of another branch does not see it", (await call('GET', `/api/loyalty/warnings?branch=${B.id}`, null, max)).j.length === 0 && (await call('GET', `/api/loyalty/warnings?branch=${A.id}`, null, max)).s === 403);
  ok('the front desk does not get the warnings list', (await call('GET', `/api/loyalty/warnings?branch=${A.id}`, null, desk)).s === 403);
  ok('a void with no redemption since gives no warning', (await (async () => { const v3 = await visit(); await call('POST', `/api/records/${v3}/adjust`, { kind: 'void', reason: 'Test void' }, owner); return (await call('GET', `/api/loyalty/warnings?branch=${A.id}`, null, mia)).j.length === 1; })()));
  db.close();
} catch (e) { fail(e); }
await S.stop();
done();
