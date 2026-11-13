// T34 (E2, BAR-007): a barber sees his own commission entries (today, this week and history), never anyone else's; a manager sees
// the barbers of his branches; the owner sees all. The front desk does not see earnings.
import { DatabaseSync } from 'node:sqlite';
import { startServer, checker } from './helper.mjs';
const { ok, done, fail } = checker();
const S = await startServer(3196);
const { call } = S;
try {
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  const st = (await call('GET', '/api/state', null, owner)).j, [A, B] = st.branches, ch = st.chairs.filter(c => c.branchId === A.id), chB = st.chairs.filter(c => c.branchId === B.id);
  for (const b of [A, B]) await call('PUT', `/api/branches/${b.id}`, { openTime: '00:00', closeTime: '23:59' }, owner);
  await call('PUT', '/api/settings', { attPhoto: false }, owner);
  const trim = (await call('POST', '/api/items', { name: 'Quick Trim', price: 200, type: 'service', mins: 30, bookable: 1, active: 1 }, owner)).j;
  const kev = (await call('POST', '/api/staff', { name: 'Kev', branchId: A.id, chairId: ch[0].id, pct: 40, allowance: 0 }, owner)).j;
  const leo = (await call('POST', '/api/staff', { name: 'Leo', branchId: A.id, chairId: ch[1].id, pct: 50, allowance: 0 }, owner)).j;
  const bob = (await call('POST', '/api/staff', { name: 'Bob', branchId: B.id, chairId: chB[0].id, pct: 50, allowance: 0 }, owner)).j;
  await call('POST', '/api/users', { name: 'Desk Dina', username: 'dina', pin: '111111', role: 'cashier', branchId: A.id }, owner);
  await call('POST', '/api/users', { name: 'Desk Bea', username: 'bea', pin: '444444', role: 'cashier', branchId: B.id }, owner);
  await call('POST', '/api/users', { name: 'Kev', username: 'kev', pin: '222222', role: 'barber', branchId: A.id, staffId: kev.id }, owner);
  await call('POST', '/api/users', { name: 'Manager Mia', username: 'mia', password: 'miapass1', role: 'manager', branchIds: [A.id] }, owner);
  const desk = (await call('POST', '/api/login', { pin: '111111' })).j.token, deskB = (await call('POST', '/api/login', { pin: '444444' })).j.token;
  const kevTok = (await call('POST', '/api/login', { pin: '222222' })).j.token, mia = (await call('POST', '/api/login', { username: 'mia', password: 'miapass1' })).j.token;
  for (const s of [kev, leo]) await call('POST', '/api/attendance', { staffId: s.id, action: 'in' }, desk);
  await call('POST', '/api/attendance', { staffId: bob.id, action: 'in' }, deskB);
  const visit = async (name, s, tok = desk) => { const id = (await call('POST', '/api/svc/walkin', { name, items: [{ itemId: trim.id, qty: 1 }], barberId: s.id }, tok)).j.id; await call('POST', `/api/svc/${id}/finish`, { method: 'Cash' }, tok); return id; };
  const db = new DatabaseSync(S.dbFile, { timeout: 5000 });

  const k1 = await visit('Ana', kev), k2 = await visit('Ben', kev); await visit('Cy', leo); await visit('Bo', bob, deskB);
  await call('POST', `/api/records/${k2}/adjust`, { kind: 'amount', after: 150, reason: 'Senior price' }, owner);
  // an older entry, eight days ago: in his history, not in this week or today
  const old = new Date(Date.now() - 8 * 864e5), oldDay = `${old.getFullYear()}-${String(old.getMonth() + 1).padStart(2, '0')}-${String(old.getDate()).padStart(2, '0')}`;
  db.prepare("insert into commission_entries(id,orderId,staffId,branchId,date,orderDate,kind,base,pct,productComm,amount,rule,reason,createdAt) values('old1','oldorder',?,?,?,?,'earn',100,40,0,40,'{}','visit finished',?)").run(kev.id, A.id, oldDay, oldDay, old.toISOString());

  let r = await call('GET', '/api/earnings', null, kevTok);
  ok('the barber sees his own earnings', r.s === 200 && r.j.staff?.id === kev.id, r.j);
  ok('today: ₱80 + ₱80 − ₱20 correction = ₱140', r.j.today?.total === 140, r.j.today);
  ok('this week includes today', r.j.period?.total >= 140 && r.j.period.from <= r.j.period.to, r.j.period);
  ok('history: every entry, newest first, with the visit and the reason', r.j.entries?.length === 4 && r.j.entries.some(e => e.amount === -20 && /amount/.test(e.reason)) && r.j.entries.at(-1).id === 'old1' && r.j.entries.some(e => e.visitNo), r.j.entries);
  ok('the old entry is in his history total, not today', r.j.all?.total === 180 && r.j.today.total === 140);
  ok("he cannot see Leo's", (await call('GET', `/api/earnings?staffId=${leo.id}`, null, kevTok)).s === 403);
  ok('the front desk does not see earnings', (await call('GET', `/api/earnings?staffId=${kev.id}`, null, desk)).s === 403);
  r = await call('GET', `/api/earnings?staffId=${leo.id}`, null, mia);
  ok("the branch manager sees Leo's (₱100)", r.s === 200 && r.j.today.total === 100, r.j);
  ok("but not a barber of another branch", (await call('GET', `/api/earnings?staffId=${bob.id}`, null, mia)).s === 403);
  r = await call('GET', `/api/earnings/branch?branch=${A.id}`, null, mia);
  const by = Object.fromEntries((r.j.barbers || []).map(b => [b.name, b]));
  ok('the manager sees the totals of his branch, per barber', r.s === 200 && by.Kev?.today === 140 && by.Leo?.today === 100 && !by.Bob, r.j);
  ok('not of another branch', (await call('GET', `/api/earnings/branch?branch=${B.id}`, null, mia)).s === 403);
  ok("the owner sees anyone's", (await call('GET', `/api/earnings?staffId=${bob.id}`, null, owner)).j.today?.total === 100);
  ok('a barber cannot read the branch totals', (await call('GET', `/api/earnings/branch?branch=${A.id}`, null, kevTok)).s === 403);
  db.close();
} catch (e) { fail(e); }
await S.stop();
done();
