// T18: moving a booking to another free time. The customer (before the cancel cutoff) or staff can do it; the booking keeps its id,
// the history shows the move, and the old time frees only when the move is saved. A failed move leaves the booking as it was.
import { DatabaseSync } from 'node:sqlite';
import { startServer, checker, ymd } from './helper.mjs';
const { ok, done, fail } = checker();
const S = await startServer(3141);
const { call } = S;
const hm = d => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
try {
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  const st = (await call('GET', '/api/state', null, owner)).j, [A, B] = st.branches, ch = st.chairs.filter(c => c.branchId === A.id);
  const trim = (await call('POST', '/api/items', { name: 'Quick Trim', price: 100, type: 'service', mins: 30, bookable: 1, active: 1 }, owner)).j;
  const kev = (await call('POST', '/api/staff', { name: 'Kev', branchId: A.id, chairId: ch[0].id, pct: 40, allowance: 0 }, owner)).j;
  const leo = (await call('POST', '/api/staff', { name: 'Leo', branchId: A.id, chairId: ch[1].id, pct: 40, allowance: 0 }, owner)).j;
  await call('POST', '/api/users', { name: 'Desk Dina', username: 'dina', pin: '111111', role: 'cashier', branchId: A.id }, owner);
  await call('POST', '/api/users', { name: 'Desk Bea', username: 'bea', pin: '222222', role: 'cashier', branchId: B.id }, owner);
  const desk = (await call('POST', '/api/login', { pin: '111111' })).j.token, deskB = (await call('POST', '/api/login', { pin: '222222' })).j.token;
  const D = ymd(new Date(Date.now() + 3 * 864e5)), D2 = ymd(new Date(Date.now() + 4 * 864e5));
  const signup = async (name, email, phone) => (await call('POST', '/api/bh/signup', { name, email, phone, password: 'password123', agree: true })).j.token;
  const ana = await signup('Ana Reyes', 'ana@example.com', '0917 222 3333'), ben = await signup('Ben Cruz', 'ben@example.com', '0917 333 4444');
  let n = 0;
  const book = async (tok, time, staff = kev) => (await call('POST', '/api/bh/book', { branchId: A.id, staffId: staff.id, itemIds: [trim.id], date: D, time }, tok, { 'Idempotency-Key': 'resched-test-key-' + String(++n).padStart(6, '0') })).j.booking;
  const move = (tok, id, body) => call('POST', `/api/bh/bookings/${id}/reschedule`, body, tok);
  const slots = async (date = D, staff = kev) => (await call('GET', `/api/public/slots?branch=${A.id}&date=${date}&staff=${staff.id}&items=${trim.id}`)).j.slots;
  const db = new DatabaseSync(S.dbFile, { timeout: 5000 }), row = id => db.prepare('select * from bookings where id=?').get(id);

  const b1 = await book(ana, '10:00'), b2 = await book(ben, '13:00');
  ok('two bookings made', !!b1?.id && !!b2?.id);

  // ---------- the customer moves a booking ----------
  let r = await move(ana, b1.id, { date: D, time: '11:00' });
  ok('Ana moves her 10:00 to 11:00', r.s === 200 && r.j.booking.id === b1.id && r.j.booking.time === '11:00', r);
  ok('it is the same booking, now at 11:00, still booked', row(b1.id).time === '11:00' && row(b1.id).status === 'booked' && db.prepare('select count(*) n from bookings').get().n === 2);
  const s1 = await slots();
  ok('10:00 is free again, 11:00 is taken', s1.includes('10:00') && !s1.includes('11:00'), s1);
  const ev = db.prepare('select * from booking_events where bookingId=? order by rowid').all(b1.id).at(-1);
  ok('the history shows the move, by whom, from where to where', ev.fromStatus === 'booked' && ev.toStatus === 'booked' && /rescheduled/i.test(ev.reason) && /10:00/.test(ev.reason) && /11:00/.test(ev.reason) && /app/i.test(ev.actor), ev);
  ok('moving to a time next to the old one works (its own time does not block it)', (await move(ana, b1.id, { date: D, time: '11:30' })).s === 200 && row(b1.id).time === '11:30');

  // ---------- a failed move changes nothing ----------
  r = await move(ana, b1.id, { date: D, time: '13:00' });
  ok("moving onto Ben's 13:00 is refused", r.s === 409, r);
  ok('and Ana keeps 11:30', row(b1.id).time === '11:30' && row(b1.id).staffId === kev.id);
  ok('a date in the past is refused, nothing changes', (await move(ana, b1.id, { date: '2020-01-01', time: '10:00' })).s === 400 && row(b1.id).date === D);
  ok("Ben cannot move Ana's booking", (await move(ben, b1.id, { date: D, time: '15:00' })).s === 404 && row(b1.id).time === '11:30');
  r = await move(ana, b1.id, { date: D2, time: '10:00', staffId: leo.id });
  ok('she can move to another day and another barber', r.s === 200 && row(b1.id).date === D2 && row(b1.id).staffId === leo.id && r.j.booking.staff === 'Leo', r);
  ok('and the old day frees', (await slots(D)).includes('11:30'));

  // ---------- the cancel cutoff also limits customer moves; staff can still move ----------
  const soon = new Date(Date.now() + 30 * 60e3);
  db.prepare('update bookings set date=?, time=? where id=?').run(ymd(soon), hm(soon), b2.id);
  r = await move(ben, b2.id, { date: D, time: '15:00' });
  ok('30 minutes before, the customer can no longer move it (1-hour rule)', r.s === 409 && /1 hour/.test(r.j.error), r);
  ok('the app shows no reschedule button then', (await call('GET', '/api/bh/bookings', null, ben)).j.bookings.find(x => x.id === b2.id)?.canReschedule === false);
  r = await call('POST', `/api/bookings/${b2.id}/reschedule`, { date: D, time: '15:00' }, desk);
  ok('the front desk can still move it', r.s === 200 && row(b2.id).date === D && row(b2.id).time === '15:00', r);
  ok("another branch's front desk cannot", (await call('POST', `/api/bookings/${b2.id}/reschedule`, { date: D, time: '16:00' }, deskB)).s === 403 && row(b2.id).time === '15:00');
  const ev2 = db.prepare('select * from booking_events where bookingId=? order by rowid').all(b2.id).at(-1);
  ok("the history names the staff member", ev2.actor === 'Desk Dina' && /rescheduled/i.test(ev2.reason), ev2);
  ok('the app now shows a reschedule button again (the new time is days away)', (await call('GET', '/api/bh/bookings', null, ben)).j.bookings.find(x => x.id === b2.id)?.canReschedule === true);

  // ---------- only booked bookings move ----------
  await call('POST', `/api/bh/bookings/${b2.id}/cancel`, null, ben);
  ok('a cancelled booking cannot be moved', (await move(ben, b2.id, { date: D, time: '16:00' })).s === 409 && (await call('POST', `/api/bookings/${b2.id}/reschedule`, { date: D, time: '16:00' }, desk)).s === 409);
  db.close();
} catch (e) { fail(e); }
await S.stop();
done();
