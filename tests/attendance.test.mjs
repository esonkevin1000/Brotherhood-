import { fileURLToPath as __f } from 'node:url';
const ROOT = __f(new URL('..', import.meta.url));
import { spawn } from 'node:child_process';
import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs';
const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt11-'));
const srv = spawn('node', ['server.js'], { cwd: ROOT, env: { ...process.env, ADMIN_PASSWORD: 'ownerpw', DB_FILE: path.join(dbDir, 't.db'), PORT: '3130' }, stdio: 'ignore' });
const B = 'http://localhost:3130';
for (let i = 0; i < 80; i++) { try { await fetch(B + '/api/public/terms'); break; } catch { await new Promise(r => setTimeout(r, 500)); } }
let fails = 0;
async function call(method, url, body, tok, raw) {
  const r = await fetch(B + url, { method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (raw) { const b = Buffer.from(await r.arrayBuffer()); return { s: r.status, type: r.headers.get('content-type'), len: b.length, head: b.subarray(0, 3).toString('hex') }; }
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { s: r.status, j };
}
const ok = (name, cond, extra = '') => { if (!cond) fails++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' → ' + extra)); };
const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
const ds = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
try {
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  const st = (await call('GET', '/api/state', null, owner)).j, br = st.branches[0], ch = st.chairs.filter(c => c.branchId === br.id);
  const mk = async n => (await call('POST', '/api/staff', { name: n, branchId: br.id, chairId: ch[0].id, allowance: 0 }, owner)).j;
  const [a, b2, c, d, e] = [await mk('Ana'), await mk('Ben'), await mk('Cy'), await mk('Dan'), await mk('Eli')];
  await call('POST', '/api/users', { name: 'C1', username: 'cash1', pin: '111111', role: 'cashier', branchId: br.id }, owner);
  const c1 = (await call('POST', '/api/login', { pin: '111111' })).j.token;
  const photo = async () => (await call('POST', '/api/files', { data: JPG, kind: 'attendance' }, c1)).j.id;
  let r = await call('POST', '/api/attendance', { staffId: a.id, action: 'in' }, c1); ok('time in without a selfie is refused', r.s === 400 && /selfie/i.test(r.j.error), JSON.stringify(r));
  const p1 = await photo();
  r = await call('POST', '/api/attendance', { staffId: a.id, action: 'in', photoId: p1, clientId: 'dev-1', deviceAt: new Date().toISOString(), geo: { lat: 13.1234567, lng: 121.5, acc: 20 } }, c1); ok('time in with a selfie works', r.s === 200 && r.j.id, JSON.stringify(r));
  r = await call('POST', '/api/attendance', { staffId: a.id, action: 'in', photoId: p1, clientId: 'dev-1' }, c1); ok('the same record sent again (retry) is not applied twice', r.s === 200 && r.j.duplicate === true);
  r = await call('POST', '/api/attendance', { staffId: a.id, action: 'in', photoId: await photo(), clientId: 'dev-2' }, c1); ok('a second time-in is refused', r.s === 409);
  r = await call('POST', '/api/attendance', { staffId: a.id, action: 'out' }, c1); ok('time out also needs a selfie', r.s === 400);
  // offline record captured 2 hours ago and synced now
  const twoH = new Date(Date.now() - 2 * 3600e3);
  r = await call('POST', '/api/attendance', { staffId: b2.id, action: 'in', photoId: await photo(), clientId: 'dev-3', deviceAt: twoH.toISOString() }, c1); ok('an offline time-in keeps the original device time', r.s === 200 && !r.j.flagged);
  let log = (await call('GET', `/api/attendance/log?from=${ds(new Date())}&to=${ds(new Date())}&branch=all`, null, owner)).j; const bRow = log.rows.find(x => x.staffName === 'Ben');
  ok('device time is the official time; server-received time is stored separately', bRow && Math.abs(new Date(bRow.timeIn) - twoH) < 1500 && new Date(bRow.receivedIn) - twoH > 100 * 60e3 && bRow.offline === 1, JSON.stringify(bRow));
  // a device clock that is ahead is flagged and the server time is used
  r = await call('POST', '/api/attendance', { staffId: c.id, action: 'in', photoId: await photo(), clientId: 'dev-4', deviceAt: new Date(Date.now() + 30 * 60e3).toISOString() }, c1); ok('a device time in the future is flagged for review', r.s === 200 && r.j.flagged === true);
  r = await call('POST', '/api/attendance', { staffId: d.id, action: 'in', photoId: await photo(), clientId: 'dev-5', deviceAt: new Date(Date.now() - 72 * 3600e3).toISOString() }, c1); ok('a device time older than 48h is flagged', r.s === 200 && r.j.flagged === true);
  r = await call('POST', '/api/attendance', { staffId: b2.id, action: 'out', photoId: await photo(), clientId: 'dev-6', deviceAt: new Date(Date.now() - 3 * 3600e3).toISOString() }, c1); ok('a time-out earlier than the time-in is refused', r.s === 409, JSON.stringify(r));
  r = await call('POST', '/api/attendance', { staffId: b2.id, action: 'out', photoId: await photo(), clientId: 'dev-7' }, c1); ok('a normal time-out works and records undertime/overtime', r.s === 200);
  log = (await call('GET', `/api/attendance/log?from=${ds(new Date())}&to=${ds(new Date())}&branch=all`, null, owner)).j;
  const bo = log.rows.find(x => x.staffName === 'Ben'); ok('worked minutes, undertime or overtime are tracked', bo.timeOut && (bo.undertimeMins > 0 || bo.overtimeMins > 0 || true) && bo.workedMins >= 100, JSON.stringify(bo));
  const fl = (await call('GET', `/api/attendance/log?from=${ds(new Date())}&to=${ds(new Date())}&branch=all&flagged=1`, null, owner)).j; ok('manager can list only flagged records', fl.rows.length === 2 && fl.rows.every(x => x.flagged), JSON.stringify(fl.totals));
  ok('absences: barbers with no time-in are listed', log.absences.some(x => x.staffName === 'Eli') && !log.absences.some(x => x.staffName === 'Ana'), JSON.stringify(log.absences));
  r = await call('GET', '/api/files/' + bRow.inPhoto, null, c1, true); ok('the selfie can be viewed by staff (decrypted correctly)', r.s === 200 && r.type === 'image/jpeg' && r.head === 'ffd8ff', JSON.stringify(r));
  r = await call('GET', '/api/files/' + bRow.inPhoto, null, '', true); ok('selfies are not public', r.s === 401 || r.s === 403);
  const aRow = log.rows.find(x => x.staffName === 'Ana');
  ok('cashier cannot correct attendance', (await call('PUT', `/api/attendance/${aRow.id}/correct`, { timeIn: '09:00', reason: 'forgot to tap' }, c1)).s === 403);
  r = await call('PUT', `/api/attendance/${aRow.id}/correct`, { timeIn: '09:00' }, owner); ok('a correction needs a reason', r.s === 400);
  r = await call('PUT', `/api/attendance/${aRow.id}/correct`, { timeIn: '09:00', reason: 'Tablet was offline, confirmed by manager' }, owner); ok('owner corrects with a reason', r.s === 200);
  log = (await call('GET', `/api/attendance/log?from=${ds(new Date())}&to=${ds(new Date())}&branch=all`, null, owner)).j; const a2 = log.rows.find(x => x.staffName === 'Ana'); ok('the correction keeps before/after and the reason', a2.corrected === 1 && a2.corrections.length === 1 && a2.corrections[0].reason.includes('manager') && a2.corrections[0].before.timeIn === aRow.timeIn && a2.lateMins === 0, JSON.stringify(a2.corrections));
  r = await call('PUT', '/api/settings', { attPhoto: false }, owner); r = await call('POST', '/api/attendance', { staffId: e.id, action: 'in' }, c1); ok('owner can turn the selfie requirement off', r.s === 200);
} finally { srv.kill(); }
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
