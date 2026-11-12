// The HTTP helpers on their own (no app server): JSON answers, compression, reading request bodies, and static files with caching.
import http from 'node:http'; import zlib from 'node:zlib';
import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs';
import { HttpError, bad, send, readBody, noteGzip, staticServer, MIME } from '../src/lib/http.js';
import { checker } from './helper.mjs';
const { ok, done, fail } = checker();

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bh-http-'));
const bigHtml = '<!doctype html><title>Page</title>' + '<p>Brotherhood barbers</p>'.repeat(100);
fs.writeFileSync(path.join(dir, 'page.html'), bigHtml);
fs.writeFileSync(path.join(dir, 'small.js'), 'let a = 1;');
fs.writeFileSync(path.join(dir, 'pic.png'), Buffer.alloc(2000, 7));
const serveStatic = staticServer(dir);
const big = { rows: Array.from({ length: 200 }, (_, i) => ({ id: i, name: 'Customer ' + i })) };

const srv = http.createServer(async (req, res) => {
  noteGzip(req, res);
  try {
    if (req.url === '/json') return send(res, 200, { ok: true, n: 1 });
    if (req.url === '/big') return send(res, 200, big);
    if (req.url === '/html') return send(res, 201, '<p>hello</p>', 'text/html; charset=utf-8');
    if (req.url === '/echo') return send(res, 200, await readBody(req));
    if (req.url === '/echo-small') return send(res, 200, await readBody(req, 50));
    if (req.url === '/bad') bad(409, 'That time is no longer available.');
    if (req.url.startsWith('/static/')) return serveStatic(req, res, req.url.slice(8));
    send(res, 404, { error: 'Not found' });
  } catch (e) { if (!res.headersSent) send(res, e instanceof HttpError ? e.code : 400, { error: e.message }); }
});
await new Promise(r => srv.listen(3166, r));
const B = 'http://127.0.0.1:3166';
// fetch() would decompress for us and hide the headers we want to check, so use a raw request
const raw = (url, headers = {}, method = 'GET', body) => new Promise((resolve, reject) => {
  const q = http.request(B + url, { method, headers }, r => { const ch = []; r.on('data', c => ch.push(c)); r.on('end', () => resolve({ s: r.statusCode, h: r.headers, buf: Buffer.concat(ch) })); });
  q.on('error', reject); if (body !== undefined) q.write(body); q.end();
});
try {
  // ---------- JSON answers ----------
  let r = await raw('/json');
  ok('a JSON answer has the right type, is never cached and cannot be sniffed', r.s === 200 && r.h['content-type'] === 'application/json' && r.h['cache-control'] === 'no-store' && r.h['x-content-type-options'] === 'nosniff' && JSON.parse(r.buf).n === 1, r.h);
  ok('a small answer is not compressed even when the browser accepts gzip', !(await raw('/json', { 'accept-encoding': 'gzip' })).h['content-encoding']);
  r = await raw('/big', { 'accept-encoding': 'gzip, deflate' });
  ok('a large answer is gzipped for browsers that accept it, and reads back the same', r.h['content-encoding'] === 'gzip' && r.h.vary === 'Accept-Encoding' && JSON.parse(zlib.gunzipSync(r.buf)).rows.length === 200, r.h);
  r = await raw('/big'); ok('and sent plain to those that do not', !r.h['content-encoding'] && JSON.parse(r.buf).rows.length === 200);
  r = await raw('/html'); ok('other types and status codes pass through', r.s === 201 && r.h['content-type'] === 'text/html; charset=utf-8' && r.buf.toString() === '<p>hello</p>');
  r = await raw('/bad'); ok('bad() stops the request with its status and message', r.s === 409 && JSON.parse(r.buf).error === 'That time is no longer available.');
  ok('HttpError carries the status code', (() => { try { bad(403, 'No'); } catch (e) { return e instanceof HttpError && e.code === 403 && e.message === 'No'; } })());

  // ---------- reading the request body ----------
  r = await raw('/echo', { 'content-type': 'application/json' }, 'POST', JSON.stringify({ name: 'Juan', n: 2 })); ok('a JSON body is read', JSON.parse(r.buf).name === 'Juan');
  r = await raw('/echo', {}, 'POST', ''); ok('an empty body is an empty object', r.s === 200 && r.buf.toString() === '{}');
  r = await raw('/echo', {}, 'POST', '{not json'); ok('a broken body is refused with 400', r.s === 400 && JSON.parse(r.buf).error === 'Bad JSON');
  r = await raw('/echo-small', {}, 'POST', JSON.stringify({ text: 'x'.repeat(200) })).catch(e => ({ s: 0, err: e.code }));
  ok('a body over the limit is refused (413) or the connection is cut', r.s === 413 || r.s === 0, r.s);

  // ---------- static files ----------
  r = await raw('/static/page.html');
  ok('a page is served with its type, an ETag and "check before reuse" caching', r.s === 200 && r.h['content-type'] === MIME.html && /^"[0-9a-f]{16}"$/.test(r.h.etag) && r.h['cache-control'] === 'no-cache' && r.buf.toString() === bigHtml && +r.h['content-length'] === r.buf.length, r.h);
  const etag = r.h.etag;
  r = await raw('/static/page.html', { 'if-none-match': etag }); ok('the same ETag gets a tiny 304 with no body', r.s === 304 && r.buf.length === 0);
  r = await raw('/static/page.html', { 'accept-encoding': 'gzip, deflate, br' }); ok('brotli is used when the browser accepts it', r.h['content-encoding'] === 'br' && zlib.brotliDecompressSync(r.buf).toString() === bigHtml && r.buf.length < bigHtml.length);
  r = await raw('/static/page.html', { 'accept-encoding': 'gzip' }); ok('otherwise gzip', r.h['content-encoding'] === 'gzip' && zlib.gunzipSync(r.buf).toString() === bigHtml);
  r = await raw('/static/small.js', { 'accept-encoding': 'gzip, br' }); ok('a tiny file is sent as it is', r.s === 200 && !r.h['content-encoding'] && r.h['content-type'] === MIME.js && r.buf.toString() === 'let a = 1;');
  r = await raw('/static/pic.png', { 'accept-encoding': 'gzip, br' }); ok('an image is not compressed and may be cached for a day', r.h['content-type'] === 'image/png' && !r.h['content-encoding'] && r.h['cache-control'] === 'public, max-age=86400' && r.buf.length === 2000);
  await new Promise(r => setTimeout(r, 30)); fs.writeFileSync(path.join(dir, 'page.html'), bigHtml + '<p>new</p>');
  r = await raw('/static/page.html', { 'if-none-match': etag }); ok('when the file changes, the old ETag no longer matches and the new content is served', r.s === 200 && r.h.etag !== etag && r.buf.toString().endsWith('<p>new</p>'), r.s);
  r = await raw('/static/missing.html'); ok('a missing file is an error answer, not a crash', r.s === 400 && (await raw('/json')).s === 200, r.s);
} catch (e) { fail(e); }
srv.close(); srv.closeAllConnections?.();
done();
