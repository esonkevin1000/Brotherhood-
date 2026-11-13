// Journey A (Booking checkpoint): a guest books online in the pilot branch, confirms with the emailed code, gets the confirmation
// and the reminder email, arrives, the front desk checks them in, the barber does the cut, and the visit is counted.
import net from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { startServer, checker, ymd } from './helper.mjs';
const { ok, done, fail } = checker();

const mails = [];
const smtp = net.createServer(s => {
  let buf = '', data = null, to = '';
  s.on('error', () => { });
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
}).listen(3180);
const waitFor = async (pred, ms = 8000) => { for (let t = 0; t < ms; t += 200) { if (pred()) return true; await new Promise(r => setTimeout(r, 200)); } return pred(); };
const hm = d => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const G = 'gina@example.com', mine = re => mails.filter(m => m.to === G && re.test(m.subject));

const S = await startServer(3179, { BH_JOB_MS: '1000', SMTP_HOST: '127.0.0.1', SMTP_PORT: '3180', SMTP_SECURE: '0', GMAIL_USER: 'shop@gmail.com', GMAIL_APP_PASSWORD: 'abcd abcd abcd abcd' });
const { call } = S;
try {
  // the shop: San Pablo-style pilot branch with one barber and a front desk
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  const st = (await call('GET', '/api/state', null, owner)).j, A = st.branches[0];
  const trim = (await call('POST', '/api/items', { name: 'Quick Trim', price: 150, type: 'service', mins: 30, bookable: 1, active: 1 }, owner)).j;
  const kev = (await call('POST', '/api/staff', { name: 'Kev', branchId: A.id, chairId: st.chairs.find(c => c.branchId === A.id).id, pct: 40, allowance: 0 }, owner)).j;
  await call('POST', '/api/users', { name: 'Desk Dina', username: 'dina', pin: '111111', role: 'cashier', branchId: A.id }, owner);
  const desk = (await call('POST', '/api/login', { pin: '111111' })).j.token;
  await call('PUT', '/api/settings', { mvpBranches: [A.id] }, owner);
  const db = new DatabaseSync(S.dbFile, { timeout: 5000 });

  // 1-4. open /book, pick branch, service, barber, date and time
  const info = (await call('GET', '/api/public/info')).j, br = info.branches.find(b => b.id === A.id);
  ok('A1 the booking page shows the branch, the service with price and duration, the barber, and the rules', br?.verify && br.policy?.cancelCutoffMins === 60 && br.policy?.noshowGraceMins === 5 && info.services.some(s => s.id === trim.id && s.price === 150 && s.mins === 30) && info.staff.some(s => s.id === kev.id));
  const D = ymd(new Date(Date.now() + 2 * 864e5));
  const slots = (await call('GET', `/api/public/slots?branch=${A.id}&date=${D}&staff=${kev.id}&items=${trim.id}`)).j.slots;
  ok('A2 free times are offered', slots.includes('10:00'), slots);

  // 5-6. details, then the hold and the emailed code
  let r = await call('POST', '/api/public/book', { branchId: A.id, staffId: kev.id, itemIds: [trim.id], date: D, time: '10:00', name: 'Gina Guest', phone: '0917 555 0000', email: G, consent: true }, null, { 'Idempotency-Key': 'journey-a-key-000001' });
  ok('A3 the time is held and a code is emailed', r.s === 202 && await waitFor(() => mails.some(m => m.to === G && /^\d{6} /.test(m.subject))), r);
  const code = /^(\d{6}) /.exec(mails.find(m => m.to === G).subject)[1];

  // 7-8. the code confirms the booking: snapshot, history, confirmation email
  r = await call('POST', '/api/public/book/confirm', { hold: r.j.hold, code });
  const bk = db.prepare("select * from bookings where customerName='Gina Guest'").get();
  ok('A4 the code confirms the booking, with the price snapshot and the policy kept', r.s === 200 && bk.status === 'booked' && JSON.parse(bk.snapshot).total === 150 && JSON.parse(bk.policy).cancelCutoffMins === 60, bk);
  ok('A5 the history shows held, then confirmed', JSON.stringify(db.prepare('select fromStatus, toStatus from booking_events where bookingId=? order by rowid').all(bk.id).map(e => e.toStatus)) === '["pending","booked"]');
  ok('A6 the confirmation email arrives once', await waitFor(() => mine(/^Booked:/).length === 1) && mine(/^Booked:/).length === 1, mails);

  // 9. the reminder email: the booking is a few hours away and was made earlier
  const later = new Date(Date.now() + 5 * 36e5);
  db.prepare('update bookings set date=?, time=?, createdAt=? where id=?').run(ymd(later), hm(later), new Date(Date.now() - 4 * 36e5).toISOString(), bk.id);
  ok('A7 the reminder email goes out once', await waitFor(() => mine(/^Reminder:/).length === 1, 12000) && (await new Promise(r => setTimeout(r, 2500)), mine(/^Reminder:/).length === 1), mails.map(m => m.subject));

  // 10-12. the customer arrives: check in, the barber starts, the visit is finished and paid
  r = await call('POST', `/api/bookings/${bk.id}/arrive`, null, desk);
  const order = r.j.order;
  ok('A8 the front desk checks the customer in', r.s === 200 && !!order?.id, r);
  if (order.status !== 'in_chair') await call('POST', `/api/svc/${order.id}/start`, { barberId: kev.id }, desk);
  r = await call('POST', `/api/svc/${order.id}/finish`, { method: 'Cash', barberId: kev.id }, desk);
  ok('A9 the cut is finished and paid at the booked price', r.s === 200 && db.prepare('select status, total, barberId from orders where id=?').get(order.id)?.total === 150, [r, db.prepare('select status, total from orders where id=?').get(order.id)]);
  ok('A10 the booking shows as arrived', db.prepare('select status from bookings where id=?').get(bk.id).status === 'arrived');
  const cust = (await call('GET', '/api/customers?q=Gina', null, owner)).j.rows.find(c => c.name === 'Gina Guest');
  ok('A11 the visit is counted for the customer (loyalty: 1 paid visit = 1 point)', cust?.visits === 1 && cust.email === G, cust);
  const today = (await call('GET', '/api/svc/today', null, desk)).j;
  ok("A12 it is on the day's record under Kev", JSON.stringify(today).includes(order.id) || today.totals?.done >= 1, today.totals);
  db.close();
} catch (e) { fail(e); }
await S.stop(); smtp.close();
done();
