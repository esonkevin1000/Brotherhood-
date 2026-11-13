// Generic add / edit / remove for the back office: branches, chairs, barbers, categories, services and products,
// discounts, customers, users and equipment. Admin only; the front desk may add and edit customers.
// Created once by server.js; the handler gets the request and the logged-in person on each call.
import { NEXT } from '../lib/http.js';

export function createBackOfficeDataRoutes({ nowISO, one, run, get, insert, update, strip, log, isBranchUser, isManager, inScope, branchOrAll, newPin, REFS, SOFT, CRUD, checkUser, setPw, bad, send, readBody }) {
  // returns NEXT when none of these routes matched
  return async function handle({ req, res, p, method, me, admin, adminOnly }) {
    // ----- generic CRUD (admin only; cashiers may add/edit customers) -----
    const m = p.match(/^\/api\/(\w+)(?:\/(\w+))?$/);
    if (!m || !CRUD.has(m[1])) bad(404, 'Not found');
    const [, kind, id] = m;
    // a manager may manage the front desk and barber logins of their own branches (checked below); everything else here is admin only
    const managerUsers = kind === 'users' && isManager(me), deskOnly = r => ['cashier', 'barber'].includes(r);
    if (!(kind === 'customers' && (isBranchUser(me) || isManager(me)) && (method === 'POST' || method === 'PUT')) && !managerUsers) adminOnly();
    const staffOk = sid => !sid || inScope(me, get('staff', String(sid))?.branchId);
    const mgrNo = () => bad(403, 'A manager can manage front desk and barber logins of their own branches only');
    // a manager never picks a PIN or password: "PIN already used" would reveal other branches' PINs, and a password would let them log in as that person
    const mgrSecrets = b => { if (managerUsers && ('pin' in b || 'password' in b)) bad(403, 'A manager cannot choose a PIN or password. A new PIN is made for you; use Reset PIN to get another one.'); };
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
      if (managerUsers && (!deskOnly(b.role) || !inScope(me, b.branchId) || !staffOk(b.staffId))) mgrNo();
      mgrSecrets(b); const madePin = managerUsers ? (b.pin = newPin()) : null;
      if (kind === 'users' && b.role === 'owner' && me.role !== 'owner') bad(403, 'Only an owner can create an owner account');
      if (kind === 'users') { checkUser(b, null); b.active = 1; row = insert('users', b); setPw(row.id, b); row = { ...strip(get('users', row.id)), ...(madePin ? { pin: madePin } : {}) }; } else row = insert(kind, b);
      log(me, 'create', kind, row.id, row.name || ''); return send(res, 201, row);
    }
    if (method === 'PUT' && id) {
      const cur = get(kind, id); if (!cur) bad(404, 'Not found'); const b = await readBody(req); delete b.createdAt;
      if ('name' in b && !String(b.name).trim()) bad(400, 'Name required');
      let row;
      if (managerUsers && (!deskOnly(cur.role) || !inScope(me, cur.branchId) || !deskOnly('role' in b ? b.role : cur.role) || !inScope(me, 'branchId' in b ? b.branchId : cur.branchId) || !staffOk(b.staffId) || 'branchIds' in b)) mgrNo();
      mgrSecrets(b);
      if (kind === 'users' && (cur.role === 'owner' || b.role === 'owner') && me.role !== 'owner') bad(403, 'Only an owner can change an owner account');
      // as with resets: only an owner may change another admin's account (otherwise an admin could set its password and take it over)
      if (kind === 'users' && cur.role === 'admin' && id !== me.id && me.role !== 'owner') bad(403, 'Only the owner can change another admin account');
      if (kind === 'users') { checkUser(b, cur); update('users', id, b); setPw(id, b); row = strip(get('users', id)); } else row = update(kind, id, b);
      if ((kind === 'staff' || kind === 'items' || kind === 'branches') && 'photo' in b && cur.photo && cur.photo !== b.photo) { const im = /\/img\/(\w+)/.exec(cur.photo); if (im) run('delete from images where id=?', im[1]); }
      log(me, 'update', kind, id, JSON.stringify({ ...b, password: b.password ? '***' : undefined, pin: b.pin ? '***' : undefined })); return send(res, 200, row);
    }
    if (method === 'DELETE' && id) {
      if (kind === 'users' && id === me.id) bad(409, 'You cannot delete yourself');
      if (managerUsers) { const t = get('users', id); if (!t || !deskOnly(t.role) || !inScope(me, t.branchId)) mgrNo(); }
      if (kind === 'users' && get('users', id)?.role === 'owner' && me.role !== 'owner') bad(403, 'Only an owner can remove an owner account');
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
