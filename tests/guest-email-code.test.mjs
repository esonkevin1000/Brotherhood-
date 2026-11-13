// T16 (D-5, D-14): in branches using the new booking system, a guest booking on /book is confirmed with a 6-digit code sent by
// email, and the time is held for 10 minutes meanwhile. Wrong codes count down (max 5), an expired hold frees the time,
// resends are limited, and app users (already verified) skip the code. Other branches keep today's behaviour.
import net from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { startServer, checker, ymd } from './helper.mjs';
const { ok, done, fail } = checker();

// a fake Gmail SMTP server that keeps every message
const mails = [];
const smtp = net.createServer(s => {
  let buf = '', data = null, to = '';
  s.on('error', () => { });   // the app may hang up mid-email when the test stops it
  s.write('220 fake ready\r\n');
  s.on('data', d => {
    buf += d.toString();
    while (true) {
      if (data !== null) { const i = buf.indexOf('\r\n.\r\n'); if (i < 0) return; data += buf.slice(0, i); buf = buf.slice(i + 5); mails.push({ to, raw: data }); data = null; s.write('250 OK\r\n'); continue; }
      const i = buf.indexOf('\r\n'); if (i < 0) return; const ln = buf.slice(0, i); buf = buf.slice(i + 2);
      if (/^EHLO/.test(ln)) s.write('250-fake\r\n250 AUTH LOGIN PLAIN\r\n');
      else if (ln === 'AUTH LOGIN') s.write('334 VXNlcm5hbWU6\r\n');
      else if (Buffer.from(ln, 'base64').toString() === 'shop@gmail.com') s.write('334 UGFzc3dvcmQ6\r\n');
      else if (Buffer.from(ln, 'base64').toString() === 'abcdabcdabcdabcd') s.write('235 Accepted\r\n');
      else if (/^MAIL FROM/.test(ln)) s.write('250 OK\r\n');
      else if (/^RCPT TO/.test(ln)) { to = ln.slice(9, -1); s.write('250 OK\r\n'); }
      else if (ln === 'DATA') { data = ''; s.write('354 Go\r\n'); }
      else if (ln === 'QUIT') { s.write('221 Bye\r\n'); s.end(); }
      else s.write('500 ?\r\n');
    }
  });
}).listen(3172);
const codeFor = async (email, after = 0) => { for (let i = 0; i < 40; i++) { const m = mails.slice(after).filter(x => x.to === email).at(-1); if (m) return (/Subject: (\d{6}) /.exec(m.raw) || [])[1]; await new Promise(r => setTimeout(r, 100)); } return null; };

