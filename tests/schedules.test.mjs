// T13: each barber's weekly hours, approved leave and blocked times decide the free slots, in branches using the new
// booking system (T11 switch). Branches not switched on keep today's behaviour. No schedule = the branch's opening hours.
import { startServer, checker, ymd } from './helper.mjs';
const { ok, done, fail } = checker();
const S = await startServer(3159);
const { call } = S;
// the next date (after tomorrow) that falls on a weekday (0 = Sunday)
const nextDay = wd => { const d = new Date(Date.now() + 2 * 864e5); while (d.getDay() !== wd) d.setDate(d.getDate() + 1); return ymd(d); };
try {
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  const st = (await call('GET', '/api/state', null, owner)).j, [A, B, C] = st.branches;
  const cut = (await call('POST', '/api/items', { name: 'Quick Trim', price: 100, type: 'service', mins: 30, bookable: 1, active: 1 }, owner)).j;   // a 30-minute service
  const mk = async (name, br, k) => (await call('POST', '/api/staff', { name, branchId: br.id, chairId: st.chairs.filter(c => c.branchId === br.id)[k].id, pct: 40, allowance: 0 }, owner)).j;
  const kev = await mk('Kev', A, 0), leo = await mk('Leo', A, 1), bob = await mk('Bob', B, 0);
  await call('PUT', '/api/settings', { mvpBranches: [A.id] }, owner);   // new booking system in branch A only
  const slots = async (br, date, staff) => (await call('GET', `/api/public/slots?branch=${br.id}&date=${date}&staff=${staff}&items=${cut.id}`)).j.slots;
  const TUE = nextDay(2), WED = nextDay(3), THU = nextDay(4), FRI = nextDay(5), MON = nextDay(1);
  const open = (await slots(A, WED, kev.id))[0];
  ok('with no schedule, slots follow the branch hours', open === (A.openTime || '09:00'), open);

  // ---------- weekly hours ----------
  const week = (over = {}) => Array.from({ length: 7 }, (_, i) => over[i] === undefined ? null : over[i]);   // null = branch hours
  let r = await call('PUT', `/api/schedules/${kev.id}`, { days: week({ 2: { start: '13:00', end: '19:00' }, 4: 'off' }) }, owner);
  ok('the owner sets Kev: Tuesday 13:00-19:00, Thursday off', r.s === 200, r);
  let t = await slots(A, TUE, kev.id);
  ok('no Tuesday morning slots for Kev', t.length > 0 && t.every(x => x >= '13:00'), t);
  ok('Tuesday from 13:00, last start 18:30 for a 30-minute cut', t[0] === '13:00' && t.includes('18:30') && !t.includes('19:00'), t);
  ok('Wednesday still follows the branch hours', (await slots(A, WED, kev.id))[0] === open);
  ok('no slots at all on his day off', (await slots(A, THU, kev.id)).length === 0);
  ok('"Any barber" still offers Thursday through Leo', (await slots(A, THU, 'any')).length > 0);
  r = await call('GET', `/api/schedules?branch=${A.id}`, null, owner);
  const ks = r.j.find?.(x => x.staffId === kev.id);
  ok('the schedule list shows each barber of the branch', r.s === 200 && ks && ks.days[2].start === '13:00' && ks.days[4] === 'off' && ks.days[3] === null && r.j.some(x => x.staffId === leo.id), r.j);

  // ---------- booking checks the same rules ----------
  const app = (await call('POST', '/api/bh/signup', { name: 'Ana Reyes', email: 'ana@example.com', phone: '0917 222 3333', password: 'password123', agree: true })).j.token;
  const book = (date, time, staffId, n) => call('POST', '/api/bh/book', { branchId: A.id, staffId, itemIds: [cut.id], date, time }, app, { 'Idempotency-Key': 'sched-test-key-0000' + n });
  ok('a Tuesday 10:00 booking with Kev is refused', (await book(TUE, '10:00', kev.id, 1)).s === 409);
  r = await book(TUE, '10:00', 'any', 2);
  ok('"Any barber" at Tuesday 10:00 goes to Leo, not Kev', r.s === 201 && r.j.booking.staff === 'Leo', r.j);

  // ---------- approved leave ----------
  const lv = (await call('POST', '/api/leaves', { branchId: A.id, staffId: kev.id, type: 'Vacation', from: FRI, to: FRI, reason: 'Family trip' }, owner)).j;
  ok('pending leave does not close slots yet', (await slots(A, FRI, kev.id)).length > 0);
  await call('PUT', `/api/leaves/${lv.id}/review`, { action: 'approve' }, owner);
  ok('approved leave closes the whole day', (await slots(A, FRI, kev.id)).length === 0);

  // ---------- blocked time (a break, training) ----------
  r = await call('POST', '/api/bh/pro/block', { staffId: kev.id, date: MON, from: '10:00', to: '12:00', reason: 'Training' }, owner);
  ok('a 10:00-12:00 block is saved', r.s === 201, r);
  t = await slots(A, MON, kev.id);
  ok('the blocked times are gone, the rest stay', !['10:00', '10:30', '11:00', '11:30'].some(x => t.includes(x)) && t.includes('09:30') && t.includes('12:00'), t);
  ok('booking into the block is refused', (await book(MON, '10:30', kev.id, 3)).s === 409);

  // ---------- a branch without the new system keeps today's behaviour ----------
  ok('a schedule can be saved for Bob in branch B', (await call('PUT', `/api/schedules/${bob.id}`, { days: week({ 2: { start: '13:00', end: '19:00' } }) }, owner)).s === 200);
  ok('but branch B is not switched on, so Bob still has Tuesday morning slots', (await slots(B, TUE, bob.id))[0] === (B.openTime || '09:00'));

  // ---------- checks ----------
  ok('times must be HH:MM, start before end', (await call('PUT', `/api/schedules/${kev.id}`, { days: week({ 1: { start: '9am', end: '17:00' } }) }, owner)).s === 400
    && (await call('PUT', `/api/schedules/${kev.id}`, { days: week({ 1: { start: '17:00', end: '09:00' } }) }, owner)).s === 400
    && (await call('PUT', `/api/schedules/${kev.id}`, { days: [null] }, owner)).s === 400);
  await call('POST', '/api/users', { name: 'Manager Max', username: 'max', password: 'maxpass1', role: 'manager', branchIds: [C.id] }, owner);
  const max = (await call('POST', '/api/login', { username: 'max', password: 'maxpass1' })).j.token;
  await call('POST', '/api/users', { name: 'Manager Mia', username: 'mia', password: 'miapass1', role: 'manager', branchIds: [A.id] }, owner);
  const mia = (await call('POST', '/api/login', { username: 'mia', password: 'miapass1' })).j.token;
  ok("branch A's manager sets Leo's hours", (await call('PUT', `/api/schedules/${leo.id}`, { days: week({ 6: 'off' }) }, mia)).s === 200);
  ok("another branch's manager cannot", (await call('PUT', `/api/schedules/${kev.id}`, { days: week() }, max)).s === 403 && (await call('GET', `/api/schedules?branch=${A.id}`, null, max)).s === 403);
  await call('POST', '/api/users', { name: 'Desk Dina', username: 'dina', pin: '111111', role: 'cashier', branchId: A.id }, owner);
  const desk = (await call('POST', '/api/login', { pin: '111111' })).j.token;
  ok('the front desk cannot change hours', (await call('PUT', `/api/schedules/${kev.id}`, { days: week() }, desk)).s === 403);
  r = await call('PUT', `/api/schedules/${kev.id}`, { days: null }, owner);
  ok('clearing the schedule goes back to branch hours', r.s === 200 && (await slots(A, TUE, kev.id))[0] === open);
  ok('changes are in the activity log', JSON.stringify((await call('GET', '/api/audit', null, owner)).j).includes('schedule'));
} catch (e) { fail(e); }
await S.stop();
done();
