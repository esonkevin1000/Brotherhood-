// T8: security headers on every page. A Content-Security-Policy lets the browser run only our own scripts (and the few
// inline ones we wrote, by fingerprint), so a script slipped into a name or a review cannot run.
import crypto from 'node:crypto';
import { startServer, checker } from './helper.mjs';
const { ok, done, fail } = checker();
const S = await startServer(3155);
try {
  const pages = ['/', '/member', '/book', '/backend', '/barbershop', '/privacy', '/terms', '/signup', '/shop-terms', '/delete-account', '/unsubscribe?c=x&t=y'];
  for (const p of pages) {
    const r = await fetch(S.B + p), h = k => r.headers.get(k) || '', html = await r.text(), csp = h('content-security-policy');
    const scriptSrc = (csp.match(/script-src ([^;]*)/) || [])[1] || '';
    ok(`${p}: has a Content-Security-Policy that blocks plugins, outside framing and other sites' scripts`,
      /default-src 'self'/.test(csp) && /object-src 'none'/.test(csp) && /frame-ancestors 'self'/.test(csp) && /base-uri 'self'/.test(csp) && scriptSrc && !scriptSrc.includes('unsafe-inline') && !scriptSrc.includes('*'), csp);
    ok(`${p}: HTTPS-only, no type guessing, and a careful referrer`, /max-age=\d{7,}/.test(h('strict-transport-security')) && h('x-content-type-options') === 'nosniff' && h('referrer-policy') === 'strict-origin-when-cross-origin');
    const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => "'sha256-" + crypto.createHash('sha256').update(m[1].replace(/\r\n?/g, '\n')).digest('base64') + "'");   // as the browser does: CRLF becomes LF
    ok(`${p}: each of its own inline scripts (${inline.length}) is allowed by fingerprint`, inline.every(x => scriptSrc.includes(x)), inline);
    ok(`${p}: no inline event handlers (they would be blocked)`, !/<[^>]+\son[a-z]+\s*=/i.test(html.replace(/<script>[\s\S]*?<\/script>/g, '')));
  }
  for (const js of ['/bh.js', '/app.js', '/book.js', '/inbox.js']) {
    const t = await (await fetch(S.B + js)).text();
    ok(`${js}: builds no inline event handlers`, !/\son(click|load|error|input|change|submit|focus)="/.test(t));
  }
  const api = await fetch(S.B + '/api/public/terms');
  ok('API answers get "nosniff" too', api.headers.get('x-content-type-options') === 'nosniff');
  const csp = (await fetch(S.B + '/member')).headers.get('content-security-policy') || '';
  ok('the map (Leaflet + OpenStreetMap) and Google Fonts are still allowed', csp.includes('https://unpkg.com') && /img-src[^;]*https:/.test(csp) && csp.includes('https://fonts.googleapis.com') && csp.includes('https://fonts.gstatic.com'));
} catch (e) { fail(e); }
await S.stop();
done();
