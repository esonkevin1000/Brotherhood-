// Service records (T28, T29): the completed visit as the shop's internal record. Not a receipt and not an accounting record.
// Verify a payment (D-15: optional), and corrections through adjustments with approval (D-9): a record is never edited in place.
import { NEXT } from '../lib/http.js';

const KINDS = ['amount', 'method', 'barber', 'void'];
const PAY_METHODS = ['Cash', 'GCash', 'Maya', 'Card', 'Bank transfer', 'Other'];
const peso = n => '₱' + Number(n || 0).toLocaleString('en-PH');

export function createRecordRoutes({ uid, all, one, run, get, nowISO, log, orderEvent, isAdmin, inScope, branchOrAll, dayLocked, jp, r2, bad, send, readBody }) {
  const view = a => ({ id: a.id, orderId: a.orderId, kind: a.kind, before: jp(a.before), after: jp(a.after), reason: a.reason, status: a.status, requestedBy: a.requestedBy, createdAt: a.createdAt, decidedBy: a.decidedBy || '', decidedAt: a.decidedAt || '', note: a.note || '' });
  const methodOf = o => (jp(o.tenders)[0] || {}).method || '';
  const staffName = id => get('staff', id)?.name || '';
  // what the record looks like now, for the field being corrected
  const current = (o, kind) => kind === 'amount' ? { total: r2(o.total) } : kind === 'method' ? { method: methodOf(o) } : kind === 'barber' ? { barberId: o.barberId || '', name: staffName(o.barberId) } : { status: o.status };
  // the correction takes effect: the change, one history row, one activity row
  function apply(a, me) {
    const o = get('orders', a.orderId); if (!o || o.status !== 'paid') bad(409, 'This record is no longer open for corrections');
    if (dayLocked && dayLocked(o.branchId, o.date)) bad(409, "This record is already in the day's sales reading, so it can no longer be corrected.");
    const before = jp(a.before), after = jp(a.after);
    if (a.kind === 'amount') run('update orders set total=? where id=? and status=?', after.total, o.id, 'paid');
    if (a.kind === 'method') run('update orders set tenders=? where id=?', JSON.stringify([{ method: after.method, amount: r2(o.total) }]), o.id);
    if (a.kind === 'barber') run('update orders set barberId=? where id=?', after.barberId, o.id);
    if (a.kind === 'void') run("update orders set status='void', voidReason=? where id=? and status='paid'", a.reason, o.id);
    const what = a.kind === 'amount' ? `amount ${peso(before.total)} → ${peso(after.total)}` : a.kind === 'method' ? `payment method ${before.method} → ${after.method}` : a.kind === 'barber' ? `barber ${before.name || 'none'} → ${after.name}` : 'voided';
    orderEvent(o.id, 'completed', a.kind === 'void' ? 'cancelled' : 'completed', me.name, `${what}: ${a.reason}`);
    log(me, 'record-corrected', 'orders', o.id, `#${o.no} ${what} (${a.reason}); asked by ${a.requestedBy}`);
  }
  // may this person decide on a correction? The owner and admins; the branch manager, never for his own request (D-9)
  const canDecide = (me, a) => isAdmin(me) || (me.role === 'manager' && inScope(me, a.branchId) && a.requestedById !== me.id);

  return async function handle({ req, res, p, q, method, me, manageIn }) {
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

    // ----- corrections (T29) -----
    const am = p.match(/^\/api\/records\/(\w+)\/(adjust|adjustments)$/);
    if (am && method === 'POST' && am[2] === 'adjust') {   // the front desk, a manager or the owner asks for a correction, with a reason
      if (me.role === 'barber') bad(403, 'Ask the front desk to correct a record');
      const b = await readBody(req), o = get('orders', am[1]); if (!o) bad(404, 'Visit not found');
      if (!inScope(me, o.branchId)) bad(403, 'Not your branch');
      const kind = String(b.kind || ''); if (!KINDS.includes(kind)) bad(400, 'Choose what to correct: amount, payment method, barber, or void');
      const reason = String(b.reason || '').trim().slice(0, 300); if (reason.length < 3) bad(400, 'Write the reason for the correction');
      if (o.status !== 'paid') bad(409, o.status === 'void' ? 'This record is already void' : 'Only a finished visit can be corrected');
      let after;
      if (kind === 'amount') { const v = Number(b.after); if (!(v >= 0) || v > 100000) bad(400, 'Enter the correct amount'); after = { total: r2(v) }; }
      if (kind === 'method') { if (!PAY_METHODS.includes(b.after)) bad(400, 'Choose the payment method'); after = { method: b.after }; }
      if (kind === 'barber') { const s = get('staff', String(b.after || '')); if (!s || s.branchId !== o.branchId) bad(400, 'Choose a barber of this branch'); after = { barberId: s.id, name: s.name }; }
      if (kind === 'void') after = { status: 'void' };
      const a = { id: uid() + uid(), orderId: o.id, branchId: o.branchId, kind, before: JSON.stringify(current(o, kind)), after: JSON.stringify(after), reason, status: 'requested', requestedById: me.id, requestedBy: me.name, createdAt: nowISO() };
      run('insert into record_adjustments(id,orderId,branchId,kind,before,after,reason,status,requestedById,requestedBy,createdAt) values(?,?,?,?,?,?,?,?,?,?,?)', a.id, a.orderId, a.branchId, a.kind, a.before, a.after, a.reason, a.status, a.requestedById, a.requestedBy, a.createdAt);
      log(me, 'record-correction-asked', 'orders', o.id, `#${o.no} ${kind}: ${reason}`);
      if (isAdmin(me)) {   // the owner's and admins' own corrections take effect at once
        apply(a, me); run("update record_adjustments set status='approved', decidedBy=?, decidedAt=? where id=?", me.name, nowISO(), a.id);
      }
      return send(res, 201, { adjustment: view(one('select * from record_adjustments where id=?', a.id)) });
    }
    if (am && method === 'GET' && am[2] === 'adjustments') {
      const o = get('orders', am[1]); if (!o) bad(404, 'Visit not found'); if (!inScope(me, o.branchId)) bad(403, 'Not your branch');
      return send(res, 200, all('select * from record_adjustments where orderId=? order by createdAt', o.id).map(view));
    }
    if (p === '/api/adjustments' && method === 'GET' && q.status) {   // corrections waiting (or decided), for the branches this person sees
      const br = branchOrAll(me, q.branch), st = ['requested', 'approved', 'rejected'].includes(q.status) ? q.status : 'requested';
      return send(res, 200, all(`select * from record_adjustments where status=?${br ? ' and branchId=?' : ''} order by createdAt desc limit 200`, ...(br ? [st, br] : [st])).filter(a => inScope(me, a.branchId)).map(a => ({ ...view(a), canDecide: canDecide(me, a) })));
    }
    const dm = p.match(/^\/api\/adjustments\/(\w+)\/approve$/);
    if (dm && method === 'POST') {   // D-9: approve or reject
      const b = await readBody(req), a = one('select * from record_adjustments where id=?', dm[1]); if (!a) bad(404, 'Correction not found');
      manageIn(a.branchId, { submittedById: a.requestedById });
      if (a.status !== 'requested') bad(409, `This correction was already ${a.status}${a.decidedBy ? ' by ' + a.decidedBy : ''}.`);
      const note = String(b.note || '').trim().slice(0, 300);
      if (b.approve) apply(a, me); else if (!note) bad(400, 'Write why the correction is rejected');
      if (Number(run("update record_adjustments set status=?, decidedBy=?, decidedAt=?, note=? where id=? and status='requested'", b.approve ? 'approved' : 'rejected', me.name, nowISO(), note, a.id).changes) !== 1) bad(409, 'This correction was just decided by someone else.');
      if (!b.approve) log(me, 'record-correction-rejected', 'orders', a.orderId, `${a.kind}: ${note}`);
      return send(res, 200, { adjustment: view(one('select * from record_adjustments where id=?', a.id)) });
    }
    return NEXT;
  };
}
