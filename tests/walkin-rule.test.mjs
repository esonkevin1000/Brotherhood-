// T23 (D-8): walk-ins never break a booked appointment. The rule on its own, then through the app in a pilot branch.
import { DatabaseSync } from 'node:sqlite';
import { walkinFit } from '../src/lib/queue.js';
import { startServer, checker } from './helper.mjs';
const { ok, done, fail } = checker();
const hm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
try {
  // ---------- the rule (minutes after midnight; now = 10:00 = 600) ----------
  ok('no bookings: safe now', walkinFit({ now: 600, mins: 30 }).safeNow === true);
  ok('a booking at 10:40: a 30-minute cut ends 10:30, 10 minutes before: safe', walkinFit({ now: 600, mins: 30, bookings: [{ start: 640, mins: 30 }] }).safeNow === true);
  ok('a booking at 10:34: ends 10:30, only 4 minutes before: not safe', walkinFit({ now: 600, mins: 30, bookings: [{ start: 634, mins: 30 }] }).safeNow === false);
  ok('exactly 5 minutes before is allowed', walkinFit({ now: 600, mins: 30, bookings: [{ start: 635, mins: 30 }] }).safeNow === true);
  ok('then the earliest safe start is when that appointment ends', walkinFit({ now: 600, mins: 30, bookings: [{ start: 620, mins: 45 }] }).earliest === 665);
  ok('two bookings close together push it past both', walkinFit({ now: 600, mins: 30, bookings: [{ start: 620, mins: 30 }, { start: 670, mins: 30 }] }).earliest === 700);
  ok('a gap big enough between bookings is used', walkinFit({ now: 600, mins: 30, bookings: [{ start: 610, mins: 30 }, { start: 720, mins: 30 }] }).earliest === 640);
  ok('a barber still cutting starts later', walkinFit({ now: 600, mins: 30, busyUntil: 620 }).safeNow === false && walkinFit({ now: 600, mins: 30, busyUntil: 620 }).earliest === 620);
  ok('a booking already over does not count', walkinFit({ now: 600, mins: 30, bookings: [{ start: 540, mins: 30 }] }).safeNow === true);
  ok('nothing fits before closing: no time today', walkinFit({ now: 1230, mins: 30, bookings: [{ start: 1240, mins: 30 }], close: 1260 }).earliest === null);

  // ---------- in the app, pilot branch ----------
  const S = await startServer(3184);
  try {
    const { call } = S;
    const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
    const st = (await call('GET', '/api/state', null, owner)).j, [A, B] = st.branches;
    const trim = (await call('POST', '/api/items', { name: 'Quick Trim', price: 150, type: 'service', mins: 30, bookable: 1, active: 1 }, owner)).j;
    const mk = async (name, br, k) => (await call('POST', '/api/staff', { name, branchId: br.id, chairId: st.chairs.filter(c => c.branchId === br.id)[k].id, pct: 40, allowance: 0 }, owner)).j;
    const kev = await mk('Kev', A, 0), leo = await mk('Leo', A, 1), bob = await mk('Bob', B, 0);
    await call('POST', '/api/users', { name: 'Desk Dina', username: 'dina', pin: '111111', role: 'cashier', branchId: A.id }, owner);
    await call('POST', '/api/users', { name: 'Desk Bea', username: 'bea', pin: '222222', role: 'cashier', branchId: B.id }, owner);
    const desk = (await call('POST', '/api/login', { pin: '111111' })).j.token, deskB = (await call('POST', '/api/login', { pin: '222222' })).j.token;
    await call('PUT', '/api/settings', { attPhoto: false }, owner);
    await call('PUT', '/api/settings', { mvpBranches: [A.id] }, owner);
    for (const [s, t] of [[kev, desk], [leo, desk], [bob, deskB]]) await call('POST', '/api/attendance', { staffId: s.id, action: 'in' }, t);
    const items = [{ itemId: trim.id, qty: 1 }];
    const db = new DatabaseSync(S.dbFile, { timeout: 5000 });
    // Kev has a booking 20 minutes from now (a 30-minute walk-in would run into it)
    const app = (await call('POST', '/api/bh/signup', { name: 'Ana Reyes', email: 'ana@example.com', phone: '0917 222 3333', password: 'password123', agree: true })).j.token;
    const D = new Date(Date.now() + 2 * 864e5), Ds = `${D.getFullYear()}-${String(D.getMonth() + 1).padStart(2, '0')}-${String(D.getDate()).padStart(2, '0')}`;
    const bk = (await call('POST', '/api/bh/book', { branchId: A.id, staffId: kev.id, itemIds: [trim.id], date: Ds, time: '10:00' }, app, { 'Idempotency-Key': 'walkin-rule-key-0001' })).j.booking;
    const n = new Date(), soon = n.getHours() * 60 + n.getMinutes() + 20, today = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
    db.prepare('update bookings set date=?, time=? where id=?').run(today, hm(soon), bk.id);
    let r = await call('GET', `/api/svc/walkin-options?items=${trim.id}`, null, desk);
    const ok1 = r.j.barbers?.find(b => b.staffId === kev.id), ol = r.j.barbers?.find(b => b.staffId === leo.id);
    ok('the front desk sees Kev is not safe now (booking soon), with his earliest safe start', r.s === 200 && ok1?.safe === false && ok1.earliest === hm(soon + 30) && ok1.nextBooking === hm(soon), r.j);
    ok('and Leo offered first, safe now', ol?.safe === true && r.j.barbers[0].staffId === leo.id);
    const w1 = (await call('POST', '/api/svc/walkin', { name: 'Walk One', items }, desk)).j.id;
    r = await call('POST', `/api/svc/${w1}/start`, { barberId: kev.id }, desk);
    ok('starting the walk-in with Kev is refused, saying why and when he is free', r.s === 409 && new RegExp(`booking at`).test(r.j.error) && r.j.error.includes('Leo'), r);
    ok('with Leo it works', (await call('POST', `/api/svc/${w1}/start`, { barberId: leo.id }, desk)).s === 200);
    { const wx = (await call('POST', '/api/svc/walkin', { name: 'Walk X', items }, desk)).j.id, rx = await call('POST', `/api/svc/${wx}/start`, { barberId: leo.id }, desk);
      ok('a barber who is cutting (no booking) is reported as busy, not as booked', rx.s === 409 && /Leo is already cutting/.test(rx.j.error), rx); await call('POST', `/api/svc/${wx}/cancel`, {}, desk); }
    r = await call('POST', '/api/svc/walkin', { name: 'Walk Two', items, barberId: kev.id }, desk);
    ok('a walk-in asked for Kev waits instead of taking his time', r.s === 201 && r.j.status === 'waiting' && !r.j.barberId, r.j);
    // the booked customer arrives: his own booking does not block him
    r = await call('POST', `/api/bookings/${bk.id}/arrive`, null, desk);
    const ao = r.j.order.id;
    ok("the booked customer can start with Kev (his own booking does not block him)", r.j.order.status === 'in_chair' || (await call('POST', `/api/svc/${ao}/start`, { barberId: kev.id }, desk)).s === 200);
    // a branch without the new system keeps today's behaviour
    const w3 = (await call('POST', '/api/svc/walkin', { name: 'Walk Three', items, branchId: B.id }, deskB)).j.id;
    db.prepare("update bookings set branchId=?, staffId=?, status='booked', orderId='' where id=?").run(B.id, bob.id, bk.id);
    ok('in a branch not switched on, the walk-in starts as today', (await call('POST', `/api/svc/${w3}/start`, { barberId: bob.id }, deskB)).s === 200);
    db.close();
  } finally { await S.stop(); }
} catch (e) { fail(e); }
done();
