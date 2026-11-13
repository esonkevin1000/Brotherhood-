// Loyalty points (T35–T38, MVP 9, D-3, D-19). A ledger: one point per finished visit where the new system is on (mvpOn), a reverse
// row when that visit is voided, a redeem row for each reward, one carry-over row per customer for past paid visits. Nothing is updated
// or deleted, so the balance is always the sum of the rows.
// D-19 (accepted 2026-11-13): no expiry; a reward can be claimed again; every branch honours rewards; the front desk redeems (audited,
// no approval); VIP at 50 is permanent and uses no points; a void after a redemption warns the manager, the reward is not taken back.
import { NEXT } from '../lib/http.js';

export const REWARDS = [{ points: 10, key: 'haircut', name: 'Free haircut' }, { points: 15, key: 'viro', name: 'Viro product' }, { points: 25, key: 'cap', name: 'Brotherhood cap' }, { points: 40, key: 'shirt', name: 'Brotherhood shirt' }];
export const VIP_AT = 50;

export function createLoyalty({ uid, all, one, run, get, nowISO, log, mvpOn, isAdmin, inScope, bad, send, readBody }) {
  const balanceOf = cid => one('select ifnull(sum(delta),0) n from loyalty_ledger where customerId=?', cid).n;
  // points earned so far (visits and carry-over, less reversals): this decides VIP, which then stays (D-19)
  const earnedOf = cid => one("select ifnull(sum(delta),0) n from loyalty_ledger where customerId=? and kind in ('earn','reverse','carry_over','adjust')", cid).n;
  const vipSince = cid => one('select vipSince from loyalty_status where customerId=?', cid)?.vipSince || null;
  const markVip = cid => { if (!vipSince(cid) && earnedOf(cid) >= VIP_AT) run('insert or ignore into loyalty_status(customerId, vipSince) values(?,?)', cid, nowISO()); };
  const add = row => run('insert into loyalty_ledger(id,customerId,kind,delta,orderId,reward,branchId,byId,byName,reason,requestKey,warn,createdAt) values(?,?,?,?,?,?,?,?,?,?,?,?,?)',
    uid() + uid(), row.customerId, row.kind, row.delta, row.orderId || null, row.reward || null, row.branchId || null, row.byId || null, row.byName || null, row.reason || null, row.requestKey || null, row.warn ? 1 : 0, nowISO());

  // after a visit is finished or changed: one point when it is finished, given back when it is voided. Synchronous, and the unique
  // indexes stop a second earn or reverse for the same visit.
  function sync(orderId) {
    const o = get('orders', orderId); if (!o || !o.customerId) return;
    const earned = one("select * from loyalty_ledger where orderId=? and kind='earn'", o.id), reversed = one("select id from loyalty_ledger where orderId=? and kind='reverse'", o.id);
    if (o.status === 'paid' && !earned && mvpOn(o.branchId)) { add({ customerId: o.customerId, kind: 'earn', delta: 1, orderId: o.id, branchId: o.branchId, reason: `visit #${o.no}` }); markVip(o.customerId); }
    if (o.status === 'void' && earned && !reversed) {
      // a warning for the manager when the customer has redeemed since earning this point (D-19: the reward is not taken back)
      const warn = !!one("select id from loyalty_ledger where customerId=? and kind='redeem' and createdAt>=?", o.customerId, earned.createdAt);
      add({ customerId: o.customerId, kind: 'reverse', delta: -1, orderId: o.id, branchId: o.branchId, reason: `visit #${o.no} voided`, warn });
    }
  }
  const staffOnly = me => { if (!(isAdmin(me) || ['manager', 'cashier'].includes(me.role))) bad(403, 'Not allowed for your role'); };
  function view(cid) {
    const c = get('customers', cid), bal = balanceOf(cid), earned = earnedOf(cid);
    markVip(cid);
    return { customer: c ? { id: c.id, name: c.name } : { id: cid, name: '' }, balance: bal, earned, vip: !!vipSince(cid), vipSince: vipSince(cid), vipAt: VIP_AT,
      blocked: bal < 0, rewards: REWARDS.map(r => ({ ...r, reachable: bal >= r.points })),
      history: all('select * from loyalty_ledger where customerId=? order by createdAt desc, rowid desc limit 200', cid).map(e => ({ id: e.id, kind: e.kind, delta: e.delta, reward: e.reward || '', reason: e.reason || '', by: e.byName || '', at: e.createdAt })) };
  }

  async function handle({ req, res, p, q, method, me }) {
    const cm = p.match(/^\/api\/loyalty\/customers\/(\w+)(\/redeem)?$/);
    if (cm && method === 'GET' && !cm[2]) {   // the front desk, managers and the owner, in any branch (D-19)
      staffOnly(me); if (!get('customers', cm[1])) bad(404, 'Customer not found');
      return send(res, 200, view(cm[1]));
    }
    if (p === '/api/loyalty/warnings' && method === 'GET') {   // T37: visits voided after the customer redeemed; for managers and the owner
      if (!isAdmin(me) && me.role !== 'manager') bad(403, 'Not allowed for your role');
      const br = q.branch && q.branch !== 'all' ? String(q.branch) : null;
      if (br && !inScope(me, br)) bad(403, 'Not your branch');
      if (!br && !isAdmin(me)) bad(400, 'Choose a branch');
      const rows = all(`select e.*, c.name customerName, o.no orderNo, o.date orderDate from loyalty_ledger e left join customers c on c.id=e.customerId left join orders o on o.id=e.orderId
        where e.kind='reverse' and e.warn=1${br ? ' and e.branchId=?' : ''} order by e.createdAt desc limit 100`, ...(br ? [br] : []));
      return send(res, 200, rows.filter(e => inScope(me, e.branchId)).map(e => ({ id: e.id, customerId: e.customerId, customerName: e.customerName || '', orderNo: e.orderNo, orderDate: e.orderDate, at: e.createdAt, reason: e.reason, balance: balanceOf(e.customerId) })));
    }
    if (cm && method === 'POST' && cm[2]) {   // T36: staff redeem a reward for the customer, with a balance check; counted once per request key
      staffOnly(me);
      const b = await readBody(req), c = get('customers', cm[1]); if (!c) bad(404, 'Customer not found');
      const r = REWARDS.find(x => x.key === b.reward || x.points === Number(b.reward)); if (!r) bad(400, 'Choose a reward');
      const key = String(b.requestKey || ''); if (!/^[\w-]{8,64}$/.test(key)) bad(400, 'Missing request key');
      // from here on there is no await, so the balance check and the insert run as one step
      const same = one('select * from loyalty_ledger where requestKey=?', key);
      if (same) { if (same.customerId !== c.id) bad(409, 'That request key was already used'); return send(res, 200, { ok: true, again: true, balance: balanceOf(c.id) }); }
      const bal = balanceOf(c.id);
      if (bal < 0) bad(409, `This customer's points are below zero (${bal}) after a cancelled visit. No reward until the balance is positive again.`);
      if (bal < r.points) bad(409, `Not enough points: ${bal} of ${r.points}.`);
      add({ customerId: c.id, kind: 'redeem', delta: -r.points, reward: r.name, branchId: me.branchId || (me.branchIds || [])[0] || '', byId: me.id, byName: me.name, reason: `${r.name} (${r.points} points)`, requestKey: key });
      log(me, 'loyalty-redeemed', 'customers', c.id, `${c.name}: ${r.name} (${r.points} points)`);
      return send(res, 201, { ok: true, reward: r.name, balance: balanceOf(c.id) });
    }
    return NEXT;
  }
  return { sync, view, balanceOf, handle };
}
