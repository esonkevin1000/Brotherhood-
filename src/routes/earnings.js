// Earnings (T34, E2, BAR-007): the commission entries of the service records (T33). A barber sees only his own; a manager sees the
// barbers of his branches; the owner and admins see all. "This week" runs Monday to today, like the barber's dashboard.
import { NEXT } from '../lib/http.js';

export function createEarningsRoutes({ all, one, get, todayStr, dOf, r2, isAdmin, inScope, bad, send }) {
  const monday = () => { const n = new Date(); n.setDate(n.getDate() - ((n.getDay() + 6) % 7)); return dOf(n); };
  const totalOf = (sid, from, to) => { const x = one('select ifnull(sum(amount),0) s, count(*) n from commission_entries where staffId=? and date>=? and date<=?', sid, from, to); return { from, to, total: r2(x.s), entries: x.n }; };
  // who may see this barber's earnings
  function allowed(me, s) {
    if (isAdmin(me)) return true;
    if (me.role === 'manager') return inScope(me, s.branchId);
    if (me.role === 'barber') return (get('users', me.id)?.staffId || '') === s.id;
    return false;
  }
  return async function handle({ res, p, q, method, me }) {
    if (p === '/api/earnings' && method === 'GET') {
      const own = me.role === 'barber' ? get('users', me.id)?.staffId || '' : '';
      const s = get('staff', String(q.staffId || own)); if (!s) bad(me.role === 'barber' ? 403 : 404, 'Barber not found');
      if (!allowed(me, s)) bad(403, 'You can only see your own earnings');
      const t = todayStr();
      const entries = all(`select e.*, o.no visitNo, o.customerName from commission_entries e left join orders o on o.id=e.orderId where e.staffId=? order by e.createdAt desc, e.rowid desc limit 300`, s.id)
        .map(e => ({ id: e.id, date: e.date, orderDate: e.orderDate, visitNo: e.visitNo || null, kind: e.kind, amount: r2(e.amount), pct: e.pct, base: r2(e.base), productComm: r2(e.productComm), reason: e.reason || '' }));
      return send(res, 200, { staff: { id: s.id, name: s.name, pct: s.pct }, today: totalOf(s.id, t, t), period: totalOf(s.id, monday(), t), all: totalOf(s.id, '0000-01-01', '9999-12-31'), entries });
    }
    if (p === '/api/earnings/branch' && method === 'GET') {   // per-barber totals for a branch: managers and the owner
      if (!isAdmin(me) && me.role !== 'manager') bad(403, 'Not allowed for your role');
      const br = String(q.branch || (me.branchIds || [])[0] || ''); if (!get('branches', br)) bad(400, 'Choose a branch');
      if (!inScope(me, br)) bad(403, 'Not your branch');
      const t = todayStr(), m = monday();
      const barbers = all('select id, name from staff where branchId=? order by name', br).map(s => ({ id: s.id, name: s.name, today: totalOf(s.id, t, t).total, period: totalOf(s.id, m, t).total }))
        .filter(b => b.today || b.period || get('staff', b.id)?.active);
      return send(res, 200, { branch: get('branches', br).name, from: m, to: t, barbers });
    }
    return NEXT;
  };
}
