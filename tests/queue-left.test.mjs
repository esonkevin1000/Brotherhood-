// T25: a waiting customer who walks away is marked "left" (no service record, no loyalty point), and at closing time anyone still
// waiting must be marked left or carried over to the next day.
import { DatabaseSync } from 'node:sqlite';
import { startServer, checker, ymd } from './helper.mjs';
const { ok, done, fail } = checker();
const S = await startServer(3182);
const { call } = S;
try {
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  const st = (await call('GET', '/api/state', null, owner)).j, A = st.branches[0];
  const trim = (await call('POST', '/api/items', { name: 'Quick Trim', price: 150, type: 'service', mins: 30, bookable: 1, active: 1 }, owner)).j;
  const kev = (await call('POST', '/api/staff', { name: 'Kev', branchId: A.id, chairId: st.chairs.find(c => c.branchId === A.id).id, pct: 40, allowance: 0 }, owner)).j;
  await call('POST', '/api/users', { name: 'Desk Dina', username: 'dina', pin: '111111', role: 'cashier', branchId: A.id }, owner);
  await call('POST', '/api/users', { name: 'Kev', username: 'kev', pin: '222222', role: 'barber', branchId: A.id, staffId: kev.id }, owner);
  const desk = (await call('POST', '/api/login', { pin: '111111' })).j.token, barber = (await call('POST', '/api/login', { pin: '222222' })).j.token;
  await call('PUT', '/api/settings', { attPhoto: false }, owner);
  await call('POST', '/api/attendance', { staffId: kev.id, action: 'in' }, desk);
  const items = [{ itemId: trim.id, qty: 1 }];
  const walk = async (name, o = {}) => (await call('POST', '/api/svc/walkin', { name, items, ...o }, desk)).j.id;
  const today = async () => (await call('GET', '/api/svc/today', null, desk)).j;
  const db = new DatabaseSync(S.dbFile, { timeout: 5000 });

  // ---------- left ----------
  const busy = await walk('In The Chair', { barberId: kev.id }), w1 = await walk('Lina Left', { phone: '0917 777 0001' });
  let r = await call('POST', `/api/svc/${w1}/left`, { reason: 'Could not wait' }, desk);
  ok('a waiting customer is marked as left', r.s === 200 && !(await today()).tickets.some(t => t.id === w1), r);
  const h = (await call('GET', `/api/svc/${w1}/history`, null, desk)).j;
  ok('the history says left, with the reason and who', h.at(-1).to === 'left' && h.at(-1).reason === 'Could not wait' && h.at(-1).actor === 'Desk Dina', h);
  ok('no service record: nothing paid, nothing counted', db.prepare('select status, paidAt from orders where id=?').get(w1).status === 'left' && !db.prepare('select paidAt from orders where id=?').get(w1).paidAt);
  const cust = (await call('GET', '/api/customers?q=Lina', null, owner)).j.rows.find(c => c.name === 'Lina Left');
  ok('and no loyalty point (0 visits)', cust && cust.visits === 0, cust);
  ok('someone in the chair cannot be marked left', (await call('POST', `/api/svc/${busy}/left`, {}, desk)).s === 409);
  ok('a visit already left cannot be left again or started', (await call('POST', `/api/svc/${w1}/left`, {}, desk)).s === 409 && (await call('POST', `/api/svc/${w1}/start`, { barberId: kev.id }, desk)).s === 409);
  ok('the day totals do not count it', (await today()).totals.waiting === 0);

  // ---------- closing time ----------
  const w2 = await walk('Late One'), w3 = await walk('Late Two');
  ok('before closing time there is nothing to close', (await today()).closing?.needed === false);
  await call('PUT', `/api/branches/${A.id}`, { closeTime: '00:01' }, owner);   // it is now past closing time
  let t = await today();
  ok('after closing time, the 2 still waiting must be handled', t.closing?.needed === true && t.closing.waiting === 2, t.closing);
  ok('a barber cannot close the queue', (await call('POST', '/api/svc/close-queue', { branchId: A.id, action: 'left' }, barber)).s === 403);
  ok('an unknown action is refused', (await call('POST', '/api/svc/close-queue', { branchId: A.id, action: 'drop' }, desk)).s === 400);
  r = await call('POST', '/api/svc/close-queue', { branchId: A.id, action: 'carry', ids: [w2] }, desk);
  const tmr = ymd(new Date(Date.now() + 864e5));
  ok('one is carried over to tomorrow, still waiting', r.s === 200 && r.j.carried === 1 && db.prepare('select date, status from orders where id=?').get(w2).date === tmr && db.prepare('select status from orders where id=?').get(w2).status === 'waiting', [r, db.prepare('select date, status from orders where id=?').get(w2)]);
  r = await call('POST', '/api/svc/close-queue', { branchId: A.id, action: 'left' }, desk);
  ok('the rest are marked left', r.s === 200 && r.j.left === 1 && db.prepare('select status from orders where id=?').get(w3).status === 'left', r);
  t = await today();
  ok('then nothing is left to close', t.closing.needed === false && t.closing.waiting === 0);
  ok('the history explains both', (await call('GET', `/api/svc/${w2}/history`, null, desk)).j.at(-1).reason.includes(tmr) && (await call('GET', `/api/svc/${w3}/history`, null, desk)).j.at(-1).reason === 'end of day');
  ok('the person in the chair is not touched by closing', db.prepare('select status from orders where id=?').get(busy).status === 'in_chair');
  db.close();
} catch (e) { fail(e); }
await S.stop();
done();
