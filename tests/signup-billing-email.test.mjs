// Step 5 and 6: shop self sign-up with a free trial, plans and payments, and email marketing through a Gmail-style SMTP account.
import { fileURLToPath as __f } from 'node:url';
const ROOT = __f(new URL('..', import.meta.url));
import { spawn } from 'node:child_process';
import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs'; import net from 'node:net';
import { DatabaseSync } from 'node:sqlite';

// a fake Gmail SMTP server that records every message
const mails = [];
const smtp = net.createServer(s => {
  let buf = '', data = null, from = '', to = '';
  s.write('220 fake.gmail ready\r\n');
  s.on('data', d => {
    buf += d.toString();
    while (true) {
      if (data !== null) { const i = buf.indexOf('\r\n.\r\n'); if (i < 0) return; data += buf.slice(0, i); buf = buf.slice(i + 5); mails.push({ from, to, raw: data }); data = null; s.write('250 OK queued\r\n'); continue; }
      const i = buf.indexOf('\r\n'); if (i < 0) return; const ln = buf.slice(0, i); buf = buf.slice(i + 2);
      if (/^EHLO/.test(ln)) s.write('250-fake.gmail\r\n250 AUTH LOGIN PLAIN\r\n');
      else if (ln === 'AUTH LOGIN') s.write('334 VXNlcm5hbWU6\r\n');
      else if (Buffer.from(ln, 'base64').toString() === 'shop@gmail.com') s.write('334 UGFzc3dvcmQ6\r\n');
      else if (Buffer.from(ln, 'base64').toString() === 'abcdabcdabcdabcd') s.write('235 Accepted\r\n');
      else if (/^MAIL FROM/.test(ln)) { from = ln; s.write('250 OK\r\n'); }
      else if (/^RCPT TO/.test(ln)) { to = ln.slice(9, -1); s.write('250 OK\r\n'); }
      else if (ln === 'DATA') { data = ''; s.write('354 Go\r\n'); }
      else if (ln === 'QUIT') { s.write('221 Bye\r\n'); s.end(); }
      else s.write('535 5.7.8 Username and Password not accepted\r\n');
    }
  });
}).listen(2525);

