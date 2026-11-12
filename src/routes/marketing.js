// Email marketing (campaigns to customers who said yes, the automatic "we miss you" email) and the settings test email.
// Created once by server.js; the handler gets the request and the logged-in person on each call.
import { NEXT } from '../lib/http.js';

export function createMarketingRoutes({ curOrg, uid, nowISO, all, one, run, insert, log, normEmail, validEmail, TIERS, setSetting, NO_MAIL, mailCount, baseUrl, welcomeEmail, processEmails, AUD_WHO, audienceOf, promoEmail, queueMarketing, winbackCfg, runWinback, mailProvider, mailReady, MAIL_LIMIT, mailFrom, sendEmail, bad, send, readBody }) {
  // returns NEXT when none of these routes matched
  return async function handle({ req, res, p, method, me, adminOnly }) {
    // ----- email marketing: promos and the automatic "we miss you" email -----
    if (p.startsWith('/api/marketing')) {
      adminOnly();
      const msgOf = b => { const subject = String(b.subject || '').trim().slice(0, 150), body = String(b.body || '').trim().slice(0, 5000); if (subject.length < 3) bad(400, 'Write a subject'); if (body.length < 10) bad(400, 'Write the message'); return { subject, body, btnText: String(b.btnText || '').trim().slice(0, 40), btnUrl: String(b.btnUrl || '').trim().slice(0, 300) }; };
      const audOf = b => { const a = b.audience || {}; return { who: AUD_WHO.includes(a.who) ? a.who : 'all', days: Math.max(7, Math.min(365, +a.days || 45)), tier: String(a.tier || ''), branchId: String(a.branchId || '') }; };
      if (p === '/api/marketing' && method === 'GET') {
        const camps = all('select * from campaigns order by createdAt desc limit 50').map(c => ({ ...c, audience: (() => { try { return JSON.parse(c.audience); } catch { return {}; } })(), stats: Object.fromEntries(all('select status, count(*) n from email_log where campaignId=? group by status', c.id).map(r => [r.status, r.n])) }));
        return send(res, 200, { provider: mailProvider(), from: mailFrom(), limit: MAIL_LIMIT, sentToday: mailCount(), pending: one("select count(*) n from email_log where status='pending'").n,
          subscribers: audienceOf({}).length, campaigns: camps, winback: winbackCfg(), winbackSent: one("select count(*) n from email_log where kind='winback' and status='sent'").n, tiers: TIERS.map(x => x[1]).reverse(), isOrg: !!curOrg() });
      }
      if (p === '/api/marketing/count' && method === 'POST') { const r = audienceOf(audOf(await readBody(req))); return send(res, 200, { count: r.length, sample: r.slice(0, 5).map(c => c.name) }); }
      if (p === '/api/marketing/test' && method === 'POST') {
        const b = await readBody(req, 50_000), to = normEmail(b.to), msg = msgOf(b); if (!validEmail(to)) bad(400, 'Type your email address for the test');
        if (!mailReady()) bad(409, NO_MAIL());
        const m = promoEmail({ name: me.name, ...msg }), unsub = baseUrl() + '/unsubscribe?test=1';
        const r = await sendEmail({ to, subject: 'TEST: ' + m.subject, html: m.html.replaceAll('{{UNSUB}}', unsub), text: m.text.replaceAll('{{UNSUB}}', unsub), fromName: curOrg() ? curOrg().name : '', replyTo: curOrg() ? curOrg().email || '' : '' });
        if (!r.ok) bad(502, r.error); log(me, 'test-email', 'campaigns', '', to); return send(res, 200, { ok: true });
      }
      if (p === '/api/marketing/send' && method === 'POST') {
        const b = await readBody(req, 50_000), msg = msgOf(b), aud = audOf(b); if (!mailReady()) bad(409, NO_MAIL());
        const rows = audienceOf(aud); if (!rows.length) bad(400, 'Nobody in this group has an email and said yes to promos');
        const id = uid(); run('insert into campaigns(id,subject,body,btnText,btnUrl,audience,total,createdBy,createdAt) values(?,?,?,?,?,?,?,?,?)', id, msg.subject, msg.body, msg.btnText, msg.btnUrl, JSON.stringify(aud), rows.length, me.name, nowISO());
        for (const c of rows) queueMarketing(c, 'campaign', msg, id);
        log(me, 'create', 'campaigns', id, `${msg.subject} (${rows.length} people)`); setTimeout(() => processEmails().catch(() => { }), 50);
        return send(res, 201, { id, total: rows.length, days: Math.ceil((rows.length + mailCount()) / MAIL_LIMIT) });
      }
      if (p === '/api/marketing/winback' && method === 'PUT') {
        const b = await readBody(req, 50_000), cur = winbackCfg();
        const next = { on: !!b.on, days: Math.max(14, Math.min(180, Math.round(+b.days || cur.days))), subject: String(b.subject ?? cur.subject).trim().slice(0, 150) || cur.subject, body: String(b.body ?? cur.body).trim().slice(0, 5000) || cur.body, btnText: String(b.btnText ?? cur.btnText).trim().slice(0, 40) };
        if (next.on && !mailReady()) bad(409, NO_MAIL());
        setSetting('winback', JSON.stringify(next)); log(me, 'settings', 'campaigns', '', 'we-miss-you email ' + (next.on ? 'on, ' + next.days + ' days' : 'off'));
        if (next.on) runWinback(); return send(res, 200, next);
      }
      bad(404, 'Not found');
    }
    if (p === '/api/settings/test-email' && method === 'POST') {
      adminOnly(); const to = normEmail((await readBody(req)).to); if (!validEmail(to)) bad(400, 'Invalid email address');
      if (!mailReady()) bad(409, NO_MAIL());
      const w = welcomeEmail({ name: me.name }), unsub = baseUrl() + '/unsubscribe?test=1';
      const r = await sendEmail({ to, subject: 'TEST: ' + w.subject, html: w.html.replaceAll('{{UNSUB}}', unsub), text: w.text.replaceAll('{{UNSUB}}', unsub) });
      if (!r.ok) bad(502, r.error); log(me, 'test-email', 'settings', '', to); return send(res, 200, { ok: true });
    }
    return NEXT;
  };
}
