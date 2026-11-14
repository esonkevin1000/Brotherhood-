// T14: which barber can do which service. A service is offered only with barbers who can do it, including "Any barber".
// A barber with an empty list does every service. Changed 2026-11-14 at the owner's request: the list applies in every branch
// (it used to apply only to branches on the new booking system), and only the owner (or an admin) may change it, not a manager.
import { startServer, checker, ymd } from './helper.mjs';
const { ok, done, fail } = checker();
const S = await startServer(3167);
const { call } = S;
try {
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  const st = (await call('GET', '/api/state', null, owner)).j, [A, B, C] = st.branches;
  const svc = async (name, mins) => (await call('POST', '/api/items', { name, price: 150, type: 'service', mins, bookable: 1, active: 1 }, owner)).j;
  const trim = await svc('Trim', 30), color = await svc('Hair Color', 60);
  const mk = async (name, br, k) => (await call('POST', '/api/staff', { name, branchId: br.id, chairId: st.chairs.filter(c => c.branchId === br.id)[k].id, pct: 40, allowance: 0 }, owner)).j;
  const kev = await mk('Kev', A, 0), leo = await mk('Leo', A, 1), bob = await mk('Bob', B, 0);
  await call('PUT', '/api/settings', { mvpBranches: [A.id] }, owner);
  const D = ymd(new Date(Date.now() + 3 * 864e5));
  const slots = async (br, staff, items) => (await call('GET', `/api/public/slots?branch=${br.id}&date=${D}&staff=${staff}&items=${items.map(i => i.id).join(',')}`)).j.slots;
  ok('with no lists, every barber does every service', (await slots(A, kev.id, [color])).length > 0 && (await slots(A, leo.id, [color])).length > 0);

  // ---------- Kev does trims only ----------
  let r = await call('PUT', `/api/staff/${kev.id}/services`, { itemIds: [trim.id] }, owner);
  ok('the owner says Kev does Trim only', r.s === 200 && r.j.itemIds.join() === trim.id, r);
  ok('Kev offers Trim', (await slots(A, kev.id, [trim])).length > 0);
  ok('Kev never offers Hair Color', (await slots(A, kev.id, [color])).length === 0 && (await slots(A, kev.id, [trim, color])).length === 0);
  r = await call('GET', `/api/public/info`);
  const kevInfo = r.j.staff.find(s => s.id === kev.id), leoInfo = r.j.staff.find(s => s.id === leo.id);
  ok('the booking page learns what Kev does, and that Leo does everything', JSON.stringify(kevInfo.services) === JSON.stringify([trim.id]) && leoInfo.services === null, [kevInfo, leoInfo]);

  // "Any barber": take Leo's whole day, so only Kev is left
  const app = (await call('POST', '/api/bh/signup', { name: 'Ana Reyes', email: 'ana@example.com', phone: '0917 222 3333', password: 'password123', agree: true })).j.token;
  const book = (staffId, items, time, n) => call('POST', '/api/bh/book', { branchId: A.id, staffId, itemIds: items.map(i => i.id), date: D, time }, app, { 'Idempotency-Key': 'svc-test-key-00000' + n });
  r = await call('POST', '/api/bh/pro/block', { staffId: leo.id, date: D, allDay: true, reason: 'Seminar' }, owner);
  ok('Leo is away all day', r.s === 201, r);
  ok('"Any barber" has no Hair Color times (Kev cannot do it)', (await slots(A, 'any', [color])).length === 0);
  ok('"Any barber" still has Trim times (through Kev)', (await slots(A, 'any', [trim])).length > 0);
  ok('booking Hair Color with Kev is refused', (await book(kev.id, [color], '10:00', 1)).s === 409);
  ok('booking Hair Color with "Any barber" is refused', (await book('any', [color], '10:00', 2)).s === 409);
  r = await book('any', [trim], '10:00', 3);
  ok('booking a Trim with "Any barber" goes to Kev', r.s === 201 && r.j.booking.staff === 'Kev', r.j);

  // ---------- the list applies in every branch, also one not on the new booking system ----------
  await call('PUT', `/api/staff/${bob.id}/services`, { itemIds: [trim.id] }, owner);
  ok('in branch B (not switched on) Bob no longer offers Hair Color', (await slots(B, bob.id, [color])).length === 0 && (await slots(B, bob.id, [trim])).length > 0);
  ok('and the booking page is told what Bob does', JSON.stringify((await call('GET', '/api/public/info')).j.staff.find(s => s.id === bob.id).services) === JSON.stringify([trim.id]));
  r = await call('GET', '/api/bh/discover'); const bobApp = (r.j.barbers || []).find(b => b.id === bob.id);
  ok('the app is told too', bobApp && JSON.stringify(bobApp.services) === JSON.stringify([trim.id]), bobApp);

  // ---------- who may change it ----------
  ok('unknown or non-service items are refused', (await call('PUT', `/api/staff/${kev.id}/services`, { itemIds: ['nope'] }, owner)).s === 400
    && (await call('PUT', `/api/staff/${kev.id}/services`, { itemIds: [st.items.find(i => i.type === 'product').id] }, owner)).s === 400);
  await call('POST', '/api/users', { name: 'Manager Mia', username: 'mia', password: 'miapass1', role: 'manager', branchIds: [A.id] }, owner);
  const mia = (await call('POST', '/api/login', { username: 'mia', password: 'miapass1' })).j.token;
  await call('POST', '/api/users', { name: 'Manager Max', username: 'max', password: 'maxpass1', role: 'manager', branchIds: [C.id] }, owner);
  const max = (await call('POST', '/api/login', { username: 'max', password: 'maxpass1' })).j.token;
  ok("a manager cannot change a barber's services, even in his own branch", (await call('PUT', `/api/staff/${leo.id}/services`, { itemIds: [trim.id, color.id] }, mia)).s === 403);
  ok("nor can another branch's manager", (await call('PUT', `/api/staff/${kev.id}/services`, { itemIds: [] }, max)).s === 403);
  r = await call('GET', `/api/staff-services?branch=${A.id}`, null, mia);
  ok('the list per barber of the branch', r.s === 200 && r.j.find(x => x.staffId === kev.id)?.itemIds.join() === trim.id, r.j);
  r = await call('PUT', `/api/staff/${kev.id}/services`, { itemIds: [] }, owner);
  ok('an empty list means every service again', r.s === 200 && (await slots(A, kev.id, [color])).length > 0);
  ok('changes are in the activity log', JSON.stringify((await call('GET', '/api/audit', null, owner)).j).includes('barber-services'));
} catch (e) { fail(e); }
await S.stop();
done();
