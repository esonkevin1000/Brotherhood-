import { fileURLToPath as __f } from 'node:url';
const ROOT = __f(new URL('..', import.meta.url));
import { spawn } from 'node:child_process';
import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs';
const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt7-'));
const srv = spawn('node', ['server.js'], { cwd: ROOT, env: { ...process.env, ADMIN_PASSWORD: 'ownerpw', DB_FILE: path.join(dbDir, 't.db'), PORT: '3126' }, stdio: 'ignore' });
const B = 'http://localhost:3126';
for (let i = 0; i < 80; i++) { try { await fetch(B + '/api/public/terms'); break; } catch { await new Promise(r => setTimeout(r, 500)); } }
let fails = 0;
async function call(method, url, body, tok, raw) {
  const r = await fetch(B + url, { method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (raw) return { s: r.status, type: r.headers.get('content-type'), len: (await r.arrayBuffer()).byteLength };
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { s: r.status, j };
}
const ok = (name, cond, extra = '') => { if (!cond) fails++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' → ' + extra)); };
// a tiny valid JPEG data URL
const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
try {
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  await call('PUT', '/api/settings', { attPhoto: false }, owner);
  const st = (await call('GET', '/api/state', null, owner)).j, br = st.branches[0], br2 = st.branches[1];
  const buddy = st.items.find(i => i.name === 'Buddy'), amigo = st.items.find(i => i.name === 'Amigo');
  ok('Buddy is marked "requires ID" by default, Amigo is not', buddy.needId === 1 && amigo.needId === 0, JSON.stringify([buddy.needId, amigo.needId]));
  await call('POST', '/api/users', { name: 'C1', username: 'cash1', pin: '111111', role: 'cashier', branchId: br.id }, owner);
  await call('POST', '/api/users', { name: 'C2', username: 'cash2', pin: '222222', role: 'cashier', branchId: br2.id }, owner);
  const c1 = (await call('POST', '/api/login', { pin: '111111' })).j.token, c2 = (await call('POST', '/api/login', { pin: '222222' })).j.token;
  const line = [{ itemId: buddy.id, qty: 1 }];
  let r = await call('POST', '/api/orders', { customer: { name: 'Lola' }, items: line }, c1); ok('Buddy without an ID photo is refused', r.s === 400 && /ID/.test(r.j.error), JSON.stringify(r));
  r = await call('POST', '/api/orders', { customer: { name: 'Lola' }, items: line, idPhotoId: 'nope' }, c1); ok('a made-up photo id is refused', r.s === 400);
  r = await call('POST', '/api/pos/idphoto', { data: JPG, idType: 'Driver' }, c1); ok('only Senior / PWD / Student ID types are accepted', r.s === 400);
  r = await call('POST', '/api/pos/idphoto', { data: 'hello', idType: 'Senior' }, c1); ok('non-image data is refused', r.s === 400);
  const up = await call('POST', '/api/pos/idphoto', { data: JPG, idType: 'Senior' }, c1); ok('cashier can upload an ID photo', up.s === 201 && up.j.id, JSON.stringify(up));
  const o = await call('POST', '/api/orders', { customer: { name: 'Lola' }, items: line, idPhotoId: up.j.id }, c1); ok('Buddy with an ID photo is accepted and the photo is attached', o.s === 201 && o.j.idPhoto === up.j.id && o.j.idType === 'Senior', JSON.stringify(o.j));
  r = await call('POST', '/api/orders', { customer: { name: 'Other' }, items: line, idPhotoId: up.j.id }, c1); ok('the same photo cannot be reused for another ticket', r.s === 400);
  const up2 = await call('POST', '/api/pos/idphoto', { data: JPG, idType: 'PWD' }, c2);
  r = await call('POST', '/api/orders', { customer: { name: 'X' }, items: line, idPhotoId: up2.j.id }, c1); ok('a photo from another branch cannot be used', r.s === 400);
  r = await call('GET', '/api/idphoto/' + up.j.id, null, c1, true); ok('staff of the branch can view the ID photo', r.s === 200 && r.type === 'image/jpeg' && r.len > 50, JSON.stringify(r));
  r = await call('GET', '/api/idphoto/' + up.j.id, null, owner, true); ok('owner can view it too', r.s === 200);
  r = await call('GET', '/api/idphoto/' + up.j.id, null, c2, true); ok('another branch cashier cannot', r.s === 404);
  r = await call('GET', '/api/idphoto/' + up.j.id, null, '', true); ok('anonymous visitors cannot (not public)', r.s === 401 || r.s === 403, r.s);
  r = await call('GET', '/img/' + up.j.id, null, '', true); ok('and it is not served on the public image route', r.s === 404, r.s);
  // adding Buddy to an existing ticket
  const am = await call('POST', '/api/orders', { customer: { name: 'Pedro' }, items: [{ itemId: amigo.id, qty: 1 }] }, c1); ok('normal services need no ID', am.s === 201);
  r = await call('PUT', '/api/orders/' + am.j.id, { items: [{ itemId: amigo.id, qty: 1 }, { itemId: buddy.id, qty: 1 }] }, c1); ok('adding Buddy to a ticket without an ID photo is refused', r.s === 400);
  const up3 = await call('POST', '/api/pos/idphoto', { data: JPG, idType: 'Student' }, c1);
  r = await call('PUT', '/api/orders/' + am.j.id, { items: [{ itemId: amigo.id, qty: 1 }, { itemId: buddy.id, qty: 1 }], idPhotoId: up3.j.id }, c1); ok('…and allowed once the ID photo is sent with it', r.s === 200 && r.j.idType === 'Student', JSON.stringify(r.j));
  r = await call('PUT', '/api/orders/' + o.j.id, { items: [{ itemId: buddy.id, qty: 2 }] }, c1); ok('editing quantity on a ticket that already has the photo is fine', r.s === 200);
  // report
  { const ch = st.chairs.filter(c => c.branchId === br.id)[0]; const bar = (await call('POST', '/api/staff', { name: 'Kev', branchId: br.id, chairId: ch.id, allowance: 0 }, owner)).j; await call('POST', '/api/attendance', { staffId: bar.id, action: 'in' }, c1); await call('PUT', '/api/orders/' + o.j.id, { chairId: ch.id }, c1); }
  await call('POST', '/api/shifts/open', { openingFloat: 0 }, c1);
  const pay = await call('POST', `/api/orders/${o.j.id}/pay`, { tenders: [{ method: 'Cash', amount: 500 }] }, c1); ok('can be paid', pay.s === 200, JSON.stringify(pay));
  const today = (d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'))(new Date());
  const rep = (await call('GET', `/api/reports/discounts?from=${today}&to=${today}&branch=all`, null, owner)).j;
  const t2 = rep.tables.find(t => /ID discount/.test(t.title)); ok('discount report lists ID-required sales with a link to the photo', t2 && t2.rows.length === 1 && t2.rows[0][6] === 'Senior~' + up.j.id, JSON.stringify(t2));
  const csvRes = await fetch(`${B}/api/reports/discounts?from=${today}&to=${today}&branch=all&format=csv`, { headers: { Authorization: 'Bearer ' + owner } }); const csv = await csvRes.text();
  ok('CSV shows the ID type but not the photo link', csv.includes('Senior') && !csv.includes(up.j.id));
  r = await call('PUT', '/api/items/' + buddy.id, { needId: 0 }, owner); ok('owner can turn the requirement off for an item', r.s === 200);
  r = await call('POST', '/api/orders', { customer: { name: 'Free' }, items: line }, c1); ok('then Buddy sells without a photo', r.s === 201);
} finally { srv.kill(); }
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
