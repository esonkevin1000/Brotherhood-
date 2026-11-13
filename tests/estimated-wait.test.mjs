// T24 (D-18 recommendation): each waiting customer shows an estimated start, labelled "estimate": the barber's remaining time on the
// current cut plus the cuts ahead in his line. It follows every start, finish, cancel and check-in.
import { startServer, checker } from './helper.mjs';
const { ok, done, fail } = checker();
const S = await startServer(3185);
const { call } = S;
const mnow = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); };
const at = hm => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
const near = (hm, mins) => hm && Math.abs(at(hm) - (mnow() + mins)) <= 2;
try {
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  const st = (await call('GET', '/api/state', null, owner)).j, A = st.branches[0], ch = st.chairs.filter(c => c.branchId === A.id);
  const trim = (await call('POST', '/api/items', { name: 'Quick Trim', price: 150, type: 'service', mins: 30, bookable: 1, active: 1 }, owner)).j;
  const kev = (await call('POST', '/api/staff', { name: 'Kev', branchId: A.id, chairId: ch[0].id, pct: 40, allowance: 0 }, owner)).j;
  const leo = (await call('POST', '/api/staff', { name: 'Leo', branchId: A.id, chairId: ch[1].id, pct: 40, allowance: 0 }, owner)).j;
  await call('POST', '/api/users', { name: 'Desk Dina', username: 'dina', pin: '111111', role: 'cashier', branchId: A.id }, owner);
  const desk = (await call('POST', '/api/login', { pin: '111111' })).j.token;
  await call('PUT', '/api/settings', { attPhoto: false }, owner);
  await call('POST', '/api/attendance', { staffId: kev.id, action: 'in' }, desk);
  const items = [{ itemId: trim.id, qty: 1 }];
  const walk = async (name, o = {}) => (await call('POST', '/api/svc/walkin', { name, items, ...o }, desk)).j.id;
  const est = async id => (await call('GET', '/api/svc/today', null, desk)).j.tickets.find(t => t.id === id)?.estimate;

  const cutting = await walk('In The Chair', { barberId: kev.id });   // a 30-minute cut starting now
  const w1 = await walk('Next One'), w2 = await walk('After That');
  for (const id of [w1, w2]) await call('PUT', `/api/orders/${id}`, { chairId: ch[0].id }, desk);   // both in Kev's line
  let e1 = await est(w1), e2 = await est(w2);
  ok('the first in line is estimated after the current cut (about 30 minutes)', e1?.label === 'estimate' && near(e1.start, 30) && Math.abs(e1.waitMins - 30) <= 2, e1);
  ok('the second after that (about 60 minutes)', near(e2?.start, 60) && Math.abs(e2.waitMins - 60) <= 2, e2);
  ok('someone already in the chair has no estimate', (await est(cutting)) === null);

  await call('POST', `/api/svc/${cutting}/finish`, { method: 'Cash' }, desk);   // Kev finishes: the next sits down by itself
  e2 = await est(w2);
  ok('after a finish, the line moves up: the second is now about 30 minutes away', near(e2?.start, 30), e2);
  await call('POST', `/api/svc/${w1}/cancel`, { reason: 'x' }, desk);   // the one in the chair is cancelled: the second sits down
  ok('after a cancel, the next sits down and has no estimate', (await est(w2)) === null);

  // a walk-in with no barber goes to whoever is free first
  await call('POST', '/api/attendance', { staffId: leo.id, action: 'in' }, desk);
  const w3 = await walk('Anyone');
  const e3 = await est(w3);
  ok('a waiting customer without a barber is estimated with the first free barber (Leo, now)', near(e3?.start, 0) && e3.barber === 'Leo', e3);
  await call('POST', `/api/svc/${w3}/start`, { barberId: leo.id }, desk);
  const w4 = await walk('Anyone Two');
  ok('when both are cutting, the next is estimated with whoever finishes first', (await est(w4))?.waitMins >= 25, await est(w4));
} catch (e) { fail(e); }
await S.stop();
done();
