// T6c (decision D-21): staff pick their name, then type their PIN, on a phone or tablet the owner set up for the branch.
// Wrong PINs are counted per person, so a wrong-PIN pause hits only that person, not the whole shop.
import { startServer, checker } from './helper.mjs';
const { ok, done, fail } = checker();
const S = await startServer(3152, { SIGNUPS_OPEN: '1', PERSON_PIN_FAIL_MAX: '4' });
const { call } = S;
try {
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  const st = (await call('GET', '/api/state', null, owner)).j, [br, br2] = st.branches, ch = st.chairs.filter(c => c.branchId === br.id);
  const kev = (await call('POST', '/api/staff', { name: 'Kev', branchId: br.id, chairId: ch[0].id, pct: 40, allowance: 0 }, owner)).j;
  const mk = async (name, username, pin, role, branchId, staffId) => (await call('POST', '/api/users', { name, username, pin, role, branchId, staffId }, owner)).j;
  const desk = await mk('Desk Dina', 'dina', '111111', 'cashier', br.id), kevU = await mk('Kev', 'kev', '222222', 'barber', br.id, kev.id), other = await mk('Desk Two', 'desk2', '333333', 'cashier', br2.id);
  await call('POST', '/api/users', { name: 'Admin Ana', username: 'ana', password: 'adminpass1', role: 'admin' }, owner);
  const ana = (await call('POST', '/api/login', { username: 'ana', password: 'adminpass1' })).j.token;
  const D = tok => ({ 'x-device': tok });

  // ---------- setting up a phone for a branch ----------
  let r = await call('POST', '/api/device/setup', { branchId: br.id, name: 'Front desk tablet' }, owner);
  ok('an owner sets up a phone for a branch and gets a device key', r.s === 201 && typeof r.j.deviceToken === 'string' && r.j.device.branchName === br.name, r);
  const dev = r.j.deviceToken, devId = r.j.device.id;
  ok('an admin can set one up too', (await call('POST', '/api/device/setup', { branchId: br2.id }, ana)).s === 201);
  const deskTok = (await call('POST', '/api/login', { pin: '111111' })).j.token;
  ok('the front desk cannot set up a phone', (await call('POST', '/api/device/setup', { branchId: br.id }, deskTok)).s === 403);
  ok('nobody can without a login', (await call('POST', '/api/device/setup', { branchId: br.id })).s === 401);
  ok('an unknown branch is refused', (await call('POST', '/api/device/setup', { branchId: 'nope' }, owner)).s === 400);

  // ---------- the names on that phone ----------
  r = await call('GET', '/api/device/people', null, null, D(dev));
  const names = r.j.people?.map(x => x.name) || [];
  ok('the phone lists the people of its branch who use a PIN', r.s === 200 && r.j.branch.name === br.name && names.includes('Desk Dina') && names.includes('Kev'), r.j);
  ok('not people of another branch, and not admins or owners', !names.includes('Desk Two') && !names.includes('Admin Ana'));
  ok('only names and ids: no PINs, usernames or phone numbers', r.j.people.every(x => Object.keys(x).sort().join() === 'id,name,role'), r.j.people);
  ok('without a set-up phone the list is not given', (await call('GET', '/api/device/people')).s === 401 && (await call('GET', '/api/device/people', null, null, D(dev.slice(0, -3) + 'abc'))).s === 401);

  // ---------- logging in with name + PIN ----------
  r = await call('POST', '/api/login', { userId: desk.id, pin: '111111' }, null, D(dev));
  ok('Dina picks her name and types her PIN', r.s === 200 && (await call('GET', '/api/svc/today', null, r.j.token)).s === 200, r);
  r = await call('POST', '/api/login', { userId: kevU.id, pin: '111111' }, null, D(dev)); ok("Dina's PIN does not open Kev's login", r.s === 401 && r.j.error === 'Wrong PIN', r);
  r = await call('POST', '/api/login', { userId: other.id, pin: '333333' }, null, D(dev)); ok('someone from another branch cannot log in on this phone', r.s === 401, r);
  r = await call('POST', '/api/login', { userId: desk.id, pin: '111111' }); ok('name + PIN needs a set-up phone', r.s === 401, r);

  // ---------- a wrong-PIN pause hits only that person ----------
  // Kev already has 1 wrong PIN (Dina's PIN above); 2 more make 3, the 4th reaches the limit of 4
  for (let i = 0; i < 2; i++) r = await call('POST', '/api/login', { userId: kevU.id, pin: String(400000 + i) }, null, D(dev));
  ok('wrong PINs are refused as usual', r.s === 401 && r.j.error === 'Wrong PIN');
  r = await call('POST', '/api/login', { userId: kevU.id, pin: '400009' }, null, D(dev)); ok('the wrong PIN that reaches the limit is still just "wrong"', r.s === 401);
  r = await call('POST', '/api/login', { userId: kevU.id, pin: '222222' }, null, D(dev));
  ok("then Kev's login is paused for a while, even with the right PIN", r.s === 429 && /Kev/.test(r.j.error) && /minute/.test(r.j.error), r);
  ok('Dina can still log in on the same phone', (await call('POST', '/api/login', { userId: desk.id, pin: '111111' }, null, D(dev))).s === 200);
  ok("the pause is in the activity log under Kev's name", JSON.stringify((await call('GET', '/api/audit', null, owner)).j).includes('pin-login-paused'));
  const burst = await Promise.all(Array.from({ length: 20 }, (_, i) => call('POST', '/api/login', { userId: desk.id, pin: String(500000 + i) }, null, D(dev))));
  ok('20 wrong PINs for one person at once: only the allowed few are even checked', burst.filter(x => x.s === 401).length === 4 && burst.filter(x => x.s === 429).length === 16, burst.map(x => x.s));

  // ---------- turning off the old PIN-only login ----------
  ok('the old PIN-only login still works by default (until every branch phone is set up)', (await call('POST', '/api/login', { pin: '333333' })).s === 200);
  r = await call('PUT', '/api/settings', { pinOnly: false }, owner); ok('the owner turns off PIN-only login', r.s === 200 && (await call('GET', '/api/settings', null, owner)).j.pinOnly === false);
  r = await call('POST', '/api/login', { pin: '333333' }); ok('then a PIN alone is refused with a clear reason', r.s === 403 && /pick your name/i.test(r.j.error), r);
  ok('username and password logins are not affected', (await call('POST', '/api/login', { username: 'ana', password: 'adminpass1' })).s === 200);

  // ---------- a lost phone ----------
  r = await call('GET', '/api/devices', null, owner); ok('the owner sees the set-up phones', r.s === 200 && r.j.some(d => d.id === devId && d.name === 'Front desk tablet'), r.j);
  r = await call('DELETE', '/api/devices/' + devId, null, owner); ok('and can switch one off', r.s === 200);
  ok('a switched-off phone no longer lists names or logs anyone in', (await call('GET', '/api/device/people', null, null, D(dev))).s === 401 && (await call('POST', '/api/login', { userId: kevU.id, pin: '222222' }, null, D(dev))).s === 401);
  ok('the front desk cannot see or switch off phones', (await call('GET', '/api/devices', null, deskTok)).s === 403);

  // ---------- partner shops have their own phones ----------
  const shop = (await call('POST', '/api/public/signup', { kind: 'owner', shopName: 'Kingsman Cuts', ownerName: 'Juan Cruz', email: 'juan@kingsman.ph', phone: '0917 123 4567', city: 'Calamba', username: 'juan', password: 'secret123', agree: true })).j;
  const pst = (await call('GET', '/api/state', null, shop.token)).j;
  const pd = (await call('POST', '/api/users', { name: 'P Desk', username: 'pdesk', pin: '777777', role: 'cashier', branchId: pst.branches[0].id }, shop.token)).j;
  const pdev = (await call('POST', '/api/device/setup', { branchId: pst.branches[0].id }, shop.token)).j.deviceToken;
  const X = { 'x-org': shop.code };
  r = await call('GET', '/api/device/people', null, null, { ...D(pdev), ...X }); ok("a partner shop's phone lists its own people", r.s === 200 && r.j.people.map(x => x.name).join() === 'P Desk', r.j);
  ok('and logs them in', (await call('POST', '/api/login', { userId: pd.id, pin: '777777' }, null, { ...D(pdev), ...X })).s === 200);
  ok("a partner shop's phone does not work for Brotherhood", (await call('GET', '/api/device/people', null, null, D(pdev))).s === 401);
} catch (e) { fail(e); }
await S.stop();
done();
