// T30 (S4): internal reports of the service records: value by day, branch and barber, appointment vs walk-in, and payment method with
// the verified share. Voided records are left out. Every report carries the "internal record" label and the filters it was run with.
import { DatabaseSync } from 'node:sqlite';
import { startServer, checker } from './helper.mjs';
const { ok, done, fail } = checker();
const S = await startServer(3191);
const { call } = S;
const LABEL = 'Internal operational record. Not an official receipt or accounting record.';
try {
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  const st = (await call('GET', '/api/state', null, owner)).j, [A, B] = st.branches, ch = st.chairs.filter(c => c.branchId === A.id);
  await call('PUT', `/api/branches/${A.id}`, { openTime: '00:00', closeTime: '23:59' }, owner);
  const trim = (await call('POST', '/api/items', { name: 'Quick Trim', price: 200, type: 'service', mins: 30, bookable: 1, active: 1 }, owner)).j;
  const kev = (await call('POST', '/api/staff', { name: 'Kev', branchId: A.id, chairId: ch[0].id, pct: 40, allowance: 0 }, owner)).j;
  const leo = (await call('POST', '/api/staff', { name: 'Leo', branchId: A.id, chairId: ch[1].id, pct: 50, allowance: 0 }, owner)).j;
  await call('POST', '/api/users', { name: 'Desk Dina', username: 'dina', pin: '111111', role: 'cashier', branchId: A.id }, owner);
  await call('POST', '/api/users', { name: 'Manager Max', username: 'max', password: 'maxpass1', role: 'manager', branchIds: [B.id] }, owner);
  const desk = (await call('POST', '/api/login', { pin: '111111' })).j.token, max = (await call('POST', '/api/login', { username: 'max', password: 'maxpass1' })).j.token;
  await call('PUT', '/api/settings', { attPhoto: false }, owner);
  for (const s of [kev, leo]) await call('POST', '/api/attendance', { staffId: s.id, action: 'in' }, desk);
  const items = [{ itemId: trim.id, qty: 1 }];
  const visit = async (name, s, method) => { const id = (await call('POST', '/api/svc/walkin', { name, items, barberId: s.id }, desk)).j.id; await call('POST', `/api/svc/${id}/finish`, { method }, desk); return id; };
  const db = new DatabaseSync(S.dbFile, { timeout: 5000 });

  // a known set: Kev cash ₱200 (from a booking), Kev GCash ₱200 (verified), Leo cash ₱200, and one more that is voided
  const v1 = await visit('One', kev, 'Cash'), v2 = await visit('Two', kev, 'GCash'), v3 = await visit('Three', leo, 'Cash'), v4 = await visit('Four', leo, 'Cash');
  db.prepare("update orders set source='appointment' where id=?").run(v1);
  await call('POST', `/api/records/${v2}/verify`, {}, owner);
  await call('POST', `/api/records/${v4}/adjust`, { kind: 'void', reason: 'Test visit' }, owner);
  const date = db.prepare('select date from orders where id=?').get(v1).date;

  const r = await call('GET', `/api/reports/records?branch=${A.id}&from=${date}&to=${date}`, null, owner), rep = r.j;
  const card = l => rep.cards?.find(c => c.label === l)?.value, table = t => rep.tables?.find(x => x.title === t);
  ok('the service records report exists', r.s === 200 && Array.isArray(rep.tables), r.j);
  ok('total value and visits leave the void out', card('Recorded value') === 600 && card('Visits') === 3, rep.cards);
  ok('appointment vs walk-in', card('From appointments') === 1 && card('Walk-ins') === 2, rep.cards);
  ok('verified share: 1 of 3 visits', /33/.test(String(card('Verified payments'))), rep.cards);
  ok('by day', table('By day')?.rows.length === 1 && table('By day').rows[0][0] === date && table('By day').rows[0][2] === 600, table('By day'));
  ok('by branch', table('By branch')?.rows.length === 1 && table('By branch').rows[0][0] === A.name && table('By branch').rows[0][2] === 600, table('By branch'));
  const byB = Object.fromEntries((table('By barber')?.rows || []).map(x => [x[0], x[2]]));
  ok('by barber: Kev ₱400, Leo ₱200', byB.Kev === 400 && byB.Leo === 200, table('By barber'));
  const bySrc = Object.fromEntries((table('Appointment vs walk-in')?.rows || []).map(x => [x[0], x[2]]));
  ok('by source: appointment ₱200, walk-in ₱400', bySrc.Appointment === 200 && bySrc['Walk-in'] === 400, table('Appointment vs walk-in'));
  const byM = Object.fromEntries((table('By payment method')?.rows || []).map(x => [x[0], x]));
  ok('by method with the verified share', byM.Cash?.[2] === 400 && byM.GCash?.[2] === 200 && /100/.test(byM.GCash?.[3]) && /^0/.test(byM.Cash?.[3]), table('By payment method'));

  ok('the report carries the internal-record label', rep.label === LABEL, rep.label);
  ok('and the filters it used', rep.filters?.branch === A.name && rep.filters?.from === date && rep.filters?.to === date, rep.filters);
  for (const n of ['sales', 'tender', 'commissions']) {
    const x = (await call('GET', `/api/reports/${n}?branch=${A.id}`, null, owner)).j;
    ok(`the ${n} report carries the label and filters too`, x.label === LABEL && x.filters?.branch === A.name, [x.label, x.filters]);
  }
  ok('all branches is named as such', (await call('GET', '/api/reports/records', null, owner)).j.filters?.branch === 'All branches');
  const other = (await call('GET', `/api/reports/records?branch=${B.id}&from=${date}&to=${date}`, null, owner)).j;
  ok('another branch shows none of these', other.cards.find(c => c.label === 'Visits').value === 0);
  const mx = await call('GET', `/api/reports/records?branch=${A.id}`, null, max);
  ok("a manager of another branch cannot read this branch's records", mx.s === 403 || mx.j.filters?.branch !== A.name, [mx.s, mx.j.filters]);
  ok('the front desk cannot read reports', (await call('GET', '/api/reports/records', null, desk)).s === 403);

  const c = String((await call('GET', `/api/reports/records?branch=${A.id}&from=${date}&to=${date}&format=csv`, null, owner)).j);
  ok('the CSV starts with the label and the filters', c.replace(/^﻿/, '').startsWith(LABEL) && c.includes(A.name), c.slice(0, 200));
  db.close();
} catch (e) { fail(e); }
await S.stop();
done();
