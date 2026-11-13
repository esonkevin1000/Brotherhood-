// Service-records checkpoint: fixes from the code review and the security audit of corrections (planning/reviews).
// No direct void of a paid sale by a manager; corrections keep payments and discounts consistent; stale or stuck requests are refused or
// closed; a manager never approves or verifies his own pay; barbers do not read corrections; spreadsheet formulas in CSV stay text.
import { DatabaseSync } from 'node:sqlite';
import { startServer, checker } from './helper.mjs';
const { ok, done, fail } = checker();
const S = await startServer(3195);
const { call } = S;
try {
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  const st = (await call('GET', '/api/state', null, owner)).j, A = st.branches[0], ch = st.chairs.filter(c => c.branchId === A.id);
  await call('PUT', `/api/branches/${A.id}`, { openTime: '00:00', closeTime: '23:59' }, owner);
  await call('PUT', '/api/settings', { attPhoto: false }, owner);
  const trim = (await call('POST', '/api/items', { name: 'Quick Trim', price: 200, type: 'service', mins: 30, bookable: 1, active: 1 }, owner)).j;
  const kev = (await call('POST', '/api/staff', { name: 'Kev', branchId: A.id, chairId: ch[0].id, pct: 40, allowance: 0 }, owner)).j;
  const mib = (await call('POST', '/api/staff', { name: 'Mia Barber', branchId: A.id, chairId: ch[1].id, pct: 50, allowance: 0 }, owner)).j;
  await call('POST', '/api/users', { name: 'Desk Dina', username: 'dina', pin: '111111', role: 'cashier', branchId: A.id }, owner);
  await call('POST', '/api/users', { name: 'Kev', username: 'kev', pin: '222222', role: 'barber', branchId: A.id, staffId: kev.id }, owner);
  const mu = (await call('POST', '/api/users', { name: 'Manager Mia', username: 'mia', password: 'miapass1', role: 'manager', branchIds: [A.id] }, owner)).j;
  const desk = (await call('POST', '/api/login', { pin: '111111' })).j.token, kevTok = (await call('POST', '/api/login', { pin: '222222' })).j.token, mia = (await call('POST', '/api/login', { username: 'mia', password: 'miapass1' })).j.token;
  for (const s of [kev, mib]) await call('POST', '/api/attendance', { staffId: s.id, action: 'in' }, desk);
  const db = new DatabaseSync(S.dbFile, { timeout: 5000 }), row = id => db.prepare('select * from orders where id=?').get(id);
  db.prepare('update users set staffId=? where id=?').run(mib.id, mu.id || db.prepare("select id from users where username='mia'").get().id);   // Mia also cuts hair
  const items = [{ itemId: trim.id, qty: 1 }];
  const visit = async (name, s = kev, method = 'Cash') => { const id = (await call('POST', '/api/svc/walkin', { name, items, barberId: s.id }, desk)).j.id; await call('POST', `/api/svc/${id}/finish`, { method }, desk); return id; };
  const adjust = (id, body, tok = desk) => call('POST', `/api/records/${id}/adjust`, body, tok);
  const decide = (aid, approve, tok, note = '') => call('POST', `/api/adjustments/${aid}/approve`, { approve, note }, tok);

  // ---------- a paid sale is not voided directly by a manager ----------
  const v0 = await visit('Direct Void');
  ok('a manager cannot void a paid sale directly', (await call('POST', `/api/orders/${v0}/void`, { reason: 'mistake here' }, mia)).s === 403 && row(v0).status === 'paid');
  await call('POST', `/api/orders/${v0}/void`, { reason: 'Owner voids it' }, owner);
  const vr = db.prepare('select * from record_adjustments where orderId=?').all(v0);
  ok("the owner's direct void is kept as an approved void correction", row(v0).status === 'void' && vr.length === 1 && vr[0].kind === 'void' && vr[0].status === 'approved', vr);

  // ---------- amount: payments, discount and verification follow ----------
  const v1 = await visit('Amount Ann', kev, 'GCash');
  await call('POST', `/api/records/${v1}/verify`, {}, owner);
  await adjust(v1, { kind: 'amount', after: 150, reason: 'Senior price' }, owner);
  let o = row(v1), tenders = JSON.parse(o.tenders);
  ok('after ₱200 → ₱150 the payment says ₱150 too', tenders.length === 1 && tenders[0].amount === 150 && tenders[0].method === 'GCash', tenders);
  ok('gross − discount = net', o.subtotal - o.discountAmt === o.total && o.total === 150, [o.subtotal, o.discountAmt, o.total]);
  ok('the verification starts again (the record changed)', o.payStatus === 'reported');
  ok('an amount that is not a number is refused', (await adjust(v1, { kind: 'amount', after: '', reason: 'empty value' })).s === 400 && (await adjust(v1, { kind: 'amount', after: null, reason: 'null value' })).s === 400);
  ok('the same amount again is refused', (await adjust(v1, { kind: 'amount', after: 150, reason: 'no change' })).s === 400);

  // ---------- stale and stuck requests ----------
  const v2 = await visit('Stale Sam');
  const r1 = (await adjust(v2, { kind: 'amount', after: 180, reason: 'first ask' })).j.adjustment, r2 = (await adjust(v2, { kind: 'amount', after: 150, reason: 'second ask' })).j.adjustment;
  ok('approving "approve":"false" (text) is refused', (await call('POST', `/api/adjustments/${r1.id}/approve`, { approve: 'false' }, owner)).s === 400 && row(v2).total === 200);
  await decide(r1.id, true, owner);
  ok('the second request, made against ₱200, is refused once the record is ₱180', (await decide(r2.id, true, owner)).s === 409 && row(v2).total === 180);
  const r3 = (await adjust(v2, { kind: 'method', after: 'Maya', reason: 'pending method' })).j.adjustment;
  const rv = (await adjust(v2, { kind: 'void', reason: 'void it' })).j.adjustment;
  await decide(rv.id, true, owner);
  ok('when the record is voided, the corrections still waiting are closed', db.prepare('select status from record_adjustments where id=?').get(r3.id).status === 'rejected');

  // ---------- a locked day ----------
  const v3 = await visit('Locked Lou');
  db.prepare("insert into zreadings(id, no, branchId, businessDate, generatedAt, data) values('zr-test', 1, ?, ?, ?, '{}')").run(A.id, row(v3).date, new Date().toISOString());
  const before = db.prepare('select count(*) n from record_adjustments').get().n;
  ok('a correction on a locked day is refused before anything is written', (await adjust(v3, { kind: 'amount', after: 100, reason: 'too late' }, owner)).s === 409 && db.prepare('select count(*) n from record_adjustments').get().n === before);
  db.prepare("delete from zreadings where id='zr-test'").run();

  // ---------- split payment ----------
  const v4 = await visit('Split Sue');
  db.prepare('update orders set tenders=? where id=?').run(JSON.stringify([{ method: 'Cash', amount: 100 }, { method: 'GCash', amount: 100 }]), v4);
  ok('a split payment cannot be changed to one method', (await adjust(v4, { kind: 'method', after: 'Card', reason: 'one method' })).s === 409);

  // ---------- a manager and his own pay ----------
  const v5 = await visit('Mia Cut', mib);
  ok('a manager cannot verify a visit he cut himself', (await call('POST', `/api/records/${v5}/verify`, {}, mia)).s === 403);
  const up = (await adjust(v5, { kind: 'amount', after: 500, reason: 'raise it' })).j.adjustment;
  ok('nor approve a correction on it', (await decide(up.id, true, mia)).s === 403 && row(v5).total === 200);
  const v6 = await visit('Kev Cut');
  const mv = (await adjust(v6, { kind: 'barber', after: mib.id, reason: 'move to Mia' })).j.adjustment;
  ok('nor approve moving a visit to himself', (await decide(mv.id, true, mia)).s === 403 && row(v6).barberId === kev.id);

  // ---------- barbers do not read corrections ----------
  ok('a barber cannot list the corrections', (await call('GET', '/api/adjustments?status=requested', null, kevTok)).s === 403 && (await call('GET', `/api/records/${v6}/adjustments`, null, kevTok)).s === 403);

  // ---------- export and CSV ----------
  const cancelled = (await call('POST', '/api/svc/walkin', { name: 'Never Paid', items }, desk)).j.id;
  await call('POST', `/api/svc/${cancelled}/cancel`, { reason: 'left' }, desk);
  db.prepare("update orders set status='void' where id=? and status<>'void'").run(cancelled);
  const date = row(v1).date, csv = String((await call('GET', `/api/records/export?from=${date}&to=${date}`, null, owner)).j);
  ok('the export leaves out visits that were cancelled before payment', !csv.includes(',' + row(cancelled).no + ',' + date) && csv.includes('Direct Void') === false, csv.split('\n').slice(4).map(l => l.slice(0, 30)));
  ok('the export refuses more than a year', (await call('GET', '/api/records/export?from=2020-01-01&to=2026-01-01', null, owner)).s === 400);
  db.prepare("update orders set customerName='=HYPERLINK(\"http://x/\",\"y\")' where id=?").run(v6);
  const sales = String((await call('GET', `/api/reports/sales?from=${date}&to=${date}&format=csv`, null, owner)).j);
  ok('a customer name that looks like a formula stays text in the reports CSV', sales.includes("'=HYPERLINK") && !/(^|,)"?=HYPERLINK/m.test(sales), sales.split('\n').find(l => l.includes('HYPERLINK')));
  ok('the reports CSV download is in the activity log', db.prepare("select count(*) n from audit where action='report-exported'").get().n === 1);
  db.close();
} catch (e) { fail(e); }
await S.stop();
done();
