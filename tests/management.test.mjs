// Back-office management routes (src/routes/management.js): the parts no other suite covers — backup download,
// activity log, PIN and password resets, applying a commission to a branch, the owner's username, a partner owner's password.
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs';
import { createManagementRoutes } from '../src/routes/management.js';
import { startServer, checker } from './helper.mjs';
const { ok, done, fail } = checker();
ok('the routes come from their own module', typeof createManagementRoutes === 'function');
const S = await startServer(3142, { SIGNUPS_OPEN: '1' });
const { call, B } = S;
try {
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  const st = (await call('GET', '/api/state', null, owner)).j, br = st.branches[0], ch = st.chairs.filter(c => c.branchId === br.id);
  const kev = (await call('POST', '/api/staff', { name: 'Kev', branchId: br.id, chairId: ch[0].id, pct: 40, allowance: 0 }, owner)).j;
  const leo = (await call('POST', '/api/staff', { name: 'Leo', branchId: br.id, chairId: ch[1].id, pct: 45, allowance: 0 }, owner)).j;
  const other = (await call('POST', '/api/staff', { name: 'Max', branchId: st.branches[1].id, chairId: st.chairs.find(c => c.branchId === st.branches[1].id).id, pct: 50, allowance: 0 }, owner)).j;
  const desk = (await call('POST', '/api/users', { name: 'Desk', username: 'desk1', pin: '111111', role: 'cashier', branchId: br.id }, owner)).j;
  const ana = (await call('POST', '/api/users', { name: 'Admin Ana', username: 'ana', password: 'adminpass1', role: 'admin' }, owner)).j;
  const deskT = (await call('POST', '/api/login', { pin: '111111' })).j.token, anaT = (await call('POST', '/api/login', { username: 'ana', password: 'adminpass1' })).j.token;

  // ---------- backup ----------
  let r = await fetch(B + '/api/backup', { headers: { Authorization: 'Bearer ' + owner } });
  const buf = Buffer.from(await r.arrayBuffer()), file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bh-bk-')), 'b.db');
  ok('the owner downloads a backup with a dated file name', r.status === 200 && /attachment; filename="brotherhood-\d{4}-\d{2}-\d{2}\.db"/.test(r.headers.get('content-disposition')), r.headers.get('content-disposition'));
  fs.writeFileSync(file, buf); const bdb = new DatabaseSync(file, { readOnly: true });
  ok('the backup is a working database with the barbers in it', bdb.prepare("select count(*) n from staff where name in ('Kev','Leo')").get().n === 2 && bdb.prepare('pragma integrity_check').get().integrity_check === 'ok'); bdb.close();
  ok('an admin cannot download a backup', (await call('GET', '/api/backup', null, anaT)).s === 403);
  ok('the front desk cannot either', (await call('GET', '/api/backup', null, deskT)).s === 403);

  // ---------- activity log ----------
  r = await call('GET', '/api/audit', null, owner); ok('the activity log shows the backup download', r.s === 200 && r.j.some(x => x.action === 'download-backup'));
  ok('the front desk cannot read the activity log', (await call('GET', '/api/audit', null, deskT)).s === 403);

  // ---------- resetting a PIN or a password ----------
  r = await call('POST', `/api/users/${desk.id}/reset`, null, anaT);
  ok('an admin gives the front desk a new 6-digit PIN, shown once', r.s === 200 && /^\d{6}$/.test(r.j.pin) && r.j.pin !== '111111', r);
  const newPin = r.j.pin;
  ok('the old PIN stops working and the new one works', (await call('POST', '/api/login', { pin: '111111' })).s === 401 && (await call('POST', '/api/login', { pin: newPin })).s === 200);
  ok('the old login of that person is ended', (await call('GET', '/api/svc/today', null, deskT)).s === 401);
  r = await call('POST', `/api/users/${ana.id}/reset`, null, anaT); ok('an admin cannot reset another admin', r.s === 403 && /Only the owner/.test(r.j.error));
  r = await call('POST', `/api/users/${ana.id}/reset`, null, owner);
  ok('the owner gives an admin a new password, shown once', r.s === 200 && typeof r.j.password === 'string' && r.j.password.length >= 8 && !r.j.pin, r);
  const anaPw = r.j.password;
  ok('the old password stops working and the new one works', (await call('POST', '/api/login', { username: 'ana', password: 'adminpass1' })).s === 401 && (await call('POST', '/api/login', { username: 'ana', password: r.j.password })).s === 200);
  ok('an unknown person is "not found"', (await call('POST', '/api/users/nope0nope0/reset', null, owner)).s === 404);

  // ---------- one commission rate for a whole branch ----------
  r = await call('POST', `/api/branches/${br.id}/apply-commission`, { pct: 42.5 }, owner);
  const s2 = (await call('GET', '/api/state', null, owner)).j, pctOf = id => s2.staff.find(s => s.id === id).pct;
  ok('every barber of the branch gets the rate, and it becomes the branch default', r.s === 200 && r.j.updated >= 2 && pctOf(kev.id) === 42.5 && pctOf(leo.id) === 42.5 && s2.branches.find(b => b.id === br.id).defaultPct === 42.5, r.j);
  ok('barbers of other branches keep theirs', pctOf(other.id) === 50);
  ok('a rate outside 0 to 100 is refused', (await call('POST', `/api/branches/${br.id}/apply-commission`, { pct: 120 }, owner)).s === 400 && (await call('POST', `/api/branches/${br.id}/apply-commission`, { pct: -1 }, owner)).s === 400);
  ok('the front desk cannot change commission', (await call('POST', `/api/branches/${br.id}/apply-commission`, { pct: 10 }, (await call('POST', '/api/login', { pin: newPin })).j.token)).s === 403);

  // ---------- the owner's username ----------
  r = await call('PUT', '/api/settings/owner-username', { username: 'Boss.Juan', password: 'wrong' }, owner); ok('changing the owner username needs the current password', r.s === 403 && /Wrong password/.test(r.j.error), r);
  r = await call('PUT', '/api/settings/owner-username', { username: 'Boss.Juan', password: 'ownerpw' }, owner); ok('the owner sets a username', r.s === 200, r);
  ok('the owner then logs in with it (any capitals) and the password', (await call('POST', '/api/login', { username: 'boss.juan', password: 'ownerpw' })).s === 200 && (await call('POST', '/api/login', { username: 'BOSS.JUAN', password: 'ownerpw' })).s === 200);
  ok('a blank username no longer works for the owner', (await call('POST', '/api/login', { password: 'ownerpw' })).s === 401);
  r = await call('PUT', '/api/settings/owner-username', { username: 'desk1', password: 'ownerpw' }, owner); ok('a username already used by staff is refused', r.s === 409, r);
  const ana2 = (await call('POST', '/api/login', { username: 'ana', password: anaPw })).j.token;
  ok('an admin cannot change the owner username', (await call('PUT', '/api/settings/owner-username', { username: 'x.y.z', password: 'ownerpw' }, ana2)).s === 403);
  r = await call('PUT', '/api/settings/owner-username', { username: '', password: 'ownerpw' }, owner);
  ok('clearing it brings back the blank-username login', r.s === 200 && (await call('POST', '/api/login', { password: 'ownerpw' })).s === 200, r);

  // ---------- a partner shop owner changes their own password ----------
  const shop = (await call('POST', '/api/public/signup', { kind: 'suite', shopName: 'Solo Cuts', ownerName: 'Rico Solo', email: 'rico@solo.ph', phone: '0917 999 8888', city: 'Lipa', username: 'rico', password: 'secret123', agree: true })).j;
  const X = { 'x-org': 'solo-cuts' };
  r = await call('PUT', '/api/settings/owner-password', { password: 'wrong', newPassword: 'newsecret99' }, shop.token); ok('a wrong current password is refused', r.s === 403 && /Wrong current password/.test(r.j.error));
  r = await call('PUT', '/api/settings/owner-password', { password: 'secret123', newPassword: 'short' }, shop.token); ok('a new password under 8 characters is refused', r.s === 400);
  r = await call('PUT', '/api/settings/owner-password', { password: 'secret123', newPassword: 'newsecret99' }, shop.token); ok('the partner owner changes the password and gets a new login', r.s === 200 && r.j.token, r);
  ok('the new token works, the old one is ended', (await call('GET', '/api/state', null, r.j.token)).s === 200 && (await call('GET', '/api/state', null, shop.token)).s === 401);
  ok('the new password logs in, the old one does not', (await call('POST', '/api/login', { username: 'rico', password: 'newsecret99' }, null, X)).s === 200 && (await call('POST', '/api/login', { username: 'rico', password: 'secret123' }, null, X)).s === 401);
  ok('Brotherhood\'s own owner cannot use this (the password is a hosting setting)', (await call('PUT', '/api/settings/owner-password', { password: 'ownerpw', newPassword: 'whatever99' }, owner)).s === 403);
} catch (e) { fail(e); }
await S.stop();
done();
