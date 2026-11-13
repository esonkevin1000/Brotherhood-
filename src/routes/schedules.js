// Barber weekly hours (T13). The owner, an admin or the branch's manager sets, per weekday, the branch hours (no entry),
// a day off, or custom hours. In branches using the new booking system the free booking times follow these hours.
import { NEXT } from '../lib/http.js';

const HM = /^([01]\d|2[0-3]):([0-5]\d)$|^24:00$/;
const toMin = v => { const [h, m] = String(v).split(':').map(Number); return h * 60 + m; };
const pad = n => String(n).padStart(2, '0'), hm = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function createScheduleRoutes({ all, run, get, log, tx, bad, send, readBody }) {
  // the week of one barber: 7 entries, each null (branch hours), 'off', or { start, end }
  const weekOf = staffId => {
    const days = Array(7).fill(null);
    for (const r of all('select weekday, startMin, endMin from staff_schedules where staffId=?', staffId)) days[r.weekday] = r.startMin === 0 && r.endMin === 0 ? 'off' : { start: hm(r.startMin), end: hm(r.endMin) };
    return days;
  };
  return async function handle({ req, res, p, q, method, me, manageIn }) {
    if (p === '/api/schedules' && method === 'GET') {
      const br = get('branches', String(q.branch || '')); if (!br) bad(400, 'Pick a branch');
      manageIn(br.id);
      return send(res, 200, all('select id, name from staff where branchId=? and active=1 order by name', br.id).map(s => ({ staffId: s.id, name: s.name, days: weekOf(s.id) })));
    }
    const sm = p.match(/^\/api\/schedules\/(\w+)$/);
    if (sm && method === 'PUT') {
      const s = get('staff', sm[1]); if (!s) bad(404, 'Barber not found');
      manageIn(s.branchId);
      const b = await readBody(req);
      if (b.days !== null && (!Array.isArray(b.days) || b.days.length !== 7)) bad(400, 'Send the 7 days of the week');
      const rows = [];
      (b.days || []).forEach((d, wd) => {
        if (d === null) return;
        if (d === 'off') return rows.push([wd, 0, 0]);
        if (!d || !HM.test(String(d.start)) || !HM.test(String(d.end))) bad(400, `${DAYS[wd]}: enter the times as HH:MM, for example 09:00`);
        const a = toMin(d.start), z = toMin(d.end); if (a >= z) bad(400, `${DAYS[wd]}: the start time must be before the end time`);
        rows.push([wd, a, z]);
      });
      tx(() => { run('delete from staff_schedules where staffId=?', s.id); for (const [wd, a, z] of rows) run('insert into staff_schedules(staffId, weekday, startMin, endMin) values(?,?,?,?)', s.id, wd, a, z); });
      const text = rows.map(([wd, a, z]) => `${DAYS[wd]} ${a === z ? 'off' : hm(a) + '-' + hm(z)}`).join(', ') || 'branch hours every day';
      log(me, 'schedule', 'staff', s.id, `${s.name}: ${text}`);
      return send(res, 200, { staffId: s.id, days: weekOf(s.id) });
    }
    return NEXT;
  };
}
