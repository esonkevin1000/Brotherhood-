// The booking rules on their own (no app server), with a small database in memory and a pretend clock:
// which times are free, what a booking stores, and what a later price change may and may not touch.
import { DatabaseSync } from 'node:sqlite';
import { createBookings, hmOf, idemKeyOf, snapOf } from '../src/lib/booking.js';
import { HttpError, bad } from '../src/lib/http.js';
import { checker } from './helper.mjs';
const { ok, done, fail } = checker();

const db = new DatabaseSync(':memory:');
db.exec(`
create table branches(id text primary key, name text, openTime text, closeTime text);
create table staff(id text primary key, name text, branchId text, active integer, photo text);
create table items(id text primary key, name text, type text, price real, mins integer, active integer, bookable integer);
create table bookings(id text primary key, branchId text, staffId text, customerName text, phone text, date text, time text, mins integer, itemIds text, status text, notes text, source text, orderId text, createdAt text, customerId text, snapshot text, idemKey text, holdUntil text, policy text);
create table bh_blocked(staffId text, date text, fromMin integer, toMin integer);
create table booking_events(id text primary key, bookingId text, at text, actor text, fromStatus text, toStatus text, reason text);
create table settings(k text primary key, v text);
insert into branches values('b1','San Pablo','09:00','19:00'),('b2','Bay','09:00','19:00');
insert into staff values('kev','Kev','b1',1,''),('leo','Leo','b1',1,''),('max','Max','b2',1,''),('old','Old','b1',0,'');
insert into items values('vip','Vip Compadre','service',250,45,1,1),('amigo','Amigo','service',200,30,1,0),('quick','Quick','service',100,null,1,1),('gone','Gone','service',90,30,0,1),('pomade','Pomade','product',380,0,1,0);
`);
const pad = n => String(n).padStart(2, '0'), dOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
let clock = new Date(2026, 10, 16, 14, 10, 0);   // Monday 16 November 2026, 2:10 PM
const now = () => new Date(clock), todayStr = () => dOf(now()), day = n => dOf(new Date(clock.getTime() + n * 864e5));
const all = (sql, ...p) => db.prepare(sql).all(...p), one = (sql, ...p) => db.prepare(sql).get(...p), run = (sql, ...p) => db.prepare(sql).run(...p);
const get = (kind, id) => one(`select * from ${kind} where id=?`, String(id ?? ''));
let n = 0; const off = new Set(), noShowOk = new Set();
const deps = {
  all, one, run, get, uid: () => 'id' + (++n), nowISO: () => now().toISOString(), todayStr, dOf, now,
  toMin: t => { const [h, m] = String(t || '09:00').split(':').map(Number); return h * 60 + (m || 0); }, minsOfDay: d => d.getHours() * 60 + d.getMinutes(),
  r2: x => Math.round((+x || 0) * 100) / 100, sum: (a, f) => a.reduce((s, x) => s + (+f(x) || 0), 0), jp: s => { try { return JSON.parse(s || '[]'); } catch { return []; } }, bad,
  tx: fn => { db.exec('begin immediate'); try { const r = fn(); db.exec('commit'); return r; } catch (e) { db.exec('rollback'); throw e; } },
  getSetting: k => one('select v from settings where k=?', k)?.v, staffState: id => ({ state: off.has(id) ? 'off' : 'in' }),
  priceItems: lines => lines.map(l => { const it = get('items', l.itemId); if (!it || !it.active) bad(400, 'Unknown or inactive item'); return { itemId: it.id, name: it.name, type: it.type, price: it.price, qty: l.qty || 1 }; }),
  upsertCustomer: info => ({ id: 'c-' + String(info.phone).replace(/\D/g, ''), name: info.name }), normPhone: p => String(p || '').replace(/\D/g, ''),
  findCustomer: phone => noShowOk.has(String(phone).replace(/\D/g, '')) ? { id: 'c-' + String(phone).replace(/\D/g, ''), noshowOk: 1 } : null,
};
const B = createBookings(deps);
const refused = (fn, code, re) => { try { fn(); return false; } catch (e) { return e instanceof HttpError && e.code === code && (!re || re.test(e.message)); } };
const setting = (k, v) => run('insert into settings(k,v) values(?,?) on conflict(k) do update set v=excluded.v', k, String(v));
const book = (o = {}, source = 'online', actor) => B.createBooking({ branchId: 'b1', staffId: 'kev', date: day(1), time: '10:00', itemIds: ['vip'], name: 'Juan Cruz', phone: '0917 123 4567', ...o }, source, actor);
try {
  // ---------- small helpers ----------
  ok('minutes are written as a clock time', hmOf(570) === '09:30' && hmOf(0) === '00:00' && hmOf(1125) === '18:45');
  ok('a booking key must be 16 to 200 characters, else it is ignored', idemKeyOf(' abcdefghijklmnop ') === 'abcdefghijklmnop' && idemKeyOf('short') === '' && idemKeyOf('x'.repeat(201)) === '' && idemKeyOf(undefined) === '');
  ok('a snapshot is read only when it has services', snapOf({ snapshot: '{"items":[{"id":"vip","price":250}],"total":250}' })?.total === 250 && snapOf({ snapshot: '{"items":[]}' }) === null && snapOf({ snapshot: 'not json' }) === null && snapOf({}) === null);

  // ---------- how long a booking takes ----------
  ok('service minutes add up', B.bookingMins(['vip', 'amigo']) === 75);
  ok('a service without minutes counts as 30, and a booking is never under 30', B.bookingMins(['quick']) === 30);
  ok('an unknown, switched-off or product item is refused', refused(() => B.bookingMins(['nope']), 400) && refused(() => B.bookingMins(['gone']), 400) && refused(() => B.bookingMins(['pomade']), 400));

  // ---------- free times ----------
  let s = B.slotsFor('b1', day(1), 'kev', 45);
  ok('tomorrow: every half hour from opening, and the last one still ends before closing', s[0] === '09:00' && s.at(-1) === '18:00' && s.length === 19, s);
  s = B.slotsFor('b1', day(0), 'kev', 45);
  ok('today at 2:10 PM the first free time is 2:30 PM (at least 15 minutes ahead)', s[0] === '14:30', s);
  off.add('kev');
  ok('a barber who is off today has no times today, but has them tomorrow', B.slotsFor('b1', day(0), 'kev', 45).length === 0 && B.slotsFor('b1', day(1), 'kev', 45).length === 19);
  ok('"any barber" still shows times today when another barber is in', B.slotsFor('b1', day(0), 'any', 45)[0] === '14:30');
  off.clear();
  ok('a barber of another branch gives no times; a switched-off barber neither', B.slotsFor('b1', day(1), 'max', 45).length === 0 && B.slotsFor('b1', day(1), 'old', 45).length === 0);
  ok('an unknown branch is refused', refused(() => B.slotsFor('nope', day(1), 'any', 45), 400));

  // ---------- making a booking ----------
  const bk = book({ idemKey: 'key-0000000000000001' });
  ok('a booking is made as "booked" with the services and price of that moment', bk.status === 'booked' && bk.total === 250 && bk.items[0].name === 'Vip Compadre' && bk.staffName === 'Kev' && bk.branchName === 'San Pablo' && !('snapshot' in bk) && !('idemKey' in bk), bk);
  const row = one('select * from bookings where id=?', bk.id), snap = JSON.parse(row.snapshot);
  ok('the stored snapshot has services, prices, minutes, total, branch and barber', snap.items[0].price === 250 && snap.items[0].mins === 45 && snap.total === 250 && snap.mins === 45 && snap.branchName === 'San Pablo' && snap.staffName === 'Kev', snap);
  ok('its history starts with "booked" by the customer', (() => { const e = all('select * from booking_events where bookingId=?', bk.id); return e.length === 1 && e[0].toStatus === 'booked' && /online/i.test(e[0].actor); })());
  s = B.slotsFor('b1', day(1), 'kev', 45);
  ok('times that would run into the booking are gone for that barber (9:30, 10:00, 10:30), the ones around it stay', !s.includes('09:30') && !s.includes('10:00') && !s.includes('10:30') && s.includes('09:00') && s.includes('11:00'), s);
  ok('"any barber" still offers 10:00 because Leo is free', B.slotsFor('b1', day(1), 'any', 45).includes('10:00'));
  ok('the same time again for the same barber is refused', refused(() => book({ phone: '0917 000 0001' }), 409, /no longer available/));
  ok('the same key again gives back the same booking', (() => { const again = book({ idemKey: 'key-0000000000000001' }); return again.id === bk.id && again.duplicate === true && one('select count(*) n from bookings').n === 1; })());
  ok('the same key from another phone, or for another time, is refused', refused(() => book({ idemKey: 'key-0000000000000001', phone: '0918 000 0000' }), 409, /already used/) && refused(() => book({ idemKey: 'key-0000000000000001', time: '15:00' }), 409, /already used/));
  const anyBk = book({ staffId: 'any', phone: '0917 000 0002' });
  ok('"any barber" at a time Kev is taken goes to Leo', anyBk.staffId === 'leo' && anyBk.staffName === 'Leo', anyBk);
  const any2 = book({ staffId: 'any', time: '15:00', phone: '0917 000 0003' });
  ok('"any barber" at a free time goes to the barber with fewer bookings that day', ['kev', 'leo'].includes(any2.staffId), any2.staffId);
  ok('a staff booking records who made it and may use a walk-in-only service', (() => { const x = book({ time: '16:00', itemIds: ['amigo'], phone: '0917 000 0004' }, 'pos', 'Desk'); return x.source === 'pos' && one('select actor from booking_events where bookingId=?', x.id).actor === 'Desk'; })());
  ok('bad input is refused with a clear reason', refused(() => book({ branchId: 'nope' }), 400, /branch/) && refused(() => book({ date: '16-11-2026' }), 400) && refused(() => book({ date: day(-1) }), 400, /past/) && refused(() => book({ date: day(61) }), 400, /Too far/)
    && refused(() => book({ itemIds: [] }), 400, /service/) && refused(() => book({ itemIds: ['amigo'], time: '17:00' }), 400, /cannot be booked online/) && refused(() => book({ name: ' ' }), 400, /Name/) && refused(() => book({ phone: '123' }), 400, /mobile/));

  // ---------- buffer and blocked time ----------
  setting('bufferMins', 20);
  s = B.slotsFor('b1', day(1), 'kev', 45);
  ok('with a 20-minute buffer the times right before and after a booking close too', !s.includes('09:00') && !s.includes('11:00') && s.includes('11:30'), s);
  setting('bufferMins', 0);
  run('insert into bh_blocked values(?,?,?,?)', 'leo', day(2), 780, 840);   // Leo is away 1:00 to 2:00 PM the day after tomorrow
  s = B.slotsFor('b1', day(2), 'leo', 45);
  ok('blocked time closes the times that touch it', !s.includes('12:30') && !s.includes('13:00') && !s.includes('13:30') && s.includes('12:00') && s.includes('14:00'), s);
  run("update bookings set status='cancelled' where id=?", bk.id);
  ok('a cancelled booking frees its time again', B.slotsFor('b1', day(1), 'kev', 45).includes('10:00'));

  // ---------- missed appointments ----------
  setting('noshowMax', 2);
  run("insert into bookings(id,branchId,staffId,customerName,phone,date,time,mins,itemIds,status,customerId) values('n1','b1','kev','No Show','0917 555 0001',?,'10:00',45,'[\"vip\"]','noshow',''),('n2','b1','kev','No Show','0917 555 0001',?,'11:00',45,'[\"vip\"]','noshow','')", day(-3), day(-10));
  ok('after too many missed appointments online booking is paused for that number', refused(() => book({ phone: '0917 555 0001', time: '17:00' }), 403, /missed appointments/));
  ok('the shop can still book that customer at the desk', book({ phone: '0917 555 0001', time: '17:00' }, 'pos', 'Desk').status === 'booked');
  noShowOk.add('09175550001');
  ok('and a customer the owner allowed again can book online', book({ phone: '0917 555 0001', time: '17:30', staffId: 'leo', date: day(2) }).status === 'booked');
  setting('noshowMax', 0);

  // ---------- price changes later ----------
  const b2 = book({ time: '12:00', phone: '0917 000 0005' });
  run("update items set price=300, name='Vip Compadre Plus' where id='vip'");
  const v = B.bookingView(one('select * from bookings where id=?', b2.id));
  ok('a booking already made keeps its price and service name', v.total === 250 && v.items[0].price === 250 && v.items[0].name === 'Vip Compadre', v);
  run("update bookings set snapshot=null where id=?", b2.id);
  ok('a booking from before snapshots existed follows the price list, as it always did', B.bookingView(one('select * from bookings where id=?', b2.id)).total === 300);
  const sn = { items: [{ id: 'vip', name: 'Vip Compadre', price: 250, mins: 45 }], total: 250 };
  let lines = B.priceBooked(sn, [{ itemId: 'vip', qty: 1 }, { itemId: 'quick', qty: 1 }]);
  ok('at the visit, the booked service keeps the booked price and an added one gets today\'s price', lines[0].price === 250 && lines[1].price === 100, lines);
  run("update items set active=0 where id='vip'");
  lines = B.priceBooked(sn, [{ itemId: 'vip', qty: 1 }]);
  ok('a booked service that was switched off later can still be served at the booked price', lines[0].price === 250 && lines[0].name === 'Vip Compadre', lines);
  ok('but not without a booking', refused(() => B.priceBooked(null, [{ itemId: 'vip', qty: 1 }]), 400));
  run("update bookings set orderId='ord1', snapshot=? where id=?", JSON.stringify(sn), b2.id);
  ok('the snapshot of a visit is found through its booking', B.bookedSnap('ord1')?.total === 250 && B.bookedSnap('none') === null && B.bookedSnap('') === null);
} catch (e) { fail(e); }
done();
