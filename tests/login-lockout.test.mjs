// Guessing a PIN or a password must not be possible by simply trying many times.
// Part 1 checks the counter on its own with a pretend clock. Part 2 checks the real login on a running server.
import { createLimiter, allOf } from '../src/lib/throttle.js';
import { startServer, checker } from './helper.mjs';
const { ok, done, fail } = checker();
const MIN = 60_000;
try {
  // ---------- the counter ----------
  let t = 1_000_000; const now = () => t;
  let L = createLimiter({ max: 3, windowMs: 10 * MIN, lockMs: 10 * MIN, maxLockMs: 40 * MIN, quietMs: 24 * 60 * MIN, now });
  ok('nothing is locked at the start', L.lockedFor('a') === 0);
  L.fail('a'); L.fail('a');
  ok('below the limit there is no lock', L.lockedFor('a') === 0);
  ok('the failure that reaches the limit locks, and says for how long', L.fail('a') === 10 * MIN && L.lockedFor('a') === 10 * MIN);
  ok('another key is not affected', L.lockedFor('b') === 0);
  t += 9 * MIN; ok('still locked just before the end', L.lockedFor('a') === 1 * MIN);
  t += 1 * MIN; ok('open again when the time is over', L.lockedFor('a') === 0);
  L.fail('a'); L.fail('a'); ok('after a lock the count starts again from zero', L.lockedFor('a') === 0);
  ok('a second lock soon after is twice as long', L.fail('a') === 20 * MIN);
  t += 20 * MIN; L.fail('a'); L.fail('a'); ok('a third is longer still, up to the maximum', L.fail('a') === 40 * MIN);
  t += 40 * MIN; L.fail('a'); L.fail('a'); ok('and never longer than the maximum', L.fail('a') === 40 * MIN);
  t += 40 * MIN + 24 * 60 * MIN; L.fail('a'); L.fail('a'); ok('after a quiet day the lock time is back to normal', L.fail('a') === 10 * MIN);
  // failures spread out over a long time do not add up
  L = createLimiter({ max: 3, windowMs: 10 * MIN, lockMs: 10 * MIN, now });
  L.fail('c'); t += 6 * MIN; L.fail('c'); t += 6 * MIN;
  ok('old failures outside the window are forgotten', L.fail('c') === 0 && L.lockedFor('c') === 0);
  // success clears the count (used for usernames)
  L.fail('d'); L.fail('d'); L.clear('d'); L.fail('d'); L.fail('d');
  ok('a successful login clears the count', L.lockedFor('d') === 0);
  // failures while locked do not extend the lock
  L = createLimiter({ max: 2, windowMs: 10 * MIN, lockMs: 10 * MIN, now }); L.fail('e'); L.fail('e'); t += 5 * MIN; L.fail('e'); L.fail('e'); L.fail('e');
  ok('trying again while locked does not make the lock longer', L.lockedFor('e') === 5 * MIN);
  // memory does not grow without limit
  L = createLimiter({ max: 5, windowMs: 10 * MIN, lockMs: 10 * MIN, quietMs: 60 * MIN, now });
  for (let i = 0; i < 500; i++) L.fail('k' + i);
  t += 61 * MIN; L.fail('fresh');
  ok('keys that have been quiet are removed', L.size() <= 2, L.size());

  ok('keys that carry nothing are dropped as soon as their window is over', (() => { const M = createLimiter({ max: 5, windowMs: 10 * MIN, lockMs: 10 * MIN, now }); for (let i = 0; i < 300; i++) M.fail('q' + i); t += 11 * MIN; return M.size() === 0; })());
  // a flood of made-up keys cannot use up memory, and cannot push out a real count or a real lock
  L = createLimiter({ max: 10, windowMs: 10 * MIN, lockMs: 10 * MIN, maxKeys: 1000, now });
  for (let i = 0; i < 9; i++) L.fail('real'); L.fail('locked'); for (let i = 0; i < 9; i++) L.fail('locked');
  for (let i = 0; i < 20000; i++) L.fail('junk' + i);
  ok('a flood of made-up keys stays under the ceiling', L.size() <= 1001, L.size());
  ok('a lock survives the flood', L.lockedFor('locked') > 0);
  // the longer lock time goes back to normal a quiet day after the last lock, even with an honest typo every day
  L = createLimiter({ max: 3, windowMs: 10 * MIN, lockMs: 10 * MIN, maxLockMs: 80 * MIN, quietMs: 24 * 60 * MIN, now });
  L.fail('s'); L.fail('s'); L.fail('s'); t += 10 * MIN; L.fail('s'); L.fail('s'); ok('(setup) second lock is 20 minutes', L.fail('s') === 20 * MIN); t += 20 * MIN;
  for (let d = 0; d < 3; d++) { t += 12 * 60 * MIN; L.fail('s'); }   // one typo every 12 hours
  t += 11 * MIN; L.fail('s'); L.fail('s'); ok('one typo now and then does not keep the lock time raised for ever', L.fail('s') === 10 * MIN);
  L = createLimiter({ max: 2, windowMs: 10 * MIN, lockMs: 10 * MIN, now }); L.fail('z'); L.fail('z'); L.clear('z');
  ok('clearing while locked does not remove the lock', L.lockedFor('z') === 10 * MIN);
  // slow guessing: a short limit alone never stops someone who stays just under it, so a daily limit sits on top
  { const short = createLimiter({ max: 10, windowMs: 10 * MIN, lockMs: 10 * MIN, maxLockMs: 120 * MIN, now }), daily = createLimiter({ max: 40, windowMs: 24 * 60 * MIN, lockMs: 120 * MIN, maxLockMs: 24 * 60 * MIN, now }), both = allOf(short, daily);
    const start = t; let tries = 0, locks = 0;
    while (t - start < 24 * 60 * MIN) { if (!both.lockedFor('shop')) { tries++; if (both.fail('shop')) locks++; } t += 67_000; }   // one guess every 67 seconds, all day
    ok('someone guessing slowly all day is stopped by the daily limit', tries <= 80 && locks >= 1, { tries, locks });
    ok('the two limits together report the longer wait, and clear together', (() => { const a = createLimiter({ max: 1, windowMs: MIN, lockMs: 5 * MIN, now }), b = createLimiter({ max: 1, windowMs: MIN, lockMs: 9 * MIN, now }), c = allOf(a, b); const first = c.fail('k'); const d = allOf(createLimiter({ max: 3, windowMs: MIN, lockMs: MIN, now }), createLimiter({ max: 3, windowMs: MIN, lockMs: MIN, now })); d.fail('k'); d.fail('k'); d.clear('k'); d.fail('k'); d.fail('k'); return first === 9 * MIN && c.lockedFor('k') === 9 * MIN && d.lockedFor('k') === 0; })()); }

  // ---------- the real login ----------
  const S = await startServer(3169, { SIGNUPS_OPEN: '1', PIN_FAIL_MAX: '5', LOGIN_FAIL_MAX: '4' });
  const { call } = S;
  try {
    const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
    const st = (await call('GET', '/api/state', null, owner)).j, br = st.branches[0];
    await call('POST', '/api/users', { name: 'Desk', username: 'desk1', pin: '111111', role: 'cashier', branchId: br.id }, owner);
    await call('POST', '/api/users', { name: 'Admin Ana', username: 'ana', password: 'adminpass1', role: 'admin' }, owner);
    const partner = (await call('POST', '/api/public/signup', { kind: 'suite', shopName: 'Solo Cuts', ownerName: 'Rico Solo', email: 'rico@solo.ph', phone: '0917 999 8888', city: 'Lipa', username: 'rico', password: 'secret123', agree: true })).j;
    await call('POST', '/api/users', { name: 'P Desk', username: 'pdesk', pin: '222222', role: 'cashier', branchId: (await call('GET', '/api/state', null, partner.token)).j.branches[0].id }, partner.token);
    const X = { 'x-org': 'solo-cuts' };
    const pinTry = (pin, ip, hdr = {}) => call('POST', '/api/login', { pin }, null, { 'x-forwarded-for': ip, ...hdr });

    // wrong PINs, each from a different address (an attacker can pretend to be anyone)
    let r; for (let i = 0; i < 4; i++) r = await pinTry(String(300000 + i), '10.0.0.' + i);
    ok('a wrong PIN is refused as before', r.s === 401 && r.j.error === 'Wrong PIN', r);
    ok('the right PIN still works below the limit', (await pinTry('111111', '10.0.1.1')).s === 200);
    r = await pinTry('300099', '10.0.0.99'); ok('the wrong PIN that reaches the limit is still just "wrong"', r.s === 401, r);
    r = await pinTry('300100', '10.0.2.1'); ok('after too many wrong PINs, PIN login is paused for the shop', r.s === 429 && /paused/.test(r.j.error) && /minute/.test(r.j.error), r);
    r = await pinTry('111111', '10.0.2.2'); ok('while paused even the right PIN waits (so guessing gains nothing)', r.s === 429, r);
    ok('username and password login is not affected by the PIN pause', (await call('POST', '/api/login', { username: 'ana', password: 'adminpass1' })).s === 200 && (await call('POST', '/api/login', { password: 'ownerpw' })).s === 200);
    ok('people already logged in keep working', (await call('GET', '/api/state', null, owner)).s === 200);
    ok('another shop is not affected', (await pinTry('222222', '10.0.3.1', X)).s === 200);
    const audit = (await call('GET', '/api/audit', null, owner)).j; ok('the pause is written in the activity log for the owner', JSON.stringify(audit).includes('pin-login-paused'), JSON.stringify(audit).slice(0, 300));

    // many wrong PINs sent at the same moment cannot slip past the limit
    const burst = await Promise.all(Array.from({ length: 40 }, (_, i) => pinTry(String(400000 + i), '10.1.0.' + i, X)));
    const wrong = burst.filter(x => x.s === 401).length, paused = burst.filter(x => x.s === 429).length;
    ok('40 wrong PINs at once: only the allowed few are even checked', wrong === 5 && paused === 35, { wrong, paused });

    // passwords: per username, whatever address is claimed
    for (let i = 0; i < 4; i++) r = await call('POST', '/api/login', { username: 'ana', password: 'wrong' + i }, null, { 'x-forwarded-for': '10.2.0.' + i });
    ok('wrong passwords are refused as before', r.s === 401 && r.j.error === 'Wrong username or password', r);
    r = await call('POST', '/api/login', { username: 'ana', password: 'adminpass1' }, null, { 'x-forwarded-for': '10.2.9.9' });
    ok('after too many wrong passwords that username is locked for a while, even with the right password', r.s === 429 && /Too many/.test(r.j.error), r);
    ok('other usernames and the owner can still log in', (await call('POST', '/api/login', { password: 'ownerpw' })).s === 200);
    for (let i = 0; i < 4; i++) await call('POST', '/api/login', { password: 'nope' + i });
    r = await call('POST', '/api/login', { password: 'ownerpw' }); ok('the owner login is protected the same way', r.s === 429, r);
    ok('the partner shop owner is counted separately', (await call('POST', '/api/login', { username: 'rico', password: 'secret123' }, null, X)).s === 200);
    // an unknown username is counted too, and looks the same as a wrong password
    for (let i = 0; i < 4; i++) r = await call('POST', '/api/login', { username: 'nobody', password: 'x' + i });
    ok('an unknown username gives the same answer as a wrong password', r.s === 401 && r.j.error === 'Wrong username or password');
    ok('and is locked the same way', (await call('POST', '/api/login', { username: 'nobody', password: 'x' })).s === 429);
  } finally { await S.stop(); }

  // a correct login clears the count for that username
  const S2 = await startServer(3169, { LOGIN_FAIL_MAX: '4', PIN_FAIL_MAX: '-1', PIN_FAIL_DAY: '6' });
  try {
    const c2 = S2.call;
    const o2 = (await c2('POST', '/api/login', { password: 'ownerpw' })).j.token, b2 = (await c2('GET', '/api/state', null, o2)).j.branches[0];
    await c2('POST', '/api/users', { name: 'Admin Ana', username: 'ana', password: 'adminpass1', role: 'admin' }, o2);
    await c2('POST', '/api/users', { name: 'Desk', username: 'desk1', pin: '111111', role: 'cashier', branchId: b2.id }, o2);
    // spelling variants of one username share one count
    let q; for (const u of ['Ana', ' ana ', 'ANA', 'ana']) q = await c2('POST', '/api/login', { username: u, password: 'wrong' });
    ok('the same username typed differently is one count', q.s === 401 && (await c2('POST', '/api/login', { username: 'ana', password: 'adminpass1' })).s === 429);
    ok('a username lock is written in the activity log', JSON.stringify((await c2('GET', '/api/audit', null, o2)).j).includes('login-locked'));
    // a made-up, very long username is refused without being remembered
    const long = 'x'.repeat(5000); for (let i = 0; i < 8; i++) q = await c2('POST', '/api/login', { username: long, password: 'p' + i });
    ok('a very long username is always just "wrong", never counted', q.s === 401 && q.j.error === 'Wrong username or password', q);
    // a bad setting must not lock on the first mistake; the daily limit works on the real login
    q = await c2('POST', '/api/login', { pin: '300001' }); ok('a bad PIN_FAIL_MAX setting does not pause PIN login on the first mistake', q.s === 401 && (await c2('POST', '/api/login', { pin: '111111' })).s === 200, q);
    for (const p of ['12', 'abcdef', '1234567', '300002']) q = await c2('POST', '/api/login', { pin: p });
    ok('a PIN of the wrong shape counts as a wrong PIN', q.s === 401, q);
    q = await c2('POST', '/api/login', { pin: '300003' }); ok('the wrong PIN that reaches the daily limit is still just "wrong"', q.s === 401, q);
    q = await c2('POST', '/api/login', { pin: '111111' }); ok('the daily limit pauses PIN login for hours', q.s === 429 && /hour/.test(q.j.error), q);
    for (let i = 0; i < 3; i++) await c2('POST', '/api/login', { password: 'no' + i });
    ok('a correct login after a few mistakes works', (await c2('POST', '/api/login', { password: 'ownerpw' })).s === 200);
    for (let i = 0; i < 3; i++) await c2('POST', '/api/login', { password: 'no' + i });
    ok('and the earlier mistakes no longer count', (await c2('POST', '/api/login', { password: 'ownerpw' })).s === 200);
  } finally { await S2.stop(); }
} catch (e) { fail(e); }
done();
