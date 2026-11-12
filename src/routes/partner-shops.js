// Partner shops: only Brotherhood's owner can add, pause, bill or open them.
// Created once by server.js; the handler gets the request and the logged-in person on each call.
import crypto from 'node:crypto';
import { NEXT } from '../lib/http.js';

export function createPartnerShopRoutes({ ownerUser, mainDb, curOrg, BAD_ORGS, orgRow, orgList, inOrg, uid, dOf, todayStr, nowISO, r2, sum, all, one, run, get, insert, update, log, normEmail, validEmail, mainSet, TRIAL_DAYS, PLAN_IDS, plansNow, payInfo, addMonthsStr, orgStatus, SIGNUPS_OPEN, esc2, sendEmail, makeToken, hashPw, bad, send, readBody }) {
  // returns NEXT when none of these routes matched
  return async function handle({ req, res, p, method, me }) {
    // ----- partner shops: only Brotherhood's owner can add, pause or open them -----
    if (p.startsWith('/api/orgs')) {
      if (curOrg() || me.role !== 'owner') bad(403, 'Only the Brotherhood owner can manage partner shops');
      if (p === '/api/orgs/plans' && method === 'PUT') {
        const b = await readBody(req, 20_000);
        if (Array.isArray(b.plans)) mainSet('plans', JSON.stringify(b.plans.filter(x => PLAN_IDS.includes(x?.id)).map(x => ({ id: x.id, price: Math.max(0, Math.round(+x.price || 0)), ...(x.desc ? { desc: String(x.desc).trim().slice(0, 120) } : {}) }))));
        if ('payInfo' in b) mainSet('payInfo', String(b.payInfo || '').trim().slice(0, 600));
        log(me, 'settings', 'orgs', '', 'plans'); return send(res, 200, { plans: plansNow(), payInfo: payInfo() });
      }
      if (p === '/api/orgs/plans' && method === 'GET') return send(res, 200, { plans: plansNow(), payInfo: payInfo(), trialDays: TRIAL_DAYS, signupOpen: SIGNUPS_OPEN });
      const om2 = p.match(/^\/api\/orgs(?:\/(\w+)(?:\/(enter|reset|payments))?)?$/); if (!om2) bad(404, 'Not found');
      const temp = () => crypto.randomBytes(9).toString('base64url').replace(/[-_]/g, 'x').slice(0, 10), since = dOf(new Date(Date.now() - 30 * 864e5));
      if (!om2[1] && method === 'GET') return send(res, 200, orgList().map(({ ownerHash, ...o }) => BAD_ORGS.has(o.id) ? { ...o, active: !!o.active, status: { state: 'error' }, paid: 0, branches: 0, barbers: 0, users: 0, sales30: 0 } : inOrg(o, () => ({ ...o, active: !!o.active, status: orgStatus(o), paid: r2(mainDb.prepare('select coalesce(sum(amount),0) t from org_payments where orgId=?').get(o.id).t),
        branches: one('select count(*) n from branches').n, barbers: one('select count(*) n from staff where active=1').n, users: one('select count(*) n from users where active=1').n,
        sales30: r2(one("select coalesce(sum(total),0) t from orders where status='paid' and date>=?", since).t) }))));
      if (!om2[1] && method === 'POST') {
        const b = await readBody(req), name = String(b.name || '').trim().slice(0, 60), code = String(b.code || '').trim().toLowerCase(), ou = String(b.ownerUser || '').trim().toLowerCase(), br = String(b.branch || '').trim().slice(0, 60) || name;
        if (name.length < 2) bad(400, 'Enter the shop name');
        if (!/^[a-z0-9-]{3,30}$/.test(code)) bad(400, 'Shop code: 3 to 30 letters, numbers or dashes (e.g. kingsman-cuts)');
        if (mainDb.prepare('select 1 x from orgs where code=?').get(code)) bad(409, 'That shop code is already used');
        if (!/^[a-z0-9._-]{3,30}$/.test(ou)) bad(400, 'Owner username: 3 to 30 letters, numbers, dot, dash or underscore');
        const id = uid(), pw = temp();
        mainDb.prepare('insert into orgs(id,code,name,ownerUser,ownerHash,active,createdAt) values(?,?,?,?,?,1,?)').run(id, code, name, ou, hashPw(pw), nowISO());
        inOrg(orgRow(id), () => { const bid = insert('branches', { name: br, openTime: '09:00', closeTime: '21:00', graceMins: 10 }).id; for (let i = 1; i <= 3; i++) insert('chairs', { branchId: bid, name: 'Chair ' + i, sort: i, active: 1 }); log({ name: 'Brotherhood' }, 'create', 'shop', id, name); });
        log(me, 'create', 'orgs', id, `${name} (${code})`);
        return send(res, 201, { id, code, name, ownerUser: ou, password: pw });
      }
      const g = orgRow(om2[1]); if (!g) bad(404, 'Partner shop not found');
      if (!om2[2] && method === 'PUT') {
        const b = await readBody(req);
        if ('name' in b) { const n = String(b.name || '').trim().slice(0, 60); if (n.length < 2) bad(400, 'Enter the shop name'); mainDb.prepare('update orgs set name=? where id=?').run(n, g.id); }
        if ('active' in b) mainDb.prepare('update orgs set active=? where id=?').run(b.active ? 1 : 0, g.id);
        if ('plan' in b) { if (b.plan && !PLAN_IDS.includes(b.plan)) bad(400, 'Unknown plan'); mainDb.prepare('update orgs set plan=? where id=?').run(b.plan || null, g.id); }
        for (const k of ['trialEnds', 'paidUntil']) if (k in b) { const v = String(b[k] || ''); if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) bad(400, 'Use a date like 2026-12-31'); mainDb.prepare(`update orgs set ${k}=? where id=?`).run(v || null, g.id); }
        for (const k of ['email', 'phone', 'ownerName']) if (k in b) { const v = String(b[k] || '').trim().slice(0, 120); if (k === 'email' && v && !validEmail(normEmail(v))) bad(400, 'Invalid email address'); mainDb.prepare(`update orgs set ${k}=? where id=?`).run(k === 'email' ? normEmail(v) : v, g.id); }
        log(me, 'update', 'orgs', g.id, JSON.stringify(b).slice(0, 200)); return send(res, 200, { ok: true });
      }
      if (om2[2] === 'reset' && method === 'POST') { const pw = temp(); mainDb.prepare('update orgs set ownerHash=? where id=?').run(hashPw(pw), g.id); log(me, 'reset-password', 'orgs', g.id, g.name); return send(res, 200, { ownerUser: g.ownerUser, password: pw }); }
      if (om2[2] === 'payments' && method === 'GET') return send(res, 200, mainDb.prepare('select * from org_payments where orgId=? order by paidAt desc').all(g.id));
      if (om2[2] === 'payments' && method === 'POST') {
        // Brotherhood records a monthly fee the shop paid (cash, GCash, bank). It moves "paid until" forward. Brotherhood issues its own BIR invoice for it.
        const b = await readBody(req), amount = r2(b.amount), months = Math.round(+b.months);
        if (!(amount > 0)) bad(400, 'Enter the amount paid'); if (!(months >= 1 && months <= 24)) bad(400, 'Months paid: 1 to 24');
        const start = g.paidUntil && g.paidUntil >= todayStr() ? g.paidUntil : todayStr(), until = addMonthsStr(start, months), pid = uid();
        mainDb.prepare('insert into org_payments(id,orgId,amount,months,method,ref,invoiceNo,note,paidAt,createdBy) values(?,?,?,?,?,?,?,?,?,?)')
          .run(pid, g.id, amount, months, String(b.method || '').slice(0, 30), String(b.ref || '').slice(0, 60), String(b.invoiceNo || '').slice(0, 40), String(b.note || '').slice(0, 200), nowISO(), me.name);
        mainDb.prepare('update orgs set paidUntil=?, active=1, plan=? where id=?').run(until, PLAN_IDS.includes(b.plan) ? b.plan : (g.plan || 'shop'), g.id);
        log(me, 'payment', 'orgs', g.id, `${g.name}: ${amount} for ${months} month(s), paid until ${until}`);
        if (g.email && validEmail(g.email)) sendEmail({ to: g.email, subject: `Brotherhood: payment received, active until ${until}`,
          html: `<p>Hi ${esc2(String(g.ownerName || '').split(' ')[0] || g.name)},</p><p>We received your payment of <b>PHP ${amount.toFixed(2)}</b> for <b>${months} month${months === 1 ? '' : 's'}</b>. <b>${esc2(g.name)}</b> is active until <b>${until}</b>.</p><p style="color:#666;font-size:13px">This email is a confirmation only. Your official invoice for the subscription is issued separately.</p><p>Salamat!<br>Brotherhood</p>`,
          text: `We received your payment of PHP ${amount.toFixed(2)} for ${months} month(s). ${g.name} is active until ${until}.\nThis email is a confirmation only. Your official invoice for the subscription is issued separately.` }).catch(() => { });
        return send(res, 201, { id: pid, paidUntil: until });
      }
      if (om2[2] === 'enter' && method === 'POST') { log(me, 'open', 'orgs', g.id, g.name); return send(res, 200, { token: makeToken('owner', String(g.ownerHash).slice(-8), g.id), name: g.name }); }
      bad(404, 'Not found');
    }
    return NEXT;
  };
}
