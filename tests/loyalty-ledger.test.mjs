// T35 (L1, L2): one point per eligible finished visit, never twice; the balance is the sum of the ledger; no points for cancelled, left
// or voided visits. Points are earned where the new system is switched on (the pilot branch); other branches keep the old count.
import { DatabaseSync } from 'node:sqlite';
import { startServer, checker } from './helper.mjs';
const { ok, done, fail } = checker();
const S = await startServer(3200);
const { call } = S;
try {
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  const st = (await call('GET', '/api/state', null, owner)).j, [A, B] = st.branches, ch = st.chairs.filter(c => c.branchId === A.id), chB = st.chairs.filter(c => c.branchId === B.id);
  for (const b of [A, B]) await call('PUT', `/api/branches/${b.id}`, { openTime: '00:00', closeTime: '23:59' }, owner);
  await call('PUT', '/api/settings', { attPhoto: false }, owner);
  await call('PUT', '/api/settings', { mvpBranches: [A.id] }, owner);
  const trim = (await call('POST', '/api/items', { name: 'Quick Trim', price: 200, type: 'service', mins: 30, bookable: 1, active: 1 }, owner)).j;
  const kev = (await call('POST', '/api/staff', { name: 'Kev', branchId: A.id, chairId: ch[0].id, pct: 40, allowance: 0 }, owner)).j;
  const bob = (await call('POST', '/api/staff', { name: 'Bob', branchId: B.id, chairId: chB[0].id, pct: 40, allowance: 0 }, owner)).j;
  await call('POST', '/api/users', { name: 'Desk Dina', username: 'dina', pin: '111111', role: 'cashier', branchId: A.id }, owner);
  await call('POST', '/api/users', { name: 'Desk Bea', username: 'bea', pin: '444444', role: 'cashier', branchId: B.id }, owner);
  await call('POST', '/api/users', { name: 'Kev', username: 'kev', pin: '222222', role: 'barber', branchId: A.id, staffId: kev.id }, owner);
  const desk = (await call('POST', '/api/login', { pin: '111111' })).j.token, deskB = (await call('POST', '/api/login', { pin: '444444' })).j.token, kevTok = (await call('POST', '/api/login', { pin: '222222' })).j.token;
  await call('POST', '/api/attendance', { staffId: kev.id, action: 'in' }, desk); await call('POST', '/api/attendance', { staffId: bob.id, action: 'in' }, deskB);
  const db = new DatabaseSync(S.dbFile, { timeout: 5000 });
  const items = [{ itemId: trim.id, qty: 1 }], ana = { name: 'Ana Cruz', phone: '0917 111 2222' };
  const open = async (who, s = kev, tok = desk) => (await call('POST', '/api/svc/walkin', { ...who, items, barberId: s.id }, tok)).j.id;
  const finish = (id, tok = desk, s = kev) => call('POST', `/api/svc/${id}/finish`, { method: 'Cash', barberId: s.id }, tok);
  const ledger = cid => db.prepare('select * from loyalty_ledger where customerId=? order by createdAt, rowid').all(cid);

  const v1 = await open(ana); await finish(v1);
  const cid = db.prepare('select customerId from orders where id=?').get(v1).customerId;
  ok('a finished visit gives the customer one point', !!cid && ledger(cid).length === 1 && ledger(cid)[0].delta === 1 && ledger(cid)[0].kind === 'earn' && ledger(cid)[0].orderId === v1, ledger(cid));
  // a retried finish: two taps at once
  const v2 = await open(ana); const rr = await Promise.all([finish(v2), finish(v2)]);
  ok('finishing twice at once gives one point', rr.filter(r => r.s === 200).length === 1 && ledger(cid).filter(e => e.orderId === v2).length === 1, rr.map(r => r.s));
  // no points: cancelled before service, left, voided
  const v3 = await open(ana); await call('POST', `/api/svc/${v3}/cancel`, { reason: 'changed mind' }, desk);
  const v4 = await open(ana); await call('POST', `/api/svc/${v4}/left`, {}, desk);
  ok('no point for a cancelled or left visit', ledger(cid).length === 2);
  const v5 = await open(ana); await finish(v5);
  await call('POST', `/api/records/${v5}/adjust`, { kind: 'void', reason: 'Not a real visit' }, owner);
  const e5 = ledger(cid).filter(e => e.orderId === v5);
  ok('a voided visit gives its point back (earn +1, reverse −1; nothing deleted)', e5.length === 2 && e5[0].delta === 1 && e5[1].delta === -1 && e5[1].kind === 'reverse', e5);
  // not in a branch where the new system is off
  const vb = await open({ name: 'Ana Cruz', phone: '0917 111 2222' }, bob, deskB); await finish(vb, deskB, bob);
  ok('a visit in a branch not yet switched on earns nothing in the new ledger', ledger(cid).filter(e => e.orderId === vb).length === 0);

  const r = await call('GET', `/api/loyalty/customers/${cid}`, null, desk);
  const sum = ledger(cid).reduce((a, e) => a + e.delta, 0);
  ok('the balance is the sum of the ledger (2)', r.s === 200 && r.j.balance === sum && sum === 2, [r.j.balance, sum]);
  ok('the history lists every row', r.j.history?.length === ledger(cid).length);
  ok('a barber cannot read a customer\'s points', (await call('GET', `/api/loyalty/customers/${cid}`, null, kevTok)).s === 403);
  ok('the ledger cannot have two earn rows for one visit', (() => { try { db.prepare("insert into loyalty_ledger(id,customerId,kind,delta,orderId,createdAt) values('dup',?,'earn',1,?,'x')").run(cid, v1); return false; } catch { return true; } })());
  db.close();
} catch (e) { fail(e); }
await S.stop();
done();
