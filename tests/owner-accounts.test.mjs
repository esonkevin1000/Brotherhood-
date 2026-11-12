// T6b: owners get their own login (role "owner"); the Railway ADMIN_PASSWORD stays as an emergency login that is written
// in the activity log (decision D-23); an owner login made with the Railway password ends when that password changes.
import { startServer, checker } from './helper.mjs';
const { ok, done, fail } = checker();
try {
  let S = await startServer(3151, { SESSION_SECRET: 'fixed-session-secret-for-this-test' });
  let { call } = S;
  const railway = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  const st = (await call('GET', '/api/state', null, railway)).j, br = st.branches[0];
  await call('POST', '/api/users', { name: 'Admin Ana', username: 'ana', password: 'adminpass1', role: 'admin' }, railway);
  const ana = (await call('POST', '/api/login', { username: 'ana', password: 'adminpass1' })).j.token;

  // ---------- creating an owner account ----------
  let r = await call('POST', '/api/users', { name: 'Kevin Eson', username: 'kevin', password: 'kevin-owner-pass-1', role: 'owner' }, railway);
  ok('an owner creates an owner account for a person', r.s === 201 && r.j.role === 'owner' && !r.j.branchId, r);
  const kevinId = r.j.id;
  ok('an admin cannot create an owner account', (await call('POST', '/api/users', { name: 'Sneaky', username: 'sneaky', password: 'sneaky-pass-123', role: 'owner' }, ana)).s === 403);
  ok('an owner account needs a password of at least 10 characters', (await call('POST', '/api/users', { name: 'Short', username: 'short', password: 'short1', role: 'owner' }, railway)).s === 409);
  ok('an owner account cannot have a PIN (a PIN alone must never open the owner\'s back office)', (await call('POST', '/api/users', { name: 'Pin Owner', username: 'pinowner', password: 'a-long-password-1', pin: '919191', role: 'owner' }, railway)).s === 409);

  // ---------- logging in as that owner ----------
  r = await call('POST', '/api/login', { username: 'kevin', password: 'kevin-owner-pass-1' });
  ok('the person logs in with their own username and password', r.s === 200, r);
  const kevin = r.j.token, me = (await call('GET', '/api/state', null, kevin)).j.me;
  ok('they are an owner, under their own name', me.role === 'owner' && me.name === 'Kevin Eson' && me.id === kevinId, me);
  ok('they can do owner-only things, such as download a backup and manage partner shops', (await call('GET', '/api/backup', null, kevin)).s === 200 && (await call('GET', '/api/orgs', null, kevin)).s === 200);
  const audit = (await call('GET', '/api/audit', null, kevin)).j;
  ok('the activity log shows who logged in by name', audit.some(a => a.action === 'login' && a.who === 'Kevin Eson'), audit.slice(0, 3));

  // ---------- an admin cannot change, reset or remove an owner account ----------
  ok('an admin cannot rename it, turn it into an admin, or change its password', (await call('PUT', '/api/users/' + kevinId, { name: 'Hacked' }, ana)).s === 403 && (await call('PUT', '/api/users/' + kevinId, { role: 'admin' }, ana)).s === 403 && (await call('PUT', '/api/users/' + kevinId, { password: 'taken-over-pass' }, ana)).s === 403);
  ok('an admin cannot reset it or remove it', (await call('POST', `/api/users/${kevinId}/reset`, null, ana)).s === 403 && (await call('DELETE', '/api/users/' + kevinId, null, ana)).s === 403);
  ok('an admin cannot turn their own account into an owner', (await call('PUT', '/api/users/' + (await call('GET', '/api/state', null, ana)).j.me.id, { role: 'owner' }, ana)).s === 403);
  r = await call('POST', `/api/users/${kevinId}/reset`, null, railway);
  ok('an owner can give an owner account a new password, shown once', r.s === 200 && r.j.password && !r.j.pin, r);
  ok('the old login of that owner account ends', (await call('GET', '/api/state', null, kevin)).s === 401);

  // ---------- the Railway password: emergency login ----------
  r = await call('POST', '/api/login', { password: 'ownerpw' });
  ok('the Railway password still logs in', r.s === 200, r);
  const audit2 = (await call('GET', '/api/audit', null, r.j.token)).j;
  ok('with owner accounts in place, it is written as an emergency login', audit2.some(a => a.action === 'emergency-login'), audit2.slice(0, 3).map(a => a.action));
  const tok1 = r.j.token;
  await S.stop();

  // ---------- the Railway password changes ----------
  S = await startServer(3151, { SESSION_SECRET: 'fixed-session-secret-for-this-test', ADMIN_PASSWORD: 'a-new-railway-password' }, S.dbDir); call = S.call;
  ok('a login made with the old Railway password ends when that password changes', (await call('GET', '/api/state', null, tok1)).s === 401);
  const k2 = await call('POST', '/api/login', { username: 'kevin', password: (await (async () => { const t = (await call('POST', '/api/login', { password: 'a-new-railway-password' })).j.token; return (await call('POST', `/api/users/${kevinId}/reset`, null, t)).j.password; })()) });
  ok('the owner account works with its own password after the Railway password changed', k2.s === 200, k2);
  await S.stop();
} catch (e) { fail(e); }
done();
