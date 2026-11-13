// T36 (L3, D-3, D-19): rewards at 10, 15, 25 and 40 points, VIP at 50. The customer sees the balance, history and which rewards are
// reachable; staff redeem with a balance check; too few points is refused; a double tap redeems once. Any branch honours rewards.
import { DatabaseSync } from 'node:sqlite';
import { startServer, checker } from './helper.mjs';
const { ok, done, fail } = checker();
const S = await startServer(3201);
const { call } = S;
try {
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  const st = (await call('GET', '/api/state', null, owner)).j, [A, B] = st.branches, ch = st.chairs.filter(c => c.branchId === A.id);
  await call('PUT', `/api/branches/${A.id}`, { openTime: '00:00', closeTime: '23:59' }, owner);
  await call('PUT', '/api/settings', { attPhoto: false }, owner);
  await call('PUT', '/api/settings', { mvpBranches: [A.id] }, owner);
  const trim = (await call('POST', '/api/items', { name: 'Quick Trim', price: 200, type: 'service', mins: 30, bookable: 1, active: 1 }, owner)).j;
  const kev = (await call('POST', '/api/staff', { name: 'Kev', branchId: A.id, chairId: ch[0].id, pct: 40, allowance: 0 }, owner)).j;
  await call('POST', '/api/users', { name: 'Desk Dina', username: 'dina', pin: '111111', role: 'cashier', branchId: A.id }, owner);
  await call('POST', '/api/users', { name: 'Desk Bea', username: 'bea', pin: '444444', role: 'cashier', branchId: B.id }, owner);
  await call('POST', '/api/users', { name: 'Kev', username: 'kev', pin: '222222', role: 'barber', branchId: A.id, staffId: kev.id }, owner);
  const desk = (await call('POST', '/api/login', { pin: '111111' })).j.token, deskB = (await call('POST', '/api/login', { pin: '444444' })).j.token, kevTok = (await call('POST', '/api/login', { pin: '222222' })).j.token;
  await call('POST', '/api/attendance', { staffId: kev.id, action: 'in' }, desk);
  const db = new DatabaseSync(S.dbFile, { timeout: 5000 });
  const visit = async who => { const id = (await call('POST', '/api/svc/walkin', { ...who, items: [{ itemId: trim.id, qty: 1 }], barberId: kev.id }, desk)).j.id; await call('POST', `/api/svc/${id}/finish`, { method: 'Cash', barberId: kev.id }, desk); return id; };
  const give = (cid, n) => db.prepare("insert into loyalty_ledger(id,customerId,kind,delta,reason,createdAt) values(?,?,'adjust',?,'test points',?)").run('t' + Math.random().toString(36).slice(2), cid, n, new Date().toISOString());
  const redeem = (cid, reward, key, tok = desk) => call('POST', `/api/loyalty/customers/${cid}/redeem`, { reward, requestKey: key }, tok);
  const view = (cid, tok = desk) => call('GET', `/api/loyalty/customers/${cid}`, null, tok);

  const v = await visit({ name: 'Ana Cruz', phone: '0917 111 2222' }), cid = db.prepare('select customerId from orders where id=?').get(v).customerId;
  give(cid, 8);
  let r = await view(cid);
  ok('the rewards are 10, 15, 25 and 40 points; none reachable at 9', r.j.balance === 9 && JSON.stringify(r.j.rewards.map(x => x.points)) === '[10,15,25,40]' && r.j.rewards.every(x => !x.reachable), r.j);
  ok('redeeming a free haircut at 9 points is refused', (await redeem(cid, 'haircut', 'key-at-nine-0001')).s === 409 && (await view(cid)).j.balance === 9);
  await visit({ name: 'Ana Cruz', phone: '0917 111 2222' });
  r = await view(cid);
  ok('at 10 the free haircut is reachable, the others not yet', r.j.balance === 10 && r.j.rewards.find(x => x.points === 10).reachable && !r.j.rewards.find(x => x.points === 15).reachable);
  const two = await Promise.all([redeem(cid, 'haircut', 'double-tap-key-01'), redeem(cid, 'haircut', 'double-tap-key-01')]);
  const rows = db.prepare("select * from loyalty_ledger where customerId=? and kind='redeem'").all(cid);
  ok('at 10 the redemption works, and a double tap redeems once', two.every(x => x.s === 200 || x.s === 201) && rows.length === 1 && rows[0].delta === -10 && rows[0].reward === 'Free haircut' && rows[0].byName === 'Desk Dina', [two.map(x => x.s), rows]);
  ok('the balance is now 0', (await view(cid)).j.balance === 0);
  ok('a new redemption with no points left is refused', (await redeem(cid, 'haircut', 'another-key-0001')).s === 409);
  ok('an unknown reward is refused', (await redeem(cid, 'boat', 'unknown-reward-01')).s === 400);
  ok('a redemption without a request key is refused', (await call('POST', `/api/loyalty/customers/${cid}/redeem`, { reward: 'haircut' }, desk)).s === 400);
  give(cid, 15);
  ok('the front desk of another branch can redeem too (D-19)', (await redeem(cid, 'viro', 'other-branch-key-1', deskB)).s === 201 && (await view(cid)).j.balance === 0);
  ok('a barber cannot redeem', (await redeem(cid, 'haircut', 'barber-key-000001', kevTok)).s === 403);
  ok('each redemption is in the activity log', db.prepare("select count(*) n from audit where action='loyalty-redeemed'").get().n === 2);
  ok('the history shows the visits, the redemptions and who did them', (await view(cid)).j.history.filter(h => h.kind === 'redeem').every(h => h.by && h.reward));

  // VIP at 50: permanent, uses no points
  const v2 = await visit({ name: 'Ben Reyes', phone: '0917 333 4444' }), cid2 = db.prepare('select customerId from orders where id=?').get(v2).customerId;
  give(cid2, 48); await visit({ name: 'Ben Reyes', phone: '0917 333 4444' });
  r = await view(cid2);
  ok('at 50 points the customer is VIP', r.j.vip === true && r.j.balance === 50, r.j);
  await redeem(cid2, 'shirt', 'vip-redeem-key-01');
  r = await view(cid2);
  ok('VIP stays after spending points (it uses no points)', r.j.vip === true && r.j.balance === 10);

  // the customer's own view in the app
  const app = (await call('POST', '/api/bh/signup', { name: 'Ana Cruz', email: 'ana@example.com', phone: '0917 111 2222', password: 'password123', agree: true })).j.token;
  db.prepare("update bh_users set customerId=? where email='ana@example.com'").run(cid);
  r = await call('GET', '/api/bh/loyalty', null, app);
  ok('the customer sees the balance, history and which rewards are reachable', r.s === 200 && r.j.points?.balance === 0 && r.j.points.history.length >= 4 && r.j.points.rewards.length === 4 && 'reachable' in r.j.points.rewards[0], r.j.points);
  db.close();
} catch (e) { fail(e); }
await S.stop();
done();
