// T29 (D-9): a completed record is never edited in place. A correction (amount, payment method, barber, or void) is asked for with a
// reason, keeps the before and after values, and takes effect only when the owner, an admin or the branch manager approves it.
// A void keeps the row and takes it out of the totals.
import { DatabaseSync } from 'node:sqlite';
import { startServer, checker } from './helper.mjs';
const { ok, done, fail } = checker();
const S = await startServer(3190);
const { call } = S;
try {
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  const st = (await call('GET', '/api/state', null, owner)).j, [A, B] = st.branches, ch = st.chairs.filter(c => c.branchId === A.id);
  await call('PUT', `/api/branches/${A.id}`, { openTime: '00:00', closeTime: '23:59' }, owner);
  const trim = (await call('POST', '/api/items', { name: 'Quick Trim', price: 200, type: 'service', mins: 30, bookable: 1, active: 1 }, owner)).j;
  const kev = (await call('POST', '/api/staff', { name: 'Kev', branchId: A.id, chairId: ch[0].id, pct: 40, allowance: 0 }, owner)).j;
  const leo = (await call('POST', '/api/staff', { name: 'Leo', branchId: A.id, chairId: ch[1].id, pct: 50, allowance: 0 }, owner)).j;
  await call('POST', '/api/users', { name: 'Desk Dina', username: 'dina', pin: '111111', role: 'cashier', branchId: A.id }, owner);
  await call('POST', '/api/users', { name: 'Manager Mia', username: 'mia', password: 'miapass1', role: 'manager', branchIds: [A.id] }, owner);
  await call('POST', '/api/users', { name: 'Manager Max', username: 'max', password: 'maxpass1', role: 'manager', branchIds: [B.id] }, owner);
  const desk = (await call('POST', '/api/login', { pin: '111111' })).j.token, mia = (await call('POST', '/api/login', { username: 'mia', password: 'miapass1' })).j.token, max = (await call('POST', '/api/login', { username: 'max', password: 'maxpass1' })).j.token;
  await call('PUT', '/api/settings', { attPhoto: false }, owner);
  for (const s of [kev, leo]) await call('POST', '/api/attendance', { staffId: s.id, action: 'in' }, desk);
  const items = [{ itemId: trim.id, qty: 1 }];
  const db = new DatabaseSync(S.dbFile, { timeout: 5000 }), row = id => db.prepare('select * from orders where id=?').get(id);
  const visit = async (name, s = kev) => { const id = (await call('POST', '/api/svc/walkin', { name, items, barberId: s.id }, desk)).j.id; await call('POST', `/api/svc/${id}/finish`, { method: 'Cash' }, desk); return id; };
  const adjust = (id, body, tok = desk) => call('POST', `/api/records/${id}/adjust`, body, tok);
  const decide = (aid, approve, tok, note = '') => call('POST', `/api/adjustments/${aid}/approve`, { approve, note }, tok);

  // ---------- amount ----------
  const v1 = await visit('First Visit');
  ok('a correction needs a reason', (await adjust(v1, { kind: 'amount', after: 150 })).s === 400);
  ok('an unknown kind is refused', (await adjust(v1, { kind: 'price', after: 150, reason: 'x x x' })).s === 400);
  let r = await adjust(v1, { kind: 'amount', after: 150, reason: 'Wrong price entered' });
  const a1 = r.j.adjustment;
  ok('the front desk asks to change ₱200 to ₱150: requested, before and after kept', r.s === 201 && a1.status === 'requested' && a1.before.total === 200 && a1.after.total === 150, r.j);
  ok('until approved, the record is unchanged', row(v1).total === 200);
  ok("another branch's manager cannot approve", (await decide(a1.id, true, max)).s === 403);
  ok('the front desk cannot approve', (await decide(a1.id, true, desk)).s === 403);
  r = await decide(a1.id, true, mia);
  ok("the branch's manager approves: the record now shows ₱150", r.s === 200 && row(v1).total === 150 && r.j.adjustment.status === 'approved' && r.j.adjustment.decidedBy === 'Manager Mia', r.j);
  ok('a decision cannot be made twice', (await decide(a1.id, false, owner)).s === 409);

  // ---------- void ----------
  r = await adjust(v1, { kind: 'void', reason: 'Customer was not charged' });
  await decide(r.j.adjustment.id, true, owner);
  ok('a void keeps the row, marked void', row(v1).status === 'void' && row(v1).total === 150);
  ok('and it is out of the totals', (await call('GET', '/api/svc/today', null, desk)).j.totals.done === 0);
  const h = (await call('GET', `/api/svc/${v1}/history`, null, owner)).j.map(e => `${e.to}:${e.reason}`);
  ok('the history shows all three states: completed, corrected, voided', h.some(x => x.startsWith('completed:Cash')) && h.some(x => /amount ₱200 → ₱150/.test(x)) && h.at(-1).startsWith('cancelled:'), h);
  ok('a voided record cannot be corrected again', (await adjust(v1, { kind: 'amount', after: 100, reason: 'again' })).s === 409);
  r = await call('GET', `/api/records/${v1}/adjustments`, null, owner);
  ok('its corrections are listed with who asked, who decided and why', r.s === 200 && r.j.length === 2 && r.j.every(a => a.requestedBy === 'Desk Dina' && a.status === 'approved' && a.reason), r.j);

  // ---------- method and barber, rejection, self-approval ----------
  const v2 = await visit('Second Visit');
  r = await adjust(v2, { kind: 'method', after: 'GCash', reason: 'Paid by GCash, not cash' }, mia);
  ok("a manager's own correction waits for someone else", r.s === 201 && r.j.adjustment.status === 'requested');
  ok('he cannot approve his own request', (await decide(r.j.adjustment.id, true, mia)).s === 403);
  await decide(r.j.adjustment.id, true, owner);
  ok('the owner approves it: the payment method is now GCash', JSON.parse(row(v2).tenders)[0].method === 'GCash');
  r = await adjust(v2, { kind: 'barber', after: leo.id, reason: 'Leo did the cut' });
  await decide(r.j.adjustment.id, false, mia, 'Kev did it, checked the camera');
  ok('a rejected correction changes nothing, and keeps the note', row(v2).barberId === kev.id && db.prepare('select status, note from record_adjustments where id=?').get(r.j.adjustment.id).note === 'Kev did it, checked the camera');
  r = await adjust(v2, { kind: 'barber', after: leo.id, reason: 'Leo did the cut after all' }, owner);
  ok("the owner's own correction takes effect at once", r.s === 201 && r.j.adjustment.status === 'approved' && row(v2).barberId === leo.id, r.j);
  ok('a barber from another branch is refused', (await adjust(v2, { kind: 'barber', after: 'nope', reason: 'test test' })).s === 400);
  r = await call('GET', '/api/adjustments?status=requested', null, mia);
  ok('managers see the corrections waiting for them', r.s === 200 && Array.isArray(r.j), r.j);
  const open = (await call('POST', '/api/svc/walkin', { name: 'Open', items }, desk)).j.id;
  ok('a visit that is not finished cannot be corrected', (await adjust(open, { kind: 'amount', after: 100, reason: 'x x x' })).s === 409);
  db.close();
} catch (e) { fail(e); }
await S.stop();
done();
