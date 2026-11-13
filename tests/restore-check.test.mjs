// T9: a downloaded backup can be restored and checked on a computer, without touching the backup file and without
// sending any email or push message. scripts/restore-check.mjs does it; this test runs it on a backup made here.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs'; import { DatabaseSync } from 'node:sqlite'; import os from 'node:os'; import path from 'node:path';
import { startServer, checker, ROOT } from './helper.mjs';
const { ok, done, fail } = checker();
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const check = file => spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'restore-check.mjs'), file], { cwd: ROOT, encoding: 'utf8', timeout: 90000 });
try {
  // a shop with some data, then its backup download (as the owner does in the back office)
  const S = await startServer(3156);
  const owner = (await S.call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  const st = (await S.call('GET', '/api/state', null, owner)).j;
  await S.call('POST', '/api/users', { name: 'Desk Dina', username: 'dina', pin: '111111', role: 'cashier', branchId: st.branches[0].id }, owner);
  const r = await fetch(S.B + '/api/backup', { headers: { Authorization: 'Bearer ' + owner } });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bh-restore-')), file = path.join(dir, 'brotherhood-backup.db');
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  await S.stop();
  ok('the backup downloads', r.status === 200 && fs.statSync(file).size > 10000);

  // a phone subscribed to push messages, as on the live server
  { const d = new DatabaseSync(file); d.exec("insert or replace into settings(k,v) values('vapidKeys','{}')"); d.exec("insert into bh_push(id,userId,endpoint,p256dh,auth,createdAt) values('p1','u1','https://push.example/abc','k','a','2026-11-13')"); d.close(); }
  const before = sha(file), out = check(file), text = out.stdout + out.stderr;
  ok('push messages are switched off on the copy', /push\s+switched off/i.test(text), text);
  ok('the restore check passes on a good backup', out.status === 0 && /RESTORE CHECK PASSED/.test(text), text);
  ok('it reports what is inside (branches, users, customers, visits, bookings)', /branches\s*\d+/i.test(text) && /users\s*\d+/i.test(text) && /customers\s*\d+/i.test(text) && /visits\s*\d+/i.test(text) && /bookings\s*\d+/i.test(text), text);
  ok('it confirms every migration ran on the copy', /migrations\s*\d+ of \d+/i.test(text) && !/missing migration/i.test(text), text);
  ok('the backup file itself is not changed', sha(file) === before);
  ok('no copy or server is left behind', !/left behind/i.test(text) && fs.readdirSync(dir).length === 1);

  // a damaged file
  const bad = path.join(dir, 'broken.db'); fs.writeFileSync(bad, Buffer.alloc(50000, 7));
  const o2 = check(bad);
  ok('a damaged backup fails clearly', o2.status !== 0 && /RESTORE CHECK FAILED/.test(o2.stdout + o2.stderr), o2.stdout + o2.stderr);
  const o3 = check(path.join(dir, 'missing.db'));
  ok('a missing file fails clearly', o3.status !== 0 && /not found/i.test(o3.stdout + o3.stderr));
  fs.rmSync(dir, { recursive: true, force: true });
} catch (e) { fail(e); }
done();
