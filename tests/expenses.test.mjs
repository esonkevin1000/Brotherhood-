import { fileURLToPath as __f } from 'node:url';
const ROOT = __f(new URL('..', import.meta.url));
import { spawn } from 'node:child_process';
import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs';
const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt9-'));
const srv = spawn('node', ['server.js'], { cwd: ROOT, env: { ...process.env, ADMIN_PASSWORD: 'ownerpw', DB_FILE: path.join(dbDir, 't.db'), PORT: '3128' }, stdio: 'ignore' });
const B = 'http://localhost:3128';
for (let i = 0; i < 80; i++) { try { await fetch(B + '/api/public/terms'); break; } catch { await new Promise(r => setTimeout(r, 500)); } }
let fails = 0;
async function call(method, url, body, tok, raw) {
  const r = await fetch(B + url, { method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (raw) return { s: r.status, text: await r.text() };
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { s: r.status, j };
}
const ok = (name, cond, extra = '') => { if (!cond) fails++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' → ' + extra)); };
const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
try {
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  await call('PUT', '/api/settings', { attPhoto: false }, owner);
  const st = (await call('GET', '/api/state', null, owner)).j, br = st.branches[0], br2 = st.branches[1];
  await call('POST', '/api/users', { name: 'C1', username: 'cash1', pin: '111111', role: 'cashier', branchId: br.id }, owner);
  await call('POST', '/api/users', { name: 'C2', username: 'cash2', pin: '222222', role: 'cashier', branchId: br2.id }, owner);
  const c1 = (await call('POST', '/api/login', { pin: '111111' })).j.token, c2 = (await call('POST', '/api/login', { pin: '222222' })).j.token;
  const sh = (await call('POST', '/api/shifts/open', { openingFloat: 0 }, c1)).j;
  const ph = [(await call('POST', '/api/files', { data: JPG, kind: 'receipt' }, c1)).j.id, (await call('POST', '/api/files', { data: JPG, kind: 'receipt' }, c1)).j.id];
  const base = { category: 'Supplies', description: 'Towels', amount: 120, method: 'Cash' };
  let r = await call('POST', '/api/expense-claims', { ...base }, c1); ok('no receipt and no reason is refused', r.s === 400 && /receipt/i.test(r.j.error), JSON.stringify(r));
  r = await call('POST', '/api/expense-claims', { ...base, noReceiptReason: 'ok' }, c1); ok('a too-short reason is refused', r.s === 400);
  r = await call('POST', '/api/expense-claims', { ...base, noReceiptReason: 'Sari-sari store gave none' }, c1); ok('NO RECEIPT with a reason is accepted and labelled', r.s === 201 && r.j.noReceipt === true && r.j.status === 'PENDING', JSON.stringify(r));
  const noRec = r.j.id;
  r = await call('POST', '/api/expense-claims', { ...base, category: 'Nope' }, c1); ok('unknown category refused', r.s === 400);
  r = await call('POST', '/api/expense-claims', { ...base, amount: 0, receipts: ph }, c1); ok('zero amount refused', r.s === 400);
  r = await call('POST', '/api/expense-claims', { ...base, amount: 300, category: 'Utilities', description: 'Water bill', method: 'GCash', receipts: ph }, c1); ok('multiple receipt photos accepted', r.s === 201 && r.j.receipts.length === 2 && r.j.noReceipt === false, JSON.stringify(r));
  const withRec = r.j.id;
  r = await call('POST', '/api/expense-claims', { ...base, receipts: [ph[0]] }, c2); ok('cannot use another branch\'s photo', r.s === 400);
  const pv = (await call('GET', '/api/remittances/preview', null, c1)).j; ok('cash expense from the open drawer reduces the expected remittance (GCash one does not)', pv.cashExpenses === 120, JSON.stringify(pv));
  let l = (await call('GET', '/api/expense-claims?range=today', null, c1)).j; ok('list shows totals, no-receipt count and categories', l.count === 2 && l.total === 420 && l.noReceipt === 1 && l.byCategory.Utilities === 300, JSON.stringify(l).slice(0, 300));
  l = (await call('GET', '/api/expense-claims?range=today', null, c2)).j; ok('other branch sees nothing', l.count === 0);
  ok('cashier cannot approve', (await call('PUT', `/api/expense-claims/${noRec}/review`, { action: 'approve' }, c1)).s === 403);
  r = await call('PUT', `/api/expense-claims/${noRec}/review`, { action: 'reject' }, owner); ok('rejecting needs a note', r.s === 400);
  r = await call('PUT', `/api/expense-claims/${noRec}/review`, { action: 'reject', note: 'Bring a receipt next time' }, owner); ok('owner rejects with a note', r.s === 200 && r.j.status === 'REJECTED' && r.j.history.length === 2);
  r = await call('PUT', `/api/expense-claims/${withRec}/review`, { action: 'approve' }, owner); ok('owner approves', r.s === 200 && r.j.status === 'APPROVED');
  l = (await call('GET', '/api/expense-claims?range=today', null, owner)).j; ok('rejected expenses are not counted in the total', l.total === 300, l.total);
  r = await call('GET', '/api/expense-claims?range=today&format=csv', null, owner, true); ok('owner can export CSV with NO RECEIPT labelled', r.s === 200 && r.text.includes('NO RECEIPT') && r.text.includes('Water bill'));
  r = await call('GET', '/api/expense-claims?range=today&format=csv', null, c1, true); ok('cashier cannot export', r.s === 403);
} finally { srv.kill(); }
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
