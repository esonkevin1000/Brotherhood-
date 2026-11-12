// Generic add / edit / remove for the back office: branches, chairs, barbers, categories, services and products,
// discounts, customers, users and equipment. Admin only; the front desk may add and edit customers.
// Created once by server.js; the handler gets the request and the logged-in person on each call.
import { NEXT } from '../lib/http.js';

export function createBackOfficeDataRoutes({ nowISO, one, run, get, insert, update, strip, log, isBranchUser, REFS, SOFT, CRUD, checkUser, setPw, bad, send, readBody }) {
  // returns NEXT when none of these routes matched
  return async function handle({ req, res, p, method, me, admin, adminOnly }) {
    // ----- generic CRUD (admin only; cashiers may add/edit customers) -----
    const m = p.match(/^\/api\/(\w+)(?:\/(\w+))?$/);
    if (!m || !CRUD.has(m[1])) bad(404, 'Not found');
    const [, kind, id] = m;
    if (!(kind === 'customers' && isBranchUser(me) && (method === 'POST' || method === 'PUT'))) adminOnly();
    if (method === 'POST' && !id) {
      const b = await readBody(req);
      if (kind !== 'users') { b.name = String(b.name || '').trim(); if (!b.name) bad(400, 'Name required'); }
      if (kind === 'customers') b.createdAt = nowISO();
      if ((kind === 'chairs' || kind === 'staff') && !get('branches', b.branchId)) bad(400, 'Pick a branch');
      if (kind === 'staff' && (b.pct === undefined || b.pct === '')) b.pct = get('branches', b.branchId)?.defaultPct ?? 40;
      if (kind === 'items' && !(+b.price >= 0)) bad(400, 'Check the price');
      if (kind === 'staff' || kind === 'chairs' || kind === 'items' || kind === 'discounts') b.active ??= 1;
      if (kind === 'items') { b.bookable ??= b.type === 'service' ? 1 : 0; b.apptOnly ??= 0; }
      let row;
      if (kind === 'users') { checkUser(b, null); b.active = 1; row = insert('users', b); setPw(row.id, b); row = strip(get('users', row.id)); } else row = insert(kind, b);
      log(me, 'create', kind, row.id, row.name || ''); return send(res, 201, row);
    }
    if (method === 'PUT' && id) {
      const cur = get(kind, id); if (!cur) bad(404, 'Not found'); const b = await readBody(req); delete b.createdAt;
      if ('name' in b && !String(b.name).trim()) bad(400, 'Name required');
      let row;
      if (kind === 'users') { checkUser(b, cur); update('users', id, b); setPw(id, b); row = strip(get('users', id)); } else row = update(kind, id, b);
      if ((kind === 'staff' || kind === 'items' || kind === 'branches') && 'photo' in b && cur.photo && cur.photo !== b.photo) { const im = /\/img\/(\w+)/.exec(cur.photo); if (im) run('delete from images where id=?', im[1]); }
      log(me, 'update', kind, id, JSON.stringify({ ...b, password: b.password ? '***' : undefined, pin: b.pin ? '***' : undefined })); return send(res, 200, row);
    }
    if (method === 'DELETE' && id) {
      if (kind === 'users' && id === me.id) bad(409, 'You cannot delete yourself');
      const used = (REFS[kind] || []).some(([t, c]) => one(`select 1 x from ${t} where ${c}=?`, id));
      if (used) {
        if (SOFT.has(kind)) { run(`update ${kind} set active=0 where id=?`, id); log(me, 'deactivate', kind, id, ''); return send(res, 200, { ok: true, deactivated: true }); }
        bad(409, 'This is still in use, so it cannot be deleted');
      }
      run(`delete from ${kind} where id=?`, id); log(me, 'delete', kind, id, ''); return send(res, 200, { ok: true });
    }
    bad(405, 'Method not allowed');
    return NEXT;
  };
}
