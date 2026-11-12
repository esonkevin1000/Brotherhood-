// Sending email: a Gmail account (or any SMTP account) first, else Resend. No database access in here:
// the caller tells us how many emails went out today and is told when one more was sent.
//
// Variables: GMAIL_USER = the Gmail address, GMAIL_APP_PASSWORD = a 16-letter App Password (Google Account, Security, App passwords).
//            Or RESEND_API_KEY, EMAIL_FROM, EMAIL_REPLY_TO for Resend. EMAIL_DAILY_LIMIT changes the daily limit.
import crypto from 'node:crypto';
import tls from 'node:tls';
import net from 'node:net';

const b64 = s => Buffer.from(String(s), 'utf8').toString('base64');
const wrap76 = s => s.replace(/.{1,76}/g, '$&\r\n');
const dispName = n => /^[\x20-\x7e]*$/.test(n) ? '"' + n.replace(/["\\]/g, '') + '"' : '=?UTF-8?B?' + b64(n) + '?=';

export function mimeMessage({ from, fromName, to, subject, html, text, replyTo, unsub }) {
  const bd = 'bh' + crypto.randomBytes(12).toString('hex'), sub = String(subject).replace(/[\r\n]+/g, ' ');
  const h = [`From: ${fromName ? dispName(String(fromName).replace(/[\r\n]/g, '')) + ' ' : ''}<${from}>`, `To: <${to}>`, `Subject: ${/^[\x20-\x7e]*$/.test(sub) ? sub : '=?UTF-8?B?' + b64(sub) + '?='}`,
    `Date: ${new Date().toUTCString()}`, `Message-ID: <${crypto.randomUUID()}@${from.split('@')[1] || 'brotherhood'}>`, 'MIME-Version: 1.0'];
  if (replyTo) h.push(`Reply-To: <${replyTo}>`);
  if (unsub) h.push(`List-Unsubscribe: <${unsub}>`);
  h.push(`Content-Type: multipart/alternative; boundary="${bd}"`);
  return h.join('\r\n') + '\r\n\r\n' + `--${bd}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap76(b64(text || ' '))}`
    + `--${bd}\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap76(b64(html || ' '))}--${bd}--\r\n`;
}

// env: the environment variables. defaultName: sender name when none is given. sentToday(): emails already sent today.
// countSent(): called once after each email that went out.
export function createMailer({ env = process.env, defaultName = 'Brotherhood', sentToday = () => 0, countSent = () => { } } = {}) {
  const EMAIL = { key: env.RESEND_API_KEY || '', from: env.EMAIL_FROM || 'Brotherhood Barber <onboarding@resend.dev>', replyTo: env.EMAIL_REPLY_TO || '' };
  const SMTP = { host: env.SMTP_HOST || 'smtp.gmail.com', port: +env.SMTP_PORT || 465, secure: env.SMTP_SECURE !== '0',
    user: String(env.GMAIL_USER || env.SMTP_USER || '').trim(), pass: String(env.GMAIL_APP_PASSWORD || env.SMTP_PASS || '').replace(/\s+/g, '') };
  const provider = () => SMTP.user && SMTP.pass ? 'gmail' : EMAIL.key ? 'resend' : '';
  const ready = () => !!provider();
  const limit = +env.EMAIL_DAILY_LIMIT || (SMTP.user && SMTP.pass ? 450 : 3000);   // a normal Gmail account can send about 500 a day; we stop a little before
  const from = () => provider() === 'gmail' ? SMTP.user : ((/<([^>]+)>/.exec(EMAIL.from) || [])[1] || EMAIL.from);

  function smtpSend(msg, to) {
    return new Promise(resolve => {
      let done = false, buf = '', step = 0;
      const sock = SMTP.secure ? tls.connect({ host: SMTP.host, port: SMTP.port, servername: SMTP.host }) : net.connect({ host: SMTP.host, port: SMTP.port });
      const end = r => { if (done) return; done = true; clearTimeout(tm); try { sock.end(); } catch { } resolve(r); };
      const tm = setTimeout(() => end({ ok: false, error: 'The mail server did not answer' }), 30000);
      const say = l => sock.write(l + '\r\n');
      const steps = [[220, () => say('EHLO brotherhood')], [250, () => say('AUTH LOGIN')], [334, () => say(b64(SMTP.user))], [334, () => say(b64(SMTP.pass))],
        [235, () => say(`MAIL FROM:<${SMTP.user}>`)], [250, () => say(`RCPT TO:<${to}>`)], [250, () => say('DATA')],
        [354, () => sock.write(msg.replace(/\r\n\./g, '\r\n..') + '\r\n.\r\n')], [250, () => { say('QUIT'); end({ ok: true }); }]];
      sock.on('data', d => {
        buf += d.toString('utf8'); const lines = buf.split(/\r?\n/); buf = lines.pop();
        for (const ln of lines) {
          if (done) return; if (/^\d{3}-/.test(ln)) continue;   // more lines of the same answer follow
          const code = +ln.slice(0, 3), [want, next] = steps[step] || [];
          if (code !== want) return end({ ok: false, error: (code === 535 || code === 534 ? 'Gmail did not accept the login. Use an App Password, not your normal password. ' : '') + ln.slice(0, 200) });
          step++; next();
        }
      });
      sock.on('error', e => end({ ok: false, error: String(e.message).slice(0, 200) }));
      sock.on('close', () => end({ ok: false, error: 'The mail server closed the connection' }));
    });
  }

  async function send({ to, subject, html, text, fromName = '', replyTo = '', unsub = '' }) {
    const pv = provider(); if (!pv) return { ok: false, error: 'Email service not configured' };
    if (sentToday() >= limit) return { ok: false, limit: true, error: "Today's email limit is used up. The rest go out tomorrow." };
    const name = String(fromName || (/^(.*?)\s*</.exec(EMAIL.from) || [])[1] || defaultName).replace(/[<>"\r\n]/g, '').trim(), rt = replyTo || EMAIL.replyTo;
    let r;
    if (pv === 'gmail') r = await smtpSend(mimeMessage({ from: SMTP.user, fromName: name, to, subject, html, text, replyTo: rt, unsub }), to);
    else try {
      const x = await fetch(env.RESEND_URL || 'https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + EMAIL.key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: fromName ? `${name} <${from()}>` : EMAIL.from, to: [to], subject, html, text, ...(rt ? { reply_to: rt } : {}), ...(unsub ? { headers: { 'List-Unsubscribe': `<${unsub}>` } } : {}) }) });
      const j = await x.json().catch(() => ({}));
      r = x.ok ? { ok: true } : { ok: false, error: String(j.message || j.error || x.status).slice(0, 300) };
    } catch (e) { r = { ok: false, error: String(e.message).slice(0, 300) }; }
    if (r.ok) countSent();
    return r;
  }

  return { config: EMAIL, provider, ready, limit, from, mimeMessage, send };
}
