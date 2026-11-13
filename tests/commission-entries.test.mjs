// T33 (E1, D-10): each finished visit creates one commission entry that keeps the rule used (the barber's % at the time, plus product
// commission) and its source record. A correction, barber change or void adds a correcting entry; the original entry stays.
// The numbers match the existing commission rules: service value after discount x barber %, plus the product commission.
import { DatabaseSync } from 'node:sqlite';
import { startServer, checker } from './helper.mjs';
const { ok, done, fail } = checker();
const S = await startServer(3194);
const { call } = S;
try {
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  const st = (await call('GET', '/api/state', null, owner)).j, A = st.branches[0], ch = st.chairs.filter(c => c.branchId === A.id);
  await call('PUT', `/api/branches/${A.id}`, { openTime: '00:00', closeTime: '23:59' }, owner);
  await call('PUT', '/api/settings', { attPhoto: false }, owner);
  const trim = (await call('POST', '/api/items', { name: 'Quick Trim', price: 200, type: 'service', mins: 30, bookable: 1, active: 1 }, owner)).j;
  const wax = (await call('POST', '/api/items', { name: 'Wax', price: 380, type: 'product', commission: 100, active: 1 }, owner)).j;
  const kev = (await call('POST', '/api/staff', { name: 'Kev', branchId: A.id, chairId: ch[0].id, pct: 40, allowance: 0 }, owner)).j;
  const leo = (await call('POST', '/api/staff', { name: 'Leo', branchId: A.id, chairId: ch[1].id, pct: 50, allowance: 0 }, owner)).j;
  await call('POST', '/api/users', { name: 'Desk Dina', username: 'dina', pin: '111111', role: 'cashier', branchId: A.id }, owner);
  const desk = (await call('POST', '/api/login', { pin: '111111' })).j.token;
  for (const s of [kev, leo]) await call('POST', '/api/attendance', { staffId: s.id, action: 'in' }, desk);
  const db = new DatabaseSync(S.dbFile, { timeout: 5000 });
  const entries = id => db.prepare('select * from commission_entries where orderId=? order by createdAt, rowid').all(id);
  const net = (id, sid) => Math.round(entries(id).filter(e => !sid || e.staffId === sid).reduce((a, e) => a + e.amount, 0) * 100) / 100;
  const visit = async (name, s, items, method = 'Cash') => { const id = (await call('POST', '/api/svc/walkin', { name, items, barberId: s.id }, desk)).j.id; await call('POST', `/api/svc/${id}/finish`, { method }, desk); return id; };

  // ---------- one entry per finished visit, with its rule ----------
  const v1 = await visit('Ana', kev, [{ itemId: trim.id, qty: 1 }]);
  let e = entries(v1);
  ok('a finished visit creates one entry: ₱200 x 40% = ₱80', e.length === 1 && e[0].kind === 'earn' && e[0].staffId === kev.id && e[0].amount === 80, e);
  ok('it keeps the rule used and the source record', e[0].pct === 40 && e[0].base === 200 && e[0].productComm === 0 && JSON.parse(e[0].rule).pct === 40 && e[0].orderId === v1 && e[0].branchId === A.id, e[0]);
  ok('finishing it again adds nothing', (await call('POST', `/api/svc/${v1}/finish`, { method: 'Cash' }, desk)).s === 409 && entries(v1).length === 1);
  const v2 = await visit('Ben', kev, [{ itemId: trim.id, qty: 1 }, { itemId: wax.id, qty: 1 }]);
  ok('service and product: ₱80 + ₱100 product commission = ₱180', entries(v2).length === 1 && entries(v2)[0].amount === 180 && entries(v2)[0].productComm === 100, entries(v2));

  // ---------- the same numbers as the commission report ----------
  const date = db.prepare('select date from orders where id=?').get(v1).date;
  const rep = (await call('GET', `/api/reports/commissions?from=${date}&to=${date}&branch=${A.id}`, null, owner)).j, cols = rep.tables[0].cols.map(c => c[0]);
  const kr = rep.tables[0].rows.find(r => r[0] === 'Kev');
  ok("Kev's entries add up to the commission report (₱260)", kr[cols.indexOf('Commission')] === 260 && net(v1) + net(v2) === 260, [kr, net(v1), net(v2)]);

  // ---------- a later change of the barber's % does not rewrite the entry ----------
  await call('PUT', `/api/staff/${kev.id}`, { pct: 45 }, owner);
  ok("changing Kev's % later leaves the entry as it was", entries(v1).length === 1 && entries(v1)[0].amount === 80);

  // ---------- corrections add a correcting entry ----------
  await call('POST', `/api/records/${v1}/adjust`, { kind: 'amount', after: 150, reason: 'Senior price' }, owner);
  e = entries(v1);
  ok('an amount correction to ₱150 adds a −₱20 entry at the rule first used (40%)', e.length === 2 && e[0].amount === 80 && e[1].kind === 'adjust' && e[1].amount === -20 && net(v1) === 60 && !!e[1].adjustmentId, e);
  await call('POST', `/api/records/${v1}/adjust`, { kind: 'method', after: 'GCash', reason: 'Paid by GCash' }, owner);
  ok('a payment-method correction changes no commission, so adds no entry', entries(v1).length === 2);
  await call('POST', `/api/records/${v1}/adjust`, { kind: 'barber', after: leo.id, reason: 'Leo did it' }, owner);
  ok('a barber change takes it from Kev and gives it to Leo at his 50%', net(v1, kev.id) === 0 && net(v1, leo.id) === 75 && entries(v1).length === 4, entries(v1));
  await call('POST', `/api/records/${v1}/adjust`, { kind: 'void', reason: 'Not a real visit' }, owner);
  ok('a void brings the record to zero; every earlier entry stays', net(v1) === 0 && entries(v1).length === 5 && entries(v1)[0].amount === 80, entries(v1));
  const pending = (await call('POST', `/api/records/${v2}/adjust`, { kind: 'amount', after: 100, reason: 'Asked only' }, desk)).j.adjustment;
  ok('a correction that is only asked for adds nothing', pending.status === 'requested' && entries(v2).length === 1);

  // ---------- the older POS pay and its void ----------
  await call('POST', '/api/shifts/open', { openingFloat: 0 }, desk);
  const o = (await call('POST', '/api/orders', { customer: { name: 'Pos Pat' }, items: [{ itemId: trim.id, qty: 1 }] }, desk)).j;
  await call('PUT', '/api/orders/' + o.id, { chairId: ch[1].id, barberId: leo.id }, desk);
  await call('POST', `/api/orders/${o.id}/pay`, { tenders: [{ method: 'Cash', amount: 200 }] }, desk);
  ok('a sale paid at the POS creates its entry too (₱200 x 50%)', entries(o.id).length === 1 && entries(o.id)[0].amount === 100, entries(o.id));
  await call('POST', `/api/orders/${o.id}/void`, { reason: 'Rang up twice' }, owner);
  ok('voiding it at the POS adds the reversing entry', net(o.id) === 0 && entries(o.id).length === 2, entries(o.id));
  db.close();
} catch (e) { fail(e); }
await S.stop();
done();
