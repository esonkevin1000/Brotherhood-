import { fileURLToPath as __f } from 'node:url';
const ROOT = __f(new URL('..', import.meta.url));
import { spawn } from 'node:child_process';
import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs';
const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt17-'));
const srv = spawn('node', ['server.js'], { cwd: ROOT, env: { ...process.env, ADMIN_PASSWORD: 'ownerpw', DB_FILE: path.join(dbDir, 't.db'), PORT: '3137' }, stdio: 'ignore' });
const B = 'http://localhost:3137';
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
  const st = (await call('GET', '/api/state', null, owner)).j, br = st.branches[0], ch = st.chairs.filter(c => c.branchId === br.id), svc = st.items.filter(i => i.type === 'service');
  // each barber has their OWN % and allowance (as set in Barbers / Staff); the branch default must not override them
  const mk = async (name, pct, allowance, i) => (await call('POST', '/api/staff', { name, branchId: br.id, chairId: ch[i].id, pct, allowance }, owner)).j;
  const a = await mk('Adrian', 42, 600, 0), d = await mk('Dave', 50, 650, 1);
  await call('POST', '/api/users', { name: 'Cashier', username: 'cashier1', pin: '111111', role: 'cashier', branchId: br.id }, owner);
  const cash = (await call('POST', '/api/login', { pin: '111111' })).j.token;
  for (const s of [a, d]) await call('POST', '/api/attendance', { staffId: s.id, action: 'in' }, cash);
  await call('POST', '/api/shifts/open', { openingFloat: 0 }, cash);
  const sale = async (s, ci, item) => { const o = (await call('POST', '/api/orders', { customer: { name: 'X' }, items: [{ itemId: item.id, qty: 1 }] }, cash)).j; await call('PUT', '/api/orders/' + o.id, { chairId: ch[ci].id, barberId: s.id }, cash); await call('POST', `/api/orders/${o.id}/pay`, { tenders: [{ method: 'Cash', amount: 5000 }] }, cash); };
  const big = svc.sort((x, y) => y.price - x.price)[0];
  for (let i = 0; i < 6; i++) { await sale(a, 0, big); await sale(d, 1, big); }
  const t0 = new Date(); const ds = `${t0.getFullYear()}-${String(t0.getMonth() + 1).padStart(2, '0')}-${String(t0.getDate()).padStart(2, '0')}`;
  const rep = (await call('GET', `/api/reports/commissions?from=${ds}&to=${ds}&branch=all`, null, owner)).j, cols = rep.tables[0].cols.map(c => c[0]), rows = rep.tables[0].rows;
  const ra = rows.find(r => r[0] === 'Adrian'), rd = rows.find(r => r[0] === 'Dave'), ci = n => cols.indexOf(n);
  const sales = 6 * big.price;
  ok('Adrian commission = 42% of his service sales', Math.abs(ra[ci('Commission')] - sales * 0.42) < 0.05, JSON.stringify(ra));
  ok('Dave commission = 50% of his service sales', Math.abs(rd[ci('Commission')] - sales * 0.5) < 0.05, JSON.stringify(rd));
  const pa = ra[ci('Payout')], pd = rd[ci('Payout')];
  ok('payout is the allowance (600 / 650) only when the commission is below it, otherwise the commission', Math.abs(pa - Math.max(600, sales * 0.42)) < 0.05 && Math.abs(pd - Math.max(650, sales * 0.5)) < 0.05, JSON.stringify([pa, pd]));
  console.log('service price', big.price, 'sales each', sales);
} catch (e) { fails++; console.log('ERROR', e); }
srv.kill(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
