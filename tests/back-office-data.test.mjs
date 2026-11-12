// The last routes moved out of server.js: picture upload (src/routes/operations.js, with remittance, bookings, reports and the
// old POS) and the generic add / edit / remove of branches, chairs, barbers, services, discounts, customers, users and
// equipment (src/routes/back-office-data.js).
import { createBackOfficeDataRoutes } from '../src/routes/back-office-data.js';
import { createOperationsRoutes } from '../src/routes/operations.js';
import { startServer, checker } from './helper.mjs';
const { ok, done, fail } = checker();
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
ok('the routes come from their own modules', typeof createBackOfficeDataRoutes === 'function' && typeof createOperationsRoutes === 'function');
const S = await startServer(3149);
const { call, B } = S;
try {
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  const st = (await call('GET', '/api/state', null, owner)).j, br = st.branches[0];
  await call('POST', '/api/users', { name: 'Desk', username: 'desk1', pin: '111111', role: 'cashier', branchId: br.id }, owner);
  const desk = (await call('POST', '/api/login', { pin: '111111' })).j.token;

  // ---------- picture upload ----------
  let r = await call('POST', '/api/upload', { data: PNG }, owner);
  ok('the owner uploads a picture and gets its address', r.s === 201 && /^\/img\/\w+$/.test(r.j.url), r);
  const img = await fetch(B + r.j.url); ok('the picture is served publicly as an image', img.status === 200 && img.headers.get('content-type') === 'image/png');
  ok('a GIF is refused', (await call('POST', '/api/upload', { data: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' }, owner)).s === 400);
  ok('a picture over about 700 KB is refused', (await call('POST', '/api/upload', { data: 'data:image/png;base64,' + Buffer.alloc(720_000, 1).toString('base64') }, owner)).s === 413);
  ok('the front desk cannot upload pictures here', (await call('POST', '/api/upload', { data: PNG }, desk)).s === 403);

  // ---------- add, edit, remove ----------
  r = await call('POST', '/api/chairs', { branchId: br.id, name: 'Chair 9' }, owner); const chair = r.j;
  ok('a chair is added, switched on by default', r.s === 201 && chair.name === 'Chair 9' && chair.active === 1, r);
  r = await call('PUT', '/api/chairs/' + chair.id, { name: 'Chair Nine' }, owner); ok('and renamed', r.s === 200 && r.j.name === 'Chair Nine');
  ok('a chair needs a branch', (await call('POST', '/api/chairs', { name: 'Lost chair' }, owner)).s === 400);
  r = await call('DELETE', '/api/chairs/' + chair.id, null, owner); ok('a chair nobody uses is deleted', r.s === 200 && !r.j.deactivated && !(await call('GET', '/api/state', null, owner)).j.chairs.some(c => c.id === chair.id));
  const barber = (await call('POST', '/api/staff', { name: 'Kev', branchId: br.id, chairId: st.chairs.find(c => c.branchId === br.id).id, allowance: 0 }, owner)).j;
  ok('a new barber gets the branch commission when none is given', barber.pct === (br.defaultPct ?? 40), barber.pct);
  const v = (await call('POST', '/api/svc/walkin', { name: 'Juan', items: [{ itemId: st.items.find(i => i.name === 'Amigo').id, qty: 1 }], barberId: barber.id }, desk)).j;
  await call('POST', `/api/svc/${v.id}/finish`, { method: 'Cash', barberId: barber.id }, desk);
  r = await call('DELETE', '/api/staff/' + barber.id, null, owner);
  ok('a barber with past visits is switched off, not deleted, so history stays', r.s === 200 && r.j.deactivated === true && (await call('GET', '/api/state', null, owner)).j.staff.find(s => s.id === barber.id)?.active === 0, r);
  r = await call('POST', '/api/items', { name: 'Hot towel', type: 'service', price: -5, mins: 10 }, owner); ok('a negative price is refused', r.s === 400);
  r = await call('POST', '/api/items', { name: 'Hot towel', type: 'service', price: 50, mins: 10 }, owner);
  ok('a new service can be booked online by default; a product cannot', r.s === 201 && r.j.bookable === 1 && (await call('POST', '/api/items', { name: 'Wax', type: 'product', price: 300 }, owner)).j.bookable === 0);
  ok('a name is required', (await call('POST', '/api/discounts', { name: '  ', kind: 'amount', value: 10 }, owner)).s === 400);

  // ---------- users ----------
  r = await call('POST', '/api/users', { name: 'Admin Ana', username: 'ana', password: 'adminpass1', role: 'admin' }, owner);
  ok('a login is created without its password or PIN in the answer', r.s === 201 && !('passHash' in r.j) && !('pinKey' in r.j), r.j);
  const audit = JSON.stringify((await call('GET', '/api/audit', null, owner)).j); ok('the password is never written in the activity log', !audit.includes('adminpass1'));
  const ana = (await call('POST', '/api/login', { username: 'ana', password: 'adminpass1' })).j.token, anaId = r.j.id;
  ok('nobody can delete their own login', (await call('DELETE', '/api/users/' + anaId, null, ana)).s === 409);

  // ---------- who may do what ----------
  r = await call('POST', '/api/customers', { name: 'Walk Up', phone: '0917 555 1234' }, desk); ok('the front desk may add a customer', r.s === 201, r);
  ok('but not a barber or a service', (await call('POST', '/api/staff', { name: 'X', branchId: br.id }, desk)).s === 403 && (await call('POST', '/api/items', { name: 'X', price: 1 }, desk)).s === 403);
  ok('an unknown kind of record is "not found"', (await call('GET', '/api/spaceships', null, owner)).s === 404);
  r = await call('PATCH', '/api/chairs', null, owner); ok('an unsupported method is refused with 405', r.s === 405, r.s);
} catch (e) { fail(e); }
await S.stop();
done();
