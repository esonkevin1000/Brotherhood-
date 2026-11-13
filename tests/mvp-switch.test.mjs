// T11: the new (MVP) behaviour is switched on branch by branch (pilot: San Pablo, decision D-4). Off everywhere by default.
import { createFlags } from '../src/lib/flags.js';
import { startServer, checker } from './helper.mjs';
const { ok, done, fail } = checker();
try {
  // ---------- the switch itself ----------
  const store = new Map(), F = createFlags({ getSetting: k => store.get(k), setSetting: (k, v) => store.set(k, v), branchExists: id => ['sp', 'bay'].includes(id) });
  ok('off everywhere by default', !F.mvpOn('sp') && !F.mvpOn('bay') && F.mvpBranches().length === 0);
  F.setMvpBranches(['sp']);
  ok('on for one branch, still off for the other', F.mvpOn('sp') && !F.mvpOn('bay'));
  ok('an unknown branch is refused', (() => { try { F.setMvpBranches(['sp', 'nope']); return false; } catch { return F.mvpOn('sp') && F.mvpBranches().length === 1; } })());
  store.set('mvpBranches', 'not json');
  ok('a damaged setting means off, not a crash', !F.mvpOn('sp'));

  // ---------- through the back office ----------
  const S = await startServer(3157), { call } = S;
  try {
    const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
    const [A, B] = (await call('GET', '/api/state', null, owner)).j.branches;
    await call('POST', '/api/users', { name: 'Admin Ana', username: 'ana', password: 'adminpass1', role: 'admin' }, owner);
    const ana = (await call('POST', '/api/login', { username: 'ana', password: 'adminpass1' })).j.token;
    ok('settings show the switch, off everywhere at first', JSON.stringify((await call('GET', '/api/settings', null, owner)).j.mvpBranches) === '[]');
    let r = await call('PUT', '/api/settings', { mvpBranches: [A.id] }, owner);
    ok('the owner turns it on for one branch', r.s === 200 && JSON.stringify((await call('GET', '/api/settings', null, owner)).j.mvpBranches) === JSON.stringify([A.id]), r);
    ok('an unknown branch is refused', (await call('PUT', '/api/settings', { mvpBranches: [A.id, 'nope'] }, owner)).s === 400);
    ok('only the owner may change it (an admin may not)', (await call('PUT', '/api/settings', { mvpBranches: [A.id, B.id] }, ana)).s === 403
      && JSON.stringify((await call('GET', '/api/settings', null, owner)).j.mvpBranches) === JSON.stringify([A.id]));
    ok('other settings by an admin still work', (await call('PUT', '/api/settings', { attGeo: true }, ana)).s === 200);
    ok('the change is in the activity log', JSON.stringify((await call('GET', '/api/audit', null, owner)).j).includes('new booking system'));
    r = await call('PUT', '/api/settings', { mvpBranches: [] }, owner);
    ok('and can turn it off again', r.s === 200 && JSON.stringify((await call('GET', '/api/settings', null, owner)).j.mvpBranches) === '[]');
  } finally { await S.stop(); }
} catch (e) { fail(e); }
done();
