// T12: the customer app (/api/bh) as it works today. Sign-up and login, the 1-hour cancel cutoff, verified reviews,
// points and rewards, and deleting an account. These lock today's behaviour in before the booking and loyalty work changes things.
import { DatabaseSync } from 'node:sqlite';
import { startServer, checker, ymd } from './helper.mjs';
const { ok, done, fail } = checker();
const S = await startServer(3158);
const { call } = S;
const hm = d => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
try {
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  const st = (await call('GET', '/api/state', null, owner)).j, br = st.branches[0], ch = st.chairs.filter(c => c.branchId === br.id);
  const cut = st.items.find(i => i.type === 'service' && i.bookable !== 0) || st.items[0];
  const kev = (await call('POST', '/api/staff', { name: 'Kev', branchId: br.id, chairId: ch[0].id, pct: 40, allowance: 0 }, owner)).j;
  const desk = (await call('POST', '/api/users', { name: 'Desk Dina', username: 'dina', pin: '111111', role: 'cashier', branchId: br.id }, owner)).j;
  const deskTok = (await call('POST', '/api/login', { pin: '111111' })).j.token;
  ok('test shop ready', !!kev.id && !!desk.id && !!deskTok);

  // ---------- sign-up ----------
  const base = { name: 'Ana Reyes', email: 'Ana@Example.com', phone: '0917 222 3333', password: 'password123', agree: true };
  ok('sign-up needs the Terms accepted', (await call('POST', '/api/bh/signup', { ...base, agree: false })).s === 400);
  ok('a password under 8 characters is refused', (await call('POST', '/api/bh/signup', { ...base, password: 'short1' })).s === 400);
  ok('a bad email or mobile number is refused', (await call('POST', '/api/bh/signup', { ...base, email: 'nope' })).s === 400 && (await call('POST', '/api/bh/signup', { ...base, phone: '123' })).s === 400);
  let r = await call('POST', '/api/bh/signup', base);
  ok('a customer signs up and is logged in', r.s === 201 && !!r.j.token && r.j.user.email === 'ana@example.com', r);
  let ana = r.j.token;
  ok('the same email cannot sign up twice (any capitals)', (await call('POST', '/api/bh/signup', { ...base, email: 'ANA@example.com' })).s === 409);
  ok('the account does not show the password hash', !JSON.stringify(r.j).includes('passHash'));

  // ---------- login ----------
  ok('a wrong password is refused with one message', (r = await call('POST', '/api/bh/login', { email: 'ana@example.com', password: 'wrong-pass' })).s === 401 && r.j.error === 'Wrong email or password');
  ok('an unknown email gets the same message', (r = await call('POST', '/api/bh/login', { email: 'nobody@example.com', password: 'password123' })).s === 401 && r.j.error === 'Wrong email or password');
  ok('login works, email in any capitals', (await call('POST', '/api/bh/login', { email: 'ANA@EXAMPLE.COM', password: 'password123' })).s === 200);
  ok('a stray space after the password (phone keyboards) still works', (await call('POST', '/api/bh/login', { email: 'ana@example.com', password: 'password123 ' })).s === 200);
  ok('the profile needs a login', (await call('GET', '/api/bh/me')).s === 401 && (await call('GET', '/api/bh/me', null, ana)).j.user.name === 'Ana Reyes');

  // ---------- changing the password ----------
  ok('changing the password needs the current one', (await call('PUT', '/api/bh/me/password', { current: 'nope', password: 'newpassword1' }, ana)).s === 403);
  ok('the new one needs 8 characters', (await call('PUT', '/api/bh/me/password', { current: 'password123', password: 'short' }, ana)).s === 400);
  r = await call('PUT', '/api/bh/me/password', { current: 'password123', password: 'newpassword1' }, ana);
  ok('the password changes and a new login comes back', r.s === 200 && !!r.j.token, r); ana = r.j.token;
  ok('the old password stops working, the new one works', (await call('POST', '/api/bh/login', { email: 'ana@example.com', password: 'password123' })).s === 401 && (await call('POST', '/api/bh/login', { email: 'ana@example.com', password: 'newpassword1' })).s === 200);

  // ---------- booking and the 1-hour cancel cutoff ----------
  const D = ymd(new Date(Date.now() + 3 * 864e5));
  const book = async (time, key) => (await call('POST', '/api/bh/book', { branchId: br.id, staffId: kev.id, itemIds: [cut.id], date: D, time }, ana, { 'Idempotency-Key': 'acct-test-key-' + key })).j.booking;
  const b1 = await book('10:00', '000000001'), b2 = await book('11:00', '000000002'), b3 = await book('13:00', '000000003');
  ok('three bookings made', !!(b1 && b2 && b3), [b1, b2, b3]);
  let mine = (await call('GET', '/api/bh/bookings', null, ana)).j.bookings;
  ok('a booking days away can be cancelled', mine.find(x => x.id === b1.id)?.canCancel === true);
  ok('the customer cancels it', (await call('POST', `/api/bh/bookings/${b1.id}/cancel`, null, ana)).s === 200 && (await call('POST', `/api/bh/bookings/${b1.id}/cancel`, null, ana)).s === 409);
  // move b2 to 30 minutes from now (straight in the database: the app itself never books that close)
  const db = new DatabaseSync(S.dbFile), soon = new Date(Date.now() + 30 * 60e3);
  db.prepare('update bookings set date=?, time=? where id=?').run(ymd(soon), hm(soon), b2.id);
  mine = (await call('GET', '/api/bh/bookings', null, ana)).j.bookings;
  ok('less than 1 hour before, the app shows no cancel button', mine.find(x => x.id === b2.id)?.canCancel === false);
  r = await call('POST', `/api/bh/bookings/${b2.id}/cancel`, null, ana);
  ok('and cancelling is refused with the reason', r.s === 409 && /1 hour/.test(r.j.error), r);

  // a second customer cannot touch Ana's bookings
  r = await call('POST', '/api/bh/signup', { name: 'Ben Cruz', email: 'ben@example.com', phone: '0917 333 4444', password: 'password123', agree: true }); const ben = r.j.token;
  ok("another customer cannot cancel Ana's booking", (await call('POST', `/api/bh/bookings/${b3.id}/cancel`, null, ben)).s === 404);

  // ---------- verified reviews ----------
  ok('no review before the visit', (await call('POST', '/api/bh/reviews', { bookingId: b3.id, rating: 5, text: 'Great' }, ana)).s === 404);
  db.prepare('update bookings set date=? where id=?').run(ymd(new Date()), b3.id);
  r = await call('POST', `/api/bookings/${b3.id}/arrive`, null, deskTok); const order = r.j.order;
  ok('the front desk checks the customer in', r.s === 200 && !!order?.id, r);
  if (order.status !== 'in_chair') await call('POST', `/api/svc/${order.id}/start`, { barberId: kev.id }, deskTok);
  r = await call('POST', `/api/svc/${order.id}/finish`, { method: 'Cash', barberId: kev.id }, deskTok);
  ok('and finishes the visit (paid)', r.s === 200, r);
  mine = (await call('GET', '/api/bh/bookings', null, ana)).j.bookings;
  ok('now the app offers a review', mine.find(x => x.id === b3.id)?.canReview === true);
  ok('a rating must be 1 to 5 stars', (await call('POST', '/api/bh/reviews', { bookingId: b3.id, rating: 0 }, ana)).s === 400 && (await call('POST', '/api/bh/reviews', { bookingId: b3.id, rating: 9 }, ana)).s === 400);
  ok("another customer cannot review Ana's visit", (await call('POST', '/api/bh/reviews', { bookingId: b3.id, rating: 1, text: 'bad' }, ben)).s === 404);
  ok('Ana reviews it once', (await call('POST', '/api/bh/reviews', { bookingId: b3.id, rating: 5, text: 'Clean fade' }, ana)).s === 201 && (await call('POST', '/api/bh/reviews', { bookingId: b3.id, rating: 4 }, ana)).s === 409);
  const rv = (await call('GET', '/api/reviews', null, owner)).j.find(x => x.text === 'Clean fade');
  ok('the review is marked verified, under her short name, with the barber', rv && rv.verified === 1 && rv.staffId === kev.id && rv.name !== 'Ana Reyes', rv);
  mine = (await call('GET', '/api/bh/bookings', null, ana)).j.bookings;
  ok('the app shows it as reviewed', mine.find(x => x.id === b3.id)?.reviewed === true && mine.find(x => x.id === b3.id)?.canReview === false);

  // ---------- points and rewards ----------
  r = await call('POST', '/api/bh/pro/rewards', { name: 'P50 off', kind: 'amount', value: 50, cost: 1 }, owner);
  ok('the owner adds a reward worth 1 point', r.s === 201, r); const rewardId = r.j.id;
  ok('only the owner can add rewards', (await call('POST', '/api/bh/pro/rewards', { name: 'Free', kind: 'amount', value: 50, cost: 1 }, deskTok)).s === 403);
  r = await call('GET', '/api/bh/loyalty', null, ana);
  ok('1 paid visit = 1 point, linked to her customer record', r.s === 200 && r.j.linked && r.j.visits === 1 && r.j.balance === 1 && r.j.rewards.some(x => x.id === rewardId), r.j);
  ok('Ben has no points yet and cannot redeem', (await call('POST', `/api/bh/rewards/${rewardId}/redeem`, null, ben)).s === 409);
  r = await call('POST', `/api/bh/rewards/${rewardId}/redeem`, null, ana);
  ok('Ana redeems it: a one-use code, valid 60 days, points go down', r.s === 201 && /^RW[A-Z2-9]{6}$/.test(r.j.code) && r.j.balance === 0 && r.j.expires > ymd(new Date(Date.now() + 59 * 864e5)), r.j);
  ok('without points left, a second redeem is refused', (await call('POST', `/api/bh/rewards/${rewardId}/redeem`, null, ana)).s === 409);
  ok('the voucher is listed in the app', (await call('GET', '/api/bh/loyalty', null, ana)).j.vouchers.some(v => v.code === r.j.code && v.status === 'active'));

  // ---------- deleting the account ----------
  ok('deleting the account needs the password', (await call('DELETE', '/api/bh/me', { password: 'wrong' }, ana)).s === 403);
  r = await call('DELETE', '/api/bh/me', { password: 'newpassword1' }, ana);
  ok('the customer deletes the account', r.s === 200, r);
  ok('the old login stops working and the account is gone', (await call('GET', '/api/bh/me', null, ana)).s === 401 && (await call('POST', '/api/bh/login', { email: 'ana@example.com', password: 'newpassword1' })).s === 401);
  const row = db.prepare('select userId, customerName from bookings where id=?').get(b3.id);
  ok("the shop keeps its booking record, no longer linked to the app account", row && row.userId === '' && !!row.customerName, row);
  ok('her review stays, unlinked', db.prepare('select userId from reviews where orderId=?').get(order.id)?.userId === '');
  ok('her vouchers are removed', db.prepare("select count(*) n from bh_promos where code like 'RW%'").get().n === 0);
  ok('the email can sign up again', (await call('POST', '/api/bh/signup', base)).s === 201);
  db.close();
} catch (e) { fail(e); }
await S.stop();
done();
