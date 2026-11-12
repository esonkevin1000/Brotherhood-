import { fileURLToPath as __f } from 'node:url';
const ROOT = __f(new URL('..', import.meta.url));
import { spawn } from 'node:child_process';
import http from 'node:http'; import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs';
const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt5-'));
const hits = []; let googleDown = false;
const mock = http.createServer((q, s) => { hits.push({ url: q.url, key: q.headers['x-goog-api-key'], mask: q.headers['x-goog-fieldmask'] });
  if (googleDown) { s.writeHead(500); return s.end('{}'); }
  s.writeHead(200, { 'Content-Type': 'application/json' });
  s.end(JSON.stringify({ rating: 4.8, userRatingCount: 120, reviews: [
    { authorAttribution: { displayName: 'Maria G', photoUri: 'https://x/p.jpg' }, rating: 5, relativePublishTimeDescription: 'a week ago', text: { text: 'Best barbershop in Laguna!' } },
    { authorAttribution: { displayName: 'John D' }, rating: 4, relativePublishTimeDescription: '2 months ago', text: { text: 'Clean and fast.' } }] })); }).listen(3198);
const srv = spawn('node', ['server.js'], { cwd: ROOT, env: { ...process.env, ADMIN_PASSWORD: 'ownerpw', DB_FILE: path.join(dbDir, 't.db'), PORT: '3124', GOOGLE_PLACES_API_KEY: 'g_test_key', GOOGLE_PLACES_URL: 'http://localhost:3198/places/' }, stdio: 'ignore' });
for (let i = 0; i < 80; i++) { try { await fetch('http://localhost:3124/api/public/terms'); break; } catch { await new Promise(r => setTimeout(r, 500)); } }
const B = 'http://localhost:3124'; let fails = 0;
async function call(method, url, body, tok) {
  const r = await fetch(B + url, { method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { s: r.status, j };
}
const ok = (name, cond, extra = '') => { if (!cond) fails++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' → ' + extra)); };
try {
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  await call('PUT', '/api/settings', { attPhoto: false }, owner);
  { const _s = (await call('GET', '/api/state', null, owner)).j; for (const _i of _s.items.filter(i => i.name === 'Buddy')) await call('PUT', '/api/items/' + _i.id, { needId: 0 }, owner); }
  const st = (await call('GET', '/api/state', null, owner)).j, br = st.branches[0], ch = st.chairs.filter(c => c.branchId === br.id), buddy = st.items.find(i => i.name === 'Buddy');
  const mk = async (n, c) => (await call('POST', '/api/staff', { name: n, branchId: br.id, chairId: c?.id || '', allowance: 0 }, owner)).j;
  const kev = await mk('Kevin', ch[0]), mar = await mk('Marco', ch[1]), jay = await mk('Jay', ch[2]);
  await call('POST', '/api/users', { name: 'Cashier', username: 'cashier1', pin: '111111', role: 'cashier', branchId: br.id }, owner);
  const cash = (await call('POST', '/api/login', { pin: '111111' })).j.token;
  for (const s of [kev, mar]) await call('POST', '/api/attendance', { staffId: s.id, action: 'in' }, cash); await call('POST', '/api/shifts/open', { openingFloat: 0 }, cash);
  const tk = async n => (await call('POST', '/api/orders', { customer: { name: n }, items: [{ itemId: buddy.id, qty: 1 }] }, cash)).j;
  const assign = (o, chair) => call('PUT', '/api/orders/' + o.id, { chairId: chair.id }, cash);
  const get = async o => (await call('GET', '/api/orders/' + o.id, null, cash)).j;
  const pay = o => call('POST', `/api/orders/${o.id}/pay`, { tenders: [{ method: 'Cash', amount: 150 }] }, cash);

  // ---- chair-based assignment + queue per chair ----
  const A = await tk('A'), Bt = await tk('B'), C = await tk('C'), D = await tk('D'), F = await tk('F');
  const a = await assign(A, ch[0]); ok('free chair → customer sits down with that chair\'s barber', a.j.status === 'in_chair' && a.j.barberId === kev.id && a.j.chairId === ch[0].id && a.j.queued === false, JSON.stringify(a.j));
  const b = await assign(Bt, ch[0]); ok('busy chair → "Add to Queue": waits for that barber', b.j.status === 'waiting' && b.j.barberId === kev.id && b.j.chairId === ch[0].id && b.j.queued === true, JSON.stringify(b.j));
  const c = await assign(C, ch[1]); ok('another free chair works at the same time', c.j.status === 'in_chair' && c.j.barberId === mar.id);
  ok('chair whose barber is not on duty is refused', (await assign(D, ch[2])).s === 409);
  ok('a chair from another branch / unknown chair is refused', (await call('PUT', '/api/orders/' + D.id, { chairId: 'nope' }, cash)).s === 409);
  const f = await assign(F, ch[0]); ok('a second customer queues behind the first', f.j.queued === true);
  await pay(A);
  ok('when the customer is paid, the next queued customer sits down automatically (in order)', (await get(Bt)).status === 'in_chair' && (await get(F)).status === 'waiting');
  await call('POST', `/api/orders/${Bt.id}/void`, { reason: 'left' }, cash);
  ok('voiding the one in the chair also moves the queue forward', (await get(F)).status === 'in_chair');
  const re = await assign(D, ch[1]); ok('can queue on the chair that is busy, then re-assign to another', re.j.queued === true && (await assign(D, ch[0])).j.queued === true);
  await pay(C); ok('paying frees chair 2 but D is queued on chair 1 (stays waiting)', (await get(D)).status === 'waiting');
  await pay(F); ok('…and moves in when chair 1 is free', (await get(D)).status === 'in_chair' && (await get(D)).barberId === kev.id);
  const sit = await tk('E'); const oldWay = await call('PUT', '/api/orders/' + sit.id, { barberId: mar.id, chairId: ch[1].id }, cash); ok('old barber+chair way still works', oldWay.j.status === 'in_chair');
  const live = (await call('GET', '/api/live', null, cash)).j; ok('live floor counts queued customers as waiting', live.cutting === 2 && live.waiting === 0, JSON.stringify(live));

  // ---- Google reviews ----
  const info0 = (await call('GET', '/api/public/info')).j.branches[0]; ok('no Google details yet → no links', info0.google.readUrl === '' && info0.google.writeUrl === '' && info0.google.connected === false, JSON.stringify(info0.google));
  await call('PUT', '/api/branches/' + br.id, { googlePlaceId: 'ChIJtestPLACE123', mapUrl: 'https://maps.google.com/?q=x' }, owner);
  const info1 = (await call('GET', '/api/public/info')).j.branches[0]; ok('Place ID gives read + write review links', info1.google.writeUrl === 'https://search.google.com/local/writereview?placeid=ChIJtestPLACE123' && info1.google.readUrl.includes('placeid=ChIJtestPLACE123') && info1.google.connected === true, JSON.stringify(info1.google));
  ok('place id itself is not exposed publicly', !('googlePlaceId' in info1) && !('googleUrl' in info1));
  const g = (await call('GET', '/api/public/google?branch=' + br.id)).j; ok('live Google rating + latest reviews', g.available && g.rating === 4.8 && g.count === 120 && g.reviews.length === 2 && g.reviews[0].author === 'Maria G' && g.reviews[0].text.includes('Best barbershop'), JSON.stringify(g));
  ok('API key + field mask sent to Google, place id in the URL', hits[0].key === 'g_test_key' && hits[0].mask === 'rating,userRatingCount,reviews' && hits[0].url.endsWith('ChIJtestPLACE123'), JSON.stringify(hits[0]));
  await call('GET', '/api/public/google?branch=' + br.id); ok('second request is served from the cache (Google not called again)', hits.length === 1);
  ok('cached rating appears in public info', (await call('GET', '/api/public/info')).j.branches[0].google.rating === 4.8);
  googleDown = true; await call('PUT', '/api/settings', {}, owner);
  await call('PUT', '/api/branches/' + br.id, { googleUrl: 'https://g.page/r/ABC123/review' }, owner);
  const i2 = (await call('GET', '/api/public/info')).j.branches[0]; ok('a pasted Google review link overrides the generated one', i2.google.writeUrl === 'https://g.page/r/ABC123/review');
  ok('settings tell the owner whether the Google key is set', (await call('GET', '/api/settings', null, owner)).j.google.configured === true);
  ok('branch without a Place ID: no live data, no crash', (await call('GET', '/api/public/google?branch=' + st.branches[1].id)).j.available === false);
  ok('unknown branch is refused', (await call('GET', '/api/public/google?branch=zzz')).s === 400);
} finally { srv.kill(); mock.close(); }
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
