// HTTP helpers shared by every route: errors with a status code, JSON answers, reading a JSON body, and static files.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

// throw bad(409, 'message') anywhere in a request: the server answers with that status and { error: message }
export class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
export const bad = (code, msg) => { throw new HttpError(code, msg); };
// a route module answers NEXT when none of its routes matched, so the server tries the next ones
export const NEXT = Symbol('not handled here');

export const MIME = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', webmanifest: 'application/manifest+json', png: 'image/png', jpg: 'image/jpeg', json: 'application/json' };

const GZIP_OK = new WeakSet();   // responses whose client accepts gzip
// call once per request, before any send()
export const noteGzip = (req, res) => { if (/gzip/.test(String(req.headers['accept-encoding'] || ''))) GZIP_OK.add(res); };

export const send = (res, code, body, type = 'application/json') => {
  let out = type === 'application/json' && !Buffer.isBuffer(body) ? JSON.stringify(body) : body;
  const h = { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  if (GZIP_OK.has(res) && out.length > 1024) { out = zlib.gzipSync(out, { level: 6 }); h['Content-Encoding'] = 'gzip'; h.Vary = 'Accept-Encoding'; }
  res.writeHead(code, h); res.end(out);
};

export const readBody = (req, max = 100_000) => new Promise((ok, no) => {
  let s = ''; req.on('data', c => { s += c; if (s.length > max) { no(new HttpError(413, 'Too large')); req.destroy(); } });
  req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch { no(new HttpError(400, 'Bad JSON')); } });
});

// Static files from one folder: read once, compressed once (brotli + gzip), revalidated with ETag so repeat visits cost a tiny 304.
export function staticServer(dir) {
  const cache = new Map();
  return function serveStatic(req, res, file) {
    const fp = path.join(dir, file), st = fs.statSync(fp); let c = cache.get(file);
    if (!c || c.mtime !== st.mtimeMs) {
      const buf = fs.readFileSync(fp), ext = file.split('.').pop(), text = ext === 'html' || ext === 'js' || ext === 'webmanifest' || ext === 'json';
      c = { mtime: st.mtimeMs, buf, ext, etag: '"' + crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16) + '"', br: text && buf.length > 512 ? zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9 } }) : null, gz: text && buf.length > 512 ? zlib.gzipSync(buf, { level: 9 }) : null };
      cache.set(file, c);
    }
    const img = c.ext === 'png' || c.ext === 'jpg';
    const h = { 'Content-Type': MIME[c.ext], ETag: c.etag, 'Cache-Control': img ? 'public, max-age=86400' : 'no-cache', 'X-Content-Type-Options': 'nosniff', Vary: 'Accept-Encoding' };
    if (req.headers['if-none-match'] === c.etag) { res.writeHead(304, h); return res.end(); }
    const ae = String(req.headers['accept-encoding'] || ''); let body = c.buf;
    if (c.br && /(^|[ ,])br([ ,;]|$)/.test(ae)) { body = c.br; h['Content-Encoding'] = 'br'; } else if (c.gz && /gzip/.test(ae)) { body = c.gz; h['Content-Encoding'] = 'gzip'; }
    h['Content-Length'] = body.length; res.writeHead(200, h); res.end(body);
  };
}
