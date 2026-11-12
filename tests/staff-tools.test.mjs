// Staff tools (src/routes/staff-tools.js): the parts no other suite covers — the option lists the app shows,
// who a person can message in the inbox, a barber's own performance, and the owner's checklist list.
import { createStaffToolRoutes } from '../src/routes/staff-tools.js';
import { startServer, checker, ymd } from './helper.mjs';
const { ok, done, fail } = checker();
ok('the routes come from their own module', typeof createStaffToolRoutes === 'function');
const S = await startServer(3148);
const { call } = S;
try {
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  const st = (await call('GET', '/api/state', null, owner)).j, [br, br2] = st.branches, ch = st.chairs.filter(c => c.branchId === br.id);
  const kev = (await call('POST', '/api/staff', { name: 'Kev', branchId: br.id, chairId: ch[0].id, pct: 40, allowance: 0 }, owner)).j;
  await call('POST', '/api/users', { name: 'Desk', username: 'desk1', pin: '111111', role: 'cashier', branchId: br.id }, owner);
  await call('POST', '/api/users', { name: 'Desk Two', username: 'desk2', pin: '222222', role: 'cashier', branchId: br2.id }, owner);
  await call('POST', '/api/users', { name: 'Kev', username: 'kev', pin: '333333', role: 'barber', branchId: br.id, staffId: kev.id }, owner);
  await call('POST', '/api/users', { name: 'Unlinked', username: 'unl', pin: '444444', role: 'barber', branchId: br.id }, owner);
  await call('POST', '/api/users', { name: 'Admin Ana', username: 'ana', password: 'adminpass1', role: 'admin' }, owner);
  const pin = async p => (await call('POST', '/api/login', { pin: p })).j.token;
  const desk = await pin('111111'), kevT = await pin('333333'), unl = await pin('444444');

  // ---------- option lists ----------
  let r = await call('GET', '/api/expense-claims/options', null, desk);
  ok('expense options: categories and how it was paid', r.s === 200 && r.j.categories.length > 3 && r.j.methods.includes('Cash') && r.j.methods.includes('GCash'), r.j);
  r = await call('GET', '/api/problems/options', null, desk);
  ok('problem options: categories, the steps a report goes through, and priorities', r.s === 200 && r.j.categories.length > 3 && r.j.flow.length >= 3 && r.j.priorities.includes('High'), r.j);
  r = await call('GET', '/api/advances/options', null, desk);
  ok('release pay options: types and how it is released', r.s === 200 && r.j.types.includes('Cash Advance') && r.j.methods.length >= 1, r.j);

  // ---------- who can be messaged ----------
  r = await call('GET', '/api/inbox/people', null, desk);
  const names = r.j.map(x => x.name);
  ok('the front desk can message the owner, admins and people of its own branch, not itself', r.s === 200 && names.includes('Owner') && names.includes('Admin Ana') && names.includes('Kev') && !names.includes('Desk'), names);
  ok('not front desk staff of another branch', !names.includes('Desk Two'));
  r = await call('GET', '/api/inbox/people', null, owner);
  ok('the owner can message everyone, but not "Owner" itself', r.j.some(x => x.name === 'Desk Two') && !r.j.some(x => x.id === 'owner'), r.j.map(x => x.name));

  // ---------- a barber's own performance ----------
  r = await call('GET', `/api/me/performance?from=${ymd(new Date())}&to=${ymd(new Date())}`, null, kevT);
  ok('a linked barber sees his own performance', r.s === 200 && JSON.stringify(r.j).includes('Kev'), JSON.stringify(r.j).slice(0, 200));
  r = await call('GET', '/api/me/performance', null, unl);
  ok('a login not linked to a barber profile is told to ask the owner', r.s === 404 && /not linked/.test(r.j.error), r);

  // ---------- the owner's checklist list ----------
  r = await call('GET', `/api/checklists?from=${ymd(new Date())}&to=${ymd(new Date())}&branch=all`, null, owner);
  ok('the owner can list checklists (none yet today)', r.s === 200, r);
  ok('the front desk cannot list all checklists', (await call('GET', '/api/checklists', null, desk)).s === 403);
} catch (e) { fail(e); }
await S.stop();
done();
