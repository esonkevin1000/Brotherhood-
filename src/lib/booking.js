// Booking rules: which times are free, making a booking, the price snapshot, and a booking's history.
// Created once by server.js with the database helpers it needs, so the rules can also be tested on their own.
import { createAvailability, hmOf } from './availability.js';
export { hmOf };
// the key a phone or browser sends with a booking so that a repeated tap or a retry never makes a second booking
export const idemKeyOf = v => { const k = String(v || '').trim(); return k.length >= 16 && k.length <= 200 ? k : ''; };
export const snapOf = b => { try { const s = b.snapshot ? JSON.parse(b.snapshot) : null; return s && Array.isArray(s.items) && s.items.length ? s : null; } catch { return null; } };

// now(): the current time; a test passes its own clock.
export function createBookings({ uid, dOf, todayStr, nowISO, r2, jp, minsOfDay, toMin, sum, all, one, run, get, priceItems, staffState, normPhone, getSetting, findCustomer, upsertCustomer, tx, bad, mvpOn = () => false, now = () => new Date() }) {
  function bookingMins(ids) {
    let m = 0;
    for (const id of ids) { const it = get('items', id); if (!it || !it.active || it.type !== 'service') bad(400, 'Unknown service'); m += it.mins || 30; }
    return Math.max(30, m);
  }
  // which times are free: src/lib/availability.js (T15)
  const { timeBlocked, bookedOverlap, canDo, staffFree, slotsFor, pickAny } = createAvailability({ all, one, get, toMin, minsOfDay, todayStr, staffState, getSetting, bad, mvpOn, now });
  // owner's rule: after N missed appointments in 90 days a number can no longer book online (the owner can allow a customer again)
  function noShowGate(phone, email) {
    const max = +getSetting('noshowMax') || 0; if (!max) return;
    const c = findCustomer(phone, email); if (c && c.noshowOk) return;
    const since = dOf(new Date(now().getTime() - 90 * 864e5)), pk = normPhone(phone);
    const n = all("select phone, customerId from bookings where status='noshow' and date>=?", since).filter(x => (c && x.customerId === c.id) || (pk.length >= 10 && normPhone(x.phone) === pk)).length;
    if (n >= max) bad(403, 'Online booking is paused for this number because of missed appointments. Please call the shop to book.');
  }
  // a booking's history: one row per status change, never edited
  const bookingEvent = (bookingId, from, to, actor, reason = '') => run('insert into booking_events(id,bookingId,at,actor,fromStatus,toStatus,reason) values(?,?,?,?,?,?,?)', uid(), bookingId, nowISO(), String(actor || '').slice(0, 100), from || '', to, String(reason || '').slice(0, 300));
  // what was agreed at booking time. Later price changes do not touch a booking that is already made.
  function bookingSnapshot(itemIds, branchId, staffId, mins) {
    const its = itemIds.map(i => get('items', i)).filter(Boolean);
    return { items: its.map(i => ({ id: i.id, name: i.name, price: i.price, mins: i.mins || 30 })), total: r2(sum(its, i => i.price)), mins, branchName: get('branches', branchId)?.name || '', staffName: get('staff', staffId)?.name || '', takenAt: nowISO() };
  }
  // Prices the lines of a visit. A line that is in the booking's snapshot keeps the booked price (and still works when that service was switched off later); any other line gets today's price.
  function priceBooked(snap, lines) {
    const out = [];
    for (const l of Array.isArray(lines) ? lines : []) {
      const s = snap ? snap.items.find(x => x.id === l.itemId) : null, it = s ? get('items', s.id) : null;
      if (s && (!it || !it.active)) { out.push({ itemId: s.id, name: s.name, type: 'service', price: s.price, qty: 1 }); continue; }
      const [p] = priceItems([l]); if (s) p.price = s.price; out.push(p);
    }
    return out;
  }
  const bookedSnap = orderId => { const bk = orderId ? one('select snapshot from bookings where orderId=?', orderId) : null; return bk ? snapOf(bk) : null; };
  function createBooking(b, source, actor) {
    const branchId = String(b.branchId || ''); if (!get('branches', branchId)) bad(400, 'Pick a branch');
    const date = String(b.date || ''), time = String(b.time || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) bad(400, 'Invalid date or time');
    if (date < todayStr()) bad(400, 'Date is in the past');
    if (date > dOf(new Date(now().getTime() + 60 * 864e5))) bad(400, 'Too far ahead (max 60 days)');
    const itemIds = (Array.isArray(b.itemIds) ? b.itemIds : []).map(String); if (!itemIds.length) bad(400, 'Pick at least one service');
    if (source === 'online') for (const id of itemIds) { const it = get('items', id); if (!it || !it.active || it.type !== 'service' || !it.bookable) bad(400, 'That service cannot be booked online. Please walk in or call the shop.'); }
    const name = String(b.name || '').trim().slice(0, 100), phone = String(b.phone || '').trim().slice(0, 30);
    if (!name) bad(400, 'Name required');
    if (phone.replace(/\D/g, '').length < 10) bad(400, 'Enter a valid mobile number');
    const idem = idemKeyOf(b.idemKey);
    return tx(() => {
    if (idem) {   // the same request again (double tap, retry after a lost connection): give back the booking that was already made
      const ex = one('select * from bookings where idemKey=?', idem);
      if (ex) { if (ex.status !== 'booked' || normPhone(ex.phone) !== normPhone(phone) || ex.branchId !== branchId || ex.date !== date || ex.time !== time) bad(409, 'This booking request was already used. Please start again.'); return { ...bookingView(ex), duplicate: true }; }
    }
    if (source === 'online') noShowGate(phone, b.email);
    const mins = bookingMins(itemIds), start = toMin(time);
    let sid = String(b.staffId || 'any');
    if (!slotsFor(branchId, date, sid, mins, itemIds).includes(time)) bad(409, 'That time is no longer available. Please pick another.');
    if (sid === 'any') sid = pickAny(branchId, date, start, mins, itemIds).id;   // fewest bookings that day, then the lowest id
    const cust = upsertCustomer({ name, phone, email: b.email, preferredCut: b.preferredCut ?? b.notes, consent: !!b.consent }, source === 'online' ? 'online' : 'pos', branchId);
    const id = uid();
    run('insert into bookings(id,branchId,staffId,customerName,phone,date,time,mins,itemIds,status,notes,source,orderId,createdAt,customerId,snapshot,idemKey) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      id, branchId, sid, name, phone, date, time, mins, JSON.stringify(itemIds), 'booked', String(b.preferredCut ?? b.notes ?? '').slice(0, 300), source, '', nowISO(), cust?.id || '', JSON.stringify(bookingSnapshot(itemIds, branchId, sid, mins)), idem || null);
    bookingEvent(id, '', 'booked', actor || (source === 'online' ? 'Customer (online)' : 'Staff'));
    return bookingView(one('select * from bookings where id=?', id));
    });
  }
  function bookingView(b) {
    // services and prices come from the snapshot taken at booking time; bookings older than the snapshot fall back to today's price list
    const { snapshot, idemKey, ...row } = b, snap = snapOf(b);
    const ids = jp(b.itemIds), its = snap ? snap.items : ids.map(i => get('items', i)).filter(Boolean), s = b.staffId ? get('staff', b.staffId) : null;
    return { ...row, itemIds: ids, items: its.map(i => ({ id: i.id, name: i.name, price: i.price })), total: snap ? r2(snap.total) : r2(sum(its, i => i.price)), staffName: s?.name || '', staffPhoto: s?.photo || '', branchName: get('branches', b.branchId)?.name || '' };
  }

  return { bookingMins, canDo, pickAny, timeBlocked, bookedOverlap, staffFree, slotsFor, noShowGate, bookingEvent, bookingSnapshot, priceBooked, bookedSnap, createBooking, bookingView };
}
