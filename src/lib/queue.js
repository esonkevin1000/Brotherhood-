// The plan statuses of a visit (T22). The database keeps the shop's working statuses on orders (waiting, in_chair, paid, void,
// left) and on bookings (booked, arrived, cancelled, noshow, pending, expired); these names are what staff and the history show.
//   Appointment: confirmed -> checked_in -> in_service -> completed   (or cancelled / no_show)
//   Walk-in:     waiting -> assigned -> in_service -> completed       (or left / cancelled)
export function planOf(status, { booked = false, barberId = '' } = {}) {
  if (status === 'waiting') return booked ? 'checked_in' : barberId ? 'assigned' : 'waiting';
  return { in_chair: 'in_service', paid: 'completed', void: 'cancelled', left: 'left' }[status] || status;
}
export const bookingPlan = s => ({ booked: 'confirmed', arrived: 'checked_in', cancelled: 'cancelled', noshow: 'no_show', pending: 'waiting_for_code', expired: 'expired' }[s] || s);
