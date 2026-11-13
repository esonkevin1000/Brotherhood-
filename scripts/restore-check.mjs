#!/usr/bin/env node
// Restore drill (T9): checks that a downloaded backup can really be restored.
//
//   node scripts/restore-check.mjs <backup.db>
//
// What it does, without ever changing the backup file:
//   1. copies the backup into a temporary folder and checks the copy is a healthy database;
//   2. starts the app on that copy (on this computer only, with a throw-away owner password, and with NO email, push or
//      Google settings, so no customer is ever messaged from a restored copy);
//   3. checks that every database migration ran, that the owner can log in, and that the main screens answer;
//   4. prints what is inside, stops the app and deletes the copy.
// Ends with "RESTORE CHECK PASSED" (exit code 0) or "RESTORE CHECK FAILED: <reason>" (exit code 1).
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { listMigrations } from '../src/db/migrate.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const say = (label, value) => console.log(`  ${label.padEnd(12)} ${value}`);
const failNow = msg => { console.log(`\nRESTORE CHECK FAILED: ${msg}`); process.exitCode = 1; };
const freePort = () => new Promise((ok, no) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }).on('error', no); });

const src = process.argv[2];
if (!src || !fs.existsSync(src) || !fs.statSync(src).isFile()) { failNow(`backup file not found: ${src || '(none given)'}`); process.exit(1); }

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bh-restore-check-')), copy = path.join(dir, 'restored.db');
let srv = null;
try {
  const before = crypto.createHash('sha256').update(fs.readFileSync(src)).digest('hex');
  fs.copyFileSync(src, copy);
  console.log(`Restore check of ${path.basename(src)} (${(fs.statSync(src).size / 1048576).toFixed(1)} MB)`);

  // 1. a healthy SQLite database?
  try { const d = new DatabaseSync(copy); const r = d.prepare('pragma integrity_check').get(); d.close(); if (Object.values(r)[0] !== 'ok') throw new Error(Object.values(r)[0]); }
  catch (e) { throw new Error('the file is not a healthy database (' + e.message + ')'); }
  say('database', 'healthy');

  // 2. start the app on the copy: clean settings, nothing that can reach customers
  const port = await freePort(), pass = crypto.randomBytes(18).toString('base64url'), B = `http://127.0.0.1:${port}`;
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: os.tmpdir(), TMP: os.tmpdir(), TZ: process.env.TZ || 'Asia/Manila',
    DB_FILE: copy, PORT: String(port), ADMIN_PASSWORD: pass, SESSION_SECRET: crypto.randomBytes(32).toString('base64url'), OWNER_USERNAME_FORCE: 'restorecheck' };
  let log = '';
  srv = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  srv.stdout.on('data', d => { log += d; }); srv.stderr.on('data', d => { log += d; });
  let up = false;
  for (let i = 0; i < 120 && !up && srv.exitCode === null; i++) { try { up = (await fetch(B + '/api/public/terms')).ok; } catch { await new Promise(r => setTimeout(r, 250)); } }
  if (!up) throw new Error('the app did not start on the restored copy:\n' + log.trim().split('\n').slice(-8).join('\n'));
  say('app', 'started on the copy');

  // 3. migrations, owner login, main screens
  const d = new DatabaseSync(copy, { readOnly: true });
  const done = new Set(d.prepare('select id from migrations').all().map(r => r.id)), all = listMigrations().map(m => m.id), missing = all.filter(id => !done.has(id));
  say('migrations', `${all.length - missing.length} of ${all.length}`);
  if (missing.length) throw new Error('missing migration(s): ' + missing.join(', '));
  const count = t => { try { return d.prepare(`select count(*) n from ${t}`).get().n; } catch { return 0; } };
  const counts = { branches: count('branches'), staff: count('staff'), users: count('users'), customers: count('customers'), visits: count('orders'), bookings: count('bookings') };
  const lastVisit = (() => { try { return d.prepare('select max(date) m from orders').get().m || 'none'; } catch { return 'none'; } })();
  d.close();
  const call = async (p, tok, body) => { const r = await fetch(B + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { s: r.status, j: await r.json().catch(() => ({})) }; };
  const login = await call('/api/login', null, { username: 'restorecheck', password: pass });
  if (login.s !== 200) throw new Error('the owner could not log in on the copy (' + (login.j.error || login.s) + ')');
  const tok = login.j.token, st = await call('/api/state', tok);
  if (st.s !== 200) throw new Error('the back office data did not load (' + st.s + ')');
  const br = st.j.branches?.[0]?.id;
  for (const p of ['/api/reports/dashboard', '/api/settings', ...(br ? [`/api/svc/today?branch=${br}`, `/api/bookings?branch=${br}`] : [])]) {
    const r = await call(p, tok); if (r.s !== 200) throw new Error(`${p} answered ${r.s}: ${r.j.error || ''}`);
  }
  say('screens', 'owner login, back office, reports, service log and bookings answer');
  for (const [k, v] of Object.entries(counts)) say(k, v);
  say('last visit', lastVisit);
  if (!counts.branches) throw new Error('the restored copy has no branches');

  // 4. the backup itself must be untouched
  if (crypto.createHash('sha256').update(fs.readFileSync(src)).digest('hex') !== before) throw new Error('the backup file changed during the check');
  console.log('\nRESTORE CHECK PASSED');
} catch (e) { failNow(e.message); }
finally {
  if (srv && srv.exitCode === null) { srv.kill(); await new Promise(r => srv.once('exit', r)); }
  for (let i = 0; i < 10; i++) { try { fs.rmSync(dir, { recursive: true, force: true }); break; } catch { await new Promise(r => setTimeout(r, 300)); } }
  if (fs.existsSync(dir)) console.log(`(note: a temporary copy was left behind in ${dir}; you may delete it)`);
}
