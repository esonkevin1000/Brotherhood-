// T31 (S5): the reconciliation export. One CSV row per finished record (voided ones included and marked), with visit, date, branch,
// barber, source, services, amount, method, status, the optional BIR invoice number and its corrections. Every export is in the audit log.
import { DatabaseSync } from 'node:sqlite';
import { startServer, checker } from './helper.mjs';
const { ok, done, fail } = checker();
const S = await startServer(3192);
const { call } = S;
const LABEL = 'Internal operational record. Not an official receipt or accounting record.';
// a small CSV reader (quoted fields, doubled quotes)
const parse = s => { const rows = []; let row = [], f = '', q = false; for (let i = 0; i < s.length; i++) { const c = s[i]; if (q) { if (c === '"' && s[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; } else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; } else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; } else if (c !== '\r') f += c; } if (f || row.length) { row.push(f); rows.push(row); } return rows; };
try {
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  const st = (await call('GET', '/api/state', null, owner)).j, [A, B] = st.branches, ch = st.chairs.filter(c => c.branchId === A.id);
  await call('PUT', `/api/branches/${A.id}`, { openTime: '00:00', closeTime: '23:59' }, owner);
  const trim = (await call('POST', '/api/items', { name: 'Quick Trim', price: 200, type: 'service', mins: 30, bookable: 1, active: 1 }, owner)).j;
  const kev = (await call('POST', '/api/staff', { name: 'Kev', branchId: A.id, chairId: ch[0].id, pct: 40, allowance: 0 }, owner)).j;
  await call('POST', '/api/users', { name: 'Desk Dina', username: 'dina', pin: '111111', role: 'cashier', branchId: A.id }, owner);
  await call('POST', '/api/users', { name: 'Manager Mia', username: 'mia', password: 'miapass1', role: 'manager', branchIds: [A.id] }, owner);
  await call('POST', '/api/users', { name: 'Manager Max', username: 'max', password: 'maxpass1', role: 'manager', branchIds: [B.id] }, owner);
  const desk = (await call('POST', '/api/login', { pin: '111111' })).j.token, mia = (await call('POST', '/api/login', { username: 'mia', password: 'miapass1' })).j.token, max = (await call('POST', '/api/login', { username: 'max', password: 'maxpass1' })).j.token;
  await call('PUT', '/api/settings', { attPhoto: false }, owner);
  await call('POST', '/api/attendance', { staffId: kev.id, action: 'in' }, desk);
  const items = [{ itemId: trim.id, qty: 1 }];
  const visit = async (name, method) => { const id = (await call('POST', '/api/svc/walkin', { name, items, barberId: kev.id }, desk)).j.id; await call('POST', `/api/svc/${id}/finish`, { method }, desk); return id; };
  const db = new DatabaseSync(S.dbFile, { timeout: 5000 });

  const v1 = await visit('Ana Cruz', 'Cash'), v2 = await visit('Ben "Benny" Reyes', 'GCash');
  await call('POST', '/api/svc/walkin', { name: 'Still Waiting', items }, desk);
  db.prepare("update orders set invoiceNo='INV-0042' where id=?").run(v1);
  await call('POST', `/api/records/${v1}/adjust`, { kind: 'amount', after: 150, reason: 'Wrong price, senior' }, owner);
  await call('POST', `/api/records/${v2}/adjust`, { kind: 'void', reason: 'Not charged' }, owner);
  const date = db.prepare('select date from orders where id=?').get(v1).date, nos = Object.fromEntries(db.prepare('select id, no from orders').all().map(o => [o.id, o.no]));

  const url = `/api/records/export?branch=${A.id}&from=${date}&to=${date}`;
  let r = await call('GET', url, null, mia);
  ok('the branch manager exports a CSV', r.s === 200 && typeof r.j === 'string', r.s);
  const text = String(r.j).replace(/^﻿/, ''), rows = parse(text);
  ok('it starts with the internal-record label', text.startsWith(LABEL));
  const hi = rows.findIndex(x => x[0] === 'Visit'), head = rows[hi], body = rows.slice(hi + 1).filter(x => x.length > 1);
  ok('it has the agreed columns', JSON.stringify(head) === JSON.stringify(['Visit', 'Date', 'Branch', 'Barber', 'Source', 'Services', 'Amount', 'Payment method', 'Payment status', 'Record status', 'BIR invoice no.', 'Adjustments']), head);
  const col = n => head.indexOf(n), byNo = Object.fromEntries(body.map(x => [x[col('Visit')], x]));
  ok('one row per finished record, the void included, the open visit not', body.length === 2, body);
  const a = byNo[String(nos[v1])], b = byNo[String(nos[v2])];
  ok('the corrected record shows the amount now and its correction', a && a[col('Amount')] === '150' && /amount ₱200 → ₱150/.test(a[col('Adjustments')]) && /Wrong price, senior/.test(a[col('Adjustments')]), a);
  ok('the details are in their columns', a && a[col('Date')] === date && a[col('Branch')] === A.name && a[col('Barber')] === 'Kev' && a[col('Source')] === 'Walk-in' && a[col('Services')] === 'Quick Trim' && a[col('Payment method')] === 'Cash' && a[col('Payment status')] === 'reported' && a[col('Record status')] === 'completed', a);
  ok('the BIR invoice number when there is one', a && a[col('BIR invoice no.')] === 'INV-0042' && b && b[col('BIR invoice no.')] === '', [a, b]);
  ok('the voided record is marked void', b && b[col('Record status')] === 'void' && /void/i.test(b[col('Adjustments')]), b);

  const audit = db.prepare("select * from audit where action='records-exported'").all();
  ok('the export is in the audit log, with who, the branch and the dates', audit.length === 1 && audit[0].who === 'Manager Mia' && audit[0].detail.includes(A.name) && audit[0].detail.includes(date), audit);
  ok('the front desk cannot export', (await call('GET', url, null, desk)).s === 403);
  r = await call('GET', url, null, max);
  ok("another branch's manager does not get this branch's records", r.s === 403 || !String(r.j).includes('Ana Cruz'), r.s);
  ok('the owner can export all branches', (await call('GET', `/api/records/export?from=${date}&to=${date}`, null, owner)).s === 200 && db.prepare("select count(*) n from audit where action='records-exported'").get().n >= 2);
  db.close();
} catch (e) { fail(e); }
await S.stop();
done();
