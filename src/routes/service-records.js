// Day board for the Brotherhood app (takes over from the POS): walk-ins, start, finish, cancel, ID photos.
// Tracking only. The app never issues a receipt, an invoice number or a shift reading; the shop issues its own BIR invoice and may note its number here.
// Created once by server.js; the handler gets the request and the logged-in person on each call.
export function createServiceRoutes({ syncRecord, isAppt, dayRows, queueEstimates, walkinGuard, walkinOptions, orderMins, orderPlan, orderEvent, uid, todayStr, nowISO, r2, jp, sum, all, one, run, get, parseOrder, staffState, log, isAdmin, isBranchUser, isManager, inScope, branchOrAll, MODULES, modulesFor, branchScope, dayLocked, priceItems, idNeeded, ID_TYPES, attachIdPhoto, totals, promoteNext, checkAssign, getSetting, resolveCustomer, createTicket, priceBooked, bookedSnap, bad, send, readBody }) {
  return async function handleServiceRecords({ req, res, p, method, q, me }) {
      if (!['owner', 'admin', 'manager', 'cashier', 'barber'].includes(me.role)) bad(403, 'Not allowed for your role');
      const myStaffId = me.role === 'barber' ? (get('users', me.id)?.staffId || '') : '';
      const PAY_METHODS = ['Cash', 'GCash', 'Maya', 'Card', 'Bank transfer', 'Other'];
      const svcView = row => {
        const x = parseOrder(row), c = x.customerId ? get('customers', x.customerId) : null;
        return { id: x.id, no: x.no, customerId: x.customerId || '', status: x.status === 'paid' ? 'done' : x.status === 'void' ? 'cancelled' : x.status, customerName: x.customerName, phone: c?.phone || '',
          barberId: x.barberId || '', barberName: x.barberId ? get('staff', x.barberId)?.name || '' : '', items: x.items.map(i => ({ itemId: i.itemId, name: i.name, type: i.type, price: i.price, qty: i.qty, needId: !!i.needId })),
          subtotal: x.subtotal, discountId: x.discountId || '', discountName: x.discountName || '', discountAmt: x.discountAmt || 0, total: x.total, method: x.tenders[0]?.method || '', invoiceNo: x.invoiceNo || '',
          hasId: !!x.idPhoto, idSkipped: !x.idPhoto && !!row.idSkip, createdAt: x.createdAt, startedAt: x.startedAt || '', doneAt: x.paidAt || '', plan: orderPlan(row), source: row.source || '', payStatus: row.payStatus || '', verifiedBy: row.verifiedBy || '' };
      };
      const ticket = id => { const o = get('orders', String(id)); if (!o) bad(404, 'Visit not found'); if (!inScope(me, o.branchId)) bad(403, 'Not your shop'); return parseOrder(o); };
      if (p === '/api/svc/today' && method === 'GET') {
        const bid = isBranchUser(me) ? me.branchId : String(q.branch || (isManager(me) ? me.branchIds[0] : one('select id from branches order by rowid')?.id) || ''); if (!get('branches', bid)) bad(400, 'Pick a branch'); if (!inScope(me, bid)) bad(403, 'Not your branch');
        const t = todayStr(), mine = x => x.barberId === myStaffId;
        const est = queueEstimates(bid);   // T24
        let tickets = all("select * from orders where branchId=? and date=? and status in ('waiting','in_chair','paid') order by no", bid, t).map(svcView).map(x => ({ ...x, estimate: est[x.id] || null }));
        if (me.role === 'barber') tickets = tickets.filter(x => mine(x) || (x.status === 'waiting' && !x.barberId));   // a barber sees his own customers and the unassigned line
        const done = tickets.filter(x => x.status === 'done' && (me.role !== 'barber' || mine(x)));
        const staff = all('select id,name,photo,chairId from staff where branchId=? and active=1 order by name', bid).map(s => ({ ...s, ...staffState(s.id, t), busy: !!one("select 1 x from orders where barberId=? and status='in_chair'", s.id) }));
        const bookings = all("select id,customerName,phone,time,staffId,itemIds from bookings where branchId=? and date=? and status='booked' order by time", bid, t)
          .filter(b => me.role !== 'barber' || !b.staffId || b.staffId === myStaffId)
          .map(b => ({ id: b.id, customerName: b.customerName, phone: b.phone, time: b.time, staffId: b.staffId || '', staffName: b.staffId ? get('staff', b.staffId)?.name || '' : 'Any barber', items: jp(b.itemIds).map(i => get('items', i)?.name).filter(Boolean) }));
        return send(res, 200, {
          branch: { id: bid, name: get('branches', bid)?.name || '' }, branches: isBranchUser(me) ? [] : all('select id,name from branches order by rowid').filter(x => inScope(me, x.id)), date: t, role: me.role, myStaffId, locked: !!dayLocked(bid, t), attPhoto: getSetting('attPhoto') !== '0', modules: isAdmin(me) ? MODULES : modulesFor(me.role),
          menu: all('select id,name,type,price,mins,needId from items where active=1 order by type desc, price').map(i => ({ ...i, needId: !!i.needId })),
          discounts: all('select id,name,kind,value from discounts where active=1 order by name'), methods: PAY_METHODS, staff, tickets, bookings,
          ...(me.role === 'barber' ? { myEarnings: r2(dayRows(t, t, bid).find(r => r.staffId === myStaffId)?.commission || 0) } : {}),   // T26: his own commission today
          closing: (() => { const br = get('branches', bid), [ch, cm] = String(br?.closeTime || '21:00').split(':').map(Number), n = new Date(), waiting = tickets.filter(x => x.status === 'waiting').length; return { closeTime: br?.closeTime || '21:00', waiting, needed: waiting > 0 && n.getHours() * 60 + n.getMinutes() >= ch * 60 + (cm || 0) }; })(),   // T25
          totals: { waiting: tickets.filter(x => x.status === 'waiting').length, inChair: tickets.filter(x => x.status === 'in_chair').length, done: done.length, earned: r2(sum(done, x => x.total)) }
        });
      }
      if (p === '/api/svc/idphoto' && method === 'POST') {
        const b = await readBody(req, 1_800_000), branchId = branchScope(me, b.branchId);
        const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(b.data || '')); if (!m) bad(400, 'The ID photo must be a JPEG, PNG or WebP image');
        const buf = Buffer.from(m[2], 'base64'); if (buf.length > 1_000_000) bad(413, 'The photo is too large. Please try again.');
        const type = ID_TYPES.includes(b.idType) ? b.idType : bad(400, 'Choose the ID type: Senior, PWD or Student');
        const id = uid() + uid(); run('insert into id_photos(id,orderId,branchId,idType,mime,data,byId,createdAt) values(?,?,?,?,?,?,?,?)', id, '', branchId, type, m[1], buf, me.id, nowISO());
        log(me, 'id-photo', 'id_photos', id, type); return send(res, 201, { id, idType: type });
      }
      if (p === '/api/svc/walkin' && method === 'POST') {
        const b = await readBody(req), bid = branchScope(me, b.branchId), t = todayStr();
        if (dayLocked(bid, t)) bad(409, 'Today is already closed for this shop.');
        if (me.role === 'barber' && !myStaffId) bad(409, 'Your login is not linked to your barber profile yet. Ask the owner.');
        const name = String(b.name || '').trim().slice(0, 100); if (!name) bad(400, "Enter the customer's name");
        const items = priceItems(b.items); if (!items.length) bad(400, 'Choose at least one service');
        const need = idNeeded(items); if (need.length && !b.idPhotoId && !b.idSkipped) bad(400, `A photo of the customer's ID (Senior / PWD / Student) is needed for ${need.join(', ')}. Take the photo, or choose "Continue without photo".`);
        if (need.length && b.idPhotoId) { const ph = get('id_photos', String(b.idPhotoId)); if (!ph || ph.orderId || ph.branchId !== bid) bad(400, 'ID photo not found. Please take the photo again.'); }
        const cust = resolveCustomer({ customer: { name, phone: String(b.phone || '').trim().slice(0, 30) } }, 'pos', bid);
        const o = createTicket(me, bid, cust.id, cust.name || name, items, me.role === 'barber' ? myStaffId : String(b.barberId || ''));
        run("update orders set via='app' where id=?", o.id);
        if (need.length && b.idPhotoId) attachIdPhoto(o.id, bid, b.idPhotoId); else if (need.length) run('update orders set idSkip=1 where id=?', o.id);
        log(me, 'walk-in', 'orders', o.id, `#${o.no} ${name}`);
        return send(res, 201, svcView(get('orders', o.id)));
      }
      // T25: at closing time, anyone still waiting is marked left or carried over to tomorrow (front desk, manager, owner)
      if (p === '/api/svc/close-queue' && method === 'POST') {
        if (me.role === 'barber') bad(403, 'The front desk closes the queue');
        const b = await readBody(req), bid = branchScope(me, b.branchId), act = b.action;
        if (!['left', 'carry'].includes(act)) bad(400, 'Choose: mark as left, or carry over to tomorrow');
        if (dayLocked(bid, todayStr())) bad(409, 'Today is already closed for this shop.');
        const pad = n => String(n).padStart(2, '0'), d = new Date(Date.now() + 864e5), tmr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        const pick = Array.isArray(b.ids) ? new Set(b.ids.map(String)) : null;
        const rows = all("select * from orders where branchId=? and date=? and status='waiting' order by no", bid, todayStr()).filter(o => !pick || pick.has(o.id));
        for (const o of rows) {
          if (act === 'left') { if (Number(run("update orders set status='left' where id=? and status='waiting'", o.id).changes) === 1) orderEvent(o.id, orderPlan(o), 'left', me.name, 'end of day'); }
          else { const no = (one('select max(no) m from orders where branchId=? and date=?', bid, tmr).m || 0) + 1; run('update orders set date=?, no=? where id=?', tmr, no, o.id); orderEvent(o.id, orderPlan(o), orderPlan(o), me.name, `carried over to ${tmr}`); }
        }
        log(me, act === 'left' ? 'queue-closed' : 'queue-carried', 'orders', bid, `${rows.length} waiting`);
        return send(res, 200, act === 'left' ? { ok: true, left: rows.length } : { ok: true, carried: rows.length, date: tmr });
      }
      // T23: the barbers on duty for a walk-in: safe ones first, each with the earliest safe start and the next booking
      if (p === '/api/svc/walkin-options' && method === 'GET') {
        const bid = branchScope(me, q.branch), ids = String(q.items || '').split(',').filter(Boolean);
        const mins = orderMins({ items: ids.map(i => ({ itemId: i, qty: 1, type: get('items', i)?.type || 'service' })) });
        return send(res, 200, { mins, barbers: walkinOptions(bid, mins) });
      }
      const hm = p.match(/^\/api\/svc\/(\w+)\/history$/);
      if (hm && method === 'GET') { const o = ticket(hm[1]); return send(res, 200, all('select at, actor, fromStatus "from", toStatus "to", reason from order_events where orderId=? order by rowid', o.id)); }   // T22
      const sa = p.match(/^\/api\/svc\/(\w+)\/(start|finish|cancel|left)$/);
      if (sa && method === 'POST') {
        const b = await readBody(req), o = ticket(sa[1]), act = sa[2];   // the visit is read after the body arrived (a slow connection must not act on an old state)
        if (!['waiting', 'in_chair'].includes(o.status)) {   // closed already: say what happened and who did it (T27: two staff acting at once)
          const to = { paid: 'completed', left: 'left', void: 'cancelled' }[o.status], ev = one('select actor from order_events where orderId=? and toStatus=? order by rowid desc limit 1', o.id, to), by = ev ? ' by ' + ev.actor : '';
          bad(409, o.status === 'paid' ? 'This visit is already done' + by + '.' : o.status === 'left' ? 'This customer was already marked as left' + by + '.' : 'This visit was already cancelled' + by + '.');
        }
        if (me.role === 'barber' && o.barberId && o.barberId !== myStaffId) bad(403, 'This customer is with another barber.');
        const before = orderPlan(o);
        if (act === 'start') {
          if (o.status === 'in_chair') { const ev = one("select actor, at from order_events where orderId=? and toStatus='in_service' order by rowid desc limit 1", o.id); bad(409, `Already in service with ${get('staff', o.barberId)?.name || 'a barber'}${ev ? `, started by ${ev.actor} at ${new Date(ev.at).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}` : ''}.`); }   // T22/T27
          const bar = me.role === 'barber' ? myStaffId : String(b.barberId || o.barberId || ''); if (!bar) bad(400, 'Choose the barber');
          walkinGuard(o, bar);   // T23 (D-8)
          const a = checkAssign(o, { barberId: bar }, o.id);
          if (Number(run("update orders set barberId=?, chairId=?, status='in_chair', startedAt=? where id=? and status='waiting'", a.barber.id, a.chairId, nowISO(), o.id).changes) !== 1) bad(409, 'This visit just changed. Please refresh.');
          orderEvent(o.id, before, 'in_service', me.name, 'with ' + a.barber.name);
          log(me, 'visit-start', 'orders', o.id, `#${o.no} ${a.barber.name}`); return send(res, 200, svcView(get('orders', o.id)));
        }
        if (act === 'left') {   // T25: a waiting customer walked away: no service record, no loyalty point
          if (o.status !== 'waiting') bad(409, 'Only a customer who is still waiting can be marked as left');
          const why = String(b.reason || 'Left without a cut').trim().slice(0, 200) || 'Left without a cut';
          if (Number(run("update orders set status='left', voidReason=? where id=? and status='waiting'", why, o.id).changes) !== 1) bad(409, 'This visit just changed. Please refresh.'); orderEvent(o.id, before, 'left', me.name, why);
          log(me, 'visit-left', 'orders', o.id, `#${o.no} ${why}`); return send(res, 200, { ok: true });
        }
        if (act === 'cancel') {
          run("update orders set status='void', voidReason=? where id=?", String(b.reason || 'Cancelled').trim().slice(0, 200) || 'Cancelled', o.id);
          orderEvent(o.id, before, 'cancelled', me.name, String(b.reason || 'Cancelled').trim().slice(0, 200) || 'Cancelled');
          if (o.status === 'in_chair') promoteNext(o.branchId, o.chairId);
          log(me, 'visit-cancelled', 'orders', o.id, `#${o.no} ${b.reason || ''}`); return send(res, 200, { ok: true });
        }
        // finish: the service is done and the customer paid the shop. This only records it (who, what, how much, how paid).
        if (dayLocked(o.branchId, todayStr())) bad(409, 'Today is already closed for this shop.');
        let items = o.items;
        if (Array.isArray(b.items)) { items = priceBooked(bookedSnap(o.id), b.items); if (!items.length) bad(400, 'Choose at least one service'); }
        if (idNeeded(items).length && !o.idPhoto) {
          if (b.idPhotoId) attachIdPhoto(o.id, o.branchId, b.idPhotoId);
          else if (b.idSkipped || o.idSkip) run('update orders set idSkip=1 where id=?', o.id);
          else bad(400, `A photo of the customer's ID (Senior / PWD / Student) is needed for ${idNeeded(items).join(', ')}. Take the photo, or choose "Continue without photo".`);
        }
        let barberId = o.barberId || (me.role === 'barber' ? myStaffId : String(b.barberId || ''));
        if (barberId) { const s = get('staff', barberId); if (!s || s.branchId !== o.branchId) bad(409, 'That barber is not in this shop'); }
        if (!barberId && items.some(i => i.type === 'service')) bad(409, 'Choose the barber who did the cut');
        const did = 'discountId' in b ? String(b.discountId || '') : (o.discountId || ''), disc = did ? get('discounts', did) : null; if (did && (!disc || !disc.active)) bad(400, 'Unknown discount');
        const tt = totals(items, disc), mth = PAY_METHODS.includes(b.method) ? b.method : bad(400, 'Choose how the customer paid'), inv = String(b.invoiceNo || '').trim().slice(0, 40);
        run("update orders set status='paid', items=?, barberId=?, discountId=?, discountName=?, discountAmt=?, subtotal=?, total=?, tenders=?, cashierId=?, shiftId='', paidAt=?, date=?, invoiceNo=?, via='app', source=?, payStatus='reported' where id=?",
          JSON.stringify(items), barberId, did, disc?.name || '', tt.discountAmt, tt.subtotal, tt.total, JSON.stringify([{ method: mth, amount: tt.total }]), me.id, nowISO(), todayStr(), inv, isAppt(o.id) ? 'appointment' : 'walkin', o.id);   // T28: source, and the payment as reported by the front desk (D-15)
        if (o.status === 'waiting') orderEvent(o.id, before, 'in_service', me.name, 'started and finished together');
        orderEvent(o.id, 'in_service', 'completed', me.name, `${mth}`);
        syncRecord(o.id, 'visit finished');   // T33
        promoteNext(o.branchId, o.chairId);
        log(me, 'visit-done', 'orders', o.id, `#${o.no} ₱${tt.total} ${mth}`);
        return send(res, 200, svcView(get('orders', o.id)));
      }
      bad(404, 'Not found');
  };
}
