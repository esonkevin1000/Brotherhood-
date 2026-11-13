// T38 (L4, D-3, D-3a): carry-over of past visits. First a read-only count of how many customers start at or above 10, 15, 25, 40 and 50
// points (for stock planning). Then, only on the owner's explicit go, one carry-over row per customer equal to the past paid visits that
// did not already earn a point in the ledger. Running it twice changes nothing.
import { DatabaseSync } from 'node:sqlite';
import { startServer, checker } from './helper.mjs';
const { ok, done, fail } = checker();
const S = await startServer(3203);
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
  const desk = (await call('POST', '/api/login', { pin: '111111' })).j.token, mia = (await call('POST', '/api/login', { username: 'mia', password: 'miapass1' })).j.token;
  await call('POST', '/api/attendance', { staffId: kev.id, action: 'in' }, desk);
  const db = new DatabaseSync(S.dbFile, { timeout: 5000 });

  // past visits from before the new ledger (older records in another branch), plus some that do not count
  const cust = (id, name) => db.prepare('insert into customers(id,name,phone,email,notes,createdAt) values(?,?,?,?,?,?)').run(id, name, '', '', '', '2025-01-01T00:00:00Z');
  let n = 1000; const past = (cid, k, status = 'paid') => { for (let i = 0; i < k; i++) db.prepare("insert into orders(id,no,branchId,date,customerId,customerName,status,items,tenders,subtotal,total,createdAt,paidAt) values(?,?,?,?,?,?,?,'[]','[]',200,200,?,?)").run('past' + (n++), n, B.id, '2025-06-01', cid, cid, status, '2025-06-01T10:00:00Z', status === 'paid' ? '2025-06-01T10:30:00Z' : ''); };
  db.exec('begin immediate');   // one short write lock, so the running server is not kept waiting
  for (const [id, name, k] of [['cana', 'Ana', 12], ['cben', 'Ben', 26], ['ccy', 'Cy', 41], ['cdee', 'Dee', 3], ['ceve', 'Eve', 55]]) { cust(id, name); past(id, k); }
  past('cdee', 5, 'void'); past('cdee', 4, 'left');   // these never count
  db.exec('commit');
  // Ana also had one visit in the pilot branch, which already earned a point: it must not be counted twice
  const anaVisit = (await call('POST', '/api/svc/walkin', { name: 'Ana', items: [{ itemId: trim.id, qty: 1 }], barberId: kev.id }, desk)).j.id;
  db.prepare("update orders set customerId='cana' where id=?").run(anaVisit);
  await call('POST', `/api/svc/${anaVisit}/finish`, { method: 'Cash', barberId: kev.id }, desk);
  ok('the pilot visit earned its point', db.prepare("select count(*) n from loyalty_ledger where customerId='cana' and kind='earn'").get().n === 1);

  let r = await call('GET', '/api/loyalty/carry-over', null, owner);
  ok('the read-only count: customers starting at or above each reward', r.s === 200 && r.j.customers === 5 && r.j.atLeast[10] === 4 && r.j.atLeast[15] === 3 && r.j.atLeast[25] === 3 && r.j.atLeast[40] === 2 && r.j.atLeast[50] === 1 && r.j.done === false, r.j);
  ok('the count writes nothing', db.prepare("select count(*) n from loyalty_ledger where kind='carry_over'").get().n === 0);
  ok('a manager cannot see or run it', (await call('GET', '/api/loyalty/carry-over', null, mia)).s === 403 && (await call('POST', '/api/loyalty/carry-over', { confirm: true }, mia)).s === 403);
  ok('running it needs an explicit go', (await call('POST', '/api/loyalty/carry-over', {}, owner)).s === 400);

  r = await call('POST', '/api/loyalty/carry-over', { confirm: true }, owner);
  const rows = Object.fromEntries(db.prepare("select customerId, delta from loyalty_ledger where kind='carry_over'").all().map(x => [x.customerId, x.delta]));
  ok('one carry-over row per customer, equal to the past paid visits', r.s === 200 && r.j.created === 5 && rows['cana'] === 12 && rows['cben'] === 26 && rows['ccy'] === 41 && rows['cdee'] === 3 && rows['ceve'] === 55, [r.j, rows]);
  ok("Ana's pilot visit is not counted twice: 12 carried + 1 earned = 13", (await call('GET', '/api/loyalty/customers/cana', null, desk)).j.balance === 13);
  ok('a customer at 55 is VIP right away (D-3a)', (await call('GET', '/api/loyalty/customers/ceve', null, desk)).j.vip === true);
  ok('and can claim a reward on the first day', (await call('POST', '/api/loyalty/customers/cben/redeem', { reward: 'cap', requestKey: 'carry-claim-key-1' }, desk)).s === 201);
  r = await call('POST', '/api/loyalty/carry-over', { confirm: true }, owner);
  ok('running it twice changes nothing', r.s === 200 && r.j.created === 0 && db.prepare("select count(*) n from loyalty_ledger where kind='carry_over'").get().n === 5);
  ok('the count now says it was done', (await call('GET', '/api/loyalty/carry-over', null, owner)).j.done === true);
  ok('the carry-over is in the activity log', db.prepare("select count(*) n from audit where action='loyalty-carry-over'").get().n >= 1);
  db.close();
} catch (e) { fail(e); }
await S.stop();
done();
