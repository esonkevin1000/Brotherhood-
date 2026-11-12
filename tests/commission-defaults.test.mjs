import { fileURLToPath as __f } from 'node:url';
const ROOT = __f(new URL('..', import.meta.url));
import { spawn } from 'node:child_process';
import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs';
const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt4-'));
const srv = spawn('node', ['server.js'], { cwd: ROOT, env: { ...process.env, ADMIN_PASSWORD: 'ownerpw', DB_FILE: path.join(dbDir, 't.db'), PORT: '3123', BOOK_LIMIT: '1000', REVIEW_LIMIT: '3' }, stdio: 'ignore' });
for (let i = 0; i < 80; i++) { try { await fetch('http://localhost:3123/api/public/terms'); break; } catch { await new Promise(r => setTimeout(r, 500)); } }
const B = 'http://localhost:3123'; let fails = 0;
async function call(method, url, body, tok) {
  const r = await fetch(B + url, { method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { s: r.status, j };
}
const ok = (name, cond, extra = '') => { if (!cond) fails++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' → ' + extra)); };
try {
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  await call('PUT', '/api/settings', { attPhoto: false }, owner);
  { const _s = (await call('GET', '/api/state', null, owner)).j; for (const _i of _s.items.filter(i => i.name === 'Buddy')) await call('PUT', '/api/items/' + _i.id, { needId: 0 }, owner); }
  const st = (await call('GET', '/api/state', null, owner)).j, [b1, b2] = st.branches, buddy = st.items.find(i => i.name === 'Buddy'), disc = st.discounts[0];
  const mk = async (n, br) => (await call('POST', '/api/staff', { name: n, branchId: br.id, allowance: 0 }, owner)).j;

  // ---- branch settings ----
  const kev = await mk('Kevin', b1); ok('new barber gets the branch default commission (40 when none set)', kev.pct === 40, JSON.stringify(kev));
  ok('edit branch grace + hours + default commission', (await call('PUT', '/api/branches/' + b1.id, { graceMins: 20, openTime: '08:00', closeTime: '22:00', defaultPct: 55, mapUrl: 'https://maps.google.com/?q=x', photo: '' }, owner)).j.graceMins === 20);
  const mar = await mk('Marco', b1); ok('new barber now uses the branch default (55)', mar.pct === 55, JSON.stringify(mar));
  const oth = await mk('Other', b2);
  const ap = await call('POST', `/api/branches/${b1.id}/apply-commission`, { pct: 60 }, owner); ok('apply commission to every barber of one branch', ap.j.updated === 2, JSON.stringify(ap));
  const s2 = (await call('GET', '/api/state', null, owner)).j.staff; ok('…only that branch changed', s2.find(s => s.id === kev.id).pct === 60 && s2.find(s => s.id === mar.id).pct === 60 && s2.find(s => s.id === oth.id).pct === 40);
  ok('commission must be 0-100', (await call('POST', `/api/branches/${b1.id}/apply-commission`, { pct: 150 }, owner)).s === 400);

  // ---- users: barber role, reset PIN ----
  const cu = (await call('POST', '/api/users', { name: 'Cashier', username: 'cashier1', pin: '111111', role: 'cashier', branchId: b1.id }, owner)).j;
  const bu = await call('POST', '/api/users', { name: 'Barber Kev', username: 'barber1', pin: '222222', role: 'barber', branchId: b1.id }, owner); ok('barber login can be created (needs branch + PIN)', bu.s === 201, JSON.stringify(bu));
  ok('barber without a PIN is refused', (await call('POST', '/api/users', { name: 'X', username: 'barber2', role: 'barber', branchId: b1.id }, owner)).s === 409);
  const cash = (await call('POST', '/api/login', { pin: '111111' })).j.token, barber = (await call('POST', '/api/login', { pin: '222222' })).j.token;
  ok('barber cannot open the customer directory, cashier can', (await call('GET', '/api/customers?size=5', null, barber)).s === 403 && (await call('GET', '/api/customers?size=5', null, cash)).s === 200);
  ok('state tells the app which sections each role can open', (await call('GET', '/api/state', null, cash)).j.modules.length === 15 && (await call('GET', '/api/state', null, cash)).j.modules.includes('customers') && JSON.stringify((await call('GET', '/api/state', null, barber)).j.modules) === JSON.stringify(['dashboard', 'bookings', 'problems', 'inbox', 'myperf']));
  const rs = await call('POST', `/api/users/${cu.id}/reset`, null, owner); ok('reset a cashier PIN → new 6-digit PIN shown once', /^\d{6}$/.test(rs.j.pin) && rs.j.pin !== '111111', JSON.stringify(rs));
  ok('old PIN no longer works, new PIN works', (await call('POST', '/api/login', { pin: '111111' })).s === 401 && (await call('POST', '/api/login', { pin: rs.j.pin })).s === 200);
  ok('old session is signed out after a reset', (await call('GET', '/api/pos/bootstrap', null, cash)).s === 401);
  const cash2 = (await call('POST', '/api/login', { pin: rs.j.pin })).j.token;
  ok('cashier cannot reset PINs', (await call('POST', `/api/users/${cu.id}/reset`, null, cash2)).s === 403);

  // ---- permissions enforced on the server ----
  await call('POST', '/api/attendance', { staffId: kev.id, action: 'in' }, cash2); await call('POST', '/api/shifts/open', { openingFloat: 0 }, cash2);
  const bb = await call('GET', '/api/pos/bootstrap', null, barber); ok('barber can load the POS shell', bb.s === 200);
  ok('barber cannot create a sale (pos not allowed)', (await call('POST', '/api/orders', { customer: { name: 'A' }, items: [{ itemId: buddy.id, qty: 1 }] }, barber)).s === 403);
  ok('barber cannot open expenses / attendance / shift', (await call('GET', '/api/expenses', null, barber)).s === 403 && (await call('POST', '/api/attendance', { staffId: kev.id, action: 'out' }, barber)).s === 403 && (await call('POST', '/api/cash', { shiftId: 'x', kind: 'in', amount: 5 }, barber)).s === 403);
  ok('barber can see bookings + dashboard but has no queue', (await call('GET', '/api/bookings', null, barber)).s === 200 && (await call('GET', '/api/pos/queue', null, barber)).s === 403 && (await call('GET', '/api/pos/dashboard', null, barber)).s === 200);
  const tk = (await call('POST', '/api/orders', { customer: { name: 'Walk In', phone: '0917 100 2000' }, items: [{ itemId: buddy.id, qty: 1 }], discountId: disc.id }, cash2)).j; ok('discount chosen at the cart is stored on the ticket', tk.discountId === disc.id, JSON.stringify(tk));
  ok('barber may NOT seat a customer (no queue permission)', (await call('PUT', '/api/orders/' + tk.id, { barberId: kev.id }, barber)).s === 403);
  await call('PUT', '/api/orders/' + tk.id, { barberId: kev.id }, cash2);
  ok('…but may not edit the items (pos permission)', (await call('PUT', '/api/orders/' + tk.id, { items: [] }, barber)).s === 403);
  ok('barber cannot pay', (await call('POST', `/api/orders/${tk.id}/pay`, { tenders: [{ method: 'Cash', amount: 500 }] }, barber)).s === 403);
  const pay = await call('POST', `/api/orders/${tk.id}/pay`, { tenders: [{ method: 'Cash', amount: 500 }] }, cash2); ok('payment uses the discount picked at the cart (₱150 − ₱50)', pay.j.total === 100 && pay.j.discountAmt === 50, JSON.stringify(pay.j));
  // owner changes what each role can open
  await call('PUT', '/api/settings', { perms: { barber: ['dashboard', 'attendance'], cashier: ['pos', 'queue'] } }, owner);
  ok('owner can change role access', JSON.stringify((await call('GET', '/api/state', null, barber)).j.modules) === JSON.stringify(['dashboard', 'attendance']) && (await call('GET', '/api/state', null, cash2)).j.modules.length === 2);
  ok('…and it is enforced (barber now blocked from bookings, allowed attendance)', (await call('GET', '/api/bookings', null, barber)).s === 403 && (await call('GET', '/api/pos/attendance', null, barber)).s === 200);
  ok('…cashier now blocked from expenses', (await call('GET', '/api/expenses', null, cash2)).s === 403);

  // ---- reviews ----
  const rv = r => call('POST', '/api/public/reviews', { branchId: b1.id, staffId: kev.id, name: 'Happy Client', rating: 5, text: 'Great fade!', ...r });
  ok('anyone can leave a review (no login)', (await rv({})).s === 201);
  ok('review needs a name / valid stars / branch', (await rv({ name: '' })).s === 400 && (await rv({ rating: 9 })).s === 400 && (await rv({ branchId: 'nope' })).s === 400);
  await rv({ name: 'Second', rating: 4, text: '<script>alert(1)</script>' }); ok('3rd review within the hour is rate-limited', (await rv({ name: 'Third' })).s === 201 && (await rv({ name: 'Fourth' })).s === 429);
  const pr = (await call('GET', '/api/public/reviews')).j; ok('public list + average', pr.count === 3 && pr.avg === 4.7 && pr.reviews[0].branchName === b1.name, JSON.stringify([pr.count, pr.avg]));
  ok('ratings appear in public info per branch', (await call('GET', '/api/public/info')).j.ratings[b1.id].count === 3);
  ok('review rating filtered by branch', (await call('GET', `/api/public/reviews?branch=${b2.id}`)).j.count === 0);
  ok('public cannot delete or list admin reviews', (await call('GET', '/api/reviews')).s === 401 && (await call('DELETE', '/api/reviews/' + pr.reviews[0].id)).s === 401);
  ok('cashier cannot delete', (await call('DELETE', '/api/reviews/' + pr.reviews[0].id, null, cash2)).s === 403);
  const toDel = (await call('GET', '/api/reviews', null, owner)).j; ok('admin sees all reviews', toDel.length === 3);
  ok('admin can delete a review', (await call('DELETE', '/api/reviews/' + toDel[0].id, null, owner)).s === 200 && (await call('GET', '/api/public/reviews')).j.count === 2);

  // ---- customers: by branch + most recent haircut first ----
  const visit = async (tok, branchStaff, cust) => { const t = (await call('POST', '/api/orders', { customer: cust, items: [{ itemId: buddy.id, qty: 1 }], barberId: branchStaff }, tok)).j; return call('POST', `/api/orders/${t.id}/pay`, { tenders: [{ method: 'Cash', amount: 150 }] }, tok); };
  await call('PUT', '/api/settings', { perms: { cashier: ['dashboard', 'pos', 'bookings', 'queue', 'expenses', 'attendance', 'reading'] } }, owner);
  const uo = (await call('POST', '/api/users', { name: 'Cashier2', username: 'cashier2', pin: '333333', role: 'cashier', branchId: b2.id }, owner)).j; const c2 = (await call('POST', '/api/login', { pin: '333333' })).j.token;
  await call('POST', '/api/attendance', { staffId: oth.id, action: 'in' }, c2); await call('POST', '/api/shifts/open', { openingFloat: 0 }, c2);
  await visit(cash2, kev.id, { name: 'Alice A', phone: '0917 000 0001' });
  await new Promise(r => setTimeout(r, 1100)); await visit(c2, oth.id, { name: 'Bob B', phone: '0917 000 0002' });
  await new Promise(r => setTimeout(r, 1100)); await visit(cash2, kev.id, { name: 'Carol C', phone: '0917 000 0003' });
  await call('POST', '/api/orders', { customer: { name: 'Dan Never Visited', phone: '0917 000 0004' }, items: [{ itemId: buddy.id, qty: 1 }] }, cash2);
  const all_ = (await call('GET', '/api/customers', null, owner)).j.rows.filter(r => /Alice|Bob|Carol|Dan/.test(r.name));
  ok('most recent haircut first, never-visited last', all_.map(r => r.name[0]).join('') === 'CBAD', all_.map(r => r.name).join(','));
  ok('each customer shows the branch of the last haircut', all_[0].branchName === b1.name && all_[1].branchName === b2.name && all_[3].branchName === b1.name, JSON.stringify(all_.map(r => r.branchName)));
  const f1 = (await call('GET', `/api/customers?branch=${b1.id}`, null, owner)).j, f2 = (await call('GET', `/api/customers?branch=${b2.id}`, null, owner)).j;
  ok('filter: branch 1 customers only', f1.rows.every(r => r.branchName === b1.name) && f1.rows.some(r => r.name.startsWith('Alice')) && !f1.rows.some(r => r.name.startsWith('Bob')));
  ok('filter: branch 2 customers only', f2.total === 1 && f2.rows[0].name === 'Bob B');
  const imp = await call('POST', '/api/customers/import', { branchId: b2.id, rows: [{ name: 'Imported Ivan', phone: '0918 000 0009' }] }, owner); ok('imported customers can be assigned to a branch', imp.j.added === 1 && (await call('GET', `/api/customers?branch=${b2.id}`, null, owner)).j.total === 2);

  // ---- reset data (owner only, typed confirmation, auto-backup) ----
  ok('admin/cashier cannot reset data', (await call('POST', '/api/settings/reset', { confirm: 'RESET', sales: true }, cash2)).s === 403);
  ok('needs the typed word RESET', (await call('POST', '/api/settings/reset', { confirm: 'reset', sales: true }, owner)).s === 400);
  ok('needs a choice of what to reset', (await call('POST', '/api/settings/reset', { confirm: 'RESET' }, owner)).s === 400);
  const rr = await call('POST', '/api/settings/reset', { confirm: 'RESET', sales: true, reviews: true }, owner); ok('reset sales + reviews, with a safety backup', rr.s === 200 && rr.j.deleted.orders > 0 && rr.j.deleted.reviews === 2 && /^pre-reset-/.test(rr.j.backup) && fs.existsSync(path.join(dbDir, 'backups', rr.j.backup)), JSON.stringify(rr.j));
  ok('after reset: no sales, staff/services/customers kept', (await call('GET', '/api/reports/sales', null, owner)).j.cards[0].value === 0 && (await call('GET', '/api/state', null, owner)).j.staff.length === 4 && (await call('GET', '/api/customers', null, owner)).j.total >= 5);
  ok('customers keep their record but visits are back to 0', (await call('GET', '/api/customers?q=alice', null, owner)).j.rows[0].visits === 0);
  const rc = await call('POST', '/api/settings/reset', { confirm: 'RESET', customers: true }, owner); ok('can also reset the customer directory', rc.j.deleted.customers >= 5 && (await call('GET', '/api/customers', null, owner)).j.total === 0);
} finally { srv.kill(); }
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
