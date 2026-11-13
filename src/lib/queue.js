// The plan statuses of a visit (T22). The database keeps the shop's working statuses on orders (waiting, in_chair, paid, void,
// left) and on bookings (booked, arrived, cancelled, noshow, pending, expired); these names are what staff and the history show.
//   Appointment: confirmed -> checked_in -> in_service -> completed   (or cancelled / no_show)
//   Walk-in:     waiting -> assigned -> in_service -> completed       (or left / cancelled)
export function planOf(status, { booked = false, barberId = '' } = {}) {
  if (status === 'waiting') return booked ? 'checked_in' : barberId ? 'assigned' : 'waiting';
  return { in_chair: 'in_service', paid: 'completed', void: 'cancelled', left: 'left' }[status] || status;
}
// T23 (D-8): a walk-in may go to a barber only if the cut ends at least `buffer` minutes before that barber's next booked appointment.
// All times are minutes after midnight. busyUntil: when the barber's current cut ends (now if free). bookings: [{ start, mins }].
// Returns safeNow (he can take the walk-in now) and earliest: the first time he can safely start it (null if not today).
export function walkinFit({ now, mins, busyUntil = now, bookings = [], buffer = 5, close = 24 * 60 }) {
  let t = Math.max(now, busyUntil);
  for (const b of [...bookings].filter(b => b.start + b.mins > t).sort((x, y) => x.start - y.start)) {
    if (t + mins + buffer <= b.start) break;     // fits before this appointment
    t = Math.max(t, b.start + b.mins);          // otherwise, after it
  }
  const earliest = t + mins <= close ? t : null;
  return { safeNow: earliest === now && busyUntil <= now, earliest };
}
export const bookingPlan = s => ({ booked: 'confirmed', arrived: 'checked_in', cancelled: 'cancelled', noshow: 'no_show', pending: 'waiting_for_code', expired: 'expired' }[s] || s);
