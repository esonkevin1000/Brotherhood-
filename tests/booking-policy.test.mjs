// T17 (D-7): booking policy per branch (slot interval, buffer, no-show grace, cancel cutoff), set by the owner, used in branches on
// the new booking system, shown to the guest before confirming, and stored with each booking so a later change never alters it.
import { DatabaseSync } from 'node:sqlite';
import { startServer, checker, ymd } from './helper.mjs';
const { ok, done, fail } = checker();
const S = await startServer(3173);
const { call } = S;
const hm = d => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
try {
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  const st = (await call('GET', '/api/state', null, owner)).j, [A, B] = st.branches;
  const trim = (await call('POST', '/api/items', { name: 'Quick Trim', price: 100, type: 'service', mins: 30, bookable: 1, active: 1 }, owner)).j;
  const mk = async (name, br) => (await call('POST', '/api/staff', { name, branchId: br.id, chairId: st.chairs.find(c => c.branchId === br.id).id, pct: 40, allowance: 0 }, owner)).j;
  const kev = await mk('Kev', A), bob = await mk('Bob', B);
  await call('POST', '/api/users', { name: 'Admin Ana', username: 'ana', password: 'adminpass1', role: 'admin' }, owner);
  const ana = (await call('POST', '/api/login', { username: 'ana', password: 'adminpass1' })).j.token;
  await call('PUT', '/api/settings', { mvpBranches: [A.id] }, owner);
  const D = ymd(new Date(Date.now() + 3 * 864e5));
  const slots = async (br, staff) => (await call('GET', `/api/public/slots?branch=${br.id}&date=${D}&staff=${staff.id}&items=${trim.id}`)).j.slots;
  const info = async br => (await call('GET', '/api/public/info')).j.branches.find(b => b.id === br.id);

  // ---------- defaults (D-7: 30-minute slots, 5-minute grace) ----------
  let r = await call('GET', '/api/settings', null, owner);
  const dp = r.j.policy[A.id];
  ok('every branch starts with the agreed defaults', dp.slotStep === 30 && dp.noshowGraceMins === 5 && dp.cancelCutoffMins === 60 && dp.bufferMins === 0 && r.j.policy[B.id].slotStep === 30, r.j.policy);
  ok('slots are every 30 minutes at first', (await slots(A, kev)).slice(0, 3).join() === '09:00,09:30,10:00');
  ok('the booking page is told the policy before confirming', (await info(A)).policy?.cancelCutoffMins === 60 && (await info(A)).policy?.noshowGraceMins === 5, await info(A));

  // ---------- the owner changes it ----------
  r = await call('PUT', '/api/settings', { policy: { branchId: A.id, slotStep: 15, bufferMins: 15, noshowGraceMins: 10, cancelCutoffMins: 120 } }, owner);
  ok('the owner sets branch A: 15-minute slots, 15-minute buffer, 10-minute grace, cancel up to 2 hours before', r.s === 200, r);
  const pa = (await call('GET', '/api/settings', null, owner)).j.policy[A.id];
  ok('and it is saved', pa.slotStep === 15 && pa.bufferMins === 15 && pa.noshowGraceMins === 10 && pa.cancelCutoffMins === 120, pa);
  ok('slots follow the new interval', (await slots(A, kev)).slice(0, 4).join() === '09:00,09:15,09:30,09:45');
  ok('the booking page shows the new policy', (await info(A)).policy.cancelCutoffMins === 120 && (await info(A)).policy.noshowGraceMins === 10);
  ok('only the owner changes it (not an admin); unknown branch and odd values are refused',
    (await call('PUT', '/api/settings', { policy: { branchId: A.id, slotStep: 30 } }, ana)).s === 403
    && (await call('PUT', '/api/settings', { policy: { branchId: 'nope', slotStep: 30 } }, owner)).s === 400
    && (await call('PUT', '/api/settings', { policy: { branchId: A.id, slotStep: 7 } }, owner)).s === 400
    && (await call('PUT', '/api/settings', { policy: { branchId: A.id, cancelCutoffMins: -5 } }, owner)).s === 400
    && (await call('PUT', '/api/settings', { policy: { branchId: A.id, noshowGraceMins: 99 } }, owner)).s === 400);
  ok('a refused change leaves the saved policy as it was', (await call('GET', '/api/settings', null, owner)).j.policy[A.id].slotStep === 15);
  ok('the change is in the activity log', JSON.stringify((await call('GET', '/api/audit', null, owner)).j).includes('booking policy'));

  // buffer: a 10:00-10:30 booking with a 15-minute buffer closes 10:15 and 10:30 but not 10:45
  const app = (await call('POST', '/api/bh/signup', { name: 'Ana Reyes', email: 'ana@example.com', phone: '0917 222 3333', password: 'password123', agree: true })).j.token;
  const book = (time, n, br = A, staff = kev) => call('POST', '/api/bh/book', { branchId: br.id, staffId: staff.id, itemIds: [trim.id], date: D, time }, app, { 'Idempotency-Key': 'policy-test-key-0000' + n });
  r = await book('10:00', 1);
  ok('a booking is made under the 120-minute policy', r.s === 201, r);
  const b1 = r.j.booking.id;
  const t = await slots(A, kev);
  ok('the buffer keeps 15 minutes free on both sides of it', !t.includes('10:15') && !t.includes('10:30') && t.includes('10:45') && !t.includes('09:45') && !t.includes('09:30') && t.includes('09:15'), t);

  // ---------- a branch not on the new system keeps today's rules ----------
  await call('PUT', '/api/settings', { policy: { branchId: B.id, slotStep: 15, cancelCutoffMins: 240 } }, owner);
  ok('branch B is not switched on: its slots stay every 30 minutes', (await slots(B, bob)).slice(0, 3).join() === '09:00,09:30,10:00');
  ok('and its page shows the 1-hour rule it really has', (await info(B)).policy.cancelCutoffMins === 60 && (await info(B)).policy.slotStep === 30);

  // ---------- the policy is stored with the booking ----------
  const db = new DatabaseSync(S.dbFile, { timeout: 5000 });
  const stored = id => JSON.parse(db.prepare('select policy from bookings where id=?').get(id).policy);
  ok('the booking stores the policy in force when it was made', stored(b1).cancelCutoffMins === 120 && stored(b1).noshowGraceMins === 10, stored(b1));
  const soon = new Date(Date.now() + 90 * 60e3);
  db.prepare('update bookings set date=?, time=? where id=?').run(ymd(soon), hm(soon), b1);   // 90 minutes from now
  let mine = (await call('GET', '/api/bh/bookings', null, app)).j.bookings;
  ok('90 minutes before, with a 2-hour cutoff, the app offers no cancel', mine.find(x => x.id === b1).canCancel === false);
  r = await call('POST', `/api/bh/bookings/${b1}/cancel`, null, app);
  ok('and the refusal names the booking\'s own rule', r.s === 409 && /2 hours/.test(r.j.error), r);
  await call('PUT', '/api/settings', { policy: { branchId: A.id, cancelCutoffMins: 30 } }, owner);
  mine = (await call('GET', '/api/bh/bookings', null, app)).j.bookings;
  ok('the owner relaxes the cutoff to 30 minutes: the existing booking still follows 2 hours', mine.find(x => x.id === b1).canCancel === false && (await call('POST', `/api/bh/bookings/${b1}/cancel`, null, app)).s === 409);
  r = await book('13:00', 2);
  const b2 = r.j.booking.id;
  ok('a new booking stores the new cutoff', stored(b2).cancelCutoffMins === 30, stored(b2));
  const soon2 = new Date(Date.now() + 40 * 60e3);
  db.prepare('update bookings set date=?, time=? where id=?').run(ymd(soon2), hm(soon2), b2);
  ok('and can be cancelled 40 minutes before', (await call('GET', '/api/bh/bookings', null, app)).j.bookings.find(x => x.id === b2).canCancel === true && (await call('POST', `/api/bh/bookings/${b2}/cancel`, null, app)).s === 200);
  // a booking made before T17 has no stored policy: it keeps today's 1-hour rule
  const b3 = (await book('14:00', 3)).j.booking.id;
  db.prepare('update bookings set policy=null, date=?, time=? where id=?').run(ymd(new Date(Date.now() + 45 * 60e3)), hm(new Date(Date.now() + 45 * 60e3)), b3);
  ok('an older booking with no stored policy keeps the 1-hour rule', (await call('GET', '/api/bh/bookings', null, app)).j.bookings.find(x => x.id === b3).canCancel === false);
  db.close();
} catch (e) { fail(e); }
await S.stop();
done();
