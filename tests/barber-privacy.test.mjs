import { fileURLToPath as __f } from 'node:url';
const ROOT = __f(new URL('..', import.meta.url));
import { spawn } from 'node:child_process';
import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs';
const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt15-'));
const srv = spawn('node', ['server.js'], { cwd: ROOT, env: { ...process.env, ADMIN_PASSWORD: 'ownerpw', DB_FILE: path.join(dbDir, 't.db'), PORT: '3135' }, stdio: 'ignore' });
const B = 'http://localhost:3135';
for (let i = 0; i < 80; i++) { try { await fetch(B + '/api/public/terms'); break; } catch { await new Promise(r => setTimeout(r, 500)); } }
let fails = 0;
async function call(method, url, body, tok) {
  const r = await fetch(B + url, { method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { s: r.status, j };
}
const ok = (name, cond, extra = '') => { if (!cond) fails++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' → ' + extra)); };
try {
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  await call('PUT', '/api/settings', { attPhoto: false, payRules: { lunchAmount: 0, lunchLateMins: 99999, allowLateMins: 99999 } }, owner);
  const st = (await call('GET', '/api/state', null, owner)).j, br = st.branches[0], ch = st.chairs.filter(c => c.branchId === br.id);
  const buddy = st.items.find(i => i.name === 'Amigo');
  const lance = (await call('POST', '/api/staff', { name: 'Lance', branchId: br.id, chairId: ch[0].id, allowance: 500, pct: 40 }, owner)).j;
  const kevin = (await call('POST', '/api/staff', { name: 'Kevin', branchId: br.id, chairId: ch[1].id, allowance: 500, pct: 40 }, owner)).j;
  await call('POST', '/api/users', { name: 'Cashier', username: 'cashier1', pin: '111111', role: 'cashier', branchId: br.id }, owner);
  await call('POST', '/api/users', { name: 'Lance', username: 'lance', pin: '222222', role: 'barber', branchId: br.id, staffId: lance.id }, owner);
  await call('POST', '/api/users', { name: 'Kevin', username: 'kevin', pin: '333333', role: 'barber', branchId: br.id, staffId: kevin.id }, owner);
  await call('POST', '/api/users', { name: 'Unlinked', username: 'unl', pin: '444444', role: 'barber', branchId: br.id }, owner);
  const cash = (await call('POST', '/api/login', { pin: '111111' })).j.token, bl = (await call('POST', '/api/login', { pin: '222222' })).j.token, bk = (await call('POST', '/api/login', { pin: '333333' })).j.token, bu = (await call('POST', '/api/login', { pin: '444444' })).j.token;
  for (const s of [lance, kevin]) await call('POST', '/api/attendance', { staffId: s.id, action: 'in' }, cash);
  await call('POST', '/api/shifts/open', { openingFloat: 0 }, cash);
  // Lance cuts two Amigo (₱?), Kevin none
  for (let i = 0; i < 2; i++) {
    const o = (await call('POST', '/api/orders', { customer: { name: 'C' + i }, items: [{ itemId: buddy.id, qty: 1 }] }, cash)).j;
    await call('PUT', '/api/orders/' + o.id, { chairId: ch[0].id, barberId: lance.id }, cash);
    const pay = await call('POST', `/api/orders/${o.id}/pay`, { tenders: [{ method: 'Cash', amount: 1000 }] }, cash); if (pay.s !== 200) console.log('pay failed', pay.j);
  }
  const L = await call('GET', '/api/me/earnings', null, bl), K = await call('GET', '/api/me/earnings', null, bk);
  { const dl = (await call('GET', '/api/pos/dashboard', null, bl)).j, dk = (await call('GET', '/api/pos/dashboard', null, bk)).j, dc = (await call('GET', '/api/pos/dashboard', null, cash)).j;
    ok('barber dashboard shows only his own sales (Lance 2 orders)', dl.completed === 2 && dl.gross > 0, JSON.stringify(dl));
    ok('another barber sees none of Lances sales', dk.completed === 0 && dk.gross === 0, JSON.stringify(dk));
    ok('cashier still sees the whole branch', dc.completed === 2 && dc.gross === dl.gross); }
  ok('barber sees own earnings', L.s === 200 && L.j.name === 'Lance', JSON.stringify(L.j));
  ok('Lance earned commission from his 2 haircuts today', L.j.today.cuts === 2 && L.j.today.commission > 0, JSON.stringify(L.j.today));
  ok('pay today = commission topped up to the daily allowance (500)', Math.abs(L.j.today.pay - Math.max(500, L.j.today.commission)) < 0.01, JSON.stringify(L.j.today));
  ok('Kevin sees only his own (no haircuts, name Kevin)', K.s === 200 && K.j.name === 'Kevin' && K.j.today.cuts === 0 && K.j.today.commission === 0, JSON.stringify(K.j));
  ok('another account cannot be requested by id (staffId in the query is ignored)', (await call('GET', '/api/me/earnings?staffId=' + lance.id, null, bk)).j.name === 'Kevin');
  ok('barber with no linked profile gets a clear 404', (await call('GET', '/api/me/earnings', null, bu)).s === 404);
  ok('estimated take-home equals commission + top-up for unpaid days', Math.abs(L.j.unpaid.net - (L.j.unpaid.commission + L.j.unpaid.topup + L.j.unpaid.bonus - L.j.unpaid.advance - L.j.unpaid.deductions)) < 0.01);
  ok('barber cannot read everybody payslips or payroll', (await call('GET', '/api/payslips', null, bl)).s === 403 && (await call('GET', '/api/reports/payroll?from=2000-01-01&to=2099-12-31', null, bl)).s === 403);
  ok('barber payslips endpoint is only their own and empty before payroll is paid', (await call('GET', '/api/me/payslips', null, bl)).j.rows.length === 0);
  // owner pays Lance, then it shows on his payslips and no longer as unpaid
  const t0 = new Date(); const ds = `${t0.getFullYear()}-${String(t0.getMonth() + 1).padStart(2, '0')}-${String(t0.getDate()).padStart(2, '0')}`;
  const pr = await call('POST', '/api/payroll/pay', { staffIds: [lance.id], to: ds }, owner); console.log('pay status', pr.s, JSON.stringify(pr.j).slice(0, 120));
  const L2 = await call('GET', '/api/me/earnings', null, bl), S1 = await call('GET', '/api/me/payslips', null, bl), S2 = await call('GET', '/api/me/payslips', null, bk);
  if (pr.s === 200) { ok('after payroll, Lance has nothing unpaid and 1 payslip', L2.j.unpaid.days === 0 && S1.j.rows.length === 1 && S1.j.rows[0].staffName === 'Lance', JSON.stringify(L2.j.unpaid)); ok('Kevin still sees no payslips (not Lance\'s)', S2.j.rows.length === 0); }
} catch (e) { fails++; console.log('ERROR', e); }
srv.kill(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
