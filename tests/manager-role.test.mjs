// T7a (decision D-12): a branch manager works like an admin, but only for the branches given to them.
// A manager of branches A and B can work in both and is refused in branch C; managers cannot make owner, admin or manager logins.
import { startServer, checker } from './helper.mjs';
const { ok, done, fail } = checker();
const S = await startServer(3153);
const { call } = S;
try {
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  const st = (await call('GET', '/api/state', null, owner)).j, [A, B, C] = st.branches;
  ok('the test shop has at least three branches', !!C, st.branches.length);
  await call('POST', '/api/users', { name: 'Admin Ana', username: 'ana', password: 'adminpass1', role: 'admin' }, owner);
  const ana = (await call('POST', '/api/login', { username: 'ana', password: 'adminpass1' })).j.token;

  // ---------- making a manager ----------
  let r = await call('POST', '/api/users', { name: 'Manager Mia', username: 'mia', password: 'miapass1', role: 'manager', branchIds: [A.id, B.id] }, owner);
  ok('the owner makes a manager for branches A and B', r.s === 201 && r.j.role === 'manager' && [...r.j.branchIds].sort().join() === [A.id, B.id].sort().join(), r);
  const miaId = r.j.id;
  ok('a manager needs at least one branch', (await call('POST', '/api/users', { name: 'No Branch', username: 'nob', password: 'nobpass1', role: 'manager' }, owner)).s === 409);
  ok('an unknown branch is refused', (await call('POST', '/api/users', { name: 'Bad Branch', username: 'badb', password: 'badpass1', role: 'manager', branchIds: [A.id, 'nope'] }, owner)).s === 409);
  ok('a manager logs in with a password, not a PIN', (await call('POST', '/api/users', { name: 'Pin Man', username: 'pinman', pin: '414141', role: 'manager', branchIds: [A.id] }, owner)).s === 409);
  r = await call('POST', '/api/users', { name: 'Manager Max', username: 'max', password: 'maxpass1', role: 'manager', branchIds: [C.id] }, ana);
  ok('an admin can make a manager too', r.s === 201, r);
  ok('the users list shows each manager with their branches', ((await call('GET', '/api/state', null, owner)).j.users.find(u => u.id === miaId)?.branchIds || []).length === 2);

  // ---------- working in their branches ----------
  r = await call('POST', '/api/login', { username: 'mia', password: 'miapass1' }); const mia = r.j.token;
  ok('the manager logs in', r.s === 200 && !!mia, r);
  r = await call('GET', '/api/state', null, mia);
  ok('the app knows the role and the branches', r.s === 200 && r.j.me.role === 'manager' && r.j.me.branchIds.length === 2, r.j);
  ok('the service log opens for branch A and branch B', (await call('GET', '/api/svc/today?branch=' + A.id, null, mia)).s === 200 && (await call('GET', '/api/svc/today?branch=' + B.id, null, mia)).s === 200);
  r = await call('GET', '/api/svc/today', null, mia);
  ok('the service log lists only their own branches to pick from', r.s === 200 && r.j.branches.map(x => x.id).sort().join() === [A.id, B.id].sort().join(), r.j.branches);
  ok('but not for branch C', (await call('GET', '/api/svc/today?branch=' + C.id, null, mia)).s === 403);
  for (const br of [A, C]) await call('POST', '/api/staff', { name: 'Barber ' + br.name, branchId: br.id, chairId: st.chairs.find(c => c.branchId === br.id)?.id, pct: 40, allowance: 0 }, owner);
  r = await call('GET', '/api/bh/pro/me', null, mia);
  ok('the Pro tools app opens and shows only the barbers of branches A and B', r.s === 200 && r.j.role === 'manager' && !r.j.admin && r.j.staff.length > 0 && r.j.staff.every(s => [A.name, B.name].includes(s.branchName)), r.j.staff?.map(s => s.branchName));
  ok('the queue of branch A opens, of branch C does not', (await call('GET', '/api/pos/queue?branch=' + A.id, null, mia)).s === 200 && (await call('GET', '/api/pos/queue?branch=' + C.id, null, mia)).s === 403);
  ok('lists of branch A open (problems, bookings, release pay)', (await call('GET', '/api/problems?branch=' + A.id, null, mia)).s === 200 && (await call('GET', '/api/bookings?branch=' + A.id, null, mia)).s === 200 && (await call('GET', '/api/advances?branch=' + B.id, null, mia)).s === 200);
  ok('lists of branch C are refused', (await call('GET', '/api/problems?branch=' + C.id, null, mia)).s === 403 && (await call('GET', '/api/bookings?branch=' + C.id, null, mia)).s === 403);
  ok('"all branches" is not a way around it', (await call('GET', '/api/problems?branch=all', null, mia)).s === 400 && (await call('GET', '/api/bookings', null, mia)).s === 400);
  r = await call('POST', '/api/problems', { branchId: C.id, category: 'Equipment', title: 'x', description: 'x' }, mia);
  ok('cannot file something for branch C', r.s === 403, r);

  // ---------- staff logins in their branches ----------
  r = await call('POST', '/api/users', { name: 'Desk A', username: 'desk-a', role: 'cashier', branchId: A.id }, mia);
  ok('the manager adds a front desk login for branch A and gets a new random PIN, shown once', r.s === 201 && /^\d{6}$/.test(r.j.pin || ''), r); const deskA = r.j.id;
  ok('that PIN works', (await call('POST', '/api/login', { pin: r.j.pin })).s === 200);
  // choosing a PIN would tell the manager which PINs other branches use ("already used"), so a manager never picks one (T7a review)
  ok('a manager cannot choose a PIN or a password for staff', (await call('POST', '/api/users', { name: 'Desk A2', username: 'desk-a2', pin: '515151', role: 'cashier', branchId: A.id }, mia)).s === 403
    && (await call('PUT', '/api/users/' + deskA, { pin: '100000' }, mia)).s === 403 && (await call('PUT', '/api/users/' + deskA, { password: 'deskpass1' }, mia)).s === 403);
  ok('not for branch C', (await call('POST', '/api/users', { name: 'Desk C', username: 'desk-c', role: 'cashier', branchId: C.id }, mia)).s === 403);
  ok('and never an owner, admin or manager login', (await call('POST', '/api/users', { name: 'X', username: 'x-owner', password: 'x-owner-pass-1', role: 'owner' }, mia)).s === 403
    && (await call('POST', '/api/users', { name: 'X', username: 'x-admin', password: 'xadmin1', role: 'admin' }, mia)).s === 403
    && (await call('POST', '/api/users', { name: 'X', username: 'x-man', password: 'xman123', role: 'manager', branchIds: [A.id] }, mia)).s === 403);
  ok('cannot move a front desk to branch C or make it an admin', (await call('PUT', '/api/users/' + deskA, { branchId: C.id }, mia)).s === 403 && (await call('PUT', '/api/users/' + deskA, { role: 'admin', password: 'admin-now1' }, mia)).s === 403);
  ok('can rename it and reset its PIN', (await call('PUT', '/api/users/' + deskA, { name: 'Desk Alpha' }, mia)).s === 200 && (await call('POST', `/api/users/${deskA}/reset`, null, mia)).s === 200);
  const deskC = (await call('POST', '/api/users', { name: 'Desk C', username: 'desk-c', pin: '535353', role: 'cashier', branchId: C.id }, owner)).j.id;
  ok("cannot change, reset or remove branch C's staff", (await call('PUT', '/api/users/' + deskC, { name: 'Hacked' }, mia)).s === 403 && (await call('POST', `/api/users/${deskC}/reset`, null, mia)).s === 403 && (await call('DELETE', '/api/users/' + deskC, null, mia)).s === 403);
  ok("cannot change the admin or another manager", (await call('PUT', '/api/users/' + (await call('GET', '/api/state', null, ana)).j.me.id, { name: 'Hacked' }, mia)).s === 403);
  ok('cannot give themselves more branches or another role', (await call('PUT', '/api/users/' + miaId, { branchIds: [A.id, B.id, C.id] }, mia)).s === 403 && (await call('PUT', '/api/users/' + miaId, { role: 'admin' }, mia)).s === 403);

  // ---------- cash moves stay inside the branch (T7a review) ----------
  const barbers = (await call('GET', '/api/state', null, owner)).j.staff, barberC = barbers.find(s => s.branchId === C.id), barberA = barbers.find(s => s.branchId === A.id);
  r = await call('POST', '/api/shifts/open', { branchId: A.id, float: 0 }, mia); const shiftA = r.j.id || r.j.shift?.id;
  ok('the manager opens a shift in branch A', r.s === 201 || r.s === 200, r);
  ok('a cash advance for a barber of branch C is refused', (await call('POST', '/api/cash', { shiftId: shiftA, kind: 'advance', staffId: barberC.id, amount: 500 }, mia)).s === 400);
  ok('for a barber of branch A it works', (await call('POST', '/api/cash', { shiftId: shiftA, kind: 'advance', staffId: barberA.id, amount: 500 }, mia)).s === 201);

  // ---------- shop-wide things stay with the owner and admins ----------
  ok('shop settings, activity log and marketing are refused', (await call('GET', '/api/settings', null, mia)).s === 403 && (await call('GET', '/api/audit', null, mia)).s === 403 && (await call('GET', '/api/devices', null, mia)).s === 403);
  ok('services and prices cannot be changed', (await call('POST', '/api/items', { name: 'Cheap cut', price: 1, type: 'service' }, mia)).s === 403);

  // ---------- changing a manager's branches ----------
  r = await call('PUT', '/api/users/' + miaId, { branchIds: [B.id] }, owner);
  ok('the owner takes branch A away', r.s === 200 && r.j.branchIds.join() === B.id, r);
  ok('from then on branch A is refused, branch B still works (same login)', (await call('GET', '/api/svc/today?branch=' + A.id, null, mia)).s === 403 && (await call('GET', '/api/svc/today?branch=' + B.id, null, mia)).s === 200);
  ok('with one branch, "all" simply means that branch', (await call('GET', '/api/problems?branch=all', null, mia)).s === 200);
  ok('giving branches to a front desk login changes nothing about its role', (await call('PUT', '/api/users/' + deskA, { branchIds: [A.id] }, owner)).s === 200 && (await call('GET', '/api/state', null, owner)).j.users.find(u => u.id === deskA)?.role === 'cashier');
} catch (e) { fail(e); }
await S.stop();
done();
