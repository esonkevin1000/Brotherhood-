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
    return NEXT;
  }
  return { sync, view, balanceOf, handle };
}
