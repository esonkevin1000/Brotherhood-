// T15: the availability rules on their own (no app server), with a small database in memory and a pretend clock.
// free = branch hours ∩ weekly hours − leave − blocked times − bookings (+ buffer) − past times; "Any barber" has a written tie-break.
import { DatabaseSync } from 'node:sqlite';
import { createAvailability } from '../src/lib/availability.js';
import { bad } from '../src/lib/http.js';
import { checker } from './helper.mjs';
const { ok, done, fail } = checker();
try {
  const db = new DatabaseSync(':memory:');
  db.exec(`
create table branches(id text primary key, name text, openTime text, closeTime text);
create table staff(id text primary key, name text, branchId text, active integer);
create table bookings(id text primary key, branchId text, staffId text, date text, time text, mins integer, status text, holdUntil text);
create table bh_blocked(staffId text, date text, fromMin integer, toMin integer);
create table settings(k text primary key, v text);
create table staff_schedules(staffId text, weekday integer, startMin integer, endMin integer);
create table staff_services(staffId text, itemId text);
create table leaves(staffId text, status text, from_date text, to_date text);
insert into branches values('b1','San Pablo','09:00','12:00'),('b2','Bay','09:00','12:00');
insert into staff values('kev','Kev','b1',1),('abe','Abe','b1',1),('max','Max','b2',1);`);
  const all = (s, ...p) => db.prepare(s).all(...p), one = (s, ...p) => db.prepare(s).get(...p), run = (s, ...p) => db.prepare(s).run(...p);
  const get = (k, id) => one(`select * from ${k} where id=?`, String(id ?? ''));
  const clock = new Date(2026, 10, 16, 10, 20, 0);   // Monday 16 November 2026, 10:20 AM
  const pad = n => String(n).padStart(2, '0'), ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const offToday = new Set();
  const A = createAvailability({ all, one, get, bad, mvpOn: id => id === 'b1', now: () => new Date(clock),
    toMin: t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; }, minsOfDay: d => d.getHours() * 60 + d.getMinutes(),
    todayStr: () => ymd(clock), staffState: id => ({ state: offToday.has(id) ? 'off' : 'present' }), getSetting: k => one('select v from settings where k=?', k)?.v });
  const WED = '2026-11-18', TODAY = ymd(clock), reset = () => db.exec('delete from bookings; delete from bh_blocked; delete from settings; delete from staff_schedules; delete from staff_services; delete from leaves');
  const s = (staff, date = WED, mins = 30, items = [], br = 'b1') => A.slotsFor(br, date, staff, mins, items);

  ok('no rules: every 30 minutes within the branch hours', s('kev').join() === '09:00,09:30,10:00,10:30,11:00,11:30', s('kev'));
  ok('a 60-minute service must end by closing time', s('kev', WED, 60).at(-1) === '11:00');
  run('insert into staff_schedules values(?,?,?,?)', 'kev', 3, 600, 660);   // Wednesday 10:00-11:00
  ok('weekly hours narrow the day', s('kev').join() === '10:00,10:30', s('kev'));
  run("insert into leaves values('kev','PENDING',?,?)", WED, WED);
  ok('pending leave changes nothing', s('kev').join() === '10:00,10:30');
  run("update leaves set status='APPROVED'");
  ok('approved leave closes the day', s('kev').length === 0);
  reset();
  run("insert into bookings(id,branchId,staffId,date,time,mins,status) values('bk1','b1','kev',?,'10:00',30,'booked')", WED);
  ok('a booking takes its own time only', s('kev').join() === '09:00,09:30,10:30,11:00,11:30', s('kev'));
  run("insert into settings values('bufferMins','15')");
  ok('with a 15-minute buffer, the times touching it go too', s('kev').join() === '09:00,11:00,11:30', s('kev'));
  run("update bookings set status='cancelled'");
  ok('a cancelled booking frees its time', s('kev').length === 6);
  reset();
  run('insert into bh_blocked values(?,?,?,?)', 'kev', WED, 660, 690);   // 11:00-11:30
  ok('a blocked time closes the slots it touches', s('kev').join() === '09:00,09:30,10:00,10:30,11:30', s('kev'));
  reset();
  ok('today: nothing earlier than now + 15 minutes', s('kev', TODAY).join() === '11:00,11:30', s('kev', TODAY));
  offToday.add('kev');
  ok('today: a barber who has not clocked in is not offered', s('kev', TODAY).length === 0 && s('any', TODAY).length === 2);
  offToday.clear();
  run("insert into staff_services values('kev','color')");
  ok('a barber is offered only for services they do', s('kev', WED, 30, ['trim']).length === 0 && s('kev', WED, 30, ['color']).length === 6 && s('abe', WED, 30, ['trim']).length === 6);
  reset();

  // ---------- "Any barber": fewest bookings that day, then the lowest id ----------
  ok('a tie goes to the lowest id (abe before kev)', A.pickAny('b1', WED, 600, 30).id === 'abe');
  ok('and always the same one', [1, 2, 3].every(() => A.pickAny('b1', WED, 600, 30).id === 'abe'));
  run("insert into bookings(id,branchId,staffId,date,time,mins,status) values('bk2','b1','abe',?,'09:00',30,'booked')", WED);
  ok('the barber with fewer bookings that day goes first', A.pickAny('b1', WED, 600, 30).id === 'kev');
  run("insert into bookings(id,branchId,staffId,date,time,mins,status) values('bk3','b2','kev',?,'11:30',30,'booked'),('bk4','b2','kev',?,'09:30',30,'booked')", WED, WED);
  ok('bookings in other branches count too', A.pickAny('b1', WED, 600, 30).id === 'abe');
  ok('nobody free: no pick', A.pickAny('b1', WED, 540, 30)?.id === 'kev' && (run("insert into bookings(id,branchId,staffId,date,time,mins,status) values('bk5','b1','kev',?,'09:00',30,'booked')", WED), A.pickAny('b1', WED, 540, 30)) === null);
  reset();

  // ---------- a barber who moves to another branch (D-16) is never booked twice at once ----------
  run("insert into bookings(id,branchId,staffId,date,time,mins,status) values('bk6','b2','max',?,'10:00',30,'booked')", WED);
  run("update staff set branchId='b1' where id='max'");   // the owner moves Max to San Pablo
  ok("Max's Bay booking at 10:00 keeps that time closed in San Pablo", !s('max').includes('10:00') && s('max').includes('09:30'));
  ok('"Any barber" never gives Max at 10:00', ['kev', 'abe'].every(id => (run("insert into bookings(id,branchId,staffId,date,time,mins,status) values(?,'b1',?,?,'10:00',30,'booked')", 'x' + id, id, WED), true)) && A.pickAny('b1', WED, 600, 30) === null);
  reset(); run("update staff set branchId='b2' where id='max'");

  // ---------- a branch without the new booking system ----------
  run('insert into staff_schedules values(?,?,?,?)', 'max', 3, 600, 660); run("insert into staff_services values('max','color')");
  ok('weekly hours and service lists are ignored there (today\'s behaviour)', s('max', WED, 30, ['trim'], 'b2').length === 6);
} catch (e) { fail(e); }
done();
