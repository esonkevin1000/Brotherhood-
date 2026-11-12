// Step 1 of the one-app plan: walk-ins and finished services from the Brotherhood app, no POS shift, no receipt.
import { fileURLToPath as __f } from 'node:url';
const ROOT = __f(new URL('..', import.meta.url));
import { spawn } from 'node:child_process';
import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs';
const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt21-'));
const srv = spawn('node', ['server.js'], { cwd: ROOT, env: { ...process.env, ADMIN_PASSWORD: 'ownerpw', DB_FILE: path.join(dbDir, 't.db'), PORT: '3145' }, stdio: 'ignore' });
const B = 'http://localhost:3145';
for (let i = 0; i < 80; i++) { try { await fetch(B + '/api/public/terms'); break; } catch { await new Promise(r => setTimeout(r, 500)); } }
let fails = 0;
async function call(method, url, body, tok) {
  const r = await fetch(B + url, { method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { s: r.status, j };
}
const ok = (name, cond, extra = '') => { if (!cond) fails++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' → ' + extra)); };
const ds = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
try {
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  await call('PUT', '/api/settings', { attPhoto: false, payRules: { lunchAmount: 0, lunchLateMins: 99999, allowLateMins: 99999 } }, owner);
  const st = (await call('GET', '/api/state', null, owner)).j, br = st.branches[0], ch = st.chairs.filter(c => c.branchId === br.id);
  const amigo = st.items.find(i => i.name === 'Amigo'), buddy = st.items.find(i => i.name === 'Buddy'), prod = st.items.find(i => i.type === 'product');
  const lance = (await call('POST', '/api/staff', { name: 'Lance', branchId: br.id, chairId: ch[0].id, pct: 40, allowance: 0 }, owner)).j;
  const kev = (await call('POST', '/api/staff', { name: 'Kev', branchId: br.id, chairId: ch[1].id, pct: 50, allowance: 0 }, owner)).j;
  await call('POST', '/api/users', { name: 'Desk', username: 'desk1', pin: '111111', role: 'cashier', branchId: br.id }, owner);
  await call('POST', '/api/users', { name: 'Lance', username: 'lance', pin: '222222', role: 'barber', branchId: br.id, staffId: lance.id }, owner);
  await call('POST', '/api/users', { name: 'Kev', username: 'kev', pin: '333333', role: 'barber', branchId: br.id, staffId: kev.id }, owner);
  const desk = (await call('POST', '/api/login', { pin: '111111' })).j.token, bl = (await call('POST', '/api/login', { pin: '222222' })).j.token, bk = (await call('POST', '/api/login', { pin: '333333' })).j.token;
  for (const s of [lance, kev]) await call('POST', '/api/attendance', { staffId: s.id, action: 'in' }, desk);

  // the front desk can open the app's pro tools now
  const me = await call('GET', '/api/bh/pro/me', null, desk); ok('front desk can sign in to the app (day board)', me.s === 200 && me.j.desk === true && me.j.staff.length === 2, JSON.stringify(me.j).slice(0, 200));

  // NO shift is opened on purpose: the app does not need one
  let r = await call('POST', '/api/svc/walkin', { name: 'Juan Walk-in', phone: '0917 111 2222', items: [{ itemId: amigo.id, qty: 1 }] }, desk);
  ok('front desk adds a walk-in', r.s === 201 && r.j.status === 'waiting' && r.j.customerName === 'Juan Walk-in', JSON.stringify(r.j));
  const w1 = r.j;
  r = await call('POST', `/api/svc/${w1.id}/start`, { barberId: lance.id }, desk); ok('front desk starts it with Lance', r.s === 200 && r.j.status === 'in_chair' && r.j.barberName === 'Lance', JSON.stringify(r.j));
  r = await call('POST', `/api/svc/${w1.id}/finish`, { method: 'Bogus' }, desk); ok('finish needs a valid pay method', r.s === 400);
  r = await call('POST', `/api/svc/${w1.id}/finish`, { method: 'GCash', invoiceNo: 'BIR-0457', items: [{ itemId: amigo.id, qty: 1 }, { itemId: prod.id, qty: 1 }] }, desk);
  ok('finish works with no shift open, records how paid and the shop invoice no.', r.s === 200 && r.j.status === 'done' && r.j.method === 'GCash' && r.j.invoiceNo === 'BIR-0457' && r.j.total === amigo.price + prod.price, JSON.stringify(r.j));
  r = await call('POST', `/api/svc/${w1.id}/finish`, { method: 'Cash' }, desk); ok('a done visit cannot be finished again', r.s === 409);
  r = await call('POST', `/api/svc/${w1.id}/cancel`, {}, desk); ok('a done visit cannot be cancelled from the app', r.s === 409);

  // a barber adds his own walk-in and finishes it himself
  r = await call('POST', '/api/svc/walkin', { name: 'Pedro', items: [{ itemId: amigo.id, qty: 1 }], barberId: kev.id }, bl);
  ok('a barber walk-in is always his own', r.s === 201 && r.j.barberName === 'Lance' && r.j.status === 'in_chair', JSON.stringify(r.j));
  const w2 = r.j;
  r = await call('POST', `/api/svc/${w2.id}/finish`, { method: 'Cash' }, bk); ok('another barber cannot finish it', r.s === 403);
  r = await call('POST', `/api/svc/${w2.id}/finish`, { method: 'Cash' }, bl); ok('the barber finishes his own customer', r.s === 200 && r.j.status === 'done');

  // the line: an unassigned walk-in, and a barber's view
  r = await call('POST', '/api/svc/walkin', { name: 'Waiting Wally', items: [{ itemId: amigo.id, qty: 1 }] }, desk); const w3 = r.j;
  const tk = (await call('GET', '/api/svc/today', null, bk)).j;
  ok("Kev's board shows only the open line and his own customers", tk.tickets.every(x => x.barberId === kev.id || (x.status === 'waiting' && !x.barberId)) && tk.tickets.some(x => x.id === w3.id), JSON.stringify(tk.tickets.map(x => [x.customerName, x.barberName, x.status])));
  ok("Kev's earnings today show only his own (none yet)", tk.totals.done === 0 && tk.totals.earned === 0, JSON.stringify(tk.totals));
  const tl = (await call('GET', '/api/svc/today', null, bl)).j; ok("Lance's board counts his own 2 visits", tl.totals.done === 2 && tl.totals.earned === 2 * amigo.price + prod.price, JSON.stringify(tl.totals));
  const td = (await call('GET', '/api/svc/today', null, desk)).j; ok('the front desk sees the whole shop', td.totals.done === 2 && td.totals.waiting === 1, JSON.stringify(td.totals));
  ok('no receipt or invoice numbering anywhere in the day board', !JSON.stringify(td).match(/"si"|SI-|Z-/), '');
  r = await call('POST', `/api/svc/${w3.id}/start`, {}, bk); ok('Kev picks up the next customer in line', r.s === 200 && r.j.barberName === 'Kev');
  r = await call('POST', `/api/svc/${w3.id}/cancel`, { reason: 'Left' }, bk); ok('Kev can cancel his own customer', r.s === 200);

  // ID required services (Buddy) need a photo of the ID
  r = await call('POST', '/api/svc/walkin', { name: 'Student Sam', items: [{ itemId: buddy.id, qty: 1 }] }, desk); ok('Buddy needs an ID photo', r.s === 400 && /ID/.test(r.j.error));
  const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
  const ph = await call('POST', '/api/svc/idphoto', { data: JPG, idType: 'Student' }, desk);
  r = await call('POST', '/api/svc/walkin', { name: 'Student Sam', items: [{ itemId: buddy.id, qty: 1 }], idPhotoId: ph.j.id }, desk); ok('with the ID photo the walk-in is accepted', ph.s === 201 && r.s === 201, JSON.stringify([ph.j, r.j]));

  // finished services feed commission, payroll and the customer's visits
  const today = ds(new Date());
  const rep = (await call('GET', `/api/reports/commissions?from=${today}&to=${today}&branch=all`, null, owner)).j, cols = rep.tables[0].cols.map(c => c[0]), rl = rep.tables[0].rows.find(x => x[0] === 'Lance');
  ok('commission counts finished services from the app (2 Amigo at 40% + product commission)', rl && Math.abs(rl[cols.indexOf('Commission')] - (2 * amigo.price * 0.4 + (prod.commission || 0))) < 0.05, JSON.stringify(rl));
  const pay = (await call('GET', `/api/reports/payroll?from=${today}&to=${today}&branch=all`, null, owner)).j; ok('payroll picks it up', pay.tables[0].rows.some(x => x[0] === 'Lance'));
  const cust = (await call('GET', '/api/customers?q=Juan', null, owner)).j.rows.find(c => c.name === 'Juan Walk-in'); ok('the visit counts for the customer (loyalty)', cust && cust.visits === 1, JSON.stringify(cust));

  // permissions
  ok('a customer account cannot use it', (await call('GET', '/api/svc/today')).s === 401);
} catch (e) { fails++; console.log('ERROR', e); }
srv.kill(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
