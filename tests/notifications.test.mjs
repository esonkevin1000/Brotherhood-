import { fileURLToPath as __f } from 'node:url';
const ROOT = __f(new URL('..', import.meta.url));
import { spawn } from 'node:child_process';
import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs';
const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt14-'));
const srv = spawn('node', ['server.js'], { cwd: ROOT, env: { ...process.env, ADMIN_PASSWORD: 'ownerpw', DB_FILE: path.join(dbDir, 't.db'), PORT: '3133' }, stdio: 'ignore' });
const B = 'http://localhost:3133';
for (let i = 0; i < 80; i++) { try { await fetch(B + '/api/public/terms'); break; } catch { await new Promise(r => setTimeout(r, 500)); } }
let fails = 0;
async function call(method, url, body, tok) {
  const r = await fetch(B + url, { method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { s: r.status, j };
}
const ok = (name, cond, extra = '') => { if (!cond) fails++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' → ' + extra)); };
const ds = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; const t0 = ds(new Date()), t5 = ds(new Date(Date.now() + 5 * 864e5));
try {
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  await call('PUT', '/api/settings', { attPhoto: false, payRules: { lunchAmount: 0, lunchLateMins: 99999, allowLateMins: 99999 } }, owner);
  const st = (await call('GET', '/api/state', null, owner)).j, br = st.branches[0], ch = st.chairs.filter(c => c.branchId === br.id), amigo = st.items.find(i => i.name === 'Amigo');
  const kev = (await call('POST', '/api/staff', { name: 'Kev', branchId: br.id, chairId: ch[0].id, allowance: 100, pct: 40 }, owner)).j, bob = (await call('POST', '/api/staff', { name: 'Bob', branchId: br.id, chairId: ch[1].id, allowance: 100, pct: 40 }, owner)).j;
  const mk = async (n, pin, role, extra = {}) => { const u = (await call('POST', '/api/users', { name: n, username: n.toLowerCase(), pin, role, branchId: br.id, ...extra }, owner)).j; return { id: u.id, tok: (await call('POST', '/api/login', { pin }, owner)).j.token }; };
  const cash = await mk('Cashone', '111111', 'cashier'), kevU = await mk('Kevlogin', '222222', 'barber', { staffId: kev.id }), bobU = await mk('Boblogin', '333333', 'barber', { staffId: bob.id }), loose = await mk('Looselogin', '444444', 'barber');
  for (const s of [kev, bob]) await call('POST', '/api/attendance', { staffId: s.id, action: 'in' }, cash.tok); await call('POST', '/api/shifts/open', { openingFloat: 0 }, cash.tok);
  // ---- notifications
  let n = (await call('GET', '/api/notifications', null, owner)).j; ok('nothing to review at the start', n.total === 0 || n.items.every(i => i.key === 'chk'), JSON.stringify(n));
  await call('POST', '/api/leaves', { staffId: kev.id, type: 'Vacation', from: t5, to: t5, reason: 'Family trip' }, cash.tok);
  const chs = (await call('GET', '/api/inbox/channels', null, cash.tok)).j; await call('POST', `/api/inbox/channels/${chs.find(c => c.kind === 'branch').id}/messages`, { text: 'Hello boss' }, cash.tok);
  await call('POST', '/api/problems', { category: 'Internet', description: 'Wifi is down again' }, cash.tok);
  n = (await call('GET', '/api/notifications', null, owner)).j; const by = Object.fromEntries(n.items.map(i => [i.key, i.count]));
  ok('owner is told about the new leave request, chat and problem', by.leave === 1 && by.inbox === 1 && by.prob === 1 && n.total >= 3, JSON.stringify(n));
  ok('cashier only sees chat notifications, not owner approvals', (await call('GET', '/api/notifications', null, cash.tok)).j.items.every(i => i.key === 'inbox'));
  const lv = (await call('GET', '/api/leaves', null, owner)).j.rows[0]; await call('PUT', `/api/leaves/${lv.id}/review`, { action: 'approve' }, owner);
  n = (await call('GET', '/api/notifications', null, owner)).j; ok('the badge clears once the leave is handled', !n.items.some(i => i.key === 'leave'));
  const dm = (await call('GET', '/api/inbox/channels', null, owner)).j.find(c => c.kind === 'branch'); await call('POST', `/api/inbox/channels/${dm.id}/read`, null, owner);
  ok('and the chat badge clears once it is read', !(await call('GET', '/api/notifications', null, owner)).j.items.some(i => i.key === 'inbox'));
  // ---- sales for the scorecard (Kev serves a returning customer twice, Bob one new one)
  const sell = async (barber, c, name, phone) => { const o = (await call('POST', '/api/orders', { customer: { name, phone }, items: [{ itemId: amigo.id, qty: 1 }] }, cash.tok)).j; await call('PUT', '/api/orders/' + o.id, { chairId: c.id }, cash.tok); const r = await call('POST', `/api/orders/${o.id}/pay`, { tenders: [{ method: 'Cash', amount: 200 }] }, cash.tok); if (r.s !== 200) throw new Error(JSON.stringify(r)); };
  await sell(kev, ch[0], 'Regular Rey', '09171110000'); await sell(kev, ch[0], 'Regular Rey', '09171110000'); await sell(bob, ch[1], 'New Nena', '09172220000');
  let rep = (await call('GET', `/api/reports/scorecard?from=${t0}&to=${t0}&branch=all`, null, owner)).j; const cols = rep.tables[0].cols.map(c => c[0]), kr = rep.tables[0].rows.find(r => r[1] === 'Kev'), br2 = rep.tables[1].rows[0];
  ok('scorecard ranks barbers and shows haircuts, sales, productivity', kr[0] === 1 && kr[cols.indexOf('Haircuts')] === 2 && kr[cols.indexOf('Service sales')] === 400 && kr[cols.indexOf('Sales per day')] === 400, JSON.stringify([cols, kr]));
  ok('returning customers are counted', kr[cols.indexOf('Returning customers')] === 1 && rep.tables[0].rows.find(r => r[1] === 'Bob')[cols.indexOf('Returning customers')] === 0);
  ok('there is a branch comparison table', rep.tables[1].title === 'Branch comparison' && br2[0] === br.name && br2[2] === 3 && br2[3] === 600, JSON.stringify(br2));
  // ---- bonus + payroll + payslip
  ok('cashier cannot add a bonus', (await call('POST', '/api/adjustments', { staffId: kev.id, kind: 'Bonus', amount: 100, note: 'x y z' }, cash.tok)).s === 403);
  ok('a bonus needs a note', (await call('POST', '/api/adjustments', { staffId: kev.id, kind: 'Bonus', amount: 100 }, owner)).s === 400);
  const adj = (await call('POST', '/api/adjustments', { staffId: kev.id, kind: 'Incentive', amount: 150, note: 'Best barber of the week' }, owner)).j; ok('owner records an incentive', adj.id);
  const pr = (await call('GET', `/api/reports/payroll?from=${t0}&to=${t0}&branch=all`, null, owner)).j, pc = pr.tables[0].cols.map(c => c[0]), prow = pr.tables[0].rows.find(r => r[0] === 'Kev');
  ok('payroll shows the bonus and the net includes it', prow[pc.indexOf('Bonuses & incentives')] === 150 && prow[pc.indexOf('Net due')] === prow[pc.indexOf('Commission')] + prow[pc.indexOf('Top-up & lunch')] + 150 - prow[pc.indexOf('Advances')] - prow[pc.indexOf('Release pay deductions')], JSON.stringify([pc, prow]));
  await call('POST', '/api/payroll/pay', { staffIds: [kev.id, bob.id], to: t0 }, owner);
  ok('a paid bonus can no longer be removed', (await call('DELETE', '/api/adjustments/' + adj.id, null, owner)).s === 409);
  const ps = (await call('GET', `/api/payslips?from=${t0}&to=${t0}`, null, owner)).j.rows, kp = ps.find(x => x.staffName === 'Kev');
  ok('payslip breaks down commission, bonus, gross and net', kp.commission === 160 && kp.topup === 0 && kp.bonus === 150 && kp.gross === 310 && kp.net === 310 && kp.earningItems.length === 1 && kp.earningItems[0].kind === 'Incentive' && kp.dayItems.length === 1, JSON.stringify(kp));
  ok('payslip shows the period', /^\d{4}-\d{2}-\d{2}$/.test(kp.period));
  const mine = (await call('GET', '/api/me/payslips', null, kevU.tok)).j.rows; ok('a barber sees only their own payslips', mine.length === 1 && mine[0].staffName === 'Kev', JSON.stringify(mine.map(x => x.staffName)));
  ok('a login that is not linked gets a clear message', (await call('GET', '/api/me/payslips', null, loose.tok)).s === 404);
  ok('another barber sees their own, not Kev\'s', (await call('GET', '/api/me/payslips', null, bobU.tok)).j.rows.every(x => x.staffName === 'Bob'));
  const mp = (await call('GET', `/api/me/performance?from=${t0}&to=${t0}`, null, kevU.tok)).j; ok('a barber sees their own performance with rank and branch average', mp.me.n === 2 && mp.me.sales === 400 && mp.rank === 1 && mp.of === 2 && mp.branchAvg.sales === 300, JSON.stringify(mp));
  // ---- checklist who/when
  const ph = (await call('POST', '/api/files', { data: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', kind: 'checklist' }, cash.tok)).j.id;
  const tk = (await call('GET', '/api/checklists/today', null, cash.tok)).j.template.opening; ok('opening checklist follows the spec, with photo tasks', tk.length === 6 && tk[0].text === 'Shop cleanliness' && tk[0].photo === true && tk[1].photo === true && tk[2].photo === false, JSON.stringify(tk));
  const stamp = new Date(Date.now() - 600000).toISOString();
  await call('POST', '/api/checklists/submit', { kind: 'opening', items: tk.map((x, i) => ({ done: i !== 4, note: i === 4 ? 'Float not counted yet' : '', photoId: ph, doneAt: stamp })) }, cash.tok);
  const run = (await call('GET', `/api/checklists?from=${t0}&to=${t0}&branch=all`, null, owner)).j.rows[0]; ok('every task records who did it and when, and the photo', run.items[0].by === 'Cashone' && run.items[0].at === stamp && run.items[0].photoId === ph && run.items[4].done === false && run.items[4].by === '', JSON.stringify(run.items.slice(0, 2)));
} finally { srv.kill(); }
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
