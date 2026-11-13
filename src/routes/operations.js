// Daily operations: end-of-day cash turnover (remittance), picture upload, bookings at the front desk and in the back office,
// the reports route, and the old POS (retired; kept for its history and the frozen screens).
// Created once by server.js; the handler gets the request and the logged-in person on each call.
import os from 'node:os';
import { NEXT } from '../lib/http.js';
import { INTERNAL_LABEL } from '../lib/reports.js';

export function createOperationsRoutes({ syncCommission, isAppt, walkinGuard, orderPlan, orderEvent, bookingPlan, bookingMessage, rescheduleBooking, db, uid, dOf, todayStr, nowISO, r2, jp, minsOfDay, toMin, sum, all, one, run, get, parseOrder, insert, update, log, isBranchUser, isManager, inScope, branchOrAll, modulesFor, needAny, branchScope, dayLocked, openTickets, openShift, priceItems, idNeeded, attachIdPhoto, totals, onDuty, staffState, promoteNext, checkAssign, zData, getSetting, withCust, findCustomer, upsertCustomer, resolveCustomer, createTicket, dayRows, cashierName, planDeductions, adjTotal, BH, bookingEvent, priceBooked, bookedSnap, createBooking, bookingView, REPORTS, csv, snapOf, bad, send, readBody }) {
  // returns NEXT when none of these routes matched
  return async function handle({ req, res, url, p, method, q, me, admin, adminOnly, manageIn }) {
    // ----- daily sales remittance (separate from expenses) -----
    const remitCalc = (branchId, date) => {
      const os = all("select * from orders where branchId=? and date=? and status='paid'", branchId, date).map(parseOrder), tender = {};
      for (const o of os) for (const t of o.tenders) tender[t.method] = r2((tender[t.method] || 0) + t.amount);
      const mv = all('select * from cash_moves where branchId=? and date=?', branchId, date);
      const cashSales = tender.Cash || 0, gcash = tender.GCash || 0, maya = tender.Maya || 0, posSales = r2(sum(os, o => o.total));
      const other = r2(Object.entries(tender).filter(([k]) => !['Cash', 'GCash', 'Maya'].includes(k)).reduce((s, [, v]) => s + v, 0));
      const cashIn = r2(sum(mv.filter(m => m.kind === 'in'), m => m.amount)), cashExpenses = r2(sum(mv.filter(m => m.kind !== 'in'), m => m.amount));
      return { branchId, date, posSales, cashSales: r2(cashSales), gcashSales: r2(gcash), mayaSales: r2(maya), otherSales: other, cashIn, cashExpenses, expected: r2(cashSales + cashIn - cashExpenses), orders: os.length };
    };
    const remitView = r => ({ ...r, history: jp(r.history), branchName: get('branches', r.branchId)?.name || '' });
    if (p === '/api/remittances/preview' && method === 'GET') {
      const branchId = branchScope(me, q.branch), date = /^\d{4}-\d{2}-\d{2}$/.test(q.date || '') ? q.date : todayStr();
      return send(res, 200, { ...remitCalc(branchId, date), existing: all("select id,status from remittances where branchId=? and date=? and status<>'REJECTED'", branchId, date) });
    }
    if (p === '/api/remittances' && method === 'GET') {
      const from = /^\d{4}-\d{2}-\d{2}$/.test(q.from || '') ? q.from : '2000-01-01', to = /^\d{4}-\d{2}-\d{2}$/.test(q.to || '') ? q.to : '2099-12-31';
      const br = branchOrAll(me, q.branch), st = ['PENDING', 'VERIFIED', 'FLAGGED', 'REJECTED'].includes(q.status) ? q.status : null;
      const rows = all(`select * from remittances where date>=? and date<=?${br ? ' and branchId=?' : ''}${st ? ' and status=?' : ''} order by date desc, createdAt desc limit 500`, from, to, ...(br ? [br] : []), ...(st ? [st] : [])).map(remitView);
      return send(res, 200, { rows, totals: { count: rows.length, actual: r2(sum(rows, r => r.actual)), expected: r2(sum(rows, r => r.expected)), variance: r2(sum(rows, r => r.variance)) } });
    }
    if (p === '/api/remittances' && method === 'POST') {
      const b = await readBody(req), branchId = branchScope(me, b.branchId), date = String(b.date || todayStr());
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayStr() || date < dOf(new Date(Date.now() - 14 * 864e5))) bad(400, 'The business date must be today or within the last 14 days');
      const actual = Number(b.actual); if (!Number.isFinite(actual) || actual < 0) bad(400, 'Enter the actual amount remitted (0 or more)');
      const proof = get('files', String(b.proofId || '')); if (!proof || proof.branchId !== branchId) bad(400, 'Take a photo of the deposit slip or remittance proof first');
      const responsible = String(b.responsible || me.name).trim().slice(0, 100); if (!responsible) bad(400, 'Enter the person responsible');
      if (one("select 1 x from remittances where branchId=? and date=? and status<>'REJECTED'", branchId, date)) bad(409, 'A remittance for this branch and date was already submitted. Ask the owner to reject it first if it must be redone.');
      const c = remitCalc(branchId, date), variance = r2(actual - c.expected), off = Math.abs(variance) >= 1;
      const flag = off ? `Auto-flagged: remitted ${variance < 0 ? 'short by' : 'over by'} ₱${Math.abs(variance).toFixed(2)}` : '', id = uid();
      const hist = [{ at: nowISO(), by: me.name, action: 'SUBMITTED', note: String(b.notes || '').slice(0, 300) }]; if (off) hist.push({ at: nowISO(), by: 'System', action: 'FLAGGED', note: flag });
      run(`insert into remittances(id,branchId,date,posSales,cashSales,gcashSales,mayaSales,otherSales,cashIn,cashExpenses,expected,actual,variance,responsible,proofId,notes,status,flagReason,submittedById,submittedBy,createdAt,history)
      values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, branchId, date, c.posSales, c.cashSales, c.gcashSales, c.mayaSales, c.otherSales, c.cashIn, c.cashExpenses, c.expected, r2(actual), variance, responsible, proof.id,
        String(b.notes || '').slice(0, 500), off ? 'FLAGGED' : 'PENDING', flag, me.id, me.name, nowISO(), JSON.stringify(hist));
      log(me, 'remittance', 'remittances', id, `${date} expected ${c.expected} actual ${r2(actual)}`); return send(res, 201, remitView(get('remittances', id)));
    }
    const rmv = p.match(/^\/api\/remittances\/(\w+)\/review$/);
    if (rmv && method === 'PUT') {
      const r = get('remittances', rmv[1]); if (!r) bad(404, 'Not found'); manageIn(r.branchId, r);
      const b = await readBody(req), act = { verify: 'VERIFIED', flag: 'FLAGGED', reject: 'REJECTED' }[b.action], note = String(b.note || '').trim().slice(0, 300);
      if (!act) bad(400, 'Choose verify, flag or reject'); if (act !== 'VERIFIED' && !note) bad(400, 'A note is required to flag or reject a remittance');
      const hist = jp(r.history); hist.push({ at: nowISO(), by: me.name, action: act, note });
      run('update remittances set status=?, reviewedBy=?, reviewedAt=?, reviewNote=?, history=? where id=?', act, me.name, nowISO(), note, JSON.stringify(hist), r.id);
      log(me, 'remittance-' + b.action, 'remittances', r.id, note); return send(res, 200, remitView(get('remittances', r.id)));
    }
    // ----- photos (admin) -----
    if (p === '/api/upload' && method === 'POST') {
      adminOnly(); const b = await readBody(req, 1_500_000);
      const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(b.data || '')); if (!m) bad(400, 'Image must be JPEG, PNG or WebP');
      const buf = Buffer.from(m[2], 'base64'); if (buf.length > 700_000) bad(413, 'Image is too large (max about 700KB)');
      const id = uid() + uid(); run('insert into images(id,mime,data,createdAt) values(?,?,?,?)', id, m[1], buf, nowISO());
      log(me, 'upload', 'image', id, Math.round(buf.length / 1024) + ' KB'); return send(res, 201, { url: '/img/' + id });
    }

    // ----- bookings (cashier + admin) -----
    if (p === '/api/bookings' && method === 'GET') {
      const bid = branchOrAll(me, q.branch);
      const ok = s => /^\d{4}-\d{2}-\d{2}$/.test(s || ''), from = ok(q.from) ? q.from : (ok(q.date) ? q.date : todayStr()), to = ok(q.to) ? q.to : (ok(q.date) ? q.date : from);
      return send(res, 200, all(`select * from bookings where date>=? and date<=?${bid ? ' and branchId=?' : ''} order by date, time`, ...(bid ? [from, to, bid] : [from, to])).map(b => ({ ...bookingView(b), plan: bookingPlan(b.status) })));
    }
    if (p === '/api/bookings' && method === 'POST') {
      const b = await readBody(req); b.branchId = isBranchUser(me) ? me.branchId : b.branchId; if (!inScope(me, b.branchId)) bad(403, 'Not your branch');
      const bk = createBooking({ ...b, idemKey: req.headers['idempotency-key'] }, 'pos', me.name); if (bk.duplicate) return send(res, 200, bk);
      log(me, 'booking', 'bookings', bk.id, `${bk.customerName} ${bk.date} ${bk.time}`); return send(res, 201, bk);
    }
    const bkm = p.match(/^\/api\/bookings\/(\w+)(?:\/(arrive|history|reschedule))?$/);
    if (bkm) {
      const cur = one('select * from bookings where id=?', bkm[1]); if (!cur) bad(404, 'Not found');
      if (!inScope(me, cur.branchId)) bad(403, 'Not your branch');
      if (method === 'GET' && bkm[2] === 'history') return send(res, 200, all('select at, actor, fromStatus, toStatus, reason from booking_events where bookingId=? order by at, rowid', cur.id));
      if (method === 'PUT' && !bkm[2]) {
        const b = await readBody(req); if (!['cancelled', 'noshow'].includes(b.status)) bad(400, 'Bad status');
        if (cur.status !== 'booked' && !(cur.status === 'pending' && b.status === 'cancelled')) bad(409, 'Booking is already ' + cur.status);   // staff may also release a guest's hold (T16)
        if (b.status === 'noshow') {   // T19 (D-7): only after the start time plus the late grace the booking was made under
          const grace = (() => { try { const g = JSON.parse(cur.policy || 'null')?.noshowGraceMins; return Number.isFinite(g) ? g : 0; } catch { return 0; } })();
          const from = new Date(new Date(`${cur.date}T${cur.time}:00`).getTime() + grace * 60e3);
          if (Date.now() < from.getTime()) bad(409, `This customer can be marked as a no-show from ${String(from.getHours()).padStart(2, '0')}:${String(from.getMinutes()).padStart(2, '0')}${from.toDateString() === new Date().toDateString() ? '' : ' on ' + cur.date} (start time${grace ? ` + ${grace}-minute grace` : ''}).`);
        }
        if (cur.status === 'pending') run('update email_codes set guest=null, codeHash=null where bookingId=?', cur.id);
        run('update bookings set status=? where id=?', b.status, cur.id);
        if (b.status === 'cancelled' && cur.status === 'booked') bookingMessage('cancelled', cur.id);   // T20 (a released guest hold was never confirmed: no email)
       bookingEvent(cur.id, cur.status, b.status, me.name, b.reason); BH.freed(cur.branchId, cur.staffId, cur.date); if (cur.userId) BH.notify(cur.userId, 'booking', b.status === 'cancelled' ? `Your booking on ${cur.date} ${cur.time} was cancelled by the shop. Please book another time.` : `You were marked as a no-show for ${cur.date} ${cur.time}.`, '#/bookings', 'st-' + cur.id); log(me, 'booking-' + b.status, 'bookings', cur.id, cur.customerName); return send(res, 200, { ok: true });
      }
      if (method === 'POST' && bkm[2] === 'reschedule') {   // T18: staff can move a booking at any time
        const r = rescheduleBooking(cur.id, await readBody(req), me.name);
        log(me, 'booking-rescheduled', 'bookings', cur.id, `${cur.date} ${cur.time} -> ${r.booking.date} ${r.booking.time}`); BH.freed(cur.branchId, cur.staffId, cur.date);
        if (cur.userId) BH.notify(cur.userId, 'booking', `Your booking moved to ${r.booking.date} ${r.booking.time} with ${r.booking.staffName || 'any barber'}`, '#/bookings', 'rs-' + cur.id + '-' + r.booking.date + r.booking.time);
        return send(res, 200, { booking: r.booking });
      }
      if (method === 'POST' && bkm[2] === 'arrive') {
        if (cur.status !== 'booked') bad(409, 'Booking is already ' + cur.status);
        const items = priceBooked(snapOf(cur), jp(cur.itemIds).map(i => ({ itemId: i, qty: 1 })));   // the customer is charged the price that was shown when booking
        const cust = (cur.customerId && get('customers', cur.customerId)) || findCustomer(cur.phone, '') || upsertCustomer({ name: cur.customerName, phone: cur.phone }, 'online', cur.branchId);
        const o = createTicket(me, cur.branchId, cust.id, cust.name, items, cur.staffId, { booked: true });
        if (cur.promoCode) { const pr = one('select discountId from bh_promos where code=?', cur.promoCode); if (pr?.discountId) { run('update orders set discountId=? where id=?', pr.discountId, o.id); o.discountId = pr.discountId; } }   // promo from the app: the ticket opens with that discount already applied
        run("update bookings set status='arrived', orderId=? where id=?", o.id, cur.id); bookingEvent(cur.id, 'booked', 'arrived', me.name); log(me, 'booking-arrived', 'bookings', cur.id, `#${o.no} ${cur.customerName}`);
        return send(res, 200, { order: o, seated: o.status === 'in_chair' });
      }
      bad(405, 'Method not allowed');
    }

    // ----- reports -----
    const rm = p.match(/^\/api\/reports\/(\w+)$/);
    if (rm && method === 'GET') {
      if (!isManager(me)) adminOnly(); const fn = REPORTS[rm[1]]; if (!fn) bad(404, 'Unknown report');
      const br = isManager(me) ? branchOrAll(me, q.branch) : q.branch && q.branch !== 'all' && get('branches', q.branch) ? q.branch : null;   // a manager: one of their branches
      const to = /^\d{4}-\d{2}-\d{2}$/.test(q.to || '') ? q.to : todayStr(), from = /^\d{4}-\d{2}-\d{2}$/.test(q.from || '') ? q.from : to;
      const rep = fn({ from, to, br });   // T30: every report says what it is, and the filters it was run with
      rep.label = INTERNAL_LABEL;
      rep.filters = { branch: br ? get('branches', br)?.name || '' : 'All branches', from, to };
      if (q.format === 'csv') { log(me, 'report-exported', 'reports', rm[1], `${rep.filters.branch} ${from} to ${to}`); res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${rm[1]}-${from}_${to}.csv"` }); return res.end(csv(rep)); }
      return send(res, 200, rep);
    }
    if (p === '/api/payroll/pay' && method === 'POST') {
      if (!isManager(me)) adminOnly(); const b = await readBody(req), to = /^\d{4}-\d{2}-\d{2}$/.test(b.to || '') ? b.to : todayStr(), from = /^\d{4}-\d{2}-\d{2}$/.test(b.from || '') ? b.from : '2000-01-01'; let n = 0;
      // a manager pays only barbers of their branches, never themselves, and only when every unpaid day and extra is in their branches
      if (isManager(me)) for (const sid of Array.isArray(b.staffIds) ? b.staffIds.map(String) : []) {
        manageIn(get('staff', sid)?.branchId, { staffId: sid });
        const other = dayRows('2000-01-01', to, null).some(x => x.staffId === sid && !x.paidAt && x.date >= from && !inScope(me, x.branchId)) || all('select branchId from staff_adjustments where staffId=? and payrollDate is null and date<=?', sid, to).some(a => !inScope(me, a.branchId));
        if (other) bad(409, `${get('staff', sid)?.name || 'This barber'} also has unpaid days or extras at another branch. Ask the owner or an admin to pay out.`);
      }
      for (const sid of Array.isArray(b.staffIds) ? b.staffIds : []) {
        const days = dayRows('2000-01-01', to, null).filter(x => x.staffId === sid && !x.paidAt && x.date >= from).sort((x, y) => x.date.localeCompare(y.date)); if (!days.length) continue;
        const bonus = adjTotal(sid, to), plan = planDeductions(sid, to, r2(sum(days, x => x.commission + x.topup + x.lunch - x.advance) + bonus)), last = days[days.length - 1].date;
        db.exec('begin');
        try {
          for (const d of days) { run('insert or ignore into payroll_days(staffId,date,branchId,commission,topup,lunch,advance,paidAt,paidBy) values(?,?,?,?,?,?,?,?,?)', sid, d.date, d.branchId, d.commission, d.topup, d.lunch || 0, d.advance, nowISO(), me.name); n++; }
          let applied = 0;
          for (const d of plan.list) { if (Number(run("update advance_deductions set status='APPLIED', appliedAt=?, payrollDate=? where id=? and status='SCHEDULED'", nowISO(), last, d.id).changes) === 1) applied = r2(applied + d.amount); }
          if (bonus) run('update staff_adjustments set payrollDate=? where staffId=? and payrollDate is null and date<=?', last, sid, to);
          if (applied || bonus) run('update payroll_days set deduction=?, extra=? where staffId=? and date=?', applied, bonus, sid, last);
          db.exec('commit');
        } catch (e) { db.exec('rollback'); throw e; }
      }
      log(me, 'payroll-paid', 'payroll', '', `${n} barber-days up to ${to}`);
      return send(res, 200, { ok: true, days: n });
    }
    if (p === '/api/live' && method === 'GET') {
      const br = branchOrAll(me, q.branch), t = todayStr();
      const duty = all(`select a.*, s.name from attendance a join staff s on s.id=a.staffId where a.date=? and a.timeOut is null and ifnull(a.status,'present')='present'${br ? ' and a.branchId=?' : ''}`, ...(br ? [t, br] : [t]));
      const onBreak = duty.filter(d => d.breakStartedAt).length;
      const queue = all(`select o.*, b.name branchName, s.name barberName from orders o left join branches b on b.id=o.branchId left join staff s on s.id=o.barberId
      where o.date=? and o.status in ('waiting','in_chair')${br ? ' and o.branchId=?' : ''} order by o.branchId, o.no`, ...(br ? [t, br] : [t])).map(parseOrder);
      const cutting = queue.filter(o => o.status === 'in_chair'), waiting = queue.filter(o => o.status === 'waiting');
      const wait = waiting.length ? Math.max(...waiting.map(o => Math.round((Date.now() - new Date(o.createdAt)) / 60000))) : 0;
      return send(res, 200, {
        onDuty: duty.length, onBreak, cutting: cutting.length, available: Math.max(0, duty.length - cutting.length - onBreak), waiting: waiting.length, longestWaitMin: wait,
        queue: queue.map(o => ({ id: o.id, no: o.no, branch: o.branchName, customer: o.customerName, services: o.items.map(i => i.name).join(', '), status: o.status, barber: o.barberName || '', since: o.startedAt || o.createdAt }))
      });
    }

    // ----- POS (cashier + admin) -----
    if (p === '/api/pos/bootstrap' && method === 'GET') {
      const bid = branchScope(me, q.branch), t = todayStr();
      return send(res, 200, {
        branch: get('branches', bid), chairs: all('select * from chairs where branchId=? and active=1 order by sort', bid),
        staff: all('select id,name,chairId,pct,photo from staff where branchId=? and active=1 order by name', bid).map(s => ({ ...s, onDuty: !!onDuty(s.id, t), ...staffState(s.id, t) })),
        categories: all('select * from categories order by name'), items: all('select * from items where active=1 order by name'), discounts: all('select * from discounts where active=1 order by name'),
        shift: openShift(bid) || null, locked: !!dayLocked(bid, t), zNo: dayLocked(bid, t)?.no || 0, settings: { attPhoto: getSetting('attPhoto') !== '0', attGeo: getSetting('attGeo') === '1' },
        queue: all("select * from orders where branchId=? and date=? and status in ('waiting','in_chair') order by no", bid, t).map(parseOrder).map(withCust)
      });
    }
    if (p === '/api/pos/dashboard' && method === 'GET') {
      const bid = branchScope(me, q.branch), t = todayStr();
      // a barber's dashboard shows only their own sales (never the whole shop's)
      const mySid = me.role === 'barber' ? (get('users', me.id)?.staffId || '-') : '';
      const paid = all("select * from orders where branchId=? and date=? and status='paid'", bid, t).filter(o => !mySid || o.barberId === mySid);
      const queue = all("select o.*, s.name barberName from orders o left join staff s on s.id=o.barberId where o.branchId=? and o.date=? and o.status in ('waiting','in_chair') order by o.no", bid, t).map(parseOrder).map(withCust);
      const st = all('select id from staff where branchId=? and active=1', bid).map(s => staffState(s.id, t).state);
      return send(res, 200, {
        gross: r2(sum(paid, o => o.subtotal)), net: r2(sum(paid, o => o.total)), completed: paid.length, bookings: one("select count(*) n from bookings where branchId=? and date=? and status='booked'", bid, t).n, waiting: queue.filter(o => o.status === 'waiting').length,
        cutting: queue.filter(o => o.status === 'in_chair').length, onDuty: st.filter(x => ['present', 'late', 'break'].includes(x)).length, totalBarbers: st.length, queue
      });
    }
    if (p === '/api/pos/queue' && method === 'GET') {
      const bid = branchScope(me, q.branch), t = todayStr(), f = q.filter || 'active';
      const sts = f === 'done' ? "('paid')" : f === 'all' ? "('waiting','in_chair','paid','void')" : "('waiting','in_chair')";
      return send(res, 200, all(`select o.*, s.name barberName from orders o left join staff s on s.id=o.barberId where o.branchId=? and o.date=? and o.status in ${sts} order by o.no`, bid, t).map(parseOrder).map(withCust));
    }
    if (p === '/api/pos/shift' && method === 'GET') {
      const s = openShift(branchScope(me, q.branch)); if (!s) return send(res, 200, { shift: null });
      return send(res, 200, { shift: s, z: zData(s), moves: all('select * from cash_moves where shiftId=? order by ts desc', s.id) });
    }
    if (p === '/api/pos/zreadings' && method === 'GET') {
      const bid = branchScope(me, q.branch);
      return send(res, 200, all('select * from zreadings where branchId=? order by generatedAt desc limit 30', bid).map(z => ({ ...z, data: JSON.parse(z.data) })));
    }
    if (p === '/api/pos/attendance' && method === 'GET') {
      const bid = branchScope(me, q.branch), t = todayStr();
      return send(res, 200, all('select s.id,s.name,s.photo,s.chairId,c.name chairName from staff s left join chairs c on c.id=s.chairId where s.branchId=? and s.active=1 order by s.name', bid).map(s => ({ ...s, ...staffState(s.id, t) })));
    }
    if (p === '/api/expenses' && method === 'GET') {
      const bid = branchScope(me, q.branch), t = todayStr(), term = '%' + String(q.q || '').toLowerCase() + '%';
      const range = q.range === 'month' ? [t.slice(0, 8) + '01', t] : q.range === 'all' ? ['2000-01-01', t] : [t, t];
      const base = all("select m.*, s.name staffName from cash_moves m left join staff s on s.id=m.staffId where m.branchId=? and m.kind='expense' order by m.ts desc", bid);
      const rows = base.filter(m => m.date >= range[0] && m.date <= range[1] && (m.note + ' ' + m.by + ' ' + (m.staffName || '')).toLowerCase().includes(term.replace(/%/g, '')));
      return send(res, 200, { rows, today: r2(sum(base.filter(m => m.date === t), m => m.amount)), month: r2(sum(base.filter(m => m.date >= t.slice(0, 8) + '01'), m => m.amount)), count: base.length, filtered: r2(sum(rows, m => m.amount)) });
    }
    if (p === '/api/orders' && method === 'POST') {
      const b = await readBody(req), branchId = branchScope(me, b.branchId), t = todayStr();
      { const zl = dayLocked(branchId, t); if (zl) bad(409, `Today's sales reading (Z-${zl.no}) is already done, so new tickets cannot be made until tomorrow.`); }
      const cust = resolveCustomer(b, 'pos', branchId), name = cust.name.slice(0, 200); if (!name) bad(400, 'Customer name required');
      const items = priceItems(b.items), tt = totals(items, null);
      const need = idNeeded(items); if (need.length && !b.idPhotoId) bad(400, `A photo of the customer's ID (Senior / PWD / Student) is required for ${need.join(', ')}.`);
      if (need.length) { const p = get('id_photos', String(b.idPhotoId)); if (!p || p.orderId || p.branchId !== branchId) bad(400, 'ID photo not found. Please take the photo again.'); }
      const no = (one('select max(no) m from orders where branchId=? and date=?', branchId, t).m || 0) + 1, ord = (one('select max(ord) m from orders').m || 0) + 1, id = uid();
      const dsc = b.discountId && get('discounts', String(b.discountId))?.active ? String(b.discountId) : '';
      run(`insert into orders(id,ord,no,branchId,date,customerId,customerName,barberId,chairId,status,items,subtotal,discountName,discountAmt,total,tenders,cashierId,createdAt,discountId)
      values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, ord, no, branchId, t, cust.id, name, '', '', 'waiting', JSON.stringify(items), tt.subtotal, '', 0, tt.total, '[]', me.id, nowISO(), dsc);
      const o = { id, ord, no, branchId };
      if (need.length) attachIdPhoto(id, branchId, b.idPhotoId);
      if (b.barberId) { const a = checkAssign(o, b); run("update orders set barberId=?, chairId=?, status='in_chair', startedAt=? where id=?", a.barber.id, a.chairId, nowISO(), id); }
      log(me, 'ticket', 'orders', id, `#${no} ${name}`);
      return send(res, 201, parseOrder(get('orders', id)));
    }
    const om = p.match(/^\/api\/orders\/(\w+)(?:\/(pay|void))?$/);
    if (om) {
      const body = method === 'PUT' || method === 'POST' ? await readBody(req) : null;   // read first: the order is then read in its current state
      const cur = get('orders', om[1]); if (!cur) bad(404, 'Not found');
      if (!inScope(me, cur.branchId)) bad(403, 'Not your branch');
      const o = parseOrder(cur), act = om[2];
      if (method === 'GET' && !act) return send(res, 200, withCust(o));
      if (method === 'PUT' && !act) {
        if (!['waiting', 'in_chair'].includes(o.status)) bad(409, 'Order is already closed');
        const b = body; const upd = {}; let queued = false;
        if (!admin && Object.keys(b).some(k => !['barberId', 'chairId'].includes(k))) needAny(me, 'pos');
        if ('items' in b) {
          const items = priceBooked(bookedSnap(o.id), b.items), tt = totals(items, null), need = idNeeded(items);
          if (need.length && !o.idPhoto && !b.idPhotoId) bad(400, `A photo of the customer's ID (Senior / PWD / Student) is required for ${need.join(', ')}.`);
          upd.items = JSON.stringify(items); upd.subtotal = tt.subtotal; upd.total = tt.total;
        }
        if (b.idPhotoId) attachIdPhoto(o.id, o.branchId, b.idPhotoId);
        if ('discountId' in b) upd.discountId = b.discountId && get('discounts', String(b.discountId))?.active ? String(b.discountId) : '';
        if ('customer' in b || 'customerName' in b || 'customerId' in b) {
          const c = resolveCustomer({ ...b, customerName: b.customerName || o.customerName }, 'pos', o.branchId); upd.customerId = c.id; upd.customerName = c.name.slice(0, 200) || o.customerName;
        }
        if (!('barberId' in b) && b.chairId) {
          // Assign to a chair (the chair's barber takes the customer). A busy chair queues the customer behind the one in the chair.
          const ch = get('chairs', String(b.chairId)); if (!ch || ch.branchId !== o.branchId || !ch.active) bad(409, 'That chair is not available in this branch');
          const barber = all('select * from staff where chairId=? and active=1 and branchId=? order by name', ch.id, o.branchId).find(s => { const d = onDuty(s.id, todayStr()); return d && !d.breakStartedAt; });
          if (!barber) bad(409, `No barber is on duty at ${ch.name}`);
          const busy = one("select 1 x from orders where status='in_chair' and id<>? and (chairId=? or barberId=?)", o.id, ch.id, barber.id);
          if (!busy && o.status !== 'in_chair') walkinGuard(cur, barber.id);   // T23 (D-8)
          upd.barberId = barber.id; upd.chairId = ch.id;
          if (busy) { upd.status = 'waiting'; upd.startedAt = null; queued = true; } else { upd.status = 'in_chair'; upd.startedAt = nowISO(); }
        } else if ('barberId' in b) {
          if (!b.barberId) { upd.barberId = ''; upd.chairId = ''; upd.status = 'waiting'; upd.startedAt = null; }
          else { if (o.status !== 'in_chair') walkinGuard(cur, String(b.barberId)); const a = checkAssign(o, b, o.id); upd.barberId = a.barber.id; upd.chairId = a.chairId; if (o.status !== 'in_chair') { upd.status = 'in_chair'; upd.startedAt = nowISO(); } }
        }
        const keys = Object.keys(upd); if (keys.length) run(`update orders set ${keys.map(k => k + '=?').join(',')} where id=?`, ...keys.map(k => upd[k]), o.id);
        { const was = orderPlan(cur), now = orderPlan(get('orders', o.id)), bn = get('staff', get('orders', o.id).barberId)?.name; if (was !== now) orderEvent(o.id, was, now, me.name, now === 'assigned' ? 'assigned to ' + bn : now === 'in_service' ? 'with ' + bn : ''); }   // T22
        if (o.status === 'in_chair' && upd.status === 'waiting') promoteNext(o.branchId, o.chairId);   // the chair this customer left is free again
        return send(res, 200, { ...parseOrder(get('orders', o.id)), queued });
      }
      if (method === 'POST' && act === 'pay') {
        if (!['waiting', 'in_chair'].includes(o.status)) bad(409, 'Order is already closed');
        if (!o.items.length) bad(409, 'Add at least one service or product');
        if (!o.barberId && o.items.some(i => i.type === 'service')) bad(409, 'Assign a barber first');
        const shift = openShift(o.branchId); if (!shift) bad(409, 'Open a shift first (Cash management)');
        const b = body, did = 'discountId' in b ? b.discountId : cur.discountId, disc = did ? get('discounts', String(did)) : null;
        if (did && (!disc || !disc.active)) bad(400, 'Unknown discount');
        const tt = totals(o.items, disc);
        const tenders = (Array.isArray(b.tenders) ? b.tenders : []).map(t => ({ method: String(t.method || '').slice(0, 30), amount: r2(t.amount) })).filter(t => t.method && t.amount > 0);
        const paid = sum(tenders, t => t.amount), change = r2(paid - tt.total);
        if (paid < tt.total) bad(409, 'Payment is less than the total');
        if (change > 0) { const cash = tenders.find(t => t.method === 'Cash'); if (!cash || cash.amount < change) bad(409, 'Change can only be given from cash'); cash.amount = r2(cash.amount - change); }
        const si = (one('select max(si) m from orders').m || 0) + 1;
        run("update orders set status='paid', si=?, discountName=?, discountAmt=?, subtotal=?, total=?, tenders=?, cashierId=?, shiftId=?, paidAt=?, date=?, source=?, payStatus='reported' where id=?",
          si, disc?.name || '', tt.discountAmt, tt.subtotal, tt.total, JSON.stringify(tenders), me.id, shift.id, nowISO(), todayStr(), isAppt(o.id) ? 'appointment' : 'walkin', o.id);
        orderEvent(o.id, orderPlan(cur), 'completed', me.name, 'paid at the POS');
        syncCommission(o.id, 'paid at the POS');   // T33
        promoteNext(o.branchId, o.chairId);
        log(me, 'sale', 'orders', o.id, `SI-${si} ₱${tt.total}`);
        return send(res, 200, { ...parseOrder(get('orders', o.id)), change });
      }
      if (method === 'POST' && act === 'void') {
        const b = body;
        // D-9: a paid sale is a service record. A manager asks for a void correction (approved by someone else); the owner's or an
        // admin's own void takes effect at once and is kept as an approved correction.
        if (o.status === 'paid' && !admin) bad(403, 'A finished visit is voided through a correction: open it on the Today screen and choose Correct.');
        if (o.status === 'paid') {   // a paid sale is final for staff; the owner/admin may only void it with a reason, and never once it is inside a sales reading
          const zl = dayLocked(o.branchId, o.date); if (zl) bad(409, `This sale is already included in the sales reading (Z-${zl.no}), so it can no longer be voided.`);
          if (String(b.reason || '').trim().length < 3) bad(400, 'Enter the reason for voiding a paid sale');
        }
        if (o.status === 'void') bad(409, 'Already void');
        run("update orders set status='void', voidReason=? where id=?", String(b.reason || '').slice(0, 200), o.id);
        orderEvent(o.id, orderPlan(cur), 'cancelled', me.name, String(b.reason || '').slice(0, 200));
        if (o.status === 'paid') {
          syncCommission(o.id, 'voided at the POS: ' + String(b.reason || '').slice(0, 150));   // T33
          run("insert into record_adjustments(id,orderId,branchId,kind,before,after,reason,status,requestedById,requestedBy,createdAt,decidedBy,decidedAt) values(?,?,?,'void',?,?,?,'approved',?,?,?,?,?)", uid() + uid(), o.id, o.branchId, JSON.stringify({ status: 'paid' }), JSON.stringify({ status: 'void' }), String(b.reason || '').slice(0, 300), me.id, me.name, nowISO(), me.name, nowISO());
          run("update record_adjustments set status='rejected', decidedBy=?, decidedAt=?, note='The record was voided.' where orderId=? and status='requested'", me.name, nowISO(), o.id);
        }
        if (o.status === 'in_chair') promoteNext(o.branchId, o.chairId);
        log(me, 'void', 'orders', o.id, `#${o.no} ${b.reason || ''}`); return send(res, 200, { ok: true });
      }
      bad(405, 'Method not allowed');
    }
    if (p === '/api/attendance' && method === 'POST') {
      const b = await readBody(req), s = get('staff', b.staffId); if (!s || !s.active) bad(404, 'Unknown barber');
      if (!inScope(me, s.branchId)) bad(403, 'Not your branch');
      if (me.role === 'barber' && !modulesFor('barber').includes('attendance') && s.id !== (get('users', me.id)?.staffId || '')) bad(403, 'You can only clock yourself in and out');
      const br = get('branches', s.branchId), needPhoto = getSetting('attPhoto') !== '0', recv = new Date();
      // idempotent: a record sent twice (offline retry) is applied once
      const cid = String(b.clientId || '').slice(0, 64);
      if (cid && one('select 1 x from attendance_events where clientId=?', cid)) return send(res, 200, { ok: true, duplicate: true });
      // the time of the event is the time on the device when the button was pressed (kept exactly); the server time is stored separately
      let at = recv, flag = '', offlineMin = 0;
      if (b.deviceAt) {
        const dv = new Date(b.deviceAt), diff = (dv - recv) / 60000;
        if (isNaN(dv)) flag = 'Unreadable device timestamp; server time used';
        else if (diff > 5) flag = `Device clock was ${Math.round(diff)} minutes ahead of the server; server time used`;
        else if (diff < -48 * 60) flag = 'Device timestamp is more than 48 hours old; server time used';
        else { at = dv; offlineMin = Math.max(0, Math.round(-diff)); if (offlineMin > 12 * 60) flag = `Recorded offline ${Math.round(offlineMin / 60)} hours before it reached the server`; }
      }
      const t = dOf(at), atIso = at.toISOString(), recvIso = recv.toISOString(), open = onDuty(s.id, t);
      let photo = null; if (['in', 'out'].includes(b.action)) { photo = b.photoId ? get('files', String(b.photoId)) : null; if (photo && photo.branchId !== s.branchId) photo = null; if (needPhoto && !photo) bad(400, 'Take a selfie first. Photo is required for time in and time out.'); }
      const geo = b.geo && Number.isFinite(+b.geo.lat) && Number.isFinite(+b.geo.lng) ? { lat: +(+b.geo.lat).toFixed(5), lng: +(+b.geo.lng).toFixed(5), acc: Math.round(+b.geo.acc || 0) } : null;
      let attId = '';
      if (b.action === 'in') {
        if (open) bad(409, `${s.name} is already clocked in`);
        const late = Math.max(0, minsOfDay(at) - (toMin(br.openTime) + (br.graceMins || 0))), lateRaw = Math.max(0, minsOfDay(at) - toMin(br.openTime));   // lateRaw = minutes after opening time with no grace (used for the lunch/allowance pay rules)
        run("delete from attendance where staffId=? and date=? and status='off'", s.id, t);
        const prior = one('select 1 x from attendance where staffId=? and date=?', s.id, t); attId = uid();
        run('insert into attendance(id,staffId,branchId,date,timeIn,timeOut,lateMins,lateRaw,inPhoto,deviceIn,receivedIn,geoIn,flagged,flagReason,offline) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', attId, s.id, s.branchId, t, atIso, null, prior ? 0 : late, prior ? 0 : lateRaw, photo?.id || '', b.deviceAt || '', recvIso, geo ? JSON.stringify(geo) : '', flag ? 1 : 0, flag, offlineMin > 2 ? 1 : 0);
        promoteNext(s.branchId, s.chairId);
      } else if (b.action === 'out') {
        if (!open) bad(409, `${s.name} is not clocked in`);
        if (new Date(open.timeIn) > at) bad(409, 'The time out cannot be earlier than the time in');
        if (one("select 1 x from orders where barberId=? and status='in_chair'", s.id)) bad(409, `${s.name} still has a customer in the chair`);
        const close = toMin(br.closeTime || '21:00'), outM = minsOfDay(at), over = Math.max(0, outM - close), under = Math.max(0, close - outM); attId = open.id;
        run('update attendance set timeOut=?, outPhoto=?, deviceOut=?, receivedOut=?, geoOut=?, undertimeMins=?, overtimeMins=?, flagged=?, flagReason=trim(ifnull(flagReason,\'\') || ? ), offline=max(ifnull(offline,0),?) where id=?', atIso, photo?.id || '', b.deviceAt || '', recvIso, geo ? JSON.stringify(geo) : '', under, over, (flag || open.flagged) ? 1 : 0, flag ? ' ' + flag : '', offlineMin > 2 ? 1 : 0, open.id);
      } else if (b.action === 'break_start') {
        if (!open) bad(409, `${s.name} is not clocked in`);
        if (open.breakStartedAt) bad(409, 'Already on break');
        if (one("select 1 x from orders where barberId=? and status='in_chair'", s.id)) bad(409, `${s.name} still has a customer in the chair`);
        run('update attendance set breakStartedAt=? where id=?', nowISO(), open.id);
      } else if (b.action === 'break_end') {
        if (!open?.breakStartedAt) bad(409, 'Not on break');
        run('update attendance set breakStartedAt=null, breakMins=ifnull(breakMins,0)+? where id=?', Math.round((Date.now() - new Date(open.breakStartedAt)) / 60000), open.id);
        promoteNext(s.branchId, s.chairId);
      } else if (b.action === 'off') {
        if (one('select 1 x from attendance where staffId=? and date=?', s.id, t)) bad(409, `${s.name} already has attendance today`);
        run("insert into attendance(id,staffId,branchId,date,timeIn,timeOut,lateMins,status) values(?,?,?,?,?,?,?,'off')", uid(), s.id, s.branchId, t, nowISO(), null, 0);
      } else bad(400, 'action must be in, out, break_start, break_end or off');
      run('insert into attendance_events(id,clientId,staffId,branchId,action,deviceAt,receivedAt,effectiveAt,photoId,flag,byName) values(?,?,?,?,?,?,?,?,?,?,?)', uid(), cid || null, s.id, s.branchId, b.action, b.deviceAt || '', recvIso, atIso, photo?.id || '', flag, me.name);
      log(me, 'clock-' + b.action, 'attendance', s.id, s.name + (flag ? ' [' + flag + ']' : '')); return send(res, 200, { ok: true, flagged: !!flag, id: attId });
    }
    // attendance log with photos, lateness / undertime / overtime, flags and absences (daily, weekly or monthly through the date range)
    if (p === '/api/attendance/log' && method === 'GET') {
      const from = /^\d{4}-\d{2}-\d{2}$/.test(q.from || '') ? q.from : todayStr(), to = /^\d{4}-\d{2}-\d{2}$/.test(q.to || '') ? q.to : todayStr(), br = branchOrAll(me, q.branch);
      const rows = all(`select a.*, s.name staffName, b.name branchName from attendance a join staff s on s.id=a.staffId left join branches b on b.id=a.branchId where a.date>=? and a.date<=? and ifnull(a.status,'present')='present'${br ? ' and a.branchId=?' : ''}${q.flagged === '1' ? ' and a.flagged=1' : ''} order by a.date desc, a.timeIn desc limit 1000`, from, to, ...(br ? [br] : []))
        .map(a => ({ ...a, corrections: jp(a.corrections), geoIn: a.geoIn ? JSON.parse(a.geoIn) : null, geoOut: a.geoOut ? JSON.parse(a.geoOut) : null, workedMins: a.timeOut ? Math.round((new Date(a.timeOut) - new Date(a.timeIn)) / 60000) - (a.breakMins || 0) : null }));
      const absences = []; const end = to < todayStr() ? to : todayStr();
      if (q.flagged !== '1') for (let d = new Date(from + 'T00:00'), n = 0; dOf(d) <= end && n < 62; d.setDate(d.getDate() + 1), n++) {
        const ds = dOf(d), had = new Set(all('select staffId from attendance where date=?', ds).map(x => x.staffId));
        for (const s of all(`select * from staff where active=1${br ? ' and branchId=?' : ''}`, ...(br ? [br] : []))) if (!had.has(s.id) && !(ds === todayStr() && false)) absences.push({ date: ds, staffId: s.id, staffName: s.name, branchName: get('branches', s.branchId)?.name || '' });
      }
      return send(res, 200, { rows, absences, totals: { records: rows.length, late: rows.filter(r => r.lateMins > 0).length, lateMins: sum(rows, r => r.lateMins || 0), undertimeMins: sum(rows, r => r.undertimeMins || 0), overtimeMins: sum(rows, r => r.overtimeMins || 0), flagged: rows.filter(r => r.flagged).length, offline: rows.filter(r => r.offline).length, absences: absences.length } });
    }
    const acm = p.match(/^\/api\/attendance\/(\w+)\/correct$/);
    if (acm && method === 'PUT') {
      const a = get('attendance', acm[1]); if (!a) bad(404, 'Not found'); manageIn(a.branchId, a); const b = await readBody(req), reason = String(b.reason || '').trim().slice(0, 300);
      if (reason.length < 5) bad(400, 'A reason is required for every attendance correction');
      const parse = v => { if (!v) return null; const s = /^\d{2}:\d{2}$/.test(v) ? `${a.date}T${v}:00` : String(v); const d = new Date(s); if (isNaN(d)) bad(400, 'Invalid time'); return d; };
      const tin = b.timeIn ? parse(b.timeIn) : new Date(a.timeIn), tout = b.timeOut === '' || b.timeOut === undefined ? (a.timeOut ? new Date(a.timeOut) : null) : parse(b.timeOut);
      if (tout && tout < tin) bad(400, 'The time out cannot be earlier than the time in');
      const br = get('branches', a.branchId), close = toMin(br.closeTime || '21:00'), late = Math.max(0, minsOfDay(tin) - (toMin(br.openTime) + (br.graceMins || 0))), lateRaw = Math.max(0, minsOfDay(tin) - toMin(br.openTime));
      const log2 = jp(a.corrections); log2.push({ at: nowISO(), by: me.name, reason, before: { timeIn: a.timeIn, timeOut: a.timeOut, lateMins: a.lateMins }, after: { timeIn: tin.toISOString(), timeOut: tout ? tout.toISOString() : null } });
      run('update attendance set timeIn=?, timeOut=?, lateMins=?, lateRaw=?, undertimeMins=?, overtimeMins=?, corrections=?, corrected=1 where id=?', tin.toISOString(), tout ? tout.toISOString() : null, late, lateRaw, tout ? Math.max(0, close - minsOfDay(tout)) : 0, tout ? Math.max(0, minsOfDay(tout) - close) : 0, JSON.stringify(log2), a.id);
      log(me, 'attendance-correction', 'attendance', a.id, reason); return send(res, 200, { ok: true });
    }
    if (p === '/api/shifts/open' && method === 'POST') {
      const b = await readBody(req), bid = branchScope(me, b.branchId), terminal = String(b.terminal || 'Terminal 1').slice(0, 40);
      const zl = dayLocked(bid, todayStr()); if (zl) bad(409, `Today's sales reading (Z-${zl.no}) is already done, so the day is locked. You can open a new shift tomorrow.`);
      if (one("select 1 x from shifts where branchId=? and terminal=? and status='open'", bid, terminal)) bad(409, 'A shift is already open on this terminal');
      const id = uid(), sno = (one('select max(no) m from shifts where branchId=?', bid).m || 0) + 1;
      run("insert into shifts(id,no,branchId,terminal,cashierId,cashierName,businessDate,openedAt,openingFloat,status) values(?,?,?,?,?,?,?,?,?,'open')", id, sno, bid, terminal, me.id, me.name, todayStr(), nowISO(), Math.max(0, r2(b.openingFloat)));
      log(me, 'shift-open', 'shifts', id, terminal); return send(res, 201, get('shifts', id));
    }
    const sm = p.match(/^\/api\/shifts\/(\w+)\/close$/);
    if (sm && method === 'POST') {
      const s = get('shifts', sm[1]); if (!s || s.status !== 'open') bad(404, 'No such open shift');
      if (!inScope(me, s.branchId)) bad(403, 'Not your branch');
      const zl = dayLocked(s.branchId, s.businessDate); if (zl) bad(409, `The sales reading for ${s.businessDate} (Z-${zl.no}) is already done. Only one per day.`);
      const ot = openTickets(s.branchId, s.businessDate); if (ot) bad(409, `Cannot do the sales reading yet: ${ot} ticket${ot === 1 ? ' is' : 's are'} still open (pay later or in the chair). Pay or cancel ${ot === 1 ? 'it' : 'them'} first.`);
      const b = await readBody(req), z = zData(s); let counted;
      if (b.denoms && typeof b.denoms === 'object') {   // cash denomination counter: { "1000": 2, "50": 3, ... }
        counted = 0; z.denoms = {};
        for (const d of [1000, 500, 200, 100, 50, 20, 10, 5, 1, 0.25]) { const n = Math.max(0, Math.floor(+b.denoms[d] || 0)); if (n) { z.denoms[d] = n; counted += n * d; } }
        counted = r2(counted);
      } else counted = r2(b.counted);
      z.counted = counted; z.remarks = String(b.remarks || '').slice(0, 300); z.shiftNo = s.no; z.variance = r2(counted - z.expected);
      const brn = get('branches', s.branchId);
      Object.assign(z, { cashier: s.cashierName, terminal: s.terminal, openedAt: s.openedAt, closedAt: nowISO(), branchName: brn?.name || '', address: brn?.address || '', phone: brn?.phone || '' });
      const no = (one('select max(no) m from zreadings where branchId=?', s.branchId).m || 0) + 1;
      run("update shifts set status='closed', closedAt=?, counted=? where id=?", nowISO(), counted, s.id);
      run('insert into zreadings(id,no,branchId,shiftId,businessDate,generatedAt,data) values(?,?,?,?,?,?,?)', uid(), no, s.branchId, s.id, s.businessDate, nowISO(), JSON.stringify(z));
      log(me, 'shift-close', 'shifts', s.id, `Z-${no} variance ${z.variance}`); return send(res, 200, { no, ...z });
    }
    if (p === '/api/cash' && method === 'POST') {
      const b = await readBody(req), s = get('shifts', b.shiftId); if (!s || s.status !== 'open') bad(409, 'Shift is not open');
      if (!admin) needAny(me, b.kind === 'expense' ? 'expenses' : 'reading');
      if (!inScope(me, s.branchId)) bad(403, 'Not your branch');
      if (!['in', 'out', 'expense', 'advance'].includes(b.kind)) bad(400, 'Bad type');
      const amount = r2(b.amount); if (!(amount > 0)) bad(400, 'Amount must be more than 0');
      if (b.kind === 'advance' && !get('staff', b.staffId)) bad(400, 'Pick the barber');
      if (b.staffId && get('staff', b.staffId) && get('staff', b.staffId).branchId !== s.branchId) bad(400, 'Pick a barber of this branch');   // a cash move is charged inside its own branch
      const who = ['advance', 'expense'].includes(b.kind) && get('staff', b.staffId) ? b.staffId : '';
      run('insert into cash_moves(id,shiftId,branchId,date,kind,amount,note,staffId,ts,by) values(?,?,?,?,?,?,?,?,?,?)', uid(), s.id, s.branchId, todayStr(), b.kind, amount, String(b.note || '').slice(0, 200), who, nowISO(), me.name);
      log(me, 'cash-' + b.kind, 'cash', s.id, '₱' + amount); return send(res, 201, { ok: true });
    }

    return NEXT;
  };
}