const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt23-')), DBF = path.join(dbDir, 't.db');
const srv = spawn('node', ['server.js'], { cwd: ROOT, env: { ...process.env, ADMIN_PASSWORD: 'ownerpw', DB_FILE: DBF, PORT: '3147', SMTP_HOST: '127.0.0.1', SMTP_PORT: '2525', SMTP_SECURE: '0', GMAIL_USER: 'shop@gmail.com', GMAIL_APP_PASSWORD: 'abcd abcd abcd abcd', CONTACT_EMAIL: 'boss@example.com', EMAIL_DAILY_LIMIT: '20', SIGNUPS_OPEN: '1', PUBLIC_URL: 'https://getbrotherhoodapp.com' }, stdio: 'ignore' });
const B = 'http://localhost:3147';
for (let i = 0; i < 80; i++) { try { await fetch(B + '/api/public/terms'); break; } catch { await new Promise(r => setTimeout(r, 500)); } }
let fails = 0;
async function call(method, url, body, tok, hdr = {}) {
  const r = await fetch(B + url, { method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}), ...hdr }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { s: r.status, j };
}
const ok = (name, cond, extra = '') => { if (!cond) fails++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' → ' + extra)); };
const wait = async (fn, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await new Promise(r => setTimeout(r, 200)); } return false; };
const body = m => { const parts = [...m.raw.matchAll(/Content-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+?)--/g)].map(x => Buffer.from(x[1].replace(/\s/g, ''), 'base64').toString()); return parts.join('\n'); };
try {
  // ---------- pages ----------
  for (const pg of ['/signup', '/shop-terms']) { const r = await fetch(B + pg); const t = await r.text(); ok(pg + ' page is served', r.status === 200 && t.includes('BIR'), r.status); }
  const plans = (await call('GET', '/api/public/plans')).j; ok('public plans with a 30-day trial', plans.plans.length === 3 && plans.trialDays === 30, JSON.stringify(plans));

  // ---------- self sign-up ----------
  const good = { kind: 'owner', shopName: 'Kingsman Cuts', ownerName: 'Juan Dela Cruz', email: 'juan@kingsman.ph', phone: '0917 123 4567', city: 'Calamba', username: 'juan', password: 'secret123', agree: true };
  let r = await call('POST', '/api/public/signup', { ...good, agree: false }); ok('sign-up needs the terms ticked', r.s === 400, JSON.stringify(r.j));
  r = await call('POST', '/api/public/signup', { ...good, password: 'short' }); ok('sign-up needs an 8+ character password', r.s === 400);
  r = await call('POST', '/api/public/signup', good); ok('a shop signs up by itself', r.s === 201 && r.j.code === 'kingsman-cuts' && r.j.token, JSON.stringify(r.j));
  const shop = r.j;
  r = await call('POST', '/api/public/signup', { ...good, shopName: 'Kingsman 2' }); ok('one shop per email', r.s === 409, JSON.stringify(r.j));
  r = await call('GET', '/api/public/signup/check?code=kingsman-cuts'); ok('code check says taken', r.j.ok === false);
  r = await call('POST', '/api/public/signup', { ...good, kind: 'renter', shopName: 'Kingsman Cuts', email: 'lance@x.ph', username: 'lance' }); ok('same name gets a numbered code; renter = solo plan', r.s === 201 && r.j.code === 'kingsman-cuts-2', JSON.stringify(r.j));
  const solo = r.j;
  ok('welcome email goes to the new shop and Brotherhood is told', await wait(() => mails.some(m => m.to === 'juan@kingsman.ph') && mails.some(m => m.to === 'boss@example.com')), JSON.stringify(mails.map(m => m.to)));
  const wm = mails.find(m => m.to === 'juan@kingsman.ph'); ok('welcome email has the shop code, sender is the Gmail, no password inside', wm && body(wm).includes('kingsman-cuts') && !body(wm).includes('secret123') && wm.from.includes('shop@gmail.com'));

  // the new owner logs in with the shop code, sees starter services and the trial
  const login = await call('POST', '/api/login', { username: 'juan', password: 'secret123' }, null, { 'x-org': 'kingsman-cuts' }); ok('the new owner logs in with the shop code', login.s === 200, JSON.stringify(login.j));
  const otk = login.j.token, st = (await call('GET', '/api/state', null, otk)).j;
  ok('the new shop has a branch, 3 chairs and starter services', st.branches.length === 1 && st.branches[0].name === 'Calamba' && st.chairs.length === 3 && st.items.length === 3, JSON.stringify({ b: st.branches.length, c: st.chairs.length, i: st.items.length }));
  ok('the shop sees its free trial', st.org.status.state === 'trial' && st.org.status.daysLeft === 30 && st.org.status.plan === 'shop', JSON.stringify(st.org));
  const sst = (await call('GET', '/api/state', null, solo.token)).j; ok('a chair renter starts with 1 chair and himself as the barber', sst.chairs.length === 1 && sst.staff.length === 1 && sst.staff[0].name === 'Juan Dela Cruz', JSON.stringify({ c: sst.chairs.length, s: sst.staff }));

  // ---------- plans and payments (Brotherhood owner) ----------
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  let orgs = (await call('GET', '/api/orgs', null, owner)).j; const k = orgs.find(o => o.code === 'kingsman-cuts');
  ok('the owner sees the sign-up with its plan and contact', k && k.status.state === 'trial' && k.email === 'juan@kingsman.ph' && k.kind === 'owner' && !k.ownerHash, JSON.stringify(k));
  // the trial ends
  r = await call('PUT', `/api/orgs/${k.id}`, { trialEnds: '2026-01-01' }, owner); ok('the owner can change the trial date', r.s === 200);
  r = await call('POST', '/api/customers', { name: 'Pedro', phone: '09170000001' }, otk); ok('after the trial the shop cannot add anything', r.s === 402 && /free trial has ended/.test(r.j.error), JSON.stringify(r));
  r = await call('GET', '/api/state', null, otk); ok('but it can still log in and view', r.s === 200 && r.j.org.status.state === 'expired');
  r = await call('POST', '/api/login', { username: 'juan', password: 'secret123' }, null, { 'x-org': 'kingsman-cuts' }); ok('and log in', r.s === 200);
  // Brotherhood records a payment
  r = await call('PUT', '/api/orgs/plans', { plans: [{ id: 'shop', price: 1200 }], payInfo: 'GCash 0917 000 0000' }, owner); ok('the owner sets prices and how to pay', r.s === 200 && r.j.plans.find(p => p.id === 'shop').price === 1200 && r.j.payInfo.includes('GCash'));
  ok('the price shows publicly', (await call('GET', '/api/public/plans')).j.plans.find(p => p.id === 'shop').price === 1200);
  r = await call('POST', `/api/orgs/${k.id}/payments`, { amount: 2400, months: 2, method: 'GCash', ref: '123', invoiceNo: 'INV-1' }, owner);
  const t0 = new Date(); t0.setMonth(t0.getMonth() + 2); const exp = `${t0.getFullYear()}-${String(t0.getMonth() + 1).padStart(2, '0')}-${String(t0.getDate()).padStart(2, '0')}`;
  ok('a payment of 2 months moves paid-until 2 months ahead', r.s === 201 && r.j.paidUntil === exp, JSON.stringify(r.j) + ' want ' + exp);
  r = await call('POST', '/api/customers', { name: 'Pedro', phone: '09170000001', email: 'pedro@x.ph', consent: 1 }, otk); ok('after paying the shop works again', r.s === 201, JSON.stringify(r.j));
  ok('the shop gets a payment confirmation that is not a receipt', await wait(() => mails.some(m => m.to === 'juan@kingsman.ph' && /payment received/i.test(m.raw) || (m.to === 'juan@kingsman.ph' && body(m).includes('confirmation only')))));
  const pays = (await call('GET', `/api/orgs/${k.id}/payments`, null, owner)).j; ok('the payment is listed with the invoice no.', pays.length === 1 && pays[0].invoiceNo === 'INV-1');
  r = await call('GET', '/api/orgs', null, otk); ok('a partner shop cannot see the partner list', r.s === 403);

  // ---------- email marketing (Brotherhood) ----------
  const st0 = (await call('GET', '/api/state', null, owner)).j, br = st0.branches[0];
  const custs = [['Ana', 'ana@x.ph', 1], ['Ben', 'ben@x.ph', 1], ['Cid', 'cid@x.ph', 0], ['Dan', 'dan@x.ph', 1]];
  for (const [n, e, c] of custs) await call('POST', '/api/customers', { name: n, email: e, consent: c, branchId: br.id }, owner);
  await wait(() => false, 1500); mails.length = 0;   // let the welcome emails go out
  let mk = (await call('GET', '/api/marketing', null, owner)).j; ok('marketing page: Gmail connected, 3 said yes', mk.provider === 'gmail' && mk.from === 'shop@gmail.com' && mk.subscribers === 3, JSON.stringify({ p: mk.provider, s: mk.subscribers }));
  r = await call('POST', '/api/marketing/count', { audience: { who: 'all' } }, owner); ok('count: only those who said yes', r.j.count === 3, JSON.stringify(r.j));
  r = await call('POST', '/api/marketing/count', { audience: { who: 'new' } }, owner); ok('count: new = no visit yet', r.j.count === 3);
  // make Ana a lapsed customer with an old paid visit
  const db = new DatabaseSync(DBF); const ana = db.prepare("select id from customers where email='ana@x.ph'").get();
  const old = new Date(Date.now() - 50 * 864e5).toISOString();
  db.prepare("insert into orders(id,customerId,status,paidAt,date,total,branchId) values('oldvisit',?,'paid',?,?,200,?)").run(ana.id, old, old.slice(0, 10), br.id);
  r = await call('POST', '/api/marketing/count', { audience: { who: 'lapsed', days: 45 } }, owner); ok('count: lapsed 45 days finds Ana', r.j.count === 1 && r.j.sample[0] === 'Ana', JSON.stringify(r.j));
  r = await call('POST', '/api/marketing/test', { subject: 'Hi {name}', body: 'Promo this week at {shop}. Enjoy.', to: 'me@x.ph' }, owner); ok('test email', r.s === 200 && await wait(() => mails.some(m => m.to === 'me@x.ph')), JSON.stringify(r.j));
  r = await call('POST', '/api/marketing/send', { subject: '20% off, {name}', body: 'Hi {name},\n\nThis week only at {shop}.', btnText: 'Book now', audience: { who: 'all' } }, owner); ok('send a campaign to 3', r.s === 201 && r.j.total === 3, JSON.stringify(r.j));
  ok('the 3 emails go out', await wait(() => ['ana@x.ph', 'ben@x.ph', 'dan@x.ph'].every(e => mails.some(m => m.to === e))), JSON.stringify(mails.map(m => m.to)));
  ok('nobody who said no gets it', !mails.some(m => m.to === 'cid@x.ph'));
  const am = mails.find(m => m.to === 'ana@x.ph'), ab = body(am);
  ok('the email is personal, has the button and a working unsubscribe link and header', ab.includes('Hi Ana') && ab.includes('/member') && /List-Unsubscribe: <https:\/\/getbrotherhoodapp\.com\/unsubscribe\?c=\w+&t=/.test(am.raw), ab.slice(0, 300));
  // daily limit 8: welcome(4 customers, 3 with consent? welcome needs consent) + test + 3 ... the rest waits
  mk = (await call('GET', '/api/marketing', null, owner)).j; ok('campaign stats', mk.campaigns[0].stats.sent === 3 && mk.campaigns[0].total === 3, JSON.stringify(mk.campaigns[0]));
  // unsubscribe
  const link = /List-Unsubscribe: <([^>]+)>/.exec(am.raw)[1].replace('https://getbrotherhoodapp.com', B);
  r = await fetch(link); ok('unsubscribe link works', r.status === 200 && (await r.text()).includes('unsubscribed'));
  ok('after unsubscribing Ana is out', (await call('POST', '/api/marketing/count', { audience: { who: 'all' } }, owner)).j.count === 2);

  // ---------- partner shop marketing + win-back + daily limit ----------
  await call('POST', '/api/customers', { name: 'Rico', email: 'rico@x.ph', consent: 1 }, otk);
  const kdb = new DatabaseSync(path.join(dbDir, `org-${k.id}.db`)); const rico = kdb.prepare("select id from customers where email='rico@x.ph'").get();
  kdb.prepare("insert into orders(id,customerId,status,paidAt,date,total) values('kold',?,'paid',?,?,150)").run(rico.id, old, old.slice(0, 10));
  mails.length = 0;
  r = await call('PUT', '/api/marketing/winback', { on: true, days: 45 }, otk); ok('a partner shop turns on "we miss you"', r.s === 200 && r.j.on === true, JSON.stringify(r.j));
  ok('Rico gets it once, from the shop name, replying to the shop', await wait(() => mails.some(m => m.to === 'rico@x.ph')), JSON.stringify(mails.map(m => m.to)));
  const rm = mails.find(m => m.to === 'rico@x.ph');
  ok('sender name is the shop and reply-to is the shop email; unsubscribe link carries the shop', rm && /From: "Kingsman Cuts" <shop@gmail.com>/.test(rm.raw) && /Reply-To: <juan@kingsman.ph>/.test(rm.raw) && /&o=\w+/.test(rm.raw), rm && rm.raw.slice(0, 600));
  await call('PUT', '/api/marketing/winback', { on: true, days: 45 }, otk); await wait(() => false, 1500);
  ok('never twice for the same absence', mails.filter(m => m.to === 'rico@x.ph').length === 1);
  const rl = /List-Unsubscribe: <([^>]+)>/.exec(rm.raw)[1].replace('https://getbrotherhoodapp.com', B); r = await fetch(rl); ok('a partner customer can unsubscribe', r.status === 200 && kdb.prepare('select consent from customers where id=?').get(rico.id).consent === 0);
  mk = (await call('GET', '/api/marketing', null, owner)).j; ok('the daily limit is counted for all shops', mk.sentToday >= 7 && mk.limit === 20, JSON.stringify({ t: mk.sentToday, l: mk.limit }));
  for (let i = 0; i < 20; i++) await call('POST', '/api/customers', { name: 'Z' + i, email: `z${i}@x.ph`, consent: 1 }, owner);
  await wait(() => false, 1500);
  mk = (await call('GET', '/api/marketing', null, owner)).j; ok('over the limit, the rest wait for tomorrow', mk.sentToday === 20 && mk.pending >= 1, JSON.stringify({ t: mk.sentToday, p: mk.pending }));
} catch (e) { fails++; console.log('ERROR', e); }
srv.kill(); smtp.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(0);
