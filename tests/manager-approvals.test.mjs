// T7b (decision D-12): a branch manager approves, reports and runs payroll like an admin, but only for their own branches.
import { startServer, checker, ymd } from './helper.mjs';
const { ok, done, fail } = checker();
const S = await startServer(3154);
const { call } = S;
try {
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  let st = (await call('GET', '/api/state', null, owner)).j; const [A, B, C] = st.branches;
  const mkBarber = async br => (await call('POST', '/api/staff', { name: 'Barber ' + br.name, branchId: br.id, chairId: st.chairs.find(c => c.branchId === br.id)?.id, pct: 40, allowance: 0 }, owner)).j;
  const bA = await mkBarber(A), bC = await mkBarber(C);
  await call('POST', '/api/users', { name: 'Manager Mia', username: 'mia', password: 'miapass1', role: 'manager', branchIds: [A.id, B.id] }, owner);
  let mia = (await call('POST', '/api/login', { username: 'mia', password: 'miapass1' })).j.token;
  let r; const today = ymd(new Date()), later = ymd(new Date(Date.now() + 7 * 864e5));

  // things to review, made by the owner in branch A and branch C
  const claim = br => call('POST', '/api/expense-claims', { branchId: br.id, amount: 100, category: 'Supplies', method: 'Cash', description: 'Blades', noReceiptReason: 'Lost the receipt' }, owner);
  const adv = (br, s) => call('POST', '/api/advances', { branchId: br.id, staffId: s.id, type: 'Cash Advance', amount: 500, reason: 'Family need', installments: 1, consent: true }, owner);
  const leave = (br, s) => call('POST', '/api/leaves', { branchId: br.id, staffId: s.id, type: 'Vacation', from: later, to: later, reason: 'Trip' }, owner);
  const [clA, clC, avA, avC, lvA, lvC] = (await Promise.all([claim(A), claim(C), adv(A, bA), adv(C, bC), leave(A, bA), leave(C, bC)])).map(r => r.j);
  ok('the test data was made', [clA, clC, avA, avC, lvA, lvC].every(x => x && x.id), [clA, clC, avA, avC, lvA, lvC]);

  // ---------- approvals ----------
  ok('the manager approves an expense of branch A', (await call('PUT', `/api/expense-claims/${clA.id}/review`, { action: 'approve' }, mia)).s === 200);
  ok('not one of branch C', (await call('PUT', `/api/expense-claims/${clC.id}/review`, { action: 'approve' }, mia)).s === 403);
  ok('approves a release pay request of branch A', (await call('PUT', `/api/advances/${avA.id}/reject`, { note: 'Not this week' }, mia)).s === 200);
  ok('not one of branch C', (await call('PUT', `/api/advances/${avC.id}/reject`, { note: 'x' }, mia)).s === 403);
  ok('approves leave in branch A, not in branch C', (await call('PUT', `/api/leaves/${lvA.id}/review`, { action: 'approve' }, mia)).s === 200 && (await call('PUT', `/api/leaves/${lvC.id}/review`, { action: 'approve' }, mia)).s === 403);
  const prA = (await call('POST', '/api/problems', { branchId: A.id, category: 'Equipment malfunction', priority: 'Normal', title: 'Clipper', description: 'Broken clipper' }, owner)).j;
  const prC = (await call('POST', '/api/problems', { branchId: C.id, category: 'Equipment malfunction', priority: 'Normal', title: 'Clipper', description: 'Broken clipper' }, owner)).j;
  ok('assigns a problem of branch A, not of branch C', (await call('PUT', `/api/problems/${prA.id}/assign`, { assignedTo: 'Mia' }, mia)).s === 200 && (await call('PUT', `/api/problems/${prC.id}/assign`, { assignedTo: 'Mia' }, mia)).s === 404);

  // ---------- reports and lists that were admin only ----------
  ok('reports for branch A open', (await call('GET', '/api/reports/dashboard?branch=' + A.id, null, mia)).s === 200);
  ok('reports for branch C, or for all branches, do not', (await call('GET', '/api/reports/dashboard?branch=' + C.id, null, mia)).s === 403 && (await call('GET', '/api/reports/dashboard?branch=all', null, mia)).s === 400);
  ok('payslips and checklists: branch A yes, branch C no', (await call('GET', '/api/payslips?branch=' + A.id, null, mia)).s === 200 && (await call('GET', '/api/payslips?branch=' + C.id, null, mia)).s === 403
    && (await call('GET', '/api/checklists?branch=' + A.id, null, mia)).s === 200 && (await call('GET', '/api/checklists?branch=' + C.id, null, mia)).s === 403);
  ok('the expense export works for branch A only', (await call('GET', '/api/expense-claims?format=csv&branch=' + A.id, null, mia)).s === 200 && (await call('GET', '/api/expense-claims?format=csv&branch=' + C.id, null, mia)).s === 403);

  // ---------- pay adjustments and paying out ----------
  ok('adds a bonus for a barber of branch A, not of branch C', (await call('POST', '/api/adjustments', { staffId: bA.id, kind: 'Bonus', amount: 100, note: 'Good week', date: today }, mia)).s === 201
    && (await call('POST', '/api/adjustments', { staffId: bC.id, kind: 'Bonus', amount: 100, note: 'x', date: today }, mia)).s === 403);
  const adjC = (await call('POST', '/api/adjustments', { staffId: bC.id, kind: 'Bonus', amount: 50, note: 'Owner bonus', date: today }, owner)).j;
  r = await call('GET', '/api/adjustments', null, mia);
  ok('sees only the adjustments of branches A and B', r.s === 200 && r.j.rows.length >= 1 && r.j.rows.every(x => x.staffId !== bC.id), r.j);
  ok("cannot remove branch C's adjustment", (await call('DELETE', '/api/adjustments/' + adjC.id, null, mia)).s === 403);
  ok('pays out branch A only', (await call('POST', '/api/payroll/pay', { staffIds: [bA.id], to: today }, mia)).s === 200 && (await call('POST', '/api/payroll/pay', { staffIds: [bA.id, bC.id], to: today }, mia)).s === 403);

  // ---------- no self-approval, no paying out another branch's days (checkpoint review) ----------
  const ownClaim = (await call('POST', '/api/expense-claims', { branchId: A.id, amount: 80, category: 'Supplies', method: 'Cash', description: 'Wax', noReceiptReason: 'No receipt given' }, mia)).j;
  ok('a manager cannot approve their own expense', !!ownClaim.id && (await call('PUT', `/api/expense-claims/${ownClaim.id}/review`, { action: 'approve' }, mia)).s === 403);
  ok('the owner can', (await call('PUT', `/api/expense-claims/${ownClaim.id}/review`, { action: 'approve' }, owner)).s === 200);
  { const { DatabaseSync } = await import('node:sqlite'); const db = new DatabaseSync(S.dbFile, { timeout: 5000 });
    db.prepare("insert into staff_adjustments(id,staffId,branchId,date,kind,amount,note,byName,createdAt) values('xadj',?,?,?,'Bonus',75,'Covered at C','Owner',?)").run(bA.id, C.id, today, new Date().toISOString()); db.close(); }
  r = await call('POST', '/api/payroll/pay', { staffIds: [bA.id], to: today }, mia);
  ok("a barber with unpaid extras at branch C is not paid out by branch A's manager", r.s === 409 && /another branch/.test(r.j.error), r);
  ok('the owner can pay it out', (await call('POST', '/api/payroll/pay', { staffIds: [bA.id], to: today }, owner)).s === 200);
  const miaUser = (await call('GET', '/api/state', null, owner)).j.users.find(u => u.username === 'mia');
  ok('the owner links Mia to a barber profile (she also cuts hair)', (await call('PUT', '/api/users/' + miaUser.id, { staffId: bA.id }, owner)).s === 200);
  ok('then she cannot give herself a bonus or pay herself', (await call('POST', '/api/adjustments', { staffId: bA.id, kind: 'Bonus', amount: 100, note: 'Me', date: today }, mia)).s === 403
    && (await call('POST', '/api/payroll/pay', { staffIds: [bA.id], to: today }, mia)).s === 403);
  ok('the link is undone for the next checks', (await call('PUT', '/api/users/' + miaUser.id, { staffId: '' }, owner)).s === 200);

  // ---------- the back office start-up data ----------
  r = await call('GET', '/api/state', null, mia);
  const ids = arr => [...new Set((arr || []).map(x => x.branchId || x.id))].sort().join();
  ok('the back office gets only branches A and B', r.s === 200 && ids(r.j.branches) === [A.id, B.id].sort().join(), r.j.branches);
  ok('and only their chairs, barbers and staff logins', r.j.chairs.every(c => [A.id, B.id].includes(c.branchId)) && r.j.staff.every(s => [A.id, B.id].includes(s.branchId)) && r.j.users.every(u => [A.id, B.id].includes(u.branchId)), r.j.users);
  ok('services and prices come along (read only)', Array.isArray(r.j.items) && r.j.items.length > 0);
  ok('no login-security warnings for managers', !('secretWarnings' in r.j));

  const miaId = (await call('GET', '/api/state', null, mia)).j.me.id;
  r = await call('POST', `/api/users/${miaId}/reset`, null, owner);
  ok('resetting a manager gives a new password, never a PIN', r.s === 200 && r.j.password && !r.j.pin, r.j);
  r = await call('POST', '/api/login', { username: 'mia', password: r.j.password }); ok('which works', r.s === 200); mia = r.j.token;

  // ---------- still owner/admin only ----------
  ok('shop settings, activity log, reviews and commission rates stay admin only', (await call('GET', '/api/settings', null, mia)).s === 403 && (await call('GET', '/api/audit', null, mia)).s === 403
    && (await call('GET', '/api/reviews', null, mia)).s === 403 && (await call('POST', `/api/branches/${A.id}/apply-commission`, { pct: 90 }, mia)).s === 403);
} catch (e) { fail(e); }
await S.stop();
done();
