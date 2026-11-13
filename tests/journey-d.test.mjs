// Journey D (Earnings and loyalty checkpoint): a customer's past visits are carried over, each finished visit adds one point, the customer
// sees the balance and history in the app, asks for a reward at the front desk, the desk redeems it once, and when a visit is later
// voided a reverse row is added (never deleted) and the manager is warned.
import { DatabaseSync } from 'node:sqlite';
import { startServer, checker } from './helper.mjs';
const { ok, done, fail } = checker();
const S = await startServer(3204);
const { call } = S;
try {
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  const st = (await call('GET', '/api/state', null, owner)).j, [A, B] = st.branches, ch = st.chairs.filter(c => c.branchId === A.id);
  await call('PUT', `/api/branches/${A.id}`, { openTime: '00:00', closeTime: '23:59' }, owner);
  await call('PUT', '/api/settings', { attPhoto: false }, owner);
  const trim = (await call('POST', '/api/items', { name: 'Quick Trim', price: 200, type: 'service', mins: 30, bookable: 1, active: 1 }, owner)).j;
  const kev = (await call('POST', '/api/staff', { name: 'Kev', branchId: A.id, chairId: ch[0].id, pct: 40, allowance: 0 }, owner)).j;
  await call('POST', '/api/users', { name: 'Desk Dina', username: 'dina', pin: '111111', role: 'cashier', branchId: A.id }, owner);
  await call('POST', '/api/users', { name: 'Manager Mia', username: 'mia', password: 'miapass1', role: 'manager', branchIds: [A.id] }, owner);
  const desk = (await call('POST', '/api/login', { pin: '111111' })).j.token, mia = (await call('POST', '/api/login', { username: 'mia', password: 'miapass1' })).j.token;
  await call('POST', '/api/attendance', { staffId: kev.id, action: 'in' }, desk);
  const db = new DatabaseSync(S.dbFile, { timeout: 5000 });
  const ana = { name: 'Ana Cruz', phone: '0917 111 2222' };
  const visit = async () => { const id = (await call('POST', '/api/svc/walkin', { ...ana, items: [{ itemId: trim.id, qty: 1 }], barberId: kev.id }, desk)).j.id; await call('POST', `/api/svc/${id}/finish`, { method: 'Cash', barberId: kev.id }, desk); return id; };

  // before the switch: 8 visits under the old program
  const first = await visit(); const cid = db.prepare('select customerId from orders where id=?').get(first).customerId;
  for (let i = 0; i < 7; i++) await visit();
  ok('D1 before the branch is switched on, visits earn nothing in the new ledger', db.prepare('select count(*) n from loyalty_ledger').get().n === 0);
  // go-live: the owner looks at the count, switches the branch on and carries over
  let r = await call('GET', '/api/loyalty/carry-over', null, owner);
  ok('D2 the owner first sees the count: 1 customer, 8 past visits, nobody at 10 yet', r.j.customers === 1 && r.j.visits === 8 && r.j.atLeast[10] === 0, r.j);
  await call('PUT', '/api/settings', { mvpBranches: [A.id] }, owner);
  r = await call('POST', '/api/loyalty/carry-over', { confirm: true }, owner);
  ok('D3 the carry-over gives Ana her 8 past visits as points', r.j.created === 1 && (await call('GET', `/api/loyalty/customers/${cid}`, null, desk)).j.balance === 8);
  // two more visits: +1 each
  const v9 = await visit(), v10 = await visit();
  ok('D4 each finished visit adds one point (10 now)', (await call('GET', `/api/loyalty/customers/${cid}`, null, desk)).j.balance === 10);
  // the customer looks in the app
  const app = (await call('POST', '/api/bh/signup', { name: 'Ana Cruz', email: 'ana@example.com', phone: '0917 111 2222', password: 'password123', agree: true })).j.token;
  db.prepare("update bh_users set customerId=? where email='ana@example.com'").run(cid);
  const p = (await call('GET', '/api/bh/loyalty', null, app)).j.points;
  ok('D5 Ana sees 10 points, the free haircut ready, and her history', p.balance === 10 && p.rewards.find(x => x.points === 10).reachable && p.history.length === 3, p);
  // she asks at the desk; the desk redeems; a double tap counts once
  const k = 'journey-d-redeem-01', two = await Promise.all([1, 2].map(() => call('POST', `/api/loyalty/customers/${cid}/redeem`, { reward: 'haircut', requestKey: k }, desk)));
  ok('D6 the desk redeems the free haircut once (balance 0)', two.every(x => x.s < 300) && (await call('GET', `/api/loyalty/customers/${cid}`, null, desk)).j.balance === 0 && db.prepare("select count(*) n from loyalty_ledger where kind='redeem'").get().n === 1);
  // later, visit 10 turns out to be a mistake and is voided
  await call('POST', `/api/records/${v10}/adjust`, { kind: 'void', reason: 'Entered twice' }, owner);
  const rows = db.prepare('select kind, delta from loyalty_ledger where customerId=? order by createdAt, rowid').all(cid).map(x => x.kind + x.delta);
  ok('D7 a reverse row is added; nothing is deleted', rows.join() === 'carry_over8,earn1,earn1,redeem-10,reverse-1', rows);
  ok('D8 the balance is −1, so rewards are blocked', (await call('GET', `/api/loyalty/customers/${cid}`, null, desk)).j.blocked === true);
  r = await call('GET', `/api/loyalty/warnings?branch=${A.id}`, null, mia);
  ok('D9 the manager is warned; the reward is not taken back', r.j.length === 1 && r.j[0].customerName === 'Ana Cruz' && db.prepare("select count(*) n from loyalty_ledger where kind='redeem'").get().n === 1, r.j);
  db.close();
} catch (e) { fail(e); }
await S.stop();
done();
