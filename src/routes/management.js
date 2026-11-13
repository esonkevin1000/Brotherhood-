// Back-office management: the start-up data for the back office, activity log, backup download, customers,
// reviews, one commission rate for a branch, PIN and password resets, and settings.
// Created once by server.js; the handler gets the request and the logged-in person on each call.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { NEXT } from '../lib/http.js';

export function createManagementRoutes({ SECRET_WARNINGS, PASS, ownerUser, mainDb, curOrg, db, shopName, uid, todayStr, nowISO, r2, sum, all, one, run, get, insert, update, strip, pinKeyOf, log, BK_DIR, backup, isAdmin, isBranchUser, isManager, inScope, branchOrAll, MODULES, permsAll, modulesFor, normPhone, normEmail, validEmail, tierOf, getSetting, setSetting, getTerms, EMAIL, orgInfo, baseUrl, rememberOrigin, custCard, findCustomer, upsertCustomer, editCustomer, G_KEY, payRules, mailProvider, mailReady, mailFrom, makeToken, hashPw, checkPw, sha, bad, send, readBody }) {
  // returns NEXT when none of these routes matched
  return async function handle({ req, res, p, method, q, me, admin, adminOnly, manageIn }) {
    // ----- admin data -----
    if (p === '/api/state' && method === 'GET') {
      if (admin) rememberOrigin(req);
      if (isManager(me)) {   // a manager's back office: only their branches and the people in them; services and prices to read (T7b)
        const mine = x => me.branchIds.includes(x.branchId);
        return send(res, 200, { shop: shopName(), org: orgInfo(), me, modules: modulesFor(me.role), branches: all('select * from branches order by rowid').filter(x => me.branchIds.includes(x.id)),
          chairs: all('select * from chairs order by branchId, sort').filter(mine), staff: all('select * from staff order by name').filter(mine),
          categories: all('select * from categories order by name'), items: all('select * from items order by name'), discounts: all('select * from discounts order by name'),
          users: all("select * from users where role in ('cashier','barber') order by name").filter(mine).map(strip), equipment: all('select * from equipment order by branchId, name').filter(mine) });
      }
      if (!admin) { const su = get('users', me.id), sp = su && su.staffId ? get('staff', su.staffId) : null; return send(res, 200, { shop: shopName(), org: orgInfo(), me: sp ? { ...me, photo: sp.photo || '' } : me, modules: modulesFor(me.role) }); }   // a barber's own profile picture
      return send(res, 200, {
        ...(!curOrg() ? { secretWarnings: SECRET_WARNINGS } : {}),   // owner and admins of Brotherhood see weak live settings
        shop: shopName(), org: orgInfo(), me, branches: all('select * from branches order by rowid'), chairs: all('select * from chairs order by branchId, sort'), staff: all('select * from staff order by name'),
        categories: all('select * from categories order by name'), items: all('select * from items order by name'), discounts: all('select * from discounts order by name'),
        users: all('select * from users order by name').map(strip), equipment: all('select * from equipment order by branchId, name')
      });
    }
    if (p === '/api/audit' && method === 'GET') { adminOnly(); return send(res, 200, all('select * from audit order by n desc limit 300')); }
    if (p === '/api/backup' && method === 'GET') {
      if (me.role !== 'owner') bad(403, 'Owner only');
      const tmp = path.join(os.tmpdir(), `bk-${uid()}.db`); backup(tmp); const buf = fs.readFileSync(tmp); fs.rmSync(tmp);
      log(me, 'download-backup', 'backup', '', '');
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="brotherhood-${todayStr()}.db"` });
      return res.end(buf);
    }

    // ----- customers (admins + cashiers) -----
    if (p === '/api/customers' && method === 'GET') {
      const term = '%' + String(q.q || '').trim().toLowerCase() + '%', size = Math.min(100, +q.size || 20), off = Math.max(0, (+q.page || 1) - 1) * size;
      const T = { member: [0, 4], bronze: [5, 15], silver: [16, 25], gold: [26, 50], vip: [51, 1e9] }[String(q.tier || '').toLowerCase()];
      const BR = q.branch && q.branch !== 'all' && get('branches', String(q.branch)) ? String(q.branch) : null;
      const base = `select c.*, (select count(*) from orders o where o.customerId=c.id and o.status='paid') visits, (select ifnull(sum(o.total),0) from orders o where o.customerId=c.id and o.status='paid') spent,
      (select max(o.paidAt) from orders o where o.customerId=c.id and o.status='paid') lastVisit,
      ifnull((select o.branchId from orders o where o.customerId=c.id and o.status='paid' order by o.paidAt desc limit 1), c.branchId) homeBranch from customers c
      where lower(c.name||' '||ifnull(c.phone,'')||' '||ifnull(c.email,'')||' '||ifnull(c.preferredCut,'')) like ?`;
      const conds = [T ? 'visits between ? and ?' : '', BR ? 'homeBranch = ?' : ''].filter(Boolean), where = conds.length ? ' where ' + conds.join(' and ') : '';
      const args = [term, ...(T ? [T[0], T[1]] : []), ...(BR ? [BR] : [])];
      const rows = all(`select * from (${base}) ${where} order by (lastVisit is null), lastVisit desc, createdAt desc limit ${size} offset ${off}`, ...args)
        .map(c => ({ ...c, spent: r2(c.spent), tier: tierOf(c.visits), branchName: get('branches', c.homeBranch || '')?.name || '' }));
      return send(res, 200, { total: one(`select count(*) n from (${base}) ${where}`, ...args).n, rows });
    }  if (p === '/api/customers/lookup' && method === 'GET') { const c = findCustomer(q.phone, q.email); return send(res, 200, { customer: c ? custCard(c) : null }); }
    if (p === '/api/customers' && method === 'POST') {
      const b = await readBody(req), c = upsertCustomer(b, isAdmin(me) ? 'admin' : 'pos', isBranchUser(me) ? me.branchId : (get('branches', String(b.branchId || '')) && inScope(me, String(b.branchId)) ? b.branchId : null));
      if (!c) bad(400, 'A phone number or an email is required to join the Customer Directory.');
      log(me, 'customer', 'customers', c.id, c.name); return send(res, 201, custCard(c));
    }
    const cum = p.match(/^\/api\/customers\/(\w+)$/);
    if (cum && method === 'PUT') {
      const cur = get('customers', cum[1]); if (!cur) bad(404, 'Not found');
      const c = editCustomer(cur, await readBody(req)); log(me, 'update', 'customers', c.id, c.name); return send(res, 200, custCard(c));
    }
    if (cum && method === 'DELETE') { adminOnly(); run('delete from customers where id=?', cum[1]); log(me, 'delete', 'customers', cum[1], ''); return send(res, 200, { ok: true }); }
    if (p === '/api/customers/import' && method === 'POST') {
      adminOnly(); const b = await readBody(req, 8_000_000), rows = Array.isArray(b.rows) ? b.rows.slice(0, 20000) : [];
      let added = 0, skipped = 0; db.exec('begin');
      try {
        for (const r of rows) {
          const name = String(r.name || '').trim().slice(0, 200), imBr = get('branches', String(b.branchId || '')) ? b.branchId : null, phone = String(r.phone || '').trim().slice(0, 40), email = normEmail(r.email).slice(0, 200), pk = normPhone(phone);
          if (!name || (!pk && !(email && validEmail(email))) || findCustomer(phone, email)) { skipped++; continue; }   // directory rule: needs phone or email
          run('insert into customers(id,name,phone,email,notes,createdAt,preferredCut,consent,phoneKey,emailKey,source,branchId) values(?,?,?,?,?,?,?,0,?,?,?,?)', uid(), name, phone, validEmail(email) ? email : '', '', nowISO(), String(r.preferredCut || '').slice(0, 200), pk || null, validEmail(email) ? email : null, 'import', imBr); added++;
        }
        db.exec('commit');
      } catch (e) { db.exec('rollback'); throw e; }
      log(me, 'import', 'customers', '', `${added} added, ${skipped} skipped`);
      return send(res, 200, { added, skipped });
    }

    // ----- reviews (admin can read and delete) -----
    if (p === '/api/reviews' && method === 'GET') {
      adminOnly(); return send(res, 200, all('select r.*, b.name branchName, s.name staffName from reviews r left join branches b on b.id=r.branchId left join staff s on s.id=r.staffId order by r.createdAt desc limit 500'));
    }
    const rvm = p.match(/^\/api\/reviews\/(\w+)$/);
    if (rvm && method === 'DELETE') {
      adminOnly(); const r = one('select * from reviews where id=?', rvm[1]); if (!r) bad(404, 'Not found');
      run('delete from reviews where id=?', r.id); log(me, 'delete', 'reviews', r.id, `${r.name} ${r.rating} stars`); return send(res, 200, { ok: true });
    }
    // ----- branch settings: apply one commission rate to every barber of a branch -----
    const apm = p.match(/^\/api\/branches\/(\w+)\/apply-commission$/);
    if (apm && method === 'POST') {
      adminOnly(); const br = get('branches', apm[1]); if (!br) bad(404, 'Not found');
      const pct = +(await readBody(req)).pct; if (!(pct >= 0 && pct <= 100)) bad(400, 'Commission must be between 0 and 100');
      run('update branches set defaultPct=? where id=?', pct, br.id); const r = run('update staff set pct=? where branchId=?', pct, br.id);
      log(me, 'apply-commission', 'branches', br.id, `${pct}% to ${r.changes} barbers`); return send(res, 200, { ok: true, updated: Number(r.changes) });
    }
    // ----- reset a user's PIN / password (shown once) -----
    const urm = p.match(/^\/api\/users\/(\w+)\/reset$/);
    if (urm && method === 'POST') {
      const u = get('users', urm[1]);
      if (isManager(me)) { if (!u || !['cashier', 'barber'].includes(u.role) || !inScope(me, u.branchId)) bad(403, 'A manager can reset PINs of their own branches only'); } else adminOnly();
      if (!u) bad(404, 'Not found');
      if ((u.role === 'admin' || u.role === 'owner') && me.role !== 'owner') bad(403, 'Only the owner can reset an admin');
      if (u.role === 'admin' || u.role === 'owner' || u.role === 'manager') { const pw = crypto.randomBytes(u.role === 'owner' ? 12 : 6).toString('base64url'); run('update users set passHash=? where id=?', hashPw(pw), u.id); log(me, 'reset-password', 'users', u.id, u.name); return send(res, 200, { password: pw }); }
      let pin; do { pin = String(100000 + crypto.randomInt(900000)); } while (one('select 1 x from users where pinKey=?', pinKeyOf(pin)));
      run('update users set pinKey=? where id=?', pinKeyOf(pin), u.id); log(me, 'reset-pin', 'users', u.id, u.name); return send(res, 200, { pin });
    }
    // ----- settings: terms, email (admin) -----
    if (p === '/api/settings' && method === 'GET') {
      adminOnly();
      return send(res, 200, { payRules: payRules(), pinOnly: getSetting('pinOnly') !== '0', attPhoto: getSetting('attPhoto') !== '0', attGeo: getSetting('attGeo') === '1', ownerUser: ownerUser(), isOwner: me.role === 'owner', google: { configured: !!G_KEY }, perms: permsAll(), modules: MODULES, terms: getTerms(), customTerms: !!getSetting('terms'), email: { configured: mailReady(), provider: mailProvider(), from: mailFrom(), replyTo: EMAIL.replyTo, baseUrl: baseUrl() },
        log: all('select id,toAddr,kind,subject,status,attempts,error,createdAt,sentAt from email_log order by createdAt desc limit 25') });
    }
    if (p === '/api/settings' && method === 'PUT') {
      adminOnly(); const b = await readBody(req, 50_000);
      if ('attPhoto' in b) setSetting('attPhoto', b.attPhoto ? '1' : '0');
      if ('pinOnly' in b) { setSetting('pinOnly', b.pinOnly ? '1' : '0'); log(me, 'settings', 'settings', '', 'PIN-only login ' + (b.pinOnly ? 'on' : 'off')); }
      if ('attGeo' in b) setSetting('attGeo', b.attGeo ? '1' : '0');
      if (b.payRules) { for (const k of ['lunchAmount', 'lunchLateMins', 'allowLateMins']) if (k in b.payRules) { const v = Number(b.payRules[k]); if (!(v >= 0 && v <= 100000)) bad(400, 'Enter a valid number'); setSetting(k, String(v)); } log(me, 'pay-rules', 'settings', '', JSON.stringify(payRules())); }
      if ('terms' in b) setSetting('terms', String(b.terms || '').trim().slice(0, 8000));
      if (b.perms && typeof b.perms === 'object') {
        const cur = permsAll(), next = {}; for (const role of ['cashier', 'barber']) next[role] = Array.isArray(b.perms[role]) ? b.perms[role].filter(m => MODULES.includes(m)) : cur[role];
        setSetting('perms', JSON.stringify(next)); log(me, 'settings', 'settings', '', 'access ' + JSON.stringify(next));
      }
      log(me, 'settings', 'settings', '', 'terms'); return send(res, 200, { ok: true });
    }
    if (p === '/api/settings/reset' && method === 'POST') {
      if (me.role !== 'owner') bad(403, 'Only the owner can reset data');
      const b = await readBody(req); if (b.confirm !== 'RESET') bad(400, 'Type RESET to confirm');
      if (!b.sales && !b.bookings && !b.reviews && !b.customers) bad(400, 'Choose what to reset');
      const file = path.join(BK_DIR, 'pre-reset-' + nowISO().replace(/[:.]/g, '-') + '.db'); backup(file);   // safety copy first
      const gone = {}; db.exec('begin');
      try {
        if (b.sales) for (const tb of ['orders', 'shifts', 'cash_moves', 'zreadings', 'attendance', 'payroll_days']) gone[tb] = Number(run(`delete from ${tb}`).changes);
        if (b.bookings) { gone.bookings = Number(run('delete from bookings').changes); run('delete from booking_events'); }
        if (b.reviews) gone.reviews = Number(run('delete from reviews').changes);
        if (b.customers) { gone.customers = Number(run('delete from customers').changes); gone.emails = Number(run('delete from email_log').changes); }
        db.exec('commit');
      } catch (e) { db.exec('rollback'); throw e; }
      log(me, 'reset-data', 'settings', '', JSON.stringify(gone)); return send(res, 200, { ok: true, deleted: gone, backup: path.basename(file) });
    }
    if (p === '/api/settings/owner-username' && method === 'PUT') {
      if (me.role !== 'owner') bad(403, 'Only the owner can change the owner username');
      const b = await readBody(req), u = String(b.username || '').trim().toLowerCase();
      if (u && !/^[a-z0-9._-]{3,30}$/.test(u)) bad(400, 'Username must be 3 to 30 characters: letters, numbers, dot, dash or underscore');
      if (u && one('select 1 x from users where lower(username)=?', u)) bad(409, 'That username is already used by another user');
      if (curOrg()) {
        if (!u) bad(400, 'Enter a username');
        if (!checkPw(String(b.password || ''), curOrg().ownerHash)) bad(403, 'Wrong password. Enter your current owner password to confirm.');
        mainDb.prepare('update orgs set ownerUser=? where id=?').run(u, curOrg().id); log(me, 'owner-username', 'settings', '', u);
        return send(res, 200, { ok: true, username: u });
      }
      if (!crypto.timingSafeEqual(sha(String(b.password || '')), sha(PASS))) bad(403, 'Wrong password. Enter your current owner password to confirm.');
      setSetting('ownerUser', u); log(me, 'owner-username', 'settings', '', u || '(blank)');
      return send(res, 200, { ok: true, username: u });
    }
    if (p === '/api/settings/owner-password' && method === 'PUT') {   // partner shop owners set their own password (Brotherhood's owner password is a hosting variable)
      if (me.role !== 'owner' || !curOrg()) bad(403, 'Only a partner shop owner can change the password here');
      const b = await readBody(req), np = String(b.newPassword || '');
      if (!checkPw(String(b.password || ''), curOrg().ownerHash)) bad(403, 'Wrong current password');
      if (np.length < 8) bad(400, 'The new password needs at least 8 characters');
      const h = hashPw(np); mainDb.prepare('update orgs set ownerHash=? where id=?').run(h, curOrg().id); log(me, 'owner-password', 'settings', '', '');
      return send(res, 200, { ok: true, token: makeToken('owner', h.slice(-8), curOrg().id) });
    }
    return NEXT;
  };
}
