// Service records (T28, T29): the completed visit as the shop's internal record. Not a receipt and not an accounting record.
// Verify a payment (D-15: optional), and corrections through adjustments with approval (D-9): a record is never edited in place.
import { NEXT } from '../lib/http.js';
import { INTERNAL_LABEL as LABEL, csvCell as cell } from '../lib/reports.js';

const KINDS = ['amount', 'method', 'barber', 'void'];
const PAY_METHODS = ['Cash', 'GCash', 'Maya', 'Card', 'Bank transfer', 'Other'];
const peso = n => '₱' + Number(n || 0).toLocaleString('en-PH');

export function createRecordRoutes({ syncCommission, uid, all, one, run, get, nowISO, log, orderEvent, isAdmin, inScope, branchOrAll, dayLocked, jp, r2, bad, send, readBody }) {
  const view = a => ({ id: a.id, orderId: a.orderId, kind: a.kind, before: jp(a.before), after: jp(a.after), reason: a.reason, status: a.status, requestedBy: a.requestedBy, createdAt: a.createdAt, decidedBy: a.decidedBy || '', decidedAt: a.decidedAt || '', note: a.note || '' });
  const methodOf = o => (jp(o.tenders)[0] || {}).method || '';
  const staffName = id => get('staff', id)?.name || '';
  // what the record looks like now, for the field being corrected
  const current = (o, kind) => kind === 'amount' ? { total: r2(o.total) } : kind === 'method' ? { method: methodOf(o) } : kind === 'barber' ? { barberId: o.barberId || '', name: staffName(o.barberId) } : { status: o.status };
  // what a correction changes, in words
  const describe = a => { const before = jp(a.before), after = jp(a.after); return a.kind === 'amount' ? `amount ${peso(before.total)} → ${peso(after.total)}` : a.kind === 'method' ? `payment method ${before.method} → ${after.method}` : a.kind === 'barber' ? `barber ${before.name || 'none'} → ${after.name}` : 'voided'; };
  // the correction takes effect: the change, one history row, one activity row
  function apply(a, me) {
    const o = get('orders', a.orderId); if (!o || o.status !== 'paid') bad(409, 'This record is no longer open for corrections');
    if (dayLocked && dayLocked(o.branchId, o.date)) bad(409, "This record is already in the day's sales reading, so it can no longer be corrected.");
    const after = jp(a.after);
    // the record must still be as it was when the correction was asked for; otherwise it is asked again with the new value
    if (JSON.stringify(current(o, a.kind)) !== a.before) bad(409, 'The record changed after this correction was asked for. Reject it and ask again.');
    if (a.kind === 'barber') { const s = get('staff', after.barberId); if (!s || s.branchId !== o.branchId || !s.active) bad(409, 'That barber is no longer active in this branch.'); }
    if (a.kind === 'amount') {   // the payment and the discount follow the new amount, so every report adds up the same way
      const tenders = jp(o.tenders), old = r2(o.total), nt = after.total;
      let left = nt; const scaled = tenders.map((t, i) => { const v = i === tenders.length - 1 ? r2(left) : r2(old ? t.amount * nt / old : 0); left = r2(left - v); return { ...t, amount: v }; });
      const subtotal = Math.max(r2(o.subtotal), nt);
      run("update orders set total=?, subtotal=?, discountAmt=?, tenders=?, payStatus='reported', verifiedBy='', verifiedAt='' where id=? and status='paid'", nt, subtotal, r2(subtotal - nt), JSON.stringify(scaled), o.id);
    }
    if (a.kind === 'method') run("update orders set tenders=?, payStatus='reported', verifiedBy='', verifiedAt='' where id=?", JSON.stringify([{ method: after.method, amount: r2(o.total) }]), o.id);
    if (a.kind === 'barber') run('update orders set barberId=? where id=?', after.barberId, o.id);
    if (a.kind === 'void') {
      run("update orders set status='void', voidReason=? where id=? and status='paid'", a.reason, o.id);
      run("update record_adjustments set status='rejected', decidedBy=?, decidedAt=?, note='The record was voided.' where orderId=? and status='requested' and id<>?", me.name, nowISO(), o.id, a.id);
    }
    const what = describe(a);
    orderEvent(o.id, 'completed', a.kind === 'void' ? 'cancelled' : 'completed', me.name, `${what}: ${a.reason}`);
    syncCommission(o.id, `${what}: ${a.reason}`, a.id);   // T33: a correcting commission entry when the commission changes
    log(me, 'record-corrected', 'orders', o.id, `#${o.no} ${what} (${a.reason}); asked by ${a.requestedBy}`);
  }
  // the whole correction, or none of it
  const atomic = fn => { run('begin immediate'); try { const r = fn(); run('commit'); return r; } catch (e) { try { run('rollback'); } catch { } throw e; } };
  // may this person decide on a correction? The owner and admins; the branch manager, never for his own request (D-9)
  const canDecide = (me, a) => isAdmin(me) || (me.role === 'manager' && inScope(me, a.branchId) && a.requestedById !== me.id);

  return async function handle({ req, res, p, q, method, me, manageIn }) {
    const vm = p.match(/^\/api\/records\/(\w+)\/verify$/);
    if (vm && method === 'POST') {   // D-9: the owner, an admin, or the branch manager (never a visit he recorded himself)
      const o = get('orders', vm[1]); if (!o) bad(404, 'Visit not found');
      manageIn(o.branchId, { submittedById: o.cashierId, staffId: o.barberId });   // nor a visit he cut himself (his own pay)
      if (o.status !== 'paid') bad(409, 'Only a finished visit can be verified');
      if (o.payStatus === 'verified') bad(409, `Already verified by ${o.verifiedBy || 'someone'}.`);
      if (Number(run("update orders set payStatus='verified', verifiedBy=?, verifiedAt=? where id=? and status='paid' and ifnull(payStatus,'')<>'verified'", me.name, nowISO(), o.id).changes) !== 1) bad(409, 'This record just changed. Please refresh.');
      orderEvent(o.id, 'completed', 'completed', me.name, 'payment verified');
      log(me, 'record-verified', 'orders', o.id, `#${o.no} ₱${o.total}`);
      return send(res, 200, { ok: true });
    }

    // ----- reconciliation export (T31): every finished record in the range, voids included, with its corrections; audited -----
    if (p === '/api/records/export' && method === 'GET') {
      if (!isAdmin(me) && me.role !== 'manager') bad(403, 'Only the owner, admins and managers can export records');
      const br = branchOrAll(me, q.branch), day = /^\d{4}-\d{2}-\d{2}$/;
      const to = day.test(q.to || '') ? q.to : nowISO().slice(0, 10), from = day.test(q.from || '') ? q.from : to;
      if (from > to || (Date.parse(to) - Date.parse(from)) / 864e5 > 366) bad(400, 'Choose at most one year');
      const os = all(`select o.*, b.name branchName, s.name barberName from orders o left join branches b on b.id=o.branchId left join staff s on s.id=o.barberId
        where (o.status='paid' or (o.status='void' and o.paidAt is not null and o.paidAt<>'')) and o.date>=? and o.date<=?${br ? ' and o.branchId=?' : ''} order by o.date, o.no`, ...(br ? [from, to, br] : [from, to]));
      const adj = new Map(); for (const a of all(`select * from record_adjustments where orderId in (select id from orders where date>=? and date<=?) order by createdAt`, from, to)) (adj.get(a.orderId) || adj.set(a.orderId, []).get(a.orderId)).push(a);
      const branchName = br ? get('branches', br)?.name || '' : 'All branches';
      const lines = [cell(LABEL), [`Branch: ${branchName}`, `From: ${from}`, `To: ${to}`].map(cell).join(','), '',
        ['Visit', 'Date', 'Branch', 'Barber', 'Source', 'Services', 'Amount', 'Payment method', 'Payment status', 'Record status', 'BIR invoice no.', 'Adjustments'].join(','),
        ...os.map(o => [o.no, o.date, o.branchName || '', o.barberName || '', o.source === 'appointment' ? 'Appointment' : 'Walk-in',
          jp(o.items).map(i => i.name + (i.qty > 1 ? ' x' + i.qty : '')).join(', '), r2(o.total), methodOf(o), o.payStatus || 'reported', o.status === 'void' ? 'void' : 'completed', o.invoiceNo || '',
          (adj.get(o.id) || []).map(a => `${describe(a)} (${a.status}${a.decidedBy ? ' by ' + a.decidedBy : ''}; asked by ${a.requestedBy}): ${a.reason}`).join('; ')].map(cell).join(','))];
      log(me, 'records-exported', 'orders', '', `${branchName} ${from} to ${to}: ${os.length} records`);
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="records-${from}_${to}.csv"`, 'Cache-Control': 'no-store' });
      return res.end('﻿' + lines.join('\r\n') + '\r\n');
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
      if (dayLocked && dayLocked(o.branchId, o.date)) bad(409, "This record is already in the day's sales reading, so it can no longer be corrected.");
      if (kind === 'amount') { const v = typeof b.after === 'number' ? b.after : (typeof b.after === 'string' && b.after.trim() !== '' ? Number(b.after) : NaN); if (!Number.isFinite(v) || v < 0 || v > 100000) bad(400, 'Enter the correct amount'); after = { total: r2(v) }; }
      if (kind === 'method') { if (!PAY_METHODS.includes(b.after)) bad(400, 'Choose the payment method'); if (jp(o.tenders).length > 1) bad(409, 'This visit was paid in parts. Void it and record it again.'); after = { method: b.after }; }
      if (kind === 'barber') { const s = get('staff', String(b.after || '')); if (!s || s.branchId !== o.branchId || !s.active) bad(400, 'Choose an active barber of this branch'); after = { barberId: s.id, name: s.name }; }
      if (kind === 'void') after = { status: 'void' };
      if (kind !== 'void' && JSON.stringify(after) === JSON.stringify(Object.fromEntries(Object.entries(current(o, kind)).filter(([k]) => k in after)))) bad(400, 'That is already the value on the record');      const a = { id: uid() + uid(), orderId: o.id, branchId: o.branchId, kind, before: JSON.stringify(current(o, kind)), after: JSON.stringify(after), reason, status: 'requested', requestedById: me.id, requestedBy: me.name, createdAt: nowISO() };
      atomic(() => {
        run('insert into record_adjustments(id,orderId,branchId,kind,before,after,reason,status,requestedById,requestedBy,createdAt) values(?,?,?,?,?,?,?,?,?,?,?)', a.id, a.orderId, a.branchId, a.kind, a.before, a.after, a.reason, a.status, a.requestedById, a.requestedBy, a.createdAt);
        log(me, 'record-correction-asked', 'orders', o.id, `#${o.no} ${kind}: ${reason}`);
        if (isAdmin(me)) {   // the owner's and admins' own corrections take effect at once
          apply(a, me); run("update record_adjustments set status='approved', decidedBy=?, decidedAt=? where id=?", me.name, nowISO(), a.id);
        }
      });
      return send(res, 201, { adjustment: view(one('select * from record_adjustments where id=?', a.id)) });
    }
    if (am && method === 'GET' && am[2] === 'adjustments') {
      if (me.role === 'barber') bad(403, 'Not allowed for your role');
      const o = get('orders', am[1]); if (!o) bad(404, 'Visit not found'); if (!inScope(me, o.branchId)) bad(403, 'Not your branch');
      return send(res, 200, all('select * from record_adjustments where orderId=? order by createdAt', o.id).map(view));
    }
    if (p === '/api/adjustments' && method === 'GET' && q.status) {   // corrections waiting (or decided), for the branches this person sees
      if (me.role === 'barber') bad(403, 'Not allowed for your role');
      const br = branchOrAll(me, q.branch), st = ['requested', 'approved', 'rejected'].includes(q.status) ? q.status : 'requested';
      return send(res, 200, all(`select * from record_adjustments where status=?${br ? ' and branchId=?' : ''} order by createdAt desc limit 200`, ...(br ? [st, br] : [st])).filter(a => inScope(me, a.branchId)).map(a => ({ ...view(a), canDecide: canDecide(me, a) })));
    }
    const dm = p.match(/^\/api\/adjustments\/(\w+)\/approve$/);
    if (dm && method === 'POST') {   // D-9: approve or reject
      const b = await readBody(req), a = one('select * from record_adjustments where id=?', dm[1]); if (!a) bad(404, 'Correction not found');
      const ord = get('orders', a.orderId) || {}, to = a.kind === 'barber' ? jp(a.after).barberId : '';
      manageIn(a.branchId, { submittedById: a.requestedById, staffId: ord.barberId });   // never his own request, nor a visit that pays him
      if (to) manageIn(a.branchId, { staffId: to });
      if (a.status !== 'requested') bad(409, `This correction was already ${a.status}${a.decidedBy ? ' by ' + a.decidedBy : ''}.`);
      const note = String(b.note || '').trim().slice(0, 300);
      const yes = b.approve === true; if (!yes && b.approve !== false) bad(400, 'Approve or reject');
      if (!yes && !note) bad(400, 'Write why the correction is rejected');
      atomic(() => {
        if (yes) apply(a, me);
        if (Number(run("update record_adjustments set status=?, decidedBy=?, decidedAt=?, note=? where id=? and status='requested'", yes ? 'approved' : 'rejected', me.name, nowISO(), note, a.id).changes) !== 1) bad(409, 'This correction was just decided by someone else.');
        if (!yes) log(me, 'record-correction-rejected', 'orders', a.orderId, `${a.kind}: ${note}`);
      });
      return send(res, 200, { adjustment: view(one('select * from record_adjustments where id=?', a.id)) });
    }
    return NEXT;
  };
}
