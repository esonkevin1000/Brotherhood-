// The mail module on its own (no app server): message format, sending through a Gmail-style SMTP account or Resend,
// the daily limit, and clear errors. A fake SMTP server and a fake Resend API record what would be sent.
import net from 'node:net'; import http from 'node:http';
import { createMailer } from '../src/lib/mail.js';
import { checker } from './helper.mjs';
const { ok, done, fail } = checker();

const smtpGot = [];
const smtp = net.createServer(s => {
  let buf = '', data = null, to = '';
  s.write('220 fake.gmail ready\r\n');
  s.on('data', d => {
    buf += d.toString();
    while (true) {
      if (data !== null) { const i = buf.indexOf('\r\n.\r\n'); if (i < 0) return; smtpGot.push({ to, raw: buf.slice(0, i) }); buf = buf.slice(i + 5); data = null; s.write('250 OK queued\r\n'); continue; }
      const i = buf.indexOf('\r\n'); if (i < 0) return; const ln = buf.slice(0, i); buf = buf.slice(i + 2);
      if (/^EHLO/.test(ln)) s.write('250-fake.gmail\r\n250 AUTH LOGIN PLAIN\r\n');
      else if (ln === 'AUTH LOGIN') s.write('334 VXNlcm5hbWU6\r\n');
      else if (Buffer.from(ln, 'base64').toString() === 'shop@gmail.com') s.write('334 UGFzc3dvcmQ6\r\n');
      else if (Buffer.from(ln, 'base64').toString() === 'abcdabcdabcdabcd') s.write('235 Accepted\r\n');
      else if (/^MAIL FROM/.test(ln)) s.write('250 OK\r\n');
      else if (/^RCPT TO/.test(ln)) { to = ln.slice(9, -1); s.write('250 OK\r\n'); }
      else if (ln === 'DATA') { data = ''; s.write('354 Go\r\n'); }
      else if (ln === 'QUIT') { s.write('221 Bye\r\n'); s.end(); }
      else s.write('535 5.7.8 Username and Password not accepted\r\n');
    }
  });
});
const resendGot = []; let resendFail = false;
const resend = http.createServer((req, res) => { let b = ''; req.on('data', d => b += d); req.on('end', () => { resendGot.push({ auth: req.headers.authorization, body: JSON.parse(b) }); res.writeHead(resendFail ? 422 : 200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(resendFail ? { message: 'The domain is not verified' } : { id: 'x' })); }); });
await new Promise(r => smtp.listen(3164, r)); await new Promise(r => resend.listen(3165, r));

