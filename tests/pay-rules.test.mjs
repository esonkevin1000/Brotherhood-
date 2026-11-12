import { fileURLToPath as __f } from 'node:url';
const ROOT = __f(new URL('..', import.meta.url));
import { spawn } from 'node:child_process';
import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs';
const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt16-'));
const srv = spawn('node', ['server.js'], { cwd: ROOT, env: { ...process.env, ADMIN_PASSWORD: 'ownerpw', DB_FILE: path.join(dbDir, 't.db'), PORT: '3136' }, stdio: 'ignore' });
const B = 'http://localhost:3136';
for (let i = 0; i < 80; i++) { try { await fetch(B + '/api/public/terms'); break; } catch { await new Promise(r => setTimeout(r, 500)); } }
let fails = 0;
async function call(method, url, body, tok) {
  const r = await fetch(B + url, { method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { s: r.status, j };
}
const ok = (name, cond, extra = '') => { if (!cond) fails++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' → ' + extra)); };
const hhmm = mins => { const m = Math.max(0, Math.min(23 * 60 + 59, mins)); return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
try {
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  await call('PUT', '/api/settings', { attPhoto: false }, owner);
  const st = (await call('GET', '/api/state', null, owner)).j, br = st.branches[0], ch = st.chairs.filter(c => c.branchId === br.id);
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  if (nowMin < 100) { console.log('SKIP: too close to midnight for the late-minutes scenarios'); srv.kill(); process.exit(0); }
  const mk = async (name, allowance, i) => { const s = (await call('POST', '/api/staff', { name, branchId: br.id, chairId: ch[i].id, allowance, pct: 40 }, owner)).j; await call('POST', '/api/users', { name, username: name.toLowerCase(), pin: '22222' + i, role: 'barber', branchId: br.id, staffId: s.id }, owner); return s; };
  const A = await mk('Ontime', 600, 0), Bb = await mk('Late20', 650, 1), C = await mk('Late70', 800, 2);
  await call('POST', '/api/users', { name: 'Cashier', username: 'cashier1', pin: '111111', role: 'cashier', branchId: br.id }, owner);
  const cash = (await call('POST', '/api/login', { pin: '111111' })).j.token;
  const tokOf = async i => (await call('POST', '/api/login', { pin: '22222' + i })).j.token;
  // branch opens 5 minutes from now => on time
  await call('PUT', '/api/branches/' + br.id, { openTime: hhmm(nowMin + 5) }, owner); await call('POST', '/api/attendance', { staffId: A.id, action: 'in' }, cash);
  // opened 20 minutes ago => 20 min late
  await call('PUT', '/api/branches/' + br.id, { openTime: hhmm(nowMin - 20) }, owner); await call('POST', '/api/attendance', { staffId: Bb.id, action: 'in' }, cash);
  // opened 70 minutes ago => 70 min late
  await call('PUT', '/api/branches/' + br.id, { openTime: hhmm(nowMin - 70) }, owner); await call('POST', '/api/attendance', { staffId: C.id, action: 'in' }, cash);
  const ea = (await call('GET', '/api/me/earnings', null, await tokOf(0))).j, eb = (await call('GET', '/api/me/earnings', null, await tokOf(1))).j, ec = (await call('GET', '/api/me/earnings', null, await tokOf(2))).j;
  console.log('A', JSON.stringify(ea.today), '\nB', JSON.stringify(eb.today), '\nC', JSON.stringify(ec.today));
  ok('on time: allowance top-up 600 + free lunch 60', ea.today.topup === 600 && ea.today.lunch === 60 && ea.today.pay === 660 && !ea.today.lunchLost);
  ok('20 min late: allowance 650 kept but NO free lunch', eb.today.topup === 650 && eb.today.lunch === 0 && eb.today.lunchLost === true && eb.today.allowLost === false && eb.today.pay === 650);
  ok('70 min late: NO allowance and NO lunch, pay = commission only (0 so far)', ec.today.topup === 0 && ec.today.lunch === 0 && ec.today.allowLost === true && ec.today.pay === 0);
  // pay is based on commission: Late70 earns commission from haircuts and gets only that
  const buddy = st.items.find(i => i.name === 'Amigo'); await call('POST', '/api/shifts/open', { openingFloat: 0 }, cash);
  const o = (await call('POST', '/api/orders', { customer: { name: 'X' }, items: [{ itemId: buddy.id, qty: 1 }] }, cash)).j; await call('PUT', '/api/orders/' + o.id, { chairId: ch[2].id, barberId: C.id }, cash); await call('POST', `/api/orders/${o.id}/pay`, { tenders: [{ method: 'Cash', amount: 1000 }] }, cash);
  const ec2 = (await call('GET', '/api/me/earnings', null, await tokOf(2))).j; ok('late 70: pay equals haircut commission only', ec2.today.commission > 0 && ec2.today.pay === ec2.today.commission && ec2.today.topup === 0, JSON.stringify(ec2.today));
  // changing the branch opening time later must not rewrite history (lateness is stored at time-in)
  await call('PUT', '/api/branches/' + br.id, { openTime: '03:00' }, owner);
  const ea2 = (await call('GET', '/api/me/earnings', null, await tokOf(1))).j; ok('stored lateness is not rewritten when the opening time changes', ea2.today.lunch === 0 && ea2.today.lunchLost === true);
  // owner changes the rules: lunch 100, lose lunch after 30 min, allowance after 90 min
  ok('owner can read the pay rules', (await call('GET', '/api/settings', null, owner)).j.payRules.lunchAmount === 60);
  ok('owner saves new pay rules', (await call('PUT', '/api/settings', { payRules: { lunchAmount: 100, lunchLateMins: 30, allowLateMins: 90 } }, owner)).s === 200);
  const eb3 = (await call('GET', '/api/me/earnings', null, await tokOf(1))).j, ea3 = (await call('GET', '/api/me/earnings', null, await tokOf(0))).j, ec3 = (await call('GET', '/api/me/earnings', null, await tokOf(2))).j;
  ok('with the new rules 20 min late now gets lunch 100', eb3.today.lunch === 100 && eb3.today.topup === 650, JSON.stringify(eb3.today));
  ok('with the new rules 70 min late keeps allowance (limit 90) but loses nothing else', ec3.today.allowLost === false, JSON.stringify(ec3.today));
  ok('bad rule values are rejected', (await call('PUT', '/api/settings', { payRules: { lunchAmount: -5 } }, owner)).s === 400);
  ok('only owner/admin may change the rules', (await call('PUT', '/api/settings', { payRules: { lunchAmount: 1 } }, cash)).s === 403);
  // payroll includes lunch, and the payslip shows it
  const t0 = new Date(); const ds = `${t0.getFullYear()}-${String(t0.getMonth() + 1).padStart(2, '0')}-${String(t0.getDate()).padStart(2, '0')}`;
  const rep = (await call('GET', `/api/reports/payroll?from=${ds}&to=${ds}&branch=all`, null, owner)).j; const row = rep.tables[0].rows.find(r => r[0] === 'Ontime');
  ok('payroll report: Ontime top-up & lunch = 600 + 100', row && row[5] === 700, JSON.stringify(row));
  await call('POST', '/api/payroll/pay', { staffIds: [A.id], to: ds }, owner);
  const slip = (await call('GET', '/api/me/payslips', null, await tokOf(0))).j.rows[0];
  ok('payslip lists free lunch and gross = commission + top-up + lunch', slip && slip.lunch === 100 && slip.gross === slip.commission + slip.topup + slip.lunch, JSON.stringify(slip && { l: slip.lunch, g: slip.gross }));
} catch (e) { fails++; console.log('ERROR', e); }
srv.kill(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
