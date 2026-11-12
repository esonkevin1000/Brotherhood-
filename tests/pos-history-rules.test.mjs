import { fileURLToPath as __f } from 'node:url';
const ROOT = __f(new URL('..', import.meta.url));
import { spawn } from 'node:child_process';
import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs';
const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt19-'));
const srv = spawn('node', ['server.js'], { cwd: ROOT, env: { ...process.env, ADMIN_PASSWORD: 'ownerpw', DB_FILE: path.join(dbDir, 't.db'), PORT: '3139' }, stdio: 'ignore' });
const B = 'http://localhost:3139';
for (let i = 0; i < 80; i++) { try { await fetch(B + '/api/public/terms'); break; } catch { await new Promise(r => setTimeout(r, 500)); } }
let fails = 0;
async function call(method, url, body, tok) {
  const r = await fetch(B + url, { method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { s: r.status, j };
}
const ok = (name, cond, extra = '') => { if (!cond) fails++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' → ' + extra)); };
try {
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  await call('PUT', '/api/settings', { attPhoto: false }, owner);
  const st = (await call('GET', '/api/state', null, owner)).j, br = st.branches[0], ch = st.chairs.filter(c => c.branchId === br.id), buddy = st.items.find(i => i.name === 'Amigo');
  const kev = (await call('POST', '/api/staff', { name: 'Kev', branchId: br.id, chairId: ch[0].id, pct: 40, allowance: 0 }, owner)).j;
  await call('POST', '/api/users', { name: 'Cashier', username: 'cashier1', pin: '111111', role: 'cashier', branchId: br.id }, owner);
  const cash = (await call('POST', '/api/login', { pin: '111111' })).j.token;
  await call('POST', '/api/attendance', { staffId: kev.id, action: 'in' }, cash);
  const sh = (await call('POST', '/api/shifts/open', { openingFloat: 0 }, cash)).j;
  // a pay-later ticket is still open
  const o = (await call('POST', '/api/orders', { customer: { name: 'Juan' }, items: [{ itemId: buddy.id, qty: 1 }] }, cash)).j;
  let r = await call('POST', `/api/shifts/${sh.id}/close`, { counted: 0 }, cash);
  ok('cannot do the sales reading while a pay-later ticket (waiting) is open', r.s === 409 && /still open/.test(r.j.error), JSON.stringify(r.j));
  await call('PUT', '/api/orders/' + o.id, { chairId: ch[0].id, barberId: kev.id }, cash);
  r = await call('POST', `/api/shifts/${sh.id}/close`, { counted: 0 }, cash); ok('cannot do the sales reading while a customer is in the chair', r.s === 409, JSON.stringify(r.j));
  ok('the shift is still open after the refused reading', (await call('GET', '/api/pos/bootstrap', null, cash)).j.shift?.id === sh.id);
  // pay it, then the reading works
  await call('POST', `/api/orders/${o.id}/pay`, { tenders: [{ method: 'Cash', amount: 500 }] }, cash);
  // a paid sale is final
  r = await call('POST', `/api/orders/${o.id}/void`, { reason: 'oops' }, cash); ok('cashier cannot void a paid sale', r.s === 403, JSON.stringify(r.j));
  r = await call('PUT', '/api/orders/' + o.id, { items: [] }, owner); ok('a paid sale cannot be edited (even by the owner)', r.s === 409, JSON.stringify(r.j));
  r = await call('DELETE', '/api/orders/' + o.id, null, owner); ok('there is no way to delete a sale', r.s >= 400 && r.s !== 200, JSON.stringify(r.j));
  r = await call('POST', `/api/orders/${o.id}/void`, {}, owner); ok('owner needs a reason to void a paid sale', r.s === 400, JSON.stringify(r.j));
  r = await call('POST', `/api/shifts/${sh.id}/close`, { counted: 150 }, cash); ok('sales reading works once nothing is open', r.s === 200 && r.j.no === 1, JSON.stringify(r.j));
  // locked for the rest of the day
  const bs = (await call('GET', '/api/pos/bootstrap', null, cash)).j; ok('the day is locked after the Z-reading', bs.locked === true && bs.zNo === 1, JSON.stringify({ l: bs.locked, z: bs.zNo }));
  r = await call('POST', `/api/orders/${o.id}/void`, { reason: 'customer complaint' }, owner); ok('after the sales reading even the owner cannot void a paid sale', r.s === 409 && /Z-1/.test(r.j.error), JSON.stringify(r.j));
  ok('the paid sale is still paid', (await call('GET', '/api/orders/' + o.id, null, owner)).j.status === 'paid');
  r = await call('POST', '/api/shifts/open', { openingFloat: 0 }, cash); ok('cannot open another shift the same day', r.s === 409 && /locked/.test(r.j.error), JSON.stringify(r.j));
  r = await call('POST', '/api/orders', { customer: { name: 'Late' }, items: [{ itemId: buddy.id, qty: 1 }] }, cash); ok('cannot create new tickets after the reading', r.s === 409, JSON.stringify(r.j));
  r = await call('POST', `/api/shifts/${sh.id}/close`, { counted: 0 }, cash); ok('a second sales reading for the same day is refused', r.s === 409 || r.s === 404, JSON.stringify(r.j));
  ok('only one Z-reading exists for today', (await call('GET', '/api/pos/zreadings', null, cash)).j.length === 1);
} catch (e) { fails++; console.log('ERROR', e); }
srv.kill(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
