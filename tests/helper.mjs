// Shared setup for test suites: starts the real server on its own port with a temporary database.
import { spawn } from 'node:child_process';
import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export async function startServer(port, env = {}, dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bh-test-'))) {
  const dbFile = path.join(dbDir, 't.db'), B = 'http://localhost:' + port;
  const srv = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, ADMIN_PASSWORD: 'ownerpw', DB_FILE: dbFile, PORT: String(port), ...env }, stdio: 'ignore' });
  let up = false, died = false; srv.once('exit', () => { died = true; });
  for (let i = 0; i < 80 && !up; i++) { try { await fetch(B + '/api/public/terms'); up = true; } catch { await new Promise(r => setTimeout(r, 250)); } }
  if (!up || died) { srv.kill(); throw new Error('server did not start on port ' + port + (died ? ' (it exited: is the port already in use?)' : '')); }
  async function call(method, url, body, tok, headers = {}) {
    const r = await fetch(B + url, { method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { s: r.status, j };
  }
  const stop = () => new Promise(r => { if (srv.exitCode !== null || srv.signalCode) return r(); srv.once('exit', r); srv.kill(); });
  return { B, call, stop, dbFile, dbDir };
}

export function checker() {
  let fails = 0;
  const ok = (name, cond, extra = '') => { if (!cond) fails++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' → ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)))); };
  const done = () => { console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0); };
  return { ok, done, fail: e => { fails++; console.log('ERROR', e); } };
}
