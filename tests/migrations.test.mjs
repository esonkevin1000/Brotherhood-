// The migration runner, and upgrading a database that was made before Slice 1.
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs';
import { migrate, listMigrations } from '../src/db/migrate.js';
import { startServer, checker, ymd } from './helper.mjs';
const { ok, done, fail } = checker();
try {
  // ---------- the runner on its own ----------
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bh-mig-'));
  fs.writeFileSync(path.join(dir, '001_first.sql'), "-- a comment; with a semicolon\ncreate table if not exists t(id text primary key, a text);\nalter table t add column b text;\ninsert into t(id, a, b) values('x', 'one; two', 'b');\n");
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'ignored');
  const d = new DatabaseSync(':memory:');
  ok('first run applies the file', migrate(d, dir).join() === '001_first');
  ok('a ";" inside a value does not split the statement', d.prepare('select a from t').get().a === 'one; two');
  ok('second run does nothing', migrate(d, dir).length === 0 && d.prepare('select count(*) n from t').get().n === 1);
  fs.writeFileSync(path.join(dir, '002_second.sql'), "alter table t add column b text;\nalter table t add column c text;\n");
  ok('a column that is already there is skipped, the rest still runs', migrate(d, dir).join() === '002_second' && d.prepare('pragma table_info(t)').all().some(c => c.name === 'c'));
  fs.writeFileSync(path.join(dir, '003_bad.sql'), "insert into t(id, a) values('y', 'kept?');\ninsert into no_such_table values(1);\n");
  let err = ''; try { migrate(d, dir); } catch (e) { err = e.message; }
  ok('a failing file stops with a clear error', /Migration 003_bad failed/.test(err), err);
  ok('and leaves nothing half done', d.prepare("select count(*) n from t where id='y'").get().n === 0 && d.prepare("select count(*) n from migrations where id='003_bad'").get().n === 0);
  ok('files run in number order and the real folder is well formed', listMigrations().length >= 1 && listMigrations().every((m, i, a) => !i || a[i - 1].id < m.id) && listMigrations()[0].id === '001_booking_integrity');

  // ---------- upgrading a database from before Slice 1 ----------
  let S = await startServer(3163), { call } = S;
  let owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  const st = (await call('GET', '/api/state', null, owner)).j, br = st.branches[0], vip = st.items.find(i => i.name === 'Vip Compadre'), amigo = st.items.find(i => i.name === 'Amigo');
  const kev = (await call('POST', '/api/staff', { name: 'Kev', branchId: br.id, chairId: st.chairs.find(c => c.branchId === br.id).id, pct: 40, allowance: 0 }, owner)).j;
  await S.stop();
  // turn the database back into its old shape and put old-style bookings in it
  const db = new DatabaseSync(S.dbFile);
  db.exec("drop index bookings_idem; drop table booking_events; alter table bookings drop column snapshot; alter table bookings drop column idemKey; delete from migrations;");
  const ins = db.prepare("insert into bookings(id,branchId,staffId,customerName,phone,date,time,mins,itemIds,status,notes,source,orderId,createdAt,customerId) values(?,?,?,?,?,?,?,?,?,?,'','online','',?,'')");
  const fut = ymd(new Date(Date.now() + 5 * 864e5)), past = ymd(new Date(Date.now() - 30 * 864e5)), now = new Date().toISOString();
  ins.run('oldfuture', br.id, kev.id, 'Old Future', '09171110001', fut, '10:00', 75, JSON.stringify([vip.id, amigo.id]), 'booked', now);
  ins.run('oldpast', br.id, kev.id, 'Old Past', '09171110002', past, '10:00', 45, JSON.stringify([vip.id]), 'arrived', now);
  ins.run('oldcancel', br.id, kev.id, 'Old Cancel', '09171110003', fut, '11:00', 45, JSON.stringify([vip.id]), 'cancelled', now);
  ins.run('oldbadjson', br.id, kev.id, 'Old Broken', '09171110004', fut, '12:00', 45, 'not json', 'booked', now);
  const before = db.prepare('select count(*) n from bookings').get().n; db.close();

  S = await startServer(3163, {}, S.dbDir); call = S.call;
  owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  ok('the server starts on the old database', (await call('GET', '/api/state', null, owner)).s === 200);
  const list = async () => (await call('GET', `/api/bookings?from=${past}&to=${fut}`, null, owner)).j;
  let l = await list();
  ok('no booking was lost or added', l.length === before, [l.length, before]);
  const f = l.find(b => b.id === 'oldfuture');
  ok('an upcoming old booking shows the same services and total as before', f.total === vip.price + amigo.price && f.items.length === 2 && f.status === 'booked', f);
  await call('PUT', '/api/items/' + vip.id, { price: vip.price + 100 }, owner);
  l = await list();
  ok('and now keeps that price when the price list changes', l.find(b => b.id === 'oldfuture').total === vip.price + amigo.price, l.find(b => b.id === 'oldfuture'));
  ok('past and cancelled old bookings are left alone (they follow the price list as before)', l.find(b => b.id === 'oldpast').total === vip.price + 100 && l.find(b => b.id === 'oldcancel').status === 'cancelled');
  ok('a damaged old booking does not break anything', l.find(b => b.id === 'oldbadjson').items.length === 0);
  ok('old bookings have an empty history, without errors', (await call('GET', '/api/bookings/oldfuture/history', null, owner)).j.length === 0);
  let r = await call('PUT', '/api/bookings/oldfuture', { status: 'cancelled' }, owner);
  ok('changing an old booking starts its history', r.s === 200 && (await call('GET', '/api/bookings/oldfuture/history', null, owner)).j.length === 1, r);
  r = await call('POST', '/api/public/book', { branchId: br.id, staffId: kev.id, date: fut, time: '10:00', itemIds: [vip.id], name: 'New One', phone: '0917 888 7777' }, null, { 'Idempotency-Key': 'upgrade-test-key-0001' });
  ok('new bookings work on the upgraded database', r.s === 201 && r.j.booking.total === vip.price + 100, r);
  await S.stop();
  const db2 = new DatabaseSync(S.dbFile);
  ok('the migration ran once and is recorded', db2.prepare('select count(*) n from migrations').get().n === listMigrations().length);
  ok('only the upcoming booked one was backfilled', db2.prepare("select count(*) n from bookings where snapshot is not null and id like 'old%'").get().n === 1);
  db2.close();
  // starting again changes nothing
  S = await startServer(3163, {}, S.dbDir); await S.stop();
  const db3 = new DatabaseSync(S.dbFile); ok('a restart does not run it again', db3.prepare('select count(*) n from migrations').get().n === listMigrations().length); db3.close();
} catch (e) { fail(e); }
done();