const S = await startServer(3171, { BOOK_LIMIT: '200', HOLD_LIVE_MAX: '8', SMTP_HOST: '127.0.0.1', SMTP_PORT: '3172', SMTP_SECURE: '0', GMAIL_USER: 'shop@gmail.com', GMAIL_APP_PASSWORD: 'abcd abcd abcd abcd' });
const { call } = S;
try {
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  const st = (await call('GET', '/api/state', null, owner)).j, [A, B] = st.branches;
  const trim = (await call('POST', '/api/items', { name: 'Quick Trim', price: 100, type: 'service', mins: 30, bookable: 1, active: 1 }, owner)).j;
  const kev = (await call('POST', '/api/staff', { name: 'Kev', branchId: A.id, chairId: st.chairs.find(c => c.branchId === A.id).id, pct: 40, allowance: 0 }, owner)).j;
  await call('POST', '/api/staff', { name: 'Bob', branchId: B.id, chairId: st.chairs.find(c => c.branchId === B.id).id, pct: 40, allowance: 0 }, owner);
  await call('PUT', '/api/settings', { mvpBranches: [A.id] }, owner);
  const D = ymd(new Date(Date.now() + 3 * 864e5));
  let n = 0;
  const guest = (time, email, o = {}) => call('POST', '/api/public/book', { branchId: A.id, staffId: kev.id, itemIds: [trim.id], date: D, time, name: 'Gina Guest', phone: '0917 555 0000', ...(email === undefined ? {} : { email }), ...o }, null, { 'Idempotency-Key': 'guest-code-test-' + String(++n).padStart(6, '0') });
  const confirm = (hold, code) => call('POST', '/api/public/book/confirm', { hold, code });
  const slots = async () => (await call('GET', `/api/public/slots?branch=${A.id}&date=${D}&staff=${kev.id}&items=${trim.id}`)).j.slots;
  const db = new DatabaseSync(S.dbFile, { timeout: 5000 });

  ok('the booking page knows which branches need the email code', (await call('GET', '/api/public/info')).j.branches.find(b => b.id === A.id)?.verify === true && (await call('GET', '/api/public/info')).j.branches.find(b => b.id === B.id)?.verify === false);
  let r = await guest('10:00');
  ok('without an email, a guest is told email is required (or to walk in)', r.s === 400 && /email/i.test(r.j.error) && /walk in/i.test(r.j.error), r);

  // ---------- hold, then confirm ----------
  r = await guest('10:00', 'gina@example.com');
  const hold = r.j.hold;
  ok('a guest booking is put on hold and waits for the code', r.s === 202 && r.j.pending === true && typeof hold === 'string' && hold.length >= 20 && !r.j.booking, r);
  ok('the hold lasts 10 minutes', Math.abs(new Date(r.j.holdUntil) - Date.now() - 10 * 60e3) < 30e3, r.j.holdUntil);
  ok('the email address is shown partly hidden', r.j.email === 'g***@example.com', r.j.email);
  const code = await codeFor('gina@example.com');
  ok('a 6-digit code is emailed to the guest', /^\d{6}$/.test(code || ''), mails.map(m => m.to));
  ok('the code is not kept in the database as itself', !JSON.stringify(db.prepare('select * from email_codes').all()).includes(code));
  ok('during the hold, nobody else gets that time', !(await slots()).includes('10:00') && (await guest('10:00', 'other@example.com')).s === 409);
  ok('no customer record yet for an unconfirmed guest', !db.prepare("select 1 from customers where email='gina@example.com'").get());
  const wrong = code === '000000' ? '111111' : '000000';
  r = await confirm(hold, wrong);
  ok('a wrong code says how many tries are left', r.s === 400 && r.j.triesLeft === 4 && /4 tries left/.test(r.j.error), r);
  ok('an unknown hold is not found', (await confirm('x'.repeat(32), code)).s === 404);
  r = await confirm(hold, code);
  ok('the right code confirms the booking', r.s === 200 && r.j.ok && r.j.booking.time === '10:00' && r.j.booking.staff === 'Kev', r);
  const row = db.prepare("select * from bookings where date=? and time='10:00'").get(D);
  ok('it is now a normal booking, with the customer saved', row.status === 'booked' && !!row.customerId && !!db.prepare("select 1 from customers where email='gina@example.com'").get(), row);
  ok('confirming again is harmless', (await confirm(hold, code)).s === 200);
  ok('its history shows the hold and the confirmation', JSON.stringify(db.prepare('select fromStatus, toStatus from booking_events where bookingId=? order by rowid').all(row.id)) === JSON.stringify([{ fromStatus: '', toStatus: 'pending' }, { fromStatus: 'pending', toStatus: 'booked' }]));

  // ---------- guessing: 5 wrong codes release the time ----------
  r = await guest('11:00', 'guess@example.com'); const h2 = r.j.hold, c2 = await codeFor('guess@example.com');
  const bad2 = c2 === '000000' ? '111111' : '000000';
  for (let i = 0; i < 4; i++) r = await confirm(h2, bad2);
  ok('after 4 wrong codes, 1 try is left', r.s === 400 && r.j.triesLeft === 1, r);
  r = await confirm(h2, bad2);
  ok('the 5th wrong code ends the hold and frees the time', r.s === 429 && (await slots()).includes('11:00'), r);
  ok('even the right code no longer works', (await confirm(h2, c2)).s !== 200);

  // ---------- the 10 minutes run out ----------
  r = await guest('12:00', 'late@example.com'); const h3 = r.j.hold, c3 = await codeFor('late@example.com');
  db.prepare("update bookings set holdUntil=? where date=? and time='12:00' and status='pending'").run(new Date(Date.now() - 1000).toISOString(), D);
  ok('an expired hold frees the time at once', (await slots()).includes('12:00'));
  r = await confirm(h3, c3);
  ok('and the code is refused with the reason', r.s === 410 && /10 minutes/.test(r.j.error), r);
  ok('the hold is marked expired', db.prepare("select status from bookings where date=? and time='12:00'").get(D)?.status === 'expired');

  // ---------- resending the code ----------
  r = await guest('13:00', 'resend@example.com'); const h4 = r.j.hold, c4 = await codeFor('resend@example.com');
  ok('a resend right away is refused (wait a minute)', (await call('POST', '/api/public/book/resend', { hold: h4 })).s === 429);
  const back = () => db.prepare('update email_codes set lastSentAt=? where holdKey=?').run(new Date(Date.now() - 2 * 60e3).toISOString(), h4);
  back(); const before = mails.length;
  r = await call('POST', '/api/public/book/resend', { hold: h4 });
  const c4b = await codeFor('resend@example.com', before);
  ok('after a minute, a new code is sent', r.s === 200 && /^\d{6}$/.test(c4b || ''), r);
  ok('the old code stops working, the new one works', c4 === c4b || ((await confirm(h4, c4)).s === 400 && (await confirm(h4, c4b)).s === 200));
  r = await guest('13:30', 'resend2@example.com'); const h5 = r.j.hold;
  for (let i = 0; i < 2; i++) { db.prepare('update email_codes set lastSentAt=? where holdKey=?').run(new Date(Date.now() - 2 * 60e3).toISOString(), h5); await call('POST', '/api/public/book/resend', { hold: h5 }); }
  db.prepare('update email_codes set lastSentAt=? where holdKey=?').run(new Date(Date.now() - 2 * 60e3).toISOString(), h5);
  ok('at most 3 codes per hold', (await call('POST', '/api/public/book/resend', { hold: h5 })).s === 429);

  // ---------- one email address cannot hold many times ----------
  const spam = [];
  for (const t of ['14:00', '14:30', '15:00', '15:30', '16:00', '16:30']) spam.push((await guest(t, 'spam@example.com')).s);
  ok('at most 5 holds per email address an hour', JSON.stringify(spam) === JSON.stringify([202, 202, 202, 202, 202, 429]), spam);

  // ---------- fixes from the security review ----------
  ok('a confirmed booking keeps no guest details in the code table', db.prepare('select guest, codeHash from email_codes where holdKey=?').get(hold)?.guest === null);
  ok('an ended hold keeps none either', db.prepare('select guest from email_codes where holdKey=?').get(h2)?.guest === null && db.prepare('select guest from email_codes where holdKey=?').get(h3)?.guest === null);
  // open holds now: 13:30 and the five "spam" ones = 6; this test server allows 8 per branch
  const lv = [];
  for (const [t, e] of [['18:00', 'a1@example.com'], ['18:30', 'a2@example.com'], ['19:00', 'a3@example.com']]) lv.push((await guest(t, e)).s);
  ok('a branch takes only so many open holds at a time (fake emails cannot fill the day)', JSON.stringify(lv) === '[202,202,429]', lv);
  const pend = db.prepare("select id from bookings where date=? and time='18:30' and status='pending'").get(D);
  ok('the owner or front desk can cancel a hold, and the time is free again', (await call('PUT', '/api/bookings/' + pend.id, { status: 'cancelled', reason: 'Not a real booking' }, owner)).s === 200 && (await slots()).includes('18:30'));
  await call('POST', '/api/customers', { name: 'Vic Victim', phone: '0917 999 8888', email: 'vic@example.com' }, owner);
  r = await guest('19:30', 'attacker@example.com', { phone: '0917 999 8888', name: 'Not Vic' });
  r = await confirm(r.j.hold, await codeFor('attacker@example.com'));
  ok("a confirmed guest using someone else's phone does not change that customer's email", r.s === 200 && db.prepare("select email from customers where name='Vic Victim'").get()?.email === 'vic@example.com', r);

  // ---------- who skips the code ----------
  const app = (await call('POST', '/api/bh/signup', { name: 'Ana Reyes', email: 'ana@example.com', phone: '0917 222 3333', password: 'password123', agree: true })).j.token;
  r = await call('POST', '/api/bh/book', { branchId: A.id, staffId: kev.id, itemIds: [trim.id], date: D, time: '17:00' }, app, { 'Idempotency-Key': 'guest-code-test-app-0001' });
  ok('an app user books straight away (email already verified)', r.s === 201 && !!r.j.booking, r);
  r = await call('POST', '/api/public/book', { branchId: B.id, staffId: 'any', itemIds: [trim.id], date: D, time: '10:00', name: 'Walter', phone: '0917 555 1111' }, null, { 'Idempotency-Key': 'guest-code-test-bbb-0001' });
  ok('in a branch without the new system, a guest still books as today (no code, email optional)', r.s === 201 && !!r.j.booking, r);
  db.close();
} catch (e) { fail(e); }
await S.stop(); smtp.close();
done();
