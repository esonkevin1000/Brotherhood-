import { fileURLToPath as __f } from 'node:url';
const ROOT = __f(new URL('..', import.meta.url));
import { spawn } from 'node:child_process';
import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs';
const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-'));
const srv = spawn('node', ['server.js'], { cwd: ROOT, env: { ...process.env, ADMIN_PASSWORD: 'ownerpw', DB_FILE: path.join(dbDir, 't.db'), PORT: '3120' }, stdio: 'ignore' });
for (let i = 0; i < 80; i++) { try { await fetch('http://localhost:3120/api/public/terms'); break; } catch { await new Promise(r => setTimeout(r, 500)); } }
const B = 'http://localhost:3120'; let fails = 0;
async function call(method, url, body, tok) {
  const r = await fetch(B + url, { method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { s: r.status, j };
}
const ok = (name, cond, extra = '') => { if (!cond) fails++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' → ' + extra)); };
try {
  const owner = (await call('POST', '/api/login', { username: '', password: 'ownerpw' })).j.token;
  await call('PUT', '/api/settings', { attPhoto: false, payRules: { lunchAmount: 0, lunchLateMins: 99999, allowLateMins: 99999 } }, owner);
  { const _s = (await call('GET', '/api/state', null, owner)).j; for (const _i of _s.items.filter(i => i.name === 'Buddy')) await call('PUT', '/api/items/' + _i.id, { needId: 0 }, owner); }
  const st = (await call('GET', '/api/state', null, owner)).j;
  ok('seed: 7 branches, chairs, items', st.branches.length === 7 && st.chairs.length === 21 && st.items.length === 5, JSON.stringify([st.branches.length, st.chairs.length, st.items.length]));
  const br = st.branches[0];
  const mkS = async (name, pct, allowance) => (await call('POST', '/api/staff', { name, branchId: br.id, chairId: st.chairs.find(c => c.branchId === br.id).id, pct, allowance }, owner)).j;
  const kev = await mkS('Kevin', 50, 600), mar = await mkS('Marco', 40, 300);
  const cu = await call('POST', '/api/users', { name: 'Alaminos Cashier', username: 'alaminos', pin: '123456', role: 'cashier', branchId: br.id }, owner);
  ok('create cashier (no hash/pin leak)', cu.s === 201 && !cu.j.passHash && !cu.j.pinKey && cu.j.hasPin, JSON.stringify(cu));
  const other = await call('POST', '/api/users', { name: 'Bad', username: 'other', pin: '123456', role: 'cashier', branchId: br.id }, owner);
  ok('duplicate PIN rejected', other.s === 409);ok('PIN must be 6 digits', (await call('POST', '/api/users', { name: 'X', username: 'xx1', pin: '12', role: 'cashier', branchId: br.id }, owner)).s === 409);
  const cash = (await call('POST', '/api/login', { pin: '123456' })).j.token;
  ok('cashier cannot edit staff/see reports', (await call('POST', '/api/staff', { name: 'x', branchId: br.id }, cash)).s === 403 && (await call('GET', '/api/reports/sales', null, cash)).s === 403);
  const boot = (await call('GET', '/api/pos/bootstrap', null, cash)).j;
  ok('bootstrap scoped to branch', boot.branch.id === br.id && boot.staff.length === 2 && boot.shift === null);
  const [buddy, amigo, powder] = ['Buddy', 'Amigo', 'Texture Powder'].map(n => boot.items.find(i => i.name === n));
  ok('wrong PIN rejected', (await call('POST', '/api/login', { pin: '000000' })).s === 401);
  // customer + import
  const imp = await call('POST', '/api/customers/import', { rows: [{ name: 'Juan', phone: '0917 111 2222' }, { name: 'Juan again', phone: '+63 917 111 2222' }, { name: 'Pedro', phone: '' }] }, owner);
  ok('import: dedupes phones and skips rows with no phone/email', imp.j.added === 1 && imp.j.skipped === 2, JSON.stringify(imp.j));
  const cs = (await call('GET', '/api/customers?q=juan', null, cash)).j; ok('customer search', cs.total === 1);
  // cannot pay without shift / not clocked in
  const t1 = (await call('POST', '/api/orders', { customerId: cs.rows[0].id, items: [{ itemId: buddy.id, qty: 1 }] }, cash)).j;
  ok('ticket #1 created waiting', t1.no === 1 && t1.status === 'waiting' && t1.total === 150);
  ok('cannot seat barber who is not clocked in', (await call('PUT', '/api/orders/' + t1.id, { barberId: kev.id }, cash)).s === 409);
  ok('clock in Kevin', (await call('POST', '/api/attendance', { staffId: kev.id, action: 'in' }, cash)).s === 200);
  ok('double clock-in rejected', (await call('POST', '/api/attendance', { staffId: kev.id, action: 'in' }, cash)).s === 409);
  await call('POST', '/api/attendance', { staffId: mar.id, action: 'in' }, cash);
  const seat = await call('PUT', '/api/orders/' + t1.id, { barberId: kev.id }, cash); ok('seat customer with Kevin', seat.j.status === 'in_chair' && seat.j.barberId === kev.id, JSON.stringify(seat));
  const t2 = (await call('POST', '/api/orders', { customerName: 'Walk-in 2', items: [{ itemId: amigo.id, qty: 1 }, { itemId: powder.id, qty: 1 }] }, cash)).j;
  ok('busy barber rejected', (await call('PUT', '/api/orders/' + t2.id, { barberId: kev.id }, cash)).s === 409);
  const live = (await call('GET', '/api/live', null, cash)).j; ok('live floor', live.onDuty === 2 && live.cutting === 1 && live.waiting === 1 && live.available === 1, JSON.stringify(live));
  ok('pay blocked without open shift', (await call('POST', `/api/orders/${t1.id}/pay`, { tenders: [{ method: 'Cash', amount: 150 }] }, cash)).s === 409);
  const sh = (await call('POST', '/api/shifts/open', { terminal: 'Terminal 1', openingFloat: 1000 }, cash)).j; ok('shift opened', sh.status === 'open');
  ok('second open shift rejected', (await call('POST', '/api/shifts/open', { openingFloat: 0 }, cash)).s === 409);
  ok('underpayment rejected', (await call('POST', `/api/orders/${t1.id}/pay`, { tenders: [{ method: 'Cash', amount: 100 }] }, cash)).s === 409);
  const p1 = (await call('POST', `/api/orders/${t1.id}/pay`, { tenders: [{ method: 'Cash', amount: 200 }] }, cash)).j; ok('pay with change', p1.status === 'paid' && p1.change === 50 && p1.tenders[0].amount === 150 && p1.si === 1, JSON.stringify(p1));
  ok('cannot pay twice', (await call('POST', `/api/orders/${t1.id}/pay`, { tenders: [{ method: 'Cash', amount: 150 }] }, cash)).s === 409);
  await call('PUT', '/api/orders/' + t2.id, { barberId: kev.id }, cash);
  const disc = boot.discounts[0];
  const p2 = (await call('POST', `/api/orders/${t2.id}/pay`, { discountId: disc.id, tenders: [{ method: 'GCash', amount: 530 }] }, cash)).j;
  ok('discount + gcash (580-50=530)', p2.total === 530 && p2.discountAmt === 50 && p2.si === 2, JSON.stringify(p2));
  await call('POST', '/api/cash', { shiftId: sh.id, kind: 'expense', amount: 100, note: 'Supplies' }, cash);
  await call('POST', '/api/cash', { shiftId: sh.id, kind: 'advance', amount: 100, staffId: kev.id, note: 'Advance' }, cash);
  await call('POST', '/api/cash', { shiftId: sh.id, kind: 'in', amount: 50, note: 'Float top-up' }, cash);
  ok('bad cash amount rejected', (await call('POST', '/api/cash', { shiftId: sh.id, kind: 'out', amount: -5 }, cash)).s === 400);
  // reports (owner)
  const sales = (await call('GET', '/api/reports/sales', null, owner)).j;
  const card = n => sales.cards.find(c => c.label === n)?.value;
  ok('sales: gross 730, disc 50, net 680', card('Gross sales') === 730 && card('Total discounts') === 50 && card('Net sales') === 680, JSON.stringify(sales.cards));
  // Kevin: service net: order1 150 -> 150*50%=75; order2 service 200 of 580 subtotal, total 530 => 200*530/580=182.76 ->*50%=91.38 ; commission 166.38 < allowance 600 => topup 433.62 ; Marco 0 commission -> topup 300
  const com = (await call('GET', '/api/reports/commissions', null, owner)).j; const kr = com.tables[0].rows.find(r => r[0] === 'Kevin');
  ok('commission math (Kevin 166.38 service commission + 100 product commission, topup 333.62)', Math.abs(kr[7] - 266.38) < 0.02 && Math.abs(kr[8] - 333.62) < 0.02 && Math.abs(kr[9] - 600) < 0.02, JSON.stringify(kr));
  const exp = card('Expenses'); ok('expenses 100 (advance not an expense)', exp === 100, exp);
  ok('salaries = 600 + 300', card('Barber salaries') === 900, card('Barber salaries'));
  const pay = (await call('GET', '/api/reports/payroll', null, owner)).j; ok('payroll due = 900 - 100 advance', pay.cards[0].value === 800, JSON.stringify(pay.cards));
  const tender = (await call('GET', '/api/reports/tender', null, owner)).j; ok('tender split', tender.tables[0].rows.length === 2);
  const items = (await call('GET', '/api/reports/items', null, owner)).j; ok('item ranking', items.tables[0].rows.length === 3);
  const dr = (await call('GET', '/api/reports/discounts', null, owner)).j; ok('discount report', dr.cards[0].value === 50);
  const csv = await call('GET', '/api/reports/sales?format=csv', null, owner); ok('csv export', typeof csv.j === 'string' && csv.j.includes('Finished services') && !csv.j.includes('SI-'));
  const cashR = (await call('GET', '/api/reports/cash', null, owner)).j; ok('cash report shows open shift', cashR.tables[0].rows[0][2] === 'OPEN' && cashR.tables[1].rows.length === 3);
  const cur = (await call('GET', '/api/pos/shift', null, cash)).j; ok('current shift has no and live z', cur.shift.no === 1 && cur.z.expected === 1000, JSON.stringify(cur.z));
  const ex = (await call('GET', '/api/expenses?range=today', null, cash)).j; ok('expenses list', ex.rows.length === 1 && ex.today === 100 && ex.rows[0].by === 'Alaminos Cashier', JSON.stringify(ex));
  const pd = (await call('GET', '/api/pos/dashboard', null, cash)).j; ok('pos dashboard', pd.completed === 2 && pd.gross === 730 && pd.totalBarbers === 2 && pd.onDuty === 2, JSON.stringify([pd.completed, pd.gross, pd.totalBarbers]));
  ok('queue done filter', (await call('GET', '/api/pos/queue?filter=done', null, cash)).j.length === 2);  // close shift: expected = 1000 + 150 cash sales + 50 in - (100 expense + 100 advance) = 1000
  const mar2 = await mkS('Third', 40, 100);
  ok('mark barber off duty', (await call('POST', '/api/attendance', { staffId: mar2.id, action: 'off' }, cash)).s === 200);
  const roster = (await call('GET', '/api/pos/attendance', null, cash)).j; ok('roster states', roster.find(r => r.id === mar2.id).state === 'off' && roster.find(r => r.id === kev.id).state !== 'none', JSON.stringify(roster.map(r => r.state)));
  ok('break start', (await call('POST', '/api/attendance', { staffId: mar.id, action: 'break_start' }, cash)).s === 200);
  const tb = (await call('POST', '/api/orders', { customerName: 'B', items: [{ itemId: buddy.id, qty: 1 }] }, cash)).j;
  ok('cannot seat barber on break', (await call('PUT', '/api/orders/' + tb.id, { barberId: mar.id }, cash)).s === 409);
  const lv = (await call('GET', '/api/live', null, cash)).j; ok('live counts break', lv.onBreak === 1, JSON.stringify(lv));
  ok('break end', (await call('POST', '/api/attendance', { staffId: mar.id, action: 'break_end' }, cash)).s === 200);
  ok('seat after break', (await call('PUT', '/api/orders/' + tb.id, { barberId: mar.id }, cash)).s === 200);
  await call('POST', '/api/orders/' + tb.id + '/void', { reason: 'test' }, cash);
  const open3 = (await call('POST', '/api/orders', { customerName: 'Late', items: [{ itemId: buddy.id, qty: 1 }] }, cash)).j; await call('PUT', '/api/orders/' + open3.id, { barberId: kev.id }, cash);
  ok('cannot close shift with customer in chair', (await call('POST', `/api/shifts/${sh.id}/close`, { counted: 1000 }, cash)).s === 409);
  await call('POST', `/api/orders/${open3.id}/void`, { reason: 'left' }, cash);
  const z = await call('POST', `/api/shifts/${sh.id}/close`, { denoms: { 500: 1, 200: 2, 50: 1, 20: 2 }, remarks: 'ok' }, cash); ok('Z-reading expected 1000, variance -10', z.j.expected === 1000 && z.j.counted === 990 && z.j.variance === -10 && z.j.no === 1 && z.j.denoms['200'] === 2 && z.j.remarks === 'ok', JSON.stringify(z));
  const rd = (await call('GET', '/api/reports/readings', null, owner)).j; ok('readings report', rd.tables[0].rows.length === 1 && rd.cards.find(c => c.label === 'Cash variance').value === -10);
  ok('clock out', (await call('POST', '/api/attendance', { staffId: kev.id, action: 'out' }, cash)).s === 200);
  const att = (await call('GET', '/api/reports/attendance', null, owner)).j; ok('attendance report', att.tables[0].rows.length === 2);
  // ---- new: break / off duty / shift no / denominations / expenses / pos endpoints ----
  ok('off-duty barber is not paid', (await call('GET', '/api/reports/attendance', null, owner)).j.tables[0].rows.every(r => r[0] !== 'Third'));
  ok('cashier cannot void a paid sale', (await call('POST', `/api/orders/${t1.id}/void`, { reason: 'x' }, cash)).s === 403);
  // pay payroll
  ok('mark payroll paid', (await call('POST', '/api/payroll/pay', { staffIds: [kev.id, mar.id] }, owner)).j.days === 2);
  ok('payroll due now 0', (await call('GET', '/api/reports/payroll', null, owner)).j.cards[0].value === 0);
  // branch scoping: cashier from another branch
  const b2 = st.branches[1]; await call('POST', '/api/users', { name: 'Bay', username: 'bay', pin: '654321', role: 'cashier', branchId: b2.id }, owner);
  const cash2 = (await call('POST', '/api/login', { pin: '654321' })).j.token;
  ok('other branch cashier blocked from order', (await call('GET', '/api/orders/' + t1.id, null, cash2)).s === 403);
  ok('other branch cannot clock our barber', (await call('POST', '/api/attendance', { staffId: kev.id, action: 'in' }, cash2)).s === 403);
  // delete rules
  ok('staff with history is deactivated, not deleted', (await call('DELETE', '/api/staff/' + kev.id, null, owner)).j.deactivated === true);
  ok('branch with data cannot be deleted', (await call('DELETE', '/api/branches/' + br.id, null, owner)).s === 409);
  ok('audit log has entries', (await call('GET', '/api/audit', null, owner)).j.length > 20);
  ok('backup download', (await fetch(B + '/api/backup', { headers: { Authorization: 'Bearer ' + owner } })).status === 200);
  ok('no token → 401', (await call('GET', '/api/state')).s === 401);
} finally { srv.kill(); }
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
