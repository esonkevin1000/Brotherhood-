// Which times are free (T15). Kept apart from making a booking so the rules can be tested on their own.
//
//   free(barber, date) = branch hours
//                        ∩ the barber's weekly hours        (new booking system only, T13)
//                        − approved leave                    (new booking system only, T13)
//                        − blocked times (breaks, training)
//                        − bookings of that barber in ANY branch, each with the buffer after it, and guest holds (T16)
//                        − today: times before now + 15 minutes, and barbers not clocked in
//   slots = start times every 30 minutes (D-7) where the whole service fits in free()
//   a barber is offered only for services they do              (new booking system only, T14)
//
// "Any barber" (written tie-break): the eligible free barber with the fewest bookings that day, counted over every branch;
// on a tie, the lowest staff id. The same request always gets the same barber.
// Bookings are matched by barber, not by branch, so a barber who moves to another branch (D-16) is never booked twice at once.
const pad = n => String(n).padStart(2, '0');
export const hmOf = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
export const SLOT_STEP = 30;   // D-7

export function createAvailability({ all, one, get, toMin, minsOfDay, todayStr, staffState, getSetting, bad, mvpOn = () => false, policyOf = () => ({ slotStep: SLOT_STEP, bufferMins: +getSetting('bufferMins') || 0 }), now = () => new Date() }) {
  const timeBlocked = (sid, date, start, mins) => { try { return all('select fromMin, toMin from bh_blocked where staffId=? and date=?', sid, date).some(r => start < r.toMin && r.fromMin < start + mins); } catch { return false; } };
  const bookedOverlap = (sid, date, start, mins) => {
    const buf = policyOf(get('staff', sid)?.branchId).bufferMins || 0;   // T17: the barber's branch policy
    // a guest's booking on hold (waiting for the email code, T16) keeps its time until holdUntil
    return all("select * from bookings where staffId=? and date=? and (status in ('booked','arrived') or (status='pending' and holdUntil>?))", sid, date, new Date(now()).toISOString()).some(b => start < toMin(b.time) + b.mins + buf && toMin(b.time) < start + mins + buf) || timeBlocked(sid, date, start, mins);
  };
  const weekdayOf = date => new Date(date + 'T00:00:00Z').getUTCDay();
  // the barber's working window that day: null = no limit beyond the branch hours; [0, 0] = off
  function workWindow(s, date) {
    if (!mvpOn(s.branchId)) return null;
    try { if (one("select 1 x from leaves where staffId=? and status='APPROVED' and from_date<=? and to_date>=?", s.id, date, date)) return [0, 0]; } catch { }
    let r = null; try { r = one('select startMin, endMin from staff_schedules where staffId=? and weekday=?', s.id, weekdayOf(date)); } catch { }
    return r ? [r.startMin, r.endMin] : null;
  }
  const inHours = (s, date, start, mins) => { const w = workWindow(s, date); return !w || (start >= w[0] && start + mins <= w[1]); };
  const canDo = (s, itemIds) => {
    if (!itemIds?.length || !mvpOn(s.branchId)) return true;
    let mine = []; try { mine = all('select itemId from staff_services where staffId=?', s.id).map(r => r.itemId); } catch { }
    return !mine.length || itemIds.every(i => mine.includes(String(i)));
  };
  const staffFree = (s, date, start, mins) => !!s.active && inHours(s, date, start, mins) && !(date === todayStr() && staffState(s.id, date).state === 'off') && !bookedOverlap(s.id, date, start, mins);
  // the barbers that can be offered in a branch: one chosen barber, or everyone there for "Any barber"
  const poolOf = (branchId, staffId, itemIds) => (staffId === 'any' ? all('select * from staff where branchId=? and active=1', branchId) : [get('staff', staffId)].filter(s => s && s.branchId === branchId)).filter(s => canDo(s, itemIds));
  function slotsFor(branchId, date, staffId, mins, itemIds = []) {
    const br = get('branches', branchId); if (!br) bad(400, 'Pick a branch');
    const open = toMin(br.openTime || '09:00'), close = toMin(br.closeTime || '21:00'), nowM = minsOfDay(now()), pool = poolOf(branchId, staffId, itemIds), out = [];
    const step = policyOf(branchId).slotStep || SLOT_STEP;   // T17: the branch's slot interval
    for (let m = open; m + mins <= close; m += step) {
      if (date === todayStr() && m < nowM + 15) continue;
      if (pool.some(s => staffFree(s, date, m, mins))) out.push(hmOf(m));
    }
    return out;
  }
  // "Any barber": fewest bookings that day (all branches), then the lowest id; null when nobody is free
  function pickAny(branchId, date, start, mins, itemIds = []) {
    const load = s => one("select count(*) n from bookings where staffId=? and date=? and status in ('booked','arrived')", s.id, date).n;
    const free = poolOf(branchId, 'any', itemIds).filter(s => staffFree(s, date, start, mins)).map(s => ({ s, n: load(s) }));
    free.sort((x, y) => x.n - y.n || (x.s.id < y.s.id ? -1 : x.s.id > y.s.id ? 1 : 0));
    return free[0]?.s || null;
  }
  return { timeBlocked, bookedOverlap, workWindow, canDo, staffFree, slotsFor, pickAny };
}
