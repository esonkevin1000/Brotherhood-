import { fileURLToPath as __f } from 'node:url';
const ROOT = __f(new URL('..', import.meta.url));
import { spawn } from 'node:child_process';
import http from 'node:http'; import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs';
const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt6-'));
const env = { ...process.env, ADMIN_PASSWORD: 'ownerpw', DB_FILE: path.join(dbDir, 't.db'), PORT: '3125', SITE_HOST: 'www.site.test', APP_HOST: 'app.test' };
const srv = spawn('node', ['server.js'], { cwd: ROOT, env, stdio: 'ignore' });
const req = (host, p, method = 'GET') => new Promise(r => { const q = http.request({ host: 'localhost', port: 3125, path: p, method, headers: { Host: host } }, s => { let b = ''; s.on('data', d => b += d); s.on('end', () => r({ s: s.statusCode, loc: s.headers.location, b })); }); q.on('error', () => r({ s: 0 })); q.end(); });
for (let i = 0; i < 80; i++) { if ((await req('site.test', '/api/public/terms')).s) break; await new Promise(r => setTimeout(r, 500)); }
let fails = 0; const ok = (n, c, x = '') => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' → ' + x)); };
try {
  let r = await req('site.test', '/'); ok('site host / → promo page', r.s === 200 && r.b.includes('Brotherhood'), r.s);
  r = await req('www.site.test', '/book'); ok('site host /book works (www too)', r.s === 200);
  r = await req('site.test:443', '/api/public/info'); ok('site host public API works', r.s === 200);
  r = await req('site.test', '/backend'); ok('site host /backend → staff domain', r.s === 302 && r.loc === 'https://app.test/backend', r.s + ' ' + r.loc);
  r = await req('site.test', '/pos'); ok('site host /pos → staff domain', r.s === 302 && r.loc === 'https://app.test/pos');
  r = await req('site.test', '/api/state'); ok('site host blocks staff API', r.s === 404);
  r = await req('site.test', '/api/login', 'POST'); ok('site host blocks login', r.s === 404);
  r = await req('app.test', '/'); ok('staff host / → /backend', r.s === 302 && r.loc === '/backend');
  r = await req('app.test', '/backend'); ok('staff host /backend works', r.s === 200 && r.b.includes('app.js'));
  r = await req('app.test', '/pos'); ok('old /pos link goes to the app', r.s === 302 && /member/.test(r.h?.location || r.loc || JSON.stringify(r)));
  r = await req('app.test', '/api/login', 'POST'); ok('staff host API works', r.s !== 404);
  r = await req('app.test', '/book?branch=x'); ok('staff host /book → site domain', r.s === 302 && r.loc === 'https://site.test/book?branch=x', r.loc);
  r = await req('something.up.railway.app', '/'); ok('other hosts (e.g. Railway URL) are restricted like unknown: public paths only?', r.s === 200);
} finally { srv.kill(); }
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
