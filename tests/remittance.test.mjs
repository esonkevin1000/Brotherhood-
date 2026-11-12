import { fileURLToPath as __f } from 'node:url';
const ROOT = __f(new URL('..', import.meta.url));
import { spawn } from 'node:child_process';
import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs';
const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt8-'));
const srv = spawn('node', ['server.js'], { cwd: ROOT, env: { ...process.env, ADMIN_PASSWORD: 'ownerpw', DB_FILE: path.join(dbDir, 't.db'), PORT: '3127' }, stdio: 'ignore' });
const B = 'http://localhost:3127';
for (let i = 0; i < 80; i++) { try { await fetch(B + '/api/public/terms'); break; } catch { await new Promise(r => setTimeout(r, 500)); } }
let fails = 0;
async function call(method, url, body, tok, raw) {
  const r = await fetch(B + url, { method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (raw) return { s: r.status, type: r.headers.get('content-type') };
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { s: r.status, j };
}
const ok = (name, cond, extra = '') => { if (!cond) fails++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' → ' + extra)); };
const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
try {
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  await call('PUT', '/api/settings', { attPhoto: false }, owner);
  const st = (await call('GET', '/api/state', null, owner)).j, br = st.branches[0], br2 = st.branches[1], ch = st.chairs.filter(c => c.branchId === br.id)[0];
  const amigo = st.items.find(i => i.name === 'Amigo'), today = new Date().toISOString().slice(0, 10).replace(/./g, c => c); // server uses local date; fine for the Manila/dev machine
  const bar = (await call('POST', '/api/staff', { name: 'Kev', branchId: br.id, chairId: ch.id, allowance: 0 }, owner)).j;
  await call('POST', '/api/users', { name: 'C1', username: 'cash1', pin: '111111', role: 'cashier', branchId: br.id }, owner);
  await call('POST', '/api/users', { name: 'C2', username: 'cash2', pin: '222222', role: 'cashier', branchId: br2.id }, owner);
  const c1 = (await call('POST', '/api/login', { pin: '111111' })).j.token, c2 = (await call('POST', '/api/login', { pin: '222222' })).j.token;
  await call('POST', '/api/attendance', { staffId: bar.id, action: 'in' }, c1); const sh = (await call('POST', '/api/shifts/open', { openingFloat: 500 }, c1)).j;
  const sell = async (name, tenders) => { const o = (await call('POST', '/api/orders', { customer: { name }, items: [{ itemId: amigo.id, qty: 1 }] }, c1)).j; await call('PUT', '/api/orders/' + o.id, { chairId: ch.id }, c1); const r = await call('POST', `/api/orders/${o.id}/pay`, { tenders }, c1); if (r.s !== 200) throw new Error(JSON.stringify(r)); };
  await sell('A', [{ method: 'Cash', amount: 200 }]); await sell('B', [{ method: 'GCash', amount: 200 }]); await sell('C', [{ method: 'Cash', amount: 200 }]);
  await call('POST', '/api/cash', { shiftId: sh.id, kind: 'expense', amount: 50, note: 'Towels' }, c1);
  const pv = (await call('GET', '/api/remittances/preview', null, c1)).j;
  ok('preview adds up the POS sales by payment method', pv.posSales === 600 && pv.cashSales === 400 && pv.gcashSales === 200 && pv.mayaSales === 0 && pv.cashExpenses === 50, JSON.stringify(pv));
  ok('expected remittance = cash sales − cash expenses', pv.expected === 350, pv.expected);
  const sub = async (tok, body) => call('POST', '/api/remittances', body, tok);
  let r = await sub(c1, { actual: 350 }); ok('a remittance without proof photo is refused', r.s === 400 && /photo/i.test(r.j.error), JSON.stringify(r));
  const f = await call('POST', '/api/files', { data: JPG, kind: 'remit' }, c1); ok('cashier can upload a deposit slip photo', f.s === 201 && f.j.id);
  r = await sub(c1, { actual: 350, proofId: f.j.id, responsible: 'Jericho', notes: 'Deposited at BDO' }); ok('exact amount → PENDING, no discrepancy', r.s === 201 && r.j.status === 'PENDING' && r.j.variance === 0 && r.j.expected === 350, JSON.stringify(r.j));
  r = await sub(c1, { actual: 350, proofId: f.j.id }); ok('cannot submit the same branch/date twice', r.s === 409);
  const rid = (await call('GET', '/api/remittances', null, c1)).j.rows[0].id;
  ok('cashier cannot review', (await call('PUT', `/api/remittances/${rid}/review`, { action: 'verify' }, c1)).s === 403);
  r = await call('PUT', `/api/remittances/${rid}/review`, { action: 'reject' }, owner); ok('rejecting needs a note', r.s === 400);
  r = await call('PUT', `/api/remittances/${rid}/review`, { action: 'reject', note: 'Slip is blurry' }, owner); ok('owner rejects with a note', r.s === 200 && r.j.status === 'REJECTED' && r.j.history.length === 2, JSON.stringify(r.j));
  const f2 = await call('POST', '/api/files', { data: JPG, kind: 'remit' }, c1);
  r = await sub(c1, { actual: 300, proofId: f2.j.id }); ok('after a rejection it can be resubmitted; being ₱50 short is auto-flagged', r.s === 201 && r.j.status === 'FLAGGED' && r.j.variance === -50 && /short/.test(r.j.flagReason), JSON.stringify(r.j));
  const rid2 = r.j.id; r = await call('PUT', `/api/remittances/${rid2}/review`, { action: 'verify' }, owner); ok('owner verifies after review', r.s === 200 && r.j.status === 'VERIFIED' && r.j.history.length === 3, JSON.stringify(r.j.history));
  r = await call('GET', '/api/remittances?branch=all', null, owner); ok('owner sees all submissions with totals', r.j.rows.length === 2 && r.j.totals.count === 2);
  r = await call('GET', '/api/remittances', null, c2); ok('another branch cashier sees none of them', r.s === 200 && r.j.rows.length === 0);
  r = await call('GET', '/api/files/' + f.j.id, null, c1, true); ok('own branch can view the proof photo', r.s === 200 && r.type === 'image/jpeg');
  r = await call('GET', '/api/files/' + f.j.id, null, c2, true); ok('other branch cannot', r.s === 404);
  r = await call('GET', '/api/files/' + f.j.id, null, '', true); ok('not public', r.s === 401 || r.s === 403);
  r = await sub(c2, { actual: 0, proofId: f.j.id }); ok('cannot attach another branch\'s photo', r.s === 400);
  r = await sub(c1, { date: '2020-01-01', actual: 1, proofId: f.j.id }); ok('old business dates are refused', r.s === 400);
} finally { srv.kill(); }
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
