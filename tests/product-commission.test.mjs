import { fileURLToPath as __f } from 'node:url';
const ROOT = __f(new URL('..', import.meta.url));
import { spawn } from 'node:child_process';
import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs';
const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt18-'));
const srv = spawn('node', ['server.js'], { cwd: ROOT, env: { ...process.env, ADMIN_PASSWORD: 'ownerpw', DB_FILE: path.join(dbDir, 't.db'), PORT: '3138' }, stdio: 'ignore' });
const B = 'http://localhost:3138';
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
  const prod = st.items.find(i => i.type === 'product'), svc = st.items.find(i => i.type === 'service');
  ok('products default to a ₱100 barber commission', prod && prod.commission === 100, JSON.stringify(prod));
  ok('services have no product commission', svc.commission === 0);
  // owner sets the real product: sells 380, costs 280 => 100 commission
  const edit = await call('PUT', '/api/items/' + prod.id, { price: 380, commission: 100 }, owner); ok('owner can set price and commission on a product', edit.s === 200 && edit.j.commission === 100, JSON.stringify(edit.j));
  const lance = (await call('POST', '/api/staff', { name: 'Lance', branchId: br.id, chairId: ch[0].id, pct: 40, allowance: 0 }, owner)).j, kev = (await call('POST', '/api/staff', { name: 'Kev', branchId: br.id, chairId: ch[1].id, pct: 40, allowance: 0 }, owner)).j;
  await call('POST', '/api/users', { name: 'Cashier', username: 'cashier1', pin: '111111', role: 'cashier', branchId: br.id }, owner);
  const cash = (await call('POST', '/api/login', { pin: '111111' })).j.token;
  for (const s of [lance, kev]) await call('POST', '/api/attendance', { staffId: s.id, action: 'in' }, cash);
  await call('POST', '/api/shifts/open', { openingFloat: 0 }, cash);
  const sell = async (s, ci, items) => { const o = (await call('POST', '/api/orders', { customer: { name: 'X' }, items }, cash)).j; await call('PUT', '/api/orders/' + o.id, { chairId: ch[ci].id, barberId: s.id }, cash); const p = await call('POST', `/api/orders/${o.id}/pay`, { tenders: [{ method: 'Cash', amount: 5000 }] }, cash); return p; };
  await sell(lance, 0, [{ itemId: prod.id, qty: 2 }]);            // Lance sells 2 products only => 200
  await sell(kev, 1, [{ itemId: svc.id, qty: 1 }, { itemId: prod.id, qty: 1 }]);   // Kev: service 40% + 1 product 100
  const today = ds(new Date());
  const rep = (await call('GET', `/api/reports/commissions?from=${today}&to=${today}&branch=all`, null, owner)).j, cols = rep.tables[0].cols.map(c => c[0]), rows = rep.tables[0].rows;
  const rl = rows.find(r => r[0] === 'Lance'), rk = rows.find(r => r[0] === 'Kev'), ci = n => cols.indexOf(n);
  ok('Lance: 2 products sold = ₱200 commission', rl[ci('Commission')] === 200, JSON.stringify(rl));
  ok('Kev: 40% of the service + ₱100 for the product', Math.abs(rk[ci('Commission')] - (svc.price * 0.4 + 100)) < 0.05, JSON.stringify(rk));
  // product commission flows into payroll automatically
  const pay = (await call('GET', `/api/reports/payroll?from=${today}&to=${today}&branch=all`, null, owner)).j, pc = pay.tables[0].cols.map(c => c[0]), pr = pay.tables[0].rows.find(r => r[0] === 'Lance');
  ok('payroll picks up the product commission automatically', pr && pr[pc.indexOf('Commission')] === 200 && pr[pc.indexOf('Net due')] === 200, JSON.stringify(pr));
  ok('payroll shows days with a detail link (count~staffId)', /^1~/.test(String(pr[pc.indexOf('Days')])) && pay.tables[0].detail[lance.id].length === 1);
  // the date range is respected
  const tomorrow = ds(new Date(Date.now() + 864e5)), yest = ds(new Date(Date.now() - 864e5));
  const none = (await call('GET', `/api/reports/payroll?from=${tomorrow}&to=${tomorrow}&branch=all`, null, owner)).j; ok('range with no days shows no rows', none.tables[0].rows.length === 0);
  ok('days before the range are reported as unpaid before this range, not mixed in', !!(await call('GET', `/api/reports/payroll?from=${tomorrow}&to=${tomorrow}&branch=all`, null, owner)).j.cards.find(c => c.label === 'Unpaid before this range'));
  const week = (await call('GET', `/api/reports/payroll?from=${yest}&to=${tomorrow}&branch=all`, null, owner)).j; ok('a wider range (week) includes the day inside it', week.tables[0].rows.some(r => r[0] === 'Lance'));
  // paying only pays the chosen range
  const p0 = await call('POST', '/api/payroll/pay', { staffIds: [lance.id], from: tomorrow, to: tomorrow }, owner); ok('paying a range with no days pays nothing', p0.j.days === 0, JSON.stringify(p0.j));
  const p1 = await call('POST', '/api/payroll/pay', { staffIds: [lance.id], from: yest, to: today }, owner); ok('paying the week pays the day', p1.j.days === 1, JSON.stringify(p1.j));
  // payslip shows commission total
  const slip = (await call('GET', '/api/payslips', null, owner)).j.rows.find(r => r.staffName === 'Lance'); ok('payslip gross includes product commission', slip && slip.gross === 200, JSON.stringify(slip && slip.gross));
} catch (e) { fails++; console.log('ERROR', e); }
srv.kill(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
