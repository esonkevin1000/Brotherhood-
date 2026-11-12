import { fileURLToPath as __f } from 'node:url';
const ROOT = __f(new URL('..', import.meta.url));
import { spawn } from 'node:child_process';
import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs';
const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt20-'));
const srv = spawn('node', ['server.js'], { cwd: ROOT, env: { ...process.env, ADMIN_PASSWORD: 'ownerpw', DB_FILE: path.join(dbDir, 't.db'), PORT: '3144' }, stdio: 'ignore' });
const B = 'http://localhost:3144';
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
  const info = (await call('GET', '/api/public/info')).j, st = (await call('GET', '/api/state', null, owner)).j, br = st.branches[0];
  ok('online booking offers only Vip Compadre', info.services.length === 1 && info.services[0].name === 'Vip Compadre', JSON.stringify(info.services.map(s => s.name)));
  ok('the price menu still lists all three services with photos', info.menu.length === 3 && info.menu.every(s => s.photo) && info.menu.filter(s => !s.bookable).map(s => s.name).sort().join() === 'Amigo,Buddy', JSON.stringify(info.menu.map(s => [s.name, s.bookable, s.photo])));
  const kev = (await call('POST', '/api/staff', { name: 'Kev', branchId: br.id, chairId: st.chairs.find(c => c.branchId === br.id).id, pct: 40, allowance: 0 }, owner)).j;
  const D = ds(new Date(Date.now() + 864e5)), book = id => call('POST', '/api/public/book', { branchId: br.id, staffId: 'any', date: D, time: '10:00', itemIds: [id], name: 'Juan', phone: '0917 123 4567' });
  const buddy = st.items.find(i => i.name === 'Buddy'), amigo = st.items.find(i => i.name === 'Amigo'), vip = st.items.find(i => i.name === 'Vip Compadre');
  let r = await book(buddy.id); ok('Buddy cannot be booked online', r.s === 400 && /cannot be booked online/.test(r.j.error), JSON.stringify(r.j));
  r = await book(amigo.id); ok('Amigo cannot be booked online', r.s === 400, JSON.stringify(r.j));
  r = await book(vip.id); ok('Vip Compadre can be booked online', r.s === 201 || r.s === 409, JSON.stringify(r.j));   // 409 only if no barber is free at that hour
  // the owner can still change it
  await call('PUT', '/api/items/' + buddy.id, { bookable: 1 }, owner);
  ok('the owner can turn online booking on for Buddy later', (await call('GET', '/api/public/info')).j.services.some(s => s.name === 'Buddy'));
  // the cashier can still book any service at the POS (phone/walk-in appointments)
  await call('POST', '/api/users', { name: 'Cashier', username: 'cashier1', pin: '111111', role: 'cashier', branchId: br.id }, owner);
  const cash = (await call('POST', '/api/login', { pin: '111111' })).j.token;
  await call('PUT', '/api/items/' + buddy.id, { bookable: 0 }, owner);
  r = await call('POST', '/api/bookings', { branchId: br.id, staffId: 'any', date: D, time: '15:00', itemIds: [buddy.id], name: 'Phone Pedro', phone: '0917 765 4321' }, cash);
  ok('the cashier can still make a Buddy appointment at the POS', r.s === 201 || r.s === 409, JSON.stringify(r.j));
} catch (e) { fails++; console.log('ERROR', e); }
srv.kill(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
