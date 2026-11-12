// T6a: a missing or weak ADMIN_PASSWORD / SESSION_SECRET is warned about (decision D-22: a warning, the app keeps running),
// and evidence photos stay readable when SESSION_SECRET is set for the first time.
import crypto from 'node:crypto';
import { createAuth } from '../src/lib/auth.js';
import { startServer, checker } from './helper.mjs';
const { ok, done, fail } = checker();
const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
try {
  // ---------- the photo key can have older keys to read with ----------
  const oldOnly = createAuth('bp:ownerpw'), both = createAuth('a-new-long-session-secret', { fileSecrets: ['a-new-long-session-secret', 'bp:ownerpw'] });
  const photo = crypto.randomBytes(300), stored = oldOnly.encBuf(photo);
  ok('a photo stored with the old key is still read when an older key is listed', both.decBuf(stored).equals(photo));
  const fresh = both.encBuf(photo);
  ok('new photos are stored with the first (current) key', createAuth('a-new-long-session-secret').decBuf(fresh).equals(photo));
  ok('without the old key in the list the old photo cannot be read', (() => { try { createAuth('a-new-long-session-secret').decBuf(stored); return false; } catch { return true; } })());
  ok('a tampered photo is still refused with several keys', (() => { const t = Buffer.from(stored); t[40] ^= 1; try { both.decBuf(t); return false; } catch { return true; } })());
  ok('tokens are still signed with the session secret only', both.readToken(oldOnly.makeToken('owner', '')) === null && both.readToken(both.makeToken('owner', ''))?.u === 'owner');

  // ---------- a live server without SESSION_SECRET: works, and warns the owner ----------
  let S = await startServer(3150, { NODE_ENV: 'production' });
  let owner = (await S.call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  let st = (await S.call('GET', '/api/state', null, owner)).j;
  ok('without SESSION_SECRET the app still runs (a warning, not a stop)', !!owner && Array.isArray(st.branches));
  ok('the owner is told SESSION_SECRET is missing and ADMIN_PASSWORD is short', Array.isArray(st.secretWarnings) && st.secretWarnings.some(w => /SESSION_SECRET/.test(w)) && st.secretWarnings.some(w => /ADMIN_PASSWORD/.test(w)), st.secretWarnings);
  await S.call('POST', '/api/users', { name: 'Desk', username: 'desk1', pin: '111111', role: 'cashier', branchId: st.branches[0].id }, owner);
  await S.call('POST', '/api/users', { name: 'Admin Ana', username: 'ana', password: 'adminpass1', role: 'admin' }, owner);
  const desk = (await S.call('POST', '/api/login', { pin: '111111' })).j.token, ana = (await S.call('POST', '/api/login', { username: 'ana', password: 'adminpass1' })).j.token;
  ok('an admin sees the warning too (they can fix the setting with the owner)', ((await S.call('GET', '/api/state', null, ana)).j.secretWarnings || []).length >= 1);
  ok('the front desk does not', !('secretWarnings' in (await S.call('GET', '/api/state', null, desk)).j));
  const file = (await S.call('POST', '/api/files', { data: JPG, kind: 'receipt', branchId: st.branches[0].id }, desk)).j;
  const before = await fetch(S.B + '/api/files/' + file.id, { headers: { Authorization: 'Bearer ' + owner } }), beforeLen = (await before.arrayBuffer()).byteLength;
  ok('(setup) a receipt photo is stored and opens', before.status === 200 && beforeLen > 50, before.status);
  const dir = S.dbDir; await S.stop();

  // ---------- the owner adds SESSION_SECRET for the first time ----------
  S = await startServer(3150, { NODE_ENV: 'production', ADMIN_PASSWORD: 'ownerpw', SESSION_SECRET: 'a-new-long-session-secret-for-tests' }, dir);
  ok('old logins end once (they were signed with the old value)', (await S.call('GET', '/api/state', null, owner)).s === 401);
  owner = (await S.call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  const after = await fetch(S.B + '/api/files/' + file.id, { headers: { Authorization: 'Bearer ' + owner } });
  ok('the receipt photo stored before still opens after SESSION_SECRET is added', after.status === 200 && (await after.arrayBuffer()).byteLength === beforeLen, after.status);
  st = (await S.call('GET', '/api/state', null, owner)).j;
  ok('the SESSION_SECRET warning is gone; the short-password warning stays', !st.secretWarnings.some(w => /SESSION_SECRET/.test(w)) && st.secretWarnings.some(w => /ADMIN_PASSWORD/.test(w)), st.secretWarnings);
  await S.stop();

  // ---------- strong settings: no warnings ----------
  S = await startServer(3150, { NODE_ENV: 'production', ADMIN_PASSWORD: 'a-long-owner-password-2026', SESSION_SECRET: 'x'.repeat(40) });
  owner = (await S.call('POST', '/api/login', { password: 'a-long-owner-password-2026' })).j.token;
  ok('with a long password and a session secret there is no warning', ((await S.call('GET', '/api/state', null, owner)).j.secretWarnings || []).length === 0);
  await S.stop();

  // ---------- on a developer's computer nothing is shown ----------
  S = await startServer(3150, {});
  owner = (await S.call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  ok('outside production there is no warning (local testing)', ((await S.call('GET', '/api/state', null, owner)).j.secretWarnings || []).length === 0);
  await S.stop();
} catch (e) { fail(e); }
done();
