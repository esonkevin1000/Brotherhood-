// T20 (NOTIF-001-003): a booking that is confirmed, cancelled or moved sends exactly one email to the customer; each email is
// logged with its status; repeating a request never sends a second one. App users also get the in-app/push notice.
import net from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { startServer, checker, ymd } from './helper.mjs';
const { ok, done, fail } = checker();

const mails = [];
const smtp = net.createServer(s => {
  let buf = '', data = null, to = '';
  s.on('error', () => { });   // the app may hang up mid-email when the test stops it
  s.write('220 fake ready\r\n');
  s.on('data', d => {
    buf += d.toString();
    while (true) {
      if (data !== null) { const i = buf.indexOf('\r\n.\r\n'); if (i < 0) return; data += buf.slice(0, i); buf = buf.slice(i + 5); mails.push({ to, subject: (/Subject: ([^\r\n]*)/.exec(data) || [])[1] || '' }); data = null; s.write('250 OK\r\n'); continue; }
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
}).listen(3178);
const settle = () => new Promise(r => setTimeout(r, 1500));
const to = (addr, re) => mails.filter(m => m.to === addr && (!re || re.test(m.subject)));

const S = await startServer(3177, { BOOK_LIMIT: '200', SMTP_HOST: '127.0.0.1', SMTP_PORT: '3178', SMTP_SECURE: '0', GMAIL_USER: 'shop@gmail.com', GMAIL_APP_PASSWORD: 'abcd abcd abcd abcd' });
const { call } = S;
try {
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  const st = (await call('GET', '/api/state', null, owner)).j, [A, B] = st.branches;
  const trim = (await call('POST', '/api/items', { name: 'Quick Trim', price: 100, type: 'service', mins: 30, bookable: 1, active: 1 }, owner)).j;
  const mk = async (name, br) => (await call('POST', '/api/staff', { name, branchId: br.id, chairId: st.chairs.find(c => c.branchId === br.id).id, pct: 40, allowance: 0 }, owner)).j;
  const kev = await mk('Kev', A), bob = await mk('Bob', B);
  await call('PUT', '/api/settings', { mvpBranches: [A.id] }, owner);
  const D = ymd(new Date(Date.now() + 3 * 864e5));
  let n = 0; const key = () => ({ 'Idempotency-Key': 'messages-test-key-' + String(++n).padStart(6, '0') });

  // ---------- a guest in a branch without the email code ----------
  const gbody = { branchId: B.id, staffId: bob.id, itemIds: [trim.id], date: D, time: '10:00', name: 'Gina Guest', phone: '0917 555 0000', email: 'gina@example.com' }, gk = key();
  let r = await call('POST', '/api/public/book', gbody, null, gk); await settle();
  ok('a guest booking sends one confirmation email', r.s === 201 && to('gina@example.com', /booked/i).length === 1, mails);
  await call('POST', '/api/public/book', gbody, null, gk); await settle();
  ok('the same request again sends nothing more', to('gina@example.com').length === 1);

  // ---------- a guest in a pilot branch: the code first, then one confirmation ----------
  r = await call('POST', '/api/public/book', { branchId: A.id, staffId: kev.id, itemIds: [trim.id], date: D, time: '10:00', name: 'Hana Guest', phone: '0917 555 1111', email: 'hana@example.com' }, null, key()); await settle();
  const code = (/^(\d{6}) /.exec(to('hana@example.com')[0]?.subject || '') || [])[1];
  ok('before the code, only the code email', to('hana@example.com').length === 1 && !!code);
  await call('POST', '/api/public/book/confirm', { hold: r.j.hold, code }); await settle();
  await call('POST', '/api/public/book/confirm', { hold: r.j.hold, code }); await settle();
  ok('after the code: one confirmation, even when confirmed twice', to('hana@example.com', /booked/i).length === 1, to('hana@example.com'));

  // ---------- an app user ----------
  const app = (await call('POST', '/api/bh/signup', { name: 'Ana Reyes', email: 'ana@example.com', phone: '0917 222 3333', password: 'password123', agree: true })).j.token;
  r = await call('POST', '/api/bh/book', { branchId: A.id, staffId: kev.id, itemIds: [trim.id], date: D, time: '11:00' }, app, key()); await settle();
  const ab = r.j.booking.id;
  ok('an app booking sends one confirmation email', to('ana@example.com', /booked/i).length === 1);
  ok('and the app notice', JSON.stringify((await call('GET', '/api/bh/notifications', null, app)).j).includes('Booked:'));
  r = await call('POST', `/api/bh/bookings/${ab}/reschedule`, { date: D, time: '12:00' }, app); await settle();
  ok('moving it sends one email with the new time', r.s === 200 && to('ana@example.com', /moved/i).length === 1 && /12:00/.test(to('ana@example.com', /moved/i)[0].subject), to('ana@example.com'));
  await call('POST', `/api/bh/bookings/${ab}/reschedule`, { date: D, time: '12:00' }, app); await settle();
  ok('the same move again sends nothing more', to('ana@example.com', /moved/i).length === 1);
  await call('POST', `/api/bh/bookings/${ab}/reschedule`, { date: D, time: '14:00' }, app); await settle();
  ok('a second, different move sends a second email', to('ana@example.com', /moved/i).length === 2);
  r = await call('POST', `/api/bh/bookings/${ab}/cancel`, null, app); await settle();
  await call('POST', `/api/bh/bookings/${ab}/cancel`, null, app); await settle();
  ok('cancelling sends one email, even when tapped twice', r.s === 200 && to('ana@example.com', /cancelled/i).length === 1, to('ana@example.com'));

  // ---------- the shop cancels a guest booking ----------
  const gid = (await call('GET', `/api/bookings?from=${D}&to=${D}`, null, owner)).j.find(b => b.customerName === 'Gina Guest').id;
  await call('PUT', `/api/bookings/${gid}`, { status: 'cancelled', reason: 'Barber sick' }, owner); await settle();
  ok('when the shop cancels, the customer gets one email', to('gina@example.com', /cancelled/i).length === 1, to('gina@example.com'));

  // ---------- the log ----------
  const db = new DatabaseSync(S.dbFile, { timeout: 5000 }), rows = db.prepare("select kind, status, toAddr from email_log where kind like 'booking-%'").all();
  ok('every booking email is in the log as sent', rows.length === 7 && rows.every(x => x.status === 'sent'), rows);
  // a phone booking by staff for a customer without an email: nothing to send, nothing breaks
  r = await call('POST', '/api/bookings', { branchId: B.id, staffId: bob.id, itemIds: [trim.id], date: D, time: '15:00', name: 'Walter', phone: '0917 555 2222' }, owner); await settle();
  ok('a booking without an email works and sends nothing', r.s === 201 && db.prepare("select count(*) n from email_log where kind like 'booking-%'").get().n === 7, r);
  db.close();
} catch (e) { fail(e); }
await S.stop(); smtp.close();
done();
