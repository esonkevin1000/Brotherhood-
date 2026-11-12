import { fileURLToPath as __f } from 'node:url';
const ROOT = __f(new URL('..', import.meta.url));
import { spawn } from 'node:child_process';
import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs';
const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt13-'));
const srv = spawn('node', ['server.js'], { cwd: ROOT, env: { ...process.env, ADMIN_PASSWORD: 'ownerpw', DB_FILE: path.join(dbDir, 't.db'), PORT: '3132' }, stdio: 'ignore' });
const B = 'http://localhost:3132';
for (let i = 0; i < 80; i++) { try { await fetch(B + '/api/public/terms'); break; } catch { await new Promise(r => setTimeout(r, 500)); } }
let fails = 0;
async function call(method, url, body, tok) {
  const r = await fetch(B + url, { method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { s: r.status, j };
}
const ok = (name, cond, extra = '') => { if (!cond) fails++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' → ' + extra)); };
const ds = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; const t0 = ds(new Date()), t5 = ds(new Date(Date.now() + 5 * 864e5)), t6 = ds(new Date(Date.now() + 6 * 864e5));
try {
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  await call('PUT', '/api/settings', { attPhoto: false, payRules: { lunchAmount: 0, lunchLateMins: 99999, allowLateMins: 99999 } }, owner);
  const st = (await call('GET', '/api/state', null, owner)).j, br = st.branches[0], ch = st.chairs.filter(c => c.branchId === br.id)[0], amigo = st.items.find(i => i.name === 'Amigo');
  const bar = (await call('POST', '/api/staff', { name: 'Kev', branchId: br.id, chairId: ch.id, allowance: 500, pct: 40 }, owner)).j;
  await call('POST', '/api/users', { name: 'C1', username: 'cash1', pin: '111111', role: 'cashier', branchId: br.id }, owner);
  const c1 = (await call('POST', '/api/login', { pin: '111111' })).j.token;
  // checklists
  let r = await call('GET', '/api/checklists/today', null, c1); ok('default opening and closing checklists exist', r.j.template.opening.length >= 5 && r.j.template.closing.length >= 5 && r.j.runs.length === 0);
  r = await call('POST', '/api/checklists/submit', { kind: 'opening', items: [{ done: true }] }, c1); ok('cannot submit with tasks left undone and no note', r.s === 400);
  const JPG='data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
  const ph = (await call('POST', '/api/files', { data: JPG, kind: 'checklist' }, c1)).j.id;
  const all = n => Array.from({ length: n }, (_, i) => ({ done: i !== 2, note: i === 2 ? 'Aircon is broken, reported' : '', photoId: ph }));
  r = await call('POST', '/api/checklists/submit', { kind: 'opening', items: Array.from({ length: 6 }, () => ({ done: true })) }, c1); ok('a task that needs a photo is refused without one', r.s === 400 && /photo/i.test(r.j.error), JSON.stringify(r));
  r = await call('POST', '/api/checklists/submit', { kind: 'opening', items: all(r.s === 400 ? 6 : 6) }, c1); ok('an undone task is accepted only with a note', r.s === 201, JSON.stringify(r));
  ok('the same checklist cannot be submitted twice in one day', (await call('POST', '/api/checklists/submit', { kind: 'opening', items: all(6) }, c1)).s === 409);
  ok('cashier cannot change the template', (await call('PUT', '/api/checklists/template', { opening: ['x'] }, c1)).s === 403);
  r = await call('PUT', '/api/checklists/template', { closing: ['Lock up', 'Count cash'] }, owner); ok('owner edits the template', r.j.closing.length === 2);
  r = await call('GET', `/api/checklists?from=${t0}&to=${t0}&branch=all`, null, owner); ok('owner sees completed runs and the branches that missed theirs', r.s === 200 && r.j.rows.length === 1 && r.j.rows[0].done === 5 && r.j.missing.length >= st.branches.length - 1, JSON.stringify(r.j).slice(0, 200));
  // leaves
  r = await call('POST', '/api/leaves', { staffId: bar.id, type: 'Vacation', from: t5, to: t6, reason: 'Family trip' }, c1); ok('cashier files a leave request for a barber', r.s === 201 && r.j.status === 'PENDING', JSON.stringify(r)); const lid = r.j.id;
  ok('overlapping leave is refused', (await call('POST', '/api/leaves', { staffId: bar.id, type: 'Sick', from: t6, to: t6, reason: 'Flu' }, c1)).s === 409);
  ok('cashier cannot approve', (await call('PUT', `/api/leaves/${lid}/review`, { action: 'approve' }, c1)).s === 403);
  ok('reject needs a note', (await call('PUT', `/api/leaves/${lid}/review`, { action: 'reject' }, owner)).s === 400);
  r = await call('PUT', `/api/leaves/${lid}/review`, { action: 'approve' }, owner); ok('owner approves leave', r.j.status === 'APPROVED');
  // payslip
  await call('POST', '/api/attendance', { staffId: bar.id, action: 'in' }, c1); await call('POST', '/api/shifts/open', { openingFloat: 0 }, c1);
  const o = (await call('POST', '/api/orders', { customer: { name: 'A' }, items: [{ itemId: amigo.id, qty: 1 }] }, c1)).j; await call('PUT', '/api/orders/' + o.id, { chairId: ch.id }, c1); await call('POST', `/api/orders/${o.id}/pay`, { tenders: [{ method: 'Cash', amount: 200 }] }, c1);
  await call('POST', '/api/payroll/pay', { staffIds: [bar.id], to: t0 }, owner);
  r = await call('GET', `/api/payslips?from=${t0}&to=${t0}`, null, owner); ok('a payslip is produced for the paid payroll', r.s === 200 && r.j.rows.length === 1 && r.j.rows[0].net === 500 && r.j.rows[0].gross === 500, JSON.stringify(r.j.rows));
  ok('cashier cannot see payslips', (await call('GET', '/api/payslips', null, c1)).s === 403);
  // equipment through the generic management API
  r = await call('POST', '/api/equipment', { branchId: br.id, name: 'Clipper Wahl #1', category: 'Clippers', serial: 'W-123', status: 'OK', nextService: t5, active: 1 }, owner); ok('owner adds equipment', r.s === 201 && r.j.name === 'Clipper Wahl #1', JSON.stringify(r));
  ok('equipment is listed in state', (await call('GET', '/api/state', null, owner)).j.equipment.length === 1);
  // reports
  r = await call('GET', `/api/reports/scorecard?from=${t0}&to=${t0}&branch=all`, null, owner); const row = r.j.tables[0].rows.find(x => x[1] === 'Kev'); ok('barber scorecard shows haircuts, sales and attendance', row && row[3] === 1 && row[4] === 200 && row[10] === 1, JSON.stringify(row));
  r = await call('GET', `/api/reports/accountability?from=${t0}&to=${t0}&branch=all`, null, owner); ok('cash accountability report works', r.s === 200 && Array.isArray(r.j.tables[0].rows));
} finally { srv.kill(); }
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