const parts = raw => [...raw.matchAll(/Content-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+?)--/g)].map(x => Buffer.from(x[1].replace(/\s/g, ''), 'base64').toString());
const gmailEnv = { GMAIL_USER: ' shop@gmail.com ', GMAIL_APP_PASSWORD: 'abcd abcd abcd abcd', SMTP_HOST: '127.0.0.1', SMTP_PORT: '3164', SMTP_SECURE: '0' };
const counter = (start = 0) => { let n = start; return { sentToday: () => n, countSent: () => { n++; }, get n() { return n; } }; };
try {
  // ---------- nothing connected ----------
  let c = counter(), m = createMailer({ env: {}, defaultName: 'Brotherhood', ...c });
  ok('no account connected: not ready, no provider', m.ready() === false && m.provider() === '');
  let r = await m.send({ to: 'a@x.ph', subject: 'Hi', html: '<p>Hi</p>', text: 'Hi' });
  ok('sending without an account fails with a clear message and counts nothing', r.ok === false && /not configured/.test(r.error) && c.n === 0, r);

  // ---------- message format ----------
  let raw = m.mimeMessage({ from: 'shop@gmail.com', fromName: 'Kingsman "Cuts"', to: 'ana@x.ph', subject: 'Promo this week', html: '<p>Hello Ana</p>', text: 'Hello Ana', replyTo: 'owner@kingsman.ph', unsub: 'https://x.ph/unsubscribe?c=1' });
  ok('plain subject and sender name are written as they are (quotes removed)', raw.includes('Subject: Promo this week\r\n') && raw.includes('From: "Kingsman Cuts" <shop@gmail.com>\r\n') && raw.includes('To: <ana@x.ph>\r\n'), raw.slice(0, 300));
  ok('reply-to and one-click unsubscribe headers are present', raw.includes('Reply-To: <owner@kingsman.ph>\r\n') && raw.includes('List-Unsubscribe: <https://x.ph/unsubscribe?c=1>\r\n'));
  ok('both the text and the HTML version are inside, readable after decoding', parts(raw).join('|') === 'Hello Ana|<p>Hello Ana</p>', parts(raw));
  ok('every line ends with CRLF and no line is longer than 78 characters in the body', !/[^\r]\n/.test(raw) && raw.split('\r\n\r\n').slice(1).join('').split('\r\n').every(l => l.length <= 78));
  raw = m.mimeMessage({ from: 'shop@gmail.com', fromName: 'Señor Barbero', to: 'a@x.ph', subject: 'Maligayang Pasko 🎄\r\nBcc: evil@x.ph', html: '<p>x</p>', text: 'x' });
  ok('a subject or name with special letters is encoded, and a line break cannot add a header', /Subject: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=\r\n/.test(raw) && /From: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?= <shop@gmail.com>/.test(raw) && !/\r\nBcc:/.test(raw), raw.slice(0, 300));
  ok('no reply-to or unsubscribe header when none is given', !/Reply-To|List-Unsubscribe/.test(raw));

  // ---------- Gmail (SMTP) ----------
  c = counter(); m = createMailer({ env: gmailEnv, defaultName: 'Brotherhood', ...c });
  ok('Gmail connected: provider, sender address and the 450-a-day limit', m.ready() && m.provider() === 'gmail' && m.from() === 'shop@gmail.com' && m.limit === 450, [m.provider(), m.from(), m.limit]);
  r = await m.send({ to: 'ana@x.ph', subject: 'Hello', html: '<p>Hello</p>', text: 'Hello', fromName: 'Kingsman Cuts', replyTo: 'owner@kingsman.ph', unsub: 'https://x.ph/u' });
  ok('an email goes out through the account and is counted once', r.ok === true && smtpGot.length === 1 && smtpGot[0].to === 'ana@x.ph' && c.n === 1, [r, smtpGot.length, c.n]);
  ok('it carries the shop name, reply-to and unsubscribe', smtpGot[0].raw.includes('From: "Kingsman Cuts" <shop@gmail.com>') && smtpGot[0].raw.includes('Reply-To: <owner@kingsman.ph>') && smtpGot[0].raw.includes('List-Unsubscribe: <https://x.ph/u>'));
  r = await m.send({ to: 'ben@x.ph', subject: 'Hello', html: '<p>Hello</p>', text: 'Hello' });
  ok('without a sender name, the name in EMAIL_FROM is used', r.ok && smtpGot[1].raw.includes('From: "Brotherhood Barber" <shop@gmail.com>'), smtpGot[1]?.raw.slice(0, 120));
  m = createMailer({ env: { ...gmailEnv, EMAIL_FROM: 'hello@brotherhood.ph' }, defaultName: 'Kanto Cuts', ...counter() });
  r = await m.send({ to: 'ben@x.ph', subject: 'Hello', html: '<p>Hello</p>', text: 'Hello' });
  ok('and when EMAIL_FROM has no name, the shop\'s default name', r.ok && smtpGot[2].raw.includes('From: "Kanto Cuts" <shop@gmail.com>'), smtpGot[2]?.raw.slice(0, 120));
  c = counter(450); m = createMailer({ env: gmailEnv, defaultName: 'Brotherhood', ...c });
  r = await m.send({ to: 'cid@x.ph', subject: 'Hello', html: 'x', text: 'x' });
  ok('at the daily limit nothing is sent and the caller is told to wait', r.ok === false && r.limit === true && smtpGot.length === 3 && c.n === 450, r);
  c = counter(); m = createMailer({ env: { ...gmailEnv, EMAIL_DAILY_LIMIT: '2' }, defaultName: 'Brotherhood', ...c });
  ok('the daily limit can be set', m.limit === 2);
  c = counter(); m = createMailer({ env: { ...gmailEnv, GMAIL_APP_PASSWORD: 'wrongwrongwrongw' }, defaultName: 'Brotherhood', ...c });
  r = await m.send({ to: 'dan@x.ph', subject: 'Hello', html: 'x', text: 'x' });
  ok('a wrong password explains that an App Password is needed, and counts nothing', r.ok === false && /App Password/.test(r.error) && c.n === 0, r);
  c = counter(); m = createMailer({ env: { ...gmailEnv, SMTP_PORT: '3174' }, defaultName: 'Brotherhood', ...c });
  r = await m.send({ to: 'dan@x.ph', subject: 'Hello', html: 'x', text: 'x' });
  ok('an unreachable mail server gives an error, not a crash', r.ok === false && !!r.error && c.n === 0, r);

  // ---------- Resend ----------
  const resendEnv = { RESEND_API_KEY: 're_test', RESEND_URL: 'http://127.0.0.1:3165/emails', EMAIL_FROM: 'Brotherhood Barber <hello@brotherhood.ph>', EMAIL_REPLY_TO: 'reply@brotherhood.ph' };
  c = counter(); m = createMailer({ env: resendEnv, defaultName: 'Brotherhood', ...c });
  ok('Resend connected: provider, sender address and the 3000-a-day limit', m.provider() === 'resend' && m.from() === 'hello@brotherhood.ph' && m.limit === 3000 && m.config.replyTo === 'reply@brotherhood.ph', [m.provider(), m.from(), m.limit]);
  r = await m.send({ to: 'ana@x.ph', subject: 'Hello', html: '<p>Hello</p>', text: 'Hello' });
  ok('an email goes to Resend with the key, the configured sender and reply-to', r.ok && resendGot[0].auth === 'Bearer re_test' && resendGot[0].body.from === 'Brotherhood Barber <hello@brotherhood.ph>' && resendGot[0].body.to[0] === 'ana@x.ph' && resendGot[0].body.reply_to === 'reply@brotherhood.ph' && c.n === 1, resendGot[0]);
  r = await m.send({ to: 'ana@x.ph', subject: 'Hello', html: 'x', text: 'x', fromName: 'Kingsman Cuts', replyTo: 'owner@kingsman.ph', unsub: 'https://x.ph/u' });
  ok('a shop name, its own reply-to and the unsubscribe header are passed on', resendGot[1].body.from === 'Kingsman Cuts <hello@brotherhood.ph>' && resendGot[1].body.reply_to === 'owner@kingsman.ph' && resendGot[1].body.headers['List-Unsubscribe'] === '<https://x.ph/u>', resendGot[1]);
  resendFail = true; r = await m.send({ to: 'ana@x.ph', subject: 'Hello', html: 'x', text: 'x' });
  ok('a refusal from Resend is reported with its reason and not counted', r.ok === false && /not verified/.test(r.error) && c.n === 2, [r, c.n]);
  m = createMailer({ env: { ...gmailEnv, ...resendEnv }, defaultName: 'Brotherhood', ...counter() });
  ok('when both are set, Gmail is used', m.provider() === 'gmail');
} catch (e) { fail(e); }
smtp.close(); resend.close();
done();
