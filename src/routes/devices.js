// Phones and tablets set up for a branch, so staff can log in by picking their name and typing their PIN (decision D-21).
// Setting one up, listing them and switching one off need an owner or admin login.
import { NEXT } from '../lib/http.js';

const DEVICE_DAYS = 365;   // a set-up phone keeps working for a year, or until it is switched off

export function createDeviceRoutes({ uid, nowISO, all, one, run, get, log, curOrg, makeToken, bad, send, readBody }) {
  return async function handle({ req, res, p, method, me, adminOnly }) {
    if (p === '/api/device/setup' && method === 'POST') {
      adminOnly();
      const b = await readBody(req), br = get('branches', String(b.branchId || '')); if (!br) bad(400, 'Pick the branch this phone is for');
      const id = uid() + uid(), name = String(b.name || '').trim().slice(0, 60) || br.name + ' phone';
      run('insert into devices(id,branchId,name,createdBy,createdAt,active) values(?,?,?,?,?,1)', id, br.id, name, me.name, nowISO());
      log(me, 'device-setup', 'devices', id, `${name} (${br.name})`);
      return send(res, 201, { deviceToken: makeToken('device:' + id, 'dev', curOrg()?.id, DEVICE_DAYS), device: { id, name, branchId: br.id, branchName: br.name } });
    }
    if (p === '/api/devices' && method === 'GET') {
      adminOnly();
      return send(res, 200, all("select d.id, d.name, d.branchId, b.name branchName, d.createdBy, d.createdAt, d.lastUsedAt from devices d left join branches b on b.id=d.branchId where d.active=1 order by d.createdAt desc"));
    }
    const dm = p.match(/^\/api\/devices\/(\w+)$/);
    if (dm && method === 'DELETE') {
      adminOnly(); const d = one('select * from devices where id=? and active=1', dm[1]); if (!d) bad(404, 'Not found');
      run('update devices set active=0 where id=?', d.id); log(me, 'device-off', 'devices', d.id, d.name);
      return send(res, 200, { ok: true });
    }
    return NEXT;
  };
}
