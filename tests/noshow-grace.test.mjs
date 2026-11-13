// T19 (D-7): a booking can be marked no-show only after its start time plus the late grace it was made under (5 minutes by
// default). The history records who marked it. Bookings made before the policy existed: from the start time.
import { DatabaseSync } from 'node:sqlite';
import { startServer, checker, ymd } from './helper.mjs';
const { ok, done, fail } = checker();
const S = await startServer(3168);
const { call } = S;
const hm = d => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
try {
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  const st = (await call('GET', '/api/state', null, owner)).j, A = st.branches[0];
  const trim = (await call('POST', '/api/items', { name: 'Quick Trim', price: 100, type: 'service', mins: 30, bookable: 1, active: 1 }, owner)).j;
  const kev = (await call('POST', '/api/staff', { name: 'Kev', branchId: A.id, chairId: st.chairs.find(c => c.branchId === A.id).id, pct: 40, allowance: 0 }, owner)).j;
  await call('POST', '/api/users', { name: 'Desk Dina', username: 'dina', pin: '111111', role: 'cashier', branchId: A.id }, owner);
  const desk = (await call('POST', '/api/login', { pin: '111111' })).j.token;
  await call('PUT', '/api/settings', { mvpBranches: [A.id] }, owner);
  const app = (await call('POST', '/api/bh/signup', { name: 'Ana Reyes', email: 'ana@example.com', phone: '0917 222 3333', password: 'password123', agree: true })).j.token;
  const D = ymd(new Date(Date.now() + 3 * 864e5));
  let n = 0;
  const book = async time => (await call('POST', '/api/bh/book', { branchId: A.id, staffId: kev.id, itemIds: [trim.id], date: D, time }, app, { 'Idempotency-Key': 'noshow-test-key-' + String(++n).padStart(6, '0') })).j.booking.id;
  const db = new DatabaseSync(S.dbFile);
  const startAt = (id, minsFromNow) => { const t = new Date(Date.now() + minsFromNow * 60e3); db.prepare('update bookings set date=?, time=? where id=?').run(ymd(t), hm(t), id); };
  const noshow = id => call('PUT', `/api/bookings/${id}`, { status: 'noshow' }, desk);

  const b1 = await book('10:00');
  let r = await noshow(b1);
  ok('a booking days away cannot be marked no-show', r.s === 409 && /no-show/i.test(r.j.error), r);
  startAt(b1, -3);
  r = await noshow(b1);
  ok('3 minutes after the start, inside the 5-minute grace, still not', r.s === 409 && /\d{2}:\d{2}/.test(r.j.error), r);
  ok('and the booking stays booked', db.prepare('select status from bookings where id=?').get(b1).status === 'booked');
  startAt(b1, -7);
  r = await noshow(b1);
  ok('7 minutes after the start, past the grace, the front desk marks the no-show', r.s === 200 && db.prepare('select status from bookings where id=?').get(b1).status === 'noshow', r);
  const ev = db.prepare('select * from booking_events where bookingId=? order by rowid').all(b1).at(-1);
  ok('the history records who marked it', ev.toStatus === 'noshow' && ev.actor === 'Desk Dina', ev);

  // a longer grace set by the owner is kept by bookings made under it
  await call('PUT', '/api/settings', { policy: { branchId: A.id, noshowGraceMins: 15 } }, owner);
  const b2 = await book('11:00');
  await call('PUT', '/api/settings', { policy: { branchId: A.id, noshowGraceMins: 5 } }, owner);
  startAt(b2, -10);
  ok('a booking made under a 15-minute grace still gets 15 minutes', (await noshow(b2)).s === 409);
  startAt(b2, -16);
  ok('after 15 minutes it can be marked', (await noshow(b2)).s === 200);

  // older bookings (no stored policy): from the start time
  const b3 = await book('12:00');
  db.prepare('update bookings set policy=null where id=?').run(b3);
  startAt(b3, 20);
  ok('an older booking cannot be marked before its start time', (await noshow(b3)).s === 409);
  startAt(b3, -1);
  ok('but can right after it', (await noshow(b3)).s === 200);

  // cancelling is not limited by the grace
  const b4 = await book('13:00');
  ok('the shop can still cancel a booking any time', (await call('PUT', `/api/bookings/${b4}`, { status: 'cancelled', reason: 'Customer called' }, desk)).s === 200);
  db.close();
} catch (e) { fail(e); }
await S.stop();
done();
