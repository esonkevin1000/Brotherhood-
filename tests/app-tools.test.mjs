// Step 2 of the one-app plan: the POS tools work from the app without a POS shift.
import { fileURLToPath as __f } from 'node:url';
const ROOT = __f(new URL('..', import.meta.url));
import { spawn } from 'node:child_process';
import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs';
const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt22-'));
const srv = spawn('node', ['server.js'], { cwd: ROOT, env: { ...process.env, ADMIN_PASSWORD: 'ownerpw', DB_FILE: path.join(dbDir, 't.db'), PORT: '3146' }, stdio: 'ignore' });
const B = 'http://localhost:3146';
for (let i = 0; i < 80; i++) { try { await fetch(B + '/api/public/terms'); break; } catch { await new Promise(r => setTimeout(r, 500)); } }
let fails = 0;
async function call(method, url, body, tok) {
  const r = await fetch(B + url, { method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { s: r.status, j };
}
const ok = (name, cond, extra = '') => { if (!cond) fails++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' → ' + extra)); };
const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
try {
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  const st = (await call('GET', '/api/state', null, owner)).j, br = st.branches[0], ch = st.chairs.filter(c => c.branchId === br.id), amigo = st.items.find(i => i.name === 'Amigo');
  const lance = (await call('POST', '/api/staff', { name: 'Lance', branchId: br.id, chairId: ch[0].id, pct: 40, allowance: 0 }, owner)).j;
  const kev = (await call('POST', '/api/staff', { name: 'Kev', branchId: br.id, chairId: ch[1].id, pct: 40, allowance: 0 }, owner)).j;
  await call('POST', '/api/users', { name: 'Desk', username: 'desk1', pin: '111111', role: 'cashier', branchId: br.id }, owner);
  await call('POST', '/api/users', { name: 'Lance', username: 'lance', pin: '222222', role: 'barber', branchId: br.id, staffId: lance.id }, owner);
  const desk = (await call('POST', '/api/login', { pin: '111111' })).j.token, bl = (await call('POST', '/api/login', { pin: '222222' })).j.token;

  // a barber takes his own selfie and clocks himself in from the app (selfies are on by default)
  const sf = await call('POST', '/api/files', { data: JPG, kind: 'attendance', branchId: br.id }, bl); ok('a barber can upload his selfie', sf.s === 201 || sf.s === 200, JSON.stringify(sf.j));
  let r = await call('POST', '/api/attendance', { staffId: lance.id, action: 'in', photoId: sf.j.id, clientId: 'c-1', deviceAt: new Date().toISOString() }, bl); ok('a barber clocks himself in', r.s === 200, JSON.stringify(r.j));
  r = await call('POST', '/api/attendance', { staffId: kev.id, action: 'in', photoId: sf.j.id }, bl); ok('a barber cannot clock in someone else', r.s === 403, JSON.stringify(r.j));
  r = await call('POST', '/api/attendance', { staffId: lance.id, action: 'out' }, bl); ok('time out still needs a selfie', r.s === 400, JSON.stringify(r.j));
  const td = (await call('GET', '/api/svc/today', null, bl)).j; ok('the day board shows him in and passes the selfie setting and modules', td.staff.find(s => s.id === lance.id).state !== 'none' && td.attPhoto === true && Array.isArray(td.modules), JSON.stringify({ a: td.attPhoto, m: td.modules }));

  // the front desk: a cash expense with no POS shift lowers the cash to turn over
  await call('POST', '/api/svc/walkin', { name: 'Juan', items: [{ itemId: amigo.id, qty: 1 }], barberId: lance.id }, desk);
  const tk = (await call('GET', '/api/svc/today', null, desk)).j.tickets[0];
  await call('POST', `/api/svc/${tk.id}/finish`, { method: 'Cash' }, desk);
  const rc = await call('POST', '/api/files', { data: JPG, kind: 'receipt', branchId: br.id }, desk);
  r = await call('POST', '/api/expense-claims', { branchId: br.id, category: 'Supplies', description: 'Alcohol and cotton', amount: 50, method: 'Cash', receipts: [rc.j.id] }, desk); ok('the front desk saves an expense with a receipt (no shift)', r.s === 201, JSON.stringify(r.j));
  const today = (d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)(new Date());
  const pv = (await call('GET', '/api/remittances/preview?date=' + today, null, desk)).j; ok('end-of-day cash = cash collected − cash expenses (no shift needed)', pv.cashSales === amigo.price && pv.cashExpenses === 50 && pv.expected === amigo.price - 50, JSON.stringify(pv));
  const pf = await call('POST', '/api/files', { data: JPG, kind: 'remit', branchId: br.id }, desk);
  r = await call('POST', '/api/remittances', { branchId: br.id, date: today, actual: amigo.price - 50, responsible: 'Desk', proofId: pf.j.id }, desk); ok('the front desk turns over the day\'s cash', r.s === 201, JSON.stringify(r.j));

  // problems with a photo from a barber; leave; checklist
  const pp = await call('POST', '/api/files', { data: JPG, kind: 'problem', branchId: br.id }, bl);
  r = await call('POST', '/api/problems', { branchId: br.id, category: 'Air conditioning', priority: 'High', description: 'The aircon is leaking water', photos: [pp.j.id] }, bl); ok('a barber reports a problem with a photo', r.s === 201, JSON.stringify(r.j));
  r = await call('POST', '/api/leaves', { branchId: br.id, staffId: kev.id, type: 'Sick', from: today, to: today, reason: 'Fever' }, desk); ok('the front desk files a leave', r.s === 201, JSON.stringify(r.j));
  const ck = (await call('GET', '/api/checklists/today', null, desk)).j;
  const items = await Promise.all(ck.template.opening.map(async t => t.photo ? { done: true, photoId: (await call('POST', '/api/files', { data: JPG, kind: 'checklist', branchId: br.id }, desk)).j.id } : { done: true }));
  r = await call('POST', '/api/checklists/submit', { branchId: br.id, kind: 'opening', items }, desk); ok('the front desk submits the opening checklist', r.s === 201 || r.s === 200, JSON.stringify(r.j).slice(0, 200));
  r = await call('POST', '/api/advances', { branchId: br.id, staffId: kev.id, type: 'Cash Advance', amount: 300, installments: 2, reason: 'Family emergency', consent: true }, desk); ok('the front desk files a release pay request', r.s === 201, JSON.stringify(r.j));
} catch (e) { fails++; console.log('ERROR', e); }
srv.kill(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
