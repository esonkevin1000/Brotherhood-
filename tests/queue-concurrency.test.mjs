// T27: two staff act on the same visit at the same moment. Exactly one action wins; the others get a clear message that says
// who already did it.
import { startServer, checker } from './helper.mjs';
const { ok, done, fail } = checker();
const S = await startServer(3183);
const { call } = S;
try {
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  const st = (await call('GET', '/api/state', null, owner)).j, A = st.branches[0], ch = st.chairs.filter(c => c.branchId === A.id);
  for (const b of [A]) await call('PUT', `/api/branches/${b.id}`, { openTime: '00:00', closeTime: '23:59' }, owner);   // the test does not depend on the time of day
  const trim = (await call('POST', '/api/items', { name: 'Quick Trim', price: 150, type: 'service', mins: 30, bookable: 1, active: 1 }, owner)).j;
  const kev = (await call('POST', '/api/staff', { name: 'Kev', branchId: A.id, chairId: ch[0].id, pct: 40, allowance: 0 }, owner)).j;
  const leo = (await call('POST', '/api/staff', { name: 'Leo', branchId: A.id, chairId: ch[1].id, pct: 40, allowance: 0 }, owner)).j;
  await call('POST', '/api/users', { name: 'Desk Dina', username: 'dina', pin: '111111', role: 'cashier', branchId: A.id }, owner);
  await call('POST', '/api/users', { name: 'Desk Ella', username: 'ella', pin: '333333', role: 'cashier', branchId: A.id }, owner);
  const dina = (await call('POST', '/api/login', { pin: '111111' })).j.token, ella = (await call('POST', '/api/login', { pin: '333333' })).j.token;
  await call('PUT', '/api/settings', { attPhoto: false }, owner);
  for (const s of [kev, leo]) await call('POST', '/api/attendance', { staffId: s.id, action: 'in' }, dina);
  const items = [{ itemId: trim.id, qty: 1 }];
  const walk = async name => (await call('POST', '/api/svc/walkin', { name, items }, dina)).j.id;
  const both = (fa, fb) => Promise.all([fa(), fb()]);

  // two desks start the same customer with Kev at once
  const w1 = await walk('Same Customer');
  let rs = await Promise.all(Array.from({ length: 6 }, (_, i) => call('POST', `/api/svc/${w1}/start`, { barberId: kev.id }, i % 2 ? ella : dina)));
  ok('six starts at once: exactly one wins', rs.filter(r => r.s === 200).length === 1 && rs.filter(r => r.s === 409).length === 5, rs.map(r => r.s));
  ok('the others are told who already started it', rs.filter(r => r.s === 409).every(r => /already in service with Kev, started by Desk (Dina|Ella)/i.test(r.j.error)), rs.map(r => r.j.error));

  // two different customers given to Leo at once: only one gets him
  const w2 = await walk('First Come'), w3 = await walk('Second Come');
  rs = await both(() => call('POST', `/api/svc/${w2}/start`, { barberId: leo.id }, dina), () => call('POST', `/api/svc/${w3}/start`, { barberId: leo.id }, ella));
  ok('two customers started with Leo at once: one gets him, the other is told he is busy', rs.filter(r => r.s === 200).length === 1 && rs.some(r => r.s === 409 && /Leo is already cutting/.test(r.j.error)), rs.map(r => [r.s, r.j.error]));

  // finishing twice
  rs = await both(() => call('POST', `/api/svc/${w1}/finish`, { method: 'Cash' }, dina), () => call('POST', `/api/svc/${w1}/finish`, { method: 'GCash' }, ella));
  ok('finished twice at once: one wins, the other is told who already finished it', rs.filter(r => r.s === 200).length === 1 && rs.some(r => r.s === 409 && /already done by Desk (Dina|Ella)/i.test(r.j.error)), rs.map(r => [r.s, r.j.error]));
  const paid = (await call('GET', '/api/svc/today', null, dina)).j.tickets.find(t => t.id === w1);
  ok('and it was paid once, with one method', paid.status === 'done' && ['Cash', 'GCash'].includes(paid.method));

  // cancel against left against start
  const w4 = await walk('Undecided');
  rs = await Promise.all([call('POST', `/api/svc/${w4}/left`, {}, dina), call('POST', `/api/svc/${w4}/cancel`, { reason: 'x' }, ella), call('POST', `/api/svc/${w4}/start`, { barberId: kev.id }, ella)]);
  ok('left, cancel and start at once: exactly one wins', rs.filter(r => r.s === 200).length === 1 && rs.filter(r => r.s === 409).length === 2, rs.map(r => [r.s, r.j.error]));
  ok('the losers are told what happened and by whom', rs.filter(r => r.s === 409).every(r => /by Desk (Dina|Ella)/.test(r.j.error) || /already in service with Kev/.test(r.j.error)), rs.map(r => r.j.error));
  const h = (await call('GET', `/api/svc/${w4}/history`, null, dina)).j;
  ok('the history has exactly one ending', h.filter(e => ['left', 'cancelled', 'in_service'].includes(e.to)).length === 1, h);
} catch (e) { fail(e); }
await S.stop();
done();
