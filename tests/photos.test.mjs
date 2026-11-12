import { fileURLToPath as __f } from 'node:url';
const ROOT = __f(new URL('..', import.meta.url));
import { spawn } from 'node:child_process';
import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs';
const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt2-'));
const srv = spawn('node', ['server.js'], { cwd: ROOT, env: { ...process.env, ADMIN_PASSWORD: 'ownerpw', DB_FILE: path.join(dbDir, 't.db'), PORT: '3121', BOOK_LIMIT: '1000' }, stdio: 'ignore' });
for (let i = 0; i < 80; i++) { try { await fetch('http://localhost:3121/api/public/terms'); break; } catch { await new Promise(r => setTimeout(r, 500)); } }
const B = 'http://localhost:3121'; let fails = 0;
async function call(method, url, body, tok) {
  const r = await fetch(B + url, { method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { s: r.status, j, h: r.headers };
}
const ok = (name, cond, extra = '') => { if (!cond) fails++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' → ' + extra)); };
const ymd = n => { const d = new Date(Date.now() + n * 864e5); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
try {
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  await call('PUT', '/api/settings', { attPhoto: false }, owner);
  { const _s = (await call('GET', '/api/state', null, owner)).j; for (const _i of _s.items.filter(i => i.name === 'Buddy')) await call('PUT', '/api/items/' + _i.id, { needId: 0 }, owner); }
  const st = (await call('GET', '/api/state', null, owner)).j, br = st.branches[0], br2 = st.branches[1];
  const mk = async n => (await call('POST', '/api/staff', { name: n, branchId: br.id, pct: 50, allowance: 0 }, owner)).j;
  const kev = await mk('Kevin'), mar = await mk('Marco');
  await call('POST', '/api/users', { name: 'C1', username: 'cashier1', pin: '111111', role: 'cashier', branchId: br.id }, owner);
  await call('POST', '/api/users', { name: 'C2', username: 'cashier2', pin: '222222', role: 'cashier', branchId: br2.id }, owner);
  const c1 = (await call('POST', '/api/login', { pin: '111111' })).j.token, c2 = (await call('POST', '/api/login', { pin: '222222' })).j.token;
  const svc = n => st.items.find(i => i.name === n);
  const buddy = svc('Buddy'), vip = svc('Vip Compadre'), powder = svc('Texture Powder');
  await call('PUT', '/api/items/' + buddy.id, { bookable: 1 }, owner);   // Buddy is walk-in only by default; these tests book it online

  // ---- photos ----
  const up = await call('POST', '/api/upload', { data: PNG }, owner); ok('upload photo', up.s === 201 && /^\/img\/\w+$/.test(up.j.url), JSON.stringify(up));
  const img = await fetch(B + up.j.url); ok('photo is public + cacheable', img.status === 200 && img.headers.get('content-type') === 'image/png' && /immutable/.test(img.headers.get('cache-control')));
  ok('bad image type rejected', (await call('POST', '/api/upload', { data: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' }, owner)).s === 400);
  ok('cashier cannot upload', (await call('POST', '/api/upload', { data: PNG }, c1)).s === 403);
  await call('PUT', '/api/staff/' + kev.id, { photo: up.j.url }, owner);
  ok('staff photo saved', (await call('GET', '/api/state', null, owner)).j.staff.find(s => s.id === kev.id).photo === up.j.url);
  const up2 = (await call('POST', '/api/upload', { data: PNG }, owner)).j.url; await call('PUT', '/api/staff/' + kev.id, { photo: up2 }, owner);
  ok('replaced photo is cleaned up', (await fetch(B + up.j.url)).status === 404 && (await fetch(B + up2)).status === 200);
  ok('item photo + flags saved', (await call('PUT', '/api/items/' + buddy.id, { photo: up2 }, owner)).j.photo === up2);

  // ---- public info ----
  const info = (await call('GET', '/api/public/info')).j;
  ok('public info: services only (bookable), no products', info.services.some(s => s.name === 'Buddy') && !info.services.some(s => s.name === 'Texture Powder'));
  ok('Vip Compadre is appointment-only', info.services.find(s => s.name === 'Vip Compadre').apptOnly === 1 && info.services.find(s => s.name === 'Buddy').apptOnly === 0);
  ok('public staff has photo + branch', info.staff.find(s => s.name === 'Kevin').photo === up2 && info.staff.find(s => s.name === 'Kevin').branchId === br.id);
  ok('public info leaks no pay rates', !JSON.stringify(info).includes('allowance') && !JSON.stringify(info).includes('"pct"'));

  // ---- availability + booking ----
  const D = ymd(1), item = buddy.id;
  const sl = (await call('GET', `/api/public/slots?branch=${br.id}&date=${D}&staff=any&items=${item}`)).j.slots;
  ok('slots from 09:00, last 20:30', sl[0] === '09:00' && sl.at(-1) === '20:30', JSON.stringify([sl[0], sl.at(-1), sl.length]));
  ok('past date has no slots', (await call('GET', `/api/public/slots?branch=${br.id}&date=${ymd(-1)}&staff=any&items=${item}`)).j.slots.length === 0);
  const book = b => call('POST', '/api/public/book', { branchId: br.id, date: D, time: '10:00', itemIds: [item], name: 'Juan', phone: '0917 123 4567', ...b });
  const b1 = await book({ staffId: kev.id }); ok('online booking created with chosen barber', b1.s === 201 && b1.j.booking.staff === 'Kevin' && b1.j.booking.total === 150, JSON.stringify(b1));
  ok('same barber same time rejected', (await book({ staffId: kev.id })).s === 409);
  const b2 = await book({ staffId: 'any', name: 'Pedro' }); ok('"any barber" falls to the free barber', b2.s === 201 && b2.j.booking.staff === 'Marco', JSON.stringify(b2));
  ok('both busy → 409', (await book({ staffId: 'any', name: 'Mark' })).s === 409);
  const slAfter = (await call('GET', `/api/public/slots?branch=${br.id}&date=${D}&staff=any&items=${item}`)).j.slots; ok('10:00 no longer offered', !slAfter.includes('10:00') && slAfter.includes('10:30'));
  const v = await book({ staffId: kev.id, time: '11:00', itemIds: [vip.id], name: 'Vip Guy' }); ok('45-min booking', v.s === 201);
  ok('overlap with 45-min booking rejected (11:30 for same barber)', (await book({ staffId: kev.id, time: '11:30', name: 'X' })).s === 409);
  ok('after it ends (12:00) is fine', (await book({ staffId: kev.id, time: '12:00', name: 'Y' })).s === 201);
  ok('bad phone rejected', (await book({ phone: '123', time: '14:00' })).s === 400);
  ok('missing name rejected', (await book({ name: '', time: '14:00' })).s === 400);
  ok('product cannot be booked', (await book({ itemIds: [powder.id], time: '14:00' })).s === 400);
  ok('past date rejected', (await book({ date: ymd(-1), time: '14:00' })).s === 400);
  ok('too far ahead rejected', (await book({ date: ymd(90), time: '14:00' })).s === 400);
  ok('barber from another branch rejected', (await call('POST', '/api/public/book', { branchId: br2.id, staffId: kev.id, date: D, time: '15:00', itemIds: [item], name: 'Z', phone: '09171234567' })).s === 409);

  // ---- POS side ----
  const mine = (await call('GET', `/api/bookings?date=${D}`, null, c1)).j; ok('cashier sees own branch bookings', mine.length === 4 && mine[0].items[0].name && mine[0].branchName, mine.length);
  ok('other branch cashier sees none', (await call('GET', `/api/bookings?date=${D}`, null, c2)).j.length === 0);
  ok('admin sees all via range', (await call('GET', `/api/bookings?from=${D}&to=${ymd(2)}`, null, owner)).j.length === 4);
  ok('public cannot list bookings', (await call('GET', `/api/bookings?date=${D}`)).s === 401);
  const pb = await call('POST', '/api/bookings', { date: D, time: '16:00', itemIds: [item], name: 'Phone-in', phone: '09281112222', staffId: 'any' }, c1); ok('cashier creates a phone-in booking', pb.s === 201 && pb.j.source === 'pos', JSON.stringify(pb));
  ok('other branch cashier cannot touch it', (await call('PUT', '/api/bookings/' + b1.j.booking && '/api/bookings/' + pb.j.id, { status: 'cancelled' }, c2)).s === 403);
  const cx = await call('PUT', '/api/bookings/' + pb.j.id, { status: 'cancelled' }, c1); ok('cancel booking', cx.s === 200);
  ok('cancel twice rejected', (await call('PUT', '/api/bookings/' + pb.j.id, { status: 'noshow' }, c1)).s === 409);
  ok('cancelled slot is free again', (await call('GET', `/api/public/slots?branch=${br.id}&date=${D}&staff=${kev.id}&items=${item}`)).j.slots.includes('16:00'));

  // arrival: booked for TODAY so the ticket is valid today
  const T = ymd(0), nowSlot = (() => { const d = new Date(Date.now() + 60 * 60000); return `${String(d.getHours()).padStart(2, '0')}:${d.getMinutes() < 30 ? '00' : '30'}`; })();
  const today = await call('POST', '/api/public/book', { branchId: br.id, staffId: kev.id, date: T, time: nowSlot, itemIds: [item], name: 'Today Guy', phone: '0917 555 0000' });
  if (today.s === 201) {
    const list = (await call('GET', `/api/bookings?date=${T}`, null, c1)).j, tb = list.find(x => x.customerName === 'Today Guy');
    ok('today booking listed', !!tb);
    const noClock = await call('POST', `/api/bookings/${tb.id}/arrive`, null, c1); ok('arrive without barber clocked in → waits in queue', noClock.s === 200 && noClock.j.order.status === 'waiting' && noClock.j.seated === false, JSON.stringify(noClock.j));
    ok('arrive twice rejected', (await call('POST', `/api/bookings/${tb.id}/arrive`, null, c1)).s === 409);
    ok('ticket carries the booked service', noClock.j.order.items[0].name === 'Buddy' && noClock.j.order.customerName === 'Today Guy');
    ok('customer was created from booking phone', (await call('GET', '/api/customers?q=555%200000', null, c1)).j.total === 1);
    await call('POST', '/api/attendance', { staffId: mar.id, action: 'in' }, c1);
    const t2 = await call('POST', '/api/public/book', { branchId: br.id, staffId: mar.id, date: T, time: nowSlot, itemIds: [item], name: 'Second', phone: '0917 555 0001' });
    const tb2 = (await call('GET', `/api/bookings?date=${T}`, null, c1)).j.find(x => x.customerName === 'Second');
    const seated = await call('POST', `/api/bookings/${tb2.id}/arrive`, null, c1); ok('arrive with preferred barber on duty → seated automatically', seated.j.seated === true && seated.j.order.barberId === mar.id, JSON.stringify(seated.j));
    ok('every booked phone number is one directory record (same phone = same person)', (await call('GET', '/api/customers?q=', null, c1)).j.total === 4);
    const live = (await call('GET', '/api/live', null, c1)).j; ok('arrived customers show on the floor', live.queue.length === 2, JSON.stringify(live.queue.length));
  } else console.log('SKIP arrival tests (no slot available right now): ' + JSON.stringify(today.j));
  const dash = (await call('GET', '/api/pos/dashboard', null, c1)).j; ok('pos dashboard counts bookings', typeof dash.bookings === 'number');
  ok('audit has booking events', (await call('GET', '/api/audit', null, owner)).j.some(a => a.action === 'booking'));
} finally { srv.kill(); }
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
