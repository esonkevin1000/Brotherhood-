import { fileURLToPath as __f } from 'node:url';
const ROOT = __f(new URL('..', import.meta.url));
import { spawn } from 'node:child_process';
import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs';
const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt10-'));
const srv = spawn('node', ['server.js'], { cwd: ROOT, env: { ...process.env, ADMIN_PASSWORD: 'ownerpw', DB_FILE: path.join(dbDir, 't.db'), PORT: '3129' }, stdio: 'ignore' });
const B = 'http://localhost:3129';
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
  await call('PUT', '/api/settings', { attPhoto: false, payRules: { lunchAmount: 0, lunchLateMins: 99999, allowLateMins: 99999 } }, owner);
  const st = (await call('GET', '/api/state', null, owner)).j, br = st.branches[0], ch = st.chairs.filter(c => c.branchId === br.id)[0], amigo = st.items.find(i => i.name === 'Amigo');
  const bar = (await call('POST', '/api/staff', { name: 'Kev', branchId: br.id, chairId: ch.id, allowance: 500, pct: 40 }, owner)).j;
  await call('POST', '/api/users', { name: 'C1', username: 'cash1', pin: '111111', role: 'cashier', branchId: br.id }, owner);
  const c1 = (await call('POST', '/api/login', { pin: '111111' })).j.token;
  await call('POST', '/api/attendance', { staffId: bar.id, action: 'in' }, c1); await call('POST', '/api/shifts/open', { openingFloat: 0 }, c1);
  const o = (await call('POST', '/api/orders', { customer: { name: 'A' }, items: [{ itemId: amigo.id, qty: 1 }] }, c1)).j; await call('PUT', '/api/orders/' + o.id, { chairId: ch.id }, c1); await call('POST', `/api/orders/${o.id}/pay`, { tenders: [{ method: 'Cash', amount: 200 }] }, c1);
  const ds = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; const t0 = ds(new Date());
  const req = body => call('POST', '/api/advances', { staffId: bar.id, type: 'Cash Advance', amount: 900, reason: 'Medical bills for mother', installments: 3, ...body }, c1);
  let r = await req({ consent: false }); ok('request without the employee agreeing to the deduction is refused', r.s === 400 && /agree/i.test(r.j.error), JSON.stringify(r));
  r = await req({ consent: true, reason: 'x' }); ok('a reason is required', r.s === 400);
  r = await req({ consent: true, type: 'Gift' }); ok('unknown request type refused', r.s === 400);
  r = await req({ consent: true }); ok('cashier can submit a request for an employee', r.s === 201 && r.j.status === 'REQUESTED', JSON.stringify(r)); const id = r.j.id;
  ok('cashier cannot approve', (await call('PUT', `/api/advances/${id}/approve`, { consent: true }, c1)).s === 403);
  r = await call('PUT', `/api/advances/${id}/approve`, { approvedAmt: 900 }, owner); ok('approval needs the written-authorization confirmation', r.s === 400);
  r = await call('PUT', `/api/advances/${id}/approve`, { approvedAmt: 2000, consent: true }, owner); ok('cannot approve more than requested', r.s === 400);
  r = await call('PUT', `/api/advances/${id}/release`, { releasedAmt: 900, method: 'Cash' }, owner); ok('cannot release before approval', r.s === 409);
  r = await call('PUT', `/api/advances/${id}/approve`, { approvedAmt: 900, installments: 3, firstDue: t0, consent: true, note: 'OK' }, owner); ok('owner approves', r.s === 200 && r.j.status === 'APPROVED' && r.j.deductions.length === 0, JSON.stringify(r.j));
  ok('nothing is deducted yet (not released)', (await call('GET', '/api/advances/balance?staffId=' + bar.id, null, c1)).j.balance === 0);
  r = await call('PUT', `/api/advances/${id}/release`, { releasedAmt: 900, method: 'Cash' }, owner); ok('release needs a proof photo', r.s === 400 && /proof/i.test(r.j.error), JSON.stringify(r));
  const pf = (await call('POST', '/api/files', { data: JPG, kind: 'release', branchId: br.id }, owner)).j.id;
  r = await call('PUT', `/api/advances/${id}/release`, { releasedAmt: 900, method: 'Cash', proofId: pf }, owner); ok('release with proof schedules 3 installments of 300', r.s === 200 && r.j.status === 'RELEASED' && r.j.deductions.length === 3 && r.j.deductions.every(d => d.amount === 300) && r.j.balance === 900, JSON.stringify(r.j));
  ok('installments are 15 days apart', r.j.deductions[1].dueDate > r.j.deductions[0].dueDate && r.j.deductions[0].dueDate === t0);
  ok('cash released from the open drawer reduces the expected remittance', (await call('GET', '/api/remittances/preview', null, c1)).j.cashExpenses === 900);
  r = await call('PUT', `/api/advances/${id}/release`, { releasedAmt: 900, method: 'Cash', proofId: pf }, owner); ok('cannot release twice (no duplicate deductions)', r.s === 409);
  const rep = (await call('GET', `/api/reports/payroll?from=${t0}&to=${t0}&branch=all`, null, owner)).j;
  const row = rep.tables[0].rows[0], cols = rep.tables[0].cols.map(c => c[0]);
  ok('payroll shows the release-pay deduction due today (first installment only)', cols.includes('Release pay deductions') && row[cols.indexOf('Release pay deductions')] === 300, JSON.stringify([cols, row]));
  const net = row[cols.indexOf('Net due')], gross = row[cols.indexOf('Commission')] + row[cols.indexOf('Top-up & lunch')]; ok('net due = pay - advances - deductions', net === gross - row[cols.indexOf('Advances')] - 300, JSON.stringify(row));
  r = await call('POST', '/api/payroll/pay', { staffIds: [bar.id], to: t0 }, owner); ok('marking payroll paid works', r.s === 200 && r.j.days === 1, JSON.stringify(r));
  const bal = (await call('GET', '/api/advances/balance?staffId=' + bar.id, null, c1)).j; ok('one installment applied, 600 balance left, history kept', bal.balance === 600 && bal.deducted === 300 && bal.deductions.filter(d => d.status === 'APPLIED').length === 1, JSON.stringify(bal));
  await call('POST', '/api/payroll/pay', { staffIds: [bar.id], to: t0 }, owner); const bal2 = (await call('GET', '/api/advances/balance?staffId=' + bar.id, null, c1)).j; ok('paying again never deducts twice', bal2.deducted === 300 && bal2.balance === 600);
  const rep2 = (await call('GET', `/api/reports/payroll?from=${t0}&to=${t0}&branch=all`, null, owner)).j; ok('paid-in-period includes the deduction', rep2.cards.find(c => c.label === 'Paid in period').value === gross - row[cols.indexOf('Advances')] - 300, JSON.stringify(rep2.cards));
  const big = (await call('POST', '/api/advances', { staffId: bar.id, type: 'Emergency Assistance', amount: 100000, reason: 'Big emergency need', installments: 1, consent: true }, c1)).j;
  await call('PUT', `/api/advances/${big.id}/approve`, { consent: true, firstDue: t0 }, owner); await call('PUT', `/api/advances/${big.id}/release`, { releasedAmt: 100000, method: 'Bank Transfer', proofId: pf }, owner);
  ok('a large advance stays on the balance until pay can cover it', (await call('GET', '/api/advances/balance?staffId=' + bar.id, null, c1)).j.balance === 100600);
  const od = (await call('POST', '/api/advances', { staffId: bar.id, type: 'Other Authorized Deduction', amount: 200, reason: 'Uniform purchase', installments: 2, consent: true }, c1)).j;
  await call('PUT', `/api/advances/${od.id}/approve`, { consent: true, firstDue: t0 }, owner); r = await call('PUT', `/api/advances/${od.id}/release`, {}, owner); ok('an other-deduction needs no payout proof and schedules directly', r.s === 200 && r.j.deductions.length === 2, JSON.stringify(r));
  const cn = (await call('POST', '/api/advances', { staffId: bar.id, type: 'Cash Advance', amount: 50, reason: 'Changed my mind', installments: 1, consent: true }, c1)).j; r = await call('PUT', `/api/advances/${cn.id}/cancel`, { note: 'Not needed' }, owner); ok('a request can be cancelled before release', r.s === 200 && r.j.status === 'CANCELLED');
  r = await call('GET', '/api/advances', null, c1); ok('cashier sees their branch list', r.s === 200 && r.j.rows.length === 4, r.j.rows?.length);
} finally { srv.kill(); }
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
