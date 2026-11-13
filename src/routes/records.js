// Service records (T28, T29): the completed visit as the shop's internal record. Not a receipt and not an accounting record.
// Verify a payment (D-15: optional), and corrections through adjustments with approval (D-9).
import { NEXT } from '../lib/http.js';

export function createRecordRoutes({ run, get, nowISO, log, orderEvent, bad, send }) {
  return async function handle({ res, p, method, me, manageIn }) {
    const vm = p.match(/^\/api\/records\/(\w+)\/verify$/);
    if (vm && method === 'POST') {   // D-9: the owner, an admin, or the branch manager (never a visit he recorded himself)
      const o = get('orders', vm[1]); if (!o) bad(404, 'Visit not found');
      manageIn(o.branchId, { submittedById: o.cashierId });
      if (o.status !== 'paid') bad(409, 'Only a finished visit can be verified');
      if (o.payStatus === 'verified') bad(409, `Already verified by ${o.verifiedBy || 'someone'}.`);
      if (Number(run("update orders set payStatus='verified', verifiedBy=?, verifiedAt=? where id=? and status='paid' and ifnull(payStatus,'')<>'verified'", me.name, nowISO(), o.id).changes) !== 1) bad(409, 'This record just changed. Please refresh.');
      orderEvent(o.id, 'completed', 'completed', me.name, 'payment verified');
      log(me, 'record-verified', 'orders', o.id, `#${o.no} ₱${o.total}`);
      return send(res, 200, { ok: true });
    }
    return NEXT;
  };
}
