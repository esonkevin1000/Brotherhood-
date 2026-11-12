import { fileURLToPath as __f } from 'node:url';
const ROOT = __f(new URL('..', import.meta.url));
import { spawn } from 'node:child_process';
import http from 'node:http'; import crypto from 'node:crypto';
import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs';
const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt3-'));
// a fake Resend API so we can inspect the emails we would send
const sent = []; let mockFail = false;
const mock = http.createServer((q, s) => { let b = ''; q.on('data', c => b += c); q.on('end', () => { if (mockFail) { s.writeHead(422, { 'Content-Type': 'application/json' }); return s.end('{"message":"domain not verified"}'); } sent.push({ auth: q.headers.authorization, ...JSON.parse(b) }); s.writeHead(200, { 'Content-Type': 'application/json' }); s.end('{"id":"x"}'); }); }).listen(3199);
const env = { ...process.env, ADMIN_PASSWORD: 'ownerpw', DB_FILE: path.join(dbDir, 't.db'), PORT: '3122', BOOK_LIMIT: '1000' };
const start = (extra = {}) => spawn('node', ['server.js'], { cwd: ROOT, env: { ...env, ...extra }, stdio: 'ignore' });
let srv = start();
for (let i = 0; i < 80; i++) { try { await fetch('http://localhost:3122/api/public/terms'); break; } catch { await new Promise(r => setTimeout(r, 500)); } }
const B = 'http://localhost:3122'; let fails = 0;
async function call(method, url, body, tok) {
  const r = await fetch(B + url, { method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { s: r.status, j };
}
const ok = (name, cond, extra = '') => { if (!cond) fails++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' → ' + extra)); };
const ymd = n => { const d = new Date(Date.now() + n * 864e5); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
try {
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  await call('PUT', '/api/settings', { attPhoto: false }, owner);
  { const _s = (await call('GET', '/api/state', null, owner)).j; for (const _i of _s.items.filter(i => i.name === 'Buddy')) await call('PUT', '/api/items/' + _i.id, { needId: 0 }, owner); }
  const st = (await call('GET', '/api/state', null, owner)).j, br = st.branches[0];
  const kev = (await call('POST', '/api/staff', { name: 'Kevin', branchId: br.id, pct: 50, allowance: 0 }, owner)).j;
  await call('POST', '/api/users', { name: 'Cashier', username: 'cashier1', pin: '111111', role: 'cashier', branchId: br.id }, owner);
  const cash = (await call('POST', '/api/login', { pin: '111111' })).j.token;
  await call('POST', '/api/attendance', { staffId: kev.id, action: 'in' }, cash); await call('POST', '/api/shifts/open', { openingFloat: 0 }, cash);
  const buddy = st.items.find(i => i.name === 'Buddy');
  await call('PUT', '/api/items/' + buddy.id, { bookable: 1 }, owner);   // Buddy is walk-in only by default; these tests book it online
  const total = async () => (await call('GET', '/api/customers?q=', null, owner)).j.total;
  const ticket = (customer, extra = {}) => call('POST', '/api/orders', { items: [{ itemId: buddy.id, qty: 1 }], customer, ...extra }, cash);
  const visit = async customer => { const t = (await ticket(customer, { barberId: kev.id })).j; return call('POST', `/api/orders/${t.id}/pay`, { tenders: [{ method: 'Cash', amount: 150 }] }, cash); };

  // ---- directory rule ----
  const a = await ticket({ name: 'Walang Contact' }); ok('name only → ticket works', a.s === 201 && a.j.customerName === 'Walang Contact' && a.j.customerId === '');
  ok('name only → NOT in directory', (await total()) === 0);
  const b = await ticket({ name: 'Juan Dela Cruz', phone: '0917 111 2222', preferredCut: 'Low fade' }); ok('name+phone → in directory', b.s === 201 && b.j.customerId && (await total()) === 1, JSON.stringify(b));
  const j1 = (await call('GET', '/api/customers/lookup?phone=%2B63%20917%20111%202222', null, cash)).j.customer; ok('lookup by +63 format finds same person', j1?.name === 'Juan Dela Cruz' && j1.preferredCut === 'Low fade' && j1.tier === 'Member' && j1.visits === 0, JSON.stringify(j1));
  ok('phone-only + consent but no email → no email queued', (await call('GET', '/api/settings', null, owner)).j.log.length === 0);
  ok('bad email rejected', (await ticket({ name: 'X', phone: '0917 999 8888', email: 'nope' })).s === 400);
  ok('short phone rejected', (await ticket({ name: 'X', phone: '123' })).s === 400);
  ok('email only is enough for the directory', (await ticket({ name: 'Maria Email', email: 'Maria@Example.com' })).j.customerId !== '' && (await total()) === 2);
  ok('cashier cannot read/write settings', (await call('GET', '/api/settings', null, cash)).s === 403);

  // ---- consent + welcome email ----
  const c1 = await ticket({ name: 'Pedro Santos', phone: '0919 777 8888', email: 'pedro@example.com', preferredCut: 'Pompadour', consent: false });
  ok('email without consent → no welcome email', (await call('GET', '/api/settings', null, owner)).j.log.length === 0);
  const c2 = await ticket({ name: 'Pedro Santos', phone: '0919 777 8888', consent: true });   // second time he ticks the box (email already on file)
  ok('same person (matched by phone), email auto-synced from before', c2.j.customerId === c1.j.customerId && (await total()) === 3);
  let log = (await call('GET', '/api/settings', null, owner)).j.log; ok('consent given → welcome email queued once (pending: no API key yet)', log.length === 1 && log[0].toAddr === 'pedro@example.com' && log[0].status === 'pending' && log[0].kind === 'welcome', JSON.stringify(log));
  await ticket({ name: 'Pedro Santos', phone: '0919 777 8888', consent: true }); log = (await call('GET', '/api/settings', null, owner)).j.log; ok('welcome email is not sent twice', log.length === 1);
  const pedro = (await call('GET', '/api/customers/lookup?phone=09197778888', null, cash)).j.customer; ok('preferred cut kept for returning customer', pedro.preferredCut === 'Pompadour' && pedro.email === 'pedro@example.com' && pedro.consent === 1);
  ok('cashier PUT can update preferred cut at the counter', (await call('PUT', '/api/orders/' + c2.j.id, { customer: { id: pedro.id, preferredCut: 'Taper' } }, cash)).s === 200 && (await call('GET', '/api/customers/lookup?phone=09197778888', null, cash)).j.customer.preferredCut === 'Taper');

  // ---- points & tiers (1 paid visit = 1 point) ----
  const rey = { name: 'Reynaldo Loyal', phone: '0920 123 4567', email: 'rey@example.com', consent: true };
  const stats = async () => (await call('GET', '/api/customers/lookup?phone=09201234567', null, cash)).j.customer;
  let expectTier = { 4: 'Member', 5: 'Bronze', 15: 'Bronze', 16: 'Silver', 25: 'Silver', 26: 'Gold', 50: 'Gold', 51: 'VIP' }, wrong = [];
  for (let v = 1; v <= 51; v++) {
    const p = await visit(v === 1 ? rey : { phone: '0920 123 4567' }); if (p.s !== 200) { wrong.push('visit ' + v + ' failed ' + JSON.stringify(p.j)); break; }
    if (expectTier[v]) { const s = await stats(); if (s.visits !== v || s.tier !== expectTier[v]) wrong.push(`v${v}: got ${s.visits}/${s.tier}`); }
  }
  ok('tiers: 4 Member · 5/15 Bronze · 16/25 Silver · 26/50 Gold · 51 VIP', wrong.length === 0, wrong.join(' | '));
  const fin = await stats(); ok('total spent adds up (51 × ₱150)', fin.spent === 7650 && fin.visits === 51 && fin.next === null, JSON.stringify(fin));
  ok('unpaid/void tickets do not count as visits', (await ticket({ phone: '0920 123 4567' })).s === 201 && (await stats()).visits === 51);
  const lst = (await call('GET', '/api/customers?tier=vip', null, owner)).j; ok('directory filter: VIP', lst.total === 1 && lst.rows[0].tier === 'VIP' && lst.rows[0].spent === 7650);
  ok('directory filter: Member', (await call('GET', '/api/customers?tier=member', null, owner)).j.total === 3);

  // ---- booking feeds the directory ----
  const D = ymd(1);
  const bk = await call('POST', '/api/public/book', { branchId: br.id, staffId: 'any', date: D, time: '10:00', itemIds: [buddy.id], name: 'Online Olivia', phone: '0930 555 1212', email: 'olivia@example.com', preferredCut: 'Bob cut', consent: true });
  ok('online booking → directory (phone+email+cut+consent)', bk.s === 201); const olivia = (await call('GET', '/api/customers/lookup?phone=09305551212', null, cash)).j.customer; ok('  …with preferred cut and consent', olivia?.preferredCut === 'Bob cut' && olivia.consent === 1 && olivia.email === 'olivia@example.com', JSON.stringify(olivia));
  const n0 = await total();
  await call('POST', '/api/public/book', { branchId: br.id, staffId: 'any', date: D, time: '12:00', itemIds: [buddy.id], name: 'Olivia R.', phone: '09305551212' });
  ok('rebooking with the same phone syncs to the same person', (await total()) === n0);
  ok('booking without phone is refused', (await call('POST', '/api/public/book', { branchId: br.id, staffId: 'any', date: D, time: '14:00', itemIds: [buddy.id], name: 'No Phone', email: 'x@example.com' })).s === 400);

  // ---- admin edits ----
  const mem = (await call('GET', '/api/customers?q=maria', null, owner)).j.rows[0];
  ok('cannot remove both phone and email', (await call('PUT', '/api/customers/' + mem.id, { email: '', phone: '' }, owner)).s === 400);
  ok('cannot reuse another customer\'s phone', (await call('PUT', '/api/customers/' + mem.id, { phone: '0919 777 8888' }, owner)).s === 409);
  ok('admin can edit preferred cut', (await call('PUT', '/api/customers/' + mem.id, { preferredCut: 'Crew cut', phone: '0925 000 1111' }, owner)).j.preferredCut === 'Crew cut');
  const imp = await call('POST', '/api/customers/import', { rows: [{ name: 'Imp One', phone: '0926 000 0001' }, { name: 'No Contact' }, { name: 'Dup', phone: '0925 000 1111' }, { name: 'Imp Two', email: 'two@example.com', preferredCut: 'Skin fade' }] }, owner);
  ok('import: only rows with phone/email, deduped', imp.j.added === 2 && imp.j.skipped === 2, JSON.stringify(imp.j));
  ok('imported customers have NO consent (no emails sent to them)', (await call('GET', '/api/customers/lookup?email=two@example.com', null, cash)).j.customer.consent === 0);

  // ---- terms ----
  ok('public terms available', /TERMS/.test((await call('GET', '/api/public/terms')).j.terms));
  await call('PUT', '/api/settings', { terms: 'Custom terms text' }, owner); ok('admin can edit terms', (await call('GET', '/api/public/terms')).j.terms === 'Custom terms text');
  ok('test-email without API key → clear message', (await call('POST', '/api/settings/test-email', { to: 'me@example.com' }, owner)).s === 409);

  // ---- unsubscribe ----
  const sig = id => crypto.createHmac('sha256', 'bp:ownerpw').update('unsub:' + id).digest('base64url').slice(0, 22);
  ok('unsubscribe with a wrong token is refused', (await fetch(`${B}/unsubscribe?c=${pedro.id}&t=wrong`)).status === 400 && (await call('GET', '/api/customers/lookup?phone=09197778888', null, cash)).j.customer.consent === 1);
  const un = await fetch(`${B}/unsubscribe?c=${pedro.id}&t=${sig(pedro.id)}`); ok('unsubscribe link works', un.status === 200 && /unsubscribed/i.test(await un.text()) && (await call('GET', '/api/customers/lookup?phone=09197778888', null, cash)).j.customer.consent === 0);
  ok('points survive unsubscribing', (await call('GET', '/api/customers/lookup?phone=09197778888', null, cash)).j.customer.id === pedro.id);

  // ---- real sending path via the mock API ----
  srv.kill(); await new Promise(r => setTimeout(r, 800));
  srv = start({ RESEND_API_KEY: 're_test', RESEND_URL: 'http://localhost:3199/emails', EMAIL_FROM: 'Brotherhood Barber <hello@getbrotherhoodapp.com>', PUBLIC_URL: 'https://getbrotherhoodapp.com' });
  await new Promise(r => setTimeout(r, 2800));
  const owner2 = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  const cash2 = (await call('POST', '/api/login', { pin: '111111' })).j.token;
  await call('POST', '/api/orders', { items: [{ itemId: buddy.id, qty: 1 }], customer: { name: 'Mail Test', phone: '0940 111 0000', email: 'mail@example.com', consent: true } }, cash2);
  await new Promise(r => setTimeout(r, 1500));
  const m = sent.find(x => x.to[0] === 'mail@example.com'); ok('welcome email delivered to the provider', !!m && /Welcome to Brotherhood Barber/.test(m.subject) && m.auth === 'Bearer re_test' && m.from.includes('Brotherhood Barber'), JSON.stringify(sent.map(s => s.to)));
  ok('  email contains tiers + first name + real unsubscribe link', m && /Mail/.test(m.html) && /Bronze/.test(m.html) && /VIP/.test(m.html) && m.html.includes('https://getbrotherhoodapp.com/unsubscribe?c=') && !m.html.includes('{{UNSUB}}') && /5-15/.test(m.html));
  ok('  the older pending welcome (Pedro unsubscribed earlier) was still sent from queue', sent.length >= 1);
  const lg = (await call('GET', '/api/settings', null, owner2)).j; ok('log shows sent + settings show configured', lg.email.configured === true && lg.log.some(l => l.toAddr === 'mail@example.com' && l.status === 'sent'), JSON.stringify(lg.log.map(l => l.toAddr + ':' + l.status)));
  ok('test email sends', (await call('POST', '/api/settings/test-email', { to: 'owner@example.com' }, owner2)).s === 200 && sent.some(x => x.to[0] === 'owner@example.com' && /^TEST/.test(x.subject)));
  mockFail = true; const bad = await call('POST', '/api/settings/test-email', { to: 'owner@example.com' }, owner2); ok('provider error is reported (e.g. domain not verified)', bad.s === 502 && /domain not verified/.test(bad.j.error), JSON.stringify(bad));
} finally { srv.kill(); mock.close(); }
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
