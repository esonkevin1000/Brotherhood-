// Every back-office report answers, has the expected shape, and exports as CSV. The reports live in src/lib/reports.js.
import { createReports } from '../src/lib/reports.js';
import { startServer, checker, ymd } from './helper.mjs';
const { ok, done, fail } = checker();
const NAMES = ['dashboard', 'sales', 'items', 'commissions', 'payroll', 'attendance', 'tender', 'discounts', 'cash', 'scorecard', 'accountability', 'readings'];
ok('the reports come from their own module', typeof createReports === 'function');
const S = await startServer(3140);
const { call, B } = S;
try {
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  const st = (await call('GET', '/api/state', null, owner)).j, br = st.branches[0], ch = st.chairs.filter(c => c.branchId === br.id);
  const amigo = st.items.find(i => i.name === 'Amigo'), vip = st.items.find(i => i.name === 'Vip Compadre');
  const kev = (await call('POST', '/api/staff', { name: 'Kev "The Blade", Jr.', branchId: br.id, chairId: ch[0].id, pct: 40, allowance: 0 }, owner)).j;
  await call('POST', '/api/users', { name: 'Desk', username: 'desk1', pin: '111111', role: 'cashier', branchId: br.id }, owner);
  const desk = (await call('POST', '/api/login', { pin: '111111' })).j.token;
  for (const [it, m] of [[amigo, 'Cash'], [vip, 'GCash'], [amigo, 'Maya']]) {
    const v = (await call('POST', '/api/svc/walkin', { name: 'Customer, with comma', items: [{ itemId: it.id, qty: 1 }], barberId: kev.id }, desk)).j;
    await call('POST', `/api/svc/${v.id}/finish`, { method: m, barberId: kev.id, discountId: m === 'Maya' ? st.discounts[0].id : '' }, desk);
  }
  const t = ymd(new Date()), qs = `from=${t}&to=${t}&branch=all`;

  for (const n of NAMES) {
    const r = await call('GET', `/api/reports/${n}?${qs}`, null, owner);
    ok(`"${n}" answers with tables`, r.s === 200 && Array.isArray(r.j.tables) && r.j.tables.every(x => typeof x.title === 'string' && Array.isArray(x.cols) && Array.isArray(x.rows) && x.rows.every(row => row.length === x.cols.length)), r.s + ' ' + JSON.stringify(r.j).slice(0, 200));
  }
  let r = await call('GET', `/api/reports/sales?${qs}`, null, owner), cards = Object.fromEntries((r.j.cards || []).map(c => [c.label, c.value]));
  const salesTable = r.j.tables.find(x => x.title === 'Finished services');
  ok('the sales report counts the three finished services', salesTable && salesTable.rows.length === 3, r.j.tables.map(x => [x.title, x.rows.length]));
  r = await call('GET', `/api/reports/tender?${qs}`, null, owner);
  ok('payment methods split Cash, GCash and Maya', ['Cash', 'GCash', 'Maya'].every(m => JSON.stringify(r.j.tables).includes(m)), JSON.stringify(r.j.tables).slice(0, 300));
  r = await call('GET', `/api/reports/commissions?${qs}`, null, owner);
  ok('commissions list the barber', JSON.stringify(r.j).includes('The Blade'));
  r = await call('GET', `/api/reports/sales?${qs}&branch=${st.branches[1].id}`, null, owner);
  ok('another branch has no finished services that day', r.j.tables.find(x => x.title === 'Finished services')?.rows.length === 0);

  // CSV
  const res = await fetch(`${B}/api/reports/sales?${qs}&format=csv`, { headers: { Authorization: 'Bearer ' + owner } }), bytes = Buffer.from(await res.arrayBuffer()), text = bytes.toString('utf8');
  ok('CSV export: right type and a file name with the dates', res.status === 200 && /text\/csv/.test(res.headers.get('content-type')) && res.headers.get('content-disposition') === `attachment; filename="sales-${t}_${t}.csv"`);
  ok('CSV starts with a byte-order mark so Excel reads the letters right', bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF, [...bytes.subarray(0, 3)]);
  ok('a value with a comma or quotes is quoted correctly', text.includes('"Customer, with comma"') && text.includes('"Kev ""The Blade"", Jr."'), text.slice(0, 400));
  ok('every CSV table starts with its title and column names', text.includes('Finished services\nVisit,'));

  // who may open reports
  r = await call('GET', `/api/reports/sales?${qs}`, null, desk); ok('the front desk cannot open reports', r.s === 403);
  r = await call('GET', `/api/reports/nothing?${qs}`, null, owner); ok('an unknown report is "not found"', r.s === 404 && /Unknown report/.test(r.j.error));
  r = await call('GET', `/api/reports/sales?from=bad&to=also-bad`, null, owner); ok('bad dates fall back to today', r.s === 200 && r.j.tables.find(x => x.title === 'Finished services')?.rows.length === 3);
} catch (e) { fail(e); }
await S.stop();
done();
