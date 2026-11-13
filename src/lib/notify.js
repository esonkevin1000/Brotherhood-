// Booking messages (T20, NOTIF-001-003): one email when a booking is confirmed, cancelled or moved. Each email has a key
// (email_log.ref, unique), so repeating a request or a retry can never send it twice; email_log keeps its status.
// App users also get the in-app/push notice from the routes. Partner shops send no transactional email (queueEmail skips them).
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const dayText = date => { const d = new Date(date + 'T00:00:00Z'); return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };
const t12 = t => { const [h, m] = String(t).split(':').map(Number); return `${(h % 12) || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };

export function createBookingMessages({ one, get, queueEmail, esc, shopName = () => 'Brotherhood Barber' }) {
  // the address to write to: the app account's email, else the customer record's
  const emailOf = b => { try { if (b.userId) { const u = one('select email from bh_users where id=?', b.userId); if (u?.email) return u.email; } } catch { } return (b.customerId && get('customers', b.customerId)?.email) || ''; };
  return function bookingMessage(kind, bookingId) {
    const b = one('select * from bookings where id=?', String(bookingId)); if (!b) return false;
    const to = emailOf(b); if (!to) return false;
    const branch = get('branches', b.branchId)?.name || '', barber = get('staff', b.staffId)?.name || 'any barber', when = `${dayText(b.date)} at ${t12(b.time)}`;
    const first = String(b.customerName || 'there').trim().split(/\s+/)[0];
    const M = {
      confirmed: { subject: `Booked: ${when}, ${branch}`, head: `You're booked, ${first}!`, line: `${when} with ${barber} at ${branch}.` },
      rescheduled: { subject: `Moved: your booking is now ${dayText(b.date)} ${b.time}, ${branch}`, head: 'Your booking was moved', line: `New time: ${when} with ${barber} at ${branch}.` },
      cancelled: { subject: `Cancelled: your ${dayText(b.date)} ${b.time} booking at ${branch}`, head: 'Your booking was cancelled', line: `${when} with ${barber} at ${branch} is cancelled. You are welcome to book another time.` },
    }[kind];
    if (!M) return false;
    const ref = kind === 'rescheduled' ? `rescheduled:${b.id}:${b.date}T${b.time}:${b.staffId}` : `${kind}:${b.id}`;
    const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto"><h2>${esc(M.head)}</h2><p>${esc(M.line)}</p><p style="color:#666;font-size:13px">${esc(shopName())}. Questions? Reply to this email or call the shop.</p><p style="color:#999;font-size:11px"><a href="{{UNSUB}}">Unsubscribe from promos</a></p></div>`;
    return queueEmail({ customerId: b.customerId || '', to, kind: 'booking-' + kind, subject: M.subject, html, text: `${M.head}\n\n${M.line}\n\n${shopName()}`, ref });
  };
}
